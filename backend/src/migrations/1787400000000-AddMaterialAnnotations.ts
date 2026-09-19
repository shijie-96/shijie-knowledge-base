import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * 沉浸式阅读器标注层迁移。
 *
 * 产品红线：
 *  - 原始 source_materials 超长素材文档完整保存，不切割、不修改原文。
 *  - 新增独立标注表 material_annotations，只存划线 / 书签 / 阅读时临时思考，
 *    标注仅是阅读草稿，绝不直接生成知识原子。
 *  - source_materials 仅新增"阅读进度"两个字段，用于"记住读到哪"。
 */
export class AddMaterialAnnotations1787400000000 implements MigrationInterface {
  name = 'AddMaterialAnnotations1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ---------- material_annotations 素材标注表 ----------
    await queryRunner.query(`
      CREATE TYPE "public"."material_annotations_annot_type_enum" AS ENUM (
        'highlight', 'bookmark', 'temp_thought'
      );
    `);
    await queryRunner.query(`
      CREATE TABLE "material_annotations" (
        "id"             uuid    NOT NULL DEFAULT gen_random_uuid(),
        "user_id"        uuid    NOT NULL,
        "material_id"    uuid    NOT NULL,
        "annot_type"     "material_annotations_annot_type_enum" NOT NULL,
        "text_range_json" jsonb  NOT NULL DEFAULT '{}',
        "excerpt_text"   text,
        "user_thought"   text,
        "created_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_material_annotations_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_material_annotations_material" FOREIGN KEY ("material_id")
          REFERENCES "source_materials"("id") ON DELETE CASCADE
      );
      CREATE INDEX "IDX_material_annotations_user_id" ON "material_annotations" ("user_id");
      CREATE INDEX "IDX_material_annotations_material_id" ON "material_annotations" ("material_id");
      CREATE INDEX "IDX_material_annotations_user_material_type" ON "material_annotations" ("user_id", "material_id", "annot_type");
    `);

    // ---------- source_materials 新增阅读进度字段 ----------
    await queryRunner.query(`
      ALTER TABLE "source_materials"
        ADD "read_progress_offset" bigint NOT NULL DEFAULT '0';
    `);
    await queryRunner.query(`
      ALTER TABLE "source_materials"
        ADD "last_read_at" TIMESTAMP WITH TIME ZONE;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "source_materials" DROP COLUMN "last_read_at";`);
    await queryRunner.query(`ALTER TABLE "source_materials" DROP COLUMN "read_progress_offset";`);
    await queryRunner.query(`DROP TABLE "material_annotations";`);
    await queryRunner.query(`DROP TYPE "public"."material_annotations_annot_type_enum";`);
  }
}
