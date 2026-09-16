const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');

const containersRouter = require('./routes/containers');
const metricsRouter = require('./routes/metrics');
const databasesRouter = require('./routes/databases');
const filesRouter = require('./routes/files');
const backupsRouter = require('./routes/backups');
const serverManagerRouter = require('./routes/serverManager');
const playerAnalyticsRouter = require('./routes/playerAnalytics');
const maintenanceRouter = require('./routes/maintenance');
const usersRouter = require('./routes/users');
const supportRouter = require('./routes/supportRouter');
const moderationRouter = require('./routes/moderation');
const { router: railwayRouter } = require('./routes/railway');
const { router: minecraftRouter, initWebSocket } = require('./routes/minecraft');
const { initLogWatcher } = require('./services/logWatcherService');
const { initTrainMonitor } = require('./services/trainMonitorService');
const { initBackupScheduler } = require('./services/backupScheduleService');
const playerAnalyticsService = require('./services/playerAnalyticsService');

const { requireStaffAuth } = require('./middleware/authMiddleware');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Initialize WebSocket Bridge on the shared HTTP server
initWebSocket(server);

// Initialize Fleet Container Log Streamer for instant Discord chat & events
initLogWatcher();

// Initialize Autonomous Create Train Monitor for 24/7 railway dispatch
initTrainMonitor();

// Initialize Automated Backup Scheduler for MinIO S3 archiving & Discord alerts
initBackupScheduler();

// Initialize Native Player Analytics Engine (MariaDB session tracking & Plan history migration)
playerAnalyticsService.init();

// Health check (public for docker health checks & uptime monitors)
app.get('/api/health', async (_req, res) => {
  const Docker = require('dockerode');
  const docker = new Docker({ socketPath: process.env.DOCKER_HOST?.replace('unix://', '') || '/var/run/docker.sock' });
  try {
    const info = await docker.info();
    const containers = await docker.listContainers({ all: true });
    const running = containers.filter(c => c.State === 'running').length;
    res.json({
      containers: { total: containers.length, running, stopped: containers.length - running },
      uptime: `${Math.floor(info.SystemTime ? 0 : 0)}s`,
      cpuPercent: 0,
      memUsedGb: (info.MemTotal - (info.MemTotal * 0.3)) / 1e9,
      memTotalGb: info.MemTotal / 1e9,
    });
  } catch (err) {
    res.status(500).json({ error: 'Docker socket unavailable', details: String(err) });
  }
});

// Central SSO Authenticated User Passthrough for Admin UI
app.get('/api/auth/me', requireStaffAuth, (req, res) => {
  res.json({ authenticated: true, user: req.user });
});

// Apply Central Network-Wide Staff RBAC Guard to all management APIs
app.use('/api/containers', requireStaffAuth, containersRouter);
app.use('/api/metrics', requireStaffAuth, metricsRouter);
app.use('/api/databases', requireStaffAuth, databasesRouter);
app.use('/api/files', requireStaffAuth, filesRouter);
app.use('/api/backups', requireStaffAuth, backupsRouter);
app.use('/api/server-manager', requireStaffAuth, serverManagerRouter);
app.use('/api/minecraft', requireStaffAuth, minecraftRouter);
app.use('/api/player-stats', requireStaffAuth, playerAnalyticsRouter);
app.use('/api/maintenance', requireStaffAuth, maintenanceRouter);
app.use('/api/users', requireStaffAuth, usersRouter);
app.use('/api/support', requireStaffAuth, supportRouter);
app.use('/api/moderation', requireStaffAuth, moderationRouter);
app.use('/api/railway', requireStaffAuth, railwayRouter);

// Serve built React frontend in production (guarded by Central SSO)
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.get('*', requireStaffAuth, (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`PETABLOCKS Admin Panel & Telemetry Bridge running on port ${PORT}`);
  try {
    const maintenanceRunner = require('./services/maintenanceRunner');
    maintenanceRunner.start();
  } catch (err) {
    console.error('[MAINTENANCE-RUNNER] Failed to initialize runner:', err.message);
  }

  try {
    const scheduledRestartService = require('./services/scheduledRestartService');
    scheduledRestartService.start();
  } catch (err) {
    console.error('[RESTART-ENGINE] Failed to initialize scheduled restart service:', err.message);
  }

  try {
    const autoBroadcastService = require('./services/autoBroadcastService');
    autoBroadcastService.startDaemon();
  } catch (err) {
    console.error('[AUTO-BROADCAST] Failed to initialize auto broadcast service:', err.message);
  }
});

