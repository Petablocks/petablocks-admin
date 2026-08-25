const { Router } = require('express');
const Docker = require('dockerode');

const router = Router();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

// GET /api/containers — list all containers with live resource usage
router.get('/', async (_req, res) => {
  try {
    const containers = await docker.listContainers({ all: true });
    const detailed = await Promise.all(
      containers.map(async (c) => {
        const container = docker.getContainer(c.Id);
        let cpuPercent = 0;
        let memMb = 0;
        if (c.State === 'running') {
          try {
            const stats = await container.stats({ stream: false });
            const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
            const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
            cpuPercent = systemDelta > 0 ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0;
            memMb = stats.memory_stats.usage / 1024 / 1024;
          } catch (_) {
            // stats unavailable
          }
        }
        return {
          id: c.Id,
          name: c.Names[0],
          image: c.Image,
          status: c.Status,
          state: c.State,
          cpuPercent,
          memMb,
        };
      })
    );
    res.json(detailed);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/containers/:id/start
router.post('/:id/start', async (req, res) => {
  try {
    const c = docker.getContainer(req.params.id);
    await c.start();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/containers/:id/stop
router.post('/:id/stop', async (req, res) => {
  try {
    const c = docker.getContainer(req.params.id);
    await c.stop();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/containers/:id/restart
router.post('/:id/restart', async (req, res) => {
  try {
    const c = docker.getContainer(req.params.id);
    await c.restart();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

module.exports = router;
