/**
 * PETABLOCKS Admin — World Backup Route
 *
 * Handles on-demand world backups via SSH → tar → MinIO S3 pipeline.
 * Per-server prefix folders inside a single `world-backups` bucket.
 *
 * Environment vars:
 *   MINIO_ENDPOINT       e.g. http://minio:9000
 *   MINIO_ACCESS_KEY
 *   MINIO_SECRET_KEY
 *   MC_SSH_HOST          e.g. 10.20.110.127
 *   MC_SSH_USER          e.g. mdrcloud
 *   MC_SSH_KEY_PATH      e.g. /root/.ssh/id_rsa
 *   MC_WORLD_BASE_PATH   e.g. /opt/petablocks/servers
 *   DB_HOST / DB_USER / DB_PASSWORD / DB_NAME (MariaDB for backup records)
 */

const express = require('express');
const router = express.Router();
const { exec, spawn } = require('child_process');
const { S3Client, ListObjectsV2Command, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Upload } = require('@aws-sdk/lib-storage');
const mysql = require('mysql2/promise');
const { PassThrough } = require('stream');

const BACKUP_BUCKET = 'world-backups';

// ── S3 / MinIO Client ──────────────────────────────────────────────
function getS3Client() {
  return new S3Client({
    endpoint: process.env.MINIO_ENDPOINT || 'http://minio:9000',
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY || 'petablocks',
      secretAccessKey: process.env.MINIO_SECRET_KEY || 'petablocks_secret',
    },
    forcePathStyle: true,
  });
}

// ── MariaDB helper ─────────────────────────────────────────────────
async function getDb() {
  return mysql.createConnection({
    host: process.env.DB_MC_HOST || process.env.DB_HOST || '10.20.110.117',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'petablocks_admin',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'petablocks_admin',
  });
}

// ── Ensure backup table exists ─────────────────────────────────────
async function ensureTable() {
  let db;
  try {
    db = await getDb();
    await db.execute(`
      CREATE TABLE IF NOT EXISTS world_backups (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        server_id    VARCHAR(64)  NOT NULL,
        server_name  VARCHAR(128) NOT NULL,
        world_name   VARCHAR(128) NOT NULL DEFAULT 'world',
        size_bytes   BIGINT       DEFAULT 0,
        minio_key    VARCHAR(512) NOT NULL,
        status       ENUM('running','completed','failed') DEFAULT 'running',
        error_message TEXT,
        started_at   DATETIME     NOT NULL,
        completed_at DATETIME,
        created_by   VARCHAR(64)  DEFAULT 'admin'
      )
    `);
  } catch (e) {
    console.warn('[BACKUPS] Could not ensure table:', e.message);
  } finally {
    if (db) await db.end();
  }
}
ensureTable();

// Server configuration for SSH-based backups
const SERVER_SSH_CONFIG = {
  'fabric-main': {
    name: 'PETABLOCKS Official Modpack',
    worldPath: '/opt/petablocks/servers/fabric-main/world',
    worldName: 'world',
  },
  'patreon-creative': {
    name: 'PETABLOCKS Patreon Creative',
    worldPath: '/opt/petablocks/servers/patreon-creative/world',
    worldName: 'world',
  },
  'create-2': {
    name: 'Just Create SMP 2',
    worldPath: '/opt/petablocks/servers/create-2/world',
    worldName: 'world',
  },
};

