const { Router } = require('express');
const mysql = require('mysql2/promise');
const discordService = require('../services/discordWebhookService');
const {
  executeCommandUnified,
  SERVERS,
  normalizeServerId,
  modTelemetryStore,
  serverLogBuffers,
  addServerLog,
  onLogEntry,
} = require('./minecraft');

const router = Router();

// Connection pool for petablocks_admin database
const adminDbUrl = process.env.DATABASE_URL || 'mysql://user:password@127.0.0.1:3306/petablocks_admin';
let pool = null;

async function getAdminPool() {
  if (!pool) {
    pool = mysql.createPool({
      uri: adminDbUrl,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });

    // Ensure database tables exist
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS moderation_logs (
          id INT AUTO_INCREMENT PRIMARY KEY,
          server_id VARCHAR(64) NOT NULL,
          action VARCHAR(32) NOT NULL,
          target VARCHAR(64) NOT NULL,
          executor VARCHAR(64) DEFAULT 'Admin',
          reason TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_server (server_id),
          INDEX idx_target (target),
          INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS player_infractions (
          id INT AUTO_INCREMENT PRIMARY KEY,
          server_id VARCHAR(64) NOT NULL,
          player_uuid VARCHAR(64) NULL,
          player_name VARCHAR(64) NOT NULL,
          type ENUM('warn', 'mute', 'kick', 'ban', 'note') NOT NULL,
          severity ENUM('info', 'low', 'medium', 'high', 'critical') DEFAULT 'medium',
          reason TEXT NOT NULL,
          staff_name VARCHAR(64) NOT NULL,
          staff_id VARCHAR(64) NULL,
          active TINYINT(1) DEFAULT 1,
          expires_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_player (player_name),
          INDEX idx_active (active),
          INDEX idx_server (server_id),
          INDEX idx_type (type),
          INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
      console.log('[MODERATION-DB] Tables initialized successfully');
    } catch (err) {
      console.error('[MODERATION-DB] Schema initialization warning:', err.message);
    }
  }
  return pool;
}

// Initialise pool early
getAdminPool().catch(err => console.error('[MODERATION-INIT] Error:', err.message));

// Track active SSE chat stream clients
const chatSseClients = new Set();

// Register listener on Minecraft log entries for real-time chat & moderation broadcast
onLogEntry((entry) => {
  // Check if entry is a chat message, join/leave, or alert
  const isChat = entry.source === 'Chat' || entry.source === 'Game' || entry.source === 'Broadcast' || entry.source === 'Moderation';
  const chatMatch = entry.message.match(/^<([^>]+)>\s+(.*)$/);

  if (isChat || chatMatch) {
    const chatPayload = {
      id: entry.id,
      serverId: entry.serverId,
      time: entry.time,
      timestamp: entry.timestamp,
      source: entry.source,
      level: entry.level,
      rawMessage: entry.message,
      username: chatMatch ? chatMatch[1] : (entry.source === 'Chat' ? entry.message.split(' ')[0].replace(/[<>:]/g, '') : null),
      text: chatMatch ? chatMatch[2] : entry.message,
    };

    const sseData = `data: ${JSON.stringify(chatPayload)}\n\n`;
    for (const client of chatSseClients) {
      if (!client.targetServerId || client.targetServerId === 'all' || client.targetServerId === entry.serverId) {
        try {
          client.res.write(sseData);
        } catch (_) {}
      }
    }
  }
});

/**
 * Helper to extract staff identity from Central SSO authenticated request
 */
function getStaffIdentity(req) {
  const staffName =
    req.user?.minecraft?.username ||
    req.user?.username ||
    req.user?.name ||
    req.body?.executor ||
    'Staff';
  const staffId = req.user?.sub || req.user?.id || null;
  return { staffName, staffId };
}

/**
 * GET /api/moderation/overview
 * Returns fleet-wide moderation statistics, active counts, and recent actions.
 */
router.get('/overview', async (_req, res) => {
  try {
    const db = await getAdminPool();

    // 1. Query online players across servers
    let totalOnlinePlayers = 0;
    const serversSummary = SERVERS.map(srv => {
      const modData = modTelemetryStore.get(srv.id);
      const online = modData?.players?.online || 0;
      totalOnlinePlayers += online;
      return {
        id: srv.id,
        name: srv.name,
        online,
      };
    });

    // 2. Query infractions stats
    let totalActiveInfractions = 0;
    let totalActiveBans = 0;
    let totalActiveWarns = 0;
    let totalActiveMutes = 0;
    let actionsPast24h = 0;

    try {
      const [[infractionCounts]] = await db.query(`
        SELECT
          COUNT(*) as totalActive,
          SUM(CASE WHEN type = 'ban' THEN 1 ELSE 0 END) as activeBans,
          SUM(CASE WHEN type = 'warn' THEN 1 ELSE 0 END) as activeWarns,
          SUM(CASE WHEN type = 'mute' THEN 1 ELSE 0 END) as activeMutes
        FROM player_infractions
        WHERE active = 1
      `);
      totalActiveInfractions = infractionCounts?.totalActive || 0;
      totalActiveBans = infractionCounts?.activeBans || 0;
      totalActiveWarns = infractionCounts?.activeWarns || 0;
      totalActiveMutes = infractionCounts?.activeMutes || 0;
    } catch (_) {}

    try {
      const [[actionCount]] = await db.query(`
        SELECT COUNT(*) as count24h
        FROM moderation_logs
        WHERE created_at >= NOW() - INTERVAL 1 DAY
      `);
      actionsPast24h = actionCount?.count24h || 0;
    } catch (_) {}

    // 3. Query recent moderation audit logs
    let recentActions = [];
    try {
      const [rows] = await db.query(`
        SELECT id, server_id, action, target, executor, reason, created_at
        FROM moderation_logs
        ORDER BY created_at DESC
        LIMIT 10
      `);
      recentActions = rows;
    } catch (_) {}

    res.json({
      timestamp: new Date().toISOString(),
      fleet: {
        totalOnlinePlayers,
        servers: serversSummary,
      },
      infractions: {
        totalActive: totalActiveInfractions,
        activeBans: totalActiveBans,
        activeWarns: totalActiveWarns,
        activeMutes: totalActiveMutes,
      },
      activity: {
        actionsPast24h,
        recentActions,
      },
    });
  } catch (err) {
    console.error('[API-MODERATION] Overview error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve moderation overview', message: err.message });
  }
});

