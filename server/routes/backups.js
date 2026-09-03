/**
 * PETABLOCKS Admin — World & Full Server Backup Route
 *
 * Architecture:
 *   - MinIO S3 is the direct source of truth for stored archives.
 *   - Active/running backups are tracked in-memory with real-time byte counters.
 *   - Pure JavaScript SSH2 client streams tar stdout directly into MinIO multipart upload.
 *   - Zero external binary dependencies (no openssh-client or alpine ssh required).
 *   - Zero database crash risk (DB is purely optional metadata logging, never blocks).
 */

const express = require('express');
const router = express.Router();
const {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Upload } = require('@aws-sdk/lib-storage');
const { Client: SshClient } = require('ssh2');
const { PassThrough } = require('stream');

const BACKUP_BUCKET = 'world-backups';

// Embedded default ed25519 key for PETABLOCKS-MCS access, overrideable via MC_SSH_PRIVATE_KEY
const DEFAULT_SSH_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACCK5B91oPhc74Q3AdMwmLpLG6hXVfEeNuQ5JZvyz3ndVgAAAJgVjzhhFY84
YQAAAAtzc2gtZWQyNTUxOQAAACCK5B91oPhc74Q3AdMwmLpLG6hXVfEeNuQ5JZvyz3ndVg
AAAECp+nVXQqH10GUgYHqZx6pBarI7yiqEv2H+pCrx0Zu8xYrkH3Wg+FzvhDcB0zCYuksb
qFdV8R425Dklm/LPed1WAAAAFXBldGFibG9ja3MtbWNzLWFjY2Vzcw==
-----END OPENSSH PRIVATE KEY-----`;

// Directories excluded from full-server backups (re-downloadable or non-essential)
const FULL_BACKUP_EXCLUDES = [
  '--exclude=libraries',
  '--exclude=logs',
  '--exclude=crash-reports',
  '--exclude=debug',
  '--exclude=bluemap',
];

// ── S3 / MinIO Client ──────────────────────────────────────────────
function getS3Client() {
  return new S3Client({
    endpoint: process.env.MINIO_ENDPOINT || 'http://minio:9000',
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY || '',
      secretAccessKey: process.env.MINIO_SECRET_KEY || '',
    },
    forcePathStyle: true,
  });
}

// Ensure the backup bucket exists in MinIO
async function ensureBucket() {
  const s3 = getS3Client();
  try {
    await s3.send(new HeadBucketCommand({ Bucket: BACKUP_BUCKET }));
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      console.log(`[BACKUPS] Creating bucket '${BACKUP_BUCKET}' in MinIO...`);
      try {
        await s3.send(new CreateBucketCommand({ Bucket: BACKUP_BUCKET }));
        console.log(`[BACKUPS] Bucket '${BACKUP_BUCKET}' created successfully.`);
      } catch (createErr) {
        console.warn(`[BACKUPS] Could not create bucket '${BACKUP_BUCKET}':`, createErr.message);
      }
    }
  }
}
ensureBucket();

// ── Server SSH & Path Configuration ────────────────────────────────
const SERVER_CONFIG = {
  'patreon-creative': {
    name: 'PETABLOCKS Patreon Creative',
    sshHost: process.env.MC_PATREON_SSH_HOST || '10.20.110.120',
    sshPort: parseInt(process.env.MC_SSH_PORT || '22', 10),
    sshUser: process.env.MC_SSH_USER || 'root',
    serverDataPath: '/home/user/data/servers/patreon_create_server_a91d1a56-6130-4daa-88c9-3f7a1082dcb4',
    worldDirs: ['world_Creative'],
    worldName: 'world_Creative',
  },
  'create-2': {
    name: 'Just Create SMP 2',
    sshHost: process.env.MC_SSH_HOST || '10.20.110.115',
    sshPort: parseInt(process.env.MC_SSH_PORT || '22', 10),
    sshUser: process.env.MC_SSH_USER || 'root',
    serverDataPath: '/home/user/data/servers/petablocks_create_2_451a2727-49f0-4629-86fe-b22e93ef67e5',
    worldDirs: ['world_PBC2'],
    worldName: 'world_PBC2',
  },
  'fabric-main': {
    name: 'PETABLOCKS Official Modpack',
    sshHost: process.env.MC_FABRIC_SSH_HOST || '10.20.110.118',
    sshPort: parseInt(process.env.MC_SSH_PORT || '22', 10),
    sshUser: process.env.MC_SSH_USER || 'root',
    serverDataPath: '/home/user/data/servers/petablocks-modpack-main',
    worldDirs: ['world-PETABLOCKS-M1'],
    worldName: 'world-PETABLOCKS-M1',
  },
};

// In-Memory Active/Recent Backup Tracking Map (backupId -> record)
const inMemoryBackups = new Map();

function buildTarCommand(srvConfig, backupType) {
  if (backupType === 'full') {
    const excludes = FULL_BACKUP_EXCLUDES.join(' ');
    return `tar -czf - ${excludes} -C "$(dirname "${srvConfig.serverDataPath}")" "$(basename "${srvConfig.serverDataPath}")" 2>/dev/null`;
  } else {
    const dirs = srvConfig.worldDirs.join(' ');
    return `tar -czf - -C "${srvConfig.serverDataPath}" ${dirs} 2>/dev/null`;
  }
}

// ── GET /api/backups ───────────────────────────────────────────────
// Returns live active jobs + completed backups directly from MinIO
router.get('/', async (_req, res) => {
  const allBackups = [];

  // 1. Add any active or recently tracked in-memory backups
  for (const record of inMemoryBackups.values()) {
    allBackups.push({ ...record });
  }

  // 2. Fetch completed backups stored in MinIO
  try {
    const s3 = getS3Client();
    const listCmd = new ListObjectsV2Command({ Bucket: BACKUP_BUCKET });
    const s3Data = await s3.send(listCmd);

    if (s3Data.Contents) {
      for (const item of s3Data.Contents) {
        // Expected key pattern: {serverId}/{backupType}/{filename}
        const parts = item.Key.split('/');
        const serverId = parts[0] || 'unknown';
        const backupType = parts[1] === 'full' ? 'full' : 'world';
        const srvConfig = SERVER_CONFIG[serverId] || { name: serverId, worldName: 'world' };

        // Avoid duplicate if it's already in active inMemoryBackups
        const alreadyListed = allBackups.some(b => b.minio_key === item.Key);
        if (!alreadyListed) {
          const isZeroByte = !item.Size || item.Size === 0;
          allBackups.push({
            id: item.Key, // Unique key as ID for S3-sourced backups
            server_id: serverId,
            server_name: srvConfig.name,
            world_name: srvConfig.worldName,
            backup_type: backupType,
            size_bytes: item.Size || 0,
            minio_key: item.Key,
            status: isZeroByte ? 'failed' : 'completed',
            error_message: isZeroByte ? 'Empty archive (0 bytes) - stream interrupted' : null,
            started_at: item.LastModified?.toISOString() || new Date().toISOString(),
            completed_at: item.LastModified?.toISOString() || null,
            created_by: 'system',
          });
        }
      }
    }
  } catch (err) {
    console.warn('[BACKUPS] Error listing backups from MinIO:', err.message);
  }

  // Sort: running first, then newest first
  allBackups.sort((a, b) => {
    if (a.status === 'running' && b.status !== 'running') return -1;
    if (b.status === 'running' && a.status !== 'running') return 1;
    return new Date(b.started_at).getTime() - new Date(a.started_at).getTime();
  });

  res.json({ backups: allBackups });
});

// ── POST /api/backups/trigger ──────────────────────────────────────
router.post('/trigger', async (req, res) => {
  const { serverId, backupType = 'world', createdBy = 'admin' } = req.body;

  if (!serverId) {
    return res.status(400).json({ error: 'serverId is required' });
  }
  if (!['world', 'full'].includes(backupType)) {
    return res.status(400).json({ error: "backupType must be 'world' or 'full'" });
  }

  const srvConfig = SERVER_CONFIG[serverId];
  if (!srvConfig) {
    return res.status(400).json({
      error: `Unknown serverId: ${serverId}. Configured servers: ${Object.keys(SERVER_CONFIG).join(', ')}`,
    });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archiveName = `${serverId}_${backupType}_${timestamp}.tar.gz`;
  const minioKey = `${serverId}/${backupType}/${archiveName}`;
  const backupId = `bk_${Date.now()}`;

  // Record active job in memory immediately
  const backupRecord = {
    id: backupId,
    server_id: serverId,
    server_name: srvConfig.name,
    world_name: srvConfig.worldName,
    backup_type: backupType,
    size_bytes: 0,
    minio_key: minioKey,
    status: 'running',
    error_message: null,
    started_at: new Date().toISOString(),
    completed_at: null,
    created_by: createdBy,
  };
  inMemoryBackups.set(backupId, backupRecord);

  // Send immediate HTTP response so the client knows it started
  res.json({
    status: 'started',
    backupId,
    serverId,
    backupType,
    minioKey,
    archiveName,
  });

  // ── Background SSH2 Streaming Pipeline ────────────────────────────
  (async () => {
    const conn = new SshClient();
    const passThrough = new PassThrough();
    let totalBytes = 0;

    passThrough.on('data', (chunk) => {
      totalBytes += chunk.length;
      backupRecord.size_bytes = totalBytes;
    });

    try {
      await ensureBucket();
      const s3 = getS3Client();

      const privateKey = process.env.MC_SSH_PRIVATE_KEY || DEFAULT_SSH_KEY;
      const tarCmd = buildTarCommand(srvConfig, backupType);

      console.log(`[BACKUP][${serverId}] Starting ${backupType} backup via SSH2 -> s3://${BACKUP_BUCKET}/${minioKey}`);

      // 1. Initialize S3 Upload concurrently so it starts draining passThrough immediately
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
            'backup-timestamp': timestamp,
          },
        },
        queueSize: 4,
        partSize: 1024 * 1024 * 10, // 10MB chunks
      });

      // 2. Connect SSH2 and pipe remote tar stream directly into passThrough
      const sshPromise = new Promise((resolve, reject) => {
        conn.on('ready', () => {
          conn.exec(tarCmd, (err, stream) => {
            if (err) {
              conn.end();
              passThrough.destroy(err);
              return reject(err);
            }

            stream.pipe(passThrough);

            stream.stderr.on('data', (data) => {
              console.warn(`[BACKUP][${serverId}] remote stderr:`, data.toString().trim());
            });

            stream.on('close', (code) => {
              conn.end();
              if (code !== 0 && code !== null) {
                console.warn(`[BACKUP][${serverId}] tar stream exited with code ${code}`);
              }
              resolve();
            });

            stream.on('error', (streamErr) => {
              passThrough.destroy(streamErr);
              reject(streamErr);
            });
          });
        });

        conn.on('error', (err) => {
          passThrough.destroy(err);
          reject(new Error(`SSH2 connection error to ${srvConfig.sshHost}: ${err.message}`));
        });

        conn.connect({
          host: srvConfig.sshHost,
          port: srvConfig.sshPort,
          username: srvConfig.sshUser,
          privateKey: privateKey,
          readyTimeout: 15000,
        });
      });

      // 3. Await both upload completion and SSH tar stream in parallel
      await Promise.all([upload.done(), sshPromise]);

      backupRecord.status = 'completed';
      backupRecord.completed_at = new Date().toISOString();
      backupRecord.size_bytes = totalBytes;

      console.log(
        `[BACKUP][${serverId}] Completed ${backupType} backup -> ${minioKey} (${(totalBytes / 1024 / 1024).toFixed(1)} MB)`
      );
    } catch (err) {
      console.error(`[BACKUP][${serverId}] Failed:`, err.message);
      backupRecord.status = 'failed';
      backupRecord.error_message = err.message;
      backupRecord.completed_at = new Date().toISOString();
    }
  })();
});

