/**
 * PETABLOCKS Admin — World Backup Route
 *
 * Supports two backup types:
 *   - 'world'  — archives only world dimension folders (~GB, fast)
 *   - 'full'   — archives entire server data dir: mods, configs, worlds, KubeJS,
 *                ops/whitelist, etc. Excludes libraries/ logs/ crash-reports/
 *                (re-downloadable or non-essential). Ideal for server migration.
 *
 * SSH pipeline: admin host → SSH → tar stdout → MinIO S3 multipart upload.
 * Paths verified live 2026-09-02 against PETABLOCKS-MCS (10.20.110.115).
 *
 * MinIO layout:
 *   world-backups/{serverId}/world/{timestamp}.tar.gz
 *   world-backups/{serverId}/full/{timestamp}.tar.gz
 */

const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const { S3Client, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Upload } = require('@aws-sdk/lib-storage');
const mysql = require('mysql2/promise');
const { PassThrough } = require('stream');

const BACKUP_BUCKET = 'world-backups';

// Directories excluded from full-server backups (re-downloadable or non-essential)
const FULL_BACKUP_EXCLUDES = [
  '--exclude=./libraries',
  '--exclude=./logs',
  '--exclude=./crash-reports',
  '--exclude=./debug',
  '--exclude=./bluemap',       // map tiles regenerate on startup
];

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
        id            INT AUTO_INCREMENT PRIMARY KEY,
        server_id     VARCHAR(64)  NOT NULL,
        server_name   VARCHAR(128) NOT NULL,
        world_name    VARCHAR(128) NOT NULL DEFAULT 'world',
        backup_type   ENUM('world','full') NOT NULL DEFAULT 'world',
        size_bytes    BIGINT       DEFAULT 0,
        minio_key     VARCHAR(512) NOT NULL,
        status        ENUM('running','completed','failed') DEFAULT 'running',
        error_message TEXT,
        started_at    DATETIME     NOT NULL,
        completed_at  DATETIME,
        created_by    VARCHAR(64)  DEFAULT 'admin'
      )
    `);
    // Add backup_type column if this is an existing table that predates this version
    await db.execute(`
      ALTER TABLE world_backups
        ADD COLUMN IF NOT EXISTS backup_type ENUM('world','full') NOT NULL DEFAULT 'world'
        AFTER world_name
    `).catch(() => {}); // Ignore if column already exists
  } catch (e) {
    console.warn('[BACKUPS] Could not ensure table:', e.message);
  } finally {
    if (db) await db.end();
  }
}
ensureTable();

// ── Server SSH configuration ────────────────────────────────────────
// Paths verified live on 2026-09-02 via SSH to PETABLOCKS-MCS (10.20.110.115).
const SERVER_SSH_CONFIG = {
  'patreon-creative': {
    name: 'PETABLOCKS Patreon Creative',
    sshHost: process.env.MC_SSH_HOST || '10.20.110.115',
    sshUser: process.env.MC_SSH_USER || 'root',
    sshKey: process.env.MC_SSH_KEY_PATH || '/root/.ssh/id_rsa',
    serverDataPath: '/home/user/data/servers/patreon_create_server_a91d1a56-6130-4daa-88c9-3f7a1082dcb4',
    worldDirs: ['world', 'world_Creative'],  // world/ = nether+end, world_Creative = overworld
    worldName: 'world_Creative',
  },
  'create-2': {
    name: 'Just Create SMP 2',
    sshHost: process.env.MC_SSH_HOST || '10.20.110.115',
    sshUser: process.env.MC_SSH_USER || 'root',
    sshKey: process.env.MC_SSH_KEY_PATH || '/root/.ssh/id_rsa',
    serverDataPath: '/home/user/data/servers/petablocks_create_2_451a2727-49f0-4629-86fe-b22e93ef67e5',
    worldDirs: ['world', 'world_PBC2'],      // world/ = nether+end+void, world_PBC2 = overworld
    worldName: 'world_PBC2',
  },
  // fabric-main is on a separate host — paths TBC once SSH access is granted
  'fabric-main': {
    name: 'PETABLOCKS Official Modpack',
    sshHost: process.env.MC_FABRIC_SSH_HOST || '10.20.110.127',
    sshUser: process.env.MC_SSH_USER || 'root',
    sshKey: process.env.MC_SSH_KEY_PATH || '/root/.ssh/id_rsa',
    serverDataPath: process.env.MC_FABRIC_WORLD_PATH || '/opt/petablocks/servers/fabric-main',
    worldDirs: ['world'],
    worldName: 'world',
  },
};

// ── Build the remote tar command ────────────────────────────────────
function buildTarCommand(srvConfig, backupType) {
  if (backupType === 'full') {
    // Tar the entire server data directory, excluding large non-essential dirs
    const excludes = FULL_BACKUP_EXCLUDES.join(' ');
    return `tar -czf - ${excludes} -C "$(dirname ${srvConfig.serverDataPath})" "$(basename ${srvConfig.serverDataPath})" 2>/dev/null`;
  } else {
    // World-only: tar just the dimension folders
    const dirs = srvConfig.worldDirs.join(' ');
    return `tar -czf - -C "${srvConfig.serverDataPath}" ${dirs} 2>/dev/null`;
  }
}

// ── GET /api/backups ───────────────────────────────────────────────
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
router.post('/trigger', async (req, res) => {
  const { serverId, backupType = 'world', createdBy = 'admin' } = req.body;

  if (!serverId) return res.status(400).json({ error: 'serverId is required' });
  if (!['world', 'full'].includes(backupType)) {
    return res.status(400).json({ error: "backupType must be 'world' or 'full'" });
  }

  const srvConfig = SERVER_SSH_CONFIG[serverId];
  if (!srvConfig) {
    return res.status(400).json({
      error: `Unknown serverId: ${serverId}. Known: ${Object.keys(SERVER_SSH_CONFIG).join(', ')}`,
    });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archiveName = `${serverId}_${backupType}_${timestamp}.tar.gz`;
  // Organised by server → type → archive
  const minioKey = `${serverId}/${backupType}/${archiveName}`;

  let db;
  let backupId;

  try {
    db = await getDb();
    const [result] = await db.execute(
      `INSERT INTO world_backups (server_id, server_name, world_name, backup_type, minio_key, status, started_at, created_by)
       VALUES (?, ?, ?, ?, ?, 'running', NOW(), ?)`,
      [serverId, srvConfig.name, srvConfig.worldName, backupType, minioKey, createdBy]
    );
    backupId = result.insertId;
    await db.end();
  } catch (err) {
    if (db) await db.end();
    return res.status(500).json({ error: 'Failed to create backup record', details: err.message });
  }

  // Respond immediately — backup streams in background
  res.json({ status: 'started', backupId, serverId, backupType, minioKey, archiveName });

  // ── Background streaming pipeline ────────────────────────────────
  ;(async () => {
    let uploadedBytes = 0;
    let finalDb;
    try {
      const s3 = getS3Client();
      const passThrough = new PassThrough();

      const tarCmd = buildTarCommand(srvConfig, backupType);
      const sshArgs = [
        '-i', srvConfig.sshKey,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ConnectTimeout=15',
        `${srvConfig.sshUser}@${srvConfig.sshHost}`,
        tarCmd,
      ];

      console.log(`[BACKUP][${serverId}] Starting ${backupType} backup → ${minioKey}`);
      const sshProc = spawn('ssh', sshArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

      sshProc.stdout.pipe(passThrough);
      sshProc.stderr.on('data', (chunk) => {
        console.warn(`[BACKUP][${serverId}] SSH stderr:`, chunk.toString().trim());
      });

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
            'backup-type': backupType,
            'world-name': srvConfig.worldName,
            'backup-timestamp': timestamp,
          },
        },
        queueSize: 4,
        partSize: 1024 * 1024 * 10, // 10 MB parts
      });

      await upload.done();

      await new Promise((resolve, reject) => {
        sshProc.on('close', (code) => {
          if (code !== 0) reject(new Error(`SSH process exited with code ${code}`));
          else resolve();
        });
      });

      console.log(`[BACKUP][${serverId}] ✓ ${backupType} backup complete → s3://${BACKUP_BUCKET}/${minioKey} (${(uploadedBytes / 1024 / 1024).toFixed(1)} MB)`);

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
    const url = await getSignedUrl(s3, command, { expiresIn: 86400 });

    res.json({ url, expiresIn: 86400, filename: backup.minio_key.split('/').pop() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (db) await db.end();
  }
});

// ── DELETE /api/backups/:id ────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  let db;
  try {
    db = await getDb();
    const [rows] = await db.execute('SELECT * FROM world_backups WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Backup not found' });

    const backup = rows[0];
    const s3 = getS3Client();

    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BACKUP_BUCKET, Key: backup.minio_key }));
    } catch (s3Err) {
      console.warn('[BACKUP] MinIO delete (object may already be gone):', s3Err.message);
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
