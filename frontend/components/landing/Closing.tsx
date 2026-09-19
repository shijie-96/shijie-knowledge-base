"use client";

import { ArrowRight } from "lucide-react";
import Reveal from "./Reveal";
import { BrandMark, CtaButton } from "./ui";

export default function Closing({
  onStart,
}: {
  /** 打开"注册并开始"弹层 */
  onStart: () => void;
}) {
  return (
    <div id="start">
      {/* 金句带 */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#134E4A] via-[#042F2E] to-[#06201F] py-[96px] text-center text-white">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 70% at 50% 0%, rgba(45,212,191,0.16), transparent 70%)",
          }}
        />
        <div className="relative mx-auto w-full max-w-[1120px] px-5">
          <blockquote className="m-0 text-[clamp(22px,5.2vw,36px)] font-bold leading-[1.4] tracking-[-0.03em]">
            数量不是成就——
            <br />
            持续闭环、复用与迭代才是成长。
          </blockquote>

        </div>
      </section>

      {/* 结尾 CTA */}
      <section className="bg-[#F0FDFA] px-5 py-[96px] text-center">
        <div className="mx-auto w-full max-w-[1120px]">
          <Reveal>
            <h2 className="text-[clamp(26px,6vw,42px)] font-bold tracking-[-0.035em] text-[#0B2B2A]">
              别再让「收藏」冒充「学会」
            </h2>
          </Reveal>
          <Reveal delay={70}>
            <p className="mx-auto mt-[24px] max-w-[34em] text-[16.5px] text-[#4A7A75]">
              今天丢进第一条素材，让 AI 陪你消化，写下第一句真正属于你自己的思考。
            </p>
          </Reveal>
          <Reveal delay={140}>
            <div className="mt-[32px] flex flex-wrap justify-center gap-3">
              <CtaButton onClick={onStart}>
                开启我的认知闭环
                <ArrowRight className="h-[17px] w-[17px]" strokeWidth={2.2} />
              </CtaButton>
            </div>
          </Reveal>
          <Reveal delay={210}>
            <p className="mt-[28px] text-[13.5px] text-[#6E9A95]">
              全量导出面向所有用户开放，无任何限制 · 你的知识，你的选择
            </p>
          </Reveal>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#D8EDEC] bg-white px-5 py-[32px] text-center">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-center gap-x-[18px] gap-y-2">
          <span className="flex items-center gap-[7px] text-[16px] font-bold tracking-[-0.01em] text-[#0B2B2A]">
            <BrandMark size={24} />
            识界
          </span>
          <span aria-hidden className="hidden h-[18px] w-px bg-[#D8EDEC] sm:block" />
          <p className="text-[13.5px] tracking-[0.01em] text-[#6E9A95]">
            每个人的认知闭环工作台 · 收集 · 消化 · 沉淀 · 复用
          </p>
        </div>
      </footer>
    </div>
  );
}
