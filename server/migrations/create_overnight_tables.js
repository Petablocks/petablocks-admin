'use strict';

const mysql = require('mysql2/promise');

const rawDbUrl = process.env.MC_DATABASE_URL || process.env.DATABASE_URL || 'mysql://user:password@127.0.0.1:3306/petablocks';
const DB_URL = rawDbUrl.includes(':3307')
  ? rawDbUrl.replace(/\/minecraft(\?|$)/, '/petablocks$1')
  : rawDbUrl;

async function migrate() {
  const p = await mysql.createPool({ uri: DB_URL });
  console.log('[MIGRATION] Connected to MariaDB:', DB_URL.split('@')[1]);

  // 1. support_tickets table
  await p.query(`
    CREATE TABLE IF NOT EXISTS support_tickets (
      id INT AUTO_INCREMENT PRIMARY KEY,
      ticket_code VARCHAR(32) NOT NULL UNIQUE,
      discord_user_id VARCHAR(64) NOT NULL,
      discord_username VARCHAR(128) NOT NULL,
      minecraft_username VARCHAR(64) NULL,
      server_id VARCHAR(64) DEFAULT 'general',
      subject VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      status ENUM('open', 'in_progress', 'resolved', 'closed') DEFAULT 'open',
      priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
      discord_thread_id VARCHAR(64) NULL,
      discord_channel_id VARCHAR(64) NULL,
      assigned_to VARCHAR(128) NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_discord_user (discord_user_id),
      INDEX idx_status (status),
      INDEX idx_server (server_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[MIGRATION] support_tickets table ready');

  // 2. community_events table
  await p.query(`
    CREATE TABLE IF NOT EXISTS community_events (
      id INT AUTO_INCREMENT PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      server_id VARCHAR(64) NOT NULL DEFAULT 'all',
      event_type VARCHAR(64) NOT NULL DEFAULT 'community_meetup',
      location_coords VARCHAR(128) NULL,
      scheduled_start DATETIME NOT NULL,
      scheduled_end DATETIME NULL,
      status ENUM('scheduled', 'in_progress', 'completed', 'cancelled') DEFAULT 'scheduled',
      discord_message_id VARCHAR(64) NULL,
      discord_channel_id VARCHAR(64) NULL,
      rsvp_going_count INT DEFAULT 0,
      rsvp_tentative_count INT DEFAULT 0,
      announcement_sent TINYINT(1) DEFAULT 0,
      countdown_sent TINYINT(1) DEFAULT 0,
      created_by VARCHAR(128) DEFAULT 'Admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status (status),
      INDEX idx_scheduled_start (scheduled_start)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[MIGRATION] community_events table ready');

  // 3. auto_broadcast_messages table
  await p.query(`
    CREATE TABLE IF NOT EXISTS auto_broadcast_messages (
      id INT AUTO_INCREMENT PRIMARY KEY,
      server_id VARCHAR(64) NOT NULL DEFAULT 'all',
      message_json TEXT NOT NULL,
      plain_text VARCHAR(255) NOT NULL,
      is_enabled TINYINT(1) DEFAULT 1,
      display_interval_minutes INT DEFAULT 30,
      last_sent_at DATETIME NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);
  console.log('[MIGRATION] auto_broadcast_messages table ready');

  // Seed default broadcast messages if table is empty
  const [existingMessages] = await p.query('SELECT COUNT(*) as cnt FROM auto_broadcast_messages');
  if (existingMessages[0].cnt === 0) {
    await p.query(`
      INSERT INTO auto_broadcast_messages (server_id, plain_text, message_json) VALUES
      ('all', 'Link your Minecraft account with /link to sync your Discord ranks & perks!', 'tellraw @a [{"text":"[PETABLOCKS] ","color":"gold","bold":true},{"text":"Link your Minecraft account with ","color":"yellow"},{"text":"/link","color":"aqua","bold":true},{"text":" to sync Discord ranks & website stats!","color":"yellow"}]'),
      ('all', 'Explore the interactive live web map anytime at petablocks.com/maps!', 'tellraw @a [{"text":"[PETABLOCKS] ","color":"gold","bold":true},{"text":"Explore the real-time live map at ","color":"yellow"},{"text":"petablocks.com/maps","color":"green","underlined":true},{"text":"!","color":"yellow"}]'),
      ('all', 'Need support or want to report an issue? Use /report in-game or visit our Discord #open-a-ticket!', 'tellraw @a [{"text":"[PETABLOCKS] ","color":"gold","bold":true},{"text":"Need assistance? Visit Discord ","color":"yellow"},{"text":"#open-a-ticket","color":"aqua"},{"text":" or use in-game ","color":"yellow"},{"text":"/report","color":"gold","bold":true},{"text":"!","color":"yellow"}]')
    `);
    console.log('[MIGRATION] Seeded default broadcast messages');
  }

  await p.end();
  console.log('[MIGRATION] All tables created successfully.');
}

migrate().catch(err => {
  console.error('[MIGRATION-ERROR]', err);
  process.exit(1);
});
