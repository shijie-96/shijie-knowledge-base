"use client";

import { ArrowRight, Check } from "lucide-react";
import { CtaButton } from "./ui";

const META = [
  { text: "主观输出不可跳过", icon: Check },
  { text: "AI 不代笔", icon: Check },
  { text: "数据可全量导出", icon: Check },
];

export default function Hero({
  onStart,
}: {
  onStart: () => void;
}) {
  return (
    <section className="relative overflow-hidden px-5 pb-[56px] pt-[64px] md:pb-[80px] md:pt-[96px]">
      {/* 顶部青绿辉光 */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-[-10%] top-[-30%] h-[520px] w-[120%]"
        style={{
          background:
            "radial-gradient(closest-side, rgba(45,212,191,0.20), transparent 70%)",
        }}
      />

      <div className="relative mx-auto grid w-full max-w-[1120px] items-center gap-[48px] md:grid-cols-[1.05fr_0.95fr] md:gap-[64px]">
        {/* 左：文案 */}
        <div>
          <span className="mb-[24px] inline-flex items-center gap-2 rounded-full border border-[#D8EDEC] bg-white px-[10px] py-[6px] pr-[14px] text-[13px] font-semibold text-[#0F766E] shadow-[0_1px_2px_rgba(13,148,136,0.06),0_1px_3px_rgba(13,148,136,0.05)]">
            <span className="h-[6px] w-[6px] rounded-full bg-[#F97316]" />
            每个人的认知闭环工作台
          </span>
          <h1 className="text-[clamp(34px,8.4vw,58px)] font-extrabold leading-[1.1] tracking-[-0.035em] text-[#0B2B2A]">
            把读过的，
            <br />
            变成
            <em className="relative whitespace-nowrap not-italic text-[#0D9488] before:absolute before:-z-[1] before:inset-x-0 before:bottom-[0.08em] before:h-[0.3em] before:rounded-[2px] before:bg-[#99F6E4]">
              想明白的
            </em>
          </h1>
          <p className="mt-[24px] max-w-[34em] text-[clamp(16px,2.4vw,18.5px)] text-[#4A7A75]">
            从收集、消化到沉淀、复用——
            <strong className="font-semibold text-[#0B2B2A]">
              每一条输入都要过你自己的脑子
            </strong>
            ，才会成为你的知识原子。识界不帮你收藏得更多，只帮你真的想清楚。
          </p>
          <div className="mt-[32px] flex flex-wrap gap-3">
            <CtaButton onClick={onStart}>
              开启我的认知闭环
              <ArrowRight className="h-[17px] w-[17px]" strokeWidth={2.2} />
            </CtaButton>
          </div>
          <ul className="mt-[32px] flex flex-wrap gap-[24px] text-[13.5px] text-[#6E9A95]">
            {META.map((m) => (
              <li key={m.text} className="flex items-center gap-[6px]">
                <m.icon className="h-[15px] w-[15px] text-[#0D9488]" strokeWidth={2.2} />
                {m.text}
              </li>
            ))}
          </ul>
        </div>

        {/* 右：闭环图 */}
        <div aria-hidden className="grid place-items-center py-4">
          <svg viewBox="0 0 440 440" className="h-auto w-full max-w-[440px]">
            {/* 轨道虚线 + 弧 */}
            <circle cx="220" cy="220" r="170" fill="none" stroke="#D8EDEC" strokeWidth="1.5" strokeDasharray="4 6" />
            <path d="M390 220 A170 170 0 0 1 220 390" fill="none" stroke="#2DD4BF" strokeWidth="2" strokeLinecap="round" opacity=".85" />
            <path d="M50 220 A170 170 0 0 1 220 50" fill="none" stroke="#2DD4BF" strokeWidth="2" strokeLinecap="round" opacity=".85" />
            <path d="M220 50 A170 170 0 0 1 390 220" fill="none" stroke="#2DD4BF" strokeWidth="2" strokeLinecap="round" opacity=".85" />
            <path d="M220 390 A170 170 0 0 1 50 220" fill="none" stroke="#2DD4BF" strokeWidth="2" strokeLinecap="round" opacity=".85" />

            {/* 四个节点 */}
            <g>
              <circle cx="220" cy="50" r="42" fill="#FFFFFF" stroke="#99F6E4" strokeWidth="1.5" />
              <text x="220" y="45" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#0D9488" letterSpacing="0.08em" fontFamily="inherit">STEP 01</text>
              <text x="220" y="63" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0B2B2A" fontFamily="inherit">收集</text>
            </g>
            <g>
              <circle cx="390" cy="220" r="42" fill="#FFFFFF" stroke="#99F6E4" strokeWidth="1.5" />
              <text x="390" y="215" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#0D9488" letterSpacing="0.08em" fontFamily="inherit">STEP 02</text>
              <text x="390" y="233" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0B2B2A" fontFamily="inherit">消化</text>
            </g>
            <g>
              <circle cx="220" cy="390" r="42" fill="#FFFFFF" stroke="#99F6E4" strokeWidth="1.5" />
              <text x="220" y="385" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#0D9488" letterSpacing="0.08em" fontFamily="inherit">STEP 03</text>
              <text x="220" y="403" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0B2B2A" fontFamily="inherit">沉淀</text>
            </g>
            <g>
              <circle cx="50" cy="220" r="42" fill="#FFFFFF" stroke="#99F6E4" strokeWidth="1.5" />
              <text x="50" y="215" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="#0D9488" letterSpacing="0.08em" fontFamily="inherit">STEP 04</text>
              <text x="50" y="233" textAnchor="middle" fontSize="13" fontWeight="700" fill="#0B2B2A" fontFamily="inherit">复用</text>
            </g>

            {/* 流向箭头 */}
            <polygon points="262,298 270,306 262,314" fill="#2DD4BF" transform="rotate(90 266 306)" />
            <polygon points="178,204 170,196 178,188" fill="#2DD4BF" />

            {/* 中心 */}
            <circle cx="220" cy="220" r="62" fill="#0D9488" />
            <text x="220" y="220" textAnchor="middle" fontSize="15" fontWeight="700" fill="#FFFFFF" fontFamily="inherit">知识原子</text>
            <text x="220" y="239" textAnchor="middle" fontSize="9" fill="#CCFBF1" fontFamily="inherit">只有消化过才算</text>
          </svg>
        </div>
      </div>
    </section>
  );
}
