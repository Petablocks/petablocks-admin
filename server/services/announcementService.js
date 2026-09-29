/**
 * PETABLOCKS Unified Announcements & Broadcast Engine
 *
 * Supports multi-channel dispatches:
 * 1. Discord Announcement Channel (via pb-bot /api/events or dedicated Webhook fallback)
 * 2. In-Game Minecraft Fleet (via unified RCON tellraw / title / playsound)
 * 3. Audit History in MariaDB/MySQL (announcements table) or fallback JSON store
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const mysql = require('mysql2/promise');
const { executeCommandUnified } = require('../routes/minecraft');

const rawDbUrl = process.env.MC_DATABASE_URL || process.env.DATABASE_URL || 'mysql://user:password@127.0.0.1:3306/petablocks';
const DB_URL = rawDbUrl.includes(':3307')
  ? rawDbUrl.replace(/\/minecraft(\?|$)/, '/petablocks$1')
  : rawDbUrl;

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'announcements-config.json');

const DEFAULT_CONFIG = {
  announcementWebhookUrl: process.env.DISCORD_ANNOUNCEMENT_WEBHOOK || '',
  announcementChannelId: process.env.DISCORD_ANNOUNCEMENTS_CHANNEL || '1381339080130039962',
  defaultPingRole: 'none',
  enabled: true,
};

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

let tableEnsured = false;
async function ensureSchema() {
  if (tableEnsured) return;
  try {
    const p = await getPool();
    await p.query(`
      CREATE TABLE IF NOT EXISTS network_announcements (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(64) NOT NULL DEFAULT 'general',
        ping_role VARCHAR(64) DEFAULT 'none',
        url VARCHAR(512) NULL,
        image_url VARCHAR(512) NULL,
        target_servers JSON NOT NULL,
        send_discord TINYINT(1) DEFAULT 1,
        send_ingame TINYINT(1) DEFAULT 1,
        discord_sent TINYINT(1) DEFAULT 0,
        ingame_sent TINYINT(1) DEFAULT 0,
        created_by VARCHAR(128) DEFAULT 'Admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_created (created_at DESC)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    tableEnsured = true;
  } catch (err) {
    console.warn('[AnnouncementsEngine] Database schema check failed, will use fallback store:', err.message);
  }
}

function loadConfig() {
  try {
    let base = { ...DEFAULT_CONFIG };
    // Check if maintenance-config.json has a configured webhook to inherit
    const maintConfigFile = path.join(DATA_DIR, 'maintenance-config.json');
    if (fs.existsSync(maintConfigFile)) {
      try {
        const maintData = JSON.parse(fs.readFileSync(maintConfigFile, 'utf8'));
        if (maintData.announcementWebhookUrl) {
          base.announcementWebhookUrl = maintData.announcementWebhookUrl;
        }
      } catch (_) {}
    }

    if (fs.existsSync(CONFIG_FILE)) {
      return { ...base, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    }
    return base;
  } catch (err) {
    console.warn('[AnnouncementsEngine] Failed to read config:', err.message);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (err) {
    console.error('[AnnouncementsEngine] Failed to save config:', err.message);
  }
}

const CATEGORY_STYLES = {
  update: {
    color: 0x3b82f6,      // Blue
    badge: '🚀 UPDATE / RELEASE',
    chatColor: 'aqua',
    chatPrefix: '[UPDATE]',
    sound: 'minecraft:ui.toast.challenge_complete',
  },
  maintenance: {
    color: 0xf59e0b,      // Amber Gold
    badge: '🛠️ MAINTENANCE',
    chatColor: 'gold',
    chatPrefix: '[MAINTENANCE]',
    sound: 'minecraft:block.note_block.bell',
  },
  downtime: {
    color: 0xef4444,      // Red
    badge: '🚨 SERVICE ALERT / OUTAGE',
    chatColor: 'red',
    chatPrefix: '[ALERT]',
    sound: 'minecraft:block.anvil.land',
  },
  event: {
    color: 0x10b981,      // Emerald Green
    badge: '🎉 COMMUNITY EVENT',
    chatColor: 'green',
    chatPrefix: '[EVENT]',
    sound: 'minecraft:ui.toast.challenge_complete',
  },
  general: {
    color: 0x8b5cf6,      // Purple
    badge: '📢 ANNOUNCEMENT',
    chatColor: 'yellow',
    chatPrefix: '[NOTICE]',
    sound: 'minecraft:block.note_block.bell',
  },
};

/**
 * Dispatch an announcement to pb-bot or Discord Webhook
 */
