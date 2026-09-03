/**
 * PETABLOCKS Autonomous Maintenance Execution Engine
 *
 * Runs continuously in the background of petablocks-admin.
 * Detects upcoming scheduled maintenance windows, emits countdown warnings,
 * kicks off automated container reboots to load new mod versions, polls health checks,
 * and auto-completes maintenance windows without requiring operator intervention.
 */

const maintenanceService = require('./maintenanceService');
const discordService = require('./discordWebhookService');
const { executeCommandUnified } = require('../routes/minecraft');
const { NODES, SERVERS_REGISTRY, runSshCommand, checkPortOpen } = require('../routes/serverManager');

const runningPipelines = new Set();
let runnerInterval = null;

/**
 * Start the autonomous maintenance runner
 */
function start(intervalMs = 15000) {
  if (runnerInterval) return;
  console.log('[MAINTENANCE-RUNNER] Starting autonomous maintenance scheduler engine...');
  runnerInterval = setInterval(tick, intervalMs);
  setTimeout(tick, 2000); // Initial run
}

/**
 * Stop the runner
 */
function stop() {
  if (runnerInterval) {
    clearInterval(runnerInterval);
    runnerInterval = null;
    console.log('[MAINTENANCE-RUNNER] Autonomous maintenance scheduler engine stopped.');
  }
}

/**
 * Main evaluation loop
 */
async function tick() {
  try {
    const windows = await maintenanceService.listMaintenance({ limit: 20 });
    const now = Date.now();

    for (const win of windows) {
      if (!win.auto_execute) continue;

      if (win.status === 'scheduled') {
        const remainingMs = win.start_time - now;

        // Phase 1: Advance Warnings
        if (remainingMs <= 15 * 60 * 1000 && remainingMs > 5 * 60 * 1000 && win.last_warning_min !== 15) {
          await broadcastWarning(win, 15);
          await maintenanceService.updateMaintenance(win.id, { lastWarningMin: 15 });
        } else if (remainingMs <= 5 * 60 * 1000 && remainingMs > 60 * 1000 && win.last_warning_min !== 5) {
          await broadcastWarning(win, 5);
          await maintenanceService.updateMaintenance(win.id, { lastWarningMin: 5 });
        } else if (remainingMs <= 60 * 1000 && remainingMs > 0 && win.last_warning_min !== 1) {
          await broadcastWarning(win, 1);
          await maintenanceService.updateMaintenance(win.id, { lastWarningMin: 1 });
        }

        // Phase 2: Start Time Reached
        if (remainingMs <= 0 && !runningPipelines.has(win.id)) {
          console.log(`[MAINTENANCE-RUNNER] Kickoff time reached for #${win.id} ("${win.title}")`);
          await maintenanceService.updateMaintenance(win.id, {
            status: 'in_progress',
            pipelineState: 'starting'
          });
          runPipeline(win.id).catch((err) => {
            console.error(`[MAINTENANCE-RUNNER] Error running pipeline #${win.id}:`, err);
          });
        }
      } else if (win.status === 'in_progress' && win.pipeline_state === 'starting' && !runningPipelines.has(win.id)) {
        // In progress but pipeline not yet executing (e.g. after server restart)
        runPipeline(win.id).catch((err) => {
          console.error(`[MAINTENANCE-RUNNER] Error resuming pipeline #${win.id}:`, err);
        });
      }
    }
  } catch (err) {
    console.warn('[MAINTENANCE-RUNNER] Tick evaluation error:', err.message);
  }
}

/**
 * Broadcast in-game countdown notices
 */
async function broadcastWarning(win, minutes) {
  const targetServers = (!Array.isArray(win.server_ids) || win.server_ids.includes('all'))
    ? ['fabric-main', 'create-2', 'patreon-creative']
    : win.server_ids;

  const msg = minutes === 1
    ? `⚠️ Server entering maintenance mode in 60 SECONDS! Please save and log off safely.`
    : `⚠️ Scheduled maintenance will begin in ${minutes} minutes. Please save your progress.`;

  for (const sid of targetServers) {
    try {
      await executeCommandUnified(
        sid,
        `tellraw @a [{"text":"[PETABLOCKS] ","color":"gold","bold":true},{"text":"${msg}","color":"yellow"}]`
      );
    } catch (e) {
      // ignore
    }
  }
  console.log(`[MAINTENANCE-RUNNER] Sent ${minutes}m warning for #${win.id}`);
}

/**
 * Execute the automated maintenance pipeline
 */
