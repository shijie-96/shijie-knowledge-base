"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import BottomNav from "@/components/navigation/BottomNav";

/** 是否应挂载侧栏：与是否渲染 BottomNav 完全一致
 *  单一真相源 —— 任何新增的"不需要 sidebar"路由都只改这里一处。
 *  返回 true 时：渲染 <BottomNav /> + <body> 加 .app-has-sidebar（让位）
 *  返回 false 时：什么都不渲染 + body 不让位 */
function shouldMountSidebar(pathname: string | null): boolean {
  if (!pathname) return false;
  if (pathname === "/" || pathname.startsWith("/u/")) return false;
  if (pathname === "/starmap") return false;
  if (/^\/materials\/[^/]+\/digest$/.test(pathname)) return false;
  // 知识库列表 + 原子编辑页：自带左侧目录 + 顶部返回按钮（避免双侧栏）
  if (
    pathname === "/atoms" ||
    (/^\/atoms\/[^/]+$/.test(pathname) && pathname !== "/atoms/iterate")
  ) {
    return false;
  }
  return true;
}

/**
 * 全局底部导航：
 * - 登录页（/）、公开主页（/u/…）不显示
 * - 深度工作页（消化加工 /materials/{id}/digest、原子编辑 /atoms/{id}）自带
 *   底部操作栏 + 顶部返回按钮，不显示全局导航，避免与操作栏重叠
 * - 知识库（/atoms、/atoms/iterate）：本身是"工具型"全屏应用，自带左侧目录
 *   + 顶部"返回工具台"按钮，避免与全局侧栏叠加
 * - 其余所有页面（含二级页面）统一挂载，保证随时可返回主 tab
 */
export default function GlobalNav() {
  const pathname = usePathname();

  // 让 body 是否让位与是否挂载 sidebar 完全同步 —— 全项目唯一的让位规范
  useEffect(() => {
    const root = document.body;
    if (shouldMountSidebar(pathname)) {
      root.classList.add("app-has-sidebar");
    } else {
      root.classList.remove("app-has-sidebar");
    }
  }, [pathname]);

  if (!shouldMountSidebar(pathname)) return null;
  return <BottomNav />;
}
