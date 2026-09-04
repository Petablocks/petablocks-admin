/**
 * PETABLOCKS Server Management Platform — Backend Engine
 *
 * Full Discopanel replacement supporting multi-VM cluster management.
 * Connects directly to VM nodes (PETABLOCKS-MCS, etc.) via pure JS ssh2
 * to manage Docker containers, stream live console output, browse/edit files,
 * manage mods, and configure players.
 */

const express = require('express');
const router = express.Router();
const { Client: SshClient } = require('ssh2');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const net = require('net');
const Docker = require('dockerode');
const discordService = require('../services/discordWebhookService');

const localDocker = new Docker({ socketPath: process.env.DOCKER_HOST?.replace('unix://', '') || '/var/run/docker.sock' });

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB max upload

// SSH private key for node cluster loaded securely from environment
function getEffectiveSshKey() {
  const raw = process.env.MC_SSH_PRIVATE_KEY || process.env.MC_SSH_KEY || (process.env.MC_SSH_KEY_FILE && fs.existsSync(process.env.MC_SSH_KEY_FILE) ? fs.readFileSync(process.env.MC_SSH_KEY_FILE, 'utf8') : '');
  if (!raw) return '';
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}
const DEFAULT_SSH_KEY = getEffectiveSshKey();

// ── Registered Node Cluster ────────────────────────────────────────
const NODES = {
  'mcs-01': {
    id: 'mcs-01',
    name: 'PETABLOCKS-MCS1 (Game Node 1)',
    host: process.env.MC_MCS1_HOST || '10.20.110.118',
    port: parseInt(process.env.MC_MCS1_PORT || '22', 10),
    user: process.env.MC_MCS1_USER || 'root',
    baseDataDir: '/home/user/data/servers',
    description: 'Dedicated Ubuntu 24.04 Docker Node — Main Modpack Server',
  },
  'mcs-02': {
    id: 'mcs-02',
    name: 'PETABLOCKS-MCS2 (Game Node 2)',
    host: process.env.MC_MCS2_HOST || '10.20.110.119',
    port: parseInt(process.env.MC_MCS2_PORT || '22', 10),
    user: process.env.MC_MCS2_USER || 'root',
    baseDataDir: '/home/user/data/servers',
    description: 'Dedicated Ubuntu 24.04 Docker Node — Create 2 SMP',
  },
  'mcs-03': {
    id: 'mcs-03',
    name: 'PETABLOCKS-MCS3 (Game Node 3)',
    host: process.env.MC_MCS3_HOST || '10.20.110.120',
    port: parseInt(process.env.MC_MCS3_PORT || '22', 10),
    user: process.env.MC_MCS3_USER || 'root',
    baseDataDir: '/home/user/data/servers',
    description: 'Dedicated Ubuntu 24.04 Docker Node — Patreon Creative',
  },
  'fea-01': {
    id: 'fea-01',
    name: 'PETABLOCKS-FEA (Web & Admin Node)',
    host: process.env.MC_FEA_HOST || '10.20.110.116',
    port: parseInt(process.env.MC_FEA_PORT || '22', 10),
    user: process.env.MC_FEA_USER || 'root',
    baseDataDir: '/opt/petablocks/servers',
    description: 'Hosts Admin Panel & Public Web Services',
  },
};

// Known Server definitions (mapped to actual Docker containers)
const SERVERS_REGISTRY = [
  {
    id: 'fabric-main',
    nodeId: 'mcs-01',
    name: 'PETABLOCKS Modpack Server',
    containerName: 'petablocks-modpack-main',
    dataPath: '/home/user/data/servers/petablocks-modpack-main',
    gamePort: 11691,
    rconPort: 25575,
    rconHostPort: 16901,
    rconPassword: process.env.MC_FABRIC_RCON_PASSWORD || process.env.RCON_PASSWORD || '',
    type: 'Fabric',
    version: '1.20.1',
    memory: '20G',
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
  },
  {
    id: 'patreon-creative',
    nodeId: 'mcs-03',
    name: 'PETABLOCKS Patreon Creative',
    containerName: 'petablocks-patreon-creative',
    dataPath: '/home/user/data/servers/patreon_create_server_a91d1a56-6130-4daa-88c9-3f7a1082dcb4',
    gamePort: 11651,
    rconPort: 25575,
    rconHostPort: 11661,
    rconPassword: process.env.MC_PATREON_RCON_PASSWORD || process.env.RCON_PASSWORD || '',
    type: 'NeoForge',
    version: '1.21.1',
    memory: '12G',
    color: 'text-purple-400',
    border: 'border-purple-500/30',
  },
  {
    id: 'create-2',
    nodeId: 'mcs-02',
    name: 'Just Create SMP 2',
    containerName: 'petablocks-create-2',
    dataPath: '/home/user/data/servers/petablocks_create_2_451a2727-49f0-4629-86fe-b22e93ef67e5',
    gamePort: 11681,
    rconPort: 25575,
    rconHostPort: 11691,
    rconPassword: process.env.MC_CREATE2_RCON_PASSWORD || process.env.RCON_PASSWORD || '',
    type: 'NeoForge',
    version: '1.21.1',
    memory: '16G',
    color: 'text-sky-400',
    border: 'border-sky-500/30',
  },
];

