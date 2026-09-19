# 识界 · 增量代码审查报告 v2

> **日期**：2026-09-05　**基线**：`docs/code-review-2026-09-04.md`
> **范围**：过去一天变更的 118 个文件（后端 68 + 前端 50），重点为新模块；已修复项只做状态确认。
> **结论速览**：昨日的 3 个 P0 修复了 1 个（且质量很高），但**新增的认证/支付/管理员链路引入了 4 个新的 P0 级风险**，其中「迁移回填默认密码 123456」和「模拟支付无生产闸门」是上线即事故的定时炸弹。

---

## 〇、昨日 P0 复查状态

| # | 昨日问题 | 状态 | 说明 |
|---|---|---|---|
| 1 | JWT secret 硬编码兜底 | ✅ **已修复（优秀）** | 新增 `backend/src/modules/auth/jwt-secret.ts`：公开示例值黑名单拒绝、生产未配置拒绝启动、非生产随机密钥缓存；带单测 `jwt-secret.spec.ts` |
| 2 | register/sendCode 并发竞态 | ❌ **仍存在且加重** | 新注册流程（`auth.service.ts:44-62`）仍为 findOne→save 两步；**且 `user.entity.ts` 的 phone 列没有唯一索引**（只有 email/status 普通索引），并发注册可产生重复账号 |
| 3 | token 落 localStorage | ❌ 未修 | `frontend/lib/jwt.ts:13-34` 仍存取 localStorage，无 middleware.ts |

---

## 一、整体评价

**新代码的整体水准比老代码高一个档次。** 具体体现在：

- **认证重写质量高**：短信验证码 → 账号密码（scrypt），`password.util.ts` 随机盐 + `timingSafeEqual` 恒定时间比较防时序攻击；`jwt-secret.ts` 的「禁用公开值 + 分环境策略」是教科书式写法；登出黑名单机制保留。
- **支付金额不信任客户端**：`membership.service.ts:116` 与 `user-strategy-pack.controller.ts:240` 金额均由服务端计算，DTO 只传 plan/packId —— 方向正确。
- **策略包获取鉴权严密**：付费包 activate 强校验未过期订阅（`user-strategy-pack.controller.ts:183-193`），无法绕过 UI 白嫖；包文件 tmp+rename 原子写盘、default 包禁删。
- **Growth Scheduler 设计稳健**：错峰 Cron、每用户独立 try/catch、(userId, weekStart) 唯一索引幂等、只取最近活跃 ≤200 用户。
- **前端亮点**：`lib/api/admin.ts` 全强类型；`ImmersiveReader` 虚拟滚动 + 监听器成对清理是正面样板；`StarMapCanvas` rAF/pointer/wheel 全部正确清理；全项目 console.log 残留为 0。

**但「速度快、防线薄」的问题集中在三条新链路上：管理员后台（信任边界内裸奔）、支付（模拟态直通成功）、AI 平台额度（无护栏）。**

---

## 二、存在的问题

### 🔴 P0 —— 上线即事故（4 项）

**P0-1　迁移给全部存量用户回填默认密码 `123456`**
- 位置：`backend/src/migrations/1789000000000-AddUserPasswordHash.ts:18-28`
- 所有 `password_hash IS NULL` 的老用户被回填 `hash(SMS_DEV_CODE || '123456')`。生产若未设 `SMS_DEV_CODE`，**全库老账号密码就是 123456**，且哈希随迁移固化——事后改 env 无效。登录侧 `auth.service.ts:103-108` 同样接受 `process.env.SMS_DEV_CODE || '123456'`。
- **修复**：迁移改为不回填（保持 NULL，老账号走验证码/重置流程），或生成随机密码并强制首次登录重置。登录兼容分支必须删除或加环境守卫。

**P0-2　模拟支付无生产环境闸门**
- 位置：`membership.service.ts:119-127`、`user-strategy-pack.controller.ts:243-251`
- 创建 pending 订单后**同一请求内**直接置 success——任何人可 0 成本开通 pro/super 会员与付费策略包。代码注释承认是开发模拟，但没有 `NODE_ENV !== 'production'` 守卫。
- **修复**：立即加环境闸门；接入真实网关前，支付接口在生产返回 503。

