'use strict';

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { executeCommandUnified, normalizeServerId } = require('./minecraft');
const discordService = require('../services/discordWebhookService');

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
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });
  }
  return pool;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. TICKETS & BUG REPORTS (GET, POST, PATCH, TELLRAW REPLY)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/support/tickets
router.get('/tickets', async (req, res) => {
  try {
    const p = await getPool();
    const { status, type, serverId, search, limit = 100 } = req.query;
    let query = 'SELECT * FROM support_tickets WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }
    if (type && type !== 'all') {
      query += ' AND ticket_type = ?';
      params.push(type);
    }
    if (serverId && serverId !== 'all') {
      query += ' AND server_id = ?';
      params.push(serverId);
    }
    if (search) {
      query += ' AND (subject LIKE ? OR description LIKE ? OR minecraft_username LIKE ? OR ticket_code LIKE ?)';
      const s = '%' + search.trim() + '%';
      params.push(s, s, s, s);
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(Math.min(parseInt(limit, 10) || 100, 200));

    const [rows] = await p.query(query, params);
    res.json({ success: true, tickets: rows });
  } catch (err) {
    console.error('[API-SUPPORT] Get tickets error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve tickets', message: err.message });
  }
});

// GET /api/support/tickets/my - Authenticated Player Tickets Lookup
router.get('/tickets/my', async (req, res) => {
  try {
    const p = await getPool();
    const user = req.user;
    const { discordId, minecraftUsername, uuid } = req.query;

    const targetDiscord = user?.discordId || discordId;
    const targetMc = user?.minecraft?.username || user?.username || minecraftUsername;
    const targetUuid = user?.minecraft?.uuid || user?.uuid || uuid;

    if (!targetDiscord && !targetMc && !targetUuid) {
      return res.json({ success: true, tickets: [] });
    }

    const conditions = [];
    const params = [];
    if (targetDiscord) {
      conditions.push('discord_user_id = ?');
      params.push(targetDiscord);
    }
    if (targetMc) {
      conditions.push('minecraft_username = ?');
      params.push(targetMc);
    }
    if (targetUuid) {
      conditions.push('player_uuid = ?');
      params.push(targetUuid);
    }

    const query = 'SELECT * FROM support_tickets WHERE (' + conditions.join(' OR ') + ') ORDER BY created_at DESC LIMIT 50';
    const [rows] = await p.query(query, params);
    res.json({ success: true, tickets: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve user tickets', message: err.message });
  }
});

// POST /api/support/tickets
router.post('/tickets', async (req, res) => {
  try {
    const {
      discord_user_id,
      discord_username,
      minecraft_username,
      player_uuid,
      server_id = 'general',
      location,
      ticket_type = 'support',
      subject,
      description,
      priority = 'normal',
      source = 'website',
      discord_thread_id,
      discord_channel_id,
    } = req.body;

    if (!subject || !description) {
      return res.status(400).json({ error: 'Missing required fields: subject, description' });
    }

    const prefix = ticket_type === 'bug' ? 'BUG' : ticket_type === 'report' ? 'REP' : 'TICK';
    const ticketCode = prefix + '-' + Math.random().toString(36).substring(2, 7).toUpperCase();
    const p = await getPool();

    const insertSql = 'INSERT INTO support_tickets (' +
      'ticket_code, discord_user_id, discord_username, minecraft_username, player_uuid, ' +
      'server_id, location, ticket_type, source, subject, description, priority, ' +
      'discord_thread_id, discord_channel_id' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';

    const [result] = await p.query(insertSql, [
      ticketCode,
      discord_user_id || null,
      discord_username || 'Community Member',
      minecraft_username || null,
      player_uuid || null,
      server_id,
      location || null,
      ticket_type,
      source,
      subject,
      description,
      priority,
      discord_thread_id || null,
      discord_channel_id || null,
    ]);

    // Forward notification to Discord Staff / Logs
    try {
      discordService.sendConsoleAlert('create-2', {
        title: '🎫 New ' + ticket_type.toUpperCase() + ' Ticket: ' + ticketCode,
        description: '**Subject**: ' + subject + '\n**Reporter**: ' + (minecraft_username || discord_username || 'Anonymous') + '\n**Server**: `' + server_id + '`\n\n' + description.slice(0, 300) + '...',
        color: ticket_type === 'bug' ? 0xef4444 : ticket_type === 'report' ? 0xf59e0b : 0x00ffff,
        fields: [
          { name: 'Priority', value: priority.toUpperCase(), inline: true },
          { name: 'Source', value: source.toUpperCase(), inline: true },
          { name: 'Coordinates', value: location || 'N/A', inline: true },
        ],
        footerText: 'PETABLOCKS Unified Helpdesk • ID: ' + ticketCode,
      });
    } catch (_) {}

    res.json({
      success: true,
      ticketId: result.insertId,
      ticketCode,
      message: 'Ticket successfully submitted',
    });
  } catch (err) {
    console.error('[API-SUPPORT] Create ticket error:', err.message);
    res.status(500).json({ error: 'Failed to create ticket', message: err.message });
  }
});

// PATCH /api/support/tickets/:id
router.patch('/tickets/:id', async (req, res) => {
  try {
    const { status, priority, assigned_to, staff_notes } = req.body;
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
    if (staff_notes !== undefined) {
      updates.push('staff_notes = ?');
      params.push(staff_notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.params.id, req.params.id);
    await p.query('UPDATE support_tickets SET ' + updates.join(', ') + ' WHERE id = ? OR ticket_code = ?', params);

    // Send asynchronous Discord DM notification to reporter if linked
    try {
      const [ticketRows] = await p.query(
        'SELECT ticket_code, subject, discord_user_id, status FROM support_tickets WHERE id = ? OR ticket_code = ? LIMIT 1',
        [req.params.id, req.params.id]
      );
      if (ticketRows.length > 0 && ticketRows[0].discord_user_id) {
        const t = ticketRows[0];
        fetch('http://10.20.110.116:3001/api/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventType: 'ticket_update',
            discordUserId: t.discord_user_id,
            ticketCode: t.ticket_code,
            subject: t.subject,
            newStatus: status || t.status,
            staffName: assigned_to || req.headers['x-admin-user'] || 'Staff Member',
            staffNotes: staff_notes || null,
          }),
        }).catch(() => {});
      }
    } catch (_) {}

    res.json({ success: true, message: 'Ticket updated successfully' });
  } catch (err) {
    console.error('[API-SUPPORT] Update ticket error:', err.message);
    res.status(500).json({ error: 'Failed to update ticket', message: err.message });
  }
});

