"use client";

import { AlertTriangle } from "lucide-react";
import Reveal from "./Reveal";
import { SectionHead } from "./ui";

function MockBar({ route }: { route: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-[#E9F5F3] bg-[#F7FCFB] px-4 py-3 font-mono text-[12.5px] text-[#6E9A95]">
      <span className="flex gap-[5px]" aria-hidden>
        <i className="h-[9px] w-[9px] rounded-full bg-[#D8EDEC]" />
        <i className="h-[9px] w-[9px] rounded-full bg-[#D8EDEC]" />
        <i className="h-[9px] w-[9px] rounded-full bg-[#D8EDEC]" />
      </span>
      {route}
    </div>
  );
}

function Badge({
  children,
  warn = false,
}: {
  children: string;
  warn?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-[5px] rounded-full px-[10px] py-[3px] text-[11.5px] font-semibold ${
        warn ? "bg-[#FFF7ED] text-[#C2410C]" : "bg-[#F0FDFA] text-[#0F766E]"
      }`}
    >
      {children}
    </span>
  );
}

export default function ScreenMocks() {
  return (
    <section
      id="screens"
      className="border-y border-[#E9F5F3] bg-white px-5 py-[64px]"
    >
      <div className="mx-auto w-full max-w-[1120px]">
        <Reveal>
          <SectionHead
            tag="Real Screens"
            title="真实界面，不是概念图"
            desc="下面三块来自产品实际运行中的界面文案与交互——宣传片里也是这几个镜头。"
          />
        </Reveal>

        <div className="grid grid-cols-1 items-start gap-[24px] lg:grid-cols-3">
          {/* Mock 1 素材池 */}
          <Reveal className="h-full">
            <div className="h-full overflow-hidden rounded-[20px] border border-[#D8EDEC] bg-white shadow-[0_4px_12px_rgba(13,148,136,0.08),0_2px_4px_rgba(13,148,136,0.04)]">
              <MockBar route="/materials" />
              <div className="p-[24px]">
                <p className="mb-[16px] flex items-center gap-2 text-[15.5px] font-bold text-[#0B2B2A]">
                  素材池 <Badge>原始输入</Badge>
                </p>
                <blockquote className="rounded-r-[8px] border-l-[3px] border-[#2DD4BF] bg-gradient-to-r from-[#F0FDFA] to-transparent py-[10px] pl-[16px] pr-2 text-[14.5px] text-[#134E4A]">
                  它还不是你的知识——素材需经「消化加工」才会成为你的认知原子
                </blockquote>
                <p className="mt-[14px] text-[13.5px] leading-[1.65] text-[#6E9A95]">
                  素材池内容仅为原始输入，不计入认知资产；不支持语义搜索、不支持直接分享或导出为认知资产。
                </p>
                <div className="mt-[16px] pt-4">
                  <span className="block rounded-[8px] bg-[#E9F5F3] py-[11px] text-center text-[14px] font-semibold text-[#6E9A95]">
                    素材池还是空的
                  </span>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Mock 2 消化 */}
          <Reveal delay={70} className="h-full">
            <div className="h-full overflow-hidden rounded-[20px] border border-[#D8EDEC] bg-white shadow-[0_4px_12px_rgba(13,148,136,0.08),0_2px_4px_rgba(13,148,136,0.04)]">
              <MockBar route="/materials/[id]/digest" />
              <div className="p-[24px]">
                <p className="mb-[16px] flex items-center gap-2 text-[15.5px] font-bold text-[#0B2B2A]">
                  消化加工 <Badge warn>思考需由你完成</Badge>
                </p>
                <p className="text-[12.5px] text-[#6E9A95]">
                  对抗假性认知 · 主观输出不可跳过
                </p>
                <div className="mt-4 grid gap-3">
                  <div className="flex gap-3 rounded-[12px] border-[1.5px] border-[#14B8A6] bg-[#F0FDFA] p-4 text-[14px]">
                    <span className="mt-[2px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2 border-[#0D9488] bg-[#0D9488]">
                      <span className="h-[6px] w-[6px] rounded-full bg-white" />
                    </span>
                    <div>
                      <b className="mb-[2px] block text-[14px] font-semibold text-[#0B2B2A]">
                        A · 核心启发
                      </b>
                      <span className="text-[13.5px] text-[#4A7A75]">
                        这段内容让我改变了什么认知？—— 用一句话讲清楚
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-3 rounded-[12px] border-[1.5px] border-[#D8EDEC] p-4 text-[14px] transition-colors duration-200">
                    <span className="mt-[2px] h-[18px] w-[18px] shrink-0 rounded-full border-2 border-[#D8EDEC]" />
                    <div>
                      <b className="mb-[2px] block text-[14px] font-semibold text-[#0B2B2A]">
                        B · 同意 / 反对
                      </b>
                      <span className="text-[13.5px] text-[#4A7A75]">
                        我同意还是反对？为什么？—— 反对也必须是深思过的反对
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex items-start gap-2 rounded-[8px] bg-[#FFF7ED] px-3 py-[10px] text-[13.5px] font-medium text-[#C2410C]">
                  <AlertTriangle className="mt-[3px] h-[15px] w-[15px] shrink-0" strokeWidth={2.2} />
                  <span>
                    检测到可能敷衍的表达（「有收获」），请用你自己的话描述真实启发
                  </span>
                </div>
                <div className="mt-[20px] flex gap-3 border-t border-[#E9F5F3] pt-4">
                  <span className="flex-1 rounded-[8px] border border-[#D8EDEC] bg-[#F7FCFB] py-[11px] text-center text-[14px] font-semibold text-[#6E9A95]">
                    暂不消化
                  </span>
                  <span className="flex-1 rounded-[8px] bg-[#0D9488] py-[11px] text-center text-[14px] font-semibold text-white">
                    保存并进入沉淀
                  </span>
                </div>
              </div>
            </div>
          </Reveal>

          {/* Mock 3 知识库 */}
          <Reveal delay={140} className="h-full">
            <div className="h-full overflow-hidden rounded-[20px] border border-[#D8EDEC] bg-white shadow-[0_4px_12px_rgba(13,148,136,0.08),0_2px_4px_rgba(13,148,136,0.04)]">
              <MockBar route="/atoms" />
              <div className="p-[24px]">
                <p className="mb-[16px] flex items-center gap-2 text-[15.5px] font-bold text-[#0B2B2A]">
                  知识库 <Badge>认知资产</Badge>
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="rounded-full bg-[#0D9488] px-[13px] py-[6px] text-[13px] font-semibold text-white">
                    知识树
                  </span>
                  <span className="rounded-full border border-[#E9F5F3] bg-[#F7FCFB] px-[13px] py-[6px] text-[13px] font-semibold text-[#4A7A75]">
                    图谱
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["项目", "领域", "资源", "归档", "技能"].map((t) => (
                    <span
                      key={t}
                      className="rounded-full border border-[#E9F5F3] bg-[#F7FCFB] px-[13px] py-[6px] text-[13px] font-semibold text-[#4A7A75]"
                    >
                      {t}
                    </span>
                  ))}
                </div>
                <div className="mt-4 flex gap-[24px]">
                  <div className="text-[12.5px] text-[#6E9A95]">
                    <b className="block text-[22px] font-bold tracking-[-0.02em] text-[#0B2B2A]">
                      已点亮 12 颗
                    </b>
                    知识原子
                  </div>
                  <div className="text-[12.5px] text-[#6E9A95]">
                    <b className="block text-[22px] font-bold tracking-[-0.02em] text-[#0B2B2A]">
                      闭环率 68%
                    </b>
                    客观数据
                  </div>
                  <div className="text-[12.5px] text-[#6E9A95]">
                    <b className="block text-[22px] font-bold tracking-[-0.02em] text-[#0B2B2A]">
                      复用 24 次
                    </b>
                    客观数据
                  </div>
                </div>
                <p className="mt-4 text-[12.5px] text-[#6E9A95]">
                  拖拽节点调整布局 · 滚轮缩放 · 点击节点查看分支详情
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
