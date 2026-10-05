const mysql = require('mysql2/promise');

/** DB credentials come from the environment only, e.g. MC_DATABASE_URL=mysql://user:pass@host:3307/petablocks */
function requireDatabaseUrl() {
  const url = process.env.MC_DATABASE_URL;
  if (!url) throw new Error('MC_DATABASE_URL is not set');
  return url;
}


async function syncExactTotals() {
  const conn = await mysql.createConnection(requireDatabaseUrl());
  console.log('[SYNC] Connected to MariaDB.');

  // Group by player_uuid in analytics_sessions
  const [sessionSums] = await conn.query(`
    SELECT 
      player_uuid,
      COUNT(id) as sess_count,
      COALESCE(SUM(duration_ms), 0) as total_ms,
      MIN(session_start) as first_seen,
      MAX(COALESCE(session_end, session_start)) as last_seen
    FROM analytics_sessions
    GROUP BY player_uuid
  `);

  for (const s of sessionSums) {
    await conn.query(`
      UPDATE analytics_players 
      SET 
        total_playtime_ms = ?,
        total_sessions = ?,
        first_seen = LEAST(COALESCE(first_seen, ?), ?),
        last_seen = GREATEST(COALESCE(last_seen, ?), ?)
      WHERE uuid = ?
    `, [s.total_ms, s.sess_count, s.first_seen, s.first_seen, s.last_seen, s.last_seen, s.player_uuid]);
  }

  const [apTotal] = await conn.query('SELECT COUNT(*) as players, SUM(total_playtime_ms) as ms, SUM(total_sessions) as sess FROM analytics_players');
  console.log('[EXACT TOTALS]:', {
    players: apTotal[0].players,
    hours: (Number(apTotal[0].ms) / 3600000).toFixed(1),
    sessions: apTotal[0].sess
  });

  const [top] = await conn.query('SELECT username, total_playtime_ms, total_sessions FROM analytics_players ORDER BY total_playtime_ms DESC LIMIT 8');
  console.log('[TOP PLAYERS]:', top.map(t => ({
    user: t.username,
    hours: (t.total_playtime_ms / 3600000).toFixed(1),
    sessions: t.total_sessions
  })));

  await conn.end();
}

syncExactTotals().catch(console.error);
