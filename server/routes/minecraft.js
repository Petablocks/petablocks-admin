const { Router } = require('express');
const net = require('net');
const dns = require('dns').promises;
const mysql = require('mysql2/promise');
const WebSocket = require('ws');
const { Client: SshClient } = require('ssh2');
const discordService = require('../services/discordWebhookService');
const playerAnalyticsService = require('../services/playerAnalyticsService');

const router = Router();

const DEFAULT_SSH_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACCK5B91oPhc74Q3AdMwmLpLG6hXVfEeNuQ5JZvyz3ndVgAAAJgVjzhhFY84
YQAAAAtzc2gtZWQyNTUxOQAAACCK5B91oPhc74Q3AdMwmLpLG6hXVfEeNuQ5JZvyz3ndVg
AAAECp+nVXQqH10GUgYHqZx6pBarI7yiqEv2H+pCrx0Zu8xYrkH3Wg+FzvhDcB0zCYuksb
qFdV8R425Dklm/LPed1WAAAAFXBldGFibG9ja3MtbWNzLWFjY2Vzcw==
-----END OPENSSH PRIVATE KEY-----`;

const API_SECRET_TOKEN = process.env.API_SECRET_TOKEN || '845e2b760f51a817c654b03e44c77428bac53c6059129049388d8017f2abf728';

const SERVERS = [
  {
    id: 'fabric-main',
    modServerId: 'modpack-fabric',
    name: 'PETABLOCKS Modpack Server',
    host: process.env.MC_FABRIC_HOST || 'play.petablocks.com',
    port: parseInt(process.env.MC_FABRIC_PORT || '11691', 10),
    displayHost: 'play.petablocks.com',
    rconHost: process.env.MC_FABRIC_RCON_HOST || '10.20.110.118',
    rconPort: parseInt(process.env.MC_FABRIC_RCON_PORT || '16901', 10),
    rconPassword: process.env.MC_FABRIC_RCON_PASSWORD || 'P3tabl0cksrc0n!!',
    containerName: 'petablocks-modpack-main',
    type: 'fabric',
    version: '1.20.1',
    description: 'Main Fabric 1.20.1 Modpack Server (Plan & LuckPerms DB)',
  },
  {
    id: 'create-2',
    modServerId: 'create2-smp',
    name: 'PETABLOCKS Create 2',
    host: process.env.MC_CREATE2_HOST || 'create2.petablocks.com',
    port: parseInt(process.env.MC_CREATE2_PORT || '11681', 10),
    displayHost: 'create2.petablocks.com',
    rconHost: process.env.MC_CREATE2_RCON_HOST || '10.20.110.115',
    rconPort: parseInt(process.env.MC_CREATE2_RCON_PORT || '11691', 10),
    rconPassword: process.env.MC_CREATE2_RCON_PASSWORD || 'discopanel_451a2727',
    containerName: 'petablocks-create-2',
    logPath: '/home/user/data/servers/petablocks_create_2_451a2727-49f0-4629-86fe-b22e93ef67e5/logs/latest.log',
    type: 'neoforge',
    version: '1.21.1',
    description: 'NeoForge 1.21.1 Create 2 SMP Server',
  },
  {
    id: 'create-patreon',
    modServerId: 'patreon-creative',
    name: 'PETABLOCKS Patreon Server',
    host: process.env.MC_PATREON_HOST || 'createcreative.petablocks.com',
    port: parseInt(process.env.MC_PATREON_PORT || '11651', 10),
    displayHost: 'createcreative.petablocks.com',
    rconHost: process.env.MC_PATREON_RCON_HOST || '10.20.110.120',
    rconPort: parseInt(process.env.MC_PATREON_RCON_PORT || '11661', 10),
    rconPassword: process.env.MC_PATREON_RCON_PASSWORD || 'discopanel_a91d1a56',
    containerName: 'petablocks-patreon-creative',
    logPath: '/home/user/data/servers/patreon_create_server_a91d1a56-6130-4daa-88c9-3f7a1082dcb4/logs/latest.log',
    type: 'neoforge',
    version: '1.21.1',
    description: 'NeoForge 1.21.1 Whitelisted Patreon Creative Server',
  },
];

// Cache for background Spark metrics
const sparkTelemetryCache = new Map();

// Helper to scrape latest Spark tick metrics over SSH2
async function fetchSparkMetrics(srv) {
  if (!srv.logPath) return null;
  return new Promise((resolve) => {
    const conn = new SshClient();
    let stdout = '';
    const timer = setTimeout(() => {
      conn.end();
      resolve(null);
    }, 4000);

    conn.on('ready', () => {
      conn.exec(`grep -iE 'Average:|included GC lasting' '${srv.logPath}' | tail -n 10`, (err, stream) => {
        if (err) {
          clearTimeout(timer);
          conn.end();
          return resolve(null);
        }
        stream.on('data', d => stdout += d.toString());
        stream.on('close', () => {
          clearTimeout(timer);
          conn.end();

          const avgMatch = stdout.match(/Average:\s+([\d\.]+)ms/);
          const gcMatches = [...stdout.matchAll(/included GC lasting\s+(\d+)\s+ms/g)];
          let gcTotalLastMin = 0;
          for (const m of gcMatches) {
            gcTotalLastMin += parseInt(m[1], 10);
          }

          if (avgMatch) {
            const mspt = parseFloat(avgMatch[1]);
            const tps = Math.min(20.0, Math.max(0.1, 1000.0 / mspt));
            resolve({
              tps: parseFloat(tps.toFixed(1)),
              mspt: parseFloat(mspt.toFixed(1)),
              gcPauseMs: gcTotalLastMin,
              source: 'spark-logs',
            });
          } else {
            resolve(null);
          }
        });
      });
    });

    conn.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });

    conn.connect({
      host: '10.20.110.115',
      port: 22,
      username: 'root',
      privateKey: process.env.MC_SSH_PRIVATE_KEY || DEFAULT_SSH_KEY,
      readyTimeout: 3000,
    });
  });
}

// In-Memory Circular Console Log Buffers (up to 500 lines per server)
const serverLogBuffers = {
  'fabric-main': [],
  'create-2': [],
  'create-patreon': [],
};

const sseClients = new Set();
const modConnectedSockets = new Map();
const modTelemetryStore = new Map();
const pendingCommandCallbacks = new Map();

function normalizeServerId(rawId) {
  if (!rawId) return 'fabric-main';
  const match = SERVERS.find(s => s.id === rawId || s.modServerId === rawId);
  return match ? match.id : rawId;
}

function addServerLog(serverId, level, message, source = 'Server') {
  const normId = normalizeServerId(serverId);
  const timestamp = new Date().toISOString();
  const timeFormatted = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    serverId: normId,
    timestamp,
    time: timeFormatted,
    level,
    message,
    source,
  };

  if (!serverLogBuffers[normId]) serverLogBuffers[normId] = [];
  serverLogBuffers[normId].push(entry);
  if (serverLogBuffers[normId].length > 500) {
    serverLogBuffers[normId].shift();
  }

  const sseData = `data: ${JSON.stringify(entry)}\n\n`;
  for (const client of sseClients) {
    if (!client.targetServerId || client.targetServerId === 'all' || client.targetServerId === normId) {
      client.res.write(sseData);
    }
  }
}

for (const srv of SERVERS) {
  addServerLog(srv.id, 'INFO', `Initialized telemetry listener for ${srv.name} (${srv.displayHost})`, 'System');
}

function initWebSocket(httpServer) {
  const wss = new WebSocket.Server({ noServer: true });

  httpServer.on('upgrade', (request, socket, head) => {
    const pathname = request.url ? request.url.split('?')[0] : '';
    if (pathname === '/ws/servers/bridge') {
      const authHeader = request.headers['authorization'];
      const rawServerId = request.headers['x-server-id'];

      if (!authHeader || authHeader !== `Bearer ${API_SECRET_TOKEN}`) {
        console.warn(`[TELEMETRY-BRIDGE] Rejected unauthorized connection from ${request.socket.remoteAddress}`);
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      if (!rawServerId) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  wss.on('connection', (ws, req) => {
    const rawServerId = req.headers['x-server-id'];
    const serverName = req.headers['x-server-name'] || rawServerId;
    const serverId = normalizeServerId(rawServerId);

    console.log(`[TELEMETRY-BRIDGE] Mod Connected: '${serverName}' (${serverId}) from ${req.socket.remoteAddress}`);
    modConnectedSockets.set(serverId, ws);
    addServerLog(serverId, 'INFO', `PETABLOCKS Telemetry Companion Mod connected (${req.socket.remoteAddress})`, 'TelemetryBridge');

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'TELEMETRY_SAMPLE' && msg.payload) {
          modTelemetryStore.set(serverId, {
            serverId,
            lastUpdated: Date.now(),
            ...msg.payload
          });
          const playerList = Array.isArray(msg.payload.players?.list)
            ? msg.payload.players.list
            : (Array.isArray(msg.payload.players?.sample) ? msg.payload.players.sample : []);
          if (playerList.length > 0) {
            playerAnalyticsService.recordTelemetrySample(serverId, playerList);
          }
        } else if (msg.type === 'EVENT_PLAYER_JOIN' && msg.payload) {
          addServerLog(serverId, 'INFO', `Player joined: ${msg.payload.name} (${msg.payload.uuid})`, 'Game');
          discordService.sendChatBroadcast(serverId, {
            username: msg.payload.name,
            message: `📥 **${msg.payload.name}** joined the game.`,
            eventType: 'join',
          });
          playerAnalyticsService.recordPlayerJoin(serverId, msg.payload);
        } else if (msg.type === 'EVENT_PLAYER_QUIT' && msg.payload) {
          addServerLog(serverId, 'INFO', `Player left: ${msg.payload.name}`, 'Game');
          discordService.sendChatBroadcast(serverId, {
            username: msg.payload.name,
            message: `📤 **${msg.payload.name}** left the game.`,
            eventType: 'leave',
          });
          playerAnalyticsService.recordPlayerQuit(serverId, msg.payload);
        } else if (msg.type === 'EVENT_PLAYER_CHAT' && msg.payload) {
          addServerLog(serverId, 'INFO', `<${msg.payload.name}> ${msg.payload.message}`, 'Chat');
          discordService.sendChatBroadcast(serverId, {
            username: msg.payload.name,
            message: msg.payload.message,
            eventType: 'chat',
          });
        } else if (msg.type === 'EVENT_PLAYER_DEATH' && msg.payload) {
          addServerLog(serverId, 'INFO', `Player death: ${msg.payload.deathMessage || msg.payload.name}`, 'Game');
          discordService.sendChatBroadcast(serverId, {
            username: msg.payload.name,
            message: `☠️ ${msg.payload.deathMessage || `${msg.payload.name} died`}`,
            eventType: 'death',
          });
          playerAnalyticsService.recordPlayerDeath(serverId, msg.payload);
        } else if (msg.type === 'EVENT_PLAYER_ADVANCEMENT' && msg.payload) {
          addServerLog(serverId, 'INFO', `Advancement: ${msg.payload.name} completed [${msg.payload.title}]`, 'Game');
          discordService.sendChatBroadcast(serverId, {
            username: msg.payload.name,
            message: `🏆 **${msg.payload.name}** has earned the advancement **[${msg.payload.title}]**!`,
            eventType: 'advancement',
          });
          playerAnalyticsService.recordPlayerAdvancement(serverId, msg.payload);
        } else if (msg.type === 'EVENT_TRAIN' && msg.payload) {
          addServerLog(serverId, 'INFO', `Train Event: ${msg.payload.trainName || 'Train'} (${msg.payload.eventType})`, 'Railways');
          discordService.sendTrainEvent(serverId, {
            title: msg.payload.title,
            trainName: msg.payload.trainName,
            eventType: msg.payload.eventType,
            description: msg.payload.description,
            location: msg.payload.location,
            player: msg.payload.player,
          });
        } else if (msg.type === 'COMMAND_RESPONSE' && msg.payload) {
          const reqId = msg.payload.requestId;
          if (pendingCommandCallbacks.has(reqId)) {
            const cb = pendingCommandCallbacks.get(reqId);
            pendingCommandCallbacks.delete(reqId);
            cb(msg.payload);
          }
        }
      } catch (e) {
        console.warn(`[TELEMETRY-BRIDGE] Error parsing frame:`, e.message);
      }
    });

    ws.on('close', () => {
      console.log(`[TELEMETRY-BRIDGE] Mod Disconnected: ${serverId}`);
      modConnectedSockets.delete(serverId);
      addServerLog(serverId, 'WARN', `PETABLOCKS Telemetry Companion Mod disconnected`, 'TelemetryBridge');
    });

    ws.on('error', (err) => {
      console.error(`[TELEMETRY-BRIDGE] Socket error for ${serverId}:`, err.message);
    });
  });
}

async function executeCommandUnified(serverId, command) {
  const normId = normalizeServerId(serverId);
  const modSocket = modConnectedSockets.get(normId);

  if (modSocket && modSocket.readyState === WebSocket.OPEN) {
    return new Promise((resolve) => {
      const requestId = 'cmd_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);
      const timer = setTimeout(() => {
        pendingCommandCallbacks.delete(requestId);
        resolve({ success: false, output: 'Mod command execution timed out (5s)' });
      }, 5000);

      pendingCommandCallbacks.set(requestId, (payload) => {
        clearTimeout(timer);
        const output = Array.isArray(payload.output) ? payload.output.join('\n') : (payload.message || 'Done');
        resolve({ success: payload.success, output, viaModBridge: true });
      });

      modSocket.send(JSON.stringify({
        type: 'COMMAND_REQUEST',
        serverId: normId,
        timestamp: Date.now(),
        payload: {
          requestId,
          action: 'EXECUTE_COMMAND',
          command,
          issuer: 'AdminPortal'
        }
      }));
    });
  }

  const srv = SERVERS.find(s => s.id === normId) || SERVERS[0];
  return sendRconCommand(srv.rconHost || srv.host, srv.rconPort, srv.rconPassword, command);
}

function writeVarInt(value) {
  const bytes = [];
  let v = value;
  while (true) {
    if ((v & ~0x7F) === 0) {
      bytes.push(v);
      break;
    }
    bytes.push((v & 0x7F) | 0x80);
    v >>>= 7;
  }
  return Buffer.from(bytes);
}

async function resolveMinecraftHost(host, defaultPort = 25565) {
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(host)) {
    return { host, port: defaultPort, isSrv: false };
  }

  try {
    const srvRecords = await dns.resolveSrv('_minecraft._tcp.' + host);
    if (srvRecords && srvRecords.length > 0) {
      srvRecords.sort((a, b) => a.priority - b.priority || b.weight - a.weight);
      return { host: srvRecords[0].name, port: srvRecords[0].port, isSrv: true };
    }
  } catch {}

  return { host, port: defaultPort, isSrv: false };
}

async function pingMinecraftServer(host, port, timeout = 4000) {
  const target = await resolveMinecraftHost(host, port);
  const targetHost = target.host;
  const targetPort = target.port;

  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    };

    socket.setTimeout(timeout);

    socket.connect(targetPort, targetHost, () => {
      const hostBuf = Buffer.from(targetHost, 'utf8');
      const portBuf = Buffer.alloc(2);
      portBuf.writeUInt16BE(targetPort);

      const packetId = writeVarInt(0x00);
      const protocol = writeVarInt(765);
      const hostLen = writeVarInt(hostBuf.length);
      const nextState = writeVarInt(1);

      const handshakePayload = Buffer.concat([packetId, protocol, hostLen, hostBuf, portBuf, nextState]);
      const handshakePacket = Buffer.concat([writeVarInt(handshakePayload.length), handshakePayload]);
      const requestPacket = Buffer.concat([writeVarInt(1), writeVarInt(0x00)]);

      socket.write(Buffer.concat([handshakePacket, requestPacket]));
    });

    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        const str = buffer.toString('utf8');
        const jsonStart = str.indexOf('{');
        const jsonEnd = str.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
          const jsonStr = str.substring(jsonStart, jsonEnd + 1);
          const parsed = JSON.parse(jsonStr);
          const latency = Date.now() - startTime;
          cleanup();
          resolve({
            online: true,
            latency,
            resolvedTarget: `${targetHost}:${targetPort}`,
            version: parsed.version?.name || '1.20.1',
            protocol: parsed.version?.protocol,
            players: {
              online: parsed.players?.online || 0,
              max: parsed.players?.max || 100,
              sample: parsed.players?.sample || [],
            },
            motd: typeof parsed.description === 'string'
              ? parsed.description
              : (parsed.description?.text || parsed.description?.extra?.map(e => e.text).join('') || ''),
          });
        }
      } catch {}
    });

    socket.on('timeout', () => {
      cleanup();
      resolve({
        online: false,
        latency: 0,
        resolvedTarget: `${targetHost}:${targetPort}`,
        players: { online: 0, max: 0, sample: [] },
        error: 'Ping timed out',
      });
    });

    socket.on('error', (err) => {
      cleanup();
      resolve({
        online: false,
        latency: 0,
        resolvedTarget: `${targetHost}:${targetPort}`,
        players: { online: 0, max: 0, sample: [] },
        error: err.message,
      });
    });
  });
}

async function sendRconCommand(host, port, password, command, timeout = 5000) {
  if (!password) {
    return { success: false, output: 'RCON password not configured for this server' };
  }

  const target = await resolveMinecraftHost(host, port);
  const targetHost = target.host;
  const targetPort = target.port;

  return new Promise((resolve) => {
    const socket = new net.Socket();
    let authenticated = false;
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    };

    socket.setTimeout(timeout);

    const createPacket = (id, type, body) => {
      const bodyBuf = Buffer.from(body, 'utf8');
      const length = 4 + 4 + bodyBuf.length + 2;
      const buf = Buffer.alloc(length + 4);
      buf.writeInt32LE(length, 0);
      buf.writeInt32LE(id, 4);
      buf.writeInt32LE(type, 8);
      bodyBuf.copy(buf, 12);
      buf.writeInt8(0, 12 + bodyBuf.length);
      buf.writeInt8(0, 12 + bodyBuf.length + 1);
      return buf;
    };

    socket.connect(targetPort, targetHost, () => {
      socket.write(createPacket(1, 3, password));
    });

    socket.on('data', (data) => {
      if (data.length < 12) return;
      const id = data.readInt32LE(4);
      const type = data.readInt32LE(8);

      if (!authenticated) {
        if (id === -1) {
          cleanup();
          return resolve({ success: false, output: 'RCON Authentication Failed (Bad password)' });
        }
        if (type === 2) {
          authenticated = true;
          socket.write(createPacket(2, 2, command));
        }
      } else {
        const body = data.toString('utf8', 12, data.length - 2);
        cleanup();
        resolve({ success: true, output: body.trim() || 'Command executed successfully (no output)' });
      }
    });

    socket.on('timeout', () => {
      cleanup();
      resolve({ success: false, output: 'RCON connection timed out' });
    });

    socket.on('error', (err) => {
      cleanup();
      resolve({ success: false, output: `RCON Connection Error: ${err.message}` });
    });
  });
}

async function getAdminDb() {
  const dbUrl = process.env.DATABASE_URL || 'mysql://admin:mOgsrNJ6lEQQXx77YnPcVd0jxAmQDRud@10.20.110.117:3306/petablocks_admin';
  const conn = await mysql.createConnection(dbUrl);
  await conn.query(`
    CREATE TABLE IF NOT EXISTS moderation_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      server_id VARCHAR(64) NOT NULL,
      action VARCHAR(32) NOT NULL,
      target VARCHAR(64) NOT NULL,
      executor VARCHAR(64) DEFAULT 'Admin',
      reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  return conn;
}

