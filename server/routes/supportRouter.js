'use strict';

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');

const rawDbUrl = process.env.MC_DATABASE_URL || process.env.DATABASE_URL || 'mysql://user:password@127.0.0.1:3306/petablocks';
const DB_URL = rawDbUrl.includes(':3307')
  ? rawDbUrl.replace(/\/minecraft(\?|$)/, '/petablocks$1')
  : rawDbUrl;

let pool = null;
async function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      uri: DB_URL,
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return pool;
}

// GET /api/support/tickets
router.get('/tickets', async (req, res) => {
  try {
    const p = await getPool();
    const status = req.query.status;
    let query = 'SELECT * FROM support_tickets';
    const params = [];

    if (status && status !== 'all') {
      query += ' WHERE status = ?';
      params.push(status);
    }
    query += ' ORDER BY created_at DESC LIMIT 100';

    const [rows] = await p.query(query, params);
    res.json({ success: true, tickets: rows });
  } catch (err) {
    console.error('[API-SUPPORT] Get tickets error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve tickets', message: err.message });
  }
});

// POST /api/support/tickets
router.post('/tickets', async (req, res) => {
  try {
    const {
      discord_user_id,
      discord_username,
      minecraft_username,
      server_id = 'general',
      subject,
      description,
      priority = 'normal',
      discord_thread_id,
      discord_channel_id,
    } = req.body;

    if (!discord_user_id || !subject || !description) {
      return res.status(400).json({ error: 'Missing required fields: discord_user_id, subject, description' });
    }

    const ticketCode = 'TICK-' + Math.random().toString(36).substring(2, 7).toUpperCase();
    const p = await getPool();

    const [result] = await p.query(`
      INSERT INTO support_tickets (
        ticket_code, discord_user_id, discord_username, minecraft_username,
        server_id, subject, description, priority, discord_thread_id, discord_channel_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      ticketCode,
      discord_user_id,
      discord_username || 'Unknown',
      minecraft_username || null,
      server_id,
      subject,
      description,
      priority,
      discord_thread_id || null,
      discord_channel_id || null,
    ]);

    res.json({
      success: true,
      ticketId: result.insertId,
      ticketCode,
      message: 'Support ticket registered',
    });
  } catch (err) {
    console.error('[API-SUPPORT] Create ticket error:', err.message);
    res.status(500).json({ error: 'Failed to create ticket', message: err.message });
  }
});

// PATCH /api/support/tickets/:id
router.patch('/tickets/:id', async (req, res) => {
  try {
    const { status, priority, assigned_to } = req.body;
    const p = await getPool();

    const updates = [];
    const params = [];

    if (status) {
      updates.push('status = ?');
      params.push(status);
    }
    if (priority) {
      updates.push('priority = ?');
      params.push(priority);
    }
    if (assigned_to !== undefined) {
      updates.push('assigned_to = ?');
      params.push(assigned_to);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.params.id);
    await p.query(`UPDATE support_tickets SET ${updates.join(', ')} WHERE id = ? OR ticket_code = ?`, [...params, req.params.id]);

    res.json({ success: true, message: 'Ticket updated' });
  } catch (err) {
    console.error('[API-SUPPORT] Update ticket error:', err.message);
    res.status(500).json({ error: 'Failed to update ticket', message: err.message });
  }
});

module.exports = router;