**P0-3　登录无任何暴力破解防护**
- 位置：`auth.controller.ts:29`（`POST /login`），全 auth 模块 grep 无 Throttle/rateLimit/attempt 计数。
- 旧的短信 60s 限流随重写一并消失。配合 P0-1 的默认密码，攻击成本极低。
- **修复**：Redis 按手机号+IP 计数（5 次失败锁 15 分钟），或引入 `@nestjs/throttler`。

**P0-4　phone 无唯一索引 + 注册竞态仍在**
- 位置：`user.entity.ts:29-35`（phone 列无 @Index unique）；`auth.service.ts:44-62`；注册后初始化 user_settings（`auth.service.ts:66-71`）不在同一事务。
- **修复**：加唯一迁移 `CREATE UNIQUE INDEX ON users(phone)`；注册用事务包住「建用户 + 建设置」；catch 唯一冲突转 409。

### 🟠 P1 —— 高优先级（5 项）

**P1-1　并发购买丢失更新（真实网关下即资损）**
- `user-strategy-pack.controller.ts:255-267`：事务内 findOne 读 `expiresAt` 再覆盖保存，READ COMMITTED 无 `SELECT ... FOR UPDATE`/幂等键。两个并发购买第二次会覆盖第一次的到期时间。membership subscribe（`membership.service.ts:110-145`）同理。

**P1-2　策略包规则内容零深度校验，可注入 LLM 提示词与前端信号**
- `strategy-pack.service.ts:217-232` 只校验字段是 string；`ui_type` 无白名单；`cognitive-prompt-assembler.service.ts:328-344` 把 `rule.uiType` 直接拼进 `<!-- INTERVENTION:{...} -->` JSON 注释——含 `"`/`}`/换行的值可伪造前端交互信号。admin 上传（`admin.controller.ts:47`）与建议审批（`admin.service.ts:496-511`，`rule as never` 强转）两条路径都直达此处。
- **修复**：`ui_type` 白名单 + INTERVENTION 注释字段 JSON 转义。

**P1-3　admin 写接口无 DTO，绕过全局 ValidationPipe**
- `admin.controller.ts:47,102-113,143-146`：`@Body() body: StrategyPack & { id?: string }` 是纯 TS 接口，ValidationPipe 对非 class 不校验也不 whitelist，任意 JSON 落盘为策略包。
- **修复**：定义 class DTO + class-validator；`main.ts:52-57` 考虑加 `forbidNonWhitelisted`。

**P1-4　平台 LLM 回退调用无配额护栏**
- `mental-model.service.ts:101-113`：用户未自备 Key 时回退平台 `LLM_*`，无任何配额检查；admin `generateAllMentalModels`（`admin.controller.ts:86-94`）可反复触发 ≤200 用户 × LLM 调用，平台成本无上限。
- **修复**：平台额度记账（复用 aiQuota 机制）或对平台回退路径加每日上限。

**P1-5　被封禁用户持有有效 token 仍可继续用 7 天**
- `jwt.strategy.ts` validate 直接返回 payload，不查库、不校验 status（黑名单只在登出时写入）。封禁/注销只影响下次登录。
- **修复**：JwtStrategy validate 里按 `sub` 查一次用户 status（可加 60s 本地缓存），或封禁时把该用户所有 token 写入黑名单（需要 jti）。

### 🟡 P2 —— 中优先级（前端为主，8 项）

