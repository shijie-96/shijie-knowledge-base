import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * source_materials 素材池表
 * 素材表与知识原子表物理分离，本表绝不混入公开/权限逻辑。
 * 软删除：删除后仅标记 deleted_at，不物理移除。
 */
@Entity('source_materials')
@Index('IDX_source_materials_user_id', ['userId'])
@Index('IDX_source_materials_status', ['status'])
@Index('IDX_source_materials_deleted_at', ['deletedAt'])
export class SourceMaterial {
  /** UUID 主键 */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所属用户 ID（严格数据隔离） */
  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  @Index('IDX_source_materials_user_id_status', ['userId', 'status'])
  userId: string;

  /** 标题 */
  @Column({ name: 'title', type: 'varchar', length: 255, nullable: false })
  title: string;

  /** 原文内容 */
  @Column({ name: 'original_text', type: 'text', nullable: false })
  originalText: string;

  /** 摘要 */
  @Column({ name: 'summary', type: 'text', nullable: true })
  summary: string | null;

  /** 来源类型（web/book/video/audio/image/note 等） */
  @Column({
    name: 'source_type',
    type: 'varchar',
    length: 32,
    nullable: false,
    default: 'web',
  })
  sourceType: string;

  /** 来源链接 */
  @Column({ name: 'source_url', type: 'varchar', length: 1024, nullable: true })
  sourceUrl: string | null;

  /** 状态（pending=待消化 / digesting=消化中 / digested=已消化 / archived=归档） */
  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    nullable: false,
    default: 'pending',
  })
  status: string;

  /** 标签数组 */
  @Column({ name: 'tags', type: 'text', array: true, default: () => "'{}'" })
  tags: string[];

  /** 软删除标记 */
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  /** 阅读进度（沉浸式阅读器）：文本字符偏移，打开阅读器自动定位 */
  @Column({
    name: 'read_progress_offset',
    type: 'bigint',
    default: 0,
    transformer: {
      to: (v: number) => v,
      from: (v: string | null) =>
        v === null || v === undefined ? 0 : Number(v),
    },
  })
  readProgressOffset: number;

  /** 最后阅读时间 */
  @Column({ name: 'last_read_at', type: 'timestamptz', nullable: true })
  lastReadAt: Date | null;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** 更新时间 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
