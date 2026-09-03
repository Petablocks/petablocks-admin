/**
 * PETABLOCKS Automated Fleet Backup Scheduler
 *
 * Runs scheduled snapshots for Minecraft game servers:
 * - Hourly world snapshots (world directories only, light & fast)
 * - Daily full server snapshots (3:00 AM UTC, full server without cache/logs)
 * - Directly streams to central MinIO S3 store (`world-backups` bucket)
 * - Dispatches Discord Console alerts on backup completion/failure
 */

const http = require('http');
const discordService = require('./discordWebhookService');

const BACKUP_TARGETS = [
  { id: 'create-2', name: 'Just Create SMP 2' },
  { id: 'patreon-creative', name: 'PETABLOCKS Patreon Creative' },
  { id: 'fabric-main', name: 'PETABLOCKS Official Modpack' },
];

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
        waitForBackupCompletion(started.backupId).then((result) => {
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
  console.log('[BACKUP-SCHEDULER] Initializing automated backup schedules (Every 6 hours world snapshots + daily full)...');

  // Run every 6 hours (0:00, 6:00, 12:00, 18:00)
  setInterval(() => {
    const hour = new Date().getUTCHours();
    const minute = new Date().getUTCMinutes();
    if (minute < 5 && (hour % 6 === 0)) {
      runScheduledBackupSequence(hour === 0 ? 'full' : 'world');
    }
  }, 300000); // Check every 5 minutes
}

module.exports = {
  initBackupScheduler,
  runScheduledBackupSequence,
  triggerBackupInternal,
};