1. **Assistant 流式请求卸载不中断 + 双发竞态**：`app/assistant/page.tsx:152-186` 无 unmount abort cleanup；`:147` 用闭包 `streaming` 防重入失效（快速 Enter 双发）。→ useEffect cleanup 调 `abortRef.current?.abort()`；防重入改 `useRef` 锁。
2. **UsersPanel 搜索/详情竞态覆盖**：`components/admin/panels/UsersPanel.tsx:134-173` 无 AbortController/序号比对，慢响应覆盖新状态；ModelCard 重算失败 `catch {}` 静默（`:51-61`）。
3. **危险操作缺确认**：建议批准=一键热合并规则进 L2（`SuggestionsPanel.tsx:342-345`），无确认对话框；`PacksPanel.tsx:312-339` 「点两次+4 秒复位」确认的 timeout 未清理、`removePack` 无 busy 锁可双击双删。
4. **阅读器划线失败仍提示成功**：`ImmersiveReader.tsx:564-567` `void saveHighlight(...)` 无 catch（unhandled rejection）且无条件 toast 成功；对比 `:426-428` digest 路径有 catch。
5. **登录错误透传泄露账号存在性**：`AuthForm.tsx:102-104` 原样展示后端 message；后端 `auth.service.ts:91,101` 已统一为「手机号或密码错误」，但「账号不存在或已注销」(`:91`) 仍可区分——建议统一文案。另外 `AuthForm.tsx:250-262` 与 `materials/page.tsx` 底部又各复制了一份 `extractError`（第 4、5 份拷贝）。
6. **PaymentsPanel 防抖定时器卸载未清理**：`PaymentsPanel.tsx:99-103`，卸载后 setState（`ImmersiveReader.tsx:195-199` 是正确参照）。
7. **DecorationSettings 未守护异步**：`DecorationSettings.tsx:284,321` 两处 `e: any`；`:336-346` `setAsWebThemeBg` 无 try/catch。
8. **admin 支付列表先 take 500 再内存过滤**：`admin.service.ts:100-126`，超 500 条旧记录永远搜不到、无分页；`SuggestionsPanel` 同（`:375-379` take 50）。

### ⚪ P3 —— 低优先级 / 观察项

- 全项目无 FK 约束与级联（风格如此）：`intervention-event.entity.ts:42-43` 的 `atomId` 缺索引；用户删除留孤儿行。
- 静默吞错：`assistant.service.ts:277-279` `.catch(() => undefined)`；`assistant.controller.ts:109-111` 空 catch。
- `main.ts:23-24` 20mb 请求体限制对所有端点生效，建议只对导入路由放宽。
- ScheduleModule 藏在 `notification.module.ts:18` 里驱动全局 Cron，结构异味。
- StrategyPackStore 价格展示用货架快照（`StrategyPackStore.tsx:719`），管理员改价后用户看到旧价。
- `BackButton.tsx` 的 `window.history.length > 1` 在 SPA/新标签直开场景不可靠。
- QuestionBoard 暗色用 `dark:bg-mist-900/70`（`:102,193`）——mist 是亮色调色板，疑为 token 误用（应为 space-*）。
- Interaction 组件（`AtomActionButtons.tsx:70-92`、`FollowButton.tsx:59-63`）失败 `catch {}` 静默，无失败反馈。
- Assistant 页 `key={i}`（`page.tsx:429`）；`s.desc` 正则反抽参数（`:571`）脆弱。
- 新增 8 处硬编码 violet/emerald/fuchsia 色绕过 accent/cta/warn 令牌（assistant 页与 StrategyPackStore 为主），待随 UI 重设计统一。

---

## 三、具体修改建议（按优先级排序）

### 立即修复（本周内，上线前必须）

| 序 | 动作 | 涉及文件 | 理由 |
|---|---|---|---|
| 1 | 删除迁移中的默认密码回填逻辑 | `1789000000000-AddUserPasswordHash.ts` | P0-1，全库弱口令 |
| 2 | 模拟支付加 `NODE_ENV !== 'production'` 守卫 | `membership.service.ts:119`、`user-strategy-pack.controller.ts:243` | P0-2，0 成本开通会员 |
| 3 | 登录加 Redis 失败计数限流 | `auth.service.ts` login | P0-3，暴力破解 |
| 4 | phone 唯一索引迁移 + 注册事务化 | `user.entity.ts`、新迁移、`auth.service.ts:39-75` | P0-4，重复账号 |
| 5 | 登录兼容分支（`SMS_DEV_CODE \|\| '123456'`）删除或加环境守卫 | `auth.service.ts:103-108` | 与 P0-1 同源 |