// GET /api/minecraft/servers
router.get('/servers', async (_req, res) => {
  try {
    const results = await Promise.all(
      SERVERS.map(async (srv) => {
        const pingResult = await pingMinecraftServer(srv.host, srv.port);
        const modData = modTelemetryStore.get(srv.id);
        const hasModBridge = modConnectedSockets.has(srv.id) && modConnectedSockets.get(srv.id).readyState === WebSocket.OPEN;

        // Fetch live Spark log scraper metrics if no websocket mod bridge is active
        let sparkData = sparkTelemetryCache.get(srv.id) || null;
        if (!hasModBridge && srv.logPath && pingResult.online) {
          try {
            const freshSpark = await fetchSparkMetrics(srv);
            if (freshSpark) {
              sparkTelemetryCache.set(srv.id, freshSpark);
              sparkData = freshSpark;
            }
          } catch (_) {}
        }

        const calculatedTps = hasModBridge && modData ? modData.tps : (sparkData ? sparkData.tps : (pingResult.online ? 20.0 : 0));
        const calculatedMspt = hasModBridge && modData ? modData.mspt : (sparkData ? sparkData.mspt : (pingResult.online ? 15.0 : 0));

        return {
          id: srv.id,
          modServerId: srv.modServerId,
          name: srv.name,
          host: srv.host,
          port: srv.port,
          displayHost: srv.displayHost || srv.host,
          rconPort: srv.rconPort,
          hasRcon: Boolean(srv.rconPassword),
          hasModBridge: hasModBridge || Boolean(sparkData),
          telemetrySource: hasModBridge ? 'websocket-mod' : (sparkData ? 'spark-profiler' : 'tcp-ping'),
          type: srv.type,
          version: pingResult.version || srv.version,
          description: srv.description,
          online: pingResult.online || hasModBridge,
          latency: pingResult.latency,
          players: hasModBridge && modData?.players
            ? { online: modData.players.online, max: modData.players.max, sample: modData.players.list || [] }
            : pingResult.players,
          motd: pingResult.motd,
          resolvedTarget: pingResult.resolvedTarget,
          tps: calculatedTps,
          mspt: calculatedMspt,
          memory: hasModBridge && modData?.memory
            ? modData.memory
            : (sparkData ? { usedMb: 0, allocatedMb: 0, maxMb: 0, gcPauseDurationMsLastMinute: sparkData.gcPauseMs } : null),
          dimensions: hasModBridge && modData?.dimensions ? modData.dimensions : [],
          cpuUsagePercent: hasModBridge && modData ? modData.cpuUsagePercent : 0,
        };
      })
    );

    const totalOnline = results.reduce((acc, s) => acc + (s.players?.online || 0), 0);
    const totalMax = results.reduce((acc, s) => acc + (s.players?.max || 0), 0);

    res.json({
      timestamp: new Date().toISOString(),
      totalOnline,
      totalMax,
      servers: results,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/minecraft/logs
router.get('/logs', (req, res) => {
  const { serverId = 'fabric-main', limit = 100 } = req.query;
  const buffer = serverLogBuffers[normalizeServerId(serverId)] || [];
  const count = Math.min(parseInt(limit, 10) || 100, 500);
  res.json({
    serverId,
    logs: buffer.slice(-count),
    totalCount: buffer.length,
  });
});

// GET /api/minecraft/logs/stream
router.get('/logs/stream', (req, res) => {
  const targetServerId = req.query.serverId || 'all';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const client = { res, targetServerId };
  sseClients.add(client);

  const initialLogs = targetServerId === 'all'
    ? Object.values(serverLogBuffers).flat().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).slice(-50)
    : (serverLogBuffers[normalizeServerId(targetServerId)] || []).slice(-50);

  res.write(`data: ${JSON.stringify({ type: 'initial', logs: initialLogs })}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(client);
  });
});

// GET /api/minecraft/moderation/bans
router.get('/moderation/bans', async (req, res) => {
  const { serverId = 'fabric-main' } = req.query;
  const srv = SERVERS.find((s) => s.id === normalizeServerId(serverId)) || SERVERS[0];

  let bans = [];
  let whitelist = [];

  try {
    const banResult = await executeCommandUnified(srv.id, 'banlist players');
    if (banResult.success) {
      const match = banResult.output.match(/There are \d+ (?:total )?bans?:?(.*)/i);
      if (match && match[1]) {
        const listStr = match[1].trim();
        if (listStr) {
          bans = listStr.split(',').map((item) => {
            const cleaned = item.trim();
            const m = cleaned.match(/^([^\s(]+)(?:\s*\((.*?)\))?$/);
            return {
              name: m ? m[1] : cleaned,
              reason: m && m[2] ? m[2] : 'Banned by operator',
              source: banResult.viaModBridge ? 'Mod Bridge' : 'RCON',
            };
          });
        }
      }
    }

    const wlResult = await executeCommandUnified(srv.id, 'whitelist list');
    if (wlResult.success) {
      const match = wlResult.output.match(/There are \d+ (?:whitelisted )?players?:?(.*)/i);
      if (match && match[1]) {
        const listStr = match[1].trim();
        if (listStr) {
          whitelist = listStr.split(',').map((name) => name.trim()).filter(Boolean);
        }
      }
    }
  } catch {}

  res.json({
    serverId: srv.id,
    serverName: srv.name,
    bans,
    whitelist,
  });
});

// GET /api/minecraft/moderation/audit
router.get('/moderation/audit', async (_req, res) => {
  try {
    const db = await getAdminDb();
    const [rows] = await db.query(
      `SELECT id, server_id, action, target, executor, reason, created_at
       FROM moderation_logs
       ORDER BY created_at DESC
       LIMIT 50`
    );
    await db.end();
    res.json({ logs: rows });
  } catch (err) {
    res.json({ logs: [], error: String(err) });
  }
});

// POST /api/minecraft/moderation/action
router.post('/moderation/action', async (req, res) => {
  const { serverId = 'fabric-main', action, target, reason = 'No reason specified', executor = 'Admin' } = req.body;

  if (!action || !target) {
    return res.status(400).json({ error: 'Action and target player required' });
  }

  const normId = normalizeServerId(serverId);
  const srv = SERVERS.find((s) => s.id === normId) || SERVERS[0];
  let command = '';

  switch (action) {
    case 'ban': command = `ban ${target} ${reason}`; break;
    case 'pardon':
    case 'unban': command = `pardon ${target}`; break;
    case 'kick': command = `kick ${target} ${reason}`; break;
    case 'whitelist_add': command = `whitelist add ${target}`; break;
    case 'whitelist_remove': command = `whitelist remove ${target}`; break;
    case 'op': command = `op ${target}`; break;
    case 'deop': command = `deop ${target}`; break;
    default: return res.status(400).json({ error: `Unsupported moderation action: ${action}` });
  }

  const result = await executeCommandUnified(srv.id, command);
  addServerLog(srv.id, result.success ? 'WARN' : 'ERROR', `[MODERATION] ${executor} executed '${command}' -> ${result.output}`, 'Moderation');

  try {
    const db = await getAdminDb();
    await db.query(
      `INSERT INTO moderation_logs (server_id, action, target, executor, reason) VALUES (?, ?, ?, ?, ?)`,
      [srv.id, action, target, executor, reason]
    );
    await db.end();
  } catch (e) {
    console.error('Failed to write moderation audit log:', e);
  }

  res.json({
    serverId: srv.id,
    action,
    target,
    command,
    ...result,
  });
});

// GET /api/minecraft/analytics
router.get('/analytics', async (_req, res) => {
  const mcDbUrl = process.env.MC_DATABASE_URL || 'mysql://petablocks:mOgsrNJ6lEQQXx77YnPcVd0jxAmQDRud@10.20.110.117:3307/petablocks';

  try {
    const conn = await mysql.createConnection(mcDbUrl);
    let topPlayers = [];
    try {
      const [rows] = await conn.query(
        `SELECT
           u.name,
           u.uuid,
           COALESCE(u.registered, 0) as firstJoined,
           FLOOR(COALESCE(SUM(s.session_end - s.session_start), 0) / 1000) as playtimeSeconds
         FROM plan_users u
         JOIN plan_sessions s ON u.id = s.user_id
         GROUP BY u.id
         HAVING playtimeSeconds > 0
         ORDER BY playtimeSeconds DESC
         LIMIT 10`
      );
      topPlayers = rows;
    } catch {}

    let rankDistribution = [];
    try {
      const [lpRows] = await conn.query(
        `SELECT primary_group as groupName, COUNT(*) as count
         FROM luckperms_players
         GROUP BY primary_group
         ORDER BY count DESC`
      );
      rankDistribution = lpRows.map(r => ({
        group: r.groupName || 'default',
        count: r.count,
      }));
    } catch {}

    await conn.end();
    res.json({
      configured: true,
      topPlayers,
      rankDistribution,
    });
  } catch (err) {
    res.json({
      configured: false,
      error: String(err),
      topPlayers: [],
      rankDistribution: [],
    });
  }
});

// POST /api/minecraft/rcon
router.post('/rcon', async (req, res) => {
  const { serverId, command } = req.body;
  if (!command || !command.trim()) {
    return res.status(400).json({ error: 'Command is required' });
  }

  const normId = normalizeServerId(serverId);
  const srv = SERVERS.find((s) => s.id === normId) || SERVERS[0];
  const result = await executeCommandUnified(normId, command.trim());

  addServerLog(srv.id, 'COMMAND', `> /${command.trim()}`, result.viaModBridge ? 'ModBridge' : 'RCON');
  addServerLog(srv.id, result.success ? 'INFO' : 'ERROR', result.output, 'Server');

  res.json({
    serverId: srv.id,
    serverName: srv.name,
    command: command.trim(),
    ...result,
    timestamp: new Date().toISOString(),
  });
});

// POST /api/minecraft/broadcast
router.post('/broadcast', async (req, res) => {
  const { serverId, message, type = 'chat' } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Broadcast message required' });
  }

  const targetServers = serverId === 'all'
    ? SERVERS
    : SERVERS.filter((s) => s.id === normalizeServerId(serverId));

  const results = await Promise.all(
    targetServers.map(async (srv) => {
      let cmd = '';
      if (type === 'title') {
        cmd = `title @a title {"text":"[ALERT] ${message.trim()}","color":"gold","bold":true}`;
      } else {
        cmd = `tellraw @a {"text":"[PETABLOCKS] ${message.trim()}","color":"aqua"}`;
      }
      const res = await executeCommandUnified(srv.id, cmd);
      addServerLog(srv.id, 'CHAT', `[BROADCAST] ${message.trim()}`, 'Broadcast');
      return res;
    })
  );

  res.json({
    success: true,
    targeted: targetServers.length,
    results,
    timestamp: new Date().toISOString(),
  });
});

module.exports = {
  router,
  initWebSocket
};
