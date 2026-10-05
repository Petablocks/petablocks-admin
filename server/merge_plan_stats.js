const mysql = require('mysql2/promise');

async function migrate() {
  const conn = await mysql.createConnection('mysql://petablocks:mOgsrNJ6lEQQXx77YnPcVd0jxAmQDRud@10.20.110.117:3307/petablocks');
  console.log('[MIGRATION] Connected to MariaDB on 10.20.110.117:3307');

  // 1. Calculate Plan metrics per user
  const [planUsers] = await conn.query('SELECT u.id as plan_user_id, u.uuid, u.name, u.registered FROM plan_users u');

  for (const u of planUsers) {
    const [stats] = await conn.query(
      'SELECT COUNT(*) as total_sessions, COALESCE(SUM(CASE WHEN session_end > session_start THEN (session_end - session_start) ELSE 0 END), 0) as total_playtime_ms, COALESCE(SUM(deaths), 0) as total_deaths, MAX(session_end) as last_seen FROM plan_sessions s WHERE s.user_id = ?',
      [u.plan_user_id]
    );

    const stat = stats[0] || {};
    const planPlaytime = Number(stat.total_playtime_ms || 0);
    const planSessions = Number(stat.total_sessions || 0);
    const planDeaths = Number(stat.total_deaths || 0);
    const planLastSeen = Number(stat.last_seen || u.registered);

    // Check if player exists in analytics_players
    const [existing] = await conn.query('SELECT * FROM analytics_players WHERE uuid = ?', [u.uuid]);

    if (existing.length === 0) {
      console.log('Inserting Plan player:', u.name, u.uuid, Math.round(planPlaytime / 3600000) + 'h', planSessions + ' sess');
      await conn.query(
        'INSERT INTO analytics_players (uuid, username, first_seen, last_seen, total_playtime_ms, total_sessions, total_deaths, last_server_id, is_online) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)',
        [u.uuid, u.name, u.registered, planLastSeen, planPlaytime, planSessions, planDeaths, 'fabric-main']
      );
    } else {
      // Player is in both! Sum existing sessions on Create 2 and past sessions from Plan
      const [anSess] = await conn.query('SELECT COUNT(*) as cnt, COALESCE(SUM(duration_ms), 0) as ms FROM analytics_sessions WHERE player_uuid = ?', [u.uuid]);
      const anPlaytime = Number(anSess[0].ms || 0);
      const anSessions = Number(anSess[0].cnt || 0);

      const combinedPlaytime = planPlaytime + anPlaytime;
      const combinedSessions = planSessions + anSessions;
      const combinedLastSeen = Math.max(Number(existing[0].last_seen || 0), planLastSeen);
      const combinedFirstSeen = Math.min(Number(existing[0].first_seen || planLastSeen), Number(u.registered));
      const combinedDeaths = Number(existing[0].total_deaths || 0) + planDeaths;

      console.log('Merging Player:', u.name, 'Plan=' + Math.round(planPlaytime / 3600000) + 'h + Analytics=' + Math.round(anPlaytime / 3600000) + 'h => Combined=' + Math.round(combinedPlaytime / 3600000) + 'h (' + combinedSessions + ' sess)');

      await conn.query(
        'UPDATE analytics_players SET username = ?, first_seen = ?, last_seen = ?, total_playtime_ms = ?, total_sessions = ?, total_deaths = ? WHERE uuid = ?',
        [u.name, combinedFirstSeen, combinedLastSeen, combinedPlaytime, combinedSessions, combinedDeaths, u.uuid]
      );
    }
  }

  // 2. Import plan_sessions into analytics_sessions for historical records (if not already imported)
  const [existingFabricSessions] = await conn.query("SELECT COUNT(*) as cnt FROM analytics_sessions WHERE server_id = 'fabric-main'");
  if (existingFabricSessions[0].cnt === 0) {
    console.log('Importing plan_sessions into analytics_sessions...');
    const [imported] = await conn.query(
      "INSERT INTO analytics_sessions (player_uuid, server_id, session_start, session_end, duration_ms, is_active) SELECT u.uuid, 'fabric-main', s.session_start, s.session_end, CASE WHEN s.session_end > s.session_start THEN (s.session_end - s.session_start) ELSE 0 END, 0 FROM plan_sessions s JOIN plan_users u ON s.user_id = u.id WHERE s.session_start IS NOT NULL AND s.session_end IS NOT NULL"
    );
    console.log('Imported sessions count:', imported.affectedRows);
  } else {
    console.log('fabric-main sessions already present in analytics_sessions, skipping insert.');
  }

  // 3. Sync player_stats table as well for backwards compatibility!
  const [allPlayers] = await conn.query('SELECT uuid, username, total_playtime_ms, total_deaths, first_seen, last_seen FROM analytics_players');
  for (const pl of allPlayers) {
    const sec = Math.floor(Number(pl.total_playtime_ms || 0) / 1000);
    await conn.query(
      'INSERT INTO player_stats (uuid, username, playtime_seconds, kills, deaths, first_seen, last_seen) VALUES (?, ?, ?, 0, ?, ?, ?) ON DUPLICATE KEY UPDATE username = VALUES(username), playtime_seconds = VALUES(playtime_seconds), deaths = VALUES(deaths), last_seen = VALUES(last_seen)',
      [pl.uuid, pl.username, sec, pl.total_deaths, pl.first_seen, pl.last_seen]
    );
  }

  console.log('[MIGRATION] Complete!');

  const [apTotal] = await conn.query('SELECT COUNT(*) as players, SUM(total_playtime_ms) as ms, SUM(total_sessions) as sess FROM analytics_players');
  console.log('[NEW TOTALS] analytics_players summary:', {
    players: apTotal[0].players,
    hours: Math.floor(Number(apTotal[0].ms) / 3600000),
    sessions: apTotal[0].sess
  });

  await conn.end();
}

migrate().catch(console.error);