/**
 * GET /api/moderation/players
 * Live cross-server roster with coordinates, dimension, ping, and infraction history.
 */
router.get('/players', async (_req, res) => {
  try {
    const db = await getAdminPool();

    // Fetch active infraction counts by player name
    const [infractionRows] = await db.query(`
      SELECT player_name, COUNT(*) as count
      FROM player_infractions
      WHERE active = 1
      GROUP BY player_name
    `).catch(() => [[]]);

    const infractionCountMap = new Map();
    for (const r of infractionRows) {
      infractionCountMap.set(r.player_name.toLowerCase(), Number(r.count));
    }

    const playerList = [];

    for (const srv of SERVERS) {
      const modData = modTelemetryStore.get(srv.id);
      const rawPlayers = Array.isArray(modData?.players?.list)
        ? modData.players.list
        : (Array.isArray(modData?.players?.sample) ? modData.players.sample : []);

      for (const p of rawPlayers) {
        const username = typeof p === 'string' ? p : (p.name || p.username || 'Unknown');
        const uuid = typeof p === 'object' ? (p.uuid || p.id || '') : '';
        const lowerName = username.toLowerCase();

        playerList.push({
          username,
          uuid,
          avatar: `https://mc-heads.net/avatar/${uuid || username}/64`,
          serverId: srv.id,
          serverName: srv.name,
          ping: typeof p === 'object' && p.ping !== undefined ? p.ping : null,
          dimension: typeof p === 'object' && p.dimension ? p.dimension : 'overworld',
          coordinates: typeof p === 'object' && p.x !== undefined ? { x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z) } : null,
          health: typeof p === 'object' && p.health !== undefined ? p.health : null,
          food: typeof p === 'object' && p.food !== undefined ? p.food : null,
          activeInfractions: infractionCountMap.get(lowerName) || 0,
        });
      }
    }

    res.json({
      timestamp: new Date().toISOString(),
      total: playerList.length,
      players: playerList,
    });
  } catch (err) {
    console.error('[API-MODERATION] Players error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve active players roster', message: err.message });
  }
});

/**
 * POST /api/moderation/action
 * Executes an in-game moderation command, writes audit log with Central SSO attribution,
 * records to infractions table if applicable, and alerts staff Discord channel.
 */
