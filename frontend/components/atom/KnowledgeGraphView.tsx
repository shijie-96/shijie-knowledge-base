"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as echarts from "echarts/core";
import { GraphChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { ChevronRight, Loader2, Network, RotateCcw } from "lucide-react";
import { PARA_LABEL } from "@/lib/para";
import type { KnowledgeAtom, ParaCategory } from "@/types";
import PermissionBadge from "./PermissionBadge";
import { EmptyKnowledge } from "@/components/feedback";
import { isAliveChart, useEChartsChart } from "@/hooks/useEChartsChart";

echarts.use([GraphChart, TooltipComponent, CanvasRenderer]);

/** PARA 目录对应的图谱节点主色（与 PARA_META.dot 视觉一致） */
const PARA_HEX: Record<ParaCategory, string> = {
  projects: "#6366f1",
  areas: "#0ea5e9",
  resources: "#8b5cf6",
  archives: "#9BA8C0", // mist-400（原 mist-400 冷灰随换肤淘汰）
  skills: "#10b981",
};
const TAG_COLOR = "#a855f7";
/** 原子点/未归类主干等中性色统一到 mist 体系（原 slate 冷灰已随全站换肤淘汰） */
const ATOM_COLOR = "#74819B"; // mist-500
const NONE_HEX = "#9BA8C0"; // mist-400
/** mist 体系十六进制 → rgba（ECharts shadowColor 不支持 8 位 hex，光晕需转为 rgba） */
const hexA = (hex: string, alpha: number): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

type NodeKind = "para" | "tag" | "atom";

interface GraphNodeData {
  id: string;
  name: string;
  kind: NodeKind;
  count: number;
  para?: ParaCategory | "none";
  atom?: KnowledgeAtom;
  /** PARA / 标签节点下挂载的原子列表（点击节点查看分支内容） */
  atomIds?: string[];
}

interface GraphLinkData {
  source: string;
  target: string;
}

interface GraphData {
  nodes: GraphNodeData[];
  links: GraphLinkData[];
}

/**
 * 知识图谱视图（Obsidian Graph View 风格）：
 * PARA 主干节点 → 二级标签节点 → 原子节点（元认知沉淀），
 * 力导向发散布局，支持拖拽 / 缩放 / 邻接高亮，连线表示归属。
 */
export default function KnowledgeGraphView({
  atoms,
  loading,
  error,
  total,
  onCreate,
  onReload,
}: {
  atoms: KnowledgeAtom[];
  loading: boolean;
  error: string;
  total: number;
  onCreate: () => void;
  onReload: () => void;
}) {
  const router = useRouter();
  // init / ResizeObserver / 卸载 dispose 由 useEChartsChart 统一安全托管
  const { wrapRef, chartRef } = useEChartsChart();
  /** 选中的节点（点击图谱节点后展示详情） */
  const [selected, setSelected] = useState<GraphNodeData | null>(null);

  /** 图谱数据聚合：PARA → 标签 → 原子 三层发散 */
  const { nodes, links } = useMemo<GraphData>(() => {
    const nodeMap = new Map<string, GraphNodeData>();
    const links: GraphLinkData[] = [];

    const ensurePara = (para: ParaCategory | "none") => {
      const id = `para:${para}`;
      if (nodeMap.has(id)) return nodeMap.get(id)!;
      const node: GraphNodeData = {
        id,
        name: para === "none" ? "未归类" : PARA_LABEL[para],
        kind: "para",
        count: 0,
        para,
        atomIds: [],
      };
      nodeMap.set(id, node);
      return node;
    };

    for (const a of atoms) {
      const para = a.paraCategory ?? ("none" as const);
      const paraNode = ensurePara(para);
      paraNode.count += 1;
      paraNode.atomIds!.push(a.id);
      const tags = a.tags ?? [];

      if (tags.length === 0) {
        // 无标签原子：直接挂 PARA 树干
        links.push({ source: paraNode.id, target: `atom:${a.id}` });
      } else {
        for (const t of tags) {
          const tagId = `tag:${para}:${t}`;
          let tagNode = nodeMap.get(tagId);
          if (!tagNode) {
            tagNode = {
              id: tagId,
              name: `#${t}`,
              kind: "tag",
              count: 0,
              para,
              atomIds: [],
            };
            nodeMap.set(tagId, tagNode);
            // PARA → 标签
            links.push({ source: paraNode.id, target: tagId });
          }
          tagNode.count += 1;
          tagNode.atomIds!.push(a.id);
          // 标签 → 原子（元认知沉淀）
          links.push({ source: tagId, target: `atom:${a.id}` });
        }
      }
      // 原子节点（第三层：用户沉淀的认知颗粒）
      nodeMap.set(`atom:${a.id}`, {
        id: `atom:${a.id}`,
        name: a.coreQuestion,
        kind: "atom",
        count: 1,
        para,
        atom: a,
      });
    }

    return { nodes: Array.from(nodeMap.values()), links };
  }, [atoms]);

  /** 构建 ECharts option（notMerge 全量重建时用） */
  const buildOption = (): EChartsCoreOption => {
    // 画布中心（PARA 主干钉在这里；初始布局以中心环形展开）
    const cw = wrapRef.current?.clientWidth ?? 800;
    const ch = wrapRef.current?.clientHeight ?? 600;
    const cx = cw / 2;
    const cy = ch / 2;
    const innerR = Math.min(cw, ch) * 0.22; // PARA 主干环（中心恒星系）
    const outerR = Math.min(cw, ch) * 0.42; // 标签/原子初始外环

    // PARA 节点按固定顺序在中心环上排列
    const paraOrder = nodes.filter((n) => n.kind === "para");
    const paraIdx = new Map(paraOrder.map((n, i) => [n.id, i]));

    const graphNodes = nodes.map((n, i) => {
      const isPara = n.kind === "para";
      const isTag = n.kind === "tag";
      const color =
        n.kind === "para"
          ? n.para === "none"
            ? NONE_HEX
            : PARA_HEX[n.para as ParaCategory]
          : n.kind === "tag"
            ? TAG_COLOR
            : ATOM_COLOR;
      // 恒星系初始布局：PARA 中心环；标签/原子按顺序绕外环
      let x = cx;
      let y = cy;
      // PARA 不固定：入场时中心区也参与力导向动画，靠 gravity 聚回中心
      if (isPara) {
        const idx = paraIdx.get(n.id) ?? 0;
        const angle = (idx / Math.max(paraOrder.length, 1)) * Math.PI * 2 - Math.PI / 2;
        x = cx + Math.cos(angle) * innerR;
        y = cy + Math.sin(angle) * innerR;
      } else {
        const angle = (i / Math.max(nodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
        x = cx + Math.cos(angle) * outerR;
        y = cy + Math.sin(angle) * outerR;
      }
      return {
        id: n.id,
        name: n.name,
        kind: n.kind,
        count: n.count,
        para: n.para,
        atom: n.atom,
        atomIds: n.atomIds,
        x,
        y,
        fixed: false,
        symbolSize: isPara
          ? 34 + Math.min(16, n.count)
          : isTag
            ? 13 + Math.min(9, n.count * 1.6)
            : 6,
        itemStyle: isPara
          ? {
              color,
              opacity: 1,
              // 白描边 + 同色光晕：PARA 主干如发光行星，与月白画布拉开层次
              borderColor: "#fff",
              borderWidth: 2.5,
              shadowBlur: 18,
              shadowColor: hexA(color, 0.35),
            }
          : isTag
            ? { color, opacity: 0.92 }
            : { color: ATOM_COLOR, opacity: 0.9, borderColor: "#fff", borderWidth: 1 },
        label: {
          show: n.kind !== "atom",
          fontSize: isPara ? 12 : 10,
          fontWeight: isPara ? 700 : 400,
          color: isPara ? "#1B2237" : "#56637D",
          formatter: n.name,
        },
        // 原子点悬停浮现截断标题：小点也要能"认出"，但不长驻刷屏
        emphasis:
          n.kind === "atom"
            ? {
                label: {
                  show: true,
                  fontSize: 11,
                  fontWeight: 600,
                  color: "#1B2237",
                  formatter: n.name.length > 15 ? `${n.name.slice(0, 15)}…` : n.name,
                },
              }
            : undefined,
      };
    });
    const graphLinks = links.map((l) => ({
      source: l.source,
      target: l.target,
      lineStyle: { width: 1, opacity: 0.5, color: "#C8D2E2" },
    }));

    return {
      tooltip: {
        trigger: "item",
        confine: true,
        // 延迟/过渡全部归零：卸载或 notMerge 重建瞬间不留任何待执行的 tooltip
        // 定时器/动画，杜绝实例销毁后内部回调空转（曾抛 "setTemplate" 空指针）
        showDelay: 0,
        hideDelay: 0,
        transitionDuration: 0,
        formatter: (params: unknown) => {
          const p = params as {
            dataType?: string;
            data?: GraphNodeData;
          };
          if (p.dataType !== "node" || !p.data) return "";
          const d = p.data;
          if (d.kind === "atom") {
            const a = d.atom;
            if (!a) return "";
            return `<div style="max-width:280px;line-height:1.5">
              <div style="font-weight:600;font-size:13px;color:#1B2237">${escapeHtml(a.coreQuestion)}</div>
              ${a.myViewpoint ? `<div style="margin-top:4px;font-size:12px;color:#3D4860">${escapeHtml(a.myViewpoint.slice(0, 90))}</div>` : ""}
              <div style="margin-top:4px;font-size:11px;color:#9BA8C0">点击查看详情</div>
            </div>`;
          }
          if (d.kind === "tag") {
            return `<div style="font-size:12px;color:#3D4860">${escapeHtml(d.name)} · ${d.count} 条原子<br/><span style="color:#9BA8C0">点击查看该分支下的认知沉淀</span></div>`;
          }
          return `<div style="font-weight:600;font-size:13px;color:#1B2237">${escapeHtml(d.name)}</div><div style="font-size:11px;color:#9BA8C0">${d.count} 条认知沉淀</div>`;
        },
      },
      series: [
        {
          type: "graph",
          layout: "force",
          roam: true,
          draggable: true,
          data: graphNodes,
          links: graphLinks,
          label: {
            show: true,
            position: "right",
            distance: 6,
          },
          itemStyle: {
            borderColor: "#fff",
            borderWidth: 1.5,
          },
          lineStyle: {
            color: "#C8D2E2",
            width: 1,
            opacity: 0.5,
          },
          emphasis: {
            // 悬停不淡化/隐藏其他节点（避免闪烁），仅对当前节点微放大区分
            focus: "none",
            scale: 1.15,
            label: {
              show: true,
              fontSize: 11,
              color: "#1B2237",
              fontWeight: 600,
            },
            lineStyle: { width: 2, opacity: 0.9 },
          },
          // 星球引力式布局：
          // - 数据项自带初始坐标（PARA 中心环，标签/原子绕外环展开）
          // - friction 为每步位移系数：0.5 → 入场温和偏快、快速收敛稳定
          //   （拖拽时 echarts 内部 warmUp 会重置为 friction×0.8 ≈ 0.4，位移更温和，
          //    松手后不会因弹簧力差巨大而猛弹，与入场节奏保持一致）
          // - repulsion 调小：拖拽松手时节点间距变小，斥力(rep/d²)不会剧烈反弹
          // - gravity 0.4 把 PARA 稳回中心，也让拖拽后更快回稳、减少长时摆动
          force: {
            repulsion: 130,
            edgeLength: [60, 150],
            gravity: 0.4,
            friction: 0.5,
            layoutAnimation: true,
          },
          animationDurationUpdate: 180,
          animationEasingUpdate: "cubicOut",
        },
      ],
    };
  };

  // 实例生命周期（init / ResizeObserver / 卸载安全 dispose）由 useEChartsChart 托管。
  // 这里只绑定业务事件：click 选中节点、dragend 后冻结布局。
  // 回调一律经 isAliveChart 校验，避免视图切换 / StrictMode 二次挂载时命中已销毁实例。
  useEffect(() => {
    const chart = chartRef.current;
    if (!isAliveChart(chart)) return;
    chart.on("click", (params) => {
      const p = params as { dataType?: string; data?: GraphNodeData };
      setSelected(p.dataType === "node" && p.data ? p.data : null);
    });
    // 拖拽松手后立即冻结全部节点坐标 + 关闭力导向布局，
    // 避免弹簧/斥力把节点再"拉回去"，让用户拖到哪就停在哪
    chart.on("dragend", () => {
      const c = chartRef.current;
      if (!isAliveChart(c)) return;
      const opt = c.getOption() as unknown as {
        series?: Array<{ data?: Array<{ id?: string; x?: number; y?: number }> }>;
      };
      const data = opt.series?.[0]?.data;
      if (!data || data.length === 0) return;
      c.setOption({
        // 关闭力导向布局的位移动画，避免松手后节点有回弹过渡
        animationDurationUpdate: 0,
        series: [
          {
            data: data.map((d) => ({ id: d.id, x: d.x, y: d.y, fixed: true })),
            // 关闭力导向布局：节点不再被边弹簧 / 中心引力影响
            layout: "none",
          },
        ],
      });
    });
    return () => {
      if (!isAliveChart(chart)) return;
      chart.off("click");
      chart.off("dragend");
    };
  }, []);

  // 数据变化 → 全量重建图谱
  useEffect(() => {
    const chart = chartRef.current;
    if (!isAliveChart(chart) || loading) return;
    // 重建前先摘掉显示中的 tooltip，避免 notMerge 销毁/重建组件期间 tooltip 状态穿越
    try {
      chart.dispatchAction({ type: "hideTip" });
    } catch {
      /* 忽略 */
    }
    chart.setOption(buildOption(), { notMerge: true });
  }, [nodes, links, loading]);

  /** 重新力导向布局 */
  const resetLayout = () => {
    const chart = chartRef.current;
    if (!isAliveChart(chart)) return;
    setSelected(null);
    try {
      chart.dispatchAction({ type: "hideTip" });
    } catch {
      /* 忽略 */
    }
    chart.setOption(buildOption(), { notMerge: true });
  };

  // 图例统计
  const stats = useMemo(() => {
    const paraCount = nodes.filter((n) => n.kind === "para").length;
    const tagCount = nodes.filter((n) => n.kind === "tag").length;
    const atomCount = nodes.filter((n) => n.kind === "atom").length;
    return { paraCount, tagCount, atomCount };
  }, [nodes]);

  return (
    <div className="flex h-full flex-col">
      {/* 图谱说明条 */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-mist-200/70 px-4 py-2 text-[11px] text-mist-500">
        <span className="inline-flex items-center gap-1.5 font-medium text-mist-700">
          <Network className="h-3.5 w-3.5 text-accent-500" />
          知识图谱
        </span>
        <span className="inline-flex items-center gap-1">
          <Dot color="#6366f1" /> PARA 主干
        </span>
        <span className="inline-flex items-center gap-1">
          <Dot color="#a855f7" /> 二级标签
        </span>
        <span className="inline-flex items-center gap-1">
          <Dot color={ATOM_COLOR} /> 认知原子（元认知沉淀）
        </span>
        <span className="ml-auto inline-flex items-center gap-2">
          <span>
            {stats.paraCount} 主干 · {stats.tagCount} 标签 · {stats.atomCount} 原子 /{" "}
            <span className="font-medium text-mist-700">{total}</span>
          </span>
          <button
            onClick={resetLayout}
            className="inline-flex items-center gap-1 rounded-md border border-mist-300 px-2 py-1 text-[11px] text-mist-600 transition hover:bg-mist-100"
          >
            <RotateCcw className="h-3 w-3" />
            重新布局
          </button>
        </span>
      </div>

      {/* 图谱画布：容器始终挂载，避免首屏 atoms 为空时 useEffect 已跑过、
          后续有数据时 chartRef 仍是 null 导致图谱不显示的问题。 */}
      <div className="relative min-h-0 flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 text-mist-500 backdrop-blur-sm">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 图谱生成中…
          </div>
        )}
        {error && atoms.length === 0 && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm">
            <button
              onClick={onReload}
              className="rounded-lg border border-mist-300 px-3 py-1.5 text-sm text-mist-600 hover:bg-mist-100"
            >
              加载失败，点击重试
            </button>
          </div>
        )}
        {!loading && atoms.length === 0 && !error && (
          <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-white/80 backdrop-blur-sm">
            <EmptyKnowledge compact onCreate={onCreate} />
          </div>
        )}
        {/* 月白画布上的极淡点阵：提示这是可探索的知识网络（canvas 透明，点阵自然透出） */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, rgba(200,210,226,0.3) 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
        <div ref={wrapRef} className="absolute inset-0" />
        {/* 选中节点详情面板 */}
        {selected && (
          <GraphDetailPanel
            node={selected}
            atoms={atoms}
            onClose={() => setSelected(null)}
            onOpenAtom={(id) => router.push(`/atoms/${id}`)}
          />
        )}
        {!selected && atoms.length > 0 && (
          <p className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap text-[11px] text-mist-400">
            拖拽节点调整布局 · 滚轮缩放 · 点击节点查看分支详情
          </p>
        )}
      </div>
    </div>
  );
}

/* ============ 子组件 ============ */

function Dot({ color }: { color: string }) {
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: color }} />;
}

