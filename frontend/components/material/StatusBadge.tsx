"use client";

import type { MaterialStatus } from "@/types";

const STATUS_CONFIG: Record<
  MaterialStatus,
  { label: string; className: string }
> = {
  pending: {
    label: "待消化",
    className: "bg-warn-100 text-warn-800 ring-warn-300 dark:bg-warn-500/15 dark:text-warn-300 dark:ring-warn-500/30",
  },
  digesting: {
    label: "消化中",
    className: "bg-blue-100 text-blue-800 ring-blue-300 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30",
  },
  digested: {
    label: "已消化",
    className: "bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  },
  archived: {
    label: "已归档",
    className: "bg-mist-200 text-mist-700 ring-mist-300 dark:bg-space-500/15 dark:text-mist-300 dark:ring-space-500/30",
  },
};

/** 素材状态角标（待消化=黄 / 消化中=蓝 / 已消化=绿） */
export default function StatusBadge({ status }: { status: MaterialStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${cfg.className}`}
    >
      {cfg.label}
    </span>
  );
}