router.post('/action', async (req, res) => {
  const {
    serverId = 'fabric-main',
    action,
    target,
    reason = 'No reason specified',
    severity = 'medium',
    destination = '',
    customMessage = '',
  } = req.body;

  if (!action || !target) {
    return res.status(400).json({ error: 'Action and target player are required.' });
  }

  const { staffName, staffId } = getStaffIdentity(req);
  const normId = normalizeServerId(serverId);
  const srv = SERVERS.find((s) => s.id === normId) || SERVERS[0];

  let command = '';
  let infractionType = null;

  switch (action) {
    case 'kick':
      command = `kick ${target} [PETABLOCKS] ${reason}`;
      infractionType = 'kick';
      break;

    case 'ban':
      command = `ban ${target} [PETABLOCKS] ${reason}`;
      infractionType = 'ban';
      break;

    case 'pardon':
    case 'unban':
      command = `pardon ${target}`;
      break;

    case 'warn':
      // Broadcast in-game warning to player via tellraw and screen title
      command = `tellraw ${target} {"text":"[STAFF WARNING] ","color":"red","bold":true,"extra":[{"text":"${reason}","color":"yellow"}]}`;
      // Also send subtitle
      executeCommandUnified(srv.id, `title ${target} subtitle {"text":"${reason}","color":"yellow"}`).catch(() => {});
      executeCommandUnified(srv.id, `title ${target} title {"text":"WARNING","color":"red","bold":true}`).catch(() => {});
      infractionType = 'warn';
      break;

    case 'mute':
      command = `tellraw ${target} {"text":"[MUTED] You have been muted by staff: ${reason}","color":"red"}`;
      infractionType = 'mute';
      break;

    case 'unmute':
      command = `tellraw ${target} {"text":"[UNMUTED] Your mute has been lifted.","color":"green"}`;
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

    case 'teleport':
      if (!destination) {
        return res.status(400).json({ error: 'Destination coordinate or player is required for teleport.' });
      }
      command = `tp ${target} ${destination}`;
      break;

    case 'clear_inventory':
      command = `clear ${target}`;
      break;

    case 'direct_message':
      const msg = customMessage || reason;
      command = `tellraw ${target} {"text":"[STAFF - ${staffName}] ","color":"gold","bold":true,"extra":[{"text":"${msg}","color":"white"}]}`;
      break;

    default:
      return res.status(400).json({ error: `Unsupported moderation action: ${action}` });
  }

  try {
    // 1. Dispatch command to target Minecraft server
    const result = await executeCommandUnified(srv.id, command);

    // 2. Add entry to console log buffer
    addServerLog(
      srv.id,
      result.success ? 'WARN' : 'ERROR',
      `[MODERATION] ${staffName} executed '${command}' -> ${result.output}`,
      'Moderation'
    );

    const db = await getAdminPool();

    // 3. Write immutable audit log
    await db.query(
      `INSERT INTO moderation_logs (server_id, action, target, executor, reason) VALUES (?, ?, ?, ?, ?)`,
      [srv.id, action, target, staffName, reason]
    );

    // 4. If action is an infraction (warn, ban, kick, mute), record it in player_infractions
    let infractionId = null;
    if (infractionType) {
      const [infractionRes] = await db.query(
        `INSERT INTO player_infractions (server_id, player_name, type, severity, reason, staff_name, staff_id, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [srv.id, target, infractionType, severity, reason, staffName, staffId]
      );
      infractionId = infractionRes.insertId;
    } else if (action === 'pardon' || action === 'unban' || action === 'unmute') {
      // Deactivate prior bans/mutes for this player
      const deactivateType = action === 'unmute' ? 'mute' : 'ban';
      await db.query(
        `UPDATE player_infractions SET active = 0 WHERE player_name = ? AND type = ? AND active = 1`,
        [target, deactivateType]
      );
    }

    // 5. Send Discord staff audit alert
    const alertColors = {
      ban: 0xef4444, // Red
      kick: 0xf97316, // Orange
      warn: 0xeab308, // Yellow
      mute: 0xa855f7, // Purple
      pardon: 0x22c55e, // Green
      unban: 0x22c55e,
      whitelist_add: 0x3b82f6,
      whitelist_remove: 0x64748b,
    };

    discordService.sendConsoleAlert(srv.id, {
      title: `🛡️ Moderation: ${action.toUpperCase()} on ${srv.name}`,
      description: `Staff member **${staffName}** executed \`${action}\` on player **${target}**.`,
      color: alertColors[action] || 0x06b6d4,
      fields: [
        { name: 'Target Player', value: `\`${target}\``, inline: true },
        { name: 'Staff Executor', value: `\`${staffName}\``, inline: true },
        { name: 'Server', value: `\`${srv.name}\``, inline: true },
        { name: 'Reason', value: reason || 'None provided', inline: false },
        { name: 'Command Output', value: `\`\`\`\n${result.output || 'No output'}\n\`\`\``, inline: false },
      ],
      footerText: 'PETABLOCKS Central Staff Moderation Engine',
    });

    res.json({
      success: result.success,
      output: result.output,
      viaModBridge: result.viaModBridge || false,
      serverId: srv.id,
      action,
      target,
      staffName,
      command,
      infractionId,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[API-MODERATION] Action execution failed:', err);
    res.status(500).json({ error: 'Failed to execute moderation action', message: err.message });
  }
});

/**
 * GET /api/moderation/infractions
 * Query and filter player sanctions (warns, mutes, bans, kicks, notes).
 */
router.get('/infractions', async (req, res) => {
  try {
    const {
      player = '',
      server_id = 'all',
      type = 'all',
      active = 'all',
      limit = 50,
      offset = 0,
    } = req.query;

    const db = await getAdminPool();

    let whereClauses = [];
    let params = [];

    if (player.trim()) {
      whereClauses.push('player_name LIKE ?');
      params.push(`%${player.trim()}%`);
    }

    if (server_id !== 'all') {
      whereClauses.push('server_id = ?');
      params.push(server_id);
    }

    if (type !== 'all') {
      whereClauses.push('type = ?');
      params.push(type);
    }

    if (active === 'true' || active === '1') {
      whereClauses.push('active = 1');
    } else if (active === 'false' || active === '0') {
      whereClauses.push('active = 0');
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [[countRow]] = await db.query(
      `SELECT COUNT(*) as total FROM player_infractions ${whereSql}`,
      params
    );

    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const safeOffset = Math.max(Number(offset) || 0, 0);

    const [rows] = await db.query(
      `SELECT id, server_id, player_uuid, player_name, type, severity, reason, staff_name, staff_id, active, expires_at, created_at
       FROM player_infractions
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, safeLimit, safeOffset]
    );

    res.json({
      total: countRow?.total || 0,
      limit: safeLimit,
      offset: safeOffset,
      infractions: rows,
    });
  } catch (err) {
    console.error('[API-MODERATION] Infractions query error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve player infractions', message: err.message });
  }
});

/**
 * POST /api/moderation/infractions
 * Issue a direct staff warning, note, or custom infraction without kicking.
 */
router.post('/infractions', async (req, res) => {
  try {
    const {
      serverId = 'fabric-main',
      playerName,
      playerUuid = null,
      type = 'warn',
      severity = 'medium',
      reason,
      notifyInGame = true,
    } = req.body;

    if (!playerName || !reason) {
      return res.status(400).json({ error: 'playerName and reason are required.' });
    }

    const { staffName, staffId } = getStaffIdentity(req);
    const db = await getAdminPool();

    const [result] = await db.query(
      `INSERT INTO player_infractions (server_id, player_uuid, player_name, type, severity, reason, staff_name, staff_id, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [serverId, playerUuid, playerName, type, severity, reason, staffName, staffId]
    );

    // Record in audit log
    await db.query(
      `INSERT INTO moderation_logs (server_id, action, target, executor, reason) VALUES (?, ?, ?, ?, ?)`,
      [serverId, `infraction_${type}`, playerName, staffName, reason]
    );

    // Send in-game notice if requested and type is warn
    if (notifyInGame && (type === 'warn' || type === 'note')) {
      const normId = normalizeServerId(serverId);
      executeCommandUnified(normId, `tellraw ${playerName} {"text":"[STAFF NOTE] ","color":"yellow","bold":true,"extra":[{"text":"${reason}","color":"gray"}]}`).catch(() => {});
    }

    res.json({
      success: true,
      id: result.insertId,
      playerName,
      type,
      severity,
      staffName,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[API-MODERATION] Create infraction error:', err.message);
    res.status(500).json({ error: 'Failed to create infraction', message: err.message });
  }
});

/**
 * PATCH /api/moderation/infractions/:id/pardon
 * Pardons/revokes an active infraction.
 */
router.patch('/infractions/:id/pardon', async (req, res) => {
  try {
    const { id } = req.params;
    const { staffName } = getStaffIdentity(req);
    const db = await getAdminPool();

    // Check infraction
    const [rows] = await db.query('SELECT * FROM player_infractions WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Infraction not found' });
    }

    const infraction = rows[0];

    await db.query('UPDATE player_infractions SET active = 0 WHERE id = ?', [id]);

    // Log to audit trail
    await db.query(
      `INSERT INTO moderation_logs (server_id, action, target, executor, reason) VALUES (?, ?, ?, ?, ?)`,
      [infraction.server_id, 'pardon_infraction', infraction.player_name, staffName, `Pardoned infraction #${id} (${infraction.type})`]
    );

    res.json({
      success: true,
      message: `Infraction #${id} for ${infraction.player_name} has been pardoned.`,
      pardonedBy: staffName,
    });
  } catch (err) {
    console.error('[API-MODERATION] Pardon error:', err.message);
    res.status(500).json({ error: 'Failed to pardon infraction', message: err.message });
  }
});

/**
 * GET /api/moderation/bans
 * Aggregated live ban list and whitelist from all servers.
 */
router.get('/bans', async (req, res) => {
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
  } catch (e) {
    console.warn('[API-MODERATION] Bans fetch warning:', e.message);
  }

  res.json({
    serverId: srv.id,
    serverName: srv.name,
    bans,
    whitelist,
  });
});

/**
 * POST /api/moderation/broadcast
 * Broadcast a network-wide or per-server announcement via tellraw or title.
 */
router.post('/broadcast', async (req, res) => {
  const { serverId = 'all', message, type = 'chat', color = 'gold' } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Broadcast message is required.' });
  }

  const { staffName } = getStaffIdentity(req);
  const targetServers =
    serverId === 'all'
      ? SERVERS
      : SERVERS.filter((s) => s.id === normalizeServerId(serverId));

  const results = await Promise.all(
    targetServers.map(async (srv) => {
      let cmd = '';
      if (type === 'title') {
        cmd = `title @a title {"text":"[ALERT] ${message.trim()}","color":"${color}","bold":true}`;
      } else if (type === 'actionbar') {
        cmd = `title @a actionbar {"text":"${message.trim()}","color":"${color}"}`;
      } else {
        cmd = `tellraw @a {"text":"[PETABLOCKS - ${staffName}] ","color":"aqua","bold":true,"extra":[{"text":"${message.trim()}","color":"${color}"}]}`;
      }
      const resExec = await executeCommandUnified(srv.id, cmd);
      addServerLog(srv.id, 'CHAT', `[BROADCAST - ${staffName}] ${message.trim()}`, 'Broadcast');
      return { serverId: srv.id, serverName: srv.name, ...resExec };
    })
  );

  // Log to audit trail
  try {
    const db = await getAdminPool();
    await db.query(
      `INSERT INTO moderation_logs (server_id, action, target, executor, reason) VALUES (?, ?, ?, ?, ?)`,
      [serverId, 'broadcast', '@everyone', staffName, `[${type.toUpperCase()}] ${message.trim()}`]
    );
  } catch (_) {}

  res.json({
    success: true,
    staffName,
    targeted: targetServers.length,
    results,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/moderation/chat/recent
 * Returns recent chat messages across all servers.
 */
router.get('/chat/recent', (req, res) => {
  const { limit = 100 } = req.query;
  const count = Math.min(parseInt(limit, 10) || 100, 200);

  const allLogs = Object.values(serverLogBuffers).flat();
  const chatLogs = allLogs.filter(
    (e) => e.source === 'Chat' || e.source === 'Game' || e.source === 'Broadcast' || e.source === 'Moderation'
  );

  chatLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  res.json({
    total: chatLogs.length,
    messages: chatLogs.slice(-count),
  });
});

/**
 * GET /api/moderation/chat/stream
 * Real-time SSE stream of in-game chat, broadcasts, and player security events.
 */
router.get('/chat/stream', (req, res) => {
  const targetServerId = req.query.serverId || 'all';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const client = { res, targetServerId };
  chatSseClients.add(client);

  // Send initial batch of recent chat messages
  const allLogs = Object.values(serverLogBuffers).flat();
  const initialChat = allLogs
    .filter((e) => e.source === 'Chat' || e.source === 'Game' || e.source === 'Broadcast')
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(-40);

  res.write(`data: ${JSON.stringify({ type: 'initial', messages: initialChat })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch (_) {}
  }, 20000);

  req.on('close', () => {
    clearInterval(heartbeat);
    chatSseClients.delete(client);
  });
});

module.exports = router;
