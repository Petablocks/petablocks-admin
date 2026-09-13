/**
 * PETABLOCKS Community Events Engine
 *
 * Manages automated event scheduling, in-game title/sound broadcasts,
 * and Discord announcements in #📢-community-events.
 */

const mysql = require('mysql2/promise');
const { executeCommandUnified } = require('../routes/minecraft');

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
    params.push(filterStatus.toLowerCase());
  }
  query += ' ORDER BY scheduled_start ASC';
  const [rows] = await p.query(query, params);
  return rows;
}

/**
 * Create a new community event
 */
async function createEvent(eventData) {
  const p = await getPool();

  const [res] = await p.query(
    `INSERT INTO community_events
      (title, description, server_id, event_type, location_coords, scheduled_start, scheduled_end, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      eventData.title,
      eventData.description || '',
      eventData.server_id || 'all',
      (eventData.event_type || 'community_meetup').toLowerCase(),
      eventData.location_coords || null,
      new Date(eventData.starts_at || eventData.scheduled_start),
      eventData.ends_at || eventData.scheduled_end ? new Date(eventData.ends_at || eventData.scheduled_end) : null,
      (eventData.status || 'scheduled').toLowerCase(),
      eventData.created_by || 'Admin',
    ]
  );

  return { id: res.insertId, ...eventData };
}

/**
 * Update event status or details
 */
async function updateEvent(id, updates) {
  const p = await getPool();
  const fields = [];
  const values = [];

  const map = {
    title: 'title',
    description: 'description',
    server_id: 'server_id',
    event_type: 'event_type',
    status: 'status',
    location_coords: 'location_coords',
    starts_at: 'scheduled_start',
    scheduled_start: 'scheduled_start',
    ends_at: 'scheduled_end',
    scheduled_end: 'scheduled_end',
  };

  Object.entries(updates).forEach(([k, v]) => {
    const col = map[k];
    if (col && v !== undefined) {
      fields.push(`${col} = ?`);
      if (col.includes('scheduled_')) {
        values.push(v ? new Date(v) : null);
      } else if (col === 'status') {
        values.push(String(v).toLowerCase());
      } else {
        values.push(v);
      }
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

  const targetServers = ev.server_id === 'all' || ev.server_id === 'ALL'
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

  // 2. Mark announcement as sent and status to in_progress
  await p.query('UPDATE community_events SET announcement_sent = 1, status = "in_progress" WHERE id = ?', [id]);

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
          description: `${ev.description}\n\n**Realm**: \`${ev.server_id}\`\n**Coords**: \`${ev.location_coords || 'See in-game'}\`\n\nJoin now at \`play.petablocks.com\`!`,
          color: 0xffaa00,
          footer: { text: `PETABLOCKS Events • Event #${ev.id}` },
          timestamp: new Date().toISOString(),
        },
      }),
    }).catch(() => {});
  } catch (_) {}

  return { success: true, message: `Event #${ev.id} announced to players!` };
}

module.exports = {
  getEvents,
  createEvent,
  updateEvent,
  announceEvent,
};
