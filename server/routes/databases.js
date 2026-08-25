const { Router } = require('express');
const mysql = require('mysql2/promise');

const router = Router();

const DB_CONFIGS = [
  {
    name: 'MariaDB — Frontend Apps',
    host: process.env.DB_HOST || '10.20.110.117',
    port: 3306,
    url: process.env.DATABASE_URL,
  },
  {
    name: 'MariaDB — MC Plugins',
    host: process.env.DB_HOST || '10.20.110.117',
    port: 3307,
    url: process.env.MC_DATABASE_URL,
  },
];

// GET /api/databases
router.get('/', async (_req, res) => {
  const results = await Promise.all(
    DB_CONFIGS.map(async (cfg) => {
      if (!cfg.url) {
        return { name: cfg.name, host: cfg.host, port: cfg.port, connected: false, databases: [], error: 'URL not configured' };
      }
      try {
        const conn = await mysql.createConnection(cfg.url);
        const [dbRows] = await conn.query(
          `SELECT table_schema as name,
                  COUNT(*) as tables,
                  ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) as sizeMb
           FROM information_schema.TABLES
           WHERE table_schema NOT IN ('information_schema','performance_schema','mysql','sys')
           GROUP BY table_schema`
        );
        await conn.end();
        return { name: cfg.name, host: cfg.host, port: cfg.port, connected: true, databases: dbRows };
      } catch (err) {
        return { name: cfg.name, host: cfg.host, port: cfg.port, connected: false, databases: [], error: String(err) };
      }
    })
  );
  res.json(results);
});

module.exports = router;
