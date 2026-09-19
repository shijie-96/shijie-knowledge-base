/**
 * 星海演示机器人种子（幂等，可重复执行）
 * - 创建 100 个机器人账号：手机号 13600136001 ~ 13600136100
 * - 每个机器人 2 条公开活跃知识原子（permission=public, status=active）
 *   → 满足星图「EXISTS 至少 1 条公开活跃原子」的准入条件
 * - 机器人之间构成环形引用链（下一位引上一位），references 表有真实数据
 * - 密码哈希留空：开发环境（NODE_ENV != production / SMS_DEV_CODE=123456）
 *   可直接用默认密码 123456 登录这些机器人账号
 * - 头像留空：前端以昵称生成渐变色头像
 *
 * 用法：cd backend && node scripts/seed-starmap-bots.cjs
 * 删除：node scripts/seed-starmap-bots.cjs --delete
 */
'use strict';

const { randomUUID } = require('crypto');
const path = require('path');
const dotenv = require('dotenv');

// backend/scripts/xxx.cjs -> 读取 backend/.env
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const HOST = process.env.DB_HOST || 'localhost';
const PORT = Number(process.env.DB_PORT || 5432);
const USER = process.env.DB_USERNAME || 'postgres';
const PASSWORD = process.env.DB_PASSWORD || 'postgres';
const DATABASE = process.env.DB_NAME || 'zhishi';

const PREFIX = '13600136'; // 8 位前缀 + 3 位序号 = 11 位手机号
const COUNT = 100;
const phones = Array.from({ length: COUNT }, (_, i) => `${PREFIX}${String(i + 1).padStart(3, '0')}`);

// ---------- 沙盘定位：省市两级（复用前端地图资源，保证省名与地图完全一致）----------
const CITY_MAP = require(
  path.join(__dirname, '..', '..', 'frontend', 'public', 'geo', 'china-cities.json'),
);
const PROVINCES = Object.keys(CITY_MAP);
/**
 * 均匀铺到每个省（保证沙盘上各省都有人），再在该省下随机挑一个地级市。
 */
function regionFor(i) {
  const province = PROVINCES[i % PROVINCES.length];
  const cities = CITY_MAP[province] || [];
  const city = cities.length
    ? cities[Math.floor(Math.random() * cities.length)]
    : province;
  return { province, city };
}

/**
 * 给「真实用户」造一批演示关系，让沙盘上的关系分层看得出来：
 * - 用户关注 6 个机器人（青色：我关注的）
 * - 其中 2 个回关用户（绿色：互相关注，会画连线）
 * - 另有 3 个单向关注用户（紫色：我的粉丝）
 * - 双方都有活跃原子时再造 2 条引用（金色实线=我引用TA，虚线=TA引用我）
 * 找不到真实用户时整体跳过，不影响机器人本体。
 */
