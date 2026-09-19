require('dotenv/config');
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'zhishi',
  });
  await c.connect();
  const cs = await c.query('SELECT current_database(), current_schema(), current_user');
  console.log('CURRENT:', cs.rows[0]);
  const tbls = await c.query("SELECT schemaname, tablename FROM pg_tables WHERE tablename ILIKE '%material%' OR tablename ILIKE '%source%' ORDER BY schemaname, tablename");
  console.log('TABLES:', tbls.rows);
  // 尝试 search_path 调整
  await c.end();
})().catch(e => { console.error(e.message); process.exit(1); });