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
const { router: minecraftRouter, initWebSocket } = require('./routes/minecraft');
const { initLogWatcher } = require('./services/logWatcherService');
const { initTrainMonitor } = require('./services/trainMonitorService');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize WebSocket Bridge on the shared HTTP server
initWebSocket(server);

// Initialize Fleet Container Log Streamer for instant Discord chat & events
initLogWatcher();

// Initialize Autonomous Create Train Monitor for 24/7 railway dispatch
initTrainMonitor();

// API routes
app.use('/api/containers', containersRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/databases', databasesRouter);
app.use('/api/files', filesRouter);
app.use('/api/backups', backupsRouter);
app.use('/api/server-manager', serverManagerRouter);
app.use('/api/minecraft', minecraftRouter);

// Health check
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

// Serve built React frontend in production
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

server.listen(PORT, () => {
  console.log(`PETABLOCKS Admin Panel & Telemetry Bridge running on port ${PORT}`);
});