async function runPipeline(windowId) {
  if (runningPipelines.has(windowId)) return;
  runningPipelines.add(windowId);

  const logs = [];
  const logStep = (step, details) => {
    const entry = { time: Date.now(), step, details };
    logs.push(entry);
    console.log(`[PIPELINE #${windowId}] [${step}]`, details);
  };

  try {
    const win = await maintenanceService.getMaintenanceById(windowId);
    if (!win) {
      runningPipelines.delete(windowId);
      return;
    }

    const cfg = win.pipeline_config || {};
    const doSaveAll = cfg.saveAll !== false;
    const doRestart = cfg.restartContainers !== false;
    const doHealthCheck = cfg.waitForHealth !== false;
    const doAutoComplete = cfg.autoComplete !== false;
    const healthTimeoutSec = parseInt(cfg.healthTimeoutSec, 10) || 300;

    const targetServerIds = (!Array.isArray(win.server_ids) || win.server_ids.includes('all'))
      ? ['fabric-main', 'create-2', 'patreon-creative']
      : win.server_ids;

    logStep('INIT', `Automated pipeline initiated for servers: ${targetServerIds.join(', ')}`);
    await maintenanceService.updateMaintenance(windowId, {
      pipelineState: 'saving',
      pipelineLogs: logs
    });

    // ── STEP 1: SAVE WORLD DATA ──────────────────────────────────────────
    if (doSaveAll) {
      logStep('SAVE_ALL', 'Sending /save-all flush to affected servers...');
      for (const sid of targetServerIds) {
        try {
          await executeCommandUnified(sid, 'save-all flush');
          logStep('SAVE_ALL', `Successfully flushed world data on ${sid}`);
        } catch (err) {
          logStep('SAVE_ALL_WARN', `Save command failed on ${sid}: ${err.message}`);
        }
      }
      // Give 5 seconds for world save disk sync
      await new Promise((r) => setTimeout(r, 5000));
    }

    // ── STEP 2: REBOOT DOCKER CONTAINERS ─────────────────────────────────
    if (doRestart) {
      logStep('RESTART', 'Rebooting target Docker containers to apply updates...');
      await maintenanceService.updateMaintenance(windowId, {
        pipelineState: 'restarting',
        pipelineLogs: logs
      });

      for (const sid of targetServerIds) {
        const srv = SERVERS_REGISTRY.find((s) => s.id === sid);
        if (!srv) {
          logStep('RESTART_SKIP', `No server registry entry for ${sid}`);
          continue;
        }

        const node = NODES[srv.nodeId];
        if (!node) {
          logStep('RESTART_SKIP', `No node found for ${srv.nodeId}`);
          continue;
        }

        try {
          logStep('RESTART_EXEC', `Rebooting container ${srv.containerName} on ${node.name}...`);
          const { stdout, stderr, code } = await runSshCommand(node, `docker restart ${srv.containerName}`, 60000);
          if (code === 0) {
            logStep('RESTART_SUCCESS', `Container ${srv.containerName} rebooted successfully.`);
          } else {
            logStep('RESTART_ERROR', `Failed rebooting ${srv.containerName}: ${stderr || stdout}`);
          }
        } catch (err) {
          logStep('RESTART_ERROR', `SSH restart exception for ${sid}: ${err.message}`);
        }
      }
    }

    // ── STEP 3: WAIT FOR HEALTH VERIFICATION ─────────────────────────────
    if (doHealthCheck) {
      logStep('HEALTH_CHECK', `Verifying servers return online (timeout: ${healthTimeoutSec}s)...`);
      await maintenanceService.updateMaintenance(windowId, {
        pipelineState: 'verifying',
        pipelineLogs: logs
      });

      const pollStart = Date.now();
      let allHealthy = false;

      while (Date.now() - pollStart < healthTimeoutSec * 1000) {
        let healthyCount = 0;

        for (const sid of targetServerIds) {
          const srv = SERVERS_REGISTRY.find((s) => s.id === sid);
          if (!srv) {
            healthyCount++;
            continue;
          }

          const node = NODES[srv.nodeId];
          const host = node ? node.host : '127.0.0.1';
          const port = srv.gamePort;

          const isPortOpen = await checkPortOpen(host, port, 3000);
          if (isPortOpen) {
            healthyCount++;
          }
        }

        if (healthyCount === targetServerIds.length) {
          allHealthy = true;
          logStep('HEALTH_CHECK_SUCCESS', `All ${targetServerIds.length} servers verified online & responsive!`);
          break;
        }

        // Wait 8s between health polls
        await new Promise((r) => setTimeout(r, 8000));
      }

      if (!allHealthy) {
        logStep('HEALTH_CHECK_TIMEOUT', 'One or more servers did not report healthy before timeout.');
        await maintenanceService.updateMaintenance(windowId, {
          pipelineState: 'health_timeout',
          pipelineLogs: logs
        });
        discordService.sendConsoleAlert(targetServerIds[0] || 'network', {
          title: `⚠️ Automated Maintenance Health Timeout`,
          description: `Maintenance window #${windowId} ("${win.title}") completed container restarts, but health verification timed out after ${healthTimeoutSec}s.\nCheck container logs.`,
          color: 0xef4444,
        });
        runningPipelines.delete(windowId);
        return;
      }
    }

    // ── STEP 4: AUTO-COMPLETE & UNLOCK ───────────────────────────────────
    if (doAutoComplete) {
      logStep('FINALIZE', 'Auto-completing maintenance and unlocking gateway...');
      await maintenanceService.updateMaintenance(windowId, {
        status: 'completed',
        pipelineState: 'completed',
        pipelineLogs: logs
      });
      logStep('DONE', 'Maintenance window successfully completed with zero human intervention!');
    } else {
      await maintenanceService.updateMaintenance(windowId, {
        pipelineState: 'awaiting_operator',
        pipelineLogs: logs
      });
    }
  } catch (err) {
    logStep('FATAL_ERROR', err.message);
    await maintenanceService.updateMaintenance(windowId, {
      pipelineState: 'failed',
      pipelineLogs: logs
    }).catch(console.error);
  } finally {
    runningPipelines.delete(windowId);
  }
}

/**
 * Manually trigger the pipeline for a maintenance window
 */
async function triggerPipeline(windowId) {
  return runPipeline(windowId);
}

module.exports = {
  start,
  stop,
  triggerPipeline,
  broadcastWarning
};
