"use client";

import { useState } from "react";
import { extractError } from "@/lib/format";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { login, register } from "@/lib/api/auth";
import { saveTokens } from "@/lib/jwt";

export type AuthMode = "login" | "register";

export interface AuthFormProps {
  /** 打开时默认停留在哪个 tab（登录页 CTA 可直接带"注册"） */
  initialMode?: AuthMode;
  /** embedded：不渲染整页渐变背景，作为可嵌入弹层/区块的卡片使用 */
  embedded?: boolean;
}

const inputClass =
  "w-full rounded-lg border border-mist-300 bg-white px-3 py-2.5 text-sm text-mist-900 placeholder-mist-400 outline-none transition focus:border-accent-500 focus:ring-2 focus:ring-accent-500/30 dark:border-space-700 dark:bg-space-800 dark:text-mist-100";

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
        className={`${inputClass} pr-10`}
      />
      <button
        type="button"
        onClick={onToggleVisible}
        aria-label={visible ? "隐藏密码" : "显示密码"}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-mist-400 transition hover:text-mist-600 dark:text-mist-500 dark:hover:text-mist-300"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

export default function AuthForm({
  initialMode = "login",
  embedded = false,
}: AuthFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    setError("");
    setConfirm("");
  };

  const phoneValid = /^1[3-9]\d{9}$/.test(phone);
  const passwordValid = password.length >= 6 && password.length <= 64;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneValid) {
      setError("请输入正确的 11 位手机号");
      return;
    }
    if (!passwordValid) {
      setError("密码长度需为 6-64 位");
      return;
    }
    if (mode === "register" && !username.trim()) {
      setError("请输入用户名");
      return;
    }
    if (mode === "register" && password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const result =
        mode === "register"
          ? await register({
              phone,
              username: username.trim(),
              password,
            })
          : await login({ phone, password });
      saveTokens(result.token);
      // 主引擎入口：登录后进入工具台，认知闭环从"今天要消化什么"开始
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(extractError(err));
    } finally {
      setLoading(false);
    }
  };

  const body = (
    <>
      <div className="mb-7 flex flex-col items-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-accent-500 to-blue-600 text-xl font-bold text-white shadow-lg shadow-accent-500/25">
          识
        </div>
        <h1 className="text-[22px] font-bold text-mist-900 dark:text-mist-50">
          识界
        </h1>
        <p className="mt-1 text-[13px] text-mist-500 dark:text-mist-400">
          认知无界，成长无限
        </p>
      </div>

      <div className="rounded-2xl bg-white p-6 shadow-xl shadow-mist-200/60 ring-1 ring-mist-200 dark:bg-space-900 dark:shadow-none dark:ring-space-800">
        <div className="mb-6 grid grid-cols-2 rounded-xl bg-mist-100 p-1 dark:bg-space-800">
          <button
            type="button"
            onClick={() => switchMode("login")}
            className={`rounded-lg py-2 text-sm font-medium transition ${
              mode === "login"
                ? "bg-white text-accent-600 shadow dark:bg-space-900 dark:text-accent-400"
                : "text-mist-500 hover:text-mist-700 dark:text-mist-400"
            }`}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => switchMode("register")}
            className={`rounded-lg py-2 text-sm font-medium transition ${
              mode === "register"
                ? "bg-white text-accent-600 shadow dark:bg-space-900 dark:text-accent-400"
                : "text-mist-500 hover:text-mist-700 dark:text-mist-400"
            }`}
          >
            注册
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === "register" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-mist-700 dark:text-mist-300">
                用户名
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="给自己起个名字"
                className={inputClass}
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-mist-700 dark:text-mist-300">
              手机号
            </label>
            <input
              type="tel"
              inputMode="numeric"
              maxLength={11}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, ""))}
              placeholder="请输入 11 位手机号"
              className={inputClass}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-mist-700 dark:text-mist-300">
              密码
            </label>
            <PasswordInput
              value={password}
              onChange={setPassword}
              placeholder="至少 6 位密码"
              visible={showPassword}
              onToggleVisible={() => setShowPassword((v) => !v)}
            />
          </div>

          {mode === "register" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-mist-700 dark:text-mist-300">
                确认密码
              </label>
              <PasswordInput
                value={confirm}
                onChange={setConfirm}
                placeholder="再次输入密码"
                visible={showConfirm}
                onToggleVisible={() => setShowConfirm((v) => !v)}
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-500/10 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-gradient-to-r from-accent-500 to-blue-600 py-2.5 text-sm font-semibold text-white shadow-lg shadow-accent-500/25 transition hover:from-accent-600 hover:to-blue-700 disabled:opacity-60"
          >
            {loading
              ? mode === "register"
                ? "注册中…"
                : "登录中…"
              : mode === "register"
                ? "注册并登录"
                : "登录"}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-mist-500 dark:text-mist-400">
          {mode === "login" ? "还没有账号？" : "已有账号？"}
          <button
            type="button"
            onClick={() => switchMode(mode === "login" ? "register" : "login")}
            className="ml-1 font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400"
          >
            {mode === "login" ? "立即注册" : "直接登录"}
          </button>
        </p>
      </div>

      <p className="mt-5 text-center text-xs text-mist-400 dark:text-mist-500">
        登录即表示你同意平台的服务条款与隐私政策
      </p>
    </>
  );

  if (embedded) {
    // 弹层 / 区块形态：不带整页背景与垂直居中，宽度交给使用方容器
    return <div className="flex w-full flex-col items-center">{body}</div>;
  }

  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-gradient-to-b from-mist-50 to-mist-100 px-4 py-10 dark:from-space-950 dark:to-space-900">
      <div className="w-full max-w-sm">{body}</div>
    </div>
  );
}
