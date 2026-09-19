import type { Metadata } from "next";
import HomeGate from "@/components/landing/HomeGate";

export const metadata: Metadata = {
  title: "识界 · 把读过的，变成想明白的",
  description:
    "识界是一个人的认知闭环工作台——收集、消化、沉淀、复用。每一条输入都要过你自己的脑子，才会成为你的知识原子。",
};

// 首页：未登录展示营销落地页（登录浮层），已登录自动进入工具台
export default function Home() {
  return <HomeGate />;
}
