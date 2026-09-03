const { Router } = require('express');
const analyticsService = require('../services/playerAnalyticsService');

const router = Router();

// GET /api/player-stats/leaderboard?serverId=...&sortBy=playtime|deaths|advancements|sessions&limit=25
router.get('/leaderboard', async (req, res) => {
  try {
    const { serverId = 'all', sortBy = 'playtime', limit = 25 } = req.query;
    const leaderboard = await analyticsService.getLeaderboard({ serverId, sortBy, limit });
    res.json({
      serverId,
      sortBy,
      count: leaderboard.length,
      leaderboard,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('[API-ANALYTICS] Leaderboard error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve player leaderboard', message: err.message });
  }
});

// GET /api/player-stats/overview
router.get('/overview', async (_req, res) => {
  try {
    const overview = await analyticsService.getNetworkOverview();
    res.json(overview);
  } catch (err) {
    console.error('[API-ANALYTICS] Overview error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve network overview', message: err.message });
  }
});

// GET /api/player-stats/player/:uuidOrName
router.get('/player/:uuidOrName', async (req, res) => {
  try {
    const { uuidOrName } = req.params;
    const profile = await analyticsService.getPlayerProfile(uuidOrName);
    if (!profile) {
      return res.status(404).json({ error: `Player '${uuidOrName}' not found in analytics database` });
    }
    res.json(profile);
  } catch (err) {
    console.error('[API-ANALYTICS] Player profile error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve player profile', message: err.message });
  }
});

// GET /api/player-stats/search?q=...
router.get('/search', async (req, res) => {
  try {
    const { q = '' } = req.query;
    const results = await analyticsService.searchPlayers(q);
    res.json(results);
  } catch (err) {
    console.error('[API-ANALYTICS] Search error:', err.message);
    res.status(500).json({ error: 'Player search failed', message: err.message });
  }
});

module.exports = router;

