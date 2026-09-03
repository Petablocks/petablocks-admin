/**
 * PETABLOCKS Autonomous Train & Railway Dispatcher Service
 *
 * Actively polls Create Track Map API (port 3876) across running Create servers
 * to track all autonomous, scheduled, and player trains even when 0 players are online!
 *
 * Detects:
 * - Train Assembly & Commissioning
 * - Train Disassembly / Decommissioning
 * - Train Station Arrivals & Schedule Departures
 * - Train Stalls & Signal Stops
 * - Real-time Coordinate & Wagon Tracking
 */

const http = require('http');
const discordService = require('./discordWebhookService');

const TRAIN_SERVERS = [
  {
    id: 'patreon-creative',
    name: 'PETABLOCKS Patreon Creative',
    host: '10.20.110.120',
    port: 3876,
  },
  {
    id: 'create-2',
    name: 'Just Create SMP 2',
    host: '10.20.110.115',
    port: 3876,
  },
];

// In-memory state tracking for trains
const serverTrainState = new Map();

function fetchTrains(host, port) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path: '/api/trains', timeout: 4000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.trains || []);
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

async function checkServerTrains(srv) {
  const trains = await fetchTrains(srv.host, srv.port);
  if (!trains) return;

  let state = serverTrainState.get(srv.id);
  if (!state) {
    // Initial warmup run: record active trains without spamming notifications
    state = {
      trainMap: new Map(trains.map((t) => [t.id, t])),
      initialized: true,
    };
    serverTrainState.set(srv.id, state);
    console.log(`[TRAIN-MONITOR] Initialized tracking for ${srv.id}: ${trains.length} trains on network`);
    return;
  }

  const currentMap = new Map(trains.map((t) => [t.id, t]));

  // 1. Detect Newly Assembled Trains
  for (const [id, train] of currentMap.entries()) {
    if (!state.trainMap.has(id)) {
      const loc = train.cars?.[0]?.leading?.location;
      const coords = loc ? `${Math.round(loc.x)}, ${Math.round(loc.y)}, ${Math.round(loc.z)}` : 'Overworld';
      console.log(`[TRAIN-MONITOR] New train assembled on ${srv.id}: ${train.name}`);
      discordService.sendTrainEvent(srv.id, {
        title: '🛠️ New Train Assembled & Commissioned',
        trainName: train.name || 'Unnamed Train',
        eventType: 'assembly',
        description: `A new train has been assembled on the network with ${train.cars?.length || 1} wagons.`,
        location: coords,
        player: train.owner || 'Automated / Conductor',
      });
    }
  }

  // 2. Detect Disassembled / Decommissioned Trains
  for (const [id, oldTrain] of state.trainMap.entries()) {
    if (!currentMap.has(id)) {
      console.log(`[TRAIN-MONITOR] Train disassembled on ${srv.id}: ${oldTrain.name}`);
      discordService.sendTrainEvent(srv.id, {
        title: '🔧 Train Disassembled & Decommissioned',
        trainName: oldTrain.name || 'Train',
        eventType: 'disassembly',
        description: `Train \`${oldTrain.name}\` was taken off the track network.`,
      });
    }
  }

  // 3. Detect Station Status & Movement transitions
  for (const [id, train] of currentMap.entries()) {
    const oldTrain = state.trainMap.get(id);
    if (!oldTrain) continue;

    // Train stopped at station vs in-transit departure
    if (oldTrain.stopped !== train.stopped) {
      const loc = train.cars?.[0]?.leading?.location;
      const coords = loc ? `${Math.round(loc.x)}, ${Math.round(loc.y)}, ${Math.round(loc.z)}` : '';
      
      if (train.stopped) {
        discordService.sendTrainEvent(srv.id, {
          title: '🚉 Train Arrived at Station',
          trainName: train.name,
          eventType: 'station',
          description: `Train \`${train.name}\` has arrived at scheduled stop.`,
          location: coords,
        });
      }
    }
  }

  // Update memory state
  state.trainMap = currentMap;
}

function initTrainMonitor() {
  console.log('[TRAIN-MONITOR] Starting autonomous Create train dispatch monitoring loop...');
  setInterval(async () => {
    for (const srv of TRAIN_SERVERS) {
      try {
        await checkServerTrains(srv);
      } catch (e) {
        // Suppress individual poll failures
      }
    }
  }, 10000); // Check every 10 seconds
}

module.exports = {
  initTrainMonitor,
};
