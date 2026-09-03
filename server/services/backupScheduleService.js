/**
 * PETABLOCKS Automated Fleet Backup Scheduler & Retention Engine
 *
 * Runs scheduled snapshots for Minecraft game servers:
 * - Hourly world snapshots (world directories only, light & fast)
 * - Daily full server snapshots (3:00 AM UTC, full server without cache/logs)
 * - Directly streams to central MinIO S3 store (`world-backups` bucket)
 * - Automatic FIFO Retention Pruning:
 *     - Keeps max 7 World Snapshots per server
 *     - Keeps max 2 Full Server Archives per server
 * - Proactive Storage & Low-Disk Warning Alerts to Discord Console (#console-alerts)
 */

const http = require('http');
const discordService = require('./discordWebhookService');
const { S3Client, ListObjectsV2Command, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const BACKUP_BUCKET = 'world-backups';

const RETENTION_LIMITS = {
  world: 7, // Keep last 7 world snapshots (~3-5GB each)
  full: 2,  // Keep last 2 full server archives (~25GB each)
};

const BACKUP_TARGETS = [
  { id: 'create-2', name: 'Just Create SMP 2' },
  { id: 'patreon-creative', name: 'PETABLOCKS Patreon Creative' },
  { id: 'fabric-main', name: 'PETABLOCKS Official Modpack' },
];

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

function triggerBackupInternal(serverId, backupType = 'world') {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      serverId,
      backupType,
      createdBy: 'automated-scheduler',
    });

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: process.env.PORT || 3000,
        path: '/api/backups/trigger',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: 10000,
      },
      (res) => {
        let respData = '';
        res.on('data', (c) => (respData += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(respData);
            resolve(parsed);
          } catch {
            resolve({ status: 'error', raw: respData });
          }
        });
      }
    );

    req.on('error', (err) => resolve({ status: 'error', message: err.message }));
    req.write(postData);
    req.end();
  });
}

// Check job completion by polling /api/backups/:id
function waitForBackupCompletion(backupId, maxWaitMs = 1800000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      if (Date.now() - startTime > maxWaitMs) {
        clearInterval(interval);
        return resolve({ status: 'timed_out' });
      }

      const req = http.get(
        {
          hostname: '127.0.0.1',
          port: process.env.PORT || 3000,
          path: `/api/backups/${encodeURIComponent(backupId)}`,
          timeout: 5000,
        },
        (res) => {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => {
            try {
              const job = JSON.parse(data);
              if (job.status === 'completed' || job.status === 'failed') {
                clearInterval(interval);
                resolve(job);
              }
            } catch {}
          });
        }
      );
      req.on('error', () => {});
    }, 5000);
  });
}

/**
 * Prune old archives per server and backupType to enforce retention limits
 */
async function pruneOldBackups(serverId, backupType) {
  try {
    const s3 = getS3Client();
    const prefix = `${serverId}/${backupType}/`;
    const listCmd = new ListObjectsV2Command({
      Bucket: BACKUP_BUCKET,
      Prefix: prefix,
    });
    const data = await s3.send(listCmd);
    if (!data.Contents || data.Contents.length === 0) return;

    // Sort oldest first
    const items = data.Contents.sort(
      (a, b) => new Date(a.LastModified).getTime() - new Date(b.LastModified).getTime()
    );

    const limit = RETENTION_LIMITS[backupType] || 5;
    if (items.length > limit) {
      const itemsToDelete = items.slice(0, items.length - limit);
      console.log(
        `[BACKUP-RETENTION] Pruning ${itemsToDelete.length} expired '${backupType}' backup(s) for ${serverId}...`
      );

      for (const item of itemsToDelete) {
        await s3.send(new DeleteObjectCommand({ Bucket: BACKUP_BUCKET, Key: item.Key }));
        const mb = ((item.Size || 0) / 1024 / 1024).toFixed(1);
        console.log(`[BACKUP-RETENTION] Deleted ${item.Key} (${mb} MB reclaimed)`);
      }

      // Notify Discord Console of reclaimed storage
      discordService.sendConsoleAlert(serverId, {
        title: `🧹 Backup Storage Auto-Pruned`,
        description: `Automated retention policy pruned **${itemsToDelete.length}** old ${backupType} archive(s) to maintain storage capacity.`,
        color: 0x6b7280,
        fields: [
          { name: 'Server', value: serverId, inline: true },
          { name: 'Retained Cap', value: `Last ${limit} backups`, inline: true },
        ],
      });
    }
  } catch (err) {
    console.error(`[BACKUP-RETENTION] Failed to prune ${serverId} ${backupType}:`, err.message);
  }
}

