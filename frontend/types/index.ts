/**
 * 全局通用类型定义。
 * 业务模块类型（user / knowledge / chat / ai 等）后续按模块拆分到 types/ 子目录。
 */

/** 后端统一响应包装（与后端约定，后续可调整） */
export interface ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;
}

/** 分页查询参数 */
export interface PageQuery {
  page?: number;
  pageSize?: number;
}

/** 分页响应 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** JWT 载荷 */
export interface JwtPayload {
  sub: string;
  phone?: string;
  [key: string]: unknown;
}

/** 用户 */
export interface User {
  id: string;
  phone: string;
  nickname: string | null;
  email: string | null;
  avatar: string | null;
  bio: string | null;
  /** 所在省份（认知沙盘定位；未选择时为 null） */
  province?: string | null;
  /** 所在城市（认知沙盘定位；未选择时为 null） */
  city?: string | null;
  /** 关注数（来自后端 User 实体的 following_count） */
  followingCount?: number;
  /** 粉丝数（来自后端 User 实体的 follower_count） */
  followerCount?: number;
  /** 持有的知识原子总数（/user/me 聚合返回） */
  atomTotal?: number;
  createdAt: string;
  updatedAt: string;
}

/** 用户设置（user_settings 表，部分偏好字段） */
export interface UserSetting {
  userId: string;
  /** 默认发布权限 private/authorized/public */
  defaultPermission?: "private" | "authorized" | "public";
  /** 公开提醒 */
  publicReminder?: boolean;
  /** 敏感识别 */
  sensitiveDetection?: boolean;
  /** 授权开关 */
  authorizationToggle?: boolean;
  /** 引用开关 */
  referenceToggle?: boolean;
  /** 提醒频率 daily/weekly/never */
  reminderFrequency?: "daily" | "weekly" | "never";
  /** 通知设置（JSON） */
  notificationSettings?: Record<string, unknown> | null;
  /** 天气偏好（JSON，星图页维护） */
  weatherPreference?: Record<string, unknown> | null;
  /** 主题偏好 light/dark/system（system=跟随系统） */
  themePreference?: "light" | "dark" | "system";
  /** 装扮配置（JSON） */
  decorationConfig?: Record<string, unknown> | null;
  /** AI 分身开关 */
  aiAvatarEnabled?: boolean;
  [key: string]: unknown;
}

/** 更新用户偏好设置请求（全部可选，仅更新传入字段） */
export interface UpdateUserSettingsParams {
  defaultPermission?: "private" | "authorized" | "public";
  publicReminder?: boolean;
  sensitiveDetection?: boolean;
  authorizationToggle?: boolean;
  referenceToggle?: boolean;
  reminderFrequency?: "daily" | "weekly" | "never";
  notificationSettings?: Record<string, unknown>;
  weatherPreference?: Record<string, unknown>;
  themePreference?: "light" | "dark" | "system";
}

/** 注册请求 */
export interface RegisterParams {
  phone: string;
  username: string;
  password: string;
}

/** 登录请求 */
export interface LoginParams {
  phone: string;
  password: string;
}

/** 登录 / 注册返回 */
export interface AuthResult {
  token: string;
  user: User;
}

/** 更新当前用户请求 */
export interface UpdateMeParams {
  nickname?: string;
  email?: string | null;
  avatar?: string;
  bio?: string;
  /** 所在省份；传 null 或空字符串表示清除定位 */
  province?: string | null;
  /** 所在城市；传 null 或空字符串表示清除定位 */
  city?: string | null;
  contacts?: Record<string, unknown>;
}

/** 修改登录密码请求 */
export interface ChangePasswordParams {
  oldPassword: string;
  newPassword: string;
}

/** 素材来源类型 */
export type MaterialSourceType = "text" | "url" | "file" | "conversation";

/** 素材处理状态 */
export type MaterialStatus = "pending" | "digesting" | "digested" | "archived";

/**
 * 素材（仅原始输入，非个人认知）
 * 素材池不向量化、不支持语义搜索、不可直接公开/分享。
 */
export interface Material {
  id: string;
  userId: string;
  title: string;
  originalText: string;
  summary: string | null;
  sourceType: MaterialSourceType;
  sourceUrl: string | null;
  status: MaterialStatus;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  /** 沉浸式阅读器阅读进度（字符偏移） */
  readProgressOffset?: number;
  /** 最后阅读时间 */
  lastReadAt?: string | null;
}

/** 素材标注类型：高亮划线 / 书签 / 阅读时临时思考 */
export type MaterialAnnotType = 'highlight' | 'bookmark' | 'temp_thought';

/** 文本选区位置（字符偏移，相对素材全文） */
export interface AnnotationTextRange {
  start_offset: number;
  end_offset: number;
}

