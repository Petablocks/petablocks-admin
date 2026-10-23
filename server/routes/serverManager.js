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
const telemetryInstaller = require('../services/telemetryInstallerService');
const discopanelClient = require('../services/discopanelClient');
const { runBackupJob, registerDynamicBackupServer } = require('./backups');
const { modConnectedSockets } = require('./minecraft');

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
    description: 'Dedicated Ubuntu 24.04 Docker Node — Velocity Proxy & Central Hub Lobby',
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
    id: 'velocity-proxy',
    nodeId: 'mcs-01',
    name: 'Velocity Proxy Gateway',
    containerName: 'pb-velocity-proxy',
    dataPath: '/home/user/data/servers/velocity-proxy',
    gamePort: 11601,
    rconPort: null,
    rconHostPort: null,
    rconPassword: '',
    type: 'Velocity',
    version: '4.2.1',
    memory: '2G',
    color: 'text-cyan-400',
    border: 'border-cyan-500/30',
  },
  {
    id: 'lobby-main',
    nodeId: 'mcs-01',
    name: 'Central Network Lobby Hub',
    containerName: 'pb-lobby-main',
    dataPath: '/home/user/data/servers/lobby-main',
    gamePort: 11602,
    rconPort: 25575,
    rconHostPort: 25575,
    rconPassword: process.env.MC_LOBBY_RCON_PASSWORD || 'PBLobbyRcon2024!',
    type: 'Paper',
    version: '1.21.4',
    memory: '6G',
    color: 'text-amber-400',
    border: 'border-amber-500/30',
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
    id: 'modpack-s2-test',
    nodeId: 'mcs-01',
    name: 'PETABLOCKS Modpack Season 2 (Test Server)',
    containerName: process.env.MC_S2_TEST_CONTAINER || 'petablocks-modpack-s2-test',
    dataPath: process.env.MC_S2_TEST_DATA_PATH || '/home/user/data/servers/petablocks-modpack-s2-test',
    gamePort: parseInt(process.env.MC_S2_TEST_PORT || '11695', 10),
    rconPort: 25575,
    rconHostPort: parseInt(process.env.MC_S2_TEST_RCON_PORT || '25575', 10),
    rconPassword: process.env.MC_S2_TEST_RCON_PASSWORD || process.env.RCON_PASSWORD || '',
    type: 'NeoForge',
    version: '1.21.1',
    memory: '16G',
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
  },
  {
    id: 'paper-duo-smp',
    nodeId: 'mcs-01',
    name: 'Paper 26.3 Duo SMP',
    containerName: 'pb-paper-smp',
    dataPath: '/opt/petablocks/paper-smp/data',
    gamePort: 11605,
    rconPort: 25575,
    rconHostPort: 25575,
    rconPassword: process.env.MC_DUO_RCON_PASSWORD || 'petablocks_rcon_secure',
    type: 'Paper',
    version: '1.21.4',
    memory: '4G',
    color: 'text-pink-400',
    border: 'border-pink-500/30',
  },
  {
    id: 'fabric-main',
    nodeId: 'mcs-01',
    name: 'Official Modpack (Season 1 Archived)',
    containerName: 'petablocks-modpack-main',
    dataPath: '/home/user/data/servers/archived-petablocks-modpack-m1',
    gamePort: 11691,
    rconPort: 25575,
    rconHostPort: 16901,
    rconPassword: '',
    type: 'Fabric',
    version: '1.20.1',
    memory: '20G',
    color: 'text-zinc-500',
    border: 'border-zinc-700/40',
    archived: true,
  },
];

