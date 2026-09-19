"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  BookMarked,
  Camera,
  ChevronRight,
  Heart,
  Loader2,
  LogOut,
  MessageSquareText,
  PenLine,
  Settings,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Wrench,
  X,
  XCircle,
} from "lucide-react";
import { getMe, updateMe, deleteMe, uploadAvatar } from "@/lib/api/user";
import { logout } from "@/lib/api/auth";
import { clearTokens } from "@/lib/jwt";
import { extractError } from "@/lib/format";
import ConfirmDialog from "@/components/ConfirmDialog";
import BackButton from "@/components/common/BackButton";
import RegionPicker from "@/components/profile/RegionPicker";
import type { UpdateMeParams, User } from "@/types";

type TintKey =
  | "rose"
  | "emerald"
  | "sky"
  | "cyan"
  | "violet"
  | "warn"
  | "accent"
  | "amber"
  | "slate"
  | "fuchsia";

const TINT_CLASS: Record<
  TintKey,
  {
    iconBg: string;
    iconText: string;
    glow: string;
    hoverBorder: string;
    hoverBg: string;
    pill: string;
  }
> = {
  rose: {
    iconBg: "bg-gradient-to-b from-rose-50 to-rose-100/70 dark:from-rose-400/15 dark:to-rose-400/5",
    iconText: "text-rose-600 dark:text-rose-300",
    glow: "bg-[radial-gradient(closest-side,rgba(244,63,94,0.18),transparent_72%)]",
    hoverBorder: "hover:border-rose-200 dark:hover:border-rose-400/30",
    hoverBg: "hover:bg-rose-50/60 dark:hover:bg-rose-500/[0.06]",
    pill: "bg-rose-500/10 text-rose-600 ring-rose-500/20 dark:bg-rose-400/15 dark:text-rose-300 dark:ring-rose-400/25",
  },
  emerald: {
    iconBg: "bg-gradient-to-b from-emerald-50 to-emerald-100/70 dark:from-emerald-400/15 dark:to-emerald-400/5",
    iconText: "text-emerald-600 dark:text-emerald-300",
    glow: "bg-[radial-gradient(closest-side,rgba(16,185,129,0.16),transparent_72%)]",
    hoverBorder: "hover:border-emerald-200 dark:hover:border-emerald-400/30",
    hoverBg: "hover:bg-emerald-50/60 dark:hover:bg-emerald-500/[0.06]",
    pill: "bg-emerald-500/10 text-emerald-600 ring-emerald-500/20 dark:bg-emerald-400/15 dark:text-emerald-300 dark:ring-emerald-400/25",
  },
  sky: {
    iconBg: "bg-gradient-to-b from-sky-50 to-sky-100/70 dark:from-sky-400/15 dark:to-sky-400/5",
    iconText: "text-sky-600 dark:text-sky-300",
    glow: "bg-[radial-gradient(closest-side,rgba(14,165,233,0.16),transparent_72%)]",
    hoverBorder: "hover:border-sky-200 dark:hover:border-sky-400/30",
    hoverBg: "hover:bg-sky-50/60 dark:hover:bg-sky-500/[0.06]",
    pill: "bg-sky-500/10 text-sky-600 ring-sky-500/20 dark:bg-sky-400/15 dark:text-sky-300 dark:ring-sky-400/25",
  },
  cyan: {
    iconBg: "bg-gradient-to-b from-cyan-50 to-cyan-100/70 dark:from-cyan-400/15 dark:to-cyan-400/5",
    iconText: "text-cyan-600 dark:text-cyan-300",
    glow: "bg-[radial-gradient(closest-side,rgba(6,182,241,0.16),transparent_72%)]",
    hoverBorder: "hover:border-cyan-200 dark:hover:border-cyan-400/30",
    hoverBg: "hover:bg-cyan-50/60 dark:hover:bg-cyan-500/[0.06]",
    pill: "bg-cyan-500/10 text-cyan-600 ring-cyan-500/20 dark:bg-cyan-400/15 dark:text-cyan-300 dark:ring-cyan-400/25",
  },
  violet: {
    iconBg: "bg-gradient-to-b from-violet-50 to-violet-100/70 dark:from-violet-400/15 dark:to-violet-400/5",
    iconText: "text-violet-600 dark:text-violet-300",
    glow: "bg-[radial-gradient(closest-side,rgba(139,92,246,0.16),transparent_72%)]",
    hoverBorder: "hover:border-violet-200 dark:hover:border-violet-400/30",
    hoverBg: "hover:bg-violet-50/60 dark:hover:bg-violet-500/[0.06]",
    pill: "bg-violet-500/10 text-violet-600 ring-violet-500/20 dark:bg-violet-400/15 dark:text-violet-300 dark:ring-violet-400/25",
  },
  fuchsia: {
    iconBg: "bg-gradient-to-b from-fuchsia-50 to-fuchsia-100/70 dark:from-fuchsia-400/15 dark:to-fuchsia-400/5",
    iconText: "text-fuchsia-600 dark:text-fuchsia-300",
    glow: "bg-[radial-gradient(closest-side,rgba(217,70,239,0.16),transparent_72%)]",
    hoverBorder: "hover:border-fuchsia-200 dark:hover:border-fuchsia-400/30",
    hoverBg: "hover:bg-fuchsia-50/60 dark:hover:bg-fuchsia-500/[0.06]",
    pill: "bg-fuchsia-500/10 text-fuchsia-600 ring-fuchsia-500/20 dark:bg-fuchsia-400/15 dark:text-fuchsia-300 dark:ring-fuchsia-400/25",
  },
  warn: {
    iconBg: "bg-gradient-to-b from-warn-50 to-warn-100/70 dark:from-warn-400/15 dark:to-warn-400/5",
    iconText: "text-warn-600 dark:text-warn-300",
    glow: "bg-[radial-gradient(closest-side,rgba(245,158,11,0.18),transparent_72%)]",
    hoverBorder: "hover:border-warn-200 dark:hover:border-warn-400/30",
    hoverBg: "hover:bg-warn-50/60 dark:hover:bg-warn-500/[0.06]",
    pill: "bg-warn-500/10 text-warn-600 ring-warn-500/20 dark:bg-warn-400/15 dark:text-warn-300 dark:ring-warn-400/25",
  },
  amber: {
    iconBg: "bg-gradient-to-b from-amber-50 to-amber-100/70 dark:from-amber-400/15 dark:to-amber-400/5",
    iconText: "text-amber-600 dark:text-amber-300",
    glow: "bg-[radial-gradient(closest-side,rgba(245,158,11,0.18),transparent_72%)]",
    hoverBorder: "hover:border-amber-200 dark:hover:border-amber-400/30",
    hoverBg: "hover:bg-amber-50/60 dark:hover:bg-amber-500/[0.06]",
    pill: "bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:bg-amber-400/15 dark:text-amber-300 dark:ring-amber-400/25",
  },
  accent: {
    iconBg: "bg-gradient-to-b from-accent-50 to-accent-100/70 dark:from-accent-400/15 dark:to-accent-400/5",
    iconText: "text-accent-600 dark:text-accent-300",
    glow: "bg-[radial-gradient(closest-side,rgb(var(--accent-500)/0.18),transparent_72%)]",
    hoverBorder: "hover:border-accent-200 dark:hover:border-accent-400/30",
    hoverBg: "hover:bg-accent-50/60 dark:hover:bg-accent-500/[0.06]",
    pill: "bg-accent-500/10 text-accent-600 ring-accent-500/20 dark:bg-accent-400/15 dark:text-accent-300 dark:ring-accent-400/25",
  },
  slate: {
    iconBg: "bg-gradient-to-b from-mist-50 to-mist-100/80 dark:from-space-700 dark:to-space-800",
    iconText: "text-mist-600 dark:text-mist-300",
    glow: "bg-[radial-gradient(closest-side,rgba(100,116,139,0.16),transparent_72%)]",
    hoverBorder: "hover:border-mist-200 dark:hover:border-space-600",
    hoverBg: "hover:bg-mist-50/80 dark:hover:bg-space-700/60",
    pill: "bg-mist-200/70 text-mist-700 ring-mist-200 dark:bg-space-700 dark:text-mist-200 dark:ring-space-600",
  },
};

