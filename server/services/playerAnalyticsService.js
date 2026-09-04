const mysql = require('mysql2/promise');

const rawDbUrl = process.env.MC_DATABASE_URL || process.env.DATABASE_URL || 'mysql://user:password@127.0.0.1:3306/petablocks';
const DB_URL = rawDbUrl.includes(':3307')
  ? rawDbUrl.replace(/\/minecraft(\?|$)/, '/petablocks$1')
  : rawDbUrl;

let pool = null;
const activeSessionsCache = new Map(); // key: `${serverId}:${uuid}` -> { sessionId, startTime, lastHeartbeat, username }

async function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      uri: DB_URL,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
  }
  return pool;
}

/**
 * Initialize database schema and import historical Plan records
 */
async function init() {
  try {
    const p = await getPool();

    // 1. Create analytics_players table
    await p.query(`
      CREATE TABLE IF NOT EXISTS analytics_players (
        uuid VARCHAR(36) PRIMARY KEY,
        username VARCHAR(64) NOT NULL,
        first_seen BIGINT NOT NULL,
        last_seen BIGINT NOT NULL,
        total_playtime_ms BIGINT DEFAULT 0,
        total_sessions INT DEFAULT 0,
        total_deaths INT DEFAULT 0,
        total_advancements INT DEFAULT 0,
        last_server_id VARCHAR(64),
        is_online TINYINT(1) DEFAULT 0,
        INDEX idx_username (username),
        INDEX idx_playtime (total_playtime_ms),
        INDEX idx_last_seen (last_seen)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 2. Create analytics_sessions table
    await p.query(`
      CREATE TABLE IF NOT EXISTS analytics_sessions (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        player_uuid VARCHAR(36) NOT NULL,
        server_id VARCHAR(64) NOT NULL,
        session_start BIGINT NOT NULL,
        session_end BIGINT,
        duration_ms BIGINT DEFAULT 0,
        last_ping INT DEFAULT 0,
        last_dimension VARCHAR(128),
        last_x DOUBLE,
        last_y DOUBLE,
        last_z DOUBLE,
        is_active TINYINT(1) DEFAULT 1,
        INDEX idx_player_uuid (player_uuid),
        INDEX idx_server_id (server_id),
        INDEX idx_session_start (session_start),
        INDEX idx_is_active (is_active)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 3. Create analytics_events table
    await p.query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        player_uuid VARCHAR(36),
        server_id VARCHAR(64),
        event_type VARCHAR(32) NOT NULL,
        event_detail TEXT,
        timestamp BIGINT NOT NULL,
        INDEX idx_player_events (player_uuid),
        INDEX idx_event_type (event_type),
        INDEX idx_timestamp (timestamp)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    console.log('[ANALYTICS] MariaDB Analytics tables verified.');

    // 4. Check if migration from Plan tables is needed
    const [existingCount] = await p.query('SELECT COUNT(*) as count FROM analytics_players');
    if (existingCount[0].count === 0) {
      await importHistoricalPlanData(p);
    }

    // 5. Clean up any stranded active sessions from previous restarts
    await reconcileOrphanedSessions();

    // 6. Schedule periodic session heartbeats & cleanup every 60s
    setInterval(reconcileOrphanedSessions, 60000);

  } catch (err) {
    console.error('[ANALYTICS] Initialization error:', err.message);
  }
}

/**
 * Import historical records from Plan tables so no past playtime is lost
 */
async function importHistoricalPlanData(p) {
  try {
    const [tables] = await p.query("SHOW TABLES LIKE 'plan_users'");
    if (tables.length === 0) {
      console.log('[ANALYTICS] No legacy plan_users table found, skipping migration.');
      return;
    }

    console.log('[ANALYTICS] Migrating historical Plan data into native analytics tables...');

    const [planUsers] = await p.query(`
      SELECT u.id as plan_user_id, u.uuid, u.name, u.registered
      FROM plan_users u
    `);

    for (const u of planUsers) {
      const [stats] = await p.query(`
        SELECT 
          COUNT(*) as total_sessions,
          COALESCE(SUM(CASE WHEN session_end > session_start THEN (session_end - session_start) ELSE 0 END), 0) as total_playtime_ms,
          COALESCE(SUM(deaths), 0) as total_deaths,
          COALESCE(MAX(session_end), u.registered) as last_seen
        FROM plan_sessions s
        WHERE s.user_id = ?
      `, [u.plan_user_id]);

      const stat = stats[0] || {};
      const totalPlaytime = Number(stat.total_playtime_ms || 0);
      const totalSessions = Number(stat.total_sessions || 0);
      const totalDeaths = Number(stat.total_deaths || 0);
      const lastSeen = Number(stat.last_seen || u.registered);

      await p.query(`
        INSERT INTO analytics_players 
          (uuid, username, first_seen, last_seen, total_playtime_ms, total_sessions, total_deaths, last_server_id, is_online)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'fabric-main', 0)
        ON DUPLICATE KEY UPDATE 
          username = VALUES(username),
          total_playtime_ms = VALUES(total_playtime_ms),
          total_sessions = VALUES(total_sessions),
          total_deaths = VALUES(total_deaths)
      `, [u.uuid, u.name, u.registered, lastSeen, totalPlaytime, totalSessions, totalDeaths]);
    }

    console.log(`[ANALYTICS] Successfully migrated ${planUsers.length} players from Plan history!`);

    await p.query(`
      INSERT INTO analytics_sessions (player_uuid, server_id, session_start, session_end, duration_ms, is_active)
      SELECT 
        u.uuid,
        'fabric-main',
        s.session_start,
        s.session_end,
        CASE WHEN s.session_end > s.session_start THEN (s.session_end - s.session_start) ELSE 0 END,
        0
      FROM plan_sessions s
      JOIN plan_users u ON s.user_id = u.id
      WHERE s.session_start IS NOT NULL AND s.session_end IS NOT NULL
    `);

    console.log('[ANALYTICS] Historical sessions successfully imported.');
  } catch (err) {
    console.error('[ANALYTICS] Plan migration warning:', err.message);
  }
}

/**
 * Handle Player Join Event
 */
async function recordPlayerJoin(serverId, { uuid, name }) {
  if (!uuid || !name) return;
  const now = Date.now();
  const sessionKey = `${serverId}:${uuid}`;

  try {
    const p = await getPool();

    await p.query(`
      INSERT INTO analytics_players (uuid, username, first_seen, last_seen, last_server_id, is_online)
      VALUES (?, ?, ?, ?, ?, 1)
      ON DUPLICATE KEY UPDATE
        username = VALUES(username),
        last_seen = VALUES(last_seen),
        last_server_id = VALUES(last_server_id),
        is_online = 1
    `, [uuid, name, now, now, serverId]);

    await p.query(`
      UPDATE analytics_sessions 
      SET is_active = 0, session_end = ?, duration_ms = (? - session_start)
      WHERE player_uuid = ? AND server_id = ? AND is_active = 1
    `, [now, now, uuid, serverId]);

    const [res] = await p.query(`
      INSERT INTO analytics_sessions (player_uuid, server_id, session_start, is_active)
      VALUES (?, ?, ?, 1)
    `, [uuid, serverId, now]);

    activeSessionsCache.set(sessionKey, {
      sessionId: res.insertId,
      startTime: now,
      lastHeartbeat: now,
      username: name
    });

    await p.query(`
      INSERT INTO analytics_events (player_uuid, server_id, event_type, event_detail, timestamp)
      VALUES (?, ?, 'join', 'Joined server', ?)
    `, [uuid, serverId, now]);

    console.log(`[ANALYTICS] Session started for ${name} (${uuid}) on ${serverId}`);
  } catch (err) {
    console.error('[ANALYTICS] Error recording player join:', err.message);
  }
}

/**
 * Handle Player Quit Event
 */
async function recordPlayerQuit(serverId, { uuid, name }) {
  if (!uuid) return;
  const now = Date.now();
  const sessionKey = `${serverId}:${uuid}`;

  try {
    const p = await getPool();

    const [active] = await p.query(`
      SELECT id, session_start FROM analytics_sessions
      WHERE player_uuid = ? AND server_id = ? AND is_active = 1
      ORDER BY id DESC LIMIT 1
    `, [uuid, serverId]);

    let durationMs = 0;
    if (active.length > 0) {
      const sess = active[0];
      durationMs = Math.max(0, now - Number(sess.session_start));

      await p.query(`
        UPDATE analytics_sessions
        SET session_end = ?, duration_ms = ?, is_active = 0
        WHERE id = ?
      `, [now, durationMs, sess.id]);
    } else {
      // Fallback: If session was prematurely closed by reconciliation,
      // recover the most recent session if it started recently
      const [recent] = await p.query(`
        SELECT id, session_start, duration_ms FROM analytics_sessions
        WHERE player_uuid = ? AND server_id = ?
        ORDER BY id DESC LIMIT 1
      `, [uuid, serverId]);

      if (recent.length > 0 && (now - Number(recent[0].session_start)) < 86400000) {
        const sess = recent[0];
        const oldDur = Number(sess.duration_ms || 0);
        const fullDur = Math.max(0, now - Number(sess.session_start));
        durationMs = Math.max(0, fullDur - oldDur); // Only add the delta to total playtime

        await p.query(`
          UPDATE analytics_sessions
          SET session_end = ?, duration_ms = ?, is_active = 0
          WHERE id = ?
        `, [now, fullDur, sess.id]);
      }
    }

    activeSessionsCache.delete(sessionKey);

    await p.query(`
      UPDATE analytics_players
      SET 
        last_seen = ?,
        is_online = 0,
        total_playtime_ms = total_playtime_ms + ?,
        total_sessions = total_sessions + 1
      WHERE uuid = ?
    `, [now, durationMs, uuid]);

    await p.query(`
      INSERT INTO analytics_events (player_uuid, server_id, event_type, event_detail, timestamp)
      VALUES (?, ?, 'leave', 'Left server', ?)
    `, [uuid, serverId, now]);

    console.log(`[ANALYTICS] Session ended for ${name || uuid} on ${serverId} (duration: ${(durationMs / 60000).toFixed(1)}m)`);
  } catch (err) {
    console.error('[ANALYTICS] Error recording player quit:', err.message);
  }
}

/**
 * Handle Player Death Event
 */
async function recordPlayerDeath(serverId, { uuid, name, deathMessage }) {
  if (!name) return;
  const now = Date.now();
  try {
    const p = await getPool();
    await p.query(`
      INSERT INTO analytics_events (player_uuid, server_id, event_type, event_detail, timestamp)
      VALUES (?, ?, 'death', ?, ?)
    `, [uuid || null, serverId, deathMessage || `${name} died`, now]);

    if (uuid) {
      await p.query(`
        UPDATE analytics_players SET total_deaths = total_deaths + 1 WHERE uuid = ?
      `, [uuid]);
    }
  } catch (err) {
    console.error('[ANALYTICS] Error recording player death:', err.message);
  }
}

/**
 * Handle Player Advancement Event
 */
async function recordPlayerAdvancement(serverId, { uuid, name, title }) {
  if (!name) return;
  const now = Date.now();
  try {
    const p = await getPool();
    await p.query(`
      INSERT INTO analytics_events (player_uuid, server_id, event_type, event_detail, timestamp)
      VALUES (?, ?, 'advancement', ?, ?)
    `, [uuid || null, serverId, title || 'Advancement Unlocked', now]);

    if (uuid) {
      await p.query(`
        UPDATE analytics_players SET total_advancements = total_advancements + 1 WHERE uuid = ?
      `, [uuid]);
    }
  } catch (err) {
    console.error('[ANALYTICS] Error recording player advancement:', err.message);
  }
}

/**
 * Handle Telemetry Sample Heartbeat
 */
async function recordTelemetrySample(serverId, playersSample) {
  if (!Array.isArray(playersSample)) return;
  const now = Date.now();

  try {
    const p = await getPool();

    for (const player of playersSample) {
      if (!player.uuid || !player.name) continue;
      const sessionKey = `${serverId}:${player.uuid}`;

      await p.query(`
        INSERT INTO analytics_players (uuid, username, first_seen, last_seen, last_server_id, is_online)
        VALUES (?, ?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
          username = VALUES(username),
          last_seen = VALUES(last_seen),
          last_server_id = VALUES(last_server_id),
          is_online = 1
      `, [player.uuid, player.name, now, now, serverId]);

      let cached = activeSessionsCache.get(sessionKey);
      if (!cached) {
        const [existing] = await p.query(`
          SELECT id, session_start FROM analytics_sessions 
          WHERE player_uuid = ? AND server_id = ? AND is_active = 1 
          ORDER BY id DESC LIMIT 1
        `, [player.uuid, serverId]);

        if (existing.length > 0) {
          cached = { sessionId: existing[0].id, startTime: existing[0].session_start, lastHeartbeat: now, username: player.name };
          activeSessionsCache.set(sessionKey, cached);
        } else {
          const [ins] = await p.query(`
            INSERT INTO analytics_sessions (player_uuid, server_id, session_start, is_active)
            VALUES (?, ?, ?, 1)
          `, [player.uuid, serverId, now]);
          cached = { sessionId: ins.insertId, startTime: now, lastHeartbeat: now, username: player.name };
          activeSessionsCache.set(sessionKey, cached);
        }
      }

      cached.lastHeartbeat = now;

      const pos = Array.isArray(player.pos) ? player.pos : [0, 0, 0];
      const liveDuration = Math.max(0, now - Number(cached.startTime || now));
      await p.query(`
        UPDATE analytics_sessions
        SET last_ping = ?, last_dimension = ?, last_x = ?, last_y = ?, last_z = ?,
            session_end = ?, duration_ms = ?
        WHERE id = ?
      `, [player.ping || 0, player.dimension || 'overworld', pos[0] || 0, pos[1] || 0, pos[2] || 0, now, liveDuration, cached.sessionId]);
    }
  } catch (err) {
    console.error('[ANALYTICS] Telemetry sample heartbeat error:', err.message);
  }
}

/**
 * Reconcile orphaned/stale sessions
 */
async function reconcileOrphanedSessions() {
  const cutoff = Date.now() - (3 * 60 * 1000);
  try {
    const p = await getPool();
    const [stale] = await p.query(`
      SELECT id, player_uuid, server_id, session_start, duration_ms FROM analytics_sessions
      WHERE is_active = 1
    `);

    for (const sess of stale) {
      const sessionKey = `${sess.server_id}:${sess.player_uuid}`;
      const cached = activeSessionsCache.get(sessionKey);

      if (!cached || cached.lastHeartbeat < cutoff) {
        let endTime = cached?.lastHeartbeat;
        if (!endTime || endTime <= Number(sess.session_start)) {
          if (sess.duration_ms && Number(sess.duration_ms) > 0) {
            endTime = Number(sess.session_start) + Number(sess.duration_ms);
          } else {
            endTime = Number(sess.session_start) + 60000;
          }
        }
        const duration = Math.max(0, endTime - Number(sess.session_start));

        await p.query(`
          UPDATE analytics_sessions 
          SET is_active = 0, session_end = ?, duration_ms = ?
          WHERE id = ?
        `, [endTime, duration, sess.id]);

        await p.query(`
          UPDATE analytics_players
          SET is_online = 0, total_playtime_ms = total_playtime_ms + ?, total_sessions = total_sessions + 1
          WHERE uuid = ?
        `, [duration, sess.player_uuid]);

        activeSessionsCache.delete(sessionKey);
      }
    }
  } catch (err) {
    console.error('[ANALYTICS] Session reconciliation error:', err.message);
  }
}

/**
 * Get Leaderboard
 */
async function getLeaderboard({ serverId = 'all', sortBy = 'playtime', limit = 25 } = {}) {
  const p = await getPool();
  const lim = Math.min(Math.max(1, parseInt(limit, 10) || 25), 100);

  if (serverId && serverId !== 'all') {
    const [rows] = await p.query(`
      SELECT 
        p.uuid,
        p.username,
        p.first_seen,
        p.last_seen,
        p.is_online,
        COALESCE(SUM(s.duration_ms), 0) as server_playtime_ms,
        COUNT(s.id) as server_sessions
      FROM analytics_players p
      JOIN analytics_sessions s ON p.uuid = s.player_uuid
      WHERE s.server_id = ?
      GROUP BY p.uuid, p.username, p.first_seen, p.last_seen, p.is_online
      ORDER BY server_playtime_ms DESC
      LIMIT ?
    `, [serverId, lim]);

    return rows.map((r, i) => ({
      rank: i + 1,
      uuid: r.uuid,
      username: r.username,
      avatarUrl: `https://mc-heads.net/avatar/${r.uuid}/64`,
      isOnline: Boolean(r.is_online),
      playtimeMs: Number(r.server_playtime_ms || 0),
      playtimeFormatted: formatDuration(r.server_playtime_ms),
      sessions: Number(r.server_sessions || 0),
      firstSeen: Number(r.first_seen),
      lastSeen: Number(r.last_seen)
    }));
  }

  let orderCol = 'total_playtime_ms';
  if (sortBy === 'deaths') orderCol = 'total_deaths';
  else if (sortBy === 'advancements') orderCol = 'total_advancements';
  else if (sortBy === 'sessions') orderCol = 'total_sessions';

  const [rows] = await p.query(`
    SELECT uuid, username, first_seen, last_seen, total_playtime_ms, total_sessions, total_deaths, total_advancements, last_server_id, is_online
    FROM analytics_players
    ORDER BY ${orderCol} DESC
    LIMIT ?
  `, [lim]);

  return rows.map((r, i) => ({
    rank: i + 1,
    uuid: r.uuid,
    username: r.username,
    avatarUrl: `https://mc-heads.net/avatar/${r.uuid}/64`,
    isOnline: Boolean(r.is_online),
    lastServerId: r.last_server_id,
    playtimeMs: Number(r.total_playtime_ms || 0),
    playtimeFormatted: formatDuration(r.total_playtime_ms),
    sessions: Number(r.total_sessions || 0),
    deaths: Number(r.total_deaths || 0),
    advancements: Number(r.total_advancements || 0),
    firstSeen: Number(r.first_seen),
    lastSeen: Number(r.last_seen)
  }));
}

/**
 * Get Comprehensive Player Profile
 */
async function getPlayerProfile(uuidOrName) {
  const p = await getPool();

  const [players] = await p.query(`
    SELECT * FROM analytics_players
    WHERE uuid = ? OR username = ?
    LIMIT 1
  `, [uuidOrName, uuidOrName]);

  if (players.length === 0) return null;
  const player = players[0];

  const [serverBreakdown] = await p.query(`
    SELECT 
      server_id,
      COALESCE(SUM(duration_ms), 0) as playtime_ms,
      COUNT(id) as sessions
    FROM analytics_sessions
    WHERE player_uuid = ?
    GROUP BY server_id
  `, [player.uuid]);

  const [recentSessions] = await p.query(`
    SELECT id, server_id, session_start, session_end, duration_ms, last_dimension, is_active
    FROM analytics_sessions
    WHERE player_uuid = ?
    ORDER BY session_start DESC
    LIMIT 10
  `, [player.uuid]);

  const [recentEvents] = await p.query(`
    SELECT id, server_id, event_type, event_detail, timestamp
    FROM analytics_events
    WHERE player_uuid = ?
    ORDER BY timestamp DESC
    LIMIT 15
  `, [player.uuid]);

  return {
    uuid: player.uuid,
    username: player.username,
    avatarUrl: `https://mc-heads.net/avatar/${player.uuid}/128`,
    bodyUrl: `https://mc-heads.net/body/${player.uuid}/200`,
    isOnline: Boolean(player.is_online),
    lastServerId: player.last_server_id,
    firstSeen: Number(player.first_seen),
    lastSeen: Number(player.last_seen),
    totalPlaytimeMs: Number(player.total_playtime_ms),
    totalPlaytimeFormatted: formatDuration(player.total_playtime_ms),
    totalSessions: Number(player.total_sessions),
    totalDeaths: Number(player.total_deaths),
    totalAdvancements: Number(player.total_advancements),
    servers: serverBreakdown.map(s => ({
      serverId: s.server_id,
      playtimeMs: Number(s.playtime_ms),
      playtimeFormatted: formatDuration(s.playtime_ms),
      sessions: Number(s.sessions)
    })),
    recentSessions: recentSessions.map(s => ({
      id: s.id,
      serverId: s.server_id,
      start: Number(s.session_start),
      end: s.session_end ? Number(s.session_end) : null,
      durationMs: Number(s.duration_ms),
      durationFormatted: formatDuration(s.duration_ms),
      dimension: s.last_dimension,
      isActive: Boolean(s.is_active)
    })),
    recentEvents: recentEvents.map(e => ({
      id: e.id,
      serverId: e.server_id,
      type: e.event_type,
      detail: e.event_detail,
      timestamp: Number(e.timestamp)
    }))
  };
}

/**
 * Get Network Analytics Overview
 */
async function getNetworkOverview() {
  const p = await getPool();

  const [totals] = await p.query(`
    SELECT 
      COUNT(*) as total_players,
      COALESCE(SUM(total_playtime_ms), 0) as network_playtime_ms,
      COALESCE(SUM(total_sessions), 0) as network_sessions,
      COALESCE(SUM(total_deaths), 0) as network_deaths,
      COALESCE(SUM(total_advancements), 0) as network_advancements,
      COALESCE(SUM(CASE WHEN is_online = 1 THEN 1 ELSE 0 END), 0) as currently_online
    FROM analytics_players
  `);

  const [serverStats] = await p.query(`
    SELECT 
      server_id,
      COUNT(DISTINCT player_uuid) as unique_players,
      COALESCE(SUM(duration_ms), 0) as total_playtime_ms,
      COUNT(id) as total_sessions
    FROM analytics_sessions
    GROUP BY server_id
  `);

  const tot = totals[0] || {};
  return {
    totalPlayers: Number(tot.total_players || 0),
    totalPlaytimeMs: Number(tot.network_playtime_ms || 0),
    totalPlaytimeHours: Math.round(Number(tot.network_playtime_ms || 0) / 3600000),
    totalPlaytimeFormatted: formatDuration(tot.network_playtime_ms),
    totalSessions: Number(tot.network_sessions || 0),
    totalDeaths: Number(tot.network_deaths || 0),
    totalAdvancements: Number(tot.network_advancements || 0),
    currentlyOnline: Number(tot.currently_online || 0),
    serverDistribution: serverStats.map(s => ({
      serverId: s.server_id,
      uniquePlayers: Number(s.unique_players),
      playtimeMs: Number(s.total_playtime_ms),
      playtimeFormatted: formatDuration(s.total_playtime_ms),
      sessions: Number(s.total_sessions)
    }))
  };
}

/**
 * Search Players
 */
async function searchPlayers(query) {
  if (!query || query.trim().length === 0) return [];
  const p = await getPool();
  const q = `%${query.trim()}%`;

  const [rows] = await p.query(`
    SELECT uuid, username, total_playtime_ms, last_server_id, is_online, last_seen
    FROM analytics_players
    WHERE username LIKE ? OR uuid LIKE ?
    ORDER BY is_online DESC, total_playtime_ms DESC
    LIMIT 10
  `, [q, q]);

  return rows.map(r => ({
    uuid: r.uuid,
    username: r.username,
    avatarUrl: `https://mc-heads.net/avatar/${r.uuid}/48`,
    playtimeFormatted: formatDuration(r.total_playtime_ms),
    lastServerId: r.last_server_id,
    isOnline: Boolean(r.is_online),
    lastSeen: Number(r.last_seen)
  }));
}

function formatDuration(ms) {
  const totalSeconds = Math.floor((Number(ms) || 0) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

module.exports = {
  init,
  recordPlayerJoin,
  recordPlayerQuit,
  recordPlayerDeath,
  recordPlayerAdvancement,
  recordTelemetrySample,
  getLeaderboard,
  getPlayerProfile,
  getNetworkOverview,
  searchPlayers
};