// Upsert a dynamically discovered DiscoPanel or Docker server into SERVERS_REGISTRY & Backups
function upsertDiscoveredServer(nodeId, dpSrv) {
  if (!dpSrv || !dpSrv.id) return null;
  const node = NODES[nodeId];
  const loaderType = discopanelClient.formatProtoLoader(dpSrv.modLoader);
  const memGb = dpSrv.memory ? `${Math.max(1, Math.round(dpSrv.memory / 1024))}G` : '8G';
  const existing = SERVERS_REGISTRY.find(
    (s) =>
      s.id === dpSrv.id ||
      (dpSrv.dataPath && s.dataPath === dpSrv.dataPath) ||
      (dpSrv.name && s.name.toLowerCase() === dpSrv.name.toLowerCase())
  );

  if (existing) {
    existing.discopanelId = dpSrv.id;
    existing.discopanelManaged = true;
    if (dpSrv.dataPath) existing.dataPath = dpSrv.dataPath;
    if (dpSrv.port) existing.gamePort = dpSrv.port;
    if (dpSrv.mcVersion) existing.version = dpSrv.mcVersion;
    if (dpSrv.containerId) existing.containerId = dpSrv.containerId;
    return existing;
  }

  const created = {
    id: dpSrv.id,
    discopanelId: dpSrv.id,
    discopanelManaged: true,
    nodeId,
    name: dpSrv.name || dpSrv.id,
    containerName: dpSrv.containerId || `discopanel-server-${dpSrv.id}`,
    containerId: dpSrv.containerId || '',
    dataPath: dpSrv.dataPath || `/home/user/data/servers/${dpSrv.id}`,
    gamePort: dpSrv.port || 25565,
    rconPort: 25575,
    rconHostPort: (dpSrv.port || 25565) + 10,
    rconPassword: process.env.RCON_PASSWORD || '',
    type: loaderType,
    version: dpSrv.mcVersion || '1.21.1',
    memory: memGb,
    color: 'text-emerald-400',
    border: 'border-emerald-500/30',
  };
  SERVERS_REGISTRY.push(created);

  if (node) {
    registerDynamicBackupServer(created.id, {
      name: created.name,
      sshHost: node.host,
      sshPort: node.port,
      sshUser: node.user,
      serverDataPath: created.dataPath,
      worldDirs: ['world'],
      worldName: 'world',
    });
  }
  return created;
}

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
// Lists all managed Minecraft servers with live DiscoPanel + Docker container status & stats
router.get('/servers', async (_req, res) => {
  const nodeServers = [];
  const dpByNodeAndId = new Map();

  // 1. Poll DiscoPanel agents across game nodes in parallel to auto-discover & enrich servers
  await Promise.all(
    Object.values(NODES)
      .filter((n) => n.id.startsWith('mcs-'))
      .map(async (node) => {
        try {
          const dpList = await discopanelClient.listServers(node, true);
          for (const dpSrv of dpList) {
            upsertDiscoveredServer(node.id, dpSrv);
            dpByNodeAndId.set(`${node.id}:${dpSrv.id}`, dpSrv);
          }
        } catch (_) {
          // DiscoPanel agent not reachable yet on this node; fallback to SSH below
        }
      })
  );

  // 2. Also auto-discover any running/stopped Modpack Season 2 or PETABLOCKS containers over SSH
  // if DiscoPanel hasn't adopted them yet
  await Promise.all(
    Object.values(NODES)
      .filter((n) => n.id.startsWith('mcs-'))
      .map(async (node) => {
        try {
          const { stdout } = await runSshCommand(
            node,
            `docker ps -a --format '{{.Names}}|{{.Image}}|{{.Status}}' 2>/dev/null`,
            4000
          );
          if (!stdout) return;
          for (const line of stdout.split('\n')) {
            const [cName, cImage] = line.trim().split('|');
            if (!cName) continue;
            const lower = cName.toLowerCase();
            if (
              lower.includes('discopanel') ||
              SERVERS_REGISTRY.some((s) => s.containerName === cName)
            ) {
              continue;
            }
            if (
              lower.includes('s2') ||
              lower.includes('season-2') ||
              lower.includes('season2') ||
              lower.includes('modpack') ||
              (cImage && cImage.toLowerCase().includes('itzg/minecraft-server'))
            ) {
              const sId = lower.replace(/^(petablocks-|pb-)/, '').replace(/[^a-z0-9-]/g, '-');
              if (!SERVERS_REGISTRY.some((s) => s.id === sId)) {
                SERVERS_REGISTRY.push({
                  id: sId,
                  nodeId: node.id,
                  name: cName.includes('s2') || cName.includes('season')
                    ? `PETABLOCKS Modpack Season 2 (${cName})`
                    : cName,
                  containerName: cName,
                  dataPath: `/home/user/data/servers/${cName}`,
                  gamePort: 25565,
                  rconPort: 25575,
                  rconHostPort: 25575,
                  rconPassword: process.env.RCON_PASSWORD || '',
                  type: 'NeoForge',
                  version: '1.21.1',
                  memory: '16G',
                  color: 'text-emerald-400',
                  border: 'border-emerald-500/30',
                });
              }
            }
          }
        } catch (_) {}
      })
  );

  for (const srv of SERVERS_REGISTRY) {
    const node = NODES[srv.nodeId];
    if (!node) continue;

    const dpSrv = dpByNodeAndId.get(`${srv.nodeId}:${srv.discopanelId || srv.id}`);
    if (dpSrv) {
      const statusRaw = String(dpSrv.status || '').toLowerCase();
      const isOnline = statusRaw.includes('running') || statusRaw.includes('unhealthy');
      const memUsedMb = dpSrv.memoryUsage ? Math.round(Number(dpSrv.memoryUsage)) : 0;
      const memMaxMb = dpSrv.memory ? Number(dpSrv.memory) : 8192;
      const cpuVal = dpSrv.cpuPercent ? `${Number(dpSrv.cpuPercent).toFixed(1)}%` : '0%';

      nodeServers.push({
        ...srv,
        discopanelManaged: true,
        discopanelId: dpSrv.id,
        online: isOnline,
        status: isOnline ? 'running' : statusRaw.replace('server_status_', '') || 'offline',
        startedAt: dpSrv.lastStarted || null,
        cpuUsage: cpuVal,
        memUsage: `${(memUsedMb / 1024).toFixed(1)}GiB / ${(memMaxMb / 1024).toFixed(1)}GiB`,
        tps: dpSrv.tps || null,
        playersOnline: dpSrv.playersOnline || 0,
        maxPlayers: dpSrv.maxPlayers || 20,
        motd: dpSrv.motd || '',
        worldSize: dpSrv.worldSize ? Number(dpSrv.worldSize) : 0,
        diskUsage: dpSrv.diskUsage ? Number(dpSrv.diskUsage) : 0,
        nodeName: node.name,
        nodeHost: node.host,
      });
      continue;
    }

    try {
      // Inspect docker container via SSH fallback
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
// Single server details (DiscoPanel RPC first, SSH Docker inspect fallback)
router.get('/servers/:id', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const dpId = srv.discopanelId || srv.id;
  try {
    const dpSrv = await discopanelClient.getServer(node, dpId);
    if (dpSrv) {
      srv.discopanelManaged = true;
      srv.discopanelId = dpSrv.id;
      return res.json({
        server: {
          ...srv,
          tps: dpSrv.tps || null,
          playersOnline: dpSrv.playersOnline || 0,
          maxPlayers: dpSrv.maxPlayers || 20,
          motd: dpSrv.motd || '',
          worldSize: dpSrv.worldSize ? Number(dpSrv.worldSize) : 0,
          diskUsage: dpSrv.diskUsage ? Number(dpSrv.diskUsage) : 0,
        },
        node,
        discopanel: dpSrv,
        container: {
          State: {
            Running: String(dpSrv.status || '').toLowerCase().includes('running'),
            Status: String(dpSrv.status || 'running').toLowerCase().replace('server_status_', ''),
            StartedAt: dpSrv.lastStarted || null,
          },
        },
      });
    }
  } catch (_) {}

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
// Power actions: start, stop, restart, recreate, kill
router.post('/servers/:id/power', async (req, res) => {
  const { action } = req.body; // 'start' | 'stop' | 'restart' | 'recreate' | 'kill'
  if (!['start', 'stop', 'restart', 'recreate', 'kill'].includes(action)) {
    return res.status(400).json({ error: "Invalid action. Expected 'start', 'stop', 'restart', 'recreate', or 'kill'" });
  }

  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const dpId = srv.discopanelId || srv.id;

  try {
    let usedDiscoPanel = false;
    let output = '';

    if (action !== 'kill') {
      try {
        if (action === 'start') await discopanelClient.startServer(node, dpId);
        else if (action === 'stop') await discopanelClient.stopServer(node, dpId);
        else if (action === 'restart') await discopanelClient.restartServer(node, dpId);
        else if (action === 'recreate') await discopanelClient.recreateServer(node, dpId);
        usedDiscoPanel = true;
        output = `Executed ${action} via DiscoPanel RPC on ${node.name}`;
      } catch (_) {
        // Fallback to SSH Docker command if not yet adopted in DiscoPanel
      }
    }

    if (!usedDiscoPanel) {
      if (action === 'recreate') {
        const { stdout: rOut } = await runSshCommand(node, `docker restart ${srv.containerName}`, 45000);
        output = rOut;
      } else {
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
        output = stdout;
      }
    }

    // Send Discord console lifecycle notification
    const actionColorMap = {
      start: 0x10b981,    // Green
      stop: 0x6b7280,     // Gray
      restart: 0xf59e0b,  // Amber
      recreate: 0x8b5cf6, // Purple
      kill: 0xef4444,     // Red
    };
    const actionTitleMap = {
      start: '🟢 Server Starting',
      stop: '🛑 Server Stopping',
      restart: '🔄 Server Restarting',
      recreate: '♻️ Server Container Recreating',
      kill: '⚠️ Server Force-Killed',
    };

    discordService.sendConsoleAlert(srv.id, {
      title: actionTitleMap[action] || `Server ${action}`,
      description: `Container \`${srv.containerName}\` was triggered to **${action}** via ${usedDiscoPanel ? 'DiscoPanel Agent' : 'Admin Portal'}.`,
      color: actionColorMap[action] || 0x3b82f6,
      fields: [
        { name: 'Node', value: node.name, inline: true },
        { name: 'Game Port', value: `${srv.gamePort}`, inline: true },
        { name: 'Allocated Memory', value: srv.memory, inline: true },
      ],
    });

    res.json({ success: true, action, serverId: srv.id, viaDiscoPanel: usedDiscoPanel, output });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/server-manager/servers/:id/logs ──────────────────────
// Returns latest N log lines (DiscoPanel RPC first, SSH Docker logs fallback)
router.get('/servers/:id/logs', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const lines = parseInt(req.query.lines || '200', 10);
  const dpId = srv.discopanelId || srv.id;

  try {
    const dpLogs = await discopanelClient.getServerLogs(node, dpId, lines);
    if (Array.isArray(dpLogs) && dpLogs.length > 0) {
      const formatted = dpLogs.map(entry => entry.message || '').join('\n');
      return res.json({ logs: formatted, structuredLogs: dpLogs, source: 'discopanel' });
    }
  } catch (_) {}

  try {
    const { stdout } = await runSshCommand(node, `docker logs --tail ${lines} ${srv.containerName} 2>&1`, 8000);
    res.json({ logs: stdout, source: 'ssh' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/server-manager/servers/:id/logs/mclogs ──────────────
// Uploads server logs to mclo.gs via DiscoPanel ServerService/UploadToMCLogs
router.post('/servers/:id/logs/mclogs', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const dpId = srv.discopanelId || srv.id;

  try {
    const result = await discopanelClient.uploadToMCLogs(node, dpId);
    res.json({ success: true, url: result.url });
  } catch (err) {
    res.status(500).json({ error: `mclo.gs upload failed: ${err.message}` });
  }
});

// ── POST /api/server-manager/servers/:id/command ──────────────────
// Sends command via DiscoPanel SendCommand, direct RCON, or docker exec rcon-cli
router.post('/servers/:id/command', async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'Command is required' });

  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const dpId = srv.discopanelId || srv.id;

  // 1. Try DiscoPanel SendCommand RPC first
  try {
    const dpRes = await discopanelClient.sendCommand(node, dpId, command, false);
    if (dpRes && dpRes.success) {
      return res.json({ response: dpRes.output || 'Command executed via DiscoPanel' });
    }
  } catch (_) {}

  // 2. Try RCON directly
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
    // 3. Fallback to docker exec rcon-cli inside container
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
// Browse server files and directories (DiscoPanel FileService first, SSH fallback)
router.get('/servers/:id/files', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const reqSubpath = (req.query.path || '').replace(/\.\./g, ''); // Prevent path traversal
  const dpId = srv.discopanelId || srv.id;

  try {
    const dpFiles = await discopanelClient.listFiles(node, dpId, reqSubpath, false);
    if (Array.isArray(dpFiles)) {
      const items = dpFiles.map(f => ({
        name: f.name,
        path: f.path || (reqSubpath ? `${reqSubpath}/${f.name}` : f.name),
        isDir: Boolean(f.isDir),
        size: Number(f.size || 0),
        modified: Number(f.modified || 0),
        isEditable: Boolean(f.isEditable),
      }));
      items.sort((a, b) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });
      return res.json({ path: reqSubpath, items, source: 'discopanel' });
    }
  } catch (_) {}

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
// Read file content for in-browser editor (DiscoPanel FileService first, SSH fallback)
router.get('/servers/:id/files/content', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const reqFile = (req.query.file || '').replace(/\.\./g, '');
  const dpId = srv.discopanelId || srv.id;

  try {
    const dpFile = await discopanelClient.getFile(node, dpId, reqFile);
    return res.json({ file: reqFile, content: dpFile.content, source: 'discopanel' });
  } catch (_) {}

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
// Save file content back to disk (DiscoPanel FileService first, SSH fallback)
router.post('/servers/:id/files/save', async (req, res) => {
  const { file, content } = req.body;
  if (!file || content === undefined) return res.status(400).json({ error: 'File path and content are required' });

  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const reqFile = file.replace(/\.\./g, '');
  const dpId = srv.discopanelId || srv.id;

  try {
    await discopanelClient.updateFile(node, dpId, reqFile, content);
    return res.json({ success: true, file: reqFile, source: 'discopanel' });
  } catch (_) {}

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

// ── POST /api/server-manager/servers/:id/files/folder ─────────────
// Create new folder in server directory
router.post('/servers/:id/files/folder', async (req, res) => {
  const { path: folderPath } = req.body;
  if (!folderPath) return res.status(400).json({ error: 'Folder path is required' });

  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const cleanPath = folderPath.replace(/\.\./g, '');
  const dpId = srv.discopanelId || srv.id;

  try {
    await discopanelClient.createFolder(node, dpId, cleanPath);
    return res.json({ success: true, path: cleanPath });
  } catch (_) {}

  try {
    const targetDir = path.posix.join(srv.dataPath, cleanPath);
    await runSshCommand(node, `mkdir -p '${targetDir}'`, 8000);
    res.json({ success: true, path: cleanPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/server-manager/servers/:id/files/extract ────────────
// Extract zip/tar.gz archive via DiscoPanel FileService or SSH fallback
router.post('/servers/:id/files/extract', async (req, res) => {
  const { path: archivePath } = req.body;
  if (!archivePath) return res.status(400).json({ error: 'Archive path is required' });

  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const cleanPath = archivePath.replace(/\.\./g, '');
  const dpId = srv.discopanelId || srv.id;

  try {
    const result = await discopanelClient.extractArchive(node, dpId, cleanPath);
    return res.json({ success: true, path: cleanPath, result });
  } catch (_) {}

  try {
    const fullPath = path.posix.join(srv.dataPath, cleanPath);
    const destDir = path.posix.dirname(fullPath);
    const cmd = cleanPath.endsWith('.zip')
      ? `unzip -o '${fullPath}' -d '${destDir}'`
      : `tar -xzf '${fullPath}' -C '${destDir}'`;
    const { code, stderr } = await runSshCommand(node, cmd, 30000);
    if (code !== 0) return res.status(500).json({ error: stderr || 'Extraction failed' });
    res.json({ success: true, path: cleanPath });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/server-manager/servers/:id/files/archive ────────────
// Create a zip archive from selected paths via DiscoPanel FileService or SSH fallback
router.post('/servers/:id/files/archive', async (req, res) => {
  const { paths = [], archiveName = 'archive.zip' } = req.body;
  if (!Array.isArray(paths) || paths.length === 0) {
    return res.status(400).json({ error: 'At least one path is required' });
  }

  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const dpId = srv.discopanelId || srv.id;

  try {
    const result = await discopanelClient.createArchive(node, dpId, paths, archiveName);
    return res.json({ success: true, archiveName, result });
  } catch (_) {}

  try {
    const safeTargets = paths.map(p => `'${p.replace(/\.\./g, '')}'`).join(' ');
    const safeArchive = archiveName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const cmd = `cd '${srv.dataPath}' && zip -r '${safeArchive}' ${safeTargets}`;
    const { code, stderr } = await runSshCommand(node, cmd, 30000);
    if (code !== 0) return res.status(500).json({ error: stderr || 'Archive creation failed' });
    res.json({ success: true, archiveName: safeArchive });
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

// ── GET /api/server-manager/servers/:id/telemetry ──────────────────
// Returns telemetry companion mod/plugin status, installed version, and gateway status
router.get('/servers/:id/telemetry', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  try {
    const status = await telemetryInstaller.getTelemetryStatus(srv, node, runSshCommand, modConnectedSockets);
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/server-manager/servers/:id/telemetry/install ─────────
// Installs or updates telemetry mod/plugin, generates config if missing, optional restart
router.post('/servers/:id/telemetry/install', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const { restartImmediately } = req.body || {};

  try {
    const result = await telemetryInstaller.installOrUpdateTelemetry(srv, node, { restartImmediately }, runSshCommand);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/server-manager/servers/:id/telemetry/config ───────────
// Reads current configuration file for the server's telemetry mod
router.get('/servers/:id/telemetry/config', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  try {
    const config = await telemetryInstaller.getTelemetryConfig(srv, node, runSshCommand);
    res.json({ config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/server-manager/servers/:id/telemetry/config ──────────
// Writes updated configuration for the server's telemetry mod
router.post('/servers/:id/telemetry/config', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const { config } = req.body;
  if (!config || typeof config !== 'object') {
    return res.status(400).json({ error: 'Invalid config payload' });
  }

  try {
    await telemetryInstaller.saveTelemetryConfig(srv, node, config, runSshCommand);
    res.json({ success: true, message: 'Configuration updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/server-manager/telemetry/fleet-status ─────────────────
// Batch status check across all registered servers
router.get('/telemetry/fleet-status', async (_req, res) => {
  const manifest = telemetryInstaller.getManifest();
  const activeServers = SERVERS_REGISTRY.filter(s => !s.archived);

  const statuses = await Promise.all(
    activeServers.map(async (srv) => {
      const node = NODES[srv.nodeId];
      if (!node) return { serverId: srv.id, status: 'error', error: 'Node not found' };
      try {
        return await telemetryInstaller.getTelemetryStatus(srv, node, runSshCommand, modConnectedSockets);
      } catch (err) {
        return { serverId: srv.id, serverName: srv.name, status: 'error', error: err.message };
      }
    })
  );

  const outdatedCount = statuses.filter(s => s.status === 'update_available').length;
  const notInstalledCount = statuses.filter(s => s.status === 'not_installed').length;

  res.json({
    latestVersion: manifest.latestVersion,
    releaseDate: manifest.releaseDate,
    servers: statuses,
    outdatedCount,
    notInstalledCount,
  });
});

// ── POST /api/server-manager/telemetry/fleet-update ────────────────
// Batch update all or specified servers across nodes
router.post('/telemetry/fleet-update', async (req, res) => {
  const { serverIds, restartImmediately } = req.body || {};
  const activeServers = SERVERS_REGISTRY.filter(s => !s.archived && (!serverIds || serverIds.includes(s.id)));

  const results = [];
  for (const srv of activeServers) {
    const node = NODES[srv.nodeId];
    if (!node) {
      results.push({ serverId: srv.id, success: false, error: 'Node config missing' });
      continue;
    }

    try {
      const resData = await telemetryInstaller.installOrUpdateTelemetry(srv, node, { restartImmediately }, runSshCommand);
      results.push(resData);
    } catch (err) {
      results.push({ serverId: srv.id, success: false, error: err.message });
    }
  }

  res.json({
    success: true,
    totalAttempted: activeServers.length,
    results,
  });
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
// Provisions a brand new Minecraft server container via DiscoPanel CreateServer RPC (with SSH fallback)
router.post('/servers/create', async (req, res) => {
  const {
    name,
    serverId,
    nodeId = 'mcs-01',
    loader = 'NEOFORGE', // NEOFORGE | FABRIC | FORGE | VANILLA | PAPER | MODRINTH | AUTO_CURSEFORGE
    mcVersion = '1.21.1',
    memory = '8G',
    gamePort = 11700,
    maxPlayers = 20,
    rconPort = 25575,
    rconPassword = 'pb_rcon_' + Math.random().toString(36).substring(2, 10),
    motd = 'A PETABLOCKS Minecraft Server',
    modpackId = '',
    modpackVersionId = '',
    startImmediately = true,
  } = req.body;

  if (!name || !serverId) {
    return res.status(400).json({ error: 'Server name and server ID are required' });
  }

  const node = NODES[nodeId];
  if (!node) return res.status(400).json({ error: `Node '${nodeId}' not found` });

  const cleanId = serverId.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  const memMb = parseInt(String(memory).replace(/[^0-9]/g, ''), 10) * (String(memory).toUpperCase().includes('G') ? 1024 : 1) || 8192;

  // 1. Try DiscoPanel CreateServer RPC first
  try {
    const dpServer = await discopanelClient.createServer(node, {
      name,
      description: motd,
      modLoader: discopanelClient.toProtoLoaderEnum(loader),
      mcVersion,
      port: parseInt(gamePort, 10),
      maxPlayers: parseInt(maxPlayers, 10) || 20,
      memory: memMb,
      autoStart: true,
      detached: true,
      startImmediately: Boolean(startImmediately),
      modpackId: modpackId || '',
      modpackVersionId: modpackVersionId || '',
    });

    if (dpServer) {
      const entry = upsertDiscoveredServer(nodeId, dpServer);
      return res.json({
        success: true,
        viaDiscoPanel: true,
        server: entry,
        discopanelServer: dpServer,
      });
    }
  } catch (dpErr) {
    console.warn(`[SERVER-CREATE] DiscoPanel RPC fallback to SSH on ${nodeId}:`, dpErr.message);
  }

  // 2. SSH Fallback
  const containerName = `petablocks-server-${cleanId}`;
  const dataPath = path.posix.join(node.baseDataDir, cleanId);

  let javaTag = 'java21';
  let typeEnv = loader.toUpperCase();

  if (['1.16', '1.17'].some(v => mcVersion.startsWith(v))) javaTag = 'java16';
  else if (['1.18', '1.19', '1.20'].some(v => mcVersion.startsWith(v))) javaTag = 'java17';

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
  -e RCON_PORT=${rconPort} \
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

// ══════════════════════════════════════════════════════════════════
// DISCOPANEL INTEGRATION ENDPOINTS (Adoption, Config, Modpacks, Modules, Safe Update)
// ══════════════════════════════════════════════════════════════════

// ── POST /api/server-manager/discopanel/adopt-all ─────────────────
// Triggers non-destructive container discovery & adoption across all game nodes
router.post('/discopanel/adopt-all', async (_req, res) => {
  const results = {};
  await Promise.all(
    Object.values(NODES)
      .filter((n) => n.id.startsWith('mcs-'))
      .map(async (node) => {
        try {
          const adoptRes = await discopanelClient.adoptNodeContainers(node);
          const list = await discopanelClient.listServers(node, true).catch(() => []);
          for (const dpSrv of list) {
            upsertDiscoveredServer(node.id, dpSrv);
          }
          results[node.id] = {
            online: true,
            adopted: adoptRes.adopted || [],
            updated: adoptRes.updated || [],
            totalManaged: list.length,
          };
        } catch (err) {
          results[node.id] = {
            online: false,
            error: err.message,
          };
        }
      })
  );
  res.json({ success: true, nodes: results });
});

// ── GET /api/server-manager/discopanel/status ─────────────────────
// Checks DiscoPanel agent connectivity across all game nodes
router.get('/discopanel/status', async (_req, res) => {
  const status = {};
  await Promise.all(
    Object.values(NODES)
      .filter((n) => n.id.startsWith('mcs-'))
      .map(async (node) => {
        status[node.id] = await discopanelClient.checkAgentHealth(node);
      })
  );
  res.json({ nodes: status });
});

// ── GET /api/server-manager/servers/:id/config ────────────────────
// Retrieves categorized itzg/minecraft-server configuration from DiscoPanel ConfigService
router.get('/servers/:id/config', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const dpId = srv.discopanelId || srv.id;

  try {
    const categories = await discopanelClient.getServerConfig(node, dpId);
    res.json({ categories, source: 'discopanel' });
  } catch (err) {
    // Fallback: inspect container Env over SSH
    try {
      const { stdout } = await runSshCommand(
        node,
        `docker inspect ${srv.containerName} --format '{{json .Config.Env}}' 2>/dev/null`,
        5000
      );
      const envs = JSON.parse(stdout || '[]');
      const properties = envs.map((line) => {
        const idx = line.indexOf('=');
        const key = idx > 0 ? line.slice(0, idx) : line;
        const val = idx > 0 ? line.slice(idx + 1) : '';
        return {
          key,
          envVar: key,
          label: key,
          value: val,
          type: 'text',
          description: `Container environment variable (${key})`,
        };
      });
      res.json({
        categories: [{ name: 'Container Environment', properties }],
        source: 'ssh-fallback',
      });
    } catch (sshErr) {
      res.status(500).json({ error: err.message });
    }
  }
});

// ── POST /api/server-manager/servers/:id/config ───────────────────
// Updates server environment variables via DiscoPanel ConfigService (+ optional recreate)
router.post('/servers/:id/config', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const dpId = srv.discopanelId || srv.id;
  const { updates = {}, recreate = false } = req.body || {};

  try {
    const categories = await discopanelClient.updateServerConfig(node, dpId, updates);
    if (recreate) {
      await discopanelClient.recreateServer(node, dpId);
    }
    res.json({ success: true, categories, recreated: Boolean(recreate) });
  } catch (err) {
    res.status(500).json({ error: `Failed to update server config via DiscoPanel: ${err.message}` });
  }
});

// ── GET /api/server-manager/modpacks/search ───────────────────────
// Searches Modrinth or CurseForge modpacks via DiscoPanel ModpackService (with direct Modrinth API fallback)
router.get('/modpacks/search', async (req, res) => {
  const {
    nodeId = 'mcs-01',
    query = '',
    gameVersion = '',
    modLoader = '',
    indexer = 'modrinth',
    page = '1',
    pageSize = '20',
  } = req.query;

  const node = NODES[nodeId] || NODES['mcs-01'];

  try {
    // Sync from upstream indexer first if query is provided
    await discopanelClient.syncModpacks(node, {
      query: String(query),
      gameVersion: String(gameVersion),
      modLoader: String(modLoader),
      indexer: String(indexer),
    }).catch(() => {});

    const searchRes = await discopanelClient.searchModpacks(node, {
      query: String(query),
      gameVersion: String(gameVersion),
      modLoader: String(modLoader),
      indexer: String(indexer),
      page: parseInt(String(page), 10) || 1,
      pageSize: parseInt(String(pageSize), 10) || 20,
    });
    return res.json({ ...searchRes, source: 'discopanel' });
  } catch (dpErr) {
    // Direct Modrinth v2 REST API fallback when DiscoPanel agent isn't online yet
    if (indexer === 'modrinth') {
      try {
        const facets = [['project_type:modpack']];
        if (gameVersion) facets.push([`versions:${gameVersion}`]);
        if (modLoader) facets.push([`categories:${String(modLoader).toLowerCase()}`]);
        const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(String(query))}&facets=${encodeURIComponent(JSON.stringify(facets))}&limit=${pageSize}`;
        const r = await fetch(url, { headers: { 'User-Agent': 'PETABLOCKS-Admin/2.19.0' } });
        const data = await r.json();
        const modpacks = (data.hits || []).map((h) => ({
          id: `modrinth-${h.project_id}`,
          indexerId: h.project_id,
          indexer: 'modrinth',
          name: h.title,
          slug: h.slug,
          summary: h.description,
          logoUrl: h.icon_url,
          websiteUrl: `https://modrinth.com/modpack/${h.slug}`,
          downloadCount: h.downloads,
          gameVersions: JSON.stringify(h.versions || []),
          modLoaders: JSON.stringify(h.display_categories || []),
          mcVersion: gameVersion || (h.versions && h.versions[h.versions.length - 1]) || '1.21.1',
        }));
        return res.json({ modpacks, total: data.total_hits || modpacks.length, page: 1, pageSize: 20, source: 'modrinth-direct' });
      } catch (mrErr) {
        return res.status(500).json({ error: mrErr.message });
      }
    }
    res.status(500).json({ error: dpErr.message });
  }
});

// ── GET /api/server-manager/modpacks/:modpackId/versions ──────────
// Lists available versions/files for a Modrinth or CurseForge modpack
router.get('/modpacks/:modpackId/versions', async (req, res) => {
  const { nodeId = 'mcs-01', gameVersion = '', modLoader = '' } = req.query;
  const { modpackId } = req.params;
  const node = NODES[nodeId] || NODES['mcs-01'];

  try {
    const versions = await discopanelClient.getModpackVersions(node, {
      id: modpackId,
      gameVersion: String(gameVersion),
      modLoader: String(modLoader),
    });
    return res.json({ versions, source: 'discopanel' });
  } catch (dpErr) {
    // Direct Modrinth fallback if modpackId starts with modrinth-
    const rawProjectId = modpackId.replace(/^modrinth-/, '');
    try {
      const r = await fetch(`https://api.modrinth.com/v2/project/${encodeURIComponent(rawProjectId)}/version`, {
        headers: { 'User-Agent': 'PETABLOCKS-Admin/2.19.0' },
      });
      const list = await r.json();
      const versions = Array.isArray(list)
        ? list.map((v, idx) => ({
            id: v.id,
            displayName: `${v.name} (${v.version_number})`,
            versionNumber: v.version_number,
            releaseType: v.version_type || 'release',
            fileDate: v.date_published,
            sortIndex: idx,
            gameVersions: v.game_versions || [],
            loaders: v.loaders || [],
          }))
        : [];
      return res.json({ versions, source: 'modrinth-direct' });
    } catch (_) {
      return res.status(500).json({ error: dpErr.message });
    }
  }
});

// ── POST /api/server-manager/servers/:id/modpack-update ───────────
// Safe Modpack & Version Update Pipeline:
//   1. Optional in-game /tellraw warning + flush world save (/save-all flush)
//   2. Pre-update MinIO S3 backup snapshot (full or world)
//   3. DiscoPanel UpdateServer + RecreateServer (or Config update + container recreate)
//   4. Ensure PETABLOCKS Telemetry Companion mod & config
router.post('/servers/:id/modpack-update', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  if (!node) return res.status(404).json({ error: 'Node not found' });

  const {
    modpackId = '',
    modpackVersionId = '',
    mcVersion = srv.version,
    modLoader = srv.type,
    preBackup = true,
    backupType = 'world',
    announceInGame = true,
  } = req.body || {};

  const dpId = srv.discopanelId || srv.id;
  const steps = [];

  try {
    // Step 1: In-game announcement & world save flush
    if (announceInGame) {
      try {
        const msg = JSON.stringify([
          '',
          { text: '[', color: 'dark_gray' },
          { text: 'PETABLOCKS', color: 'aqua', bold: true },
          { text: '] ', color: 'dark_gray' },
          { text: `Preparing server update (${modpackVersionId || mcVersion})... Saving world & creating S3 snapshot!`, color: 'yellow' },
        ]);
        await sendRconCommand(node.host, srv.rconHostPort, srv.rconPassword, `tellraw @a ${msg}`).catch(() => {});
        await sendRconCommand(node.host, srv.rconHostPort, srv.rconPassword, 'save-all flush').catch(() => {});
        steps.push({ step: 'save_flush', status: 'completed', detail: 'Broadcasted in-game notice and flushed world save.' });
      } catch (e) {
        steps.push({ step: 'save_flush', status: 'skipped', detail: e.message });
      }
    }

    // Step 2: Pre-update MinIO S3 Snapshot
    let backupRecord = null;
    if (preBackup) {
      try {
        backupRecord = await runBackupJob({
          serverId: srv.id,
          backupType: backupType === 'full' ? 'full' : 'world',
          createdBy: 'modpack-updater',
          customConfig: {
            name: srv.name,
            sshHost: node.host,
            sshPort: node.port,
            sshUser: node.user,
            serverDataPath: srv.dataPath,
            worldDirs: ['world'],
            worldName: 'world',
          },
        });
        steps.push({
          step: 's3_backup',
          status: 'completed',
          detail: `Archived to MinIO S3 (${backupRecord.minio_key}, ${(backupRecord.size_bytes / (1024 * 1024)).toFixed(1)} MB)`,
          minioKey: backupRecord.minio_key,
        });
      } catch (bkErr) {
        steps.push({ step: 's3_backup', status: 'warning', detail: `Backup warning: ${bkErr.message}` });
      }
    }

    // Step 3: DiscoPanel UpdateServer & RecreateServer
    let updatedViaDiscoPanel = false;
    try {
      await discopanelClient.updateServer(node, {
        id: dpId,
        name: srv.name,
        description: srv.description || '',
        maxPlayers: 20,
        memory: parseInt(String(srv.memory).replace(/[^0-9]/g, ''), 10) * 1024 || 12288,
        modLoader: String(modLoader).toLowerCase(),
        mcVersion: String(mcVersion),
        modpackId: String(modpackId),
        modpackVersionId: String(modpackVersionId),
      });
      await discopanelClient.recreateServer(node, dpId);
      updatedViaDiscoPanel = true;
      steps.push({
        step: 'discopanel_recreate',
        status: 'completed',
        detail: `Updated server definition & recreated container via DiscoPanel (${modpackId || modLoader} @ ${modpackVersionId || mcVersion}).`,
      });
    } catch (dpErr) {
      steps.push({
        step: 'discopanel_recreate',
        status: 'fallback',
        detail: `DiscoPanel RPC unavailable (${dpErr.message}); restarting container over SSH.`,
      });
      await runSshCommand(node, `docker restart ${srv.containerName}`, 45000);
    }

    // Step 4: Ensure PETABLOCKS Telemetry Companion JAR & Config are installed
    try {
      const telRes = await telemetryInstaller.installOrUpdateTelemetry(srv, node, { restartImmediately: false }, runSshCommand);
      steps.push({
        step: 'telemetry_companion',
        status: 'completed',
        detail: `Verified Telemetry Companion (${telRes.filename}).`,
      });
    } catch (telErr) {
      steps.push({ step: 'telemetry_companion', status: 'warning', detail: telErr.message });
    }

    discordService.sendConsoleAlert(srv.id, {
      title: '🚀 Modpack / Server Version Updated',
      description: `**${srv.name}** was updated via the PETABLOCKS × DiscoPanel pipeline.`,
      color: 0x10b981,
      fields: [
        { name: 'Node', value: node.name, inline: true },
        { name: 'Target Version', value: `${modpackVersionId || mcVersion}`, inline: true },
        { name: 'Pre-Update S3 Backup', value: backupRecord ? `✅ \`${backupRecord.minio_key}\`` : 'Skipped', inline: false },
      ],
    });

    res.json({
      success: true,
      serverId: srv.id,
      updatedViaDiscoPanel,
      backup: backupRecord,
      steps,
    });
  } catch (err) {
    res.status(500).json({ error: err.message, steps });
  }
});

// ── GET /api/server-manager/servers/:id/modules ───────────────────
// Lists attached sidecar modules & available module templates from DiscoPanel ModuleService
router.get('/servers/:id/modules', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const dpId = srv.discopanelId || srv.id;

  try {
    const [modules, templates] = await Promise.all([
      discopanelClient.listModules(node, dpId).catch(() => []),
      discopanelClient.listModuleTemplates(node).catch(() => []),
    ]);
    res.json({ modules, templates, source: 'discopanel' });
  } catch (err) {
    res.json({ modules: [], templates: [], error: err.message });
  }
});

// ── POST /api/server-manager/servers/:id/modules ──────────────────
// Creates and attaches a new sidecar module instance to the server
router.post('/servers/:id/modules', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const dpId = srv.discopanelId || srv.id;
  const { templateId, name, config = {}, autoStart = true, startImmediately = true } = req.body || {};

  if (!templateId || !name) {
    return res.status(400).json({ error: 'templateId and module name are required' });
  }

  try {
    const created = await discopanelClient.createModule(node, {
      serverId: dpId,
      templateId,
      name,
      config: typeof config === 'string' ? config : JSON.stringify(config),
      autoStart: Boolean(autoStart),
      startImmediately: Boolean(startImmediately),
    });
    res.json({ success: true, module: created.module || created });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/server-manager/servers/:id/modules/:moduleId/power ──
// Power actions on a sidecar module: start, stop, restart, delete
router.post('/servers/:id/modules/:moduleId/power', async (req, res) => {
  const srv = SERVERS_REGISTRY.find(s => s.id === req.params.id);
  if (!srv) return res.status(404).json({ error: 'Server not found' });

  const node = NODES[srv.nodeId];
  const { moduleId } = req.params;
  const { action } = req.body;

  try {
    if (action === 'start') await discopanelClient.startModule(node, moduleId);
    else if (action === 'stop') await discopanelClient.stopModule(node, moduleId);
    else if (action === 'restart') await discopanelClient.restartModule(node, moduleId);
    else if (action === 'delete') await discopanelClient.deleteModule(node, moduleId);
    else return res.status(400).json({ error: 'Invalid module action' });

    res.json({ success: true, moduleId, action });
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

// Scheduled Restarts API
router.get('/restarts/status', async (req, res) => {
  try {
    const scheduledRestartService = require('../services/scheduledRestartService');
    const status = await scheduledRestartService.getStatus();
    res.json({ success: true, ...status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/restarts/trigger', async (req, res) => {
  try {
    const { serverId } = req.body;
    if (!serverId) return res.status(400).json({ error: 'serverId required' });
    const scheduledRestartService = require('../services/scheduledRestartService');
    const result = scheduledRestartService.triggerManualRestart(serverId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/server-manager/logs/fleet-search ──────────────────────
// Centralized multi-node Minecraft log querying and incident parsing
router.get('/logs/fleet-search', async (req, res) => {
  try {
    const fleetLogsService = require('../services/fleetLogsService');
    const { query, isRegex, servers, severity, limit, tailLines } = req.query;
    
    let serverList = ['lobby-main', 'velocity-proxy', 'create-2', 'patreon-creative'];
    if (servers) {
      serverList = typeof servers === 'string' ? servers.split(',').map((s) => s.trim()) : servers;
    }

    const data = await fleetLogsService.searchFleetLogs({
      query: query || '',
      isRegex: isRegex === 'true' || isRegex === true,
      servers: serverList,
      severity: severity || 'ALL',
      limit: parseInt(limit, 10) || 150,
      tailLines: parseInt(tailLines, 10) || 1500,
    });

    res.json(data);
  } catch (err) {
    console.error('[FleetLogs] Search error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── COMMUNITY EVENTS & IN-GAME BROADCASTS API ───────────────────────
router.get('/events', async (req, res) => {
  try {
    const communityEventsService = require('../services/communityEventsService');
    const events = await communityEventsService.getEvents(req.query.status);
    res.json({ success: true, events });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/events', async (req, res) => {
  try {
    const communityEventsService = require('../services/communityEventsService');
    const result = await communityEventsService.createEvent(req.body);
    res.json({ success: true, event: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.patch('/events/:id', async (req, res) => {
  try {
    const communityEventsService = require('../services/communityEventsService');
    const result = await communityEventsService.updateEvent(req.params.id, req.body);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/events/:id/announce', async (req, res) => {
  try {
    const communityEventsService = require('../services/communityEventsService');
    const result = await communityEventsService.announceEvent(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/broadcasts', async (_req, res) => {
  try {
    const autoBroadcastService = require('../services/autoBroadcastService');
    const broadcasts = await autoBroadcastService.getBroadcasts();
    res.json({ success: true, broadcasts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/broadcasts', async (req, res) => {
  try {
    const { message, server_id, interval_minutes } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });
    const autoBroadcastService = require('../services/autoBroadcastService');
    const result = await autoBroadcastService.addBroadcast(message, server_id || 'ALL', interval_minutes || 30);
    res.json({ success: true, broadcast: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.patch('/broadcasts/:id/toggle', async (req, res) => {
  try {
    const { is_active } = req.body;
    const autoBroadcastService = require('../services/autoBroadcastService');
    const result = await autoBroadcastService.toggleBroadcast(req.params.id, Boolean(is_active));
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/broadcasts/:id', async (req, res) => {
  try {
    const autoBroadcastService = require('../services/autoBroadcastService');
    const result = await autoBroadcastService.deleteBroadcast(req.params.id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
module.exports.NODES = NODES;
module.exports.SERVERS_REGISTRY = SERVERS_REGISTRY;
module.exports.runSshCommand = runSshCommand;
module.exports.checkPortOpen = checkPortOpen;
