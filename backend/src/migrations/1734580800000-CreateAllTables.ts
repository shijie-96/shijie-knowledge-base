import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 初始迁移：创建全部核心数据表。
 * 迁移前会启用 pgvector 扩展。
 *
 * 表清单（按依赖顺序）：
 *  users, source_materials, knowledge_atoms, atom_versions, references,
 *  questions, answers, likes, favorites, follows, authorizations,
 *  notifications, memberships, user_settings
 */
export class CreateAllTables1734580800000 implements MigrationInterface {
  name = 'CreateAllTables1734580800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------- 启用 pgvector 扩展 ----------
    // 以及内置 gen_random_uuid() 所需（PostgreSQL 13+ 自带，无需额外扩展）
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector;`);

    // ---------- users 用户表 ----------
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"                   uuid           NOT NULL DEFAULT gen_random_uuid(),
        "nickname"             character varying(64)  NOT NULL,
        "phone"                character varying(20)  NOT NULL,
        "email"                character varying(255),
        "avatar"               character varying(512),
        "bio"                  text,
        "contacts"             jsonb,
        "membership_level"     character varying(20) NOT NULL DEFAULT 'free',
        "membership_expires_at" TIMESTAMP WITH TIME ZONE,
        "last_login_at"        TIMESTAMP WITH TIME ZONE,
        "ai_quota"             integer        NOT NULL DEFAULT 0,
        "status"               character varying(20) NOT NULL DEFAULT 'active',
        "deleted_at"           TIMESTAMP WITH TIME ZONE,
        "created_at"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users_id" PRIMARY KEY ("id")
      );
      CREATE UNIQUE INDEX "IDX_users_phone" ON "users" ("phone");
      CREATE UNIQUE INDEX "IDX_users_email" ON "users" ("email");
      CREATE INDEX "IDX_users_status" ON "users" ("status");
    `);

    // ---------- source_materials 素材池表 ----------
    await queryRunner.query(`
      CREATE TABLE "source_materials" (
        "id"             uuid           NOT NULL DEFAULT gen_random_uuid(),
        "user_id"        uuid           NOT NULL,
        "title"          character varying(255) NOT NULL,
        "original_text"  text           NOT NULL,
        "summary"        text,
        "source_type"    character varying(32)  NOT NULL DEFAULT 'web',
        "source_url"     character varying(1024),
        "status"         character varying(20)  NOT NULL DEFAULT 'pending',
        "tags"           text[]         NOT NULL DEFAULT '{}',
        "deleted_at"     TIMESTAMP WITH TIME ZONE,
        "created_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_source_materials_id" PRIMARY KEY ("id")
      );
      CREATE INDEX "IDX_source_materials_user_id" ON "source_materials" ("user_id");
      CREATE INDEX "IDX_source_materials_status" ON "source_materials" ("status");
      CREATE INDEX "IDX_source_materials_deleted_at" ON "source_materials" ("deleted_at");
      CREATE INDEX "IDX_source_materials_user_id_status" ON "source_materials" ("user_id", "status");
    `);

    // ---------- knowledge_atoms 知识原子表 ----------
    await queryRunner.query(`
      CREATE TABLE "knowledge_atoms" (
        "id"                 uuid           NOT NULL DEFAULT gen_random_uuid(),
        "user_id"            uuid           NOT NULL,
        "source_material_id" uuid,
        "core_question"      text           NOT NULL,
        "my_viewpoint"       text           NOT NULL,
        "evidence"           text,
        "practice_case"      text,
        "para_category"      character varying(32)  NOT NULL DEFAULT 'resources',
        "permission"         character varying(20)  NOT NULL DEFAULT 'private',
        "reuse_count"        integer        NOT NULL DEFAULT 0,
        "iteration_count"    integer        NOT NULL DEFAULT 0,
        "referenced_count"   integer        NOT NULL DEFAULT 0,
        "like_count"         integer        NOT NULL DEFAULT 0,
        "favorite_count"     integer        NOT NULL DEFAULT 0,
        "status"             character varying(20)  NOT NULL DEFAULT 'draft',
        "version"            integer        NOT NULL DEFAULT 1,
        "embedding"          vector(1536),
        "ai_assisted"        boolean        NOT NULL DEFAULT false,
        "created_at"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"         TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_knowledge_atoms_id" PRIMARY KEY ("id")
      );
      CREATE INDEX "IDX_knowledge_atoms_user_id" ON "knowledge_atoms" ("user_id");
      CREATE INDEX "IDX_knowledge_atoms_status" ON "knowledge_atoms" ("status");
      CREATE INDEX "IDX_knowledge_atoms_permission" ON "knowledge_atoms" ("permission");
      CREATE INDEX "IDX_knowledge_atoms_para_category" ON "knowledge_atoms" ("para_category");
      CREATE INDEX "IDX_knowledge_atoms_user_status" ON "knowledge_atoms" ("user_id", "status");
    `);

    // ---------- atom_versions 版本历史表 ----------
    await queryRunner.query(`
      CREATE TABLE "atom_versions" (
        "id"            uuid           NOT NULL DEFAULT gen_random_uuid(),
        "atom_id"       uuid           NOT NULL,
        "user_id"       uuid           NOT NULL,
        "version"       integer        NOT NULL,
        "core_question" text,
        "my_viewpoint"  text,
        "evidence"      text,
        "practice_case" text,
        "para_category" character varying(32),
        "permission"    character varying(20),
        "change_note"   text,
        "change_type"   character varying(32)  NOT NULL DEFAULT 'update',
        "created_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_atom_versions_id" PRIMARY KEY ("id")
      );
      CREATE INDEX "IDX_atom_versions_atom_id" ON "atom_versions" ("atom_id");
      CREATE INDEX "IDX_atom_versions_user_id" ON "atom_versions" ("user_id");
      CREATE INDEX "IDX_atom_versions_atom_version" ON "atom_versions" ("atom_id", "version");
    `);

    // ---------- references 引用关系表 ----------
    await queryRunner.query(`
      CREATE TABLE "references" (
        "id"             uuid           NOT NULL DEFAULT gen_random_uuid(),
        "citer_atom_id"  uuid           NOT NULL,
        "cited_atom_id"  uuid           NOT NULL,
        "citer_user_id"  uuid           NOT NULL,
        "cited_user_id"  uuid           NOT NULL,
        "note"           text,
        "created_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_references_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_references_citer_cited" UNIQUE ("citer_atom_id", "cited_atom_id")
      );
      CREATE INDEX "IDX_references_citer_atom_id" ON "references" ("citer_atom_id");
      CREATE INDEX "IDX_references_cited_atom_id" ON "references" ("cited_atom_id");
      CREATE INDEX "IDX_references_citer_user_id" ON "references" ("citer_user_id");
      CREATE INDEX "IDX_references_cited_user_id" ON "references" ("cited_user_id");
    `);

    // ---------- questions 提问表 ----------
    await queryRunner.query(`
      CREATE TABLE "questions" (
        "id"           uuid           NOT NULL DEFAULT gen_random_uuid(),
        "asker_id"     uuid           NOT NULL,
        "answerer_id"  uuid           NOT NULL,
        "content"      text           NOT NULL,
        "atom_id"      uuid,
        "status"       character varying(20) NOT NULL DEFAULT 'open',
        "is_anonymous" boolean        NOT NULL DEFAULT false,
        "created_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_questions_id" PRIMARY KEY ("id")
      );
      CREATE INDEX "IDX_questions_asker_id" ON "questions" ("asker_id");
      CREATE INDEX "IDX_questions_answerer_id" ON "questions" ("answerer_id");
      CREATE INDEX "IDX_questions_atom_id" ON "questions" ("atom_id");
      CREATE INDEX "IDX_questions_status" ON "questions" ("status");
    `);

    // ---------- answers 回答表 ----------
    await queryRunner.query(`
      CREATE TABLE "answers" (
        "id"              uuid           NOT NULL DEFAULT gen_random_uuid(),
        "question_id"     uuid           NOT NULL,
        "responder_id"    uuid           NOT NULL,
        "content"         text           NOT NULL,
        "atom_id"         uuid,
        "is_ai_generated" boolean        NOT NULL DEFAULT false,
        "is_ai_draft"     boolean        NOT NULL DEFAULT false,
        "created_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_answers_id" PRIMARY KEY ("id")
      );
      CREATE INDEX "IDX_answers_question_id" ON "answers" ("question_id");
      CREATE INDEX "IDX_answers_responder_id" ON "answers" ("responder_id");
    `);

    // ---------- likes 点赞表 ----------
    await queryRunner.query(`
      CREATE TABLE "likes" (
        "id"          uuid           NOT NULL DEFAULT gen_random_uuid(),
        "user_id"     uuid           NOT NULL,
        "target_type" character varying(32) NOT NULL,
        "target_id"   uuid           NOT NULL,
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_likes_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_likes_user_target" UNIQUE ("user_id", "target_type", "target_id")
      );
      CREATE INDEX "IDX_likes_user_id" ON "likes" ("user_id");
      CREATE INDEX "IDX_likes_target" ON "likes" ("target_type", "target_id");
    `);

    // ---------- favorites 收藏表 ----------
    await queryRunner.query(`
      CREATE TABLE "favorites" (
        "id"          uuid           NOT NULL DEFAULT gen_random_uuid(),
        "user_id"     uuid           NOT NULL,
        "target_type" character varying(32) NOT NULL,
        "target_id"   uuid           NOT NULL,
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_favorites_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_favorites_user_target" UNIQUE ("user_id", "target_type", "target_id")
      );
      CREATE INDEX "IDX_favorites_user_id" ON "favorites" ("user_id");
      CREATE INDEX "IDX_favorites_target" ON "favorites" ("target_type", "target_id");
    `);

    // ---------- follows 关注表 ----------
    await queryRunner.query(`
      CREATE TABLE "follows" (
        "id"          uuid           NOT NULL DEFAULT gen_random_uuid(),
        "follower_id" uuid           NOT NULL,
        "followee_id" uuid           NOT NULL,
        "created_at"  TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_follows_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_follows_follower_followee" UNIQUE ("follower_id", "followee_id")
      );
      CREATE INDEX "IDX_follows_follower_id" ON "follows" ("follower_id");
      CREATE INDEX "IDX_follows_followee_id" ON "follows" ("followee_id");
    `);

    // ---------- authorizations 授权访问表 ----------
    await queryRunner.query(`
      CREATE TABLE "authorizations" (
        "id"           uuid           NOT NULL DEFAULT gen_random_uuid(),
        "owner_id"     uuid           NOT NULL,
        "requester_id" uuid           NOT NULL,
        "atom_id"      uuid           NOT NULL,
        "status"       character varying(20) NOT NULL DEFAULT 'pending',
        "expires_at"   TIMESTAMP WITH TIME ZONE,
        "created_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_authorizations_id" PRIMARY KEY ("id")
      );
      CREATE INDEX "IDX_authorizations_owner_id" ON "authorizations" ("owner_id");
      CREATE INDEX "IDX_authorizations_requester_id" ON "authorizations" ("requester_id");
      CREATE INDEX "IDX_authorizations_atom_id" ON "authorizations" ("atom_id");
      CREATE INDEX "IDX_authorizations_status" ON "authorizations" ("status");
    `);

    // ---------- notifications 通知表 ----------
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id"         uuid           NOT NULL DEFAULT gen_random_uuid(),
        "user_id"    uuid           NOT NULL,
        "type"       character varying(32) NOT NULL,
        "content"    text           NOT NULL,
        "related_id" uuid,
        "is_read"    boolean        NOT NULL DEFAULT false,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_notifications_id" PRIMARY KEY ("id")
      );
      CREATE INDEX "IDX_notifications_user_id" ON "notifications" ("user_id");
      CREATE INDEX "IDX_notifications_user_read" ON "notifications" ("user_id", "is_read");
    `);

    // ---------- memberships 会员订阅表 ----------
    await queryRunner.query(`
      CREATE TABLE "memberships" (
        "id"         uuid           NOT NULL DEFAULT gen_random_uuid(),
        "user_id"    uuid           NOT NULL,
        "plan"       character varying(32) NOT NULL,
        "addons"     jsonb,
        "price"      integer        NOT NULL DEFAULT 0,
        "start_at"   TIMESTAMP WITH TIME ZONE NOT NULL,
        "end_at"     TIMESTAMP WITH TIME ZONE NOT NULL,
        "auto_renew" boolean        NOT NULL DEFAULT false,
        "status"     character varying(20) NOT NULL DEFAULT 'active',
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_memberships_id" PRIMARY KEY ("id")
      );
      CREATE INDEX "IDX_memberships_user_id" ON "memberships" ("user_id");
      CREATE INDEX "IDX_memberships_user_status" ON "memberships" ("user_id", "status");
    `);

    // ---------- user_settings 用户设置表 ----------
    await queryRunner.query(`
      CREATE TABLE "user_settings" (
        "user_id"             uuid           NOT NULL,
        "default_permission"  character varying(20) NOT NULL DEFAULT 'private',
        "public_reminder"     boolean        NOT NULL DEFAULT false,
        "sensitive_detection" boolean        NOT NULL DEFAULT false,
        "authorization_toggle" boolean       NOT NULL DEFAULT true,
        "reference_toggle"    boolean        NOT NULL DEFAULT true,
        "reminder_frequency"  character varying(20) NOT NULL DEFAULT 'weekly',
        "notification_settings" jsonb,
        "weather_preference"  jsonb,
        "theme_preference"    character varying(32) NOT NULL DEFAULT 'light',
        "decoration_config"   jsonb,
        "created_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_user_settings_user_id" PRIMARY KEY ("user_id")
      );
      CREATE INDEX "IDX_user_settings_default_permission" ON "user_settings" ("default_permission");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_settings"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "memberships"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "authorizations"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "follows"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "favorites"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "likes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "answers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "questions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "references"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "atom_versions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "knowledge_atoms"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "source_materials"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
