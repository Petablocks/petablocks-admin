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

const { Client: SshClient } = require('ssh2');
const discordService = require('./discordWebhookService');

// Embedded cluster private key (matches serverManager.js)
const CLUSTER_SSH_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACCK5B91oPhc74Q3AdMwmLpLG6hXVfEeNuQ5JZvyz3ndVgAAAJgVjzhhFY84
YQAAAAtzc2gtZWQyNTUxOQAAACCK5B91oPhc74Q3AdMwmLpLG6hXVfEeNuQ5JZvyz3ndVg
AAAECp+nVXQqH10GUgYHqZx6pBarI7yiqEv2H+pCrx0Zu8xYrkH3Wg+FzvhDcB0zCYuksb
qFdV8R425Dklm/LPed1WAAAAFXBldGFibG9ja3MtbWNzLWFjY2Vzcw==
-----END OPENSSH PRIVATE KEY-----`;

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