// ── GET /api/backups ───────────────────────────────────────────────
// List all backup records from MariaDB
router.get('/', async (req, res) => {
  let db;
  try {
    db = await getDb();
    const [rows] = await db.execute(
      'SELECT * FROM world_backups ORDER BY started_at DESC LIMIT 100'
    );
    res.json({ backups: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch backup records', details: err.message });
  } finally {
    if (db) await db.end();
  }
});

// ── POST /api/backups/trigger ──────────────────────────────────────
// Trigger an on-demand backup for a given server
router.post('/trigger', async (req, res) => {
  const { serverId, createdBy = 'admin' } = req.body;

  if (!serverId) {
    return res.status(400).json({ error: 'serverId is required' });
  }

  const srvConfig = SERVER_SSH_CONFIG[serverId];
  if (!srvConfig) {
    return res.status(400).json({ error: `Unknown serverId: ${serverId}. Known: ${Object.keys(SERVER_SSH_CONFIG).join(', ')}` });
  }

  const sshHost = process.env.MC_SSH_HOST || '10.20.110.127';
  const sshUser = process.env.MC_SSH_USER || 'mdrcloud';
  const sshKey = process.env.MC_SSH_KEY_PATH || '/root/.ssh/id_rsa';

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archiveName = `${serverId}_${timestamp}.tar.gz`;
  const minioKey = `${serverId}/${archiveName}`;

  let db;
  let backupId;

  // Insert "running" record immediately so UI can show progress
  try {
    db = await getDb();
    const [result] = await db.execute(
      `INSERT INTO world_backups (server_id, server_name, world_name, minio_key, status, started_at, created_by)
       VALUES (?, ?, ?, ?, 'running', NOW(), ?)`,
      [serverId, srvConfig.name, srvConfig.worldName, minioKey, createdBy]
    );
    backupId = result.insertId;
    await db.end();
  } catch (err) {
    if (db) await db.end();
    return res.status(500).json({ error: 'Failed to create backup record', details: err.message });
  }

  // Respond immediately — backup runs in background
  res.json({ status: 'started', backupId, serverId, minioKey, archiveName });

  // ── Run backup pipeline in background ─────────────────────────────
  ;(async () => {
    let uploadedBytes = 0;
    let finalDb;
    try {
      const s3 = getS3Client();

      // SSH → tar → stream → MinIO upload
      const passThrough = new PassThrough();

      const sshArgs = [
        '-i', sshKey,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ConnectTimeout=15',
        `${sshUser}@${sshHost}`,
        // RCON save-all is handled via the admin RCON endpoint before this
        // Then tar the world directory to stdout
        `tar -czf - -C "$(dirname ${srvConfig.worldPath})" "$(basename ${srvConfig.worldPath})" 2>/dev/null`,
      ];

      const sshProc = spawn('ssh', sshArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

      sshProc.stdout.pipe(passThrough);
      sshProc.stderr.on('data', (chunk) => {
        console.warn(`[BACKUP][${serverId}] SSH stderr:`, chunk.toString().trim());
      });

      // Count bytes as they stream
      passThrough.on('data', (chunk) => { uploadedBytes += chunk.length; });

      const upload = new Upload({
        client: s3,
        params: {
          Bucket: BACKUP_BUCKET,
          Key: minioKey,
          Body: passThrough,
          ContentType: 'application/gzip',
          Metadata: {
            'server-id': serverId,
            'server-name': srvConfig.name,
            'world-name': srvConfig.worldName,
            'backup-timestamp': timestamp,
          },
        },
        queueSize: 4,
        partSize: 1024 * 1024 * 10, // 10 MB parts
      });

      await upload.done();

      // Wait for SSH process to exit cleanly
      await new Promise((resolve, reject) => {
        sshProc.on('close', (code) => {
          if (code !== 0) reject(new Error(`SSH process exited with code ${code}`));
          else resolve();
        });
      });

      console.log(`[BACKUP][${serverId}] Completed → s3://${BACKUP_BUCKET}/${minioKey} (${(uploadedBytes / 1024 / 1024).toFixed(2)} MB)`);

      finalDb = await getDb();
      await finalDb.execute(
        `UPDATE world_backups SET status='completed', size_bytes=?, completed_at=NOW() WHERE id=?`,
        [uploadedBytes, backupId]
      );
    } catch (err) {
      console.error(`[BACKUP][${serverId}] Failed:`, err.message);
      try {
        finalDb = finalDb || await getDb();
        await finalDb.execute(
          `UPDATE world_backups SET status='failed', error_message=?, completed_at=NOW() WHERE id=?`,
          [err.message.slice(0, 500), backupId]
        );
      } catch (dbErr) {
        console.error('[BACKUP] Failed to update error record:', dbErr.message);
      }
    } finally {
      if (finalDb) await finalDb.end();
    }
  })();
});

// ── GET /api/backups/:id ───────────────────────────────────────────
// Get a single backup record by DB ID (for polling progress)
router.get('/:id', async (req, res) => {
  let db;
  try {
    db = await getDb();
    const [rows] = await db.execute('SELECT * FROM world_backups WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Backup not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (db) await db.end();
  }
});

// ── GET /api/backups/:id/download-url ─────────────────────────────
// Generate a 24-hour presigned MinIO download URL
router.get('/:id/download-url', async (req, res) => {
  let db;
  try {
    db = await getDb();
    const [rows] = await db.execute('SELECT * FROM world_backups WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Backup not found' });

    const backup = rows[0];
    if (backup.status !== 'completed') {
      return res.status(400).json({ error: 'Backup is not completed yet' });
    }

    const s3 = getS3Client();
    const command = new GetObjectCommand({ Bucket: BACKUP_BUCKET, Key: backup.minio_key });
    const url = await getSignedUrl(s3, command, { expiresIn: 86400 }); // 24 hours

    res.json({ url, expiresIn: 86400, filename: backup.minio_key.split('/').pop() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (db) await db.end();
  }
});

// ── DELETE /api/backups/:id ────────────────────────────────────────
// Delete a backup from MinIO and remove the DB record
router.delete('/:id', async (req, res) => {
  let db;
  try {
    db = await getDb();
    const [rows] = await db.execute('SELECT * FROM world_backups WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Backup not found' });

    const backup = rows[0];
    const s3 = getS3Client();

    // Delete from MinIO (best effort — don't fail if object missing)
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BACKUP_BUCKET, Key: backup.minio_key }));
    } catch (s3Err) {
      console.warn('[BACKUP] MinIO delete failed (object may already be gone):', s3Err.message);
    }

    await db.execute('DELETE FROM world_backups WHERE id = ?', [req.params.id]);
    res.json({ status: 'deleted', id: req.params.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (db) await db.end();
  }
});

module.exports = router;
