const { Router } = require('express');
const usersService = require('../services/usersService');

const router = Router();

// GET /api/users/overview
router.get('/overview', async (_req, res) => {
  try {
    const overview = await usersService.getUsersOverview();
    res.json(overview);
  } catch (err) {
    console.error('[API-USERS] Overview error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve registered users overview', message: err.message });
  }
});

// GET /api/users?search=...&provider=...&linked=...&role=...&limit=50&offset=0
router.get('/', async (req, res) => {
  try {
    const {
      search = '',
      provider = 'all',
      linked = 'all',
      role = 'all',
      limit = 50,
      offset = 0,
    } = req.query;

    const data = await usersService.getUsersList({
      search,
      provider,
      linked,
      role,
      limit: Math.min(Math.max(Number(limit) || 50, 1), 100),
      offset: Math.max(Number(offset) || 0, 0),
    });

    res.json(data);
  } catch (err) {
    console.error('[API-USERS] List error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve registered users list', message: err.message });
  }
});

// GET /api/users/:id
router.get('/:id', async (req, res) => {
  try {
    const user = await usersService.getUserDetails(req.params.id);
    if (!user) {
      return res.status(404).json({ error: `User with ID ${req.params.id} not found` });
    }
    res.json(user);
  } catch (err) {
    console.error('[API-USERS] Detail error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve user details', message: err.message });
  }
});

// PATCH /api/users/:id/role
router.patch('/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!role || typeof role !== 'string') {
      return res.status(400).json({ error: 'Field "role" is required and must be a string' });
    }

    const updatedUser = await usersService.updateUserRole(req.params.id, role.trim(), req.headers['x-admin-user'] || 'Admin');
    res.json({ ok: true, message: `Role successfully updated to "${role}"`, user: updatedUser });
  } catch (err) {
    console.error('[API-USERS] Role update error:', err.message);
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
