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
 * knowledge_atoms 知识原子表
 * 最小的知识单位，PARA 分类，带向量 embedding（pgvector）用于语义检索。
 */
@Entity('knowledge_atoms')
@Index('IDX_knowledge_atoms_user_id', ['userId'])
@Index('IDX_knowledge_atoms_status', ['status'])
@Index('IDX_knowledge_atoms_permission', ['permission'])
@Index('IDX_knowledge_atoms_para_category', ['paraCategory'])
@Index('IDX_knowledge_atoms_user_status', ['userId', 'status'])
export class KnowledgeAtom {
  /** UUID 主键 */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 所属用户 ID（严格数据隔离） */
  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string;

  /** 关联素材 ID */
  @Column({ name: 'source_material_id', type: 'uuid', nullable: true })
  sourceMaterialId: string | null;

  /** 核心问题 */
  @Column({ name: 'core_question', type: 'text', nullable: false })
  coreQuestion: string;

  /** 我的观点 */
  @Column({ name: 'my_viewpoint', type: 'text', nullable: false })
  myViewpoint: string;

  /** 证据出处 */
  @Column({ name: 'evidence', type: 'text', nullable: true })
  evidence: string | null;

  /** 实践案例 */
  @Column({ name: 'practice_case', type: 'text', nullable: true })
  practiceCase: string | null;

  /** PARA 分类（projects/areas/resources/archives） */
  @Column({
    name: 'para_category',
    type: 'varchar',
    length: 32,
    nullable: false,
    default: 'resources',
  })
  paraCategory: string;

  /** 权限（private=私有 / authorized=授权 / public=公开） */
  @Column({
    name: 'permission',
    type: 'varchar',
    length: 20,
    nullable: false,
    default: 'private',
  })
  permission: string;

  /** 标签（自定义分类 / 标签管理，text[] 数组） */
  @Column({ name: 'tags', type: 'text', array: true, nullable: true })
  tags: string[] | null;

  /** 最后复用时间 */
  @Column({
    name: 'last_reused_at',
    type: 'timestamptz',
    nullable: true,
  })
  lastReusedAt: Date | null;

  /** 复用计数 */
  @Column({ name: 'reuse_count', type: 'int', default: 0 })
  reuseCount: number;

  /** 迭代计数 */
  @Column({ name: 'iteration_count', type: 'int', default: 0 })
  iterationCount: number;

  /** 被引用计数 */
  @Column({ name: 'referenced_count', type: 'int', default: 0 })
  referencedCount: number;

  /** 点赞计数 */
  @Column({ name: 'like_count', type: 'int', default: 0 })
  likeCount: number;

  /** 收藏计数 */
  @Column({ name: 'favorite_count', type: 'int', default: 0 })
  favoriteCount: number;

  /** 状态（draft/active/archived） */
  @Column({
    name: 'status',
    type: 'varchar',
    length: 20,
    nullable: false,
    default: 'draft',
  })
  status: string;

  /** 版本号 */
  @Column({ name: 'version', type: 'int', default: 1 })
  version: number;

  /**
   * 向量 embedding（pgvector，openai embedding 维度 1536）
   * 注意：不能建普通 btree 索引（向量值超页大小会导致插入失败）。
   * 语义检索为余弦相似度顺序扫描，如需性能优化请手动建 hnsw/ivfflat 索引。
   */
  @Column('vector', { length: 1536, nullable: true })
  embedding: string | null;

  /** AI 辅助标记 */
  @Column({ name: 'ai_assisted', type: 'boolean', default: false })
  aiAssisted: boolean;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** 更新时间 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /** 软删除时间（注销账号时标记） */
  @Index('IDX_knowledge_atoms_deleted_at')
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