async function dispatchDiscord(announcement) {
  const cfg = loadConfig();
  if (!cfg.enabled) return { success: false, reason: 'Announcements disabled in config' };

  const style = CATEGORY_STYLES[announcement.category] || CATEGORY_STYLES.general;
  const botEventUrl = process.env.BOT_EVENT_URL || 'http://pb-bot:3001/api/events';

  // 1. Try forwarding to pb-bot first
  try {
    const res = await fetch(botEventUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'announcement',
        channelId: cfg.announcementChannelId,
        title: announcement.title,
        description: announcement.description,
        category: announcement.category,
        color: style.color,
        pingRole: announcement.pingRole || cfg.defaultPingRole,
        url: announcement.url,
        imageUrl: announcement.imageUrl,
        authorName: announcement.createdBy || 'PETABLOCKS Operations',
      }),
      signal: AbortSignal.timeout(4000),
    });

    if (res.ok) {
      return { success: true, method: 'bot' };
    }
  } catch (botErr) {
    console.warn('[AnnouncementsEngine] pb-bot event endpoint unreachable, trying webhook fallback:', botErr.message);
  }

  // 2. Webhook Fallback
  if (cfg.announcementWebhookUrl && cfg.announcementWebhookUrl.startsWith('https://discord.com/api/webhooks/')) {
    const embed = {
      title: announcement.title,
      description: announcement.description,
      color: style.color,
      url: announcement.url || undefined,
      image: announcement.imageUrl ? { url: announcement.imageUrl } : undefined,
      footer: {
        text: `PETABLOCKS Network Operations • ${announcement.createdBy || 'Staff Team'}`,
        icon_url: 'https://i.ibb.co/JzMKx8r/Petablocks-Icon.png',
      },
      timestamp: new Date().toISOString(),
    };

    let content = undefined;
    if (announcement.pingRole === '@everyone') content = '@everyone';
    else if (announcement.pingRole === '@here') content = '@here';
    else if (announcement.pingRole && announcement.pingRole !== 'none') content = announcement.pingRole;

    await postWebhook(cfg.announcementWebhookUrl, { content, embeds: [embed] });
    return { success: true, method: 'webhook' };
  }

  return { success: false, reason: 'Neither pb-bot nor valid webhook URL available' };
}

