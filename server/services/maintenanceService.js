const fs = require('fs');
const path = require('path');
const https = require('https');
const mysql = require('mysql2/promise');

const DB_URL = (process.env.MC_DATABASE_URL && !process.env.MC_DATABASE_URL.includes('mc_readonly'))
  ? process.env.MC_DATABASE_URL
  : 'mysql://petablocks:mOgsrNJ6lEQQXx77YnPcVd0jxAmQDRud@10.20.110.117:3307/petablocks';

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'maintenance-config.json');

const DEFAULT_CONFIG = {
  announcementWebhookUrl: 'https://discord.com/api/webhooks/1545154422110429295/cvedQsaTO8kKnZ5Cn4PIoW2WhwEmAxYEZqxXkfJwwsSyVMRRm0r4CiMYVdntfS3ws5pU',
  pingRole: '@everyone',
  enabled: true,
};

const SERVER_LABELS = {
  'all': 'All PETABLOCKS Servers',
  'create-2': 'Just Create SMP 2 (NeoForge 1.21.1)',
  'create2-smp': 'Just Create SMP 2 (NeoForge 1.21.1)',
  'fabric-main': 'Official Modpack Server (Fabric 1.20.1)',
  'modpack-fabric': 'Official Modpack Server (Fabric 1.20.1)',
  'patreon-creative': 'Patreon Creative Server',
  'create-patreon': 'Patreon Creative Server',
};

let pool = null;

async function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      uri: DB_URL,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });
  }
  return pool;
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return { ...DEFAULT_CONFIG, ...data };
    }
  } catch (e) {
    console.warn('[MAINTENANCE] Error loading config, using defaults:', e.message);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (e) {
    console.error('[MAINTENANCE] Error saving config:', e.message);
  }
}

function postToDiscord(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      return reject(new Error('Invalid Discord Webhook URL.'));
    }

    const url = new URL(webhookUrl);
    const body = JSON.stringify(payload);

    const req = https.request(
      {
        hostname: url.hostname,
        port: 443,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent': 'PETABLOCKS-Maintenance/1.0',
        },
      },
      (res) => {
        let respData = '';
        res.on('data', (d) => (respData += d));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, status: res.statusCode });
          } else {
            reject(new Error(`Discord API responded with status ${res.statusCode}: ${respData}`));
          }
        });
      }
    );

    req.on('error', (err) => reject(err));
    req.write(body);
    req.end();
  });
}

function formatServerNames(serverIds) {
  if (!Array.isArray(serverIds) || serverIds.length === 0) return 'All PETABLOCKS Servers';
  if (serverIds.includes('all')) return 'All PETABLOCKS Servers';
  return serverIds.map(id => SERVER_LABELS[id] || id).join(', ');
}

/**
 * Send Discord Announcement based on status
 */
