const { Router } = require('express');
const Docker = require('dockerode');

const router = Router();
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

const metricHistory = [];
const MAX_POINTS = 30;

async function collectMetrics() {
  try {
    const containers = await docker.listContainers({ all: false });
    let totalCpu = 0;
    let totalMem = 0;

    await Promise.all(
      containers.map(async (c) => {
        try {
          const stats = await docker.getContainer(c.Id).stats({ stream: false });
          const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
          const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
          totalCpu += systemDelta > 0 ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0;
          totalMem += stats.memory_stats.usage / 1024 / 1024 / 1024;
        } catch (_) {}
      })
    );

    const now = new Date();
    const label = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`;
    metricHistory.push({ time: label, cpu: parseFloat(totalCpu.toFixed(2)), mem: parseFloat(totalMem.toFixed(2)) });
    if (metricHistory.length > MAX_POINTS) metricHistory.shift();
  } catch (_) {}
}

setInterval(collectMetrics, 5000);
collectMetrics();

// GET /api/metrics
router.get('/', (_req, res) => {
  res.json(metricHistory);
});

module.exports = router;
