/**
 * 统一反馈组件（空状态 + 异常状态）
 *
 * 全局调用方式：
 *   import { EmptyMaterials, NetworkErrorState } from "@/components/feedback";
 *
 * 主题（tone）：
 *   - "auto"：默认，跟随页面 dark: 前缀（适用于亮/暗双主题页面）
 *   - "dark"：强制深色文字（适用于 #0A0E1A / mist-950 等深色背景页面）
 *   - "light"：强制浅色文字
 *
 * 空状态：
 *   - EmptyMaterials        素材池空 → 引导导入 /materials/import
 *   - EmptyKnowledge        知识库空 → 引导去素材池消化 /materials
 *   - EmptyPublicProfile    公开主页空（访客）→ 提示用户还在沉淀
 *   - EmptyQuestionBoard    提问看板空 → 引导分享名片
 *   - EmptyMessages         消息中心空 → 引导去星图逛逛 /starmap
 *   - EmptyDashboard        数据看板空 → 提示开始闭环后生成
 *
 * 异常状态：
 *   - NetworkErrorState     网络错误 → 重试
 *   - PermissionDeniedState 权限不足 → 申请授权 / 返回
 *   - ContentDeletedState   内容被删除 → 返回
 *   - LoadingTimeoutState   加载超时 → 刷新
 *   - AiGenerationFailedState AI 生成失败 → 手动填写
 */
export * from "./StateView";
export * from "./illustrations";
export * from "./EmptyStates";
export * from "./ErrorStates";
export * from "./useLoadingTimeout";