async function sendDiscordAnnouncement(window, action = 'created') {
  const cfg = loadConfig();
  if (!cfg.enabled || !cfg.announcementWebhookUrl) return;

  const serverNames = formatServerNames(window.server_ids);
  const startSec = Math.floor(Number(window.start_time) / 1000);
  const durMin = window.estimated_duration_min || 30;

  let embed = {};
  let content = cfg.pingRole || '@everyone';

  if (window.status === 'in_progress') {
    // 🔴 ACTIVE MAINTENANCE NOW
    embed = {
      title: `🛠️ Server Maintenance Underway: ${window.title}`,
      description: window.description || 'Maintenance work is currently in progress on the server network.',
      color: 0xef4444, // Red
      fields: [
        { name: 'Affected Servers', value: `**${serverNames}**`, inline: false },
        { name: 'Status', value: '🔴 **IN PROGRESS / OFFLINE**', inline: true },
        { name: 'Started', value: `<t:${startSec}:R>`, inline: true },
        { name: 'Estimated Duration', value: `~${durMin} minutes`, inline: true },
      ],
      footer: {
        text: 'PETABLOCKS Network Operations • We will notify when back online',
        icon_url: 'https://i.ibb.co/JzMKx8r/Petablocks-Icon.png',
      },
      timestamp: new Date().toISOString(),
    };
  } else if (window.status === 'completed') {
    // 🟢 MAINTENANCE COMPLETE
    const endSec = Math.floor((Number(window.end_time) || Date.now()) / 1000);
    embed = {
      title: `✅ Maintenance Complete: ${window.title}`,
      description: `All maintenance tasks have finished and affected servers are back online and ready to play!`,
      color: 0x10b981, // Emerald Green
      fields: [
        { name: 'Servers Restored', value: `**${serverNames}**`, inline: false },
        { name: 'Status', value: '🟢 **ALL SYSTEMS OPERATIONAL**', inline: true },
        { name: 'Completed At', value: `<t:${endSec}:T>`, inline: true },
      ],
      footer: {
        text: 'PETABLOCKS Network Operations • Thank you for your patience!',
        icon_url: 'https://i.ibb.co/JzMKx8r/Petablocks-Icon.png',
      },
      timestamp: new Date().toISOString(),
    };
  } else if (window.status === 'cancelled') {
    // ⚪ CANCELLED
    embed = {
      title: `ℹ️ Maintenance Cancelled: ${window.title}`,
      description: `The planned maintenance window for **${serverNames}** has been cancelled or postponed. Normal operations continue.`,
      color: 0x6b7280, // Gray
      footer: {
        text: 'PETABLOCKS Network Operations',
        icon_url: 'https://i.ibb.co/JzMKx8r/Petablocks-Icon.png',
      },
      timestamp: new Date().toISOString(),
    };
  } else {
    // 🟡 SCHEDULED UPCOMING
    embed = {
      title: `📅 Scheduled Maintenance Notice: ${window.title}`,
      description: window.description || 'Routine maintenance and server improvements have been scheduled.',
      color: 0xf59e0b, // Amber Gold
      fields: [
        { name: 'Affected Servers', value: `**${serverNames}**`, inline: false },
        { name: 'Scheduled Date & Time', value: `<t:${startSec}:F> (<t:${startSec}:R>)`, inline: false },
        { name: 'Estimated Downtime', value: `~${durMin} minutes`, inline: true },
        { name: 'Status', value: '🟡 **SCHEDULED**', inline: true },
      ],
      footer: {
        text: 'PETABLOCKS Network Operations',
        icon_url: 'https://i.ibb.co/JzMKx8r/Petablocks-Icon.png',
      },
      timestamp: new Date().toISOString(),
    };
  }

  try {
    await postToDiscord(cfg.announcementWebhookUrl, {
      username: 'PETABLOCKS Operations',
      avatar_url: 'https://i.ibb.co/JzMKx8r/Petablocks-Icon.png',
      content: content ? content : undefined,
      embeds: [embed],
    });
    console.log(`[MAINTENANCE] Discord announcement sent for #${window.id} (${window.status})`);
  } catch (err) {
    console.error('[MAINTENANCE] Failed to send Discord announcement:', err.message);
  }
}

/**
 * Send in-game notice via RCON to affected servers
 */
async function sendIngameBroadcast(serverIds, message) {
  try {
    const { executeCommandUnified } = require('../routes/minecraft');
    const targetServers = (!Array.isArray(serverIds) || serverIds.includes('all'))
      ? ['fabric-main', 'create-2', 'patreon-creative']
      : serverIds;

    for (const sid of targetServers) {
      try {
        await executeCommandUnified(sid, `tellraw @a [{"text":"[PETABLOCKS] ","color":"gold","bold":true},{"text":"${message}","color":"yellow"}]`);
      } catch (e) {
        // quiet ignore if server offline
      }
    }
  } catch (e) {
    console.warn('[MAINTENANCE] In-game broadcast skipped:', e.message);
  }
}

/**
 * Sync maintenance state to companion mod WebSocket clients
 */