/**
 * Query MinIO S3 store metrics
 */
async function getStorageMetrics() {
  try {
    const s3 = getS3Client();
    const listCmd = new ListObjectsV2Command({ Bucket: BACKUP_BUCKET });
    const data = await s3.send(listCmd);

    let totalBytes = 0;
    const serverBreakdown = {};

    if (data.Contents) {
      for (const item of data.Contents) {
        const size = item.Size || 0;
        totalBytes += size;
        const parts = item.Key.split('/');
        const srv = parts[0] || 'other';
        serverBreakdown[srv] = (serverBreakdown[srv] || 0) + size;
      }
    }

    return {
      totalBytes,
      totalMb: Math.round(totalBytes / 1024 / 1024),
      totalGb: (totalBytes / 1024 / 1024 / 1024).toFixed(2),
      itemCount: data.Contents ? data.Contents.length : 0,
      serverBreakdown,
    };
  } catch (err) {
    return {
      totalBytes: 0,
      totalMb: 0,
      totalGb: '0.00',
      itemCount: 0,
      serverBreakdown: {},
      error: err.message,
    };
  }
}

async function runScheduledBackupSequence(backupType = 'world') {
  console.log(`[BACKUP-SCHEDULER] Starting automated ${backupType} snapshot sequence for fleet...`);

  for (const target of BACKUP_TARGETS) {
    try {
      console.log(`[BACKUP-SCHEDULER] Triggering ${backupType} backup for ${target.id} (${target.name})...`);
      const started = await triggerBackupInternal(target.id, backupType);

      if (started.status === 'started' && started.backupId) {
        // Send start notification to Discord Console
        discordService.sendConsoleAlert(target.id, {
          title: `💾 Automated ${backupType === 'world' ? 'World' : 'Full'} Backup Started`,
          description: `Scheduled snapshot initiated for **${target.name}**. Streaming to MinIO S3...`,
          color: 0x3b82f6,
          fields: [
            { name: 'Backup Type', value: backupType.toUpperCase(), inline: true },
            { name: 'Target Bucket', value: '`world-backups`', inline: true },
          ],
        });

        // Await completion in background
        waitForBackupCompletion(started.backupId).then(async (result) => {
          if (result.status === 'completed') {
            const mb = (result.size_bytes / 1024 / 1024).toFixed(1);
            discordService.sendConsoleAlert(target.id, {
              title: `✅ Automated Backup Completed`,
              description: `Successfully archived **${target.name}** to MinIO S3 store.`,
              color: 0x10b981,
              fields: [
                { name: 'Archive Size', value: `\`${mb} MB\``, inline: true },
                { name: 'Storage Key', value: `\`${result.minio_key}\``, inline: true },
                { name: 'Duration', value: `${Math.round((new Date(result.completed_at) - new Date(result.started_at)) / 1000)}s`, inline: true },
              ],
            });

            // Automatically enforce retention after successful upload
            await pruneOldBackups(target.id, backupType);
          } else {
            discordService.sendConsoleAlert(target.id, {
              title: `❌ Automated Backup Failed`,
              description: `Failed to complete backup for **${target.name}**: ${result.error_message || result.status}`,
              color: 0xef4444,
            });
          }
        });
      }
    } catch (err) {
      console.error(`[BACKUP-SCHEDULER] Error processing ${target.id}:`, err.message);
    }
  }
}

function initBackupScheduler() {
  console.log('[BACKUP-SCHEDULER] Initializing automated backup schedules & retention pruner (Max 7 world / 2 full)...');

  // Check schedules every 5 minutes
  setInterval(() => {
    const hour = new Date().getUTCHours();
    const minute = new Date().getUTCMinutes();
    if (minute < 5 && (hour % 6 === 0)) {
      runScheduledBackupSequence(hour === 0 ? 'full' : 'world');
    }
  }, 300000);
}

module.exports = {
  initBackupScheduler,
  runScheduledBackupSequence,
  triggerBackupInternal,
  pruneOldBackups,
  getStorageMetrics,
};
