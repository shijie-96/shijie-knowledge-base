require('dotenv/config');
const { Client } = require('pg');
(async () => {
  const c = new Client({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'zhishi',
  });
  await c.connect();
  // 查最新一条素材
  const r = await c.query(`
    SELECT id, title,
      original_text,
      summary,
      source_type,
      created_at
    FROM source_materials
    WHERE deleted_at IS NULL
    ORDER BY created_at DESC LIMIT 2
  `);
  for (const row of r.rows) {
    console.log('====== ID:', row.id, '|', row.created_at);
    console.log('TITLE:', row.title);
    console.log('SOURCE_TYPE:', row.source_type);
    console.log('--- original_text (', row.original_text.length, '字) ---');
    console.log(JSON.stringify(row.original_text));
    console.log('--- summary (', row.summary.length, '字) ---');
    console.log(JSON.stringify(row.summary));
    console.log();
  }
  await c.end();
})().catch(e => { console.error(e); process.exit(1); });