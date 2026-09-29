/**
 * REST API Routes for Network Announcements & Fleet Broadcasts
 */

const { Router } = require('express');
const announcementService = require('../services/announcementService');
const { requireStaffAuth, requireAdminAuth } = require('../middleware/authMiddleware');

const router = Router();

// GET /api/announcements/history - Staff & Admins
router.get('/history', requireStaffAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 30;
    const history = await announcementService.getHistory(limit);
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve history', message: err.message });
  }
});

// GET /api/announcements/config - Admin only
router.get('/config', requireStaffAuth, requireAdminAuth, (req, res) => {
  try {
    const config = announcementService.loadConfig();
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/announcements/config - Admin only
router.post('/config', requireStaffAuth, requireAdminAuth, (req, res) => {
  try {
    const { announcementWebhookUrl, announcementChannelId, defaultPingRole, enabled } = req.body;
    const current = announcementService.loadConfig();
    const updated = {
      ...current,
      ...(announcementWebhookUrl !== undefined && { announcementWebhookUrl }),
      ...(announcementChannelId !== undefined && { announcementChannelId }),
      ...(defaultPingRole !== undefined && { defaultPingRole }),
      ...(enabled !== undefined && { enabled: Boolean(enabled) }),
    };
    announcementService.saveConfig(updated);
    res.json({ success: true, config: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/announcements/broadcast - Send immediately (Staff+)
router.post('/broadcast', requireStaffAuth, async (req, res) => {
  try {
    const {
      title,
      description,
      category = 'general',
      pingRole = 'none',
      url,
      imageUrl,
      targetServers = ['all'],
      sendDiscord = true,
      sendIngame = true,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Announcement title is required.' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Announcement description or content is required.' });
    }

    const createdBy = req.user?.username || 'Staff';

    const result = await announcementService.broadcastAnnouncement({
      title,
      description,
      category,
      pingRole,
      url,
      imageUrl,
      targetServers,
      sendDiscord,
      sendIngame,
      createdBy,
    });

    res.json({ success: true, announcement: result });
  } catch (err) {
    console.error('[API-ANNOUNCEMENTS] Broadcast error:', err);
    res.status(500).json({ error: 'Broadcast failed', message: err.message });
  }
});

module.exports = router;
