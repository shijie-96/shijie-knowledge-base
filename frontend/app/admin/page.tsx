import dynamic from "next/dynamic";

// 管理后台强依赖浏览器会话与 localStorage JWT，仅客户端渲染
const AdminPage = dynamic(() => import("@/components/admin/AdminPage"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-mist-50 dark:bg-space-950">
      <p className="text-sm text-mist-400">正在加载管理后台…</p>
    </div>
  ),
});

export default function AdminRoute() {
  return <AdminPage />;
}
