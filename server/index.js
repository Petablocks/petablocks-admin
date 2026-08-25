const express = require('express');
const cors = require('cors');
const path = require('path');

const containersRouter = require('./routes/containers');
const metricsRouter = require('./routes/metrics');
const databasesRouter = require('./routes/databases');
const filesRouter = require('./routes/files');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/containers', containersRouter);
app.use('/api/metrics', metricsRouter);
app.use('/api/databases', databasesRouter);
app.use('/api/files', filesRouter);

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

app.listen(PORT, () => {
  console.log(`PETABLOCKS Admin Panel running on port ${PORT}`);
});