function syncModMaintenanceMode(serverIds, enabled, title = 'Server Maintenance', etaMinutes = 30) {
  try {
    const { sendModAction } = require('../routes/minecraft');
    const targetServers = (!Array.isArray(serverIds) || serverIds.includes('all'))
      ? ['fabric-main', 'create-2', 'patreon-creative']
      : serverIds;

    for (const sid of targetServers) {
      sendModAction(sid, 'SET_MAINTENANCE_MODE', {
        enabled,
        title,
        etaMinutes
      });
    }
  } catch (e) {
    console.warn('[MAINTENANCE] Failed to sync companion mod mode:', e.message);
  }
}

// ─────────────────────────────────────────────────────────────
// Public API Methods
// ─────────────────────────────────────────────────────────────

/**
 * List all maintenance windows
 */
async function listMaintenance({ status, limit = 50 } = {}) {
  const p = await getPool();
  let query = 'SELECT * FROM maintenance_windows';
  const params = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }
  query += ' ORDER BY start_time DESC LIMIT ?';
  params.push(Math.min(parseInt(limit, 10) || 50, 100));

  const [rows] = await p.query(query, params);
  return rows.map(r => ({
    ...r,
    server_ids: typeof r.server_ids === 'string' ? JSON.parse(r.server_ids) : (r.server_ids || []),
    start_time: Number(r.start_time),
    end_time: r.end_time ? Number(r.end_time) : null,
    notify_discord: Boolean(r.notify_discord),
    notify_ingame: Boolean(r.notify_ingame),
  }));
}

/**
 * Get active and upcoming maintenance windows (for website & status page)
 */
async function getActiveMaintenance() {
  const p = await getPool();
  const now = Date.now();
  const upcomingThreshold = now + (24 * 60 * 60 * 1000); // within next 24h

  const [rows] = await p.query(`
    SELECT * FROM maintenance_windows
    WHERE status = 'in_progress' 
       OR (status = 'scheduled' AND start_time <= ?)
    ORDER BY CASE WHEN status = 'in_progress' THEN 0 ELSE 1 END, start_time ASC
  `, [upcomingThreshold]);

  return rows.map(r => ({
    id: r.id,
    title: r.title,
    description: r.description,
    serverIds: typeof r.server_ids === 'string' ? JSON.parse(r.server_ids) : (r.server_ids || []),
    serverNames: formatServerNames(typeof r.server_ids === 'string' ? JSON.parse(r.server_ids) : r.server_ids),
    status: r.status,
    startTime: Number(r.start_time),
    estimatedDurationMin: r.estimated_duration_min,
    endTime: r.end_time ? Number(r.end_time) : null,
  }));
}

/**
 * Create maintenance window
 */
