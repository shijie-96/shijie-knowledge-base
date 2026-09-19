# Entities 目录说明

TypeORM 实体统一放置于本目录（`src/entities/`），命名规范：`*.entity.ts`。
统一出口见 `src/entities/index.ts`（`entities` 数组，供 AppModule 与迁移 DataSource 引用）。

## 表清单

| 表名 | 实体文件 | 说明 |
| --- | --- | --- |
| `users` | `user.entity.ts` | 用户表（phone/email 唯一，会员等级 ENUM，软删除，含 last_login_at） |
| `source_materials` | `source-material.entity.ts` | 素材池（物理独立于知识原子，含软删除） |
| `knowledge_atoms` | `knowledge-atom.entity.ts` | 知识原子（含 pgvector embedding） |
| `atom_versions` | `atom-version.entity.ts` | 版本历史快照 |
| `references` | `reference.entity.ts` | 引用关系（唯一约束，应用层禁止删除） |
| `questions` | `question.entity.ts` | 提问表 |
| `answers` | `answer.entity.ts` | 回答表（AI 生成/草案标记） |
| `likes` | `like.entity.ts` | 点赞（唯一约束防重复） |
| `favorites` | `favorite.entity.ts` | 收藏（唯一约束防重复） |
| `follows` | `follow.entity.ts` | 关注（唯一约束防重复） |
| `authorizations` | `authorization.entity.ts` | 授权访问 |
| `notifications` | `notification.entity.ts` | 通知 |
| `memberships` | `membership.entity.ts` | 会员订阅 |
| `user_settings` | `user-settings.entity.ts` | 用户设置（user_id 主键） |

## pgvector 约定

本项目数据库为 PostgreSQL + pgvector，向量检索相关实体请按以下方式使用：

```ts
import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('document_chunks')
export class DocumentChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('text')
  content: string;

  // pgvector 字段（vector(1536)），使用 length 指定维度
  @Column('vector', { length: 1536, nullable: true })
  embedding: string | null;
}
```

使用前需在目标数据库启用扩展（初始迁移已自动执行）：

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

## 数据隔离约定

- **所有用户数据表必须带 `user_id` 字段**（source_materials、knowledge_atoms、atom_versions 等），业务层查询必须以 `user_id` 过滤，严格隔离。
- **素材表与知识原子表物理分离**，素材表不混入公开/权限逻辑。
- **references 引用关系表**已加唯一约束 `(citer_atom_id, cited_atom_id)`，应用层禁止物理删除。
- 互动表（likes/favorites/follows）均带唯一约束，防止重复操作。

## 迁移脚本

迁移文件位于 `src/migrations/`，通过 `src/data-source.ts` 的 DataSource 执行：

```bash
npm run migration:run      # 执行迁移
npm run migration:revert   # 回滚最近一次迁移
npm run migration:show     # 查看迁移状态
```
