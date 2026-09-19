/**
 * 校验脚本：通过 ConnectionMetadataBuilder 离线构建实体元数据，
 * 验证各实体已正确注册 @DeleteDateColumn 软删除列。
 * 仅构建元数据，不连接数据库。
 *
 * 运行：npx ts-node scripts/verify-softdelete.ts
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ConnectionMetadataBuilder } from 'typeorm/connection/ConnectionMetadataBuilder';
import { entities } from '../src/entities';

type EntityMetadataLike = {
  tableName: string;
  columns: Array<{ propertyName: string; isDeleteDate?: boolean }>;
};

async function main(): Promise<void> {
  // 构造 DataSource（提供 logger/driver/namingStrategy），但不连接数据库
  const ds = new DataSource({
    type: 'postgres',
    host: 'localhost',
    port: 5432,
    username: 'postgres',
    password: '',
    database: 'zhishi',
    entities,
    synchronize: false,
  } as never);

  const builder = new ConnectionMetadataBuilder(ds);
  const metadatas = (await builder.buildEntityMetadatas(
    entities,
  )) as unknown as EntityMetadataLike[];

  let missing = 0;
  for (const md of metadatas) {
    const hasDeleteDate = md.columns.some(
      (c) => c.propertyName === 'deletedAt' && c.isDeleteDate,
    );
    console.log(`${hasDeleteDate ? '[OK]  ' : '[缺失]'} ${md.tableName}`);
    if (!hasDeleteDate) {
      missing++;
    }
  }

  console.log(
    `\n共检查 ${metadatas.length} 张表，缺失软删除列 ${missing} 张。`,
  );
  if (missing > 0) {
    process.exit(1);
  }
  console.log('全部业务表均已注册软删除列。');
}

void main();
