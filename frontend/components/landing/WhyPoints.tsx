"use client";

import Reveal from "./Reveal";
import { SectionHead } from "./ui";

const POINTS = [
  {
    n: 1,
    title: "不写完自己的思考，就存不进去",
    desc: "消化环节强制二选一：写下「核心启发」，或说清「我同意还是反对、为什么」。AI 不代笔，这一步不能跳过——这是对抗假性认知的核心。",
    accent: true,
  },
  {
    n: 2,
    title: "它会当场拆穿你的敷衍",
    desc: "输入\"不错\"\"有收获\"\"666\"？系统会实时提示：内容过短、检测到可能敷衍的表达。低质量的感动，进不了你的认知资产。",
    accent: false,
  },
  {
    n: 3,
    title: "素材是原料，认知才是资产",
    desc: "素材池只是原始输入，不向量化、不公开、不能直接分享导出——必须经消化加工，才会沉淀成你的知识原子。\"它还不是你的知识。\"",
    accent: false,
  },
  {
    n: 4,
    title: "知识不用，就会死掉",
    desc: "零复用超过 90 天、高复用久未迭代，系统会主动提醒你：该用了，该迭代了。识界不奖励你存了多少，只关心闭环有没有跑起来。",
    accent: false,
  },
  {
    n: 5,
    title: "你的知识，随时能带走",
    desc: "全量导出 Markdown + HTML + JSON，离线可浏览、不依赖平台；AI 记忆也能一键导出或彻底清除。数据完全属于你。",
    accent: true,
  },
];

export default function WhyPoints() {
  return (
    <section id="why" className="bg-[#F0FDFA] px-5 py-[64px]">
      <div className="mx-auto w-full max-w-[1120px]">
        <Reveal>
          <SectionHead
            tag="Why 识界"
            title={'它跟"收藏夹"的区别，在于它不惯着你'}
            desc="五条卖点，全部来自真实实现——不是愿景，是现在就能用的机制。"
          />
        </Reveal>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {POINTS.map((p, i) => (
            <Reveal
              key={p.n}
              delay={(i % 4) * 70}
              className={
                p.accent
                  ? "md:col-span-2"
                  : ""
              }
            >
              <article
                className={`flex h-full gap-4 rounded-[16px] p-[24px] transition-[box-shadow,border-color] duration-200 ease-[cubic-bezier(.16,1,.3,1)] hover:shadow-[0_4px_12px_rgba(13,148,136,0.08),0_2px_4px_rgba(13,148,136,0.04)] ${
                  p.accent
                    ? "border border-[#99F6E4] bg-[#F0FDFA] hover:border-[#5EEAD4]"
                    : "border border-[#E9F5F3] bg-white hover:border-[#99F6E4]"
                }`}
              >
                <span
                  className={`mt-[2px] grid h-[30px] w-[30px] shrink-0 place-items-center rounded-full text-[13px] font-bold text-white ${
                    p.accent ? "bg-[#F97316]" : "bg-[#0D9488]"
                  }`}
                >
                  {p.n}
                </span>
                <div>
                  <h3 className="mb-[6px] text-[17.5px] font-bold tracking-[-0.02em] text-[#0B2B2A]">
                    {p.title}
                  </h3>
                  <p className="text-[15px] leading-[1.7] text-[#4A7A75]">{p.desc}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
