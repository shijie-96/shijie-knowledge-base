import type { Metadata } from "next";
import CognitiveStarMap from "@/components/decoration/CognitiveStarMap";
import BackButton from "@/components/common/BackButton";

export const metadata: Metadata = {
  title: "认知星图",
  description: "我的认知星图：仅本人显示装扮光效，其他用户保持默认外观",
};

export default function StarMapPage() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 pb-24 dark:bg-slate-950 md:pb-10 md:px-8 md:py-8">
      {/* 顶部固定返回按钮 */}
      <div className="fixed left-4 top-4 z-30 sm:left-6 sm:top-6">
        <BackButton fallback="/profile/me" title="返回我的主页" />
      </div>
      <div className="mx-auto w-full max-w-3xl pt-12 md:max-w-5xl md:pt-14">
        <h1 className="text-2xl font-bold">认知星图</h1>
        <p className="mt-1 text-sm text-slate-400">
          自己 + 关注的人 + 粉丝的认知光点分布
        </p>
        <div className="mt-6">
          <CognitiveStarMap />
        </div>
      </div>
    </div>
  );
}
