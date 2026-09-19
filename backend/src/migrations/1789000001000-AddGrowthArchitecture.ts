import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 双层生长架构（L4 个体认知模式 + L2 策略包闭环 + 干预统计 + AI 建议审批）：
 * - user_mental_models：每周一次的个体思维模型摘要（L4）
 * - user_strategy_packs：用户激活的策略包（L2 用户侧桥）
 * - intervention_events：干预事件流水（后台统计数据源）
 * - ai_suggestions：AI 优化建议 + 人工审批闸门
 * 本地开发 DB_SYNC=true 会自动建表；此迁移供生产环境使用。
 */
export class AddGrowthArchitecture1789000001000 implements MigrationInterface {
  name = 'AddGrowthArchitecture1789000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "user_mental_models" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "week_start" date NOT NULL,
        "week_end" date NOT NULL,
        "decision_formula" text NULL,
        "thinking_patterns" jsonb NOT NULL DEFAULT '[]',
        "trigger_sensitivity" jsonb NOT NULL DEFAULT '{}',
        "total_atoms_created" integer NOT NULL DEFAULT 0,
        "total_sessions" integer NOT NULL DEFAULT 0,
        "avg_response_length" integer NOT NULL DEFAULT 0,
        "used_user_api" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_mental_models" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_mental_models_user_week" ON "user_mental_models" ("user_id", "week_start")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_mental_models_user" ON "user_mental_models" ("user_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "user_strategy_packs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "pack_id" varchar(50) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "activated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMP WITH TIME ZONE NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_strategy_packs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_user_strategy_packs_user_pack" ON "user_strategy_packs" ("user_id", "pack_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "intervention_events" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "rule_id" varchar(80) NOT NULL,
        "pack_id" varchar(50) NOT NULL DEFAULT 'default',
        "ui_type" varchar(40) NOT NULL,
        "atom_id" uuid NULL,
        "trigger_context" jsonb NULL,
        "feedback" varchar(20) NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_intervention_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_intervention_events_user" ON "intervention_events" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_intervention_events_created" ON "intervention_events" ("created_at")`,
    );

    await queryRunner.query(`
      CREATE TABLE "ai_suggestions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "kind" varchar(30) NOT NULL,
        "title" varchar(200) NOT NULL,
        "detail" text NULL,
        "payload" jsonb NULL,
        "status" varchar(20) NOT NULL DEFAULT 'pending',
        "reviewer_id" uuid NULL,
        "review_note" text NULL,
        "reviewed_at" TIMESTAMP WITH TIME ZONE NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ai_suggestions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_suggestions_status" ON "ai_suggestions" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ai_suggestions_kind" ON "ai_suggestions" ("kind")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "ai_suggestions"`);
    await queryRunner.query(`DROP TABLE "intervention_events"`);
    await queryRunner.query(`DROP TABLE "user_strategy_packs"`);
    await queryRunner.query(`DROP TABLE "user_mental_models"`);
  }
}
