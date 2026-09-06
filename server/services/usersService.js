const mysql = require('mysql2/promise');

const rawDbUrl = process.env.MC_DATABASE_URL || process.env.DATABASE_URL || 'mysql://user:password@127.0.0.1:3306/petablocks';
const DB_URL = rawDbUrl.includes(':3307')
  ? rawDbUrl.replace(/\/minecraft(\?|$)/, '/petablocks$1')
  : rawDbUrl;

let pool = null;

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

function formatDuration(ms) {
  if (!ms || ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Get high-level registered users overview metrics
 */
async function getUsersOverview() {
  const p = await getPool();
  const now = Date.now();

  const [[counts]] = await p.query(`
    SELECT 
      COUNT(*) AS totalUsers,
      SUM(CASE WHEN primary_provider = 'discord' THEN 1 ELSE 0 END) AS discordUsers,
      SUM(CASE WHEN primary_provider = 'microsoft' THEN 1 ELSE 0 END) AS microsoftUsers,
      SUM(CASE WHEN minecraft_uuid IS NOT NULL AND minecraft_uuid != '' THEN 1 ELSE 0 END) AS linkedUsers,
      SUM(CASE WHEN minecraft_uuid IS NULL OR minecraft_uuid = '' THEN 1 ELSE 0 END) AS unlinkedUsers,
      SUM(CASE WHEN discord_in_guild = 1 THEN 1 ELSE 0 END) AS inGuildUsers,
      SUM(CASE WHEN role = 'Owner & Founder' THEN 1 ELSE 0 END) AS ownerCount,
      SUM(CASE WHEN role IN ('Staff', 'Moderator', 'Admin') THEN 1 ELSE 0 END) AS staffCount
    FROM auth_users
  `);

  let activeSessions = 0;
  try {
    const [[sessRow]] = await p.query('SELECT COUNT(*) as count FROM auth_sessions WHERE expires_at > ?', [now]);
    activeSessions = Number(sessRow?.count || 0);
  } catch (_) {}

  let pendingCodes = 0;
  try {
    const [[codeRow]] = await p.query('SELECT COUNT(*) as count FROM auth_link_codes WHERE expires_at > ?', [now]);
    pendingCodes = Number(codeRow?.count || 0);
  } catch (_) {}

  const total = Number(counts?.totalUsers || 0);
  const linked = Number(counts?.linkedUsers || 0);
  const discord = Number(counts?.discordUsers || 0);
  const inGuild = Number(counts?.inGuildUsers || 0);

  return {
    totalUsers: total,
    discordUsers: discord,
    microsoftUsers: Number(counts?.microsoftUsers || 0),
    linkedUsers: linked,
    unlinkedUsers: Number(counts?.unlinkedUsers || 0),
    linkPercentage: total > 0 ? Math.round((linked / total) * 100) : 0,
    inGuildUsers: inGuild,
    guildMembershipRate: discord > 0 ? Math.round((inGuild / discord) * 100) : 0,
    ownerCount: Number(counts?.ownerCount || 0),
    staffCount: Number(counts?.staffCount || 0),
    activeWebSessions: activeSessions,
    pendingLinkCodes: pendingCodes,
    timestamp: now,
  };
}

/**
 * Get searchable, filterable list of registered users
 */
async function getUsersList({ search = '', provider = 'all', linked = 'all', role = 'all', limit = 50, offset = 0 } = {}) {
  const p = await getPool();
  const conditions = [];
  const params = [];

  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push('(u.username LIKE ? OR u.email LIKE ? OR u.discord_username LIKE ? OR u.minecraft_username LIKE ? OR u.minecraft_uuid LIKE ?)');
    params.push(term, term, term, term, term);
  }

  if (provider && provider !== 'all') {
    conditions.push('u.primary_provider = ?');
    params.push(provider);
  }

  if (linked === 'linked') {
    conditions.push('(u.minecraft_uuid IS NOT NULL AND u.minecraft_uuid != "")');
  } else if (linked === 'unlinked') {
    conditions.push('(u.minecraft_uuid IS NULL OR u.minecraft_uuid = "")');
  }

  if (role && role !== 'all') {
    conditions.push('u.role = ?');
    params.push(role);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  // Get total count matching filters
  const [[{ totalCount }]] = await p.query(`SELECT COUNT(*) AS totalCount FROM auth_users u ${whereClause}`, params);

  // Query users with joined player analytics data
  const queryParams = [...params, Number(limit), Number(offset)];
  const [rows] = await p.query(`
    SELECT 
      u.id,
      u.username,
      u.email,
      u.primary_provider,
      u.avatar_url,
      u.discord_id,
      u.discord_username,
      u.discord_in_guild,
      u.microsoft_id,
      u.minecraft_uuid,
      u.minecraft_username,
      u.role,
      u.custom_status,
      u.playstyle_tags,
      u.created_at,
      u.updated_at,
      p.total_playtime_ms,
      p.total_sessions,
      p.total_deaths,
      p.is_online
    FROM auth_users u
    LEFT JOIN analytics_players p ON u.minecraft_uuid = p.uuid
    ${whereClause}
    ORDER BY u.updated_at DESC, u.created_at DESC
    LIMIT ? OFFSET ?
  `, queryParams);

  const users = rows.map((r) => ({
    id: r.id,
    username: r.username,
    email: r.email,
    provider: r.primary_provider,
    avatarUrl: r.avatar_url,
    discord: r.discord_id ? {
      id: r.discord_id,
      username: r.discord_username,
      inGuild: Boolean(r.discord_in_guild),
    } : null,
    microsoft: r.microsoft_id ? {
      id: r.microsoft_id,
    } : null,
    minecraft: r.minecraft_uuid ? {
      uuid: r.minecraft_uuid,
      username: r.minecraft_username,
      headUrl: `https://mc-heads.net/avatar/${r.minecraft_uuid}/32`,
      isOnline: Boolean(r.is_online),
      totalPlaytimeFormatted: formatDuration(r.total_playtime_ms),
      totalSessions: Number(r.total_sessions || 0),
      totalDeaths: Number(r.total_deaths || 0),
    } : null,
    role: r.role || 'Player',
    customStatus: r.custom_status,
    playstyleTags: r.playstyle_tags ? r.playstyle_tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    createdAt: Number(r.created_at || 0),
    updatedAt: Number(r.updated_at || 0),
  }));

  return {
    total: Number(totalCount || 0),
    limit: Number(limit),
    offset: Number(offset),
    users,
  };
}

/**
 * Get detailed metadata, active sessions, and analytics for a single user
 */
async function getUserDetails(userId) {
  const p = await getPool();
  const now = Date.now();

  const [users] = await p.query('SELECT * FROM auth_users WHERE id = ? LIMIT 1', [userId]);
  if (users.length === 0) return null;
  const user = users[0];

  // Active web sessions
  let sessions = [];
  try {
    const [sessRows] = await p.query(
      'SELECT id, ip_hash, user_agent, created_at, expires_at FROM auth_sessions WHERE user_id = ? AND expires_at > ? ORDER BY created_at DESC LIMIT 10',
      [userId, now]
    );
    sessions = sessRows.map((s) => ({
      id: s.id,
      ipSubnet: s.ip_hash ? `${s.ip_hash.slice(0, 8)}...` : 'unknown',
      userAgent: s.user_agent || 'Unknown browser',
      createdAt: Number(s.created_at || 0),
      expiresAt: Number(s.expires_at || 0),
    }));
  } catch (_) {}

  // Minecraft player analytics if linked
  let minecraftDetails = null;
  if (user.minecraft_uuid) {
    const [players] = await p.query('SELECT * FROM analytics_players WHERE uuid = ? LIMIT 1', [user.minecraft_uuid]);
    const player = players[0] || null;

    const [servers] = await p.query(`
      SELECT server_id, COALESCE(SUM(duration_ms), 0) as playtime_ms, COUNT(id) as sessions
      FROM analytics_sessions
      WHERE player_uuid = ?
      GROUP BY server_id
      ORDER BY playtime_ms DESC
    `, [user.minecraft_uuid]);

    minecraftDetails = {
      uuid: user.minecraft_uuid,
      username: user.minecraft_username,
      avatarUrl: `https://mc-heads.net/avatar/${user.minecraft_uuid}/64`,
      bodyUrl: `https://mc-heads.net/body/${user.minecraft_uuid}/200`,
      skinUrl: `https://textures.minecraft.net/texture/614783837e7cf4863a345ee02b33a073681717dfa20e9b150583cd6929070d06`,
      isOnline: Boolean(player?.is_online),
      firstSeen: Number(player?.first_seen || 0),
      lastSeen: Number(player?.last_seen || 0),
      totalPlaytimeFormatted: formatDuration(player?.total_playtime_ms),
      totalSessions: Number(player?.total_sessions || 0),
      totalDeaths: Number(player?.total_deaths || 0),
      totalAdvancements: Number(player?.total_advancements || 0),
      servers: servers.map((s) => ({
        serverId: s.server_id,
        playtimeFormatted: formatDuration(s.playtime_ms),
        sessions: Number(s.sessions || 0),
      })),
    };
  }

  // Check for pending in-game link codes
  let pendingLinkCode = null;
  if (user.minecraft_uuid) {
    try {
      const [codes] = await p.query(
        'SELECT code, expires_at FROM auth_link_codes WHERE minecraft_uuid = ? AND expires_at > ? LIMIT 1',
        [user.minecraft_uuid, now]
      );
      if (codes.length > 0) {
        pendingLinkCode = {
          code: codes[0].code,
          expiresAt: Number(codes[0].expires_at),
        };
      }
    } catch (_) {}
  }

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    primaryProvider: user.primary_provider,
    avatarUrl: user.avatar_url,
    discord: user.discord_id ? {
      id: user.discord_id,
      username: user.discord_username,
      inGuild: Boolean(user.discord_in_guild),
    } : null,
    microsoft: user.microsoft_id ? {
      id: user.microsoft_id,
    } : null,
    minecraft: minecraftDetails,
    role: user.role || 'Player',
    bio: user.bio,
    customStatus: user.custom_status,
    playstyleTags: user.playstyle_tags ? user.playstyle_tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
    youtubeUrl: user.youtube_url,
    founderBroadcast: user.founder_broadcast,
    createdAt: Number(user.created_at || 0),
    updatedAt: Number(user.updated_at || 0),
    activeSessions: sessions,
    pendingLinkCode,
  };
}

/**
 * Update user role (e.g. promote to Staff, Moderator, VIP)
 */
async function updateUserRole(userId, newRole, issuer = 'Admin') {
  const p = await getPool();
  const ALLOWED_ROLES = ['Owner & Founder', 'Admin', 'Staff', 'Moderator', 'VIP', 'Player'];

  if (!ALLOWED_ROLES.includes(newRole)) {
    throw new Error(`Invalid role. Allowed roles: ${ALLOWED_ROLES.join(', ')}`);
  }

  const [users] = await p.query('SELECT role, username FROM auth_users WHERE id = ? LIMIT 1', [userId]);
  if (users.length === 0) throw new Error('User not found');
  const prevRole = users[0].role || 'Player';

  await p.query('UPDATE auth_users SET role = ? WHERE id = ?', [newRole, userId]);

  // Log to admin audit logs if table exists
  try {
    await p.query(`
      INSERT INTO admin_audit_logs (action, target_user, details, issuer, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `, [
      'UPDATE_USER_ROLE',
      users[0].username,
      JSON.stringify({ previousRole: prevRole, newRole }),
      issuer,
      Date.now(),
    ]);
  } catch (_) {}

  return getUserDetails(userId);
}

module.exports = {
  getUsersOverview,
  getUsersList,
  getUserDetails,
  updateUserRole,
};
