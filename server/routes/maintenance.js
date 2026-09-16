const { Router } = require('express');
const maintenanceService = require('../services/maintenanceService');
const { requireAdminAuth, ROLE_LEVEL, requireRoleLevel } = require('../middleware/authMiddleware');

const router = Router();

// GET /api/maintenance - List maintenance windows (Staff+)
router.get('/', async (req, res) => {
  try {
    const { status, limit } = req.query;
    const windows = await maintenanceService.listMaintenance({ status, limit });
    res.json({
      success: true,
      count: windows.length,
      windows,
    });
  } catch (err) {
    console.error('[API-MAINTENANCE] List error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve maintenance windows', message: err.message });
  }
});

// GET /api/maintenance/active - Public endpoint for website, status page, etc.
router.get('/active', async (_req, res) => {
  try {
    const active = await maintenanceService.getActiveMaintenance();
    res.json({
      hasActive: active.some(w => w.status === 'in_progress'),
      hasScheduled: active.some(w => w.status === 'scheduled'),
      windows: active,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('[API-MAINTENANCE] Active error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve active maintenance', message: err.message });
  }
});

// GET /api/maintenance/config - Get current Discord webhook config (Admin only)
router.get('/config', requireAdminAuth, (req, res) => {
  try {
    const cfg = maintenanceService.loadConfig();
    res.json(cfg);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/maintenance/config - Update Discord webhook config (Admin only)
router.post('/config', requireAdminAuth, (req, res) => {
  try {
    const { announcementWebhookUrl, pingRole, enabled } = req.body;
    const existing = maintenanceService.loadConfig();
    const updated = {
      ...existing,
      ...(announcementWebhookUrl !== undefined && { announcementWebhookUrl }),
      ...(pingRole !== undefined && { pingRole }),
      ...(enabled !== undefined && { enabled: Boolean(enabled) }),
    };
    maintenanceService.saveConfig(updated);
    res.json({ success: true, config: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/maintenance - Create or schedule a maintenance window.
 *
 * Staff & Moderators may only declare an EMERGENCY (status = 'in_progress') —
 * they cannot pre-schedule future maintenance windows.
 * Admins and above can create any type of window.
 */
router.post('/', async (req, res) => {
  try {
    const {
      title,
      description,
      serverIds,
      status = 'scheduled',
      startTime,
      estimatedDurationMin,
      notifyDiscord = true,
      notifyIngame = true,
      autoExecute = false,
      pipelineConfig = null,
    } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Maintenance title is required.' });
    }

    const userRoleLevel = req.userRoleLevel ?? 0;
    const isAdmin = userRoleLevel >= ROLE_LEVEL['admin'];

    // Staff may only declare emergency maintenance (immediately in_progress)
    if (!isAdmin && status !== 'in_progress') {
      return res.status(403).json({
        error: 'forbidden',
        message: 'Staff may only declare emergency maintenance. To schedule planned maintenance, contact an Admin.',
      });
    }

    // Staff emergency maintenance: force status to in_progress and strip scheduling options
    const effectiveStatus = isAdmin ? status : 'in_progress';

    const createdBy = req.user?.username || (isAdmin ? 'Admin' : 'Staff');

    const window = await maintenanceService.createMaintenance({
      title,
      description,
      serverIds,
      status: effectiveStatus,
      startTime: isAdmin ? startTime : null,
      estimatedDurationMin,
      notifyDiscord,
      notifyIngame,
      autoExecute: isAdmin ? autoExecute : false,
      pipelineConfig: isAdmin ? pipelineConfig : null,
      createdBy,
    });

    res.status(201).json({ success: true, window });
  } catch (err) {
    console.error('[API-MAINTENANCE] Create error:', err.message);
    res.status(500).json({ error: 'Failed to create maintenance window', message: err.message });
  }
});

// POST /api/maintenance/:id/trigger-pipeline - Trigger autonomous pipeline (Admin only)
router.post('/:id/trigger-pipeline', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const maintenanceRunner = require('../services/maintenanceRunner');
    const win = await maintenanceService.getMaintenanceById(id);
    if (!win) {
      return res.status(404).json({ error: 'Maintenance window not found.' });
    }

    if (win.status === 'scheduled') {
      await maintenanceService.updateMaintenance(id, { status: 'in_progress', pipelineState: 'starting' });
    }

    maintenanceRunner.triggerPipeline(Number(id)).catch((err) => {
      console.error(`[API-MAINTENANCE] Error triggering pipeline for #${id}:`, err);
    });

    res.json({ success: true, message: `Automated pipeline triggered for #${id}` });
  } catch (err) {
    console.error('[API-MAINTENANCE] Trigger pipeline error:', err.message);
    res.status(500).json({ error: 'Failed to trigger maintenance pipeline', message: err.message });
  }
});

// PATCH /api/maintenance/:id - Update status or properties (Admin only)
router.patch('/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await maintenanceService.updateMaintenance(id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Maintenance window not found.' });
    }
    res.json({ success: true, window: updated });
  } catch (err) {
    console.error('[API-MAINTENANCE] Update error:', err.message);
    res.status(500).json({ error: 'Failed to update maintenance window', message: err.message });
  }
});

// DELETE /api/maintenance/:id - Delete record (Admin only)
router.delete('/:id', requireAdminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const ok = await maintenanceService.deleteMaintenance(id);
    if (!ok) {
      return res.status(404).json({ error: 'Maintenance window not found.' });
    }
    res.json({ success: true, message: 'Maintenance window deleted.' });
  } catch (err) {
    console.error('[API-MAINTENANCE] Delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete maintenance window', message: err.message });
  }
});

module.exports = router;

