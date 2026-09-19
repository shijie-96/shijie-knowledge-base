"use client";

import { Inbox, PenLine, Package, RefreshCw } from "lucide-react";
import Reveal from "./Reveal";
import { SectionHead } from "./ui";

const STEPS = [
  {
    n: "01",
    title: "收集",
    head: "先都丢进来",
    desc: "链接、文件、随口说的话。三种入口：聊一聊、粘贴链接、上传文件。URL 自动抓正文降噪。",
    route: "/materials · /materials/import",
    icon: Inbox,
  },
  {
    n: "02",
    title: "消化",
    head: "必须自己想",
    desc: "强制二选一主观输出：写「核心启发」，或说清「我同意还是反对、为什么」。AI 不代笔，不能跳过。",
    route: "/materials/[id]/digest",
    icon: PenLine,
  },
  {
    n: "03",
    title: "沉淀",
    head: "长成知识原子",
    desc: "核心问题、我的观点、事实佐证三件套，带版本历史与引用关联，按 PARA+S 归位。",
    route: "/atoms/[id]",
    icon: Package,
  },
  {
    n: "04",
    title: "复用 / 迭代",
    head: "别让它死掉",
    desc: "零复用超 90 天、高复用久未迭代，系统主动提醒。引用溯源让你看清认知怎么层层长起来。",
    route: "/atoms · /atoms/iterate · /references",
    icon: RefreshCw,
  },
];

export default function LoopSteps() {
  return (
    <section id="loop" className="border-y border-[#E9F5F3] bg-white px-5 py-[64px]">
      <div className="mx-auto w-full max-w-[1120px]">
        <Reveal>
          <SectionHead
            tag="The Loop"
            title="一条闭环，把外部输入变成自己的东西"
            desc={'四个环节，环环相扣。中间任何一步偷懒，知识就停在了"收藏"那一层。'}
          />
        </Reveal>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={(i % 4) * 70}>
              <article className="group h-full rounded-[16px] border border-[#E9F5F3] bg-white p-[24px] shadow-[0_1px_3px_rgba(13,148,136,0.06),0_1px_2px_rgba(13,148,136,0.05)] transition-[box-shadow,transform,border-color] duration-200 ease-[cubic-bezier(.16,1,.3,1)] hover:-translate-y-[2px] hover:border-[#99F6E4] hover:shadow-[0_4px_12px_rgba(13,148,136,0.08),0_2px_4px_rgba(13,148,136,0.04)]">
                <div className="mb-[16px] grid h-[42px] w-[42px] place-items-center rounded-[12px] bg-[#F0FDFA] text-[#0F766E]">
                  <s.icon className="h-[21px] w-[21px]" />
                </div>
                <p className="text-[12px] font-bold tracking-[0.1em] text-[#14B8A6]">
                  {s.n} {s.title}
                </p>
                <h3 className="mb-[8px] mt-[2px] text-[18px] font-bold tracking-[-0.02em] text-[#0B2B2A]">
                  {s.head}
                </h3>
                <p className="text-[14.5px] leading-[1.7] text-[#4A7A75]">{s.desc}</p>
                <span className="mt-[12px] inline-block font-mono text-[12px] text-[#6E9A95]">
                  {s.route}
                </span>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
