const { Router } = require('express');
const net = require('net');
const dns = require('dns').promises;
const mysql = require('mysql2/promise');

const router = Router();

const SERVERS = [
  {
    id: 'fabric-main',
    name: 'PETABLOCKS Modpack Server',
    host: process.env.MC_FABRIC_HOST || 'play.petablocks.com',
    port: parseInt(process.env.MC_FABRIC_PORT || '11691', 10),
    displayHost: 'play.petablocks.com',
    rconHost: process.env.MC_FABRIC_RCON_HOST || '10.20.110.127',
    rconPort: parseInt(process.env.MC_FABRIC_RCON_PORT || '16901', 10),
    rconPassword: process.env.MC_FABRIC_RCON_PASSWORD || 'P3tabl0cksrc0n!!',
    type: 'fabric',
    version: '1.20.1',
    description: 'Main Fabric 1.20.1 Modpack Server (Plan & LuckPerms DB)',
  },
  {
    id: 'create-2',
    name: 'PETABLOCKS Create 2',
    host: process.env.MC_CREATE2_HOST || 'create2.petablocks.com',
    port: parseInt(process.env.MC_CREATE2_PORT || '11681', 10),
    displayHost: 'create2.petablocks.com',
    rconHost: process.env.MC_CREATE2_RCON_HOST || 'create2.petablocks.com',
    rconPort: parseInt(process.env.MC_CREATE2_RCON_PORT || '25576', 10),
    rconPassword: process.env.MC_CREATE2_RCON_PASSWORD || '',
    type: 'neoforge',
    version: '1.21.1',
    description: 'NeoForge 1.21.1 Create 2 SMP Server',
  },
  {
    id: 'create-patreon',
    name: 'PETABLOCKS Patreon Server',
    host: process.env.MC_PATREON_HOST || 'createcreative.petablocks.com',
    port: parseInt(process.env.MC_PATREON_PORT || '11651', 10),
    displayHost: 'createcreative.petablocks.com',
    rconHost: process.env.MC_PATREON_RCON_HOST || 'createcreative.petablocks.com',
    rconPort: parseInt(process.env.MC_PATREON_RCON_PORT || '25577', 10),
    rconPassword: process.env.MC_PATREON_RCON_PASSWORD || '',
    type: 'neoforge',
    version: '1.21.1',
    description: 'NeoForge 1.21.1 Whitelisted Patreon Creative Server (DiscoPanel)',
  },
];

// In-Memory Circular Console Log Buffers (up to 500 lines per server)
const serverLogBuffers = {
  'fabric-main': [],
  'create-2': [],
  'create-patreon': [],
};

// Connected SSE Clients
const sseClients = new Set();

function addServerLog(serverId, level, message, source = 'Server') {
  const timestamp = new Date().toISOString();
  const timeFormatted = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
    serverId,
    timestamp,
    time: timeFormatted,
    level, // 'INFO' | 'WARN' | 'ERROR' | 'FATAL' | 'CHAT' | 'COMMAND'
    message,
    source,
  };

  if (!serverLogBuffers[serverId]) serverLogBuffers[serverId] = [];
  serverLogBuffers[serverId].push(entry);
  if (serverLogBuffers[serverId].length > 500) {
    serverLogBuffers[serverId].shift();
  }

  // Broadcast to active SSE clients
  const sseData = `data: ${JSON.stringify(entry)}\n\n`;
  for (const client of sseClients) {
    if (!client.targetServerId || client.targetServerId === 'all' || client.targetServerId === serverId) {
      client.res.write(sseData);
    }
  }
}

// Seed initial system logs
for (const srv of SERVERS) {
  addServerLog(srv.id, 'INFO', `Initialized telemetry listener for ${srv.name} (${srv.displayHost})`, 'System');
}

// Helper: VarInt encoding for Minecraft protocol
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

// Helper: Resolve DNS SRV records (e.g. _minecraft._tcp.play.petablocks.com)
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
  } catch {
    // No SRV record found or DNS error -> fallback to default
  }

  return { host, port: defaultPort, isSrv: false };
}

// Helper: Minecraft Server List Ping (SLP) with SRV support
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
      const protocol = writeVarInt(765); // 1.20.4+ / 1.21.x compatible
      const hostLen = writeVarInt(hostBuf.length);
      const nextState = writeVarInt(1); // 1 = status query

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
      } catch {
        // Wait for more chunks
      }
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

// Helper: Lightweight Minecraft RCON Client
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

// Database helper for Moderation Audit Logs
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

