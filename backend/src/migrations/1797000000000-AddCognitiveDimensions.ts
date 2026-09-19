import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 画像深度优化：user_cognitive_profiles 行为维 + 反应维三维升级
 * - intervention_feedback：干预反馈流水（最近 20 条，行为维）
 * - behavioral_patterns：行为习惯统计（活跃时段 / 沉淀频率 / 拖延指数）
 * - cognitive_stamina：认知耐受力（tolerance / selfCorrection / suggestedStyle）
 *
 * 本地开发 DB_SYNC=true 会自动加列；此迁移供生产环境使用（幂等，可重复执行）。
 */
export class AddCognitiveDimensions1797000000000 implements MigrationInterface {
  name = 'AddCognitiveDimensions1797000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_cognitive_profiles"
         ADD COLUMN IF NOT EXISTS "intervention_feedback" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_cognitive_profiles"
         ADD COLUMN IF NOT EXISTS "behavioral_patterns" jsonb NOT NULL DEFAULT '{}'`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_cognitive_profiles"
         ADD COLUMN IF NOT EXISTS "cognitive_stamina" jsonb NOT NULL DEFAULT '{"tolerance":0.5,"selfCorrection":0.5,"suggestedStyle":"socratic"}'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_cognitive_profiles" DROP COLUMN IF EXISTS "intervention_feedback"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_cognitive_profiles" DROP COLUMN IF EXISTS "behavioral_patterns"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_cognitive_profiles" DROP COLUMN IF EXISTS "cognitive_stamina"`,
    );
  }
}
