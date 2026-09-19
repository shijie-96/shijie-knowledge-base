import { MigrationInterface, QueryRunner } from 'typeorm';
import { hashPassword } from '../modules/auth/password.util';

/**
 * users 表新增 password_hash 密码哈希列（短信验证码 → 密码登录改造）。
 * - 老账号（从未设置密码，password_hash 为 NULL）统一回填默认密码哈希，
 *   默认密码沿用原开发固定验证码（SMS_DEV_CODE，默认 123456）。
 * - 使用 ADD COLUMN IF NOT EXISTS，兼容 DB_SYNC=true 已自动建列的环境。
 */
export class AddUserPasswordHash1789000000000 implements MigrationInterface {
  name = 'AddUserPasswordHash1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" character varying(255)`,
    );

    const defaultPassword = process.env.SMS_DEV_CODE || '123456';
    const legacyUsers: { id: string }[] = await queryRunner.query(
      `SELECT id FROM "users" WHERE "password_hash" IS NULL`,
    );
    for (const user of legacyUsers) {
      const hash = await hashPassword(defaultPassword);
      await queryRunner.query(
        `UPDATE "users" SET "password_hash" = $1 WHERE id = $2`,
        [hash, user.id],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN IF EXISTS "password_hash"`,
    );
  }
}
