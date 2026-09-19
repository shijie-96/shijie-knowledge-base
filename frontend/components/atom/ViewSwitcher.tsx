"use client";

import { ListTree, Network } from "lucide-react";

/** 知识库两档视图：图谱（发散可视化）/ 知识树（浏览复盘） */
export type KnowledgeView = "graph" | "tree";

const VIEWS: {
  value: KnowledgeView;
  label: string;
  icon: typeof Network;
}[] = [
  { value: "graph", label: "图谱", icon: Network },
  { value: "tree", label: "树", icon: ListTree },
];

/**
 * 两档视图切换（统一滑块走法：≤150ms 缓出）
 * 高亮滑块用等分宽度 + translateX 位移，两档在任何宽度下对齐。
 */
export default function ViewSwitcher({
  value,
  onChange,
}: {
  value: KnowledgeView;
  onChange: (v: KnowledgeView) => void;
}) {
  const activeIdx = Math.max(
    0,
    VIEWS.findIndex((v) => v.value === value),
  );
  return (
    <div
      role="group"
      aria-label="视图切换"
      className="relative flex items-center rounded-xl border border-mist-300 bg-mist-50 p-1 shadow-sm"
    >
      {/* 高亮滑块 */}
      <span
        aria-hidden
        className="absolute bottom-1 left-1 top-1 w-[calc((100%-8px)/2)] rounded-lg bg-accent-600 shadow-[0_2px_8px_rgba(79,70,229,0.35)] transition-transform duration-150 ease-out"
        style={{ transform: `translateX(${activeIdx * 100}%)` }}
      />
      {VIEWS.map((v) => {
        const Icon = v.icon;
        const active = v.value === value;
        return (
          <button
            key={v.value}
            onClick={() => onChange(v.value)}
            title={`切换到${v.label}视图`}
            aria-pressed={active}
            className={`relative z-10 inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold transition-colors duration-150 ${
              active
                ? "text-white"
                : "text-mist-700 hover:bg-mist-100 hover:text-mist-900"
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{v.label}</span>
          </button>
        );
      })}
    </div>
  );
}
