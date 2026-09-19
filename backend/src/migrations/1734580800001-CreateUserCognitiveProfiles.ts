import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * user_cognitive_profiles 认知画像表。
 *
 * 历史原因：这张表一直由 DB_SYNC=true 的 synchronize 自动建出，
 * 从未写进 migration。生产环境 DB_SYNC=false 时它不会被创建，
 * 导致后续 AddCognitiveDimensions 的 ALTER TABLE 报 42P01（表不存在），
 * 整个 migration 链中断、后端起不来。这里补上建表（幂等，可重复执行）。
 *
 * 时间戳必须落在 CreateAllTables(1734580800000) 与
 * AddCognitiveDimensions(1797000000000) 之间，保证执行顺序正确。
 */
export class CreateUserCognitiveProfiles1734580800001 implements MigrationInterface {
  name = 'CreateUserCognitiveProfiles1734580800001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_cognitive_profiles" (
        "user_id" uuid NOT NULL,
        "strengths" jsonb NOT NULL DEFAULT '[]',
        "weaknesses" jsonb NOT NULL DEFAULT '[]',
        "active_topics" jsonb NOT NULL DEFAULT '[]',
        "gaps" jsonb NOT NULL DEFAULT '[]',
        "intervention_feedback" jsonb NOT NULL DEFAULT '[]',
        "behavioral_patterns" jsonb NOT NULL DEFAULT '{}',
        "cognitive_stamina" jsonb NOT NULL DEFAULT '{"tolerance":0.5,"selfCorrection":0.5,"suggestedStyle":"socratic"}',
        "last_generated_at" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_cognitive_profiles" PRIMARY KEY ("user_id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_cognitive_profiles"`);
  }
}