function postWebhook(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    const url = new URL(webhookUrl);
    const body = JSON.stringify(payload);
    const req = https.request({
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'PETABLOCKS-Admin-Announcer/1.0',
      },
    }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(true);
        else reject(new Error(`Discord Webhook status ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * Dispatch announcement to Minecraft servers via unified RCON
 */
async function dispatchMinecraft(announcement) {
  const targetServers = (!announcement.targetServers || announcement.targetServers.includes('all'))
    ? ['create-2', 'lobby-main', 'patreon-creative']
    : announcement.targetServers;

  const style = CATEGORY_STYLES[announcement.category] || CATEGORY_STYLES.general;
  const safeTitle = (announcement.title || '').replace(/"/g, '\\"');
  const safeDesc = (announcement.description || '').replace(/"/g, '\\"').substring(0, 100);

  const results = {};

  for (const srvId of targetServers) {
    try {
      // 1. In-game broadcast text
      await executeCommandUnified(
        srvId,
        `tellraw @a [{"text":"${style.chatPrefix} ","color":"${style.chatColor}","bold":true},{"text":"${safeTitle}","color":"white","bold":true}]`
      );
      if (safeDesc) {
        await executeCommandUnified(
          srvId,
          `tellraw @a [{"text":" ➤ ","color":"dark_gray"},{"text":"${safeDesc}","color":"gray"}]`
        );
      }

      // 2. Center screen banner
      await executeCommandUnified(
        srvId,
        `title @a title {"text":"${style.chatPrefix} ${safeTitle.substring(0, 28)}","color":"${style.chatColor}","bold":true}`
      );
      if (safeDesc) {
        await executeCommandUnified(
          srvId,
          `title @a subtitle {"text":"${safeDesc.substring(0, 45)}","color":"yellow"}`
        );
      }

      // 3. Audio cue
      if (style.sound) {
        await executeCommandUnified(srvId, `playsound ${style.sound} master @a ~ ~ ~ 1 1`);
      }

      results[srvId] = true;
    } catch (err) {
      results[srvId] = false;
    }
  }

  return results;
}

/**
 * Broadcast an announcement across all selected channels
 */
async function broadcastAnnouncement(data) {
  await ensureSchema();

  const title = (data.title || '').trim();
  const description = (data.description || '').trim();
  const category = (data.category || 'general').toLowerCase();
  const pingRole = data.pingRole || 'none';
  const url = data.url ? data.url.trim() : null;
  const imageUrl = data.imageUrl ? data.imageUrl.trim() : null;
  const targetServers = Array.isArray(data.targetServers) && data.targetServers.length > 0 ? data.targetServers : ['all'];
  const sendDiscord = data.sendDiscord !== false;
  const sendIngame = data.sendIngame !== false;
  const createdBy = data.createdBy || 'Staff';

  let discordSuccess = false;
  let discordError = null;
  let ingameResults = {};

  if (sendDiscord) {
    try {
      const res = await dispatchDiscord({ title, description, category, pingRole, url, imageUrl, createdBy });
      discordSuccess = res.success;
      if (!res.success) {
        discordError = res.reason || 'Failed to dispatch via bot and webhook';
      }
    } catch (e) {
      discordError = e.message;
      console.error('[AnnouncementsEngine] Discord dispatch error:', e);
    }
  }

  if (sendIngame) {
    try {
      ingameResults = await dispatchMinecraft({ title, description, category, targetServers });
    } catch (e) {
      console.error('[AnnouncementsEngine] In-game dispatch error:', e);
    }
  }

  let recordId = Date.now();
  try {
    const p = await getPool();
    const [res] = await p.query(
      `INSERT INTO network_announcements 
        (title, description, category, ping_role, url, image_url, target_servers, send_discord, send_ingame, discord_sent, ingame_sent, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        description,
        category,
        pingRole,
        url,
        imageUrl,
        JSON.stringify(targetServers),
        sendDiscord ? 1 : 0,
        sendIngame ? 1 : 0,
        discordSuccess ? 1 : 0,
        Object.values(ingameResults).some(Boolean) ? 1 : 0,
        createdBy,
      ]
    );
    recordId = res.insertId;
  } catch (dbErr) {
    console.warn('[AnnouncementsEngine] Could not persist to DB:', dbErr.message);
  }

  return {
    id: recordId,
    title,
    category,
    discordSent: discordSuccess,
    discordError,
    ingameSent: Object.values(ingameResults).some(Boolean),
    ingameResults,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Get recent announcement history
 */
async function getHistory(limit = 25) {
  await ensureSchema();
  try {
    const p = await getPool();
    const [rows] = await p.query(
      'SELECT * FROM network_announcements ORDER BY created_at DESC LIMIT ?',
      [parseInt(limit, 10) || 25]
    );
    return rows.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      category: r.category,
      pingRole: r.ping_role,
      url: r.url,
      imageUrl: r.image_url,
      targetServers: typeof r.target_servers === 'string' ? JSON.parse(r.target_servers) : r.target_servers,
      sendDiscord: Boolean(r.send_discord),
      sendIngame: Boolean(r.send_ingame),
      discordSent: Boolean(r.discord_sent),
      ingameSent: Boolean(r.ingame_sent),
      createdBy: r.created_by,
      createdAt: r.created_at,
    }));
  } catch (err) {
    return [];
  }
}

module.exports = {
  broadcastAnnouncement,
  getHistory,
  loadConfig,
  saveConfig,
  CATEGORY_STYLES,
};
