"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Brain,
  MessageCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  UserRound,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";

interface NavTab {
  key: string;
  label: string;
  href: string;
  icon: typeof Sparkles;
}

/** 底部导航：工具台 / 助理 / 星图 / 消息 / 我的
 *  - 移动端（< md）：底部固定 5 列横排
 *  - 桌面端（>= md）：左侧固定 240px Sidebar，纵向排列
 *  - 顺序即优先级：认知闭环主引擎（工具台）居首，助理次之，
 *    社交/可视化层（星图）靠后
 */
const TABS: NavTab[] = [
  { key: "tools", label: "工具台", href: "/dashboard", icon: Wrench },
  { key: "assistant", label: "助理", href: "/assistant", icon: Brain },
  { key: "starmap", label: "星图", href: "/starmap", icon: Sparkles },
  { key: "messages", label: "消息", href: "/messages", icon: MessageCircle },
  { key: "me", label: "我的", href: "/profile/me", icon: UserRound },
];

/** 判断路径是否命中某 tab（精确 + 前缀匹配） */
function isActive(pathname: string, href: string): boolean {
  if (href === "/starmap") return pathname === "/starmap";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** 侧边栏收起状态持久化 key */
const SIDEBAR_COLLAPSED_KEY = "zhishi:sidebar:collapsed";

export default function BottomNav() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // 挂载时从 localStorage 恢复收起状态，同步给 <html> 加 class
  // （globals.css 里用 html.sidebar-collapsed 覆盖主区 md:pl-60 → pl-16）
  useEffect(() => {
    try {
      if (localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1") {
        setCollapsed(true);
        document.documentElement.classList.add("sidebar-collapsed");
      }
    } catch {}
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    const root = document.documentElement;
    if (next) root.classList.add("sidebar-collapsed");
    else root.classList.remove("sidebar-collapsed");
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
    } catch {}
  };

  return (
    <nav
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-mist-200/70 bg-white/90 backdrop-blur-md dark:border-space-800/70 dark:bg-space-950/85
        md:inset-x-auto md:bottom-0 md:left-0 md:top-0 ${
          collapsed ? "md:w-16" : "md:w-60"
        } md:border-r md:border-t-0 md:border-mist-200/70 md:bg-white/95 md:dark:border-space-800/70 md:dark:bg-space-950/90`}
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="主导航"
    >
      {/* ===== 桌面端品牌区（>= md） ===== */}
      <div className="hidden border-b border-mist-200/70 px-3 py-5 dark:border-space-800/70 md:block">
        <div
          className={`flex items-center gap-2 ${
            collapsed ? "justify-center" : ""
          }`}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 via-violet-500 to-blue-600 text-white shadow">
            <Sparkles className="h-5 w-5" strokeWidth={2.2} />
          </div>
          {!collapsed && (
            <div>
              <p className="text-sm font-bold text-mist-900 dark:text-mist-50">
                识界
              </p>
              <p className="text-[11px] text-mist-500 dark:text-mist-400">
                认知无界，成长无限
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ===== 桌面端导航项（>= md） ===== */}
      <div className="hidden flex-col gap-1 p-2 md:flex">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              title={collapsed ? tab.label : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                collapsed ? "justify-center px-0" : ""
              } ${
                active
                  ? "bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-300"
                  : "text-mist-600 hover:bg-mist-100 hover:text-mist-900 dark:text-mist-400 dark:hover:bg-space-800/60 dark:hover:text-mist-100"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                className="h-5 w-5 shrink-0"
                strokeWidth={active ? 2.2 : 1.8}
              />
              {!collapsed && <span>{tab.label}</span>}
              {!collapsed && active && (
                <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent-500 dark:bg-accent-400" />
              )}
            </Link>
          );
        })}
      </div>

      {/* ===== 桌面端收起/展开按钮（>= md） ===== */}
      <div className="mt-auto hidden p-2 md:block">
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "展开侧栏" : "收起侧栏"}
          title={collapsed ? "展开侧栏" : "收起侧栏"}
          className={`flex h-9 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-medium text-mist-500 transition-colors hover:bg-mist-100 hover:text-mist-900 dark:text-mist-400 dark:hover:bg-space-800/60 dark:hover:text-mist-100 ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4 shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="h-4 w-4 shrink-0" />
              <span>收起侧栏</span>
            </>
          )}
        </button>
      </div>

      {/* ===== 移动端导航项（< md） ===== */}
      <div className="mx-auto grid max-w-lg grid-cols-5 md:hidden">
        {TABS.map((tab) => {
          const active = isActive(pathname, tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={`flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${
                active
                  ? "text-accent-600 dark:text-accent-400"
                  : "text-mist-500 hover:text-mist-700 dark:text-mist-400 dark:hover:text-mist-200"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <Icon
                className={`h-5 w-5 ${active ? "" : "opacity-80"}`}
                strokeWidth={active ? 2.2 : 1.8}
              />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
