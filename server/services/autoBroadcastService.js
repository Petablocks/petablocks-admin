/**
 * PETABLOCKS In-Game Automated Broadcaster Service
 *
 * Periodically rotates informative server tips, community links,
 * and announcements to Minecraft players via unified RCON.
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

let timer = null;

async function getBroadcasts() {
  const p = await getPool();
  const [rows] = await p.query('SELECT * FROM auto_broadcast_messages ORDER BY id ASC');
  return rows.map((r) => ({
    id: r.id,
    server_id: r.server_id,
    message: r.plain_text,
    message_json: r.message_json,
    is_active: Boolean(r.is_enabled),
    interval_minutes: r.display_interval_minutes,
    last_broadcast_at: r.last_sent_at,
    created_at: r.created_at,
  }));
}

async function addBroadcast(message, serverId = 'all', intervalMinutes = 30) {
  const p = await getPool();
  const safeMsg = message.replace(/"/g, '\\"');
  const messageJson = `tellraw @a [{"text":"[PETABLOCKS] ","color":"gold","bold":true},{"text":"${safeMsg}","color":"yellow"}]`;

  const [res] = await p.query(
    'INSERT INTO auto_broadcast_messages (server_id, plain_text, message_json, is_enabled, display_interval_minutes) VALUES (?, ?, ?, 1, ?)',
    [serverId.toLowerCase(), message, messageJson, intervalMinutes]
  );
  return { id: res.insertId, message, serverId, intervalMinutes, is_active: true };
}

async function toggleBroadcast(id, isActive) {
  const p = await getPool();
  await p.query('UPDATE auto_broadcast_messages SET is_enabled = ? WHERE id = ?', [isActive ? 1 : 0, id]);
  return { updated: true };
}

async function deleteBroadcast(id) {
  const p = await getPool();
  await p.query('DELETE FROM auto_broadcast_messages WHERE id = ?', [id]);
  return { deleted: true };
}

async function runBroadcastTick() {
  try {
    const p = await getPool();
    const [rows] = await p.query(`
      SELECT * FROM auto_broadcast_messages 
      WHERE is_enabled = 1 
        AND (last_sent_at IS NULL OR TIMESTAMPDIFF(MINUTE, last_sent_at, NOW()) >= display_interval_minutes)
      ORDER BY last_sent_at ASC 
      LIMIT 1
    `);

    if (!rows || rows.length === 0) return;
    const item = rows[0];

    const targets = item.server_id === 'all'
      ? ['fabric-main', 'create-2', 'patreon-creative']
      : [item.server_id];

    for (const srvId of targets) {
      try {
        await executeCommandUnified(srvId, item.message_json);
      } catch (err) {
        // Silently skip if server is offline
      }
    }

    await p.query('UPDATE auto_broadcast_messages SET last_sent_at = NOW() WHERE id = ?', [item.id]);
    console.log(`[AutoBroadcast] Broadcasted tip #${item.id} to [${targets.join(', ')}]`);
  } catch (err) {
    console.error('[AutoBroadcast] Tick error:', err.message);
  }
}

function startDaemon(intervalMs = 5 * 60 * 1000) {
  if (timer) clearInterval(timer);
  setTimeout(runBroadcastTick, 30000);
  timer = setInterval(runBroadcastTick, intervalMs);
  console.log('[AutoBroadcast] Service daemon active (checking every 5 minutes)');
}

module.exports = {
  getBroadcasts,
  addBroadcast,
  toggleBroadcast,
  deleteBroadcast,
  runBroadcastTick,
  startDaemon,
};