// GET /api/minecraft/servers — Live SLP telemetry for all 3 servers
router.get('/servers', async (_req, res) => {
  try {
    const results = await Promise.all(
      SERVERS.map(async (srv) => {
        const pingResult = await pingMinecraftServer(srv.host, srv.port);
        return {
          id: srv.id,
          name: srv.name,
          host: srv.host,
          port: srv.port,
          displayHost: srv.displayHost || srv.host,
          rconPort: srv.rconPort,
          hasRcon: Boolean(srv.rconPassword),
          type: srv.type,
          version: pingResult.version || srv.version,
          description: srv.description,
          online: pingResult.online,
          latency: pingResult.latency,
          players: pingResult.players,
          motd: pingResult.motd,
          resolvedTarget: pingResult.resolvedTarget,
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

// GET /api/minecraft/logs — Fetch recent console logs
router.get('/logs', (req, res) => {
  const { serverId = 'fabric-main', limit = 100 } = req.query;
  const buffer = serverLogBuffers[serverId] || [];
  const count = Math.min(parseInt(limit, 10) || 100, 500);
  res.json({
    serverId,
    logs: buffer.slice(-count),
    totalCount: buffer.length,
  });
});

// GET /api/minecraft/logs/stream — Server-Sent Events (SSE) live log stream
router.get('/logs/stream', (req, res) => {
  const targetServerId = req.query.serverId || 'all';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const client = { res, targetServerId };
  sseClients.add(client);

  // Send initial buffer
  const initialLogs = targetServerId === 'all'
    ? Object.values(serverLogBuffers).flat().sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)).slice(-50)
    : (serverLogBuffers[targetServerId] || []).slice(-50);

  res.write(`data: ${JSON.stringify({ type: 'initial', logs: initialLogs })}\n\n`);

  // Keep-alive heartbeat every 20s
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    sseClients.delete(client);
  });
});

// GET /api/minecraft/moderation/bans — Get active bans & whitelist
router.get('/moderation/bans', async (req, res) => {
  const { serverId = 'fabric-main' } = req.query;
  const srv = SERVERS.find((s) => s.id === serverId) || SERVERS[0];

  let bans = [];
  let whitelist = [];

  if (srv.rconPassword) {
    try {
      // Query /banlist players
      const banResult = await sendRconCommand(srv.rconHost || srv.host, srv.rconPort, srv.rconPassword, 'banlist players');
      if (banResult.success) {
        // Parse Minecraft ban output format: "There are X bans: name (reason), name2 (reason)"
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
                source: 'RCON banlist',
              };
            });
          }
        }
      }

      // Query /whitelist list
      const wlResult = await sendRconCommand(srv.rconHost || srv.host, srv.rconPort, srv.rconPassword, 'whitelist list');
      if (wlResult.success) {
        const match = wlResult.output.match(/There are \d+ (?:whitelisted )?players?:?(.*)/i);
        if (match && match[1]) {
          const listStr = match[1].trim();
          if (listStr) {
            whitelist = listStr.split(',').map((name) => name.trim()).filter(Boolean);
          }
        }
      }
    } catch {
      // Ignore
    }
  }

  res.json({
    serverId: srv.id,
    serverName: srv.name,
    bans,
    whitelist,
  });
});

// GET /api/minecraft/moderation/audit — Get staff moderation audit log
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

// POST /api/minecraft/moderation/action — Execute moderation command & save audit
router.post('/moderation/action', async (req, res) => {
  const { serverId = 'fabric-main', action, target, reason = 'No reason specified', executor = 'Admin' } = req.body;

  if (!action || !target) {
    return res.status(400).json({ error: 'Action and target player required' });
  }

  const srv = SERVERS.find((s) => s.id === serverId) || SERVERS[0];
  let command = '';

  switch (action) {
    case 'ban':
      command = `ban ${target} ${reason}`;
      break;
    case 'pardon':
    case 'unban':
      command = `pardon ${target}`;
      break;
    case 'kick':
      command = `kick ${target} ${reason}`;
      break;
    case 'whitelist_add':
      command = `whitelist add ${target}`;
      break;
    case 'whitelist_remove':
      command = `whitelist remove ${target}`;
      break;
    case 'op':
      command = `op ${target}`;
      break;
    case 'deop':
      command = `deop ${target}`;
      break;
    default:
      return res.status(400).json({ error: `Unsupported moderation action: ${action}` });
  }

  const result = await sendRconCommand(srv.rconHost || srv.host, srv.rconPort, srv.rconPassword, command);

  // Broadcast log to SSE console
  addServerLog(srv.id, result.success ? 'WARN' : 'ERROR', `[MODERATION] ${executor} executed '${command}' -> ${result.output}`, 'Moderation');

  // Record to DB audit log
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

// GET /api/minecraft/analytics — Query MariaDB :3307 for Plan & LuckPerms
router.get('/analytics', async (_req, res) => {
  const mcDbUrl = process.env.MC_DATABASE_URL || 'mysql://petablocks:mOgsrNJ6lEQQXx77YnPcVd0jxAmQDRud@10.20.110.117:3307/petablocks';

  try {
    const conn = await mysql.createConnection(mcDbUrl);
    
    // Top players by playtime from plan_sessions
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
    } catch {
      // Fallback
    }

    // LuckPerms ranks breakdown
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
    } catch {
      // Fallback
    }

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

// POST /api/minecraft/rcon — Execute RCON command
router.post('/rcon', async (req, res) => {
  const { serverId, command } = req.body;
  if (!command || !command.trim()) {
    return res.status(400).json({ error: 'Command is required' });
  }

  const srv = SERVERS.find((s) => s.id === serverId) || SERVERS[0];
  const result = await sendRconCommand(srv.rconHost || srv.host, srv.rconPort, srv.rconPassword, command.trim());

  // Broadcast command execution to console log stream
  addServerLog(srv.id, 'COMMAND', `> /${command.trim()}`, 'RCON');
  addServerLog(srv.id, result.success ? 'INFO' : 'ERROR', result.output, 'Server');

  res.json({
    serverId: srv.id,
    serverName: srv.name,
    command: command.trim(),
    ...result,
    timestamp: new Date().toISOString(),
  });
});

// POST /api/minecraft/broadcast — Send title / broadcast announcement
router.post('/broadcast', async (req, res) => {
  const { serverId, message, type = 'chat' } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Broadcast message required' });
  }

  const targetServers = serverId === 'all'
    ? SERVERS
    : SERVERS.filter((s) => s.id === serverId);

  const results = await Promise.all(
    targetServers.map(async (srv) => {
      let cmd = '';
      if (type === 'title') {
        cmd = `title @a title {"text":"[ALERT] ${message.trim()}","color":"gold","bold":true}`;
      } else {
        cmd = `tellraw @a {"text":"[PETABLOCKS] ${message.trim()}","color":"aqua"}`;
      }
      const res = await sendRconCommand(srv.rconHost || srv.host, srv.rconPort, srv.rconPassword, cmd);
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

module.exports = router;
