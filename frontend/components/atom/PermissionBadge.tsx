import { Globe, Lock, Users } from "lucide-react";
import type { AtomPermission } from "@/types";

const PERMISSION_CONFIG: Record<
  AtomPermission,
  { label: string; icon: typeof Lock; className: string }
> = {
  public: {
    label: "公开",
    icon: Globe,
    className: "bg-emerald-500/15 text-emerald-400 ring-emerald-500/30",
  },
  private: {
    label: "私有",
    icon: Lock,
    className: "bg-mist-500/15 text-mist-500 ring-mist-400/40",
  },
  authorized: {
    label: "授权",
    icon: Users,
    className: "bg-warn-500/15 text-warn-400 ring-warn-500/30",
  },
};

/** 权限标签：公开（绿）/ 私有（灰）/ 授权（黄） */
export default function PermissionBadge({ permission }: { permission: AtomPermission }) {
  const cfg = PERMISSION_CONFIG[permission] ?? PERMISSION_CONFIG.private;
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${cfg.className}`}
    >
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}