interface FeatureEntry {
  label: string;
  href: string;
  icon: typeof Heart;
  desc: string;
  tint: TintKey;
  badge?: string;
}

const FEATURES: FeatureEntry[] = [
  { label: "我的收藏", href: "/profile/favorites", icon: Heart, desc: "收藏的知识原子", tint: "rose" },
  { label: "我的关注", href: "/profile/following", icon: UserPlus, desc: "关注的用户", tint: "emerald" },
  { label: "我的粉丝", href: "/profile/followers", icon: Users, desc: "关注你的用户", tint: "sky" },
  { label: "引用溯源", href: "/references", icon: BookMarked, desc: "引用关系全景", tint: "cyan" },
  { label: "名片装扮", href: "/profile/decoration", icon: BadgeCheck, desc: "公开主页装扮 · 全站外观设置", tint: "violet" },
  { label: "提问看板", href: "/profile/questions", icon: MessageSquareText, desc: "用户提问与回答", tint: "warn" },
  { label: "成长看板", href: "/dashboard/growth", icon: TrendingUp, desc: "客观行为数据", tint: "accent" },
  { label: "设置", href: "/profile/settings", icon: Settings, desc: "授权申请 · 全量导出", tint: "slate" },
];

export default function ProfileMePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [bio, setBio] = useState("");
  /** 认知沙盘定位：省市两级 */
  const [province, setProvince] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savedTip, setSavedTip] = useState("");
  const [error, setError] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [rewardZoom, setRewardZoom] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const me = await getMe();
        setUser(me.user);
        setNickname(me.user.nickname ?? "");
        setEmail(me.user.email ?? "");
        setBio(me.user.bio ?? "");
        setProvince(me.user.province ?? null);
        setCity(me.user.city ?? null);
      } catch {
        clearTokens();
        router.replace("/");
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  const handleSave = async () => {
    if (!user) return;
    setError("");
    setSavedTip("");

    const trimmedNickname = nickname.trim();
    if (!trimmedNickname) {
      setError("昵称不能为空");
      return;
    }
    const trimmedEmail = email.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError("邮箱格式不正确");
      return;
    }

    setSaving(true);
    const params: UpdateMeParams = {};
    if (trimmedNickname !== (user.nickname ?? "")) params.nickname = trimmedNickname;
    if (trimmedEmail !== (user.email ?? "")) params.email = trimmedEmail || null;
    if (bio.trim() !== (user.bio ?? "")) params.bio = bio.trim();
    // 未选省时城市一并清空，避免出现「只有市没有省」的脏数据
    const nextProvince = province ?? null;
    const nextCity = nextProvince ? (city ?? null) : null;
    if (nextProvince !== (user.province ?? null)) params.province = nextProvince;
    if (nextCity !== (user.city ?? null)) params.city = nextCity;
    try {
      if (Object.keys(params).length > 0) {
        const updated = await updateMe(params);
        setUser(updated);
      }
      setSavedTip("资料已保存");
      setTimeout(() => setSavedTip(""), 2000);
    } catch (e) {
      setError(extractError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // 重置 input value 以便同一张图也能再次触发
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setAvatarError("仅支持图片文件");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setAvatarError("图片不能超过 5MB");
      return;
    }
    setUploadingAvatar(true);
    setAvatarError("");
    try {
      const { url } = await uploadAvatar(file);
      setUser((prev) => (prev ? { ...prev, avatar: url } : prev));
      setSavedTip("头像已更新");
      setTimeout(() => setSavedTip(""), 2000);
    } catch (err) {
      setAvatarError(extractError(err));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
    } catch {
      /* 忽略登出接口异常 */
    }
    clearTokens();
    router.replace("/");
  };

  const handleDelete = async () => {
    if (!user) return;
    setConfirmDelete(false);
    try {
      await deleteMe();
      clearTokens();
      router.replace("/");
    } catch (e) {
      setError(extractError(e));
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-mist-50 dark:bg-space-950">
        <Loader2 className="h-6 w-6 animate-spin text-mist-400" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-mist-50 pb-24 dark:bg-space-950 md:pb-10">
      {/* 装饰背景：顶部 radial + 星点（与工作台同语言） */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 55% at 50% -10%, rgb(var(--accent-500) / 0.10) 0%, rgb(var(--warn-400) / 0.04) 50%, transparent 100%)",
          }}
        />
        <div
          className="absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "radial-gradient(rgb(var(--accent-500) / 0.12) 1px, transparent 1.5px)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      {/* 移动端返回按钮（桌面侧栏 GlobalNav 自带导航，桌面隐藏） */}
      <div className="fixed left-4 top-4 z-30 sm:left-6 sm:top-6 md:hidden">
        <BackButton fallback="/" title="返回首页" />
      </div>

      <div className="relative mx-auto w-full max-w-2xl px-4 py-6 md:max-w-5xl md:px-8 md:py-10">
        {/* 页面品牌头 */}
        <div className="mb-5 flex items-end justify-between gap-3 md:mb-7">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent-500 dark:text-accent-400">
              个人中心
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-mist-900 dark:text-mist-50 md:text-3xl">
              我的
            </h1>
          </div>
          <span className="rounded-full border border-mist-200/80 bg-white/80 px-3 py-1 text-[11px] font-medium text-mist-500 backdrop-blur dark:border-space-700 dark:bg-space-900/70 dark:text-mist-300">
            登录态 · 可编辑
          </span>
        </div>

        {/* ① 身份主卡 */}
        <section className="relative overflow-hidden rounded-3xl border border-mist-200/70 bg-white p-5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.12)] dark:border-space-700 dark:bg-space-900 md:col-span-2 md:p-7">
          {/* 顶部光轨 */}
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-6 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-accent-500/80 to-transparent dark:via-accent-300/70"
          />
          {/* 右上角柔光 */}
          <span
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-[radial-gradient(closest-side,rgb(var(--accent-500)/0.18),transparent_72%)] dark:bg-[radial-gradient(closest-side,rgb(var(--accent-400)/0.16),transparent_72%)]"
          />

          <div className="relative flex flex-wrap items-center gap-5">
            {/* 头像：光环+渐变+阴影，右下角常驻相机徽章 = 换头像入口 */}
            <div className="relative shrink-0">
              <span
                aria-hidden
                className="absolute inset-[-10px] rounded-full bg-[radial-gradient(closest-side,rgb(var(--accent-500)/0.22),transparent_72%)] dark:bg-[radial-gradient(closest-side,rgb(var(--accent-400)/0.18),transparent_72%)]"
              />
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                title="更换头像"
                aria-label="更换头像"
                className="group/avatar relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-accent-500 via-violet-500 to-cyan-500 text-2xl font-bold text-white shadow-[0_18px_36px_-14px_rgba(99,102,241,0.55)] ring-1 ring-white/30 transition hover:ring-white/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:opacity-70 dark:ring-white/10 md:h-[72px] md:w-[72px]"
              >
                {user?.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={user.avatar}
                    alt="头像"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  (user?.nickname?.trim()?.[0] ?? user?.phone?.[0] ?? "我").toUpperCase()
                )}

                {/* 悬停遮罩：相机图标 + 换头像 */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gradient-to-b from-mist-950/55 to-mist-950/80 text-[10px] font-medium text-white opacity-0 transition-opacity duration-200 group-hover/avatar:opacity-100"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="h-5 w-5 animate-spin" />
                  ) : (
                    <>
                      <Camera className="h-5 w-5" />
                      <span>换头像</span>
                    </>
                  )}
                </span>
              </button>

              {/* 常驻相机徽章（醒目入口） */}
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                disabled={uploadingAvatar}
                title="更换头像"
                aria-label="更换头像"
                className="absolute -bottom-1.5 -right-1.5 z-10 grid h-6 w-6 place-items-center rounded-full border-2 border-mist-50 bg-mist-900 text-mist-50 shadow-md transition hover:scale-110 hover:bg-accent-600 disabled:opacity-60 dark:border-mist-900 dark:bg-mist-50 dark:text-mist-900 dark:hover:bg-accent-400 md:h-7 md:w-7"
              >
                {uploadingAvatar ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin md:h-4 md:w-4" />
                ) : (
                  <Camera className="h-3.5 w-3.5 md:h-4 md:w-4" />
                )}
              </button>

              {/* 隐藏文件输入 */}
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={handleAvatarChange}
                className="hidden"
              />

              {avatarError && (
                <p className="absolute -bottom-5 left-0 max-w-[180px] truncate text-[11px] text-rose-500">
                  {avatarError}
                </p>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-bold tracking-tight text-mist-900 dark:text-mist-50 md:text-xl">
                  {user?.nickname?.trim() || "未设置昵称"}
                </h2>
              </div>
              <p className="mt-1 truncate text-xs tabular-nums text-mist-400 dark:text-mist-500">
                {user?.phone ?? ""}
              </p>
              <p className="mt-2 max-w-md truncate text-xs text-mist-500 dark:text-mist-400">
                {bio?.trim() || "还没有个人简介"}
              </p>
            </div>


          </div>

          {/* 身份主卡底部 KPI 行 */}
          <div className="relative mt-5 grid grid-cols-3 divide-x divide-mist-100 rounded-2xl bg-mist-50/70 px-2 py-3 text-center dark:divide-space-700 dark:bg-space-800/50 md:px-4">
            <div className="px-2">
              <p className="bg-gradient-to-b from-accent-600 to-violet-500 bg-clip-text font-metric text-lg font-bold leading-none tabular-nums text-transparent dark:from-accent-300 dark:to-violet-400">
                {user?.atomTotal ?? 0}
              </p>
              <p className="mt-1 text-[11px] font-medium text-mist-500 dark:text-mist-400">原子</p>
            </div>
            <div className="px-2">
              <p className="bg-gradient-to-b from-emerald-600 to-emerald-400 bg-clip-text font-metric text-lg font-bold leading-none tabular-nums text-transparent dark:from-emerald-300 dark:to-emerald-400">
                {user?.followerCount ?? 0}
              </p>
              <p className="mt-1 text-[11px] font-medium text-mist-500 dark:text-mist-400">粉丝</p>
            </div>
            <div className="px-2">
              <p className="bg-gradient-to-b from-amber-500 to-warn-400 bg-clip-text font-metric text-lg font-bold leading-none tabular-nums text-transparent dark:from-amber-300 dark:to-warn-300">
                {user?.followingCount ?? 0}
              </p>
              <p className="mt-1 text-[11px] font-medium text-mist-500 dark:text-mist-400">关注</p>
            </div>
          </div>
        </section>

        {/* 桌面双栏：左资料 / 右功能+账号 */}
        <div className="mt-4 space-y-4 md:mt-6 md:grid md:grid-cols-2 md:gap-5 md:space-y-0">
          {/* ② 个人资料（仪式感表单） */}
          <section className="relative overflow-hidden rounded-3xl border border-mist-200/70 bg-white p-5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.12)] dark:border-space-700 dark:bg-space-900 md:p-6">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-6 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent dark:via-cyan-300/50"
            />
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-cyan-50 to-cyan-100/70 text-cyan-600 ring-1 ring-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:from-cyan-400/15 dark:to-cyan-400/5 dark:text-cyan-300 dark:ring-cyan-400/20 dark:shadow-none">
                <Wrench className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-[15px] font-bold tracking-tight text-mist-900 dark:text-mist-100">
                  个人资料
                </h2>
                <p className="mt-0.5 text-xs text-mist-500 dark:text-mist-400">
                  昵称 / 邮箱 / 简介将用于公开名片展示
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              <Field
                label="昵称"
                value={nickname}
                onChange={setNickname}
                placeholder="输入昵称"
                maxLength={30}
                hint={`${nickname.length} / 30`}
                icon={<PenLine className="h-3.5 w-3.5" />}
              />
              <Field
                label="邮箱"
                value={email}
                onChange={setEmail}
                placeholder="选填，接收导出等通知"
                type="email"
                maxLength={80}
                hint={`${email.length} / 80`}
              />
              <Field
                label="简介"
                value={bio}
                onChange={setBio}
                placeholder="一句话介绍自己（将展示在公开名片）"
                multiline
                rows={3}
                maxLength={200}
                hint={`${bio.length} / 200`}
              />

              <RegionPicker
                province={province}
                city={city}
                onChange={(p, c) => {
                  setProvince(p);
                  setCity(c);
                }}
              />

              {error && (
                <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs font-medium text-red-500 ring-1 ring-inset ring-red-500/20 dark:text-red-400">
                  {error}
                </p>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={() => void handleSave()}
                  disabled={saving}
                  className="group inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-accent-500 via-accent-500 to-violet-600 py-3 text-sm font-bold text-white shadow-lg shadow-accent-500/25 transition hover:-translate-y-0.5 hover:shadow-xl hover:shadow-accent-500/30 active:scale-[0.99] disabled:opacity-60 dark:from-accent-500 dark:to-violet-500"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4 transition group-hover:rotate-12" />
                  )}
                  保存资料
                </button>
                {savedTip && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 ring-1 ring-inset ring-emerald-500/20 dark:text-emerald-300">
                    {savedTip}
                  </span>
                )}
              </div>

              {/* 赞赏支持：把微信赞赏码放在个人资料下方 */}
              <div className="mt-6 rounded-2xl border border-amber-200/60 bg-gradient-to-b from-amber-50/70 to-white p-4 text-center dark:border-amber-400/20 dark:from-amber-400/10 dark:to-space-900/40">
                <div className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  <Heart className="h-3.5 w-3.5 fill-current" />
                  喜欢识界？打赏支持一下
                </div>
                <button
                  type="button"
                  onClick={() => setRewardZoom(true)}
                  aria-label="查看赞赏码大图"
                  className="group mx-auto block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/reward-code.jpg"
                    alt="赞赏码"
                    className="h-44 w-44 rounded-xl object-contain ring-1 ring-mist-200 transition group-hover:scale-[1.03] group-hover:shadow-lg group-active:scale-100 dark:ring-space-700"
                  />
                </button>
                <p className="mt-2 text-[11px] text-mist-500 dark:text-mist-400">
                  页面略缩图有压缩，点击可查看清晰原图，微信扫码任意金额都是鼓励
                </p>
              </div>
            </div>
          </section>

          {/* 右列：功能网格 + 账号操作 */}
          <div className="space-y-4">
            {/* ③ 我的功能（10 主题卡） */}
            <section className="relative overflow-hidden rounded-3xl border border-mist-200/70 bg-white p-5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.12)] dark:border-space-700 dark:bg-space-900 md:p-6">
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-6 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-violet-400/80 to-transparent dark:via-violet-300/60"
              />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-violet-50 to-violet-100/70 text-violet-600 ring-1 ring-violet-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:from-violet-400/15 dark:to-violet-400/5 dark:text-violet-300 dark:ring-violet-400/20 dark:shadow-none">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-bold tracking-tight text-mist-900 dark:text-mist-100">
                    我的功能
                  </h2>
                  <p className="mt-0.5 text-xs text-mist-500 dark:text-mist-400">
                    个人专属入口 · {FEATURES.length} 个常用功能
                  </p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2 md:grid-cols-2 md:gap-2.5">
                {FEATURES.map((f) => {
                  const Icon = f.icon;
                  const t = TINT_CLASS[f.tint];
                  return (
                    <button
                      key={f.href}
                      onClick={() => router.push(f.href)}
                      className={`group/feat relative overflow-hidden rounded-2xl border border-mist-100 bg-white/70 px-2 py-3 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_28px_-16px_rgba(15,23,42,0.18)] active:scale-[0.98] dark:border-space-700/60 dark:bg-space-900/40 ${t.hoverBorder} ${t.hoverBg}`}
                    >
                      {/* 角光 */}
                      <span
                        aria-hidden
                        className={`pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full opacity-0 transition-opacity duration-300 group-hover/feat:opacity-100 ${t.glow}`}
                      />
                      <div className="relative flex flex-col items-start gap-2">
                        <div className="flex w-full items-center justify-between">
                          <div
                            className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 ring-inset ring-mist-200/70 transition-transform group-hover/feat:scale-110 dark:ring-space-600/50 ${t.iconBg}`}
                          >
                            <Icon className={`h-4 w-4 ${t.iconText}`} />
                          </div>
                          {f.badge && (
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1 ring-inset ${t.pill}`}
                            >
                              {f.badge}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-bold text-mist-900 dark:text-mist-100">
                            {f.label}
                          </p>
                          <p className="mt-0.5 line-clamp-1 text-[10px] leading-tight text-mist-400 dark:text-mist-500">
                            {f.desc}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ④ 账号操作（退出 / 注销 / 星图） */}
            <section className="relative overflow-hidden rounded-3xl border border-mist-200/70 bg-white p-5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.12)] dark:border-space-700 dark:bg-space-900 md:p-6">
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-6 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-rose-400/70 to-transparent"
              />
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-mist-50 to-mist-100 text-mist-500 ring-1 ring-mist-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:from-space-700 dark:to-space-800 dark:text-mist-300 dark:ring-space-600 dark:shadow-none">
                  <LogOut className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-[15px] font-bold tracking-tight text-mist-900 dark:text-mist-100">
                    账号
                  </h2>
                  <p className="mt-0.5 text-xs text-mist-500 dark:text-mist-400">
                    退出、注销或探索星图
                  </p>
                </div>
              </div>
              <div className="mt-5 space-y-2.5">
                <button
                  onClick={() => void handleLogout()}
                  className="group/logout flex w-full items-center justify-center gap-2 rounded-xl bg-mist-100/90 py-3 text-sm font-semibold text-mist-700 ring-1 ring-inset ring-mist-200 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md active:scale-[0.99] dark:bg-space-800 dark:text-mist-200 dark:ring-space-700 dark:hover:bg-space-700 dark:hover:shadow-none"
                >
                  <LogOut className="h-4 w-4 transition group-hover/logout:-translate-x-0.5" />
                  退出登录
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500/[0.06] py-2.5 text-xs font-semibold text-rose-500 ring-1 ring-inset ring-rose-500/15 transition hover:bg-rose-500/[0.12] hover:text-rose-600 active:scale-[0.99] dark:bg-rose-500/5 dark:text-rose-300 dark:ring-rose-400/20 dark:hover:bg-rose-500/10"
                >
                  <XCircle className="h-3.5 w-3.5" />
                  注销账号
                </button>
                <button
                  onClick={() => router.push("/starmap")}
                  className="group/link mx-auto flex items-center gap-1 pt-1 text-xs font-medium text-mist-400 transition hover:text-accent-500 dark:text-mist-500"
                >
                  去认知星图看看
                  <ChevronRight className="h-3 w-3 transition group-hover/link:translate-x-0.5" />
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="注销账号"
        message="注销账号将删除你的全部数据（素材、知识原子、引用关系等），且不可恢复。确定继续？"
        confirmText="注销"
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />

      {/* 赞赏码原图大图 */}
      {rewardZoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="赞赏码大图"
          onClick={() => setRewardZoom(false)}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
        >
          <button
            type="button"
            aria-label="关闭大图"
            onClick={() => setRewardZoom(false)}
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20 active:scale-95"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/reward-code.jpg"
            alt="赞赏码大图"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88vh] max-w-[94vw] rounded-2xl bg-white object-contain p-3 shadow-2xl"
          />
        </div>
      )}
    </div>
  );
}

/* —— 复用输入字段 —— */
interface FieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  hint?: string;
  icon?: React.ReactNode;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  multiline,
  rows = 3,
  maxLength,
  hint,
  icon,
}: FieldProps) {
  const baseInput =
    "w-full rounded-xl border border-mist-200 bg-white px-3 py-2.5 text-sm text-mist-900 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] outline-none transition placeholder:text-mist-400 focus:border-accent-500 focus:bg-white focus:ring-2 focus:ring-accent-500/20 dark:border-space-700 dark:bg-space-800 dark:text-mist-100 dark:placeholder:text-mist-500 dark:focus:border-accent-400 dark:focus:bg-space-800";
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-mist-600 dark:text-mist-300">
        <span className="inline-flex items-center gap-1">
          {icon && <span className="text-accent-500 dark:text-accent-400">{icon}</span>}
          {label}
        </span>
        {hint && (
          <span className="font-metric text-[10px] tabular-nums text-mist-400 dark:text-mist-500">
            {hint}
          </span>
        )}
      </span>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          className={`${baseInput} resize-none`}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          type={type}
          maxLength={maxLength}
          placeholder={placeholder}
          className={baseInput}
        />
      )}
    </label>
  );
}