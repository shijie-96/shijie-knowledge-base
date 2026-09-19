"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { changePassword } from "@/lib/api/user";
import { clearTokens } from "@/lib/jwt";
import { extractError, isAuthError } from "@/lib/format";

const inputClass =
  "w-full rounded-xl border border-mist-300 bg-white px-3.5 py-2.5 text-sm text-mist-900 placeholder-mist-400 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 dark:border-space-700 dark:bg-space-800 dark:text-mist-100";

/** 密码输入框（自带可见性切换） */
function PasswordInput({
  value,
  onChange,
  placeholder,
  visible,
  onToggleVisible,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  visible: boolean;
  onToggleVisible: () => void;
}) {
  return (
    <div className="relative">
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputClass} pr-11`}
      />
      <button
        type="button"
        onClick={onToggleVisible}
        aria-label={visible ? "隐藏密码" : "显示密码"}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-mist-400 transition hover:text-mist-600 dark:text-mist-500 dark:hover:text-mist-300"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/**
 * 修改密码卡片（设置页 → 账号安全）
 *
 * 需输入当前密码校验身份后，方可设置新密码（6-64 位）。
 * 老账号曾使用默认密码登录，同样以默认密码作为“当前密码”完成首次改密。
 */
export default function ChangePasswordCard() {
  const router = useRouter();
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setOldPassword("");
    setNewPassword("");
    setConfirm("");
    setShowOld(false);
    setShowNew(false);
    setShowConfirm(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!oldPassword) {
      setError("请输入当前密码");
      return;
    }
    if (newPassword.length < 6 || newPassword.length > 64) {
      setError("新密码长度需在 6-64 位之间");
      return;
    }
    if (newPassword !== confirm) {
      setError("两次输入的新密码不一致");
      return;
    }
    setLoading(true);
    try {
      await changePassword({ oldPassword, newPassword });
      resetForm();
      setSuccess("密码已更新，下次登录请使用新密码");
    } catch (err: unknown) {
      if (isAuthError(err)) {
        // token 失效：回到登录页重新登录
        clearTokens();
        router.replace("/");
        return;
      }
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-mist-200/70 bg-white p-5 shadow-[0_18px_40px_-24px_rgba(15,23,42,0.12)] dark:border-space-700 dark:bg-space-900 md:p-6">
      {/* 顶部光轨 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-[3px] rounded-full bg-gradient-to-r from-transparent via-accent-400/80 to-transparent dark:via-accent-300/60"
      />
      {/* 右上柔光 */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-[radial-gradient(closest-side,rgba(139,92,246,0.12),transparent_72%)]"
      />

      <div className="relative flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-b from-accent-50 to-accent-100/70 text-accent-600 ring-1 ring-accent-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] dark:from-accent-400/15 dark:to-accent-400/5 dark:text-accent-300 dark:ring-accent-400/20 dark:shadow-none">
          <KeyRound className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold tracking-tight text-mist-900 dark:text-mist-100">
            修改密码
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-mist-500 dark:text-mist-400">
            定期更换密码有助于保护账号安全。修改成功后，下次登录请使用新密码。
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="relative mt-5 space-y-3.5">
        <div>
          <label className="mb-1 block text-sm font-medium text-mist-700 dark:text-mist-300">
            当前密码
          </label>
          <PasswordInput
            value={oldPassword}
            onChange={setOldPassword}
            placeholder="请输入当前登录密码"
            visible={showOld}
            onToggleVisible={() => setShowOld((v) => !v)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-mist-700 dark:text-mist-300">
            新密码
          </label>
          <PasswordInput
            value={newPassword}
            onChange={setNewPassword}
            placeholder="至少 6 位新密码"
            visible={showNew}
            onToggleVisible={() => setShowNew((v) => !v)}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-mist-700 dark:text-mist-300">
            确认新密码
          </label>
          <PasswordInput
            value={confirm}
            onChange={setConfirm}
            placeholder="再次输入新密码"
            visible={showConfirm}
            onToggleVisible={() => setShowConfirm((v) => !v)}
          />
        </div>

        {error && (
          <p className="rounded-xl bg-rose-500/[0.06] px-3.5 py-2.5 text-sm text-rose-500 ring-1 ring-rose-500/15 dark:text-rose-300">
            {error}
          </p>
        )}
        {success && (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-500/[0.07] px-3.5 py-2.5 text-sm text-emerald-600 ring-1 ring-emerald-500/15 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent-500 to-blue-600 py-3 text-sm font-bold text-white shadow-md shadow-accent-500/20 transition hover:-translate-y-0.5 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          更新密码
        </button>
      </form>
    </div>
  );
}
