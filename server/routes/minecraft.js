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
  // If host is an IP address, return directly
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

  // Resolve target host if domain
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
      // Packet type 3 = Login / Auth
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
          // Send the command: Type 2 = Command Execute
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
      return sendRconCommand(srv.rconHost || srv.host, srv.rconPort, srv.rconPassword, cmd);
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