// POST /api/support/tickets/:id/reply-tellraw - Staff Quick In-Game Reply to Reporter
router.post('/tickets/:id/reply-tellraw', async (req, res) => {
  try {
    const { serverId = 'create-2', message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message text required' });
    }

    const p = await getPool();
    const [tickets] = await p.query(
      'SELECT ticket_code, subject, minecraft_username, discord_user_id, server_id FROM support_tickets WHERE id = ? OR ticket_code = ? LIMIT 1',
      [req.params.id, req.params.id]
    );

    if (tickets.length === 0) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    const ticket = tickets[0];
    const targetServer = normalizeServerId(serverId || ticket.server_id || 'create-2');
    const cleanMsg = message.trim().replace(/"/g, '\\"');

    // 1. In-game RCON tellraw
    let rconResult = { success: false, output: '' };
    if (ticket.minecraft_username) {
      const tellrawCmd = 'tellraw ' + ticket.minecraft_username + ' ["",{"text":"[PETABLOCKS Helpdesk] ","color":"aqua","bold":true},{"text":"Staff reply on ticket ","color":"white"},{"text":"' + ticket.ticket_code + '","color":"yellow","bold":true},{"text":": ","color":"white"},{"text":"' + cleanMsg + '","color":"green"}]';
      rconResult = await executeCommandUnified(targetServer, tellrawCmd);
    }

    // 2. Dispatch Discord DM notification to player if discord_user_id exists
    if (ticket.discord_user_id) {
      fetch('http://10.20.110.116:3001/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType: 'ticket_reply',
          discordUserId: ticket.discord_user_id,
          ticketCode: ticket.ticket_code,
          subject: ticket.subject,
          replyMessage: message.trim(),
          staffName: req.headers['x-admin-user'] || 'Staff Member',
        }),
      }).catch(() => {});
    }

    res.json({
      success: true,
      target: ticket.minecraft_username,
      server: targetServer,
      output: rconResult.output,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to dispatch in-game tellraw reply', message: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. COMMUNITY SUGGESTIONS & VOTING (PERSISTENT MARIADB)
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/support/suggestions
router.get('/suggestions', async (req, res) => {
  try {
    const p = await getPool();
    const { status, category, search, sort = 'votes', limit = 50 } = req.query;

    let query = 'SELECT * FROM community_suggestions WHERE 1=1';
    const params = [];

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }
    if (category && category !== 'all') {
      query += ' AND category = ?';
      params.push(category);
    }
    if (search) {
      query += ' AND (title LIKE ? OR description LIKE ? OR author_name LIKE ?)';
      const s = '%' + search.trim() + '%';
      params.push(s, s, s);
    }

    if (sort === 'newest') {
      query += ' ORDER BY created_at DESC';
    } else {
      query += ' ORDER BY (upvotes_count - downvotes_count) DESC, created_at DESC';
    }

    query += ' LIMIT ?';
    params.push(Math.min(parseInt(limit, 10) || 50, 100));

    const [rows] = await p.query(query, params);
    res.json({ success: true, suggestions: rows });
  } catch (err) {
    console.error('[API-SUPPORT] Get suggestions error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve suggestions', message: err.message });
  }
});

// POST /api/support/suggestions
router.post('/suggestions', async (req, res) => {
  try {
    const { title, description, category = 'General Improvement', author_id, author_name, author_avatar } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: 'Title and description required' });
    }

    const suggId = 'sugg_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const p = await getPool();

    const insertSql = 'INSERT INTO community_suggestions (' +
      'id, author_id, author_name, author_avatar, title, description, category, status' +
      ') VALUES (?, ?, ?, ?, ?, ?, ?, "under_review")';

    await p.query(insertSql, [
      suggId,
      author_id || 'web_user',
      author_name || 'Community Member',
      author_avatar || null,
      title.trim(),
      description.trim(),
      category,
    ]);

    res.json({ success: true, id: suggId, message: 'Suggestion posted!' });
  } catch (err) {
    console.error('[API-SUPPORT] Create suggestion error:', err.message);
    res.status(500).json({ error: 'Failed to create suggestion', message: err.message });
  }
});

