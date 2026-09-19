import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 认知沙盘：users 表新增省市字段（province / city）
 * - 供「识界·沙盘」按地理位置呈现旅人分布，并支持按省市发现
 * - 用户未选择地点时为 NULL（沙盘归入「未标注」）
 *
 * 本地开发 DB_SYNC=true 会自动加列；此迁移供生产环境使用（幂等，可重复执行）。
 */
export class AddUserRegion1798000000000 implements MigrationInterface {
  name = 'AddUserRegion1798000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "province" varchar(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "city" varchar(32)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "province"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "city"`);
  }
}