### 建议重构（两周内）

- **购买幂等**：给 payment 表加 `idempotency_key`（客户端生成 UUID）或订阅更新改 `SELECT ... FOR UPDATE`（P1-1）。
- **策略包校验器**：抽一个 `validatePackRules()` 对 ui_type 白名单 + trigger 结构完整校验，admin 上传/建议审批/启动加载三处共用（P1-2）。
- **Admin DTO 化**：六个面板对应的后端接口全部补 class DTO（P1-3）。
- **平台 LLM 记账**：`mental-model.service.ts` 平台回退路径接入配额扣减（P1-4）。
- **JwtStrategy 查库校验 status**（P1-5）。
- **admin 列表分页化**：keyword 过滤下推 SQL（P2-8）。

### 可延后（随 UI 重设计一起做）

- Assistant 卸载 abort + useRef 防重入（P2-1）
- UsersPanel 请求竞态（AbortController/序号）（P2-2）
- 危险操作确认流统一（P2-3）
- 划线失败提示修正（P2-4）
- extractError 收敛为 `lib/extract-error.ts` 单一实现，顺手修 profile/me 漏读 axios message（P2-5）
- 杂项 P3 清单

---

## 四、改进方向

### 4.1 性能

- **Scheduler N+1**：`mental-model.service.ts:176-178` 循环内每用户 exists 查询，200 用户约 600 次查询/周。改一次性 `SELECT user_id FROM user_mental_models WHERE week_start = :w AND user_id IN (...)` 内存比对即可降为 1-2 次。
- **admin 列表**：分页 + SQL 侧过滤（见 P2-8），数据量增长后必改。
- **`intervention_events.atom_id` 补索引**：干预事件按原子查询是高频路径。
- **请求体限制分级**：20mb 只给导入路由，其余 1mb。

### 4.2 可维护性

- **DTO 纪律**：确立「所有 @Body 必须是 class + class-validator」的项目铁律，纯 TS 接口只允许用于内部函数签名。
- **错误处理规范**：禁止空 catch 与 `.catch(() => undefined)`——至少 `logger.warn`；前端静默失败统一换成 toast。本次新增代码里这两类问题各 3-4 处。
- **extractError 单一实现**：现存至少 5 份拷贝，收敛后 profile/me 的 axios message 缺陷也一并修复。
- **ScheduleModule 归位**：挪到 AppModule 根注册或独立 SchedulingModule。
- **审计日志**：admin 写操作（封禁、退款、包变更、建议审批）目前只有 `logger.log`，建议落 `admin_audit_logs` 表。

### 4.3 工具与模式

- **`@nestjs/throttler`**：一行守卫解决登录/注册/短信类接口限流（P0-3 的首选方案）。
- **class-validator + forbidNonWhitelisted**：与全局 ValidationPipe 配合堵住 admin 裸奔（P1-3）。
- **乐观锁模式**：订阅/支付类「读-改-写」统一走 `SELECT ... FOR UPDATE` 或版本号列。
- **OpenAPI（@nestjs/swagger）**：admin 面板与后端契约靠手写类型（虽然 `lib/api/admin.ts` 写得很好），规模再涨建议从 DTO 自动生成前端类型。
- **前端**：AbortController 竞态防护可作为 lint 规则提示（自定义 eslint rule 或 review checklist）；设计令牌迁移（violet/emerald → accent/cta/warn）继续随 UI 重设计推进。

---

## 五、如果只能做三件事

1. **堵住认证三连洞**：迁移回填密码 + 登录限流 + phone 唯一索引（P0-1/3/4 同源，一起改）。
2. **支付环境闸门**：一行 `if (process.env.NODE_ENV === 'production') throw ...`（P0-2）。
3. **admin 校验补齐**：DTO + ui_type 白名单（P1-2/3），把信任边界内的裸奔口子扎上。
