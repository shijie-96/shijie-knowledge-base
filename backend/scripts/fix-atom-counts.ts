/**
 * 一次性修复脚本：重算 knowledge_atoms 的「复用 / 引用」计数。
 *
 * 背景：早期按"复用 = 引用"一刀切，无论引用自己还是引用别人，
 * reuse_count 与 referenced_count 都会同时 +1/-1，导致两个计数重复累计、语义混淆。
 * 现语义定死（见 reference.service.ts）：
 *   - 引用自己的原子（自引用）→ 复用计数 reuse_count +1、last_reused_at 更新（复用自己）
 *   - 引用别人的原子 → 被引用计数 referenced_count +1（引用他人）
 *
 * 本脚本根据 references 表的实际引用关系，重算所有原子的
 * reuse_count / referenced_count / last_reused_at，修复存量数据。
 *
 * 运行：npx ts-node scripts/fix-atom-counts.ts
 */
import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';

dotenv.config({ path: ['.env', '../.env'] });

async function main(): Promise<void> {
  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'zhishi',
    synchronize: false,
  } as never);

  await ds.initialize();
  console.log('已连接数据库，开始重算计数…');

  // 依据 references 实际引用关系重算（软删除引用不计入）
  const result = await ds.query(`
    UPDATE knowledge_atoms a
    SET
      reuse_count = (
        SELECT COUNT(*) FROM "references" r
        WHERE r.cited_atom_id = a.id
          AND r.deleted_at IS NULL
          AND r.citer_user_id = r.cited_user_id
      ),
      referenced_count = (
        SELECT COUNT(*) FROM "references" r
        WHERE r.cited_atom_id = a.id
          AND r.deleted_at IS NULL
          AND r.citer_user_id <> r.cited_user_id
      ),
      last_reused_at = (
        SELECT MAX(r.created_at) FROM "references" r
        WHERE r.cited_atom_id = a.id
          AND r.deleted_at IS NULL
          AND r.citer_user_id = r.cited_user_id
      )
  `);

  console.log('重算完成。affected rows（含无变化行）:', result?.[1] ?? '?');

  // 抽查：打印被引/复用最多的 5 个原子，便于人工核对
  const sample = await ds.query(
    `SELECT core_question, reuse_count, referenced_count, last_reused_at
       FROM knowledge_atoms
      WHERE reuse_count > 0 OR referenced_count > 0
      ORDER BY reuse_count + referenced_count DESC
      LIMIT 5`,
  );
  if (sample.length > 0) {
    console.log('\n抽查（复用/引用最多的原子）：');
    for (const s of sample) {
      console.log(
        `  [复用 ${s.reuse_count} · 被引用 ${s.referenced_count}] ${String(s.core_question).slice(0, 30)}`,
      );
    }
  } else {
    console.log('\n当前没有任何引用关系，所有计数已归零。');
  }

  await ds.destroy();
  console.log('\n完成，连接已关闭。');
}

void main();
