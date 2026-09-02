/**
 * Discord Webhook Engine for PETABLOCKS Server Fleet
 *
 * Manages dual Discord webhooks per Minecraft server:
 * 1. Server Chat Channel: in-game player chat, joins/leaves, deaths, advancements.
 * 2. Console & Alerts Channel: startup, stop, restart, crashes, RCON commands, health alerts.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'discord-webhooks.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (e) {}
}

// Load all webhook configs
function loadConfigs() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    console.warn('[DISCORD-WEBHOOK] Could not load config file, initializing empty:', e.message);
  }
  return {};
}

// Save webhook configs
function saveConfigs(configs) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(configs, null, 2), 'utf8');
  } catch (e) {
    console.error('[DISCORD-WEBHOOK] Failed to save config file:', e.message);
  }
}

// Get config for a specific server
function getServerWebhookConfig(serverId) {
  const all = loadConfigs();
  return (
    all[serverId] || {
      chatWebhookUrl: '',
      chatEnabled: false,
      chatEvents: {
        chat: true,
        joinLeave: true,
        deaths: true,
        advancements: true,
      },
      consoleWebhookUrl: '',
      consoleEnabled: false,
      consoleEvents: {
        lifecycle: true,
        crashes: true,
        rconCommands: true,
        tpsWarnings: true,
      },
    }
  );
}

// Update config for a specific server
function setServerWebhookConfig(serverId, newConfig) {
  const all = loadConfigs();
  all[serverId] = {
    ...getServerWebhookConfig(serverId),
    ...newConfig,
  };
  saveConfigs(all);
  return all[serverId];
}

// Raw HTTP Post to Discord Webhook
function postToDiscord(webhookUrl, payload) {
  return new Promise((resolve, reject) => {
    if (!webhookUrl || !webhookUrl.startsWith('https://discord.com/api/webhooks/')) {
      return reject(new Error('Invalid Discord Webhook URL. Must start with https://discord.com/api/webhooks/'));
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

/**
 * Send an event or alert to the Server Console & Alerts Channel
 */
async function sendConsoleAlert(serverId, { title, description, color = 0x3b82f6, fields = [], footerText }) {
  const cfg = getServerWebhookConfig(serverId);
  if (!cfg.consoleEnabled || !cfg.consoleWebhookUrl) return;

  const embed = {
    title,
    description,
    color,
    fields,
    timestamp: new Date().toISOString(),
    footer: {
      text: footerText || `PETABLOCKS Console • ${serverId}`,
      icon_url: 'https://admin.petablocks.com/favicon.ico',
    },
  };

  try {
    await postToDiscord(cfg.consoleWebhookUrl, {
      username: 'PETABLOCKS Console',
      avatar_url: 'https://i.ibb.co/6RQ5VVhm/Gemini-Generated-Image-kuabj3kuabj3kuab-removebg-preview.png',
      embeds: [embed],
    });
  } catch (err) {
    console.error(`[DISCORD-WEBHOOK] Failed to send console alert for ${serverId}:`, err.message);
  }
}

/**
 * Send a chat message or game event to the Server Chat Channel
 */
async function sendChatBroadcast(serverId, { username, message, avatarUrl, eventType = 'chat' }) {
  const cfg = getServerWebhookConfig(serverId);
  if (!cfg.chatEnabled || !cfg.chatWebhookUrl) return;

  // Check event toggles
  if (eventType === 'chat' && !cfg.chatEvents?.chat) return;
  if ((eventType === 'join' || eventType === 'leave') && !cfg.chatEvents?.joinLeave) return;
  if (eventType === 'death' && !cfg.chatEvents?.deaths) return;

  let body = {};
  if (eventType === 'chat') {
    body = {
      username: username || 'Player',
      avatar_url: avatarUrl || `https://mc-heads.net/avatar/${encodeURIComponent(username || 'Steve')}/100`,
      content: message,
    };
  } else {
    // Event embed for joins, leaves, deaths
    let color = 0x10b981; // green
    if (eventType === 'leave') color = 0x6b7280; // gray
    if (eventType === 'death') color = 0xef4444; // red

    body = {
      username: 'Server Broadcast',
      avatar_url: 'https://i.ibb.co/6RQ5VVhm/Gemini-Generated-Image-kuabj3kuabj3kuab-removebg-preview.png',
      embeds: [
        {
          description: message,
          color,
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }

  try {
    await postToDiscord(cfg.chatWebhookUrl, body);
  } catch (err) {
    console.error(`[DISCORD-WEBHOOK] Failed to send chat message for ${serverId}:`, err.message);
  }
}

module.exports = {
  getServerWebhookConfig,
  setServerWebhookConfig,
  postToDiscord,
  sendConsoleAlert,
  sendChatBroadcast,
};
