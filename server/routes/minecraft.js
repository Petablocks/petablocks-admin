const { Router } = require('express');
const net = require('net');
const mysql = require('mysql2/promise');

const router = Router();

const SERVERS = [
  {
    id: 'fabric-main',
    name: 'PETABLOCKS Modpack Server',
    host: process.env.MC_FABRIC_HOST || '10.20.110.127',
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
    port: parseInt(process.env.MC_CREATE2_PORT || '25565', 10),
    displayHost: 'create2.petablocks.com',
    rconHost: process.env.MC_CREATE2_RCON_HOST || process.env.MC_CREATE2_HOST || 'create2.petablocks.com',
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
    port: parseInt(process.env.MC_PATREON_PORT || '25565', 10),
    displayHost: 'createcreative.petablocks.com',
    rconHost: process.env.MC_PATREON_RCON_HOST || process.env.MC_PATREON_HOST || 'createcreative.petablocks.com',
    rconPort: parseInt(process.env.MC_PATREON_RCON_PORT || '25577', 10),
    rconPassword: process.env.MC_PATREON_RCON_PASSWORD || '',
    type: 'neoforge',
    version: '1.21.1',
    description: 'NeoForge 1.21.1 Whitelisted Patreon Creative Server (DiscoPanel)',
  },
];

// Helper: Minecraft Server List Ping (SLP)
function pingMinecraftServer(host, port, timeout = 3500) {
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

    socket.on('connect', () => {
      // Handshake packet (protocol 763 for 1.20+)
      const hostBuf = Buffer.from(host, 'utf8');
      const handshakePayload = Buffer.concat([
        Buffer.from([0x00]), // Packet ID 0x00
        Buffer.from([0xfd, 0x05]), // Protocol version VarInt (765)
        Buffer.from([hostBuf.length]), // Host length
        hostBuf,
        Buffer.from([(port >> 8) & 0xff, port & 0xff]), // Port short
        Buffer.from([0x01]), // Next state 1 (status)
      ]);

      const handshakePacket = Buffer.concat([
        Buffer.from([handshakePayload.length]),
        handshakePayload,
      ]);

      // Request packet (0x00)
      const requestPacket = Buffer.from([0x01, 0x00]);

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
      resolve({ online: false, latency: 0, players: { online: 0, max: 0, sample: [] }, error: 'Ping timed out' });
    });

    socket.on('error', (err) => {
      cleanup();
      resolve({ online: false, latency: 0, players: { online: 0, max: 0, sample: [] }, error: err.message });
    });
  });
}

// Helper: Lightweight Minecraft RCON Client
function sendRconCommand(host, port, password, command, timeout = 5000) {
  return new Promise((resolve) => {
    if (!password) {
      return resolve({ success: false, output: 'RCON password not configured for this server' });
    }

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

    socket.connect(port, host, () => {
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
          version: srv.version,
          description: srv.description,
          online: pingResult.online,
          latency: pingResult.latency,
          players: pingResult.players,
          motd: pingResult.motd,
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
  const mcDbUrl = process.env.MC_DATABASE_URL;
  if (!mcDbUrl) {
    return res.json({
      configured: false,
      topPlayers: [],
      rankDistribution: [],
      message: 'MC_DATABASE_URL not configured for MariaDB :3307',
    });
  }

  try {
    const conn = await mysql.createConnection(mcDbUrl);
    
    // Top players by playtime (Plan or custom tracking)
    let topPlayers = [];
    try {
      const [rows] = await conn.query(
        `SELECT name, uuid, registered as firstJoined, (activity / 1000) as playtimeSeconds
         FROM plan_users
         ORDER BY activity DESC
         LIMIT 10`
      );
      topPlayers = rows;
    } catch {
      // Fallback if Plan tables have alternate schema
    }

    // LuckPerms group breakdown
    let rankDistribution = [];
    try {
      const [lpRows] = await conn.query(
        `SELECT permission as groupName, COUNT(*) as count
         FROM luckperms_user_permissions
         WHERE permission LIKE 'group.%'
         GROUP BY permission
         ORDER BY count DESC`
      );
      rankDistribution = lpRows.map(r => ({
        group: r.groupName.replace('group.', ''),
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
    ok: true,
    sentTo: targetServers.map((s) => s.name),
    results,
  });
});

module.exports = router;
