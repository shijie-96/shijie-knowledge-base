"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import * as echarts from "echarts/core";
import { GraphChart } from "echarts/charts";
import { TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { Network, RotateCcw } from "lucide-react";
import { PARA_LABEL } from "@/lib/para";
import type { PublicAtom, ParaCategory } from "@/types";
import { isAliveChart, useEChartsChart } from "@/hooks/useEChartsChart";

// Register required ECharts modules
echarts.use([GraphChart, TooltipComponent, CanvasRenderer]);

const PARA_HEX: Record<ParaCategory, string> = {
  projects: "#818cf8",
  areas: "#38bdf8",
  resources: "#a78bfa",
  archives: "#94a3b8",
  skills: "#34d399",
};

const TAG_COLOR = "#c084fc";
const NONE_HEX = "#94a3b8";

type NodeKind = "para" | "tag" | "atom";

interface GraphNodeData {
  id: string;
  name: string;
  kind: NodeKind;
  count: number;
  para?: ParaCategory | "none";
  atom?: PublicAtom;
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

interface Props {
  atoms: PublicAtom[];
  profileColor?: string;
}

/**
 * 公开认知图谱：基于该用户的公开知识原子，生成 PARA → 标签 → 原子 力导向图谱。
 * 面板与画布配色跟随系统明暗主题。
 */
export default function PublicKnowledgeGraph({
  atoms,
  profileColor = "#818cf8",
}: Props) {
  const router = useRouter();
  // init / ResizeObserver / 卸载 dispose 由 useEChartsChart 统一安全托管
  const { wrapRef, chartRef } = useEChartsChart();
  const [empty, setEmpty] = useState(atoms.length === 0);
  /** 跟随系统明暗（<html> 上的 .dark class），驱动 ECharts 画布配色 */
  const [isDark, setIsDark] = useState(
    typeof document !== "undefined"
      ? document.documentElement.classList.contains("dark")
      : false,
  );

  useEffect(() => {
    const sync = () =>
      setIsDark(document.documentElement.classList.contains("dark"));
    const mo = new MutationObserver(sync);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener("change", sync);
    return () => {
      mo.disconnect();
      mq?.removeEventListener("change", sync);
    };
  }, []);

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
            links.push({ source: paraNode.id, target: tagId });
          }
          tagNode.count += 1;
          tagNode.atomIds!.push(a.id);
          links.push({ source: tagId, target: `atom:${a.id}` });
        }
      }

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

  const buildOption = useMemo<EChartsCoreOption>(() => {
    const cw = wrapRef.current?.clientWidth ?? 800;
    const ch = wrapRef.current?.clientHeight ?? 320;
    const cx = cw / 2;
    const cy = ch / 2;
    const innerR = Math.min(cw, ch) * 0.22;
    const outerR = Math.min(cw, ch) * 0.42;

    // 明暗双配色：浅色底深字 / 深色底浅字，其余语义色保持不变
    const c = isDark
      ? {
          nodeBorder: "#0f172a",
          linkColor: "#475569",
          labelStrong: "#f1f5f9",
          label: "#cbd5e1",
          labelEmph: "#f8fafc",
          tooltipBg: "rgba(15, 23, 42, 0.92)",
          tooltipBorder: "#334155",
          tooltipText: "#e2e8f0",
          tooltipSub: "#94a3b8",
        }
      : {
          nodeBorder: "#ffffff",
          linkColor: "#cbd5e1",
          labelStrong: "#1e293b",
          label: "#64748b",
          labelEmph: "#0f172a",
          tooltipBg: "rgba(255, 255, 255, 0.96)",
          tooltipBorder: "#e2e8f0",
          tooltipText: "#0f172a",
          tooltipSub: "#64748b",
        };

    const paraOrder = nodes.filter((n) => n.kind === "para");
    const paraIdx = new Map(paraOrder.map((n, i) => [n.id, i]));

    const graphNodes = nodes.map((n, i) => {
      const isPara = n.kind === "para";
      const isTag = n.kind === "tag";
      const color = isPara
        ? n.para === "none"
          ? NONE_HEX
          : PARA_HEX[n.para as ParaCategory]
        : isTag
          ? TAG_COLOR
          : profileColor;

      let x = cx;
      let y = cy;
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
        itemStyle: {
          color,
          opacity: 1,
          borderColor: c.nodeBorder,
          borderWidth: 2,
          shadowBlur: isPara ? 16 : 0,
          shadowColor: isPara ? `${color}66` : "transparent",
        },
        label: {
          show: n.kind !== "atom",
          fontSize: isPara ? 12 : 10,
          fontWeight: isPara ? 700 : 400,
          color: isPara ? c.labelStrong : c.label,
          formatter: n.name,
        },
        emphasis:
          n.kind === "atom"
            ? {
                label: {
                  show: true,
                  fontSize: 11,
                  fontWeight: 600,
                  color: c.labelEmph,
                  formatter: n.name.length > 15 ? `${n.name.slice(0, 15)}…` : n.name,
                },
              }
            : undefined,
      };
    });

    const graphLinks = links.map((l) => ({
      source: l.source,
      target: l.target,
      lineStyle: { width: 1, opacity: 0.35, color: c.linkColor },
    }));

    return {
      tooltip: {
        trigger: "item",
        confine: true,
        // 延迟/过渡全部归零：卸载或 notMerge 重建瞬间不留待执行的 tooltip
        // 定时器/动画，杜绝实例销毁后内部回调空转报错
        showDelay: 0,
        hideDelay: 0,
        transitionDuration: 0,
        backgroundColor: c.tooltipBg,
        borderColor: c.tooltipBorder,
        textStyle: { color: c.tooltipText },
        formatter: (params: unknown) => {
          const p = params as { dataType?: string; data?: GraphNodeData };
          if (p.dataType !== "node" || !p.data) return "";
          const d = p.data;
          if (d.kind === "atom" && d.atom) {
            return `<div style="max-width:260px;line-height:1.5">
              <div style="font-weight:600;font-size:13px;color:${c.tooltipText}">${escapeHtml(d.atom.coreQuestion)}</div>
              ${d.atom.myViewpoint ? `<div style="margin-top:4px;font-size:12px;color:${c.tooltipSub}">${escapeHtml(d.atom.myViewpoint.slice(0, 90))}</div>` : ""}
              <div style="margin-top:4px;font-size:11px;color:${c.tooltipSub}">点击查看详情</div>
            </div>`;
          }
          if (d.kind === "tag") {
            return `<div style="font-size:12px;color:${c.tooltipText}">${escapeHtml(d.name)} · ${d.count} 条原子</div>`;
          }
          return `<div style="font-weight:600;font-size:13px;color:${c.tooltipText}">${escapeHtml(d.name)}</div><div style="font-size:11px;color:${c.tooltipSub}">${d.count} 条认知沉淀</div>`;
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
          label: { show: true, position: "right", distance: 6, color: c.label },
          itemStyle: { borderColor: c.nodeBorder, borderWidth: 1.5 },
          lineStyle: { color: c.linkColor, width: 1, opacity: 0.35 },
          emphasis: {
            focus: "none",
            scale: 1.15,
            label: { show: true, fontSize: 11, color: c.labelEmph, fontWeight: 600 },
            lineStyle: { width: 2, opacity: 0.7 },
          },
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
  }, [nodes, links, profileColor, isDark]);

  // 实例生命周期（init / ResizeObserver / 卸载安全 dispose）由 useEChartsChart 托管，
  // 这里只绑定业务事件；回调经 isAliveChart 校验，避免主题切换/路由时命中已销毁实例。
  useEffect(() => {
    const chart = chartRef.current;
    if (!isAliveChart(chart)) return;
    chart.on("click", (params) => {
      const p = params as { dataType?: string; data?: GraphNodeData };
      if (p.dataType === "node" && p.data?.kind === "atom" && p.data.atom) {
        router.push(`/atoms/${p.data.atom.id}`);
      }
    });
    return () => {
      if (!isAliveChart(chart)) return;
      chart.off("click");
    };
  }, [router]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!isAliveChart(chart)) return;
    if (atoms.length === 0) {
      setEmpty(true);
      try {
        chart.dispatchAction({ type: "hideTip" });
      } catch {
        /* 忽略 */
      }
      chart.clear();
      return;
    }
    setEmpty(false);
    // 重建前先摘掉显示中的 tooltip，避免 notMerge 重建期间 tooltip 状态穿越
    try {
      chart.dispatchAction({ type: "hideTip" });
    } catch {
      /* 忽略 */
    }
    chart.setOption(buildOption, { notMerge: true });
  }, [atoms, buildOption]);

  const resetLayout = () => {
    const chart = chartRef.current;
    if (!isAliveChart(chart)) return;
    try {
      chart.dispatchAction({ type: "hideTip" });
    } catch {
      /* 忽略 */
    }
    chart.setOption(buildOption, { notMerge: true });
  };

  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-mist-200 dark:bg-mist-900/50 dark:ring-mist-800">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-mist-800 dark:text-mist-200">
          <Network className="h-4 w-4 text-accent-600 dark:text-accent-400" />
          认知图谱
        </span>
        <button
          onClick={resetLayout}
          className="inline-flex items-center gap-1 rounded-md border border-mist-300 px-2 py-1 text-[11px] text-mist-600 transition hover:bg-mist-100 dark:border-mist-700 dark:text-mist-300 dark:hover:bg-mist-800"
        >
          <RotateCcw className="h-3 w-3" />
          重新布局
        </button>
      </div>
      <div className="relative mt-3 h-80 w-full">
        {/* 画布容器始终挂载：空数据 → 有数据时若移除/重建容器，ECharts 实例会错过
            初始化时机或与 DOM 分离，导致图谱不显示（同款问题在知识库图谱修过一次） */}
        <div ref={wrapRef} className="absolute inset-0" />
        {empty && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-white/80 text-xs text-mist-500 dark:bg-mist-900/80 dark:text-mist-400">
            暂无公开认知资产
          </div>
        )}
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
