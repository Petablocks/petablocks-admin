/**
 * PETABLOCKS Server Log Watcher & Discord Event Pipeline
 *
 * Directly streams container logs over SSH using `docker logs -f --tail 0`
 * for every server in the fleet. Parses:
 * 1. Player Chat: <PlayerName> message -> posts to Discord Chat with player avatar
 * 2. Player Joins: "PlayerName joined the game"
 * 3. Player Leaves: "PlayerName left the game"
 * 4. Player Deaths: "PlayerName died", fell, slain, blown up, burnt, etc.
 * 5. Create Train Events: assemblies, derailments, collisions, schedule stalls
 *
 * Operates independently of in-game mods (zero mod dependency).
 */

const fs = require('fs');
const { Client: SshClient } = require('ssh2');
const mysql = require('mysql2/promise');
const discordService = require('./discordWebhookService');
const { executeCommandUnified } = require('../routes/minecraft');

const rawDbUrl = process.env.MC_DATABASE_URL || process.env.DATABASE_URL || 'mysql://user:password@127.0.0.1:3306/petablocks';
const DB_URL = rawDbUrl.includes(':3307')
  ? rawDbUrl.replace(/\/minecraft(\?|$)/, '/petablocks$1')
  : rawDbUrl;

let dbPool = null;
function getDbPool() {
  if (!dbPool) {
    dbPool = mysql.createPool({
      uri: DB_URL,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return dbPool;
}

// Cluster SSH private key loaded securely from environment
function getClusterSshKey() {
  const raw = process.env.MC_SSH_KEY || process.env.MC_SSH_PRIVATE_KEY || (process.env.MC_SSH_KEY_FILE && fs.existsSync(process.env.MC_SSH_KEY_FILE) ? fs.readFileSync(process.env.MC_SSH_KEY_FILE, 'utf8') : '');
  if (!raw) return '';
  return raw.includes('\\n') ? raw.replace(/\\n/g, '\n') : raw;
}
const CLUSTER_SSH_KEY = getClusterSshKey();

const SERVER_WATCH_LIST = [
  {
    id: 'fabric-main',
    name: 'PETABLOCKS Modpack Server',
    containerName: 'petablocks-modpack-main',
    nodeHost: process.env.MC_MCS1_HOST || '10.20.110.118',
    user: 'root',
  },
  {
    id: 'create-2',
    name: 'Just Create SMP 2',
    containerName: 'petablocks-create-2',
    nodeHost: process.env.MC_MCS2_HOST || '10.20.110.119',
    user: 'root',
  },
  {
    id: 'patreon-creative',
    name: 'PETABLOCKS Patreon Creative',
    containerName: 'petablocks-patreon-creative',
    nodeHost: process.env.MC_MCS3_HOST || '10.20.110.120',
    user: 'root',
  },
];

const activeStreams = new Map();

function startWatchingServer(srv) {
  if (activeStreams.has(srv.id)) return;

  const client = new SshClient();
  activeStreams.set(srv.id, client);

  client.on('ready', () => {
    console.log(`[LOG-WATCHER] Log streamer connected for ${srv.id} on ${srv.nodeHost}`);
    
    // Tail docker logs continuously with zero backlog on start
    client.exec(`docker logs -f --tail 0 ${srv.containerName} 2>&1`, (err, stream) => {
      if (err) {
        console.warn(`[LOG-WATCHER] Exec failed for ${srv.id}:`, err.message);
        client.end();
        return;
      }

      let lineBuffer = '';

      stream.on('data', (chunk) => {
        lineBuffer += chunk.toString('utf8');
        const lines = lineBuffer.split('\n');
        lineBuffer = lines.pop() || ''; // Keep incomplete trailing fragment

        for (const line of lines) {
          if (!line.trim()) continue;
          processServerLogLine(srv.id, line.trim());
        }
      });

      stream.on('close', () => {
        console.warn(`[LOG-WATCHER] Stream closed for ${srv.id}, will retry in 10s...`);
        client.end();
      });

      stream.stderr.on('data', (data) => {
        // Some docker daemons mix stdout/stderr
        const text = data.toString('utf8').trim();
        if (text) processServerLogLine(srv.id, text);
      });
    });
  });

  client.on('error', (err) => {
    console.warn(`[LOG-WATCHER] SSH error for ${srv.id} (${srv.nodeHost}):`, err.message);
  });

  client.on('close', () => {
    activeStreams.delete(srv.id);
    setTimeout(() => startWatchingServer(srv), 10000); // Auto-reconnect
  });

  try {
    client.connect({
      host: srv.nodeHost,
      port: 22,
      username: srv.user,
      privateKey: CLUSTER_SSH_KEY,
      readyTimeout: 15000,
    });
  } catch (e) {
    console.warn(`[LOG-WATCHER] Could not initiate connection for ${srv.id}:`, e.message);
    activeStreams.delete(srv.id);
    setTimeout(() => startWatchingServer(srv), 15000);
  }
}

function processServerLogLine(serverId, line) {
  // Strip ANSI color codes if present
  const cleanLine = line.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, '');

  // 1. In-game player chat (Standard: <PlayerName> Message OR NeoForge/Fabric with dimension tags: <PlayerName <Overworld>> Message)
  const chatMatch = cleanLine.match(/\[Server thread\/INFO\](?: \[.*?\])?: <(?:\w+ )*([a-zA-Z0-9_]{3,16})(?: <.*?>)?> (.*)$/);
  if (chatMatch) {
    const rawPlayer = chatMatch[1].trim();
    const chatMsg = chatMatch[2].trim();

    // 1a. Intercept In-Game Report, Bug, or Suggestion Commands: /report, /bug, /suggest
    const reportCmdMatch = chatMsg.match(/^!(?:report|bug|suggest)\b|^\/(?:report|bug|suggest)\b/i);
    if (reportCmdMatch) {
      handleInGameReport(serverId, rawPlayer, chatMsg).catch(err => {
        console.warn('[LOG-WATCHER] In-game report handling error:', err.message);
      });
      return;
    }

    // Ignore discord bot loopback messages if prefixed
    if (!chatMsg.startsWith('[Discord]')) {
      discordService.sendChatBroadcast(serverId, {
        username: rawPlayer,
        message: chatMsg,
        eventType: 'chat',
      });
      return;
    }
  }

  // 2. Player Joins: "PlayerName joined the game" or "[Rank] PlayerName joined the game" or "PlayerName <Overworld> joined the game"
  const joinMatch = cleanLine.match(/\[Server thread\/INFO\](?: \[.*?\])?: (?:\[.*?\] )?([a-zA-Z0-9_]{3,16})(?: <.*?>)? joined the game/);
  if (joinMatch) {
    const playerName = joinMatch[1].trim();
    discordService.sendChatBroadcast(serverId, {
      username: playerName,
      message: `📥 **${playerName}** joined the game.`,
      eventType: 'join',
    });
    return;
  }

  // 3. Player Leaves: "PlayerName left the game"
  const leaveMatch = cleanLine.match(/\[Server thread\/INFO\](?: \[.*?\])?: (?:\[.*?\] )?([a-zA-Z0-9_]{3,16})(?: <.*?>)? left the game/);
  if (leaveMatch) {
    const playerName = leaveMatch[1].trim();
    discordService.sendChatBroadcast(serverId, {
      username: playerName,
      message: `📤 **${playerName}** left the game.`,
      eventType: 'leave',
    });
    return;
  }

  // 4. Create Train Events (Derailments, Collisions, Assembly)
  if (cleanLine.includes('createtrackmap') || cleanLine.includes('railways') || cleanLine.toLowerCase().includes('train')) {
    // Collision / Derailment
    if (/derailed|collision|crashed|fell off the track/i.test(cleanLine)) {
      const trainMatch = cleanLine.match(/train\s+['"]?([^'"]+)['"]?/i);
      discordService.sendTrainEvent(serverId, {
        title: '💥 Train Derailment / Collision Alert',
        trainName: trainMatch ? trainMatch[1] : 'Track Locomotive',
        eventType: 'crash',
        description: `Alert: A train incident occurred on the network!\n\`\`\`${cleanLine.slice(0, 300)}\`\`\``,
      });
      return;
    }

    // Assembly / Disassembly
    if (/assembled train|disassembled train/i.test(cleanLine)) {
      const isAssembled = /assembled train/i.test(cleanLine);
      const trainMatch = cleanLine.match(/train\s+['"]?([^'"]+)['"]?/i);
      discordService.sendTrainEvent(serverId, {
        title: isAssembled ? '🛠️ New Train Assembled' : '🔧 Train Disassembled',
        trainName: trainMatch ? trainMatch[1] : 'Locomotive',
        eventType: isAssembled ? 'assembly' : 'disassembly',
        description: cleanLine,
      });
      return;
    }
  }

  // 5. Player Deaths (Standard Minecraft death messages)
  const deathKeywords = [
    'was slain by',
    'was shot by',
    'was blown up by',
    'hit the ground too hard',
    'fell from a high place',
    'fell off a ladder',
    'drowned',
    'experienced kinetic energy',
    'went up in flames',
    'burned to death',
    'tried to swim in lava',
    'suffocated in a wall',
    'was squashed by',
    'was pricked to death',
    'walked into danger zone due to',
  ];

  for (const keyword of deathKeywords) {
    if (cleanLine.includes(keyword) && cleanLine.includes('[Server thread/INFO]')) {
      const match = cleanLine.match(/\[Server thread\/INFO\](?: \[.*?\])?: (.*)$/);
      if (match) {
        const deathMessage = match[1].trim();
        const playerMatch = deathMessage.match(/^([a-zA-Z0-9_]{3,16})/);
        discordService.sendChatBroadcast(serverId, {
          username: playerMatch ? playerMatch[1] : 'Player',
          message: `☠️ ${deathMessage}`,
          eventType: 'death',
        });
        return;
      }
    }
  }
}

async function handleInGameReport(serverId, player, text) {
  const isBug = /^[!/]bug\b/i.test(text);
  const isSuggest = /^[!/]suggest\b/i.test(text);
  const ticketType = isBug ? 'bug' : isSuggest ? 'suggestion' : 'report';
  const prefix = isBug ? 'BUG' : isSuggest ? 'SUGG' : 'REP';

  const cleanContent = text.replace(/^[!/](?:report|bug|suggest)\s*/i, '').trim();
  if (!cleanContent) {
    const hint = `tellraw ${player} ["",{"text":"[PETABLOCKS] ","color":"red","bold":true},{"text":"Usage: /${ticketType} <your message/details>","color":"yellow"}]`;
    await executeCommandUnified(serverId, hint);
    return;
  }

  const ticketCode = prefix + '-' + Math.random().toString(36).substring(2, 7).toUpperCase();
  const pool = getDbPool();

  if (isSuggest) {
    // Insert into community_suggestions table
    const suggId = 'sugg_ig_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    await pool.query(
      'INSERT INTO community_suggestions (id, author_id, author_name, title, description, category, status) VALUES (?, ?, ?, ?, ?, ?, "under_review")',
      [suggId, player, player, cleanContent.slice(0, 80), cleanContent, 'In-Game Idea']
    );
  }

  // Insert into support_tickets table
  await pool.query(
    'INSERT INTO support_tickets (ticket_code, minecraft_username, server_id, ticket_type, source, subject, description, priority) VALUES (?, ?, ?, ?, "in_game", ?, ?, "normal")',
    [ticketCode, player, serverId, ticketType, cleanContent.slice(0, 100), cleanContent]
  );

  // Send Alert to Discord Staff Alerts
  discordService.sendConsoleAlert(serverId, {
    title: `🎮 In-Game ${ticketType.toUpperCase()} Filed: ${ticketCode}`,
    description: `**Reporter**: \`${player}\`\n**Server**: \`${serverId}\`\n**Content**: ${cleanContent}`,
    color: isBug ? 0xef4444 : isSuggest ? 0x3b82f6 : 0xf59e0b,
    fields: [
      { name: 'Ticket Code', value: `\`${ticketCode}\``, inline: true },
      { name: 'Platform', value: 'In-Game Chat / Command', inline: true },
    ],
    footerText: 'PETABLOCKS Unified Dispatch Sentinel',
  });

  // Whisper player immediate confirmation in-game
  const tellrawConfirm = `tellraw ${player} ["",{"text":"[PETABLOCKS] ","color":"aqua","bold":true},{"text":"✔ Your ${ticketType} ","color":"white"},{"text":"${ticketCode}","color":"yellow","bold":true},{"text":" has been received by our staff team!","color":"white"}]`;
  await executeCommandUnified(serverId, tellrawConfirm);
  console.log(`[IN-GAME-REPORT] ${player} submitted ${ticketType} (${ticketCode}): ${cleanContent}`);
}

function initLogWatcher() {
  console.log('[LOG-WATCHER] Starting Fleet Log Streaming Pipeline for Discord...');
  for (const srv of SERVER_WATCH_LIST) {
    startWatchingServer(srv);
  }
}

module.exports = {
  initLogWatcher,
  startWatchingServer,
  processServerLogLine,
};
