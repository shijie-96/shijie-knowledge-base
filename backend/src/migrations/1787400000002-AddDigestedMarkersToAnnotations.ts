import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 标注沉淀标记迁移。
 *
 * 消化页沉淀成功后，若带 annotationId，则给对应标注打上
 * digested_at（沉淀时间）+ digested_atom_id（沉淀出的知识原子 ID），
 * 阅读器中该段显示为绿色"已沉淀"高亮，点击可跳转原子。
 */
export class AddDigestedMarkersToAnnotations1787400000002 implements MigrationInterface {
  name = 'AddDigestedMarkersToAnnotations1787400000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "material_annotations"
        ADD "digested_at" TIMESTAMP WITH TIME ZONE;
    `);
    await queryRunner.query(`
      ALTER TABLE "material_annotations"
        ADD "digested_atom_id" uuid;
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_material_annotations_digested_at"
        ON "material_annotations" ("digested_at");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_material_annotations_digested_at";`);
    await queryRunner.query(`ALTER TABLE "material_annotations" DROP COLUMN "digested_atom_id";`);
    await queryRunner.query(`ALTER TABLE "material_annotations" DROP COLUMN "digested_at";`);
  }
}
