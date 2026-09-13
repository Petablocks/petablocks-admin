/**
 * PETABLOCKS Community Events Engine
 *
 * Manages automated event scheduling, in-game title/sound broadcasts,
 * and Discord announcements in #📢-community-events.
 */

const mysql = require('mysql2/promise');
const { executeCommandUnified } = require('../routes/minecraft');
const discordService = require('./discordWebhookService');

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
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return pool;
}

const EVENTS_DISCORD_CHANNEL = process.env.DISCORD_EVENTS_CHANNEL_ID || '1381349817875300463';

/**
 * List all events (optionally filtered by status)
 */
async function getEvents(filterStatus = null) {
  const p = await getPool();
  let query = 'SELECT * FROM community_events';
  const params = [];
  if (filterStatus && filterStatus !== 'ALL') {
    query += ' WHERE status = ?';
    params.push(filterStatus);
  }
  query += ' ORDER BY starts_at ASC';
  const [rows] = await p.query(query, params);
  return rows;
}

/**
 * Create a new community event
 */
async function createEvent(eventData) {
  const p = await getPool();
  const eventCode = eventData.event_code || `EVT-${Date.now().toString(36).toUpperCase()}`;

  const [res] = await p.query(
    `INSERT INTO community_events
      (event_code, title, description, server_id, event_type, status, starts_at, ends_at, created_by, prizes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      eventCode,
      eventData.title,
      eventData.description || '',
      eventData.server_id || 'fabric-main',
      eventData.event_type || 'COMMUNITY_GATHERING',
      eventData.status || 'SCHEDULED',
      new Date(eventData.starts_at),
      eventData.ends_at ? new Date(eventData.ends_at) : null,
      eventData.created_by || 'Admin',
      eventData.prizes || null,
    ]
  );

  return { id: res.insertId, eventCode, ...eventData };
}

/**
 * Update event status or details
 */
async function updateEvent(id, updates) {
  const p = await getPool();
  const fields = [];
  const values = [];

  const allowed = ['title', 'description', 'server_id', 'event_type', 'status', 'starts_at', 'ends_at', 'prizes'];
  allowed.forEach((k) => {
    if (updates[k] !== undefined) {
      fields.push(`${k} = ?`);
      values.push(k.endsWith('_at') && updates[k] ? new Date(updates[k]) : updates[k]);
    }
  });

  if (fields.length === 0) return { updated: false };
  values.push(id);

  await p.query(`UPDATE community_events SET ${fields.join(', ')} WHERE id = ?`, values);
  return { updated: true };
}

/**
 * Broadcast event start in-game and notify Discord
 */
async function announceEvent(id) {
  const p = await getPool();
  const [rows] = await p.query('SELECT * FROM community_events WHERE id = ?', [id]);
  if (!rows || rows.length === 0) throw new Error('Event not found');
  const ev = rows[0];

  const targetServers = ev.server_id === 'ALL'
    ? ['fabric-main', 'create-2', 'patreon-creative']
    : [ev.server_id];

  // 1. In-game broadcast via RCON
  for (const srvId of targetServers) {
    try {
      await executeCommandUnified(
        srvId,
        `tellraw @a [{"text":"[","color":"gold"},{"text":"EVENT","color":"yellow","bold":true},{"text":"] ","color":"gold"},{"text":"${ev.title}","color":"aqua","bold":true},{"text":" - ${ev.description}","color":"white"}]`
      );
      await executeCommandUnified(
        srvId,
        `title @a subtitle {"text":"${ev.description.substring(0, 50)}","color":"aqua"}`
      );
      await executeCommandUnified(
        srvId,
        `title @a title {"text":"EVENT: ${ev.title.substring(0, 30)}","color":"gold","bold":true}`
      );
      await executeCommandUnified(srvId, 'playsound minecraft:ui.toast.challenge_complete master @a ~ ~ ~ 1 1');
    } catch (rconErr) {
      console.error(`[CommunityEvents] RCON broadcast error on ${srvId}:`, rconErr.message);
    }
  }

  // 2. Mark announcement as sent
  await p.query('UPDATE community_events SET in_game_announcement_sent = TRUE, status = "ACTIVE" WHERE id = ?', [id]);

  // 3. Dispatch to pb-bot event listener or Discord webhook
  try {
    const botEventUrl = process.env.BOT_EVENT_URL || 'http://pb-bot:3001/events';
    await fetch(botEventUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelId: EVENTS_DISCORD_CHANNEL,
        embed: {
          title: `🎉 COMMUNITY EVENT STARTED: ${ev.title}`,
          description: `${ev.description}\n\n**Realm**: \`${ev.server_id}\`\n**Prizes**: ${ev.prizes || 'Glory & Discord Roles'}\n\nJoin now at \`play.petablocks.com\`!`,
          color: 0xffaa00,
          footer: { text: `Event Code: ${ev.event_code} • PETABLOCKS Events` },
          timestamp: new Date().toISOString(),
        },
      }),
    }).catch(() => {});
  } catch (_) {}

  return { success: true, message: `Event ${ev.event_code} announced to players!` };
}

module.exports = {
  getEvents,
  createEvent,
  updateEvent,
  announceEvent,
};
