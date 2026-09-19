import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 补充迁移：为关联业务表添加软删除列 deleted_at。
 * 用于账号注销时"关联数据标记删除"。
 *
 * 表清单：knowledge_atoms, atom_versions, references, questions, answers,
 *         likes, favorites, follows, notifications, memberships
 */
export class AddSoftDeleteColumns1734660000000 implements MigrationInterface {
  name = 'AddSoftDeleteColumns1734660000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "knowledge_atoms" ADD COLUMN "deleted_at" timestamptz`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_knowledge_atoms_deleted_at" ON "knowledge_atoms" ("deleted_at")`,
    );

    await queryRunner.query(
      `ALTER TABLE "atom_versions" ADD COLUMN "deleted_at" timestamptz`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_atom_versions_deleted_at" ON "atom_versions" ("deleted_at")`,
    );

    await queryRunner.query(
      `ALTER TABLE "references" ADD COLUMN "deleted_at" timestamptz`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_references_deleted_at" ON "references" ("deleted_at")`,
    );

    await queryRunner.query(
      `ALTER TABLE "questions" ADD COLUMN "deleted_at" timestamptz`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_questions_deleted_at" ON "questions" ("deleted_at")`,
    );

    await queryRunner.query(
      `ALTER TABLE "answers" ADD COLUMN "deleted_at" timestamptz`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_answers_deleted_at" ON "answers" ("deleted_at")`,
    );

    await queryRunner.query(
      `ALTER TABLE "likes" ADD COLUMN "deleted_at" timestamptz`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_likes_deleted_at" ON "likes" ("deleted_at")`,
    );

    await queryRunner.query(
      `ALTER TABLE "favorites" ADD COLUMN "deleted_at" timestamptz`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_favorites_deleted_at" ON "favorites" ("deleted_at")`,
    );

    await queryRunner.query(
      `ALTER TABLE "follows" ADD COLUMN "deleted_at" timestamptz`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_follows_deleted_at" ON "follows" ("deleted_at")`,
    );

    await queryRunner.query(
      `ALTER TABLE "notifications" ADD COLUMN "deleted_at" timestamptz`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_notifications_deleted_at" ON "notifications" ("deleted_at")`,
    );

    await queryRunner.query(
      `ALTER TABLE "memberships" ADD COLUMN "deleted_at" timestamptz`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_memberships_deleted_at" ON "memberships" ("deleted_at")`,
    );

    await queryRunner.query(
      `ALTER TABLE "authorizations" ADD COLUMN "deleted_at" timestamptz`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_authorizations_deleted_at" ON "authorizations" ("deleted_at")`,
    );

    await queryRunner.query(
      `ALTER TABLE "user_settings" ADD COLUMN "deleted_at" timestamptz`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_memberships_deleted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "memberships" DROP COLUMN "deleted_at"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_notifications_deleted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP COLUMN "deleted_at"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_follows_deleted_at"`,
    );
    await queryRunner.query(`ALTER TABLE "follows" DROP COLUMN "deleted_at"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_favorites_deleted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "favorites" DROP COLUMN "deleted_at"`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_likes_deleted_at"`);
    await queryRunner.query(`ALTER TABLE "likes" DROP COLUMN "deleted_at"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_answers_deleted_at"`,
    );
    await queryRunner.query(`ALTER TABLE "answers" DROP COLUMN "deleted_at"`);

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_questions_deleted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "questions" DROP COLUMN "deleted_at"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_references_deleted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "references" DROP COLUMN "deleted_at"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_atom_versions_deleted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "atom_versions" DROP COLUMN "deleted_at"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_knowledge_atoms_deleted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "knowledge_atoms" DROP COLUMN "deleted_at"`,
    );

    await queryRunner.query(
      `ALTER TABLE "user_settings" DROP COLUMN "deleted_at"`,
    );

    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_authorizations_deleted_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "authorizations" DROP COLUMN "deleted_at"`,
    );
  }
}
