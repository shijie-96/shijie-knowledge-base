import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { entities } from './entities';

// 加载环境变量（优先 backend/.env，其次根目录 .env）
dotenv.config({ path: ['.env', '../.env'] });

/**
 * 数据库迁移专用 DataSource。
 * 仅用于执行 typeorm migration 相关命令，不参与应用运行。
 */
export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'zhishi',
  entities,
  // 同时匹配 .ts / .js：本地用 ts-node 跑源码时是 .ts，
  // 生产容器里跑的是 dist/src/data-source.js，migrations 已编译成 .js。
  // 只写 *.ts 会导致生产 migration 一条都不执行（库是空的，应用起来必报错）。
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  // 迁移需在未启用数据库的应用中单独运行，故不加载同步开关
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
});