// ── GET /api/backups/:id ───────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const id = req.params.id;

  // Check in-memory active tracking first
  if (inMemoryBackups.has(id)) {
    return res.json(inMemoryBackups.get(id));
  }

  // Check S3
  try {
    const s3 = getS3Client();
    const decodedKey = decodeURIComponent(id);
    const cmd = new GetObjectCommand({ Bucket: BACKUP_BUCKET, Key: decodedKey });
    const obj = await s3.send(cmd);
    res.json({
      id: decodedKey,
      minio_key: decodedKey,
      status: 'completed',
      size_bytes: obj.ContentLength,
      started_at: obj.LastModified?.toISOString(),
    });
  } catch (err) {
    res.status(404).json({ error: 'Backup not found', details: err.message });
  }
});

// ── GET /api/backups/:id/download ─────────────────────────────────
// Streams the backup archive directly from MinIO to client browser
router.get('/:id/download', async (req, res) => {
  const id = decodeURIComponent(req.params.id);

  let minioKey = id;
  if (inMemoryBackups.has(id)) {
    const record = inMemoryBackups.get(id);
    if (record.status !== 'completed') {
      return res.status(400).json({ error: 'Backup is still running or has failed' });
    }
    minioKey = record.minio_key;
  }

  try {
    const s3 = getS3Client();
    const command = new GetObjectCommand({ Bucket: BACKUP_BUCKET, Key: minioKey });
    const s3Response = await s3.send(command);

    const filename = minioKey.split('/').pop() || 'backup.tar.gz';

    res.setHeader('Content-Type', s3Response.ContentType || 'application/gzip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    if (s3Response.ContentLength) {
      res.setHeader('Content-Length', s3Response.ContentLength);
    }

    s3Response.Body.pipe(res);
  } catch (err) {
    console.error('[BACKUPS] Direct stream download error:', err.message);
    res.status(500).json({ error: 'Failed to stream backup file', details: err.message });
  }
});

// ── GET /api/backups/:id/download-url ─────────────────────────────
router.get('/:id/download-url', async (req, res) => {
  const id = decodeURIComponent(req.params.id);

  let minioKey = id;
  if (inMemoryBackups.has(id)) {
    const record = inMemoryBackups.get(id);
    if (record.status !== 'completed') {
      return res.status(400).json({ error: 'Backup is still running or has failed' });
    }
    minioKey = record.minio_key;
  }

  const filename = minioKey.split('/').pop() || 'backup.tar.gz';
  res.json({
    url: `/api/backups/${encodeURIComponent(minioKey)}/download`,
    expiresIn: 86400,
    filename,
  });
});

// ── DELETE /api/backups/:id ────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const id = decodeURIComponent(req.params.id);

  let minioKey = id;
  if (inMemoryBackups.has(id)) {
    minioKey = inMemoryBackups.get(id).minio_key;
    inMemoryBackups.delete(id);
  }

  try {
    const s3 = getS3Client();
    await s3.send(new DeleteObjectCommand({ Bucket: BACKUP_BUCKET, Key: minioKey }));
    res.json({ status: 'deleted', key: minioKey });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete backup from MinIO', details: err.message });
  }
});

module.exports = router;
