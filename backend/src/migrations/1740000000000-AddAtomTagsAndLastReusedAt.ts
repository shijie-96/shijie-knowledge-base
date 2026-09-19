import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 任务05：知识原子新增标签数组与最后复用时间列。
 */
export class AddAtomTagsAndLastReusedAt1740000000000 implements MigrationInterface {
  name = 'AddAtomTagsAndLastReusedAt1740000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "knowledge_atoms"
       ADD COLUMN "tags" text[] NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "knowledge_atoms"
       ADD COLUMN "last_reused_at" timestamptz NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "knowledge_atoms" DROP COLUMN "last_reused_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "knowledge_atoms" DROP COLUMN "tags"`,
    );
  }
}
