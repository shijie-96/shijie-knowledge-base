# Modules 目录说明

业务功能模块统一放置于本目录（`src/modules/`），一个模块一个目录，内部结构如下：

```
src/modules/<module-name>/
├── <module-name>.module.ts   # NestJS Module
├── <module-name>.controller.ts
├── <module-name>.service.ts
├── dto/                      # 该模块专用 DTO（通用 DTO 放 src/dto/）
└── entities/                 # 该模块专用实体（跨模块实体放 src/entities/）
```

已预留模块（后续按需创建，勿提前实现业务逻辑）：

- `auth`     —— 认证 / 注册 / JWT
- `user`     —— 用户信息
- `upload`   —— 文件上传（本地存储，生产切换阿里云 OSS）
- `knowledge`—— 知识库 / 文档管理
- `ai`       —— AI 对话 / 向量检索
- `chat`     —— 会话消息