// POST /api/support/suggestions/:id/vote
router.post('/suggestions/:id/vote', async (req, res) => {
  try {
    const { userId, voteType } = req.body; // voteType: 'up' | 'down' | 'unvote'
    if (!userId) {
      return res.status(400).json({ error: 'userId is required to vote' });
    }

    const suggId = req.params.id;
    const p = await getPool();

    // Check existing vote
    const [existing] = await p.query(
      'SELECT vote_type FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?',
      [suggId, userId]
    );

    if (voteType === 'unvote' || (existing.length > 0 && existing[0].vote_type === voteType)) {
      await p.query('DELETE FROM suggestion_votes WHERE suggestion_id = ? AND user_id = ?', [suggId, userId]);
    } else {
      await p.query(
        'INSERT INTO suggestion_votes (suggestion_id, user_id, vote_type) ' +
        'VALUES (?, ?, ?) ' +
        'ON DUPLICATE KEY UPDATE vote_type = VALUES(vote_type)',
        [suggId, userId, voteType]
      );
    }

    // Recalculate upvotes and downvotes
    const [counts] = await p.query(
      'SELECT ' +
      'SUM(CASE WHEN vote_type = "up" THEN 1 ELSE 0 END) as up_cnt, ' +
      'SUM(CASE WHEN vote_type = "down" THEN 1 ELSE 0 END) as down_cnt ' +
      'FROM suggestion_votes ' +
      'WHERE suggestion_id = ?',
      [suggId]
    );

    const upvotes = parseInt(counts[0].up_cnt || 0, 10);
    const downvotes = parseInt(counts[0].down_cnt || 0, 10);

    await p.query(
      'UPDATE community_suggestions SET upvotes_count = ?, downvotes_count = ? WHERE id = ?',
      [upvotes, downvotes, suggId]
    );

    res.json({ success: true, upvotes, downvotes, userVote: voteType });
  } catch (err) {
    console.error('[API-SUPPORT] Vote error:', err.message);
    res.status(500).json({ error: 'Failed to record vote', message: err.message });
  }
});

// PATCH /api/support/suggestions/:id/status (Staff Only)
router.patch('/suggestions/:id/status', async (req, res) => {
  try {
    const { status, staff_notes } = req.body;
    const p = await getPool();

    const updates = [];
    const params = [];
    if (status) {
      updates.push('status = ?');
      params.push(status);
    }
    if (staff_notes !== undefined) {
      updates.push('staff_notes = ?');
      params.push(staff_notes);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.params.id);
    await p.query('UPDATE community_suggestions SET ' + updates.join(', ') + ' WHERE id = ?', params);

    res.json({ success: true, message: 'Suggestion status updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update suggestion status', message: err.message });
  }
});

module.exports = router;
