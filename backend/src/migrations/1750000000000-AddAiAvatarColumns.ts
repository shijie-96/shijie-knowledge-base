import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 任务14：AI 分身相关字段。
 * - users: ai_avatar_quota（本月剩余配额）、ai_avatar_period（配额所属月份）
 * - user_settings: ai_avatar_enabled（AI 分身开关，默认关闭）
 */
export class AddAiAvatarColumns1750000000000 implements MigrationInterface {
  name = 'AddAiAvatarColumns1750000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users"
       ADD COLUMN "ai_avatar_quota" int NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "users"
       ADD COLUMN "ai_avatar_period" varchar(7) NOT NULL DEFAULT ''`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_settings"
       ADD COLUMN "ai_avatar_enabled" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "ai_avatar_enabled"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "ai_avatar_period"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP COLUMN "ai_avatar_quota"`,
    );
  }
}