/** 素材标注（仅阅读草稿，不直接成为认知资产） */
export interface MaterialAnnotation {
  id: string;
  userId: string;
  materialId: string;
  annotType: MaterialAnnotType;
  textRangeJson: AnnotationTextRange;
  excerptText: string | null;
  userThought: string | null;
  /** 沉淀完成时间（非空 = 已沉淀，阅读器显示绿色高亮） */
  digestedAt: string | null;
  /** 沉淀生成的知识原子 ID（点击绿色高亮可跳转查看） */
  digestedAtomId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 阅读进度 */
export interface ReadProgress {
  readProgressOffset: number;
  lastReadAt: string | null;
}

/** 送入消化接口返回的预填充数据 */
export interface SendDigestPrefill {
  annotationId: string;
  annotType: MaterialAnnotType;
  excerptText: string;
  userThought: string;
  materialTitle: string;
  materialId: string;
}

/** 创建素材请求（文本粘贴 / URL 导入） */
export interface CreateMaterialParams {
  sourceUrl?: string;
  originalText?: string;
  title?: string;
  tags?: string[];
}

/** 更新素材请求 */
export interface UpdateMaterialParams {
  title?: string;
  originalText?: string;
  tags?: string[];
  summary?: string;
  status?: MaterialStatus;
}

/** 素材列表查询参数 */
export interface MaterialListQuery extends PageQuery {
  keyword?: string;
  status?: MaterialStatus;
  tag?: string;
}

/** 素材列表分页响应 */
export interface MaterialListResult extends Paginated<Material> {
  totalPages: number;
  /** 当前用户待消化素材总数（跨筛选，用于闭环引导） */
  pendingCount: number;
}

/** 消化返回（空结构） */
export type DigestResult = Record<string, never>;

// ==================== 任务04：AI 消化 / 沉淀 ====================

/** 主观输出方式（二选一单选） */
export type SubjectiveMode = "insight" | "agree";

/** 请求 AI 辅助提炼 */
export interface DigestSuggestionParams {
  materialId: string;
}

/** AI 辅助提炼结果（is_ai_generated 恒为 true，前端必须显著标注「AI辅助」） */
export interface AiDigestSuggestion {
  coreQuestion: string;
  solution: string;
  scenario: string;
  reference: string;
  isAiGenerated: boolean;
}

/** 敷衍识别请求 */
export interface SuperficialCheckParams {
  text: string;
}

/** 敷衍识别结果 */
export interface SuperficialCheckResult {
  isSuperficial: boolean;
  hits: string[];
  message?: string;
}

/** 完成消化请求（必须完成二选一主观输出，不允许跳过） */
export interface CompleteDigestParams {
  materialId: string;
  mode: SubjectiveMode;
  /** 主观输出内容（核心启发 或 同意/反对理由） */
  subjectiveOutput: string;
  /** 核心问题（可编辑，默认取自 AI 提炼或摘要） */
  coreQuestion?: string;
  /** AI 提炼内容（采用则标记 AI 辅助） */
  aiSolution?: string;
  aiScenario?: string;
  aiReference?: string;
  /** 选中引用到思考区的原文片段 */
  quoted?: string;
  /** 本次沉淀对应的标注 ID（沉淀成功后阅读器将该段标记为已沉淀） */
  annotationId?: string;
}

/** 完成消化返回 */
export interface CompleteDigestResult {
  atomId: string;
  materialId: string;
  status: string;
}

/** 状态流转返回 */
export interface StatusResult {
  materialId: string;
  status: string;
}

/** 预留：知识库文档（暂未实现） */
// export interface KnowledgeDoc { ... }

// ==================== 任务05：知识原子 / 沉淀 ====================

/** PARA+S 分类 */
export type ParaCategory =
  | "projects"
  | "areas"
  | "resources"
  | "archives"
  | "skills";

/** 列表排序方式 */
export type AtomSort =
  | "updatedAt"
  | "createdAt"
  | "reuseCount"
  | "iterationCount"
  | "referencedCount";

/** 原子权限 */
export type AtomPermission = "private" | "authorized" | "public";

/** 原子状态 */
export type AtomStatus = "draft" | "active" | "archived";

/** 版本变更类型 */
export type AtomChangeType = "create" | "update" | "iterate";

/** 知识原子（认知资产最终成型；核心名片格式） */
export interface KnowledgeAtom {
  id: string;
  userId: string;
  sourceMaterialId: string | null;
  /** 核心问题（必填） */
  coreQuestion: string;
  /** 我的观点 / 方案（必填） */
  myViewpoint: string;
  /** 证据 / 出处（必填，公开必须） */
  evidence: string | null;
  /** 实践案例 */
  practiceCase: string | null;
  paraCategory: ParaCategory;
  /** 标签管理 */
  tags: string[] | null;
  permission: AtomPermission;
  status: AtomStatus;
  version: number;
  reuseCount: number;
  iterationCount: number;
  referencedCount: number;
  likeCount: number;
  favoriteCount: number;
  lastReusedAt: string | null;
  aiAssisted: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 版本历史记录 */
export interface AtomVersion {
  id: string;
  atomId: string;
  userId: string;
  version: number;
  coreQuestion: string;
  myViewpoint: string;
  evidence: string | null;
  practiceCase: string | null;
  paraCategory: ParaCategory;
  permission: AtomPermission;
  changeNote: string;
  changeType: AtomChangeType;
  createdAt: string;
}

/** 引用原子简要信息（不含素材内容） */
export interface AtomRefBrief {
  id: string;
  coreQuestion: string;
  myViewpoint: string;
  paraCategory: ParaCategory;
  permission: AtomPermission;
  version: number;
  updatedAt: string;
}

/** 引用关系条目 */
export interface AtomReference {
  id: string;
  citerAtomId: string;
  citedAtomId: string;
  note: string | null;
  createdAt: string;
  /** 自引用标记：引用自己的原子 = 复用 */
  isSelf?: boolean;
  citedAtom?: AtomRefBrief | null;
  citerAtom?: AtomRefBrief | null;
}

/** 创建知识原子请求 */
export interface CreateAtomParams {
  coreQuestion: string;
  myViewpoint: string;
  evidence?: string;
  practiceCase?: string;
  paraCategory?: ParaCategory;
  tags?: string[];
  sourceMaterialId?: string;
  permission?: AtomPermission;
  citedAtomId?: string;
  aiAssisted?: boolean;
}

// ==================== 任务11：引用溯源 ====================

/** 创建引用关联请求 */
export interface CreateReferenceParams {
  citerAtomId: string;
  citedAtomId: string;
  note?: string;
}

/** 引用关联简要信息（不含素材内容） */
export interface ReferenceAtomBrief {
  id: string;
  coreQuestion: string;
  paraCategory: ParaCategory | null;
  permission?: AtomPermission | null;
  /** 被他人引用次数（引用 = 他人引用了这个原子） */
  referencedCount?: number;
  /** 复用次数（复用 = 自己引用了自己的原子） */
  reuseCount?: number;
  likeCount?: number;
  favoriteCount?: number;
  userId?: string;
  deletedAt?: string | null;
}

/** 引用溯源条目 */
export interface ReferenceTraceItem {
  id: string;
  citerAtomId: string;
  citedAtomId: string;
  note: string | null;
  createdAt: string;
  direction: "outgoing" | "incoming";
  /** 自引用标记：引用自己的原子 = 复用 */
  isSelf?: boolean;
  citerAtom?: ReferenceAtomBrief | null;
  citedAtom?: ReferenceAtomBrief | null;
}

/** 引用溯源方向 */
export type ReferenceDirection = "outgoing" | "incoming";

/** 搜索可引用公开原子（用于引用选择器） */
export interface SearchCitablesParams {
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 更新知识原子请求 */
export interface UpdateAtomParams {
  coreQuestion?: string;
  myViewpoint?: string;
  evidence?: string;
  practiceCase?: string;
  paraCategory?: ParaCategory;
  tags?: string[];
  permission?: AtomPermission;
  status?: AtomStatus;
  changeNote?: string;
}

/** 原子列表查询 */
export interface AtomListQuery extends PageQuery {
  paraCategory?: ParaCategory;
  permission?: AtomPermission;
  status?: AtomStatus;
  keyword?: string;
  /** 排序方式（默认最近更新） */
  sort?: AtomSort;
}

/** 原子列表分页响应 */
export interface AtomListResult extends Paginated<KnowledgeAtom> {
  totalPages: number;
}

/** 原子关联的素材来源信息（owner 视角下由后端联表返回；公开/授权视角不返回） */
export interface AtomSource {
  id: string;
  title: string;
  /** 后端 source_materials.source_type 原始值 */
  sourceType: string;
  sourceUrl: string | null;
  createdAt: string;
}

/** 原子详情（核心格式 + 版本历史 + 引用关系 + 统计） */
export interface AtomDetailResult {
  /** 访问模式：owner=本人 / public=公开可看 / authorized=授权可看 / none 等=受限 */
  access?: AtomAccess;
  /** 是否可申请授权（受限时 true） */
  canRequest?: boolean;
  /** 当前用户的授权状态（受限 / 授权可读时返回） */
  authorization?: {
    status?: AuthorizationStatus | null;
    reason?: string | null;
    expiresAt?: string | null;
  } | null;
  atom: KnowledgeAtom;
  /** 素材来源（owner 视角独有，便于用户追溯沉淀自哪个素材） */
  source?: AtomSource | null;
  versions: AtomVersion[];
  references: {
    outgoing: AtomReference[];
    incoming: AtomReference[];
  };
  stats: {
    reuseCount: number;
    iterationCount: number;
    referencedCount: number;
    likeCount: number;
    favoriteCount: number;
    version: number;
  };
}

/** 原子访问模式（受限时前端据此提示申请授权） */
export type AtomAccess =
  | "owner"
  | "public"
  | "authorized"
  | "none"
  | "pending"
  | "rejected"
  | "expired";

// ==================== 任务09：授权访问 ====================

/** 授权状态 */
export type AuthorizationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "expired"
  | "revoked";

/** 发起授权申请入参 */
export interface AuthorizationRequestInput {
  reason: string;
}

/** 处理授权申请入参 */
export interface HandleAuthorizationInput {
  action: "approve" | "reject";
  validityDays?: number;
}

/** 授权申请列表项（所有者视角） */
export interface AuthorizationRecord {
  id: string;
  status: AuthorizationStatus;
  reason: string | null;
  expiresAt: string | null;
  createdAt: string;
  processedAt: string | null;
  requester: { id: string; nickname: string; avatar: string | null } | null;
  atom: { id: string; coreQuestion: string; permission: string } | null;
}

/** 发起申请的结果 */
export interface AuthorizationRequestResult {
  id: string;
  status: AuthorizationStatus;
  atomId: string;
  ownerId: string;
  createdAt: string;
  message: string;
}

/** 处理申请的结果 */
export interface HandleAuthorizationResult {
  id: string;
  status: AuthorizationStatus;
  expiresAt: string | null;
  message: string;
}

/** 迭代返回 */
export interface AtomIterateResult {
  atomId: string;
  iterationCount: number;
  version: number;
}

/** AI 分支建议（只建议，不自动修改） */
export interface AtomMetaSuggestion {
  suggestedParaCategory: ParaCategory | null;
  suggestedTags: string[];
  reasons: string;
  source: "llm" | "heuristic";
}

/** 语义搜索 */
export interface AtomSearchParams {
  query: string;
  limit?: number;
}
export interface AtomSearchResult {
  atom: KnowledgeAtom;
  similarity: number;
}

/** 迭代提醒条目 */
export interface IterateReminderItem {
  id: string;
  coreQuestion: string;
  myViewpoint: string;
  paraCategory: ParaCategory;
  permission: AtomPermission;
  reuseCount: number;
  iterationCount: number;
  version: number;
  status: AtomStatus;
  updatedAt: string;
  createdAt: string;
}

/** 迭代提醒返回 */
export interface IterateRemindersResult {
  zeroReuseOver90d: IterateReminderItem[];
  highReuseStale: IterateReminderItem[];
  generatedAt: string;
}

// ==================== 任务07：数据全量导出 ====================

/** 导出任务状态 */
export type ExportStatus = "processing" | "completed" | "failed";

/** 导出统计 */
export interface ExportStats {
  atomCount: number;
  versionCount: number;
  referenceCount: number;
  fileSizeBytes: number;
}

/**
 * 导出任务 DTO
 * - 所有会员等级均支持全量导出，无等级限制
 * - 导出包内容完整：知识原子 / 版本历史 / 引用关系 / 个人设置
 * - 格式通用（Markdown + HTML + JSON），可离线浏览
 */
export interface ExportTask {
  exportId: string;
  status: ExportStatus;
  progress: number;
  message: string;
  downloadUrl: string | null;
  expiresAt: string | null;
  error?: string;
  stats: ExportStats;
  createdAt: string;
  completedAt: string | null;
}

/** 发起导出请求 */
export interface CreateExportParams {
  format?: "full";
}

// ==================== AI 记忆（导出 / 清除） ====================

/** AI 认知画像中的领域条目（强项 / 盲区 / 缺口） */
export interface CognitiveDomainEntry {
  domain: string;
  atomCount?: number;
  materialCount?: number;
  reuseRate?: number;
  beCited?: number;
  reason?: string;
}

/** AI 沟通策略反思记录 */
export interface ReflectionLogEntry {
  at: string;
  scenario?: string;
  summary?: string;
}

/** 用户认知画像（记忆层） */
export interface UserCognitiveProfile {
  userId: string;
  strengths: CognitiveDomainEntry[];
  weaknesses: CognitiveDomainEntry[];
  activeTopics: string[];
  gaps: CognitiveDomainEntry[];
  lastGeneratedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** AI 沟通策略记忆（记忆层） */
export interface AiStrategyMemory {
  userId: string;
  preferredStyle: string;
  learnedRules: string[];
  avoidPatterns: string[];
  reflectionLog: ReflectionLogEntry[];
  chatCount: number;
  createdAt: string;
  updatedAt: string;
}

/** 清除 AI 记忆的结果 */
export interface ClearMemoryResult {
  profileDeleted: boolean;
  strategyDeleted: boolean;
}

// ==================== 任务08：公开主页 ====================

/** 公开主页排序方式 */
export type PublicSort = "latest" | "hot" | "reuse";

/** 公开主页用户信息（仅公开字段，不含原始素材） */
export interface PublicUserInfo {
  id: string;
  nickname: string;
  avatar: string | null;
  /** 一句话简介 */
  bio: string | null;
  /** 公开联系方式 */
  contacts: Record<string, unknown> | null;
}

/**
 * 公开主页的单张知识原子
 * - 核心格式统一，不因装扮改变内容结构
 * - 不展示任何平台评分、认知等级、排名
 */
export interface PublicAtom {
  id: string;
  coreQuestion: string;
  myViewpoint: string;
  practiceCase: string | null;
  evidence: string | null;
  paraCategory: ParaCategory;
  tags: string[] | null;
  version: number;
  iterationCount: number;
  reuseCount: number;
  referencedCount: number;
  likeCount: number;
  favoriteCount: number;
  /** 高权重原子（复用/迭代/引用任一 > 0） */
  highWeight: boolean;
  createdAt: string;
}

/** 公开主页统计数据 */
export interface PublicProfileStats {
  atomCount: number;
  totalVisits: number;
  totalReferenced: number;
  highWeightCount: number;
}

/** 对外公开的名片装扮（仅视觉字段，不影响知识原子核心格式） */
export interface PublicDecoration {
  /** 主题色 key */
  themeColor: string | null;
  /** 背景图 key */
  backgroundImage: string | null;
  /** 自定义背景图 URL（仅 Pro 版上传） */
  customBackground: string | null;
  /** 头像框 key */
  avatarFrame: string | null;
  /** 布局样式 key */
  layoutStyle: string | null;
}

/** 公开主页响应 */
export interface PublicProfileResult {
  user: PublicUserInfo;
  atoms: PublicAtom[];
  stats: PublicProfileStats;
  /** 免费版 true（需显示平台标识），Pro 版 false */
  platformBadge: boolean;
  /** 名片装扮（仅视觉外观配置，null 表示默认外观） */
  decoration: PublicDecoration | null;
}

/** 每日访问统计条目 */
export interface DailyVisit {
  date: string;
  count: number;
}

/** 自己的访问数据 */
export interface VisitStatsResult {
  totalVisits: number;
  recent7Days: DailyVisit[];
  daily: DailyVisit[];
}

// ==================== 任务10：基础社交互动 ====================

/** 点赞 / 收藏操作结果 */
export interface LikeResult {
  atomId: string;
  liked: boolean;
  likeCount: number;
}
export interface FavoriteResult {
  atomId: string;
  favorited: boolean;
  favoriteCount: number;
}

/** 关注 / 取消关注结果 */
export interface FollowResult {
  followeeId: string | null;
  following: boolean;
  followerCount: number;
}

/** 当前用户对某原子的互动状态 */
export interface AtomInteractionStatus {
  atomId: string;
  liked: boolean;
  favorited: boolean;
}

/** 与某用户的互动状态 */
export interface UserInteractionStatus {
  following: boolean;
  followingCount: number;
  followerCount: number;
}

/** 关注 / 粉丝列表中的用户（公开信息） */
export interface InteractionUser {
  id: string;
  nickname: string | null;
  avatar: string | null;
  bio: string | null;
  followingCount: number;
  followerCount: number;
}

/** 我的收藏列表条目（仅公开原子） */
export interface MyFavoriteItem {
  id: string;
  atomId: string;
  coreQuestion: string;
  myViewpoint: string;
  paraCategory: ParaCategory;
  likeCount: number;
  favoriteCount: number;
  favoritedAt: string;
}

// ==================== 任务12：名片装扮个性化 ====================

/** 会员等级（与后端一致） */
export type MembershipLevel = "free" | "pro" | "super";

/** 装扮选项（单个可选项） */
export interface DecorationOption {
  /** 选项唯一标识 */
  key: string;
  /** 展示名称 */
  label: string;
  /** 解锁所需最低会员等级 */
  tier: MembershipLevel;
  /** CSS 值（主题色为色值，背景图为渐变等） */
  value: string;
  /** 缩略示意 */
  hint?: string;
}

/** 装扮配置（本地读写结构，含自定义背景） */
export interface ProfileDecoration {
  themeColor: string | null;
  backgroundImage: string | null;
  customBackground: string | null;
  avatarFrame: string | null;
  layoutStyle: string | null;
}

/** 读取我的装扮配置响应 */
export interface GetMyDecorationResult {
  decoration: ProfileDecoration;
}

/** 装扮选项响应（会员体系已取消，全量开放） */
export interface DecorationOptionsResult {
  options: {
    themeColor: DecorationOption[];
    backgroundImage: DecorationOption[];
    avatarFrame: DecorationOption[];
    layoutStyle: DecorationOption[];
  };
}

/** 更新装扮请求（只提交想改的字段） */
export interface UpdateProfileDecorationParams {
  themeColor?: string;
  backgroundImage?: string;
  avatarFrame?: string;
  layoutStyle?: string;
  /** 自定义背景图 URL（仅 backgroundImage='custom' 时生效） */
  customBackground?: string;
}

/** 更新装扮响应 */
export interface UpdateProfileDecorationResult {
  decoration: ProfileDecoration;
  /** 被权限拦截回退的字段说明 */
  rejected: string[];
}

/** 认知星图中的单个光点（其他用户不携带装饰，仅自己有） */
export interface StarMapNode {
  userId: string;
  nickname: string;
  avatar: string | null;
  atomCount: number;
  referencedCount: number;
  /** 是否当前登录用户本人 */
  isSelf: boolean;
  /** 仅 isSelf=true 时返回，用于渲染专属光效 */
  decoration: PublicDecoration | null;
}

/** 认知星图数据 */
export interface StarMapResult {
  nodes: StarMapNode[];
}

// ==================== 任务13：提问看板（认知互动入口） ====================

/** 提问状态 */
export type QuestionStatus = "open" | "answered";

/** 提问/回答中的用户公开信息 */
export interface QuestionUser {
  id: string;
  nickname: string | null;
  avatar: string | null;
}

/** 回答公开结构 */
export interface QuestionAnswer {
  id: string;
  content: string;
  atomId: string | null;
  isAiGenerated: boolean;
  isAiDraft: boolean;
  createdAt: string;
  updatedAt: string;
  /** 回答者公开信息 */
  responder: QuestionUser;
}

/** 提问公开结构 */
export interface PublicQuestion {
  id: string;
  content: string;
  status: QuestionStatus;
  isAnonymous: boolean;
  atomId: string | null;
  createdAt: string;
  updatedAt: string;
  /** 提问者公开信息（匿名提问为 null） */
  asker: QuestionUser | null;
  answers: QuestionAnswer[];
  answerCount: number;
}

/** 提交提问请求 */
export interface CreateQuestionParams {
  content: string;
  isAnonymous?: boolean;
  atomId?: string;
}

/** 提问列表响应 */
export interface QuestionListResult {
  userId: string;
  /** 当前访问者是否该用户本人 */
  isOwner: boolean;
  pendingCount: number;
  answeredCount: number;
  questions: PublicQuestion[];
}

/** 提问详情响应 */
export interface QuestionDetailResult extends PublicQuestion {
  /** 当前访问者是否为被提问者（可回答） */
  canAnswer: boolean;
}

/** 创建回答请求 */
export interface CreateAnswerParams {
  content: string;
  atomId?: string;
}

/** 回答隐藏/删除响应 */
export interface AnswerOperationResult {
  answerId: string;
  hidden?: boolean;
  deleted?: boolean;
}

// ==================== 任务14：AI 分身（基于用户公开认知的自动化应答） ====================

/** AI 分身设置响应 */
export interface AiAvatarSettingsResult {
  /** AI 分身是否开启（默认关闭） */
  enabled: boolean;
}

/** 更新 AI 分身开关请求 */
export interface UpdateAiAvatarSettingsParams {
  enabled: boolean;
}

/** 发布 AI 草案请求（用户可编辑后发布） */
export interface PublishDraftParams {
  content?: string;
}

/** AI 草案生成响应 */
export interface AiDraftResult {
  answer: QuestionAnswer;
}

// ==================== 任务15：认知星图（发现层主入口） ====================

/** 星图：自己（固定中心偏上，唯一携带专属光晕） */
export interface StarMapSelfNode {
  userId: string;
  nickname: string;
  avatar: string | null;
  /** 专属光晕色（装扮主题色 hex），未装扮时为 null */
  glowColor: string | null;
  /** 已解析的悬停名片背景 CSS；未装扮时为 null，前端用默认渐变兜底 */
  cardBackground: string | null;
  /** 一句话简介（公开） */
  bio: string | null;
  /** 所在省份（认知沙盘定位；未选择时为 null） */
  province: string | null;
  /** 所在城市（认知沙盘定位；未选择时为 null） */
  city: string | null;
}

/** 星图：其他用户（客观统一外观，仅按会员等级区分光点大小与边框） */
export interface StarMapOtherNode {
  userId: string;
  nickname: string;
  avatar: string | null;
  /** 一句话简介（公开），悬停名片展示用；无简介时为 null */
  bio: string | null;
  /** 已解析的悬停名片背景 CSS；未装扮时为 null，前端用默认渐变兜底 */
  cardBackground: string | null;
  /** 所在省份（认知沙盘定位；未选择时为 null） */
  province: string | null;
  /** 所在城市（认知沙盘定位；未选择时为 null） */
  city: string | null;
}

/** 认知星图数据（GET /starmap） */
export interface CognitiveStarMapData {
  self: StarMapSelfNode;
  others: StarMapOtherNode[];
  /** 生成时间 ISO，每次刷新变化 */
  refreshedAt: string;
}

// ==================== 任务16：氛围层增强 ====================

/** 天气类型（氛围粒子效果） */
export type WeatherType = "clear" | "rain" | "snow" | "star";
/** 天气偏好模式：跟随本地 / 自定义 */
export type WeatherMode = "local" | "custom";
/** 四季 */
export type Season = "spring" | "summer" | "autumn" | "winter";

/** 节日信息 */
export interface FestivalInfo {
  key: string;
  name: string;
  decoration: string;
}

/** 天气偏好 */
export interface WeatherPreference {
  mode: WeatherMode;
  custom: WeatherType | null;
  enabled: boolean;
}

/** 天气与节日信息（GET /starmap/weather） */
export interface StarMapWeather {
  date: string;
  season: Season;
  weather: WeatherType;
  festival: FestivalInfo | null;
  preference: WeatherPreference;
}

/** 更新天气偏好参数（PUT /users/me/weather_preference） */
export interface UpdateWeatherPreferenceParams {
  mode?: WeatherMode;
  custom?: WeatherType | null;
  enabled?: boolean;
}

/** 原子摘要（连线详情） */
export interface AtomBrief {
  id: string;
  coreQuestion: string;
  paraCategory: string;
}

/** 连线对端用户摘要 */
export interface ConnectionUserBrief {
  userId: string;
  nickname: string;
  avatar: string | null;
}

/** 引用连线（GET /starmap/connections） */
export interface StarMapReferenceItem {
  id: string;
  /** outgoing = 我引用了对方；incoming = 对方引用了我 */
  direction: "outgoing" | "incoming";
  note: string | null;
  createdAt: string;
  citerUserId: string;
  citedUserId: string;
  otherUser: ConnectionUserBrief;
  citerAtom: AtomBrief | null;
  citedAtom: AtomBrief | null;
}

/** 相似弱联系（更细虚线、数量更少） */
export interface StarMapWeakLinkItem {
  userId: string;
  nickname: string;
  avatar: string | null;
  reason: string;
  /** 0-1 相似强度 */
  strength: number;
}

/** 引用连线数据（GET /starmap/connections） */
export interface StarMapConnections {
  references: StarMapReferenceItem[];
  weakLinks: StarMapWeakLinkItem[];
  refreshedAt: string;
}

// ==================== 任务17：真实成长的客观反馈（数据看板） ====================

/** 数据总览（GET /user/me/dashboard），全部为客观行为数据，无评分/等级/排行 */
export interface DashboardOverview {
  /** 知识原子总数（弱化展示，不视为成就） */
  atomTotal: number;
  /** 总素材数 */
  materialTotal: number;
  /** 已消化素材数 */
  digestedMaterialCount: number;
  /** 待消化素材数 */
  pendingMaterialCount: number;
  /** 闭环完成率 %（已消化 / 总素材） */
  closureRate: number;
  /** 复用总次数 */
  reuseTotal: number;
  /** 复用率 %（被复用原子 / 总原子） */
  reuseRate: number;
  /** 迭代次数 */
  iterationTotal: number;
  /** 迭代率 %（被迭代原子 / 总原子） */
  iterationRate: number;
  /** 被引用次数 */
  referencedTotal: number;
  /** 主页总访问 */
  visitTotal: number;
  /** 总分享 */
  shareTotal: number;
  /** 获赞 */
  likeTotal: number;
  /** 获收藏 */
  favoriteTotal: number;
  /** 粉丝数 */
  followerTotal: number;
  /** 提问数（我发出的提问） */
  questionTotal: number;
}

/** 近 30 天趋势（GET /user/me/dashboard/trends） */
export interface DashboardTrends {
  /** 30 个日期（YYYY-MM-DD，由旧到新） */
  days: string[];
  /** 每日复用（基于原子最后复用时间） */
  reuse: number[];
  /** 每日主页访问 */
  visits: number[];
  /** 每日原子创建数 */
  atomCreation: number[];
}

/** 分享事件埋点请求（POST /user/me/dashboard/share） */
export interface RecordShareParams {
  targetType?: "profile" | "atom" | "question";
  targetId?: string;
}

// ==================== 任务20：全平台系统通知汇总（消息中心） ====================

/** 通知类型（与后端 NOTIFICATION_TYPE 一致） */
export type NotificationType =
  | "reference"
  | "question"
  | "answer"
  | "authorization"
  | "like"
  | "favorite"
  | "follow"
  | "digest_remind";

/** 通知分类（前端筛选标签；后端 category 返回时无 all） */
export type NotificationCategory =
  | "all"
  | "reference"
  | "question"
  | "authorization"
  | "system";

/** 通知列表项 */
export interface NotificationRecord {
  id: string;
  type: NotificationType;
  category: Exclude<NotificationCategory, "all">;
  content: string;
  relatedId: string | null;
  isRead: boolean;
  createdAt: string;
}

/** 通知列表结果（GET /notifications） */
export interface NotificationListResult {
  items: NotificationRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  /** 该用户未读总数（跨筛选条件，用于红点/角标） */
  unreadCount: number;
}

/** 通知列表查询参数 */
export interface NotificationListParams {
  type?: NotificationType;
  category?: Exclude<NotificationCategory, "all">;
  page?: number;
  pageSize?: number;
}

// ==================== 里程碑6：OmniImport 统一素材导入 ====================

/** 导入类型：url=粘贴链接 / file=上传文件 */
export type OmniImportType = "url" | "file";

/**
 * OmniImport 解析预览结果（POST /materials/omniimport/parse，不写库）
 * 输出带 YAML frontmatter 的干净 GFM Markdown，供确认后入库（source_materials）。
 */
export interface OmniImportPreview {
  title: string;
  /** 纯文本预览（去符号、限长） */
  preview: string;
  /** 解析耗时 ms */
  durationMs: number;
  /** 带 YAML frontmatter 的完整 markdown（确认入库时原样提交） */
  markdown: string;
  tags: string[];
  /** 平台标签（如 微信公众号 / YouTube / PDF） */
  platformLabel?: string;
  importType: OmniImportType;
}

/** OmniImport 确认入库请求（POST /materials/omniimport） */
export interface OmniImportSaveParams {
  markdown: string;
  title?: string;
  sourceUrl?: string;
  tags?: string[];
}

/** 批量更新素材状态请求（POST /materials/batch/status） */
export interface BatchUpdateStatusParams {
  ids: string[];
  status: MaterialStatus;
}

// ==================== 多端可用：AI 配置与流式对话 ====================

/** 用户 AI 配置视图（后端绝不返回原始 apiKey，仅返回是否存在） */
export interface AiConfig {
  baseUrl: string | null;
  model: string | null;
  hasApiKey: boolean;
}

/** 保存 AI 配置请求（登录态；apiKey 留空 = 保留已保存密钥） */
export interface SaveAiConfigParams {
  apiKey?: string;
  baseUrl: string;
  model: string;
}

/** 匿名访客本地 AI 配置（仅存浏览器 localStorage，不上传后端） */
export interface AiConfigAnon {
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** AI 对话消息 */
export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// ==================== DP-03.6：认知助理（主动式学习顾问） ====================

/** 画像条目：label 为短展示标签，detail 为完整描述（超长盲区用 tooltip 展示） */
export interface AssistantProfileItem {
  label: string;
  detail?: string;
}

/** 认知耐受力视图（对挑战性干预的反应学习结果） */
export interface AssistantStaminaView {
  /** 0-1，对「挑战性追问」的耐受度 */
  tolerance: number;
  /** 0-1，自主发现矛盾 / 主动纠偏的能力 */
  selfCorrection: number;
  /** 推荐沟通风格 */
  suggestedStyle: "socratic" | "direct" | "narrative" | "gentle";
  /** 最近一次评估时间 ISO */
  lastAssessed: string;
}

/** 认知助理：画像概览（start 接口返回，供前端展示） */
export interface AssistantProfileView {
  /** 最近活跃话题（最多 6 条） */
  activeTopics: AssistantProfileItem[];
  /** 已沉淀领域（最多 6 条） */
  strengths: AssistantProfileItem[];
  /** 可深入的盲区（最多 6 条，label 短句 / detail 全文） */
  weaknesses: AssistantProfileItem[];
  /** 逻辑关联缺口（最多 6 条，如「产品强但用户研究空白」） */
  gaps: AssistantProfileItem[];
  /** 各类别的真实总数（前端展示 6/20，避免把截断当总数） */
  totals: { activeTopics: number; strengths: number; weaknesses: number };
  /** 认知耐受力；从未评估时为 null */
  stamina: AssistantStaminaView | null;
  /** 已记录的干预反馈条数 */
  feedbackCount: number;
}

/** 认知助理：主动开场返回（POST /ai/assistant/start） */
export interface AssistantStartResult {
  /** AI 结合画像生成的开场白 */
  opening: string;
  /** 是否已积累认知画像 */
  hasProfile: boolean;
  /** 画像概览（无画像时为 null） */
  profile: AssistantProfileView | null;
}

/** 认知助理：SSE 流式对话请求体（POST /ai/assistant/stream） */
export interface AssistantStreamParams {
  messages: AiChatMessage[];
}

// ==================== DP-03.5：对话式知识导入（AI 引导聊天 → 整理入素材池） ====================

/** 对话式导入：开始会话返回（POST /ai/conversation/start） */
export interface ConversationStartResult {
  sessionId: string;
  /** AI 开场引导语 */
  reply: string;
}

/** 对话式导入：继续对话返回（POST /ai/conversation/:id/chat） */
export interface ConversationChatResult {
  reply: string;
}

/** 对话式导入：整理结果（POST /ai/conversation/:id/finish，AI 结构化草稿，不落库） */
export interface ConversationResult {
  title: string;
  content: string;
  tags: string[];
}

/** 对话式导入：保存到素材池返回（POST /ai/conversation/:id/save） */
export interface ConversationSaveResult {
  materialId: string;
  material: Material;
}
