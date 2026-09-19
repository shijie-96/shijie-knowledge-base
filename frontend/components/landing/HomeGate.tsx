"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isLoggedIn } from "@/lib/jwt";
import LandingPage from "./LandingPage";

/**
 * 首页入口：
 * - 已登录：跳转工具台（用户在浏览器输入根路径时的最优去向）
 * - 未登录：渲染营销登录落地页
 * 说明：首屏先渲染落地页（保证 SSR 内容与 SEO），挂载后若已登录再 replace，
 * 避免客户端空壳闪烁。
 */
export default function HomeGate() {
  const router = useRouter();

  useEffect(() => {
    if (isLoggedIn()) {
      router.replace("/dashboard");
    }
  }, [router]);

  return <LandingPage />;
}
