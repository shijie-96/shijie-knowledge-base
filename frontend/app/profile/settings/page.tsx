"use client";

import AuthorizationRequestsCard from "@/components/authorization/AuthorizationRequestsCard";
import FullExportCard from "@/components/export/FullExportCard";
import MemoryExportCard from "@/components/export/MemoryExportCard";
import ChangePasswordCard from "@/components/user/ChangePasswordCard";
import BackButton from "@/components/common/BackButton";

/**
 * 设置子页面：授权申请 + 数据导出（全量导出 / AI 记忆）
 * 从工具台迁移而来，作为【我的】→ 设置 的二级页面。
 * 卡片组件自带标题，此处只提供页面壳与分区间距。
 */
export default function SettingsPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-mist-50 pb-24 dark:bg-space-950 md:pb-10">
      {/* 装饰背景：顶部 radial + 星点（全局统一语言） */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 55% at 50% -10%, rgb(var(--accent-500) / 0.10) 0%, rgb(var(--warn-400) / 0.04) 50%, transparent 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(rgb(var(--accent-500) / 0.12) 1px, transparent 1.5px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative mx-auto w-full max-w-2xl px-4 py-6 md:max-w-4xl md:px-8 md:py-10">
        {/* 页面品牌头 */}
        <header className="mb-6 flex items-start justify-between gap-4 md:mb-8">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-500 dark:text-accent-400">
              个人中心 · 数据与安全
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-mist-900 dark:text-mist-50 md:text-3xl">
              设置
            </h1>
            <p className="mt-1.5 text-sm text-mist-500 dark:text-mist-400">
              账号安全 · 授权管理 · 数据导出——你的知识，你的选择
            </p>
          </div>
          <BackButton fallback="/profile/me" title="返回个人中心" />
        </header>

        <div className="space-y-5 md:space-y-6">
          <section id="change-password" className="scroll-mt-24">
            <ChangePasswordCard />
          </section>
          <AuthorizationRequestsCard />
          <FullExportCard />
          <MemoryExportCard />
        </div>
      </div>
    </div>
  );
}