/** 选中节点详情面板：PARA（标签 + 原子）/ 标签（原子列表）/ 原子（认知卡片） */
function GraphDetailPanel({
  node,
  atoms,
  onClose,
  onOpenAtom,
}: {
  node: GraphNodeData;
  atoms: KnowledgeAtom[];
  onClose: () => void;
  onOpenAtom: (id: string) => void;
}) {
  const nodeAtoms = useMemo(() => {
    if (node.kind === "atom") {
      return node.atom ? [node.atom] : [];
    }
    const ids = node.atomIds ?? [];
    const byId = new Map(atoms.map((a) => [a.id, a]));
    return ids.map((id) => byId.get(id)).filter((a): a is KnowledgeAtom => Boolean(a));
  }, [node, atoms]);

  return (
    <div className="absolute right-3 top-3 z-10 flex max-h-[70%] w-72 flex-col rounded-xl border border-mist-200 bg-white/95 shadow-xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-mist-200 px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Dot
            color={
              node.kind === "para"
                ? node.para === "none"
                  ? NONE_HEX
                  : PARA_HEX[node.para as ParaCategory]
                : node.kind === "tag"
                  ? TAG_COLOR
                  : ATOM_COLOR
            }
          />
          <span className="truncate text-sm font-semibold text-mist-900">
            {node.kind === "para"
              ? `${node.name} · ${node.count} 条`
              : node.name}
          </span>
        </div>
        <button
          onClick={onClose}
          className="ml-2 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-mist-500 hover:bg-mist-100"
          aria-label="关闭详情"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {node.kind === "atom" && node.atom ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold leading-snug text-mist-900">
              {node.atom.coreQuestion}
            </p>
            {node.atom.myViewpoint && (
              <p className="line-clamp-4 text-xs leading-relaxed text-mist-500">
                {node.atom.myViewpoint}
              </p>
            )}
            <div className="flex items-center gap-1.5">
              <PermissionBadge permission={node.atom.permission} />
              {(node.atom.tags ?? []).slice(0, 4).map((t) => (
                <span key={t} className="rounded bg-mist-100 px-1.5 py-0.5 text-[10px] text-mist-400">
                  #{t}
                </span>
              ))}
            </div>
            <button
              onClick={() => onOpenAtom(node.atom!.id)}
              className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-accent-600 py-2 text-xs font-medium text-white transition hover:bg-accent-700"
            >
              打开认知详情
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : node.kind === "tag" ? (
          <p className="mb-2 text-[11px] text-mist-400">
            该标签下的认知沉淀（{node.count} 条）
          </p>
        ) : (
          <p className="mb-2 text-[11px] text-mist-400">
            PARA 主干下的二级标签与认知沉淀（{node.count} 条）
          </p>
        )}
        {node.kind === "atom" && !node.atom && (
          <p className="text-xs text-mist-400">暂无内容</p>
        )}
        {nodeAtoms.length > 0 && node.kind !== "atom" && (
          <ul className="space-y-1.5">
            {nodeAtoms.slice(0, 20).map((a) => (
              <li key={a.id}>
                <button
                  onClick={() => onOpenAtom(a.id)}
                  className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-mist-700 transition hover:bg-mist-100"
                >
                  <span className="line-clamp-1 font-medium">{a.coreQuestion}</span>
                </button>
              </li>
            ))}
            {nodeAtoms.length > 20 && (
              <li className="px-2 py-1 text-[10px] text-mist-400">
                …还有 {nodeAtoms.length - 20} 条
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="h-3.5 w-3.5">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
