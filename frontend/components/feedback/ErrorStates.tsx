"use client";

import { ArrowLeft, LockKeyhole, PenLine, RefreshCw } from "lucide-react";
import {
  StateView,
  PrimaryActionButton,
  SecondaryActionButton,
  type FeedbackTone,
} from "./StateView";
import {
  ClockIllustration,
  FileXIllustration,
  LockIllustration,
  WandIllustration,
  WifiOffIllustration,
} from "./illustrations";

interface ErrorStateBaseProps {
  /** 主题：light 亮色 / dark 暗色，默认 auto（跟随 dark:） */
  tone?: FeedbackTone;
  /** 紧凑模式（用于局部区域，如列表内） */
  compact?: boolean;
  className?: string;
}

/**
 * 异常状态 1：网络错误 → 重试按钮
 */
export function NetworkErrorState({
  tone = "auto",
  compact,
  className,
  onRetry,
}: ErrorStateBaseProps & { onRetry?: () => void }) {
  return (
    <StateView
      tone={tone}
      compact={compact}
      className={className}
      illustration={<WifiOffIllustration />}
      title="网络好像开小差了"
      description="请求没能送达，请检查网络连接后重试。"
      actions={
        onRetry ? (
          <PrimaryActionButton onClick={onRetry}>
            <RefreshCw className="h-4 w-4" />
            重试
          </PrimaryActionButton>
        ) : undefined
      }
    />
  );
}

/**
 * 异常状态 2：权限不足 → 提示申请授权或返回
 */
export function PermissionDeniedState({
  tone = "auto",
  compact,
  className,
  onApply,
  onBack,
}: ErrorStateBaseProps & { onApply?: () => void; onBack?: () => void }) {
  return (
    <StateView
      tone={tone}
      compact={compact}
      className={className}
      illustration={<LockIllustration />}
      title="没有访问权限"
      description="这篇内容属于私有知识原子，需要获得作者授权后才能查看。"
      actions={
        <>
          {onApply ? (
            <PrimaryActionButton onClick={onApply}>
              <LockKeyhole className="h-4 w-4" />
              申请授权
            </PrimaryActionButton>
          ) : null}
          {onBack ? (
            <SecondaryActionButton onClick={onBack} tone={tone}>
              <ArrowLeft className="h-4 w-4" />
              返回
            </SecondaryActionButton>
          ) : null}
        </>
      }
    />
  );
}

/**
 * 异常状态 3：内容被删除 → 提示已删除/下架，返回按钮
 */
export function ContentDeletedState({
  tone = "auto",
  compact,
  className,
  onBack,
  detail,
}: ErrorStateBaseProps & { onBack?: () => void; detail?: string }) {
  return (
    <StateView
      tone={tone}
      compact={compact}
      className={className}
      illustration={<FileXIllustration />}
      title="内容已删除或下架"
      description={detail ?? "你要查看的内容可能已被作者删除、设为私密或暂时下架。"}
      actions={
        onBack ? (
          <SecondaryActionButton onClick={onBack} tone={tone}>
            <ArrowLeft className="h-4 w-4" />
            返回
          </SecondaryActionButton>
        ) : undefined
      }
    />
  );
}

/**
 * 异常状态 4：加载超时 → 刷新按钮
 */
export function LoadingTimeoutState({
  tone = "auto",
  compact,
  className,
  onRefresh,
}: ErrorStateBaseProps & { onRefresh?: () => void }) {
  return (
    <StateView
      tone={tone}
      compact={compact}
      className={className}
      illustration={<ClockIllustration />}
      title="加载超时"
      description="页面加载超过了预期时间，请刷新后重试。"
      actions={
        <PrimaryActionButton onClick={onRefresh ?? (() => window.location.reload())}>
          <RefreshCw className="h-4 w-4" />
          刷新页面
        </PrimaryActionButton>
      }
    />
  );
}

/**
 * 异常状态 5：AI 生成失败 → 提示手动填写
 */
export function AiGenerationFailedState({
  tone = "auto",
  compact,
  className,
  onManual,
  onRetry,
}: ErrorStateBaseProps & { onManual?: () => void; onRetry?: () => void }) {
  return (
    <StateView
      tone={tone}
      compact={compact}
      className={className}
      illustration={<WandIllustration />}
      title="AI 生成失败"
      description="这次 AI 没有成功，别担心，你可以手动填写内容，稍后也能重新生成。"
      actions={
        <>
          <PrimaryActionButton onClick={onManual}>
            <PenLine className="h-4 w-4" />
            手动填写
          </PrimaryActionButton>
          {onRetry ? (
            <SecondaryActionButton onClick={onRetry} tone={tone}>
              <RefreshCw className="h-4 w-4" />
              重新生成
            </SecondaryActionButton>
          ) : null}
        </>
      }
    />
  );
}
