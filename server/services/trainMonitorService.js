/**
 * PETABLOCKS Autonomous Train & Railway Dispatcher Service
 *
 * Actively polls Create Track Map API (port 3876) across running Create servers
 * to track all autonomous, scheduled, and player trains even when 0 players are online!
 *
 * Features:
 * - Real-time Station Arrival & Departure resolution with Station Names
 * - Spatial distance matching between train locomotive and station signals
 * - Train Assembly & Commissioning alerts
 * - Train Disassembly / Decommissioning alerts
 * - Coordinate & Wagon Tracking
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

// In-memory state tracking for trains and cached stations
const serverTrainState = new Map();

function httpGetJson(host, port, path) {
  return new Promise((resolve) => {
    const req = http.get({ host, port, path, timeout: 4000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
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

function findNearestStation(stations, loc, maxDistance = 45) {
  if (!stations || !loc || !stations.length) return null;

  let bestStation = null;
  let minDistanceSq = maxDistance * maxDistance;

  for (const st of stations) {
    if (!st.location) continue;
    if (st.dimension && loc.dimension && st.dimension !== loc.dimension) continue;

    const dx = st.location.x - loc.x;
    const dy = st.location.y - loc.y;
    const dz = st.location.z - loc.z;
    const distSq = dx * dx + dy * dy + dz * dz;

    if (distSq < minDistanceSq) {
      minDistanceSq = distSq;
      bestStation = st.name;
    }
  }

  return bestStation;
}

async function checkServerTrains(srv) {
  let state = serverTrainState.get(srv.id);
  if (!state) {
    state = {
      trainMap: new Map(),
      stations: [],
      lastStationFetch: 0,
      initialized: false,
    };
    serverTrainState.set(srv.id, state);
  }

  // Refresh stations every 60 seconds
  const now = Date.now();
  if (now - state.lastStationFetch > 60000 || state.stations.length === 0) {
    const networkData = await httpGetJson(srv.host, srv.port, '/api/network');
    if (networkData && Array.isArray(networkData.stations)) {
      state.stations = networkData.stations;
      state.lastStationFetch = now;
    }
  }

  const trainsData = await httpGetJson(srv.host, srv.port, '/api/trains');
  if (!trainsData || !Array.isArray(trainsData.trains)) return;
  const trains = trainsData.trains;

  if (!state.initialized) {
    // Initial warmup run: record active trains without spamming notifications
    state.trainMap = new Map(trains.map((t) => [t.id, t]));
    state.initialized = true;
    console.log(`[TRAIN-MONITOR] Initialized tracking for ${srv.id}: ${trains.length} trains, ${state.stations.length} stations`);
    return;
  }

  const currentMap = new Map(trains.map((t) => [t.id, t]));

  // 1. Detect Newly Assembled Trains
  for (const [id, train] of currentMap.entries()) {
    if (!state.trainMap.has(id)) {
      const loc = train.cars?.[0]?.leading?.location;
      const coords = loc ? `${Math.round(loc.x)}, ${Math.round(loc.y)}, ${Math.round(loc.z)}` : 'Overworld';
      const station = loc ? findNearestStation(state.stations, loc) : null;
      console.log(`[TRAIN-MONITOR] New train assembled on ${srv.id}: ${train.name} (near ${station || 'Tracks'})`);
      discordService.sendTrainEvent(srv.id, {
        title: '🛠️ New Train Assembled & Commissioned',
        trainName: train.name || 'Unnamed Train',
        eventType: 'assembly',
        description: `A new train has been assembled on the network with ${train.cars?.length || 1} wagons.`,
        station: station,
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
      const station = loc ? findNearestStation(state.stations, loc) : null;

      if (train.stopped) {
        discordService.sendTrainEvent(srv.id, {
          title: station ? `🚉 Train Arrived at ${station}` : '🚉 Train Arrived at Station',
          trainName: train.name,
          eventType: 'station',
          description: station
            ? `Train \`${train.name}\` has arrived at **${station}**.`
            : `Train \`${train.name}\` has arrived at scheduled stop.`,
          station: station,
          location: coords,
        });
      }
    }
  }

  // Update memory state
  state.trainMap = currentMap;
}

function initTrainMonitor() {
  console.log('[TRAIN-MONITOR] Starting autonomous Create train dispatch monitoring loop with station resolution...');
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
  findNearestStation,
};
