import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * user_ai_config 用户大模型 AI 配置表。
 * 本地开发 DB_SYNC=true 会自动建表；此迁移供生产环境使用。
 */
export class AddUserAiConfig1787400000001 implements MigrationInterface {
  name = 'AddUserAiConfig1787400000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_ai_config" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "encrypted_api_key" text NOT NULL,
        "base_url" varchar(512) NULL,
        "model" varchar(128) NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_ai_config" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_user_ai_config_user_id" ON "user_ai_config" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "user_ai_config"`);
  }
}
