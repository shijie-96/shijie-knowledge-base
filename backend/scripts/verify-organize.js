require('dotenv/config');
const jwt = require('jsonwebtoken');
const { Client } = require('pg');

(async () => {
  const c = new Client({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'zhishi',
  });
  await c.connect();
  const r = await c.query("SELECT id FROM users WHERE deleted_at IS NULL ORDER BY created_at DESC LIMIT 1");
  const userId = r.rows[0].id;
  console.log('USER:', userId);

  const secret = process.env.JWT_SECRET || 'zhishi2.0-dev-secret-key';
  const token = jwt.sign({ sub: userId }, secret, { expiresIn: '1h' });
  console.log('TOKEN:', token);

  const stamp = Date.now();
  const titleSeed = `唯一测试-${stamp}`;
  // 直接调 organize
  const messages = [
    { role: 'user', content: titleSeed + ' 之第一条' },
    { role: 'assistant', content: titleSeed + ' 之AI回复1' },
    { role: 'user', content: titleSeed + ' 之第二条' },
    { role: 'assistant', content: titleSeed + ' 之AI回复2' },
  ];

  const resp = await fetch('http://localhost:3001/ai/assistant/organize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ messages }),
  });
  const txt = await resp.text();
  console.log('STATUS:', resp.status);
  console.log('RESP:', txt);

  if (resp.ok) {
    const json = JSON.parse(txt);
    const m = await c.query("SELECT LEFT(original_text, 500) AS otext, LEFT(summary, 500) AS sum, source_type FROM source_materials WHERE id=$1", [json.materialId]);
    console.log('--- DB original_text ---');
    console.log(m.rows[0].otext);
    console.log('--- DB summary ---');
    console.log(m.rows[0].sum);
    console.log('source_type:', m.rows[0].source_type);
  }
  await c.end();
})().catch((e) => { console.error(e); process.exit(1); });