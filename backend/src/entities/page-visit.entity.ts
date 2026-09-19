import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * page_visits 主页访问统计表
 * 按 用户 + 访问日期 记录访问量，用于公开主页的访问统计展示。
 * 唯一约束 (user_id + visit_date)：同一天多次访问累加 count。
 */
@Entity('page_visits')
@Index('IDX_page_visits_user_date', ['userId', 'visitDate'], { unique: true })
@Index('IDX_page_visits_user_id', ['userId'])
export class PageVisit {
  /** UUID 主键 */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 被访问的用户 ID */
  @Column({ name: 'user_id', type: 'uuid', nullable: false })
  userId: string;

  /** 访问日期（YYYY-MM-DD，按天统计） */
  @Column({ name: 'visit_date', type: 'date', nullable: false })
  visitDate: string;

  /** 当日访问量 */
  @Column({ name: 'visit_count', type: 'int', default: 0 })
  visitCount: number;

  /** 创建时间 */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /** 更新时间 */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
