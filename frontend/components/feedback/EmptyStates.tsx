"use client";

import { FilePlus2, LibraryBig, RefreshCw, Share2, Sparkles } from "lucide-react";
import {
  StateView,
  PrimaryActionButton,
  SecondaryActionButton,
  type FeedbackTone,
} from "./StateView";
import {
  BellIllustration,
  ChartIllustration,
  HourglassIllustration,
  InboxIllustration,
  LibraryIllustration,
  QuestionIllustration,
} from "./illustrations";

interface EmptyStateBaseProps {
  /** 主题：light 亮色 / dark 暗色，默认 auto（跟随 dark:） */
  tone?: FeedbackTone;
  /** 紧凑模式（用于局部区域，如列表内） */
  compact?: boolean;
  className?: string;
}

/**
 * 空状态 1：素材池空 → 引导导入
 */
export function EmptyMaterials({
  tone = "auto",
  compact,
  className,
}: EmptyStateBaseProps) {
  return (
    <StateView
      tone={tone}
      compact={compact}
      className={className}
      illustration={<InboxIllustration />}
      title="素材池还是空的"
      description="导入第一份素材（文章、笔记、文档……），开始积累你的认知原料。"
      actions={
        <PrimaryActionButton href="/materials/import">
          <FilePlus2 className="h-4 w-4" />
          导入素材
        </PrimaryActionButton>
      }
    />
  );
}

/**
 * 空状态 2：知识库空 → 引导去素材池消化
 * 带 keyword 时表示搜索无结果，引导清空搜索或直接新建原子。
 */
export function EmptyKnowledge({
  tone = "auto",
  compact,
  className,
  onCreate,
  onClearSearch,
  keyword,
}: EmptyStateBaseProps & {
  onCreate?: () => void;
  onClearSearch?: () => void;
  keyword?: string;
}) {
  const searching = Boolean(keyword);
  return (
    <StateView
      tone={tone}
      compact={compact}
      className={className}
      illustration={<LibraryIllustration />}
      title={searching ? "没有找到匹配的原子" : "知识库还空着"}
      description={
        searching
          ? `没有找到与「${keyword}」相关的知识原子，换个关键词试试。`
          : "先去素材池消化素材，沉淀出的知识原子会汇聚在这里。"
      }
      actions={
        searching ? (
          <>
            {onClearSearch ? (
              <PrimaryActionButton onClick={onClearSearch}>清除搜索</PrimaryActionButton>
            ) : null}
            {onCreate ? (
              <SecondaryActionButton onClick={onCreate} tone={tone}>
                直接新建原子
              </SecondaryActionButton>
            ) : null}
          </>
        ) : (
          <>
            <PrimaryActionButton href="/materials">
              <LibraryBig className="h-4 w-4" />
              去素材池消化
            </PrimaryActionButton>
            {onCreate ? (
              <SecondaryActionButton onClick={onCreate} tone={tone}>
                直接新建原子
              </SecondaryActionButton>
            ) : null}
          </>
        )
      }
    />
  );
}

/**
 * 空状态 3：公开主页空（访客）→ 提示用户还在沉淀
 */
export function EmptyPublicProfile({
  tone = "auto",
  compact,
  className,
  onShare,
  isOwner = false,
}: EmptyStateBaseProps & {
  /** 分享按钮回调（访客可邀请更多人） */
  onShare?: () => void;
  /** 是否本人查看自己的主页 */
  isOwner?: boolean;
}) {
  return (
    <StateView
      tone={tone}
      compact={compact}
      className={className}
      illustration={<HourglassIllustration />}
      title={isOwner ? "你还在沉淀中" : "TA 还在沉淀中"}
      description={
        isOwner
          ? "把知识消化成原子并公开，访客才能看到你的知识主页。"
          : "这位用户正在把认知沉淀成知识原子，稍后再来看看吧。"
      }
      actions={
        onShare ? (
          <PrimaryActionButton onClick={onShare}>
            <Share2 className="h-4 w-4" />
            分享主页
          </PrimaryActionButton>
        ) : undefined
      }
    />
  );
}

/**
 * 空状态 4：提问看板空 → 引导分享名片
 */
export function EmptyQuestionBoard({
  tone = "auto",
  compact,
  className,
  onShare,
}: EmptyStateBaseProps & { onShare?: () => void }) {
  return (
    <StateView
      tone={tone}
      compact={compact}
      className={className}
      illustration={<QuestionIllustration />}
      title="提问看板还空着"
      description="把名片分享出去，邀请朋友们来向你提问、互动。"
      actions={
        <PrimaryActionButton onClick={onShare}>
          <Share2 className="h-4 w-4" />
          分享名片
        </PrimaryActionButton>
      }
    />
  );
}

/**
 * 空状态 5：消息中心空 → 引导去星图逛逛
 */
export function EmptyMessages({
  tone = "auto",
  compact,
  className,
}: EmptyStateBaseProps) {
  return (
    <StateView
      tone={tone}
      compact={compact}
      className={className}
      illustration={<BellIllustration />}
      title="暂无消息"
      description="这里会汇集被引用、被提问、授权申请等通知。先去星图逛逛吧。"
      actions={
        <PrimaryActionButton href="/starmap">
          <Sparkles className="h-4 w-4" />
          去星图逛逛
        </PrimaryActionButton>
      }
    />
  );
}

/**
 * 空状态 6：数据看板空 → 提示开始闭环后生成
 */
export function EmptyDashboard({
  tone = "auto",
  compact,
  className,
}: EmptyStateBaseProps) {
  return (
    <StateView
      tone={tone}
      compact={compact}
      className={className}
      illustration={<ChartIllustration />}
      title="数据还在生成中"
      description="完成「导入 → 消化 → 沉淀」的第一次闭环后，成长数据就会在这里出现。"
      actions={
        <>
          <PrimaryActionButton href="/materials/import">
            <FilePlus2 className="h-4 w-4" />
            开始导入素材
          </PrimaryActionButton>
          <SecondaryActionButton onClick={() => window.location.reload()} tone={tone}>
            <RefreshCw className="h-4 w-4" />
            刷新看看
          </SecondaryActionButton>
        </>
      }
    />
  );
}
