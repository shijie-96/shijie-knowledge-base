"use client";

import { useCallback, useEffect, useState } from "react";
import AuthDialog from "@/components/auth/AuthDialog";
import LandingNav from "./LandingNav";
import SideNav from "./SideNav";
import Hero from "./Hero";
import LoopSteps from "./LoopSteps";
import WhyPoints from "./WhyPoints";
import Scenes from "./Scenes";
import Closing from "./Closing";

export default function LandingPage() {
  const [authOpen, setAuthOpen] = useState(false);
  const [authRegister, setAuthRegister] = useState(false);

  // 落地页内锚点平滑滚动（尊重系统减弱动效设置）
  useEffect(() => {
    const html = document.documentElement;
    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    html.style.scrollBehavior = reduce ? "auto" : "smooth";
    return () => {
      html.style.scrollBehavior = "";
    };
  }, []);

  const openAuth = useCallback((register: boolean) => {
    setAuthRegister(register);
    setAuthOpen(true);
  }, []);

  return (
    <div className="min-h-screen bg-[#F0FDFA] text-[#134E4A]">
      <LandingNav />
      <SideNav />

      <main id="top">
        <Hero onStart={() => openAuth(false)} />
        <LoopSteps />
        <WhyPoints />
        <Scenes />
        <Closing onStart={() => openAuth(false)} />
      </main>

      {/* 登录 / 注册浮层：登录成功由 AuthForm 内部跳转工具台 */}
      <AuthDialog
        open={authOpen}
        initialMode={authRegister ? "register" : "login"}
        onClose={() => setAuthOpen(false)}
      />
    </div>
  );
}
