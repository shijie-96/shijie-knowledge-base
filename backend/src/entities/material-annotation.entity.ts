import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/** 标注类型：高亮划线 / 书签 / 阅读时临时思考 */
export enum MaterialAnnotType {
  HIGHLIGHT = 'highlight',
  BOOKMARK = 'bookmark',
  TEMP_THOUGHT = 'temp_thought',
}

/** 文本选区位置（字符偏移，相对素材全文） */
export interface AnnotationTextRange {
  start_offset: number;
  end_offset: number;
}

/**
 * material_annotations 素材标注表
 * 沉浸式阅读器的划线 / 书签 / 阅读时临时思考。
 * 标注只是阅读草稿，不直接成为认知资产，必须走消化流程。
 */
@Entity('material_annotations')
@Index('IDX_material_annotations_user_id', ['userId'])
@Index('IDX_material_annotations_material_id', ['materialId'])
@Index('IDX_material_annotations_user_material_type', ['userId', 'materialId', 'annotType'])
export class MaterialAnnotation {
  /** UUID 主键 */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所属用户 ID（严格数据隔离） */
  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string;

  /** 归属素材（source_materials.id） */
  @Column({ name: 'material_id', type: 'uuid', nullable: false })
  materialId: string;

  /** 标注类型 */
  @Column({
    name: 'annot_type',
    type: 'enum',
    enum: MaterialAnnotType,
    nullable: false,
  })
  annotType: MaterialAnnotType;

  /** 选区位置 {start_offset, end_offset}（文本字符偏移） */
  @Column({
    name: 'text_range_json',
    type: 'jsonb',
    nullable: false,
    default: () => "'{}'::jsonb",
  })
  textRangeJson: AnnotationTextRange;

  /** 划线摘出的原文片段 */
  @Column({ name: 'excerpt_text', type: 'text', nullable: true })
  excerptText: string | null;

  /** 阅读时当场写下的元认知思考 */
  @Column({ name: 'user_thought', type: 'text', nullable: true })
  userThought: string | null;

  /** 沉淀完成时间（非空 = 该标注已随某次消化沉淀为知识原子，阅读器显示绿色高亮） */
  @Column({ name: 'digested_at', type: 'timestamptz', nullable: true })
  digestedAt: Date | null;

  /** 沉淀生成的知识原子 ID（沉淀完成时写入，阅读器点击绿色高亮可跳转查看） */
  @Column({ name: 'digested_atom_id', type: 'uuid', nullable: true })
  digestedAtomId: string | null;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** 更新时间 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