async function createMaintenance({
  title,
  description = '',
  serverIds = ['all'],
  status = 'scheduled',
  startTime = Date.now(),
  estimatedDurationMin = 30,
  notifyDiscord = true,
  notifyIngame = true,
  createdBy = 'Admin'
}) {
  const p = await getPool();
  const sIds = Array.isArray(serverIds) && serverIds.length > 0 ? serverIds : ['all'];
  const startTs = Number(startTime) || Date.now();
  const dur = parseInt(estimatedDurationMin, 10) || 30;

  const [res] = await p.query(`
    INSERT INTO maintenance_windows 
      (title, description, server_ids, status, start_time, estimated_duration_min, notify_discord, notify_ingame, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [title, description, JSON.stringify(sIds), status, startTs, dur, notifyDiscord ? 1 : 0, notifyIngame ? 1 : 0, createdBy]);

  const newWindow = {
    id: res.insertId,
    title,
    description,
    server_ids: sIds,
    status,
    start_time: startTs,
    estimated_duration_min: dur,
    end_time: null,
    notify_discord: notifyDiscord,
    notify_ingame: notifyIngame,
    created_by: createdBy,
  };

  if (notifyDiscord) {
    sendDiscordAnnouncement(newWindow, 'created').catch(console.error);
  }

  if (status === 'in_progress') {
    if (notifyIngame) {
      sendIngameBroadcast(sIds, `Maintenance is now in progress: ${title}`).catch(console.error);
    }
    syncModMaintenanceMode(sIds, true, title, dur);
  }

  return newWindow;
}

/**
 * Update maintenance window
 */
async function updateMaintenance(id, fields) {
  const p = await getPool();
  const [existing] = await p.query('SELECT * FROM maintenance_windows WHERE id = ?', [id]);
  if (existing.length === 0) return null;

  const prev = existing[0];
  const prevStatus = prev.status;

  const updates = [];
  const params = [];

  if (fields.title !== undefined) {
    updates.push('title = ?');
    params.push(fields.title);
  }
  if (fields.description !== undefined) {
    updates.push('description = ?');
    params.push(fields.description);
  }
  if (fields.serverIds !== undefined) {
    updates.push('server_ids = ?');
    params.push(JSON.stringify(fields.serverIds));
  }
  if (fields.status !== undefined) {
    updates.push('status = ?');
    params.push(fields.status);
    if (fields.status === 'completed' || fields.status === 'cancelled') {
      updates.push('end_time = ?');
      params.push(Date.now());
    }
  }
  if (fields.startTime !== undefined) {
    updates.push('start_time = ?');
    params.push(Number(fields.startTime));
  }
  if (fields.estimatedDurationMin !== undefined) {
    updates.push('estimated_duration_min = ?');
    params.push(parseInt(fields.estimatedDurationMin, 10));
  }
  if (fields.notifyDiscord !== undefined) {
    updates.push('notify_discord = ?');
    params.push(fields.notifyDiscord ? 1 : 0);
  }
  if (fields.notifyIngame !== undefined) {
    updates.push('notify_ingame = ?');
    params.push(fields.notifyIngame ? 1 : 0);
  }

  if (updates.length > 0) {
    params.push(id);
    await p.query(`UPDATE maintenance_windows SET ${updates.join(', ')} WHERE id = ?`, params);
  }

  const [updatedRows] = await p.query('SELECT * FROM maintenance_windows WHERE id = ?', [id]);
  const updated = updatedRows[0];
  const windowObj = {
    ...updated,
    server_ids: typeof updated.server_ids === 'string' ? JSON.parse(updated.server_ids) : (updated.server_ids || []),
    start_time: Number(updated.start_time),
    end_time: updated.end_time ? Number(updated.end_time) : null,
  };

  // If status transitioned, fire appropriate alerts
  if (fields.status && fields.status !== prevStatus && windowObj.notify_discord) {
    sendDiscordAnnouncement(windowObj, 'status_changed').catch(console.error);

    if (windowObj.notify_ingame) {
      if (fields.status === 'in_progress') {
        sendIngameBroadcast(windowObj.server_ids, `Server maintenance has begun: ${windowObj.title}`);
      } else if (fields.status === 'completed' || fields.status === 'cancelled') {
        sendIngameBroadcast(windowObj.server_ids, `Maintenance complete! Servers are fully operational.`);
      }
    }

    if (fields.status === 'in_progress') {
      syncModMaintenanceMode(windowObj.server_ids, true, windowObj.title, windowObj.estimated_duration_min);
    } else if (fields.status === 'completed' || fields.status === 'cancelled') {
      syncModMaintenanceMode(windowObj.server_ids, false);
    }
  }

  return windowObj;
}

/**
 * Delete maintenance window
 */
async function deleteMaintenance(id) {
  const p = await getPool();
  const [res] = await p.query('DELETE FROM maintenance_windows WHERE id = ?', [id]);
  return res.affectedRows > 0;
}

module.exports = {
  loadConfig,
  saveConfig,
  listMaintenance,
  getActiveMaintenance,
  createMaintenance,
  updateMaintenance,
  deleteMaintenance,
  sendDiscordAnnouncement,
};