// ── SSH Execution Helper ───────────────────────────────────────────
function runSshCommand(nodeConfig, command, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const conn = new SshClient();
    let stdout = '';
    let stderr = '';
    let timer;

    conn.on('ready', () => {
      conn.exec(command, (err, stream) => {
        if (err) {
          conn.end();
          return reject(err);
        }

        stream.on('data', (data) => {
          stdout += data.toString();
        });

        stream.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        stream.on('close', (code) => {
          clearTimeout(timer);
          conn.end();
          resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
        });
      });
    });

    conn.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });

    timer = setTimeout(() => {
      conn.end();
      reject(new Error(`SSH Command timed out after ${timeoutMs}ms: ${command}`));
    }, timeoutMs);

    const key = getEffectiveSshKey();
    if (!key) {
      clearTimeout(timer);
      conn.end();
      return reject(new Error('No SSH private key configured (MC_SSH_KEY / MC_SSH_PRIVATE_KEY is empty)'));
    }

    conn.connect({
      host: nodeConfig.host,
      port: nodeConfig.port,
      username: nodeConfig.user,
      privateKey: key,
      readyTimeout: 10000,
    });
  });
}

// ── RCON Command Helper (direct TCP socket) ────────────────────────
function sendRconCommand(host, port, password, command) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let authenticated = false;
    let reqId = 1;
    let authReqId = 1;
    let cmdReqId = 2;
    let output = '';

    socket.setTimeout(6000);

    socket.on('connect', () => {
      // Send Auth Packet: Length (4 bytes), ReqID (4 bytes), Type=3 (4 bytes), Password, null, null
      const passBuf = Buffer.from(password, 'utf8');
      const length = 4 + 4 + passBuf.length + 2;
      const packet = Buffer.alloc(4 + length);

      packet.writeInt32LE(length, 0);
      packet.writeInt32LE(authReqId, 4);
      packet.writeInt32LE(3, 8); // SERVERDATA_AUTH
      passBuf.copy(packet, 12);
      packet.writeInt8(0, 12 + passBuf.length);
      packet.writeInt8(0, 13 + passBuf.length);

      socket.write(packet);
    });

    socket.on('data', (data) => {
      if (data.length < 12) return;
      const length = data.readInt32LE(0);
      const resId = data.readInt32LE(4);
      const type = data.readInt32LE(8);

      if (!authenticated) {
        if (resId === -1) {
          socket.destroy();
          return reject(new Error('RCON Authentication failed: Invalid password'));
        }
        authenticated = true;
        // Send command packet
        const cmdBuf = Buffer.from(command, 'utf8');
        const cmdLength = 4 + 4 + cmdBuf.length + 2;
        const cmdPacket = Buffer.alloc(4 + cmdLength);

        cmdPacket.writeInt32LE(cmdLength, 0);
        cmdPacket.writeInt32LE(cmdReqId, 4);
        cmdPacket.writeInt32LE(2, 8); // SERVERDATA_EXECCOMMAND
        cmdBuf.copy(cmdPacket, 12);
        cmdPacket.writeInt8(0, 12 + cmdBuf.length);
        cmdPacket.writeInt8(0, 13 + cmdBuf.length);

        socket.write(cmdPacket);
      } else {
        // Read response payload
        const payload = data.slice(12, data.length - 2).toString('utf8');
        output += payload;
        socket.destroy();
        resolve(output.trim());
      }
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new Error('RCON connection timed out'));
    });

    socket.on('error', (err) => {
      reject(err);
    });

    socket.connect(port, host);
  });
}

