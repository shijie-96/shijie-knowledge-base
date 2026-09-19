"use client";

import Reveal from "./Reveal";
import { SectionHead } from "./ui";

const SCENES = [
  {
    n: "场景一",
    title: "读完一篇好文章",
    desc: "划下击中你的那句，先写下自己的想法，再走消化——保存，沉淀成一颗知识原子。",
    flow: ["复制链接", "素材池", "沉浸阅读", "消化沉淀"],
  },
  {
    n: "场景二",
    title: "脑子里有个模糊的想法",
    desc: "选「聊一聊」，想到哪说到哪，AI 顺着追问细节，聊完自动整理成结构化素材，送回闭环。",
    flow: ["聊一聊", "AI 追问", "结构化", "消化"],
  },
  {
    n: "场景三",
    title: "三个月后，它提醒你",
    desc: '"这颗原子已经 90 天没被用起来了。"点开迭代提醒，复用它、合并它，或承认它该归档了。',
    flow: ["零复用 · 超 90 天", "迭代提醒", "更新此原子"],
  },
  {
    n: "场景四",
    title: "助理主动找你",
    desc: '"你上次的观点和前天的说法不太一致。"认知助理结合你的画像主动开口，能追问、也敢挑战你。',
    flow: ["认知画像", "主动干预", "聊得差不多 → 待沉淀"],
  },
  {
    n: "场景五",
    title: "把知识连成网",
    desc: "在别人的公开原子上点「引用」，观点就缝进了你的知识网络；打开引用溯源，看清认知层层生长。",
    flow: ["引用", "引用溯源", "认知网络"],
  },
  {
    n: "还有",
    title: "成长看板，但不打分",
    desc: "全部数据来自你的客观行为——不评分、不排名。数量不是成就，持续闭环、复用与迭代才是成长。",
    flow: ["闭环完成率", "复用率", "迭代率", "被引用次数"],
    accent: true,
  },
];

export default function Scenes() {
  return (
    <section id="scenes" className="bg-[#F0FDFA] px-5 py-[64px]">
      <div className="mx-auto w-full max-w-[1120px]">
        <Reveal>
          <SectionHead
            tag="Scenarios"
            title="它具体能帮你做什么"
            desc="五个真实场景，对应产品里真实存在的路径。"
          />
        </Reveal>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {SCENES.map((s, i) => (
            <Reveal key={s.n} delay={(i % 3) * 70} className="h-full">
              <article
                className={`flex h-full flex-col rounded-[16px] border p-[24px] ${
                  s.accent
                    ? "border-[#99F6E4] bg-[#F0FDFA]"
                    : "border-[#E9F5F3] bg-white"
                }`}
              >
                <span className="mb-[8px] block text-[12px] font-bold tracking-[0.1em] text-[#14B8A6]">
                  {s.n}
                </span>
                <h3 className="mb-[8px] text-[16.5px] font-bold tracking-[-0.02em] text-[#0B2B2A]">
                  {s.title}
                </h3>
                <p className="flex-1 text-[14.5px] leading-[1.7] text-[#4A7A75]">
                  {s.desc}
                </p>
                <div className="mt-[12px] flex flex-wrap items-center gap-[6px] text-[12.5px] text-[#6E9A95]">
                  {s.flow.map((f, fi) => (
                    <span key={f} className="flex items-center gap-[6px]">
                      {fi > 0 && <i className="inline-block h-px w-3 bg-[#D8EDEC]" />}
                      {f}
                    </span>
                  ))}
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