async function seedDemoRelations(client, botUsers, botAtoms, now) {
  const { rows: real } = await client.query(
    "SELECT id FROM users WHERE phone NOT LIKE '13600136%' AND deleted_at IS NULL ORDER BY created_at LIMIT 1",
  );
  if (!real.length) {
    console.log('  未找到真实用户，跳过演示关系（关注 / 互关 / 引用）');
    return;
  }
  const uid = real[0].id;

  // 用户关注 6 个机器人
  const followees = botUsers.slice(0, 6);
  for (const b of followees) {
    await client.query(
      `INSERT INTO follows (id, follower_id, followee_id, created_at)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [randomUUID(), uid, b.id, now],
    );
  }
  // 前 2 个回关（互关）+ 另外 3 个单向关注用户（粉丝）
  for (const b of botUsers.slice(0, 2).concat(botUsers.slice(6, 9))) {
    await client.query(
      `INSERT INTO follows (id, follower_id, followee_id, created_at)
       VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING`,
      [randomUUID(), b.id, uid, now],
    );
  }
  console.log(
    `  已造演示关系：我关注 ${followees.length} 人 / 互关 2 人 / 粉丝 3 人`,
  );

  // 引用关系：需要双方都有活跃原子
  const { rows: myAtoms } = await client.query(
    "SELECT id FROM knowledge_atoms WHERE user_id = $1 AND status = 'active' LIMIT 2",
    [uid],
  );
  if (!myAtoms.length || botAtoms.length < 2) {
    console.log('  真实用户暂无活跃原子，跳过演示引用关系');
    return;
  }
  // 我引用 TA（outgoing）
  await client.query(
    `INSERT INTO "references" (id, citer_atom_id, cited_atom_id, citer_user_id, cited_user_id, note, created_at, deleted_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NULL) ON CONFLICT DO NOTHING`,
    [
      randomUUID(),
      myAtoms[0].id,
      botAtoms[0].id,
      uid,
      botAtoms[0].userId,
      '演示：我引用了你的整理，很有启发',
      now,
    ],
  );
  // TA 引用我（incoming）
  if (myAtoms[1]) {
    await client.query(
      `INSERT INTO "references" (id, citer_atom_id, cited_atom_id, citer_user_id, cited_user_id, note, created_at, deleted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NULL) ON CONFLICT DO NOTHING`,
      [
        randomUUID(),
        botAtoms[1].id,
        myAtoms[1].id,
        botAtoms[1].userId,
        uid,
        '演示：你的这篇对我有帮助',
        now,
      ],
    );
  }
  console.log('  已造 2 条演示引用关系（我引用 TA / TA 引用我）');

  // 同步 users.following_count / follower_count —— 个人中心读这两个字段，
  // 不同步的话个人中心显示的数字会和 follows 表的真实记录对不上
  await client.query(
    `UPDATE users u
        SET following_count = (SELECT COUNT(*) FROM follows f WHERE f.follower_id = u.id)`,
  );
  await client.query(
    `UPDATE users u
        SET follower_count = (SELECT COUNT(*) FROM follows f WHERE f.followee_id = u.id)`,
  );
  console.log('  已同步全部用户的关注 / 粉丝计数');
}

// ---------- 机器人「人格」数据池（确定性生成，保证 100 个互不相同） ----------
const K = [
  '夜航', '星尘', '拾光', '逐风', '观澜', '听雨', '山海', '云阶', '长庚', '流萤',
  '知微', '望舒', '青梧', '白鹭', '枕星', '问渔', '栖霞', '临川', '倚月', '素问',
];
const E = ['旅人', '拾荒者', '漫游者', '守望者', '航海家']; // K × E = 100 昵称

const AREAS = [
  '精力管理', '习惯养成', '阅读方法', '写作', '深度睡眠', 'AI 工具', '个人投资',
  '均衡营养', '正念冥想', '晨间跑步', '手机摄影', '编程学习', '英语积累',
  '亲子沟通', '城市散步', '手冲咖啡', '极简主义', '学习科学', '公开表达', '创造力训练',
];

const VIEWPOINT_TAILS = [
  '只要把这件事拆成每天 20 分钟、能立刻开始的小动作，剩下的交给重复。',
  '最大的敌人不是拖延，是「没有下一次」——所以我只设计下一次出现的方式。',
  '别先想对不对，先想这是不是个值得记住的问题。',
  '我把踩过的坑记成清单，把清单里最疼的一条钉在每天看得见的地方。',
  '慢即是快：先建立不依赖意志力的最小回路，再谈优化。',
  '给我启发的从来不是顿悟，而是把旧经验换了个新场景。',
];

const BIOS = [
  '正在把每天读到的、想明白的，都收进自己的知识星球。',
  '记录不是为了记住，是为了想得更清楚。',
  '一个缓慢积累、拒绝速成的人。',
  '相信「写下来才算数」，正在练习把想法变成作品。',
  '用 PARA 整理人生，偶尔也允许乱一点。',
  '白天收集素材，晚上提炼观点，周末复盘一周。',
  '比起收藏，我更在意下一次能用上。',
  '在知识里漫游，偶尔停下来造船。',
  '把公开表达当作思维训练的人。',
  '知识不是囤积，是长出新的问题。',
];

const CATEGORIES = ['projects', 'areas', 'resources'];

function nicknameFor(i) {
  return `${K[i % K.length]}${E[Math.floor(i / K.length)]}`;
}
function areaFor(i) {
  return AREAS[i % AREAS.length];
}
function areaBFor(i) {
  return AREAS[(i * 13 + 7) % AREAS.length];
}

// ---------- 数据库 ----------
const { Client } = require('pg');

async function main() {
  const mode = process.argv.includes('--delete') ? 'delete' : 'seed';
  const client = new Client({
    host: HOST,
    port: PORT,
    user: USER,
    password: PASSWORD,
    database: DATABASE,
  });

  console.log(`[seed-starmap-bots] ${mode === 'delete' ? '删除' : '创建/更新'} 100 个演示机器人…`);
  console.log(`  DB: ${USER}@${HOST}:${PORT}/${DATABASE}`);

  try {
    await client.connect();
  } catch (err) {
    console.error('  无法连接数据库，请确认 PostgreSQL 已启动（docker compose up -d postgres）');
    console.error('  ', err.message);
    process.exit(1);
  }

  try {
    await client.query('BEGIN');

    // 1) 找出已存在的机器人（含软删），清掉与之关联的数据
    const { rows: existing } = await client.query(
      'SELECT id, phone FROM users WHERE phone = ANY($1::text[])',
      [phones],
    );
    if (existing.length) {
      const ids = existing.map((r) => r.id);
      const { rows: atomRows } = await client.query(
        'SELECT id FROM knowledge_atoms WHERE user_id = ANY($1::uuid[])',
        [ids],
      );
      const atomIds = atomRows.map((r) => r.id);
      if (atomIds.length) {
        await client.query(
          'DELETE FROM "references" WHERE citer_atom_id = ANY($1::uuid[]) OR cited_atom_id = ANY($1::uuid[])',
          [atomIds],
        );
      }
      await client.query(
        'DELETE FROM knowledge_atoms WHERE user_id = ANY($1::uuid[])',
        [ids],
      );
      await client.query(
        'DELETE FROM user_settings WHERE user_id = ANY($1::uuid[])',
        [ids],
      );
      await client.query(
        'DELETE FROM follows WHERE follower_id = ANY($1::uuid[]) OR followee_id = ANY($1::uuid[])',
        [ids],
      );
      await client.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [ids]);
      console.log(`  清理旧数据 ${existing.length} 个（含软删）`);
    }

    if (mode === 'delete') {
      await client.query('COMMIT');
      console.log('[seed-starmap-bots] 删除完成。');
      await client.end();
      return;
    }

    // 2) 写入用户 + 设置 + 原子
    const now = new Date();
    const users = [];
    const settings = [];
    const atoms = []; // { id, userId, i, isB }
    const refPairs = []; // { citerAtomId, citerUserId, citedAtomId, citedUserId, note, createdAt }

    for (let i = 0; i < COUNT; i++) {
      const userId = randomUUID();
      // 创建时间在近 3 个月内均匀分布，避免视觉上「同一批」
      const createdAt = new Date(now.getTime() - (COUNT - i) * 20 * 3600 * 1000);
      const updatedAt = now;
      const areaA = areaFor(i);
      const areaB = areaBFor(i);
      // 沙盘定位：均匀铺到各省，市随机
      const { province, city } = regionFor(i);

      users.push({
        id: userId,
        phone: phones[i],
        nickname: nicknameFor(i),
        bio: BIOS[i % BIOS.length],
        province,
        city,
        createdAt,
      });

      settings.push({ userId });

      const atomA = {
        id: randomUUID(),
        userId,
        coreQuestion: `关于「${areaA}」，我整理了几条经得起推敲的经验`,
        myViewpoint: `${VIEWPOINT_TAILS[i % VIEWPOINT_TAILS.length]}（${areaA}实践复盘）`,
        paraCategory: CATEGORIES[i % CATEGORIES.length],
        tags: [`seed-${areaA}`],
        createdAt,
      };
      const atomB = {
        id: randomUUID(),
        userId,
        coreQuestion: `「${areaB}」值得长期投入吗？我的判断方法`,
        myViewpoint: `先设一个 30 天不评估的观察期，然后只比较自己跟自己的基线。${VIEWPOINT_TAILS[(i * 7) % VIEWPOINT_TAILS.length]}`,
        paraCategory: CATEGORIES[(i * 2 + 1) % CATEGORIES.length],
        tags: [`seed-${areaB}`],
        createdAt,
      };
      atoms.push(atomA, atomB);

      // 引用链：我的 atomB 引用「下一位旅人」的 atomA（环形），形成星海互引网络
      const next = (i + 1) % COUNT;
      // 由于 atoms 尚未收集齐下一位的 id，用占位符，最后统一回填
      refPairs.push({
        placeholder: true,
        citerIdx: i,
        citedIdx: next,
      });
    }

    // 逐条插入用户
    for (const u of users) {
      await client.query(
        `INSERT INTO users (id, nickname, phone, email, password_hash, avatar, bio, province, city, contacts, last_login_at,
                            status, following_count, follower_count, deleted_at, created_at, updated_at)
         VALUES ($1, $2, $3, NULL, NULL, NULL, $4, $7, $8, NULL, NULL, 'active', 0, 0, NULL, $5, $6)`,
        [u.id, u.nickname, u.phone, u.bio, u.createdAt, now, u.province, u.city],
      );
      await client.query(
        `INSERT INTO user_settings (user_id, default_permission, public_reminder, sensitive_detection,
                                    authorization_toggle, reference_toggle, reminder_frequency,
                                    notification_settings, weather_preference, theme_preference,
                                    decoration_config, ai_avatar_enabled, profile_decoration, created_at, updated_at, deleted_at)
         VALUES ($1, 'public', false, false, true, true, 'weekly', NULL, NULL, 'system',
                 NULL, false, NULL, $2, $2, NULL)`,
        [u.id, now],
      );
    }
    console.log(`  已创建 ${users.length} 个用户（昵称 ${users[0].nickname} ~ ${users[users.length - 1].nickname}）`);

    // 插入原子（公开 / 活跃）
    for (const a of atoms) {
      await client.query(
        `INSERT INTO knowledge_atoms (id, user_id, source_material_id, core_question, my_viewpoint, evidence,
                                      practice_case, para_category, permission, tags, last_reused_at, reuse_count,
                                      iteration_count, referenced_count, like_count, favorite_count, status, version,
                                      embedding, ai_assisted, created_at, updated_at, deleted_at)
         VALUES ($1, $2, NULL, $3, $4, NULL, NULL, $5, 'public', $6::text[], NULL, 0, 1, 0, 0, 0,
                 'active', 1, NULL, false, $7, $7, NULL)`,
        [a.id, a.userId, a.coreQuestion, a.myViewpoint, a.paraCategory, a.tags, a.createdAt],
      );
    }
    console.log(`  已创建 ${atoms.length} 条公开活跃知识原子`);

    // 按占位符回填引用（每人的 atomB → 下一位的 atomA）
    const atomByIdx = new Map(); // index → { b, aNext }
    for (let i = 0; i < COUNT; i++) {
      const mine = atoms.filter((a) => a.userId === users[i].id);
      atomByIdx.set(i, { b: mine[1] || mine[0], aNext: null });
    }
    for (let i = 0; i < COUNT; i++) {
      const next = (i + 1) % COUNT;
      atomByIdx.get(i).aNext = atomByIdx.get(next).b; // 简化：引用的内容随意指向下一位的 atomB
    }

    let refCount = 0;
    for (const p of refPairs) {
      const citerAtom = atomByIdx.get(p.citerIdx).b;
      const citedAtom = atomByIdx.get(p.citedIdx).aNext;
      if (!citerAtom || !citedAtom) continue;
      const citerUserId = users[p.citerIdx].id;
      const citedUserId = users[p.citedIdx].id;
      await client.query(
        `INSERT INTO "references" (id, citer_atom_id, cited_atom_id, citer_user_id, cited_user_id, note, created_at, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
         ON CONFLICT (citer_atom_id, cited_atom_id) DO NOTHING`,
        [
          randomUUID(),
          citerAtom.id,
          citedAtom.id,
          citerUserId,
          citedUserId,
          `读到${users[p.citedIdx].nickname}的整理很有启发，补上自己在「${areaBFor(p.citerIdx)}」上的对照。`,
          now,
        ],
      );
      refCount++;
    }
    console.log(`  已创建 ${refCount} 条机器人互引关系（环形引用链）`);

    await seedDemoRelations(client, users, atoms, now);

    await client.query('COMMIT');
    console.log('[seed-starmap-bots] 完成 ✔  去星海页面刷新即可看到 100 位新旅人');
    console.log('  机器人账号可用默认密码 123456 登录（开发环境）');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[seed-starmap-bots] 执行失败：', err.message);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

main();
