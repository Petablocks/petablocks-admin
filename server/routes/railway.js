const { Router } = require('express');
const mysql = require('mysql2/promise');
const http = require('http');
const discordService = require('../services/discordWebhookService');
const { executeCommandUnified } = require('./minecraft');

const router = Router();

const adminDbUrl = process.env.DATABASE_URL || 'mysql://user:password@127.0.0.1:3306/petablocks_admin';
let pool = null;

async function getAdminPool() {
  if (!pool) {
    pool = mysql.createPool({
      uri: adminDbUrl,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
    });

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS railway_lines (
          id INT AUTO_INCREMENT PRIMARY KEY,
          server_id VARCHAR(64) DEFAULT 'create-2',
          code VARCHAR(32) NOT NULL,
          name VARCHAR(128) NOT NULL,
          color VARCHAR(32) DEFAULT '#3b82f6',
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_server (server_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS railway_sections (
          id INT AUTO_INCREMENT PRIMARY KEY,
          server_id VARCHAR(64) DEFAULT 'create-2',
          line_id INT NULL,
          name VARCHAR(128) NOT NULL,
          ref_start_station VARCHAR(128) NULL,
          ref_end_station VARCHAR(128) NULL,
          dimension VARCHAR(64) DEFAULT 'minecraft:overworld',
          coord_x1 DOUBLE NULL,
          coord_y1 DOUBLE NULL,
          coord_z1 DOUBLE NULL,
          coord_x2 DOUBLE NULL,
          coord_y2 DOUBLE NULL,
          coord_z2 DOUBLE NULL,
          radius_blocks INT DEFAULT 50,
          description TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_server (server_id),
          INDEX idx_line (line_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      await pool.query(`
        CREATE TABLE IF NOT EXISTS railway_maintenance (
          id INT AUTO_INCREMENT PRIMARY KEY,
          server_id VARCHAR(64) DEFAULT 'create-2',
          line_id INT NULL,
          section_id INT NULL,
          title VARCHAR(128) NOT NULL,
          status ENUM('scheduled', 'active', 'cleared', 'cancelled') DEFAULT 'active',
          severity ENUM('closed', 'caution', 'info') DEFAULT 'caution',
          reason TEXT NOT NULL,
          speed_limit VARCHAR(32) DEFAULT 'Normal',
          staff_name VARCHAR(64) NOT NULL,
          announced TINYINT(1) DEFAULT 1,
          broadcast_interval_minutes INT DEFAULT 30,
          last_broadcast_at TIMESTAMP NULL,
          starts_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          eta_completion TIMESTAMP NULL,
          cleared_at TIMESTAMP NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_server (server_id),
          INDEX idx_status (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);

      console.log('[RAILWAY-ROUTER] Railway database tables verified successfully.');
    } catch (err) {
      console.error('[RAILWAY-ROUTER] Table migration warning:', err.message);
    }
  }
  return pool;
}

// In-memory cache for Create 2 Network (stations & track paths)
let cachedNetwork = null;
let lastNetworkFetch = 0;

function fetchJson(host, port, path, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host, port, path, timeout: timeoutMs }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
  });
}

// 1. GET /api/railway/network - live stations, tracks, portals
router.get('/network', async (req, res) => {
  const now = Date.now();
  if (cachedNetwork && (now - lastNetworkFetch < 30000)) {
    return res.json(cachedNetwork);
  }
  try {
    const data = await fetchJson('10.20.110.119', 3876, '/api/network', 5000);
    cachedNetwork = data;
    lastNetworkFetch = now;
    res.json(data);
  } catch (err) {
    if (cachedNetwork) return res.json(cachedNetwork);
    res.status(502).json({ error: 'Failed to fetch Create 2 network data', message: err.message });
  }
});

// 2. GET /api/railway/trains - live trains
router.get('/trains', async (req, res) => {
  try {
    const data = await fetchJson('10.20.110.119', 3876, '/api/trains', 4000);
    res.json(data.trains || []);
  } catch (err) {
    res.status(502).json({ error: 'Failed to fetch Create 2 trains', message: err.message });
  }
});

// 3. GET /api/railway/lines - list all lines
router.get('/lines', async (req, res) => {
  try {
    const p = await getAdminPool();
    const [rows] = await p.query('SELECT * FROM railway_lines ORDER BY code ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/railway/lines - create line
router.post('/lines', async (req, res) => {
  const { code, name, color, description, server_id } = req.body;
  if (!code || !name) {
    return res.status(400).json({ error: 'Code and Name are required' });
  }
  try {
    const p = await getAdminPool();
    const [result] = await p.query(
      'INSERT INTO railway_lines (server_id, code, name, color, description) VALUES (?, ?, ?, ?, ?)',
      [server_id || 'create-2', code.toUpperCase(), name, color || '#3b82f6', description || '']
    );
    res.json({ id: result.insertId, code: code.toUpperCase(), name, color, description });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/railway/lines/:id
router.delete('/lines/:id', async (req, res) => {
  try {
    const p = await getAdminPool();
    await p.query('DELETE FROM railway_lines WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. GET /api/railway/sections - list labeled sections
router.get('/sections', async (req, res) => {
  try {
    const p = await getAdminPool();
    const [rows] = await p.query(`
      SELECT s.*, l.code as line_code, l.name as line_name, l.color as line_color
      FROM railway_sections s
      LEFT JOIN railway_lines l ON s.line_id = l.id
      ORDER BY s.name ASC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/railway/sections - create labeled section
router.post('/sections', async (req, res) => {
  const {
    name,
    line_id,
    ref_start_station,
    ref_end_station,
    dimension,
    coord_x1,
    coord_y1,
    coord_z1,
    coord_x2,
    coord_y2,
    coord_z2,
    radius_blocks,
    description,
    server_id,
  } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Section name is required' });
  }

  try {
    const p = await getAdminPool();
    const [result] = await p.query(
      `INSERT INTO railway_sections 
        (server_id, line_id, name, ref_start_station, ref_end_station, dimension, 
         coord_x1, coord_y1, coord_z1, coord_x2, coord_y2, coord_z2, radius_blocks, description)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        server_id || 'create-2',
        line_id ? parseInt(line_id) : null,
        name,
        ref_start_station || null,
        ref_end_station || null,
        dimension || 'minecraft:overworld',
        coord_x1 !== undefined && coord_x1 !== '' ? parseFloat(coord_x1) : null,
        coord_y1 !== undefined && coord_y1 !== '' ? parseFloat(coord_y1) : null,
        coord_z1 !== undefined && coord_z1 !== '' ? parseFloat(coord_z1) : null,
        coord_x2 !== undefined && coord_x2 !== '' ? parseFloat(coord_x2) : null,
        coord_y2 !== undefined && coord_y2 !== '' ? parseFloat(coord_y2) : null,
        coord_z2 !== undefined && coord_z2 !== '' ? parseFloat(coord_z2) : null,
        radius_blocks ? parseInt(radius_blocks) : 50,
        description || '',
      ]
    );

    res.json({ id: result.insertId, name, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/railway/sections/:id
router.delete('/sections/:id', async (req, res) => {
  try {
    const p = await getAdminPool();
    await p.query('DELETE FROM railway_sections WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. GET /api/railway/maintenance - list maintenance notices
router.get('/maintenance', async (req, res) => {
  try {
    const p = await getAdminPool();
    const [rows] = await p.query(`
      SELECT m.*, 
             s.name as section_name, s.ref_start_station, s.ref_end_station,
             s.coord_x1, s.coord_y1, s.coord_z1, s.coord_x2, s.coord_y2, s.coord_z2, s.radius_blocks,
             l.code as line_code, l.name as line_name, l.color as line_color
      FROM railway_maintenance m
      LEFT JOIN railway_sections s ON m.section_id = s.id
      LEFT JOIN railway_lines l ON m.line_id = l.id
      ORDER BY FIELD(m.status, 'active', 'scheduled', 'cleared', 'cancelled'), m.starts_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Broadcast Helper for In-Game Tellraw + Audio Chime
async function dispatchInGameMaintenanceNotice(serverId, notice, isClearNotice = false) {
  const targetServer = serverId || 'create-2';
  try {
    if (isClearNotice) {
      const clearTellraw = JSON.stringify([
        { text: '[RAILWAY DISPATCH] ', color: 'green', bold: true },
        { text: '🟢 Track Maintenance Cleared: ', color: 'green' },
        { text: notice.title, color: 'white', bold: true },
        { text: ' has reopened for normal operations.', color: 'yellow' }
      ]);
      await executeCommandUnified(targetServer, `tellraw @a ${clearTellraw}`);
      await executeCommandUnified(targetServer, `execute as @a at @s run playsound minecraft:entity.player.levelup master @s ~ ~ ~ 0.8 1.4`);
      return;
    }

    const severityColor = notice.severity === 'closed' ? 'red' : notice.severity === 'caution' ? 'gold' : 'aqua';
    const severityLabel = notice.severity === 'closed' ? '⛔ TRACK CLOSED' : notice.severity === 'caution' ? '⚠️ CAUTION / RESTRICTED' : 'ℹ️ ADVISORY';

    let locationDesc = '';
    if (notice.section_name) {
      locationDesc = ` [Section: ${notice.section_name}]`;
    }
    if (notice.ref_start_station && notice.ref_end_station) {
      locationDesc += ` (${notice.ref_start_station} ➔ ${notice.ref_end_station})`;
    }

    const tellrawComponent = [
      { text: '[RAILWAY DISPATCH] ', color: 'gold', bold: true },
      { text: `${severityLabel}: `, color: severityColor, bold: true },
      { text: notice.title + locationDesc, color: 'white', bold: true },
      { text: ` — ${notice.reason}`, color: 'yellow' },
      notice.speed_limit && notice.speed_limit !== 'Normal' ? { text: ` (Speed Limit: ${notice.speed_limit})`, color: 'aqua' } : { text: '' }
    ];

    await executeCommandUnified(targetServer, `tellraw @a ${JSON.stringify(tellrawComponent)}`);
    await executeCommandUnified(targetServer, `execute as @a at @s run playsound minecraft:block.note_block.bell master @s ~ ~ ~ 1.0 1.0`);
  } catch (err) {
    console.error(`[RAILWAY-ROUTER] Failed to broadcast in-game tellraw to ${targetServer}:`, err.message);
  }
}

// POST /api/railway/maintenance - create maintenance notice
router.post('/maintenance', async (req, res) => {
  const {
    title,
    line_id,
    section_id,
    severity,
    status,
    reason,
    speed_limit,
    staff_name,
    announced,
    broadcast_interval_minutes,
    starts_at,
    eta_completion,
    server_id,
  } = req.body;

  if (!title || !reason) {
    return res.status(400).json({ error: 'Title and reason are required' });
  }

  const noticeStatus = status || 'active';
  const noticeSeverity = severity || 'caution';
  const staff = staff_name || req.user?.username || 'Staff Dispatch';
  const targetServer = server_id || 'create-2';

  try {
    const p = await getAdminPool();
    const [result] = await p.query(
      `INSERT INTO railway_maintenance 
        (server_id, line_id, section_id, title, status, severity, reason, speed_limit, staff_name, 
         announced, broadcast_interval_minutes, last_broadcast_at, starts_at, eta_completion)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
      [
        targetServer,
        line_id ? parseInt(line_id) : null,
        section_id ? parseInt(section_id) : null,
        title,
        noticeStatus,
        noticeSeverity,
        reason,
        speed_limit || (noticeSeverity === 'closed' ? 'Track Closed / Stopped' : 'Caution / 15 m/s'),
        staff,
        announced !== false ? 1 : 0,
        broadcast_interval_minutes ? parseInt(broadcast_interval_minutes) : 30,
        starts_at ? new Date(starts_at) : new Date(),
        eta_completion ? new Date(eta_completion) : null,
      ]
    );

    const noticeId = result.insertId;

    // Fetch joined details for announcement
    const [rows] = await p.query(`
      SELECT m.*, s.name as section_name, s.ref_start_station, s.ref_end_station, l.name as line_name
      FROM railway_maintenance m
      LEFT JOIN railway_sections s ON m.section_id = s.id
      LEFT JOIN railway_lines l ON m.line_id = l.id
      WHERE m.id = ?
    `, [noticeId]);

    const createdNotice = rows[0];

    // Broadcast in-game immediately if active and announced is true
    if (noticeStatus === 'active' && announced !== false) {
      await dispatchInGameMaintenanceNotice(targetServer, createdNotice, false);
    }

    // Send Discord Webhook Notice
    try {
      discordService.sendTrainEvent(targetServer, {
        title: `🚨 Railway Track Maintenance Notice: ${createdNotice.title}`,
        trainName: createdNotice.line_name || 'Railway Network',
        eventType: 'maintenance',
        description: `**Severity**: ${noticeSeverity.toUpperCase()}\n**Reason**: ${createdNotice.reason}\n**Speed Limit**: ${createdNotice.speed_limit || 'Standard'}\n**Staff**: ${staff}`,
        station: createdNotice.section_name || (createdNotice.ref_start_station ? `${createdNotice.ref_start_station} ➔ ${createdNotice.ref_end_station}` : null),
        location: targetServer.toUpperCase(),
      });
    } catch (discErr) {
      console.warn('[RAILWAY-ROUTER] Discord webhook notification skipped:', discErr.message);
    }

    res.json({ id: noticeId, ...createdNotice, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/railway/maintenance/:id/clear - resolve maintenance
router.patch('/maintenance/:id/clear', async (req, res) => {
  try {
    const p = await getAdminPool();
    const [rows] = await p.query(`
      SELECT m.*, s.name as section_name, s.ref_start_station, s.ref_end_station
      FROM railway_maintenance m
      LEFT JOIN railway_sections s ON m.section_id = s.id
      WHERE m.id = ?
    `, [req.params.id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Maintenance notice not found' });
    }

    const notice = rows[0];
    await p.query('UPDATE railway_maintenance SET status = "cleared", cleared_at = NOW() WHERE id = ?', [req.params.id]);

    // Broadcast all-clear in-game
    await dispatchInGameMaintenanceNotice(notice.server_id, notice, true);

    // Discord notification
    try {
      discordService.sendTrainEvent(notice.server_id, {
        title: `🟢 Track Maintenance Cleared: ${notice.title}`,
        trainName: notice.section_name || 'Railway Network',
        eventType: 'clear',
        description: `Trackwork has been resolved. Line has resumed normal operating schedules.`,
        station: notice.section_name,
        location: notice.server_id.toUpperCase(),
      });
    } catch (e) {}

    res.json({ success: true, message: 'Maintenance cleared and all-clear broadcasted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/railway/maintenance/:id/announce - manual broadcast
router.post('/maintenance/:id/announce', async (req, res) => {
  try {
    const p = await getAdminPool();
    const [rows] = await p.query(`
      SELECT m.*, s.name as section_name, s.ref_start_station, s.ref_end_station
      FROM railway_maintenance m
      LEFT JOIN railway_sections s ON m.section_id = s.id
      WHERE m.id = ?
    `, [req.params.id]);

    if (!rows.length) {
      return res.status(404).json({ error: 'Maintenance notice not found' });
    }

    const notice = rows[0];
    await dispatchInGameMaintenanceNotice(notice.server_id, notice, false);
    await p.query('UPDATE railway_maintenance SET last_broadcast_at = NOW() WHERE id = ?', [req.params.id]);

    res.json({ success: true, message: 'In-game announcement dispatched' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = {
  router,
  getAdminPool,
  dispatchInGameMaintenanceNotice,
};
