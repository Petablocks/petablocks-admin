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
  return rows;
}

async function addBroadcast(message, serverId = 'ALL', intervalMinutes = 30) {
  const p = await getPool();
  const [res] = await p.query(
    'INSERT INTO auto_broadcast_messages (server_id, message, is_active, interval_minutes) VALUES (?, ?, TRUE, ?)',
    [serverId, message, intervalMinutes]
  );
  return { id: res.insertId, message, serverId, intervalMinutes, is_active: true };
}

async function toggleBroadcast(id, isActive) {
  const p = await getPool();
  await p.query('UPDATE auto_broadcast_messages SET is_active = ? WHERE id = ?', [isActive, id]);
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
    // Select one active message that is either never broadcast or oldest broadcast
    const [rows] = await p.query(`
      SELECT * FROM auto_broadcast_messages 
      WHERE is_active = TRUE 
        AND (last_broadcast_at IS NULL OR TIMESTAMPDIFF(MINUTE, last_broadcast_at, NOW()) >= interval_minutes)
      ORDER BY last_broadcast_at ASC 
      LIMIT 1
    `);

    if (!rows || rows.length === 0) return;
    const item = rows[0];

    const targets = item.server_id === 'ALL'
      ? ['fabric-main', 'create-2', 'patreon-creative']
      : [item.server_id];

    // Escape quotes in message for tellraw JSON
    const safeMsg = item.message.replace(/"/g, '\\"');
    const tellrawCmd = `tellraw @a [{"text":"[","color":"dark_gray"},{"text":"PETABLOCKS","color":"aqua","bold":true},{"text":"] ","color":"dark_gray"},{"text":"${safeMsg}","color":"yellow"}]`;

    for (const srvId of targets) {
      try {
        await executeCommandUnified(srvId, tellrawCmd);
      } catch (err) {
        // Silently skip if server is empty or offline
      }
    }

    // Update timestamp
    await p.query('UPDATE auto_broadcast_messages SET last_broadcast_at = NOW() WHERE id = ?', [item.id]);
    console.log(`[AutoBroadcast] Broadcasted tip #${item.id} to [${targets.join(', ')}]`);
  } catch (err) {
    console.error('[AutoBroadcast] Tick error:', err.message);
  }
}

function startDaemon(intervalMs = 5 * 60 * 1000) {
  if (timer) clearInterval(timer);
  // Run first tick after 30s
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
