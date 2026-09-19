import dynamic from "next/dynamic";

// ECharts 依赖浏览器环境，仅客户端渲染
const GrowthDashboard = dynamic(
  () => import("@/components/dashboard/GrowthDashboard"),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-screen items-center justify-center bg-mist-50 dark:bg-space-950">
        <p className="text-sm text-mist-400">正在加载成长看板…</p>
      </div>
    ),
  },
);

export default function GrowthPage() {
  return <GrowthDashboard />;
}