// ── GET /api/server-manager/nodes ──────────────────────────────────
// Returns list of registered VM nodes with live hardware stats & ping
router.get('/nodes', async (_req, res) => {
  const nodeList = Object.values(NODES);

  const results = await Promise.all(
    nodeList.map(async (node) => {
      try {
        const pingStart = Date.now();
        const { stdout } = await runSshCommand(
          node,
          `echo "===MEM===" && free -m && echo "===CPU===" && nproc && echo "===DISK===" && df -h / && echo "===DOCKER===" && docker info --format '{{.ContainersRunning}}/{{.Containers}}'`,
          8000
        );
        const pingMs = Date.now() - pingStart;

        // Parse memory
        const memMatch = stdout.match(/Mem:\s+(\d+)\s+(\d+)\s+(\d+)/);
        const totalMemMb = memMatch ? parseInt(memMatch[1], 10) : 0;
        const usedMemMb = memMatch ? parseInt(memMatch[2], 10) : 0;

        // Parse CPU cores
        const cpuMatch = stdout.match(/===CPU===\s+(\d+)/);
        const cpuCores = cpuMatch ? parseInt(cpuMatch[1], 10) : 0;

        // Parse disk
        const diskMatch = stdout.match(/\/dev\/\S+\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)%\s+\//);
        const diskTotal = diskMatch ? diskMatch[1] : '—';
        const diskUsed = diskMatch ? diskMatch[2] : '—';
        const diskAvail = diskMatch ? diskMatch[3] : '—';
        const diskPercent = diskMatch ? parseInt(diskMatch[4], 10) : 0;

        // Parse docker
        const dockerMatch = stdout.match(/===DOCKER===\s+(\d+)\/(\d+)/);
        const dockerRunning = dockerMatch ? parseInt(dockerMatch[1], 10) : 0;
        const dockerTotal = dockerMatch ? parseInt(dockerMatch[2], 10) : 0;

        return {
          ...node,
          online: true,
          pingMs,
          cpuCores,
          memory: {
            totalGb: (totalMemMb / 1024).toFixed(1),
            usedGb: (usedMemMb / 1024).toFixed(1),
            percent: totalMemMb ? Math.round((usedMemMb / totalMemMb) * 100) : 0,
          },
          disk: { total: diskTotal, used: diskUsed, avail: diskAvail, percent: diskPercent },
          docker: { running: dockerRunning, total: dockerTotal },
        };
      } catch (err) {
        // Fallback for PETABLOCKS-FEA (fea-01): pb-admin runs directly inside Docker on FEA
        // with /var/run/docker.sock mounted. Query host/container vitals directly.
        if (node.id === 'fea-01') {
          try {
            const dockerInfo = await localDocker.info().catch(() => null);
            const totalMemMb = Math.round(os.totalmem() / (1024 * 1024));
            const freeMemMb = Math.round(os.freemem() / (1024 * 1024));
            const usedMemMb = Math.max(0, totalMemMb - freeMemMb);
            const cpuCores = os.cpus().length || 4;

            const runningContainers = dockerInfo ? dockerInfo.ContainersRunning : 0;
            const totalContainers = dockerInfo ? dockerInfo.Containers : 0;

            let diskTotal = '—';
            let diskUsed = '—';
            let diskAvail = '—';
            let diskPercent = 0;

            if (fs.existsSync('/opt/petablocks')) {
              try {
                const stat = fs.statfsSync('/opt/petablocks');
                const bSize = stat.bsize || 4096;
                const totalBytes = stat.blocks * bSize;
                const freeBytes = stat.bfree * bSize;
                const usedBytes = totalBytes - freeBytes;
                diskTotal = `${(totalBytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
                diskUsed = `${(usedBytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
                diskAvail = `${(freeBytes / (1024 * 1024 * 1024)).toFixed(1)}G`;
                diskPercent = totalBytes ? Math.round((usedBytes / totalBytes) * 100) : 0;
              } catch (_) {}
            }

            return {
              ...node,
              online: true,
              pingMs: 1,
              cpuCores,
              memory: {
                totalGb: (totalMemMb / 1024).toFixed(1),
                usedGb: (usedMemMb / 1024).toFixed(1),
                percent: totalMemMb ? Math.round((usedMemMb / totalMemMb) * 100) : 0,
              },
              disk: { total: diskTotal, used: diskUsed, avail: diskAvail, percent: diskPercent },
              docker: { running: runningContainers, total: totalContainers },
            };
          } catch (localErr) {
            console.warn('[NODES] FEA local metrics fallback error:', localErr.message);
          }
        }

        return {
          ...node,
          online: false,
          pingMs: 0,
          error: err.message,
          cpuCores: 0,
          memory: { totalGb: '0', usedGb: '0', percent: 0 },
          disk: { total: '—', used: '—', avail: '—', percent: 0 },
          docker: { running: 0, total: 0 },
        };
      }
    })
  );

  res.json({ nodes: results });
});

// ── GET /api/server-manager/servers ────────────────────────────────
// Lists all managed Minecraft servers with live container status & stats
router.get('/servers', async (_req, res) => {
  const nodeServers = [];

  for (const srv of SERVERS_REGISTRY) {
    const node = NODES[srv.nodeId];
    if (!node) continue;

    try {
      // Inspect docker container
      const inspectCmd = `docker inspect ${srv.containerName} --format '{{json .State}}' 2>/dev/null`;
      const statsCmd = `docker stats --no-stream --format '{{.CPUPerc}}|{{.MemUsage}}' ${srv.containerName} 2>/dev/null`;

      const [inspectRes, statsRes] = await Promise.all([
        runSshCommand(node, inspectCmd, 5000).catch(() => ({ stdout: '' })),
        runSshCommand(node, statsCmd, 5000).catch(() => ({ stdout: '' })),
      ]);

      let state = { Running: false, Status: 'offline', StartedAt: null };
      if (inspectRes.stdout) {
        try { state = JSON.parse(inspectRes.stdout); } catch (_) {}
      }

      let cpuPerc = '0%';
      let memUsage = '0B / 0B';
      if (statsRes.stdout && statsRes.stdout.includes('|')) {
        const parts = statsRes.stdout.split('|');
        cpuPerc = parts[0].trim();
        memUsage = parts[1].trim();
      }

      nodeServers.push({
        ...srv,
        online: Boolean(state.Running),
        status: state.Status || 'offline',
        startedAt: state.StartedAt,
        cpuUsage: cpuPerc,
        memUsage: memUsage,
        nodeName: node.name,
        nodeHost: node.host,
      });
    } catch (err) {
      nodeServers.push({
        ...srv,
        online: false,
        status: 'error',
        error: err.message,
        cpuUsage: '0%',
        memUsage: '0B / 0B',
        nodeName: node.name,
        nodeHost: node.host,
      });
    }
  }

  res.json({ servers: nodeServers });
});

// ── GET /api/server-manager/servers/:id ────────────────────────────
// Single server details
router.get('/servers/:id', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  if (!node) return res.status(404).json({ error: 'Node not found' });

  try {
    const { stdout } = await runSshCommand(
      node,
      `docker inspect ${srv.containerName} --format '{{json .}}'`,
      5000
    );
    const container = JSON.parse(stdout);
    res.json({ server: srv, node, container });
  } catch (err) {
    res.json({ server: srv, node, error: err.message });
  }
});

// ── POST /api/server-manager/servers/:id/power ────────────────────
// Power actions: start, stop, restart, kill
router.post('/servers/:id/power', async (req, res) => {
  const { action } = req.body; // 'start' | 'stop' | 'restart' | 'kill'
  if (!['start', 'stop', 'restart', 'kill'].includes(action)) {
    return res.status(400).json({ error: "Invalid action. Expected 'start', 'stop', 'restart', or 'kill'" });
  }

  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  if (!node) return res.status(404).json({ error: 'Node not found' });

  try {
    let cmd = `docker ${action} ${srv.containerName}`;
    if (action === 'stop') cmd = `docker stop -t 30 ${srv.containerName}`; // Give 30s for clean world save

    const { stdout, stderr, code } = await runSshCommand(node, cmd, 45000);
    if (code !== 0) {
      discordService.sendConsoleAlert(srv.id, {
        title: `🚨 Server Action Failed: ${action.toUpperCase()}`,
        description: `Failed to execute \`${action}\` on container \`${srv.containerName}\` on **${node.name}**.\n\`\`\`${stderr || stdout}\`\`\``,
        color: 0xef4444, // Red
      });
      return res.status(500).json({ error: `Command failed: ${stderr || stdout}` });
    }

    // Send Discord console lifecycle notification
    const actionColorMap = {
      start: 0x10b981,   // Green
      stop: 0x6b7280,    // Gray
      restart: 0xf59e0b, // Amber
      kill: 0xef4444,    // Red
    };
    const actionTitleMap = {
      start: '🟢 Server Starting',
      stop: '🛑 Server Stopping',
      restart: '🔄 Server Restarting',
      kill: '⚠️ Server Force-Killed',
    };

    discordService.sendConsoleAlert(srv.id, {
      title: actionTitleMap[action] || `Server ${action}`,
      description: `Container \`${srv.containerName}\` was triggered to **${action}** via the Admin Portal.`,
      color: actionColorMap[action] || 0x3b82f6,
      fields: [
        { name: 'Node', value: node.name, inline: true },
        { name: 'Game Port', value: `${srv.gamePort}`, inline: true },
        { name: 'Allocated Memory', value: srv.memory, inline: true },
      ],
    });

    res.json({ success: true, action, serverId: srv.id, output: stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/server-manager/servers/:id/logs ──────────────────────
// Returns latest N log lines from Docker container
router.get('/servers/:id/logs', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const lines = parseInt(req.query.lines || '200', 10);

  try {
    const { stdout } = await runSshCommand(node, `docker logs --tail ${lines} ${srv.containerName} 2>&1`, 8000);
    res.json({ logs: stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/server-manager/servers/:id/command ──────────────────
// Sends command via RCON or docker exec rcon-cli
router.post('/servers/:id/command', async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'Command is required' });

  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];

  // Try RCON directly first
  try {
    const rconRes = await sendRconCommand(node.host, srv.rconHostPort, srv.rconPassword, command);
    
    // Log admin command to Discord Console channel if enabled
    const cfg = discordService.getServerWebhookConfig(srv.id);
    if (cfg.consoleEnabled && cfg.consoleEvents?.rconCommands && !command.startsWith('list') && !command.startsWith('spark')) {
      discordService.sendConsoleAlert(srv.id, {
        title: '💻 Console Command Executed',
        description: `Command: \`/${command}\`\nOutput: \`\`\`${(rconRes || 'No output').slice(0, 500)}\`\`\``,
        color: 0x6366f1, // Indigo
      });
    }

    return res.json({ response: rconRes || 'Command executed (no output returned)' });
  } catch (rconErr) {
    // Fallback to docker exec rcon-cli inside container
    try {
      const sanitizedCmd = command.replace(/'/g, "'\\''");
      const { stdout } = await runSshCommand(
        node,
        `docker exec ${srv.containerName} rcon-cli '${sanitizedCmd}' 2>&1`,
        8000
      );
      res.json({ response: stdout || 'Command executed via rcon-cli' });
    } catch (dockerErr) {
      res.status(500).json({ error: `Command execution failed: ${dockerErr.message}` });
    }
  }
});

// ── GET /api/server-manager/servers/:id/files ─────────────────────
// Browse server files and directories
router.get('/servers/:id/files', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const reqSubpath = (req.query.path || '').replace(/\.\./g, ''); // Prevent path traversal
  const targetDir = path.posix.join(srv.dataPath, reqSubpath);

  try {
    // List directory with detailed stats using python or standard ls on remote
    const cmd = `python3 -c "
import os, json, time
base = '${targetDir}'
items = []
try:
    for entry in os.scandir(base):
        stat = entry.stat()
        items.append({
            'name': entry.name,
            'isDir': entry.is_dir(),
            'size': stat.st_size if not entry.is_dir() else 0,
            'modified': stat.st_mtime,
        })
    print(json.dumps({'path': '${reqSubpath}', 'items': items}))
except Exception as e:
    print(json.dumps({'error': str(e)}))
"`;
    const { stdout } = await runSshCommand(node, cmd, 8000);
    const data = JSON.parse(stdout);
    if (data.error) return res.status(400).json({ error: data.error });

    // Sort: directories first, then alphabetically
    data.items.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/server-manager/servers/:id/files/content ─────────────
// Read file content for in-browser editor
router.get('/servers/:id/files/content', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const reqFile = (req.query.file || '').replace(/\.\./g, '');
  const targetFile = path.posix.join(srv.dataPath, reqFile);

  try {
    const { stdout, stderr, code } = await runSshCommand(node, `cat '${targetFile}'`, 8000);
    if (code !== 0) return res.status(400).json({ error: stderr || 'Could not read file' });
    res.json({ file: reqFile, content: stdout });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/server-manager/servers/:id/files/save ───────────────
// Save file content back to disk
router.post('/servers/:id/files/save', async (req, res) => {
  const { file, content } = req.body;
  if (!file || content === undefined) return res.status(400).json({ error: 'File path and content are required' });

  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const reqFile = file.replace(/\.\./g, '');
  const targetFile = path.posix.join(srv.dataPath, reqFile);

  // Encode content as Base64 to prevent shell escape issues
  const base64Content = Buffer.from(content, 'utf8').toString('base64');

  try {
    const cmd = `echo '${base64Content}' | base64 -d > '${targetFile}'`;
    const { code, stderr } = await runSshCommand(node, cmd, 10000);
    if (code !== 0) return res.status(500).json({ error: stderr || 'Failed to save file' });
    res.json({ success: true, file: reqFile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/server-manager/servers/:id/files/upload ─────────────
// Upload file into server folder
router.post('/servers/:id/files/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const targetSubpath = (req.body.path || '').replace(/\.\./g, '');
  const destDir = path.posix.join(srv.dataPath, targetSubpath);
  const destFile = path.posix.join(destDir, req.file.originalname);

  const base64Data = req.file.buffer.toString('base64');

  try {
    // Write in chunks via base64
    const cmd = `mkdir -p '${destDir}' && echo '${base64Data}' | base64 -d > '${destFile}'`;
    const { code, stderr } = await runSshCommand(node, cmd, 30000);
    if (code !== 0) return res.status(500).json({ error: stderr || 'Upload failed' });
    res.json({ success: true, filename: req.file.originalname, size: req.file.size });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── DELETE /api/server-manager/servers/:id/files ──────────────────
// Delete a file or directory
router.delete('/servers/:id/files', async (req, res) => {
  const reqTarget = (req.query.path || '').replace(/\.\./g, '');
  if (!reqTarget) return res.status(400).json({ error: 'Path is required' });

  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const targetPath = path.posix.join(srv.dataPath, reqTarget);

  try {
    const cmd = `rm -rf '${targetPath}'`;
    const { code, stderr } = await runSshCommand(node, cmd, 10000);
    if (code !== 0) return res.status(500).json({ error: stderr || 'Delete failed' });
    res.json({ success: true, path: reqTarget });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/server-manager/servers/:id/mods ──────────────────────
// Lists all installed mods with size, dates, and active status
router.get('/servers/:id/mods', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const modsDir = path.posix.join(srv.dataPath, 'mods');

  try {
    const cmd = `python3 -c "
import os, json
mods_dir = '${modsDir}'
mods = []
if os.path.exists(mods_dir):
    for f in os.scandir(mods_dir):
        if f.is_file() and (f.name.endswith('.jar') or f.name.endswith('.jar.disabled')):
            stat = f.stat()
            mods.append({
                'filename': f.name,
                'enabled': f.name.endswith('.jar'),
                'size': stat.st_size,
                'modified': stat.st_mtime,
            })
print(json.dumps({'mods': sorted(mods, key=lambda x: x['filename'].lower())}))
"`;
    const { stdout } = await runSshCommand(node, cmd, 8000);
    const data = JSON.parse(stdout);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/server-manager/servers/:id/mods/toggle ──────────────
// Toggle mod enabled/disabled status
router.post('/servers/:id/mods/toggle', async (req, res) => {
  const { filename } = req.body;
  if (!filename) return res.status(400).json({ error: 'Filename is required' });

  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const modsDir = path.posix.join(srv.dataPath, 'mods');

  let newFilename;
  if (filename.endsWith('.jar.disabled')) {
    newFilename = filename.replace('.jar.disabled', '.jar');
  } else if (filename.endsWith('.jar')) {
    newFilename = filename + '.disabled';
  } else {
    return res.status(400).json({ error: 'Invalid mod filename' });
  }

  const oldPath = path.posix.join(modsDir, filename);
  const newPath = path.posix.join(modsDir, newFilename);

  try {
    const cmd = `mv '${oldPath}' '${newPath}'`;
    const { code, stderr } = await runSshCommand(node, cmd, 5000);
    if (code !== 0) return res.status(500).json({ error: stderr || 'Failed to rename mod' });
    res.json({ success: true, oldFilename: filename, newFilename, enabled: newFilename.endsWith('.jar') });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/server-manager/servers/:id/players ───────────────────
// Reads ops.json, whitelist.json, and banned-players.json
router.get('/servers/:id/players', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];

  try {
    const cmd = `python3 -c "
import os, json
def read_json(name):
    p = os.path.join('${srv.dataPath}', name)
    if os.path.exists(p):
        try:
            with open(p) as f: return json.load(f)
        except: return []
    return []

print(json.dumps({
    'ops': read_json('ops.json'),
    'whitelist': read_json('whitelist.json'),
    'bannedPlayers': read_json('banned-players.json'),
    'bannedIps': read_json('banned-ips.json'),
}))
"`;
    const { stdout } = await runSshCommand(node, cmd, 8000);
    res.json(JSON.parse(stdout));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/server-manager/servers/create ───────────────────────
// Provisions a brand new Minecraft server container on a VM node
router.post('/servers/create', async (req, res) => {
  const {
    name,
    serverId,
    nodeId = 'mcs-01',
    loader = 'NEOFORGE', // NEOFORGE | FABRIC | FORGE | VANILLA | PAPER
    mcVersion = '1.21.1',
    memory = '8G',
    gamePort = 11700,
    rconPort = 25575,
    rconPassword = 'pb_rcon_' + Math.random().toString(36).substring(2, 10),
    motd = 'A PETABLOCKS Minecraft Server',
  } = req.body;

  if (!name || !serverId) {
    return res.status(400).json({ error: 'Server name and server ID are required' });
  }

  const node = NODES[nodeId];
  if (!node) return res.status(400).json({ error: `Node '${nodeId}' not found` });

  // Sanitize server ID
  const cleanId = serverId.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const containerName = `petablocks-server-${cleanId}`;
  const dataPath = path.posix.join(node.baseDataDir, cleanId);

  // Map loader to itzg image tag & env vars
  let javaTag = 'java21';
  let typeEnv = loader.toUpperCase();

  if (['1.16', '1.17'].some(v => mcVersion.startsWith(v))) javaTag = 'java16';
  else if (['1.18', '1.19', '1.20'].some(v => mcVersion.startsWith(v))) javaTag = 'java17';

  // RCON host port allocation (bind to next available or port+10)
  const rconHostPort = parseInt(gamePort, 10) + 10;

  const dockerRunCmd = `
mkdir -p '${dataPath}' && \
docker run -d \
  --name '${containerName}' \
  --restart unless-stopped \
  -p ${gamePort}:25565 \
  -p ${rconHostPort}:25575 \
  -v '${dataPath}:/data' \
  -e EULA=TRUE \
  -e TYPE='${typeEnv}' \
  -e VERSION='${mcVersion}' \
  -e MEMORY='${memory}' \
  -e SERVER_NAME='${name}' \
  -e MOTD='${motd}' \
  -e ENABLE_RCON=true \
  -e RCON_PASSWORD='${rconPassword}' \
  -e RCON_PORT=25575 \
  itzg/minecraft-server:${javaTag}
`.trim();

  try {
    const { stdout, stderr, code } = await runSshCommand(node, dockerRunCmd, 45000);
    if (code !== 0) {
      return res.status(500).json({ error: `Docker provisioning failed: ${stderr || stdout}` });
    }

    const newServerEntry = {
      id: cleanId,
      nodeId,
      name,
      containerName,
      dataPath,
      gamePort: parseInt(gamePort, 10),
      rconPort: 25575,
      rconHostPort,
      rconPassword,
      type: loader,
      version: mcVersion,
      memory,
      color: 'text-emerald-400',
      border: 'border-emerald-500/30',
    };

    SERVERS_REGISTRY.push(newServerEntry);

    res.json({
      success: true,
      server: newServerEntry,
      containerId: stdout,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/server-manager/servers/:id/discord ───────────────────
// Returns configured Discord webhooks for a server
router.get('/servers/:id/discord', (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const config = discordService.getServerWebhookConfig(srv.id);
  res.json({ serverId: srv.id, config });
});

// ── POST /api/server-manager/servers/:id/discord ──────────────────
// Updates Discord webhook configuration for a server
router.post('/servers/:id/discord', (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const updated = discordService.setServerWebhookConfig(srv.id, req.body);
  res.json({ success: true, serverId: srv.id, config: updated });
});

// ── POST /api/server-manager/servers/:id/discord/test ─────────────
// Sends a test webhook message to verify setup
router.post('/servers/:id/discord/test', async (req, res) => {
  const { channelType } = req.body; // 'chat' | 'console'
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const cfg = discordService.getServerWebhookConfig(srv.id);

  if (channelType === 'chat') {
    if (!cfg.chatWebhookUrl) {
      return res.status(400).json({ error: 'Chat Webhook URL is not configured.' });
    }
    try {
      await discordService.postToDiscord(cfg.chatWebhookUrl, {
        username: 'PETABLOCKS Chat Bot',
        avatar_url: 'https://i.ibb.co/6RQ5VVhm/Gemini-Generated-Image-kuabj3kuabj3kuab-removebg-preview.png',
        embeds: [
          {
            title: '💬 Chat Webhook Connected',
            description: `This channel is now connected to **${srv.name}** for in-game chat, joins, and deaths.`,
            color: 0x10b981,
            timestamp: new Date().toISOString(),
            footer: { text: `PETABLOCKS • ${srv.id}` },
          },
        ],
      });
      return res.json({ success: true, message: 'Test message delivered to Chat channel!' });
    } catch (err) {
      return res.status(500).json({ error: `Discord delivery failed: ${err.message}` });
    }
  } else if (channelType === 'console') {
    if (!cfg.consoleWebhookUrl) {
      return res.status(400).json({ error: 'Console Webhook URL is not configured.' });
    }
    try {
      await discordService.postToDiscord(cfg.consoleWebhookUrl, {
        username: 'PETABLOCKS Console',
        avatar_url: 'https://i.ibb.co/6RQ5VVhm/Gemini-Generated-Image-kuabj3kuabj3kuab-removebg-preview.png',
        embeds: [
          {
            title: '🖥️ Console Webhook Connected',
            description: `This channel is now connected to **${srv.name}** for lifecycle events, restarts, and console alerts.`,
            color: 0x3b82f6,
            fields: [
              { name: 'Server', value: srv.name, inline: true },
              { name: 'Node', value: srv.nodeId, inline: true },
              { name: 'Status', value: 'Ready', inline: true },
            ],
            timestamp: new Date().toISOString(),
            footer: { text: `PETABLOCKS • ${srv.id}` },
          },
        ],
      });
      return res.json({ success: true, message: 'Test alert delivered to Console channel!' });
    } catch (err) {
      return res.status(500).json({ error: `Discord delivery failed: ${err.message}` });
    }
  } else if (channelType === 'train') {
    if (!cfg.trainWebhookUrl) {
      return res.status(400).json({ error: 'Create Train Webhook URL is not configured.' });
    }
    try {
      await discordService.postToDiscord(cfg.trainWebhookUrl, {
        username: 'Railway Dispatcher',
        avatar_url: 'https://i.ibb.co/6RQ5VVhm/Gemini-Generated-Image-kuabj3kuabj3kuab-removebg-preview.png',
        embeds: [
          {
            title: '🚆 Railway Dispatch Connected',
            description: `This channel is now connected to **${srv.name}** for Create train events, assembly alerts, and derailments.`,
            color: 0x8b5cf6,
            fields: [
              { name: 'Server', value: srv.name, inline: true },
              { name: 'Dispatcher Status', value: '🟢 Monitoring Tracks', inline: true },
            ],
            timestamp: new Date().toISOString(),
            footer: { text: `Create Railway Dispatch • ${srv.id}` },
          },
        ],
      });
      return res.json({ success: true, message: 'Test dispatch delivered to Train channel!' });
    } catch (err) {
      return res.status(500).json({ error: `Discord delivery failed: ${err.message}` });
    }
  } else {
    return res.status(400).json({ error: "Invalid channelType. Expected 'chat', 'console', or 'train'" });
  }
});

function checkPortOpen(host, port, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(timeoutMs);
    s.once('connect', () => {
      s.destroy();
      resolve(true);
    });
    s.once('timeout', () => {
      s.destroy();
      resolve(false);
    });
    s.once('error', () => {
      s.destroy();
      resolve(false);
    });
    s.connect(port, host);
  });
}

module.exports = router;
module.exports.NODES = NODES;
module.exports.SERVERS_REGISTRY = SERVERS_REGISTRY;
module.exports.runSshCommand = runSshCommand;
module.exports.checkPortOpen = checkPortOpen;
