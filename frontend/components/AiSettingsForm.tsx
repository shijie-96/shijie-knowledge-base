"use client";

import { useEffect, useRef, useState } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  KeyRound,
  Loader2,
  RefreshCw,
  Server,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useAiConfig } from "@/hooks/useAiConfig";

/** 表单通用样式（供文件内小组件复用） */
const inputCls =
  "w-full rounded-lg border border-mist-200 bg-white px-3 py-2 text-sm text-mist-800 placeholder:text-mist-300 focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-100";
const labelCls = "mb-1 flex items-center gap-1.5 text-xs font-medium text-mist-600";

interface AiSettingsFormProps {
  /** 弹窗模式：传入则显示标题栏与关闭按钮 */
  onClose?: () => void;
  /** 保存成功后回调 */
  onSaved?: () => void;
}

/** 预设服务商：选中后自动带出接口地址与模型候选，用户只需填 API Key */
interface ProviderPreset {
  id: string;
  name: string;
  baseUrl: string;
  /** 模型候选项（默认取第一项自动填入） */
  models: string[];
  /** 匹配特征：用于识别已保存配置属于哪个服务商 */
  match: string[];
  /** 官方曾弃用的模型名 → 新模型名：加载旧配置时自动迁移 */
  legacy?: Record<string, string>;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    // 2026-07 发布 GPT-5.6 三档：sol 旗舰 / terra 均衡 / luna 轻量；
    // 旧 5.x（gpt-5/gpt-5-mini…）及 gpt-4o 系列调用旧 model 会自动迁移到对应档位
    models: ["gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.6-sol"],
    match: ["api.openai.com"],
    legacy: {
      "gpt-5": "gpt-5.6-terra",
      "gpt-5-mini": "gpt-5.6-luna",
      "gpt-5-nano": "gpt-5.6-luna",
      "gpt-4o": "gpt-5.6-terra",
      "gpt-4o-mini": "gpt-5.6-luna",
      "o3-mini": "gpt-5.6-luna",
    },
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    // 官方推荐直接填 https://api.deepseek.com（OpenAI 兼容，v1 写法二者皆可，这里不带 /v1）
    baseUrl: "https://api.deepseek.com",
    // 官方已弃用 deepseek-chat / deepseek-reasoner，当前按 V4 双版本命名：
    // flash（轻量快）+ pro（旗舰深度推理），另有视觉实验版
    models: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-v4-flash-vision-exp"],
    match: ["api.deepseek.com"],
    legacy: {
      "deepseek-chat": "deepseek-v4-flash",
      "deepseek-reasoner": "deepseek-v4-pro",
    },
  },
  {
    id: "dashscope",
    name: "阿里云通义千问",
    // OpenAI 兼容地址；官方业务空间专属域名形如
    // https://{业务空间ID}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1，可按需替换
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    // 官方模型目录（2026-09 版）当前文本生成主推 qwen3.8 系列：
    // flash 高性价比 / max 旗舰 / 3.7-plus 上一代均衡档
    models: ["qwen3.8-flash", "qwen3.8-max", "qwen3.7-plus"],
    match: ["dashscope.aliyuncs.com", "maas.aliyuncs.com"],
  },
  {
    id: "moonshot",
    name: "Kimi（Moonshot）",
    baseUrl: "https://api.moonshot.cn/v1",
    // 官方模型列表：kimi-k3 旗舰（2.8T / 1M ctx，默认推荐）；
    // kimi-k2.5 与 moonshot-v1 系列已于 2026-08-31 下线
    models: ["kimi-k3", "kimi-k2.6", "kimi-k2.7-code", "kimi-k2.7-code-highspeed"],
    match: ["api.moonshot.cn", "api.moonshot.ai"],
    legacy: {
      "kimi-k2-0711-preview": "kimi-k3",
      "kimi-k2-turbo-preview": "kimi-k3",
      "kimi-k2.5": "kimi-k3",
      "kimi-latest": "kimi-k3",
      "moonshot-v1-8k": "kimi-k3",
      "moonshot-v1-32k": "kimi-k3",
      "moonshot-v1-128k": "kimi-k3",
    },
  },
  {
    id: "zhipu",
    name: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    // 文本模型（2026-08 最新）：glm-5.3-flash 高性价比 / glm-5.3 旗舰(1M ctx)；
    // glm-4.7-flash 仍免费，glm-4.5-air 轻量档
    models: [
      "glm-5.3-flash",
      "glm-5.3",
      "glm-5.2",
      "glm-4.7-flash",
      "glm-4.7",
      "glm-4.5-air",
    ],
    match: ["bigmodel.cn"],
    legacy: {
      "glm-4.5": "glm-4.7",
      "glm-4-plus": "glm-5.2",
      "glm-4-air": "glm-4.7-flash",
      "glm-4-flash": "glm-4.7-flash",
    },
  },
  {
    id: "volcengine",
    name: "火山方舟（豆包）",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    // 2026-06 发布的 Doubao-Seed-2.1 系列仅 Pro / Turbo 两档（版本号 260628）；
    // 其余型号需到方舟控制台「模型广场」查自己已开通的模型 ID
    models: ["doubao-seed-2-1-pro-260628", "doubao-seed-2-1-turbo-260628"],
    match: ["volces.com", "volcengine"],
  },
  {
    id: "siliconflow",
    name: "硅基流动 SiliconFlow",
    baseUrl: "https://api.siliconflow.cn/v1",
    // 平台托管开源模型，id 统一为「组织/模型」；DeepSeek-V3 为主力高性价比模型
    models: [
      "deepseek-ai/DeepSeek-V3",
      "deepseek-ai/DeepSeek-R1",
      "Qwen/Qwen3-235B-A22B",
      "Qwen/Qwen2.5-72B-Instruct",
    ],
    match: ["siliconflow.cn"],
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    // LPU 高速推理；免费层主力为 Llama 3.3 70B / Llama 4 Scout 等
    models: [
      "llama-3.3-70b-versatile",
      "llama-4-scout-17b-16e-instruct",
      "llama-4-maverick-17b-128e-instruct",
      "deepseek-r1-distill-llama-70b",
    ],
    match: ["api.groq.com"],
    legacy: {
      "llama-3.1-8b-instant": "llama-4-scout-17b-16e-instruct",
    },
  },
];

/** 根据接口地址识别已保存配置属于哪个预设服务商 */
function detectProvider(baseUrl: string): string | null {
  const u = baseUrl.toLowerCase();
  const hit = PROVIDER_PRESETS.find((p) => p.match.some((m) => u.includes(m)));
  return hit?.id ?? null;
}

interface ModelPickerProps {
  value: string;
  /** 该服务商下的可选模型版本 */
  candidates: string[];
  providerName?: string;
  onChange: (v: string) => void;
}

/**
 * 模型版本选择器：右侧箭头点开可见该厂商的全部分支版本供选择；
 * 输入框仍可自由输入（厂商上线新版本时直接手输即可）。
 */
function ModelPicker({
  value,
  candidates,
  providerName,
  onChange,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // 点击面板外部时收起
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const isPresetValue = candidates.includes(value);

  return (
    <div className="relative" ref={rootRef}>
      <div className="relative">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            candidates.length
              ? "选择或输入模型版本…"
              : "选择服务商后将出现可选版本，也可直接输入模型名"
          }
          className={`${inputCls} pr-10`}
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => candidates.length && setOpen((o) => !o)}
          disabled={!candidates.length}
          aria-label="展开可选模型版本"
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 transition ${
            candidates.length
              ? "text-mist-400 hover:bg-mist-100 hover:text-accent-600"
              : "cursor-not-allowed text-mist-200"
          } ${open ? "text-accent-600" : ""}`}
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
      </div>

      {open && candidates.length > 0 && (
        <div className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-mist-200 bg-white shadow-lg dark:border-space-700 dark:bg-space-800">
          {providerName && (
            <div className="border-b border-mist-100 px-3 py-1.5 text-[11px] font-medium text-mist-400 dark:border-space-700">
              {providerName} 可选模型版本（{candidates.length} 个）
            </div>
          )}
          {!isPresetValue && value.trim() && (
            <div className="border-b border-mist-100 bg-accent-50/60 px-3 py-2 text-xs text-accent-600 dark:border-space-700">
              当前：{value}（自定义版本，不在列表中）
            </div>
          )}
          <ul className="max-h-56 overflow-y-auto p-1">
            {candidates.map((m) => {
              const active = m === value;
              return (
                <li key={m}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(m);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition ${
                      active
                        ? "bg-accent-50 font-medium text-accent-600 dark:bg-space-700"
                        : "text-mist-700 hover:bg-mist-50 dark:text-mist-200 dark:hover:bg-space-700/60"
                    }`}
                  >
                    <span className="break-all">{m}</span>
                    {active && <Check className="h-3.5 w-3.5 shrink-0" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-mist-100 px-3 py-1.5 text-[11px] text-mist-400 dark:border-space-700">
            新版本未收录？可直接在上方输入框中输入模型名
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * AI 设置表单（聊天页弹窗 / 独立使用均可，响应式适配手机与电脑）。
 *
 * - 登录用户：apiKey 加密入库，输入框可留空（保留已保存密钥）；
 * - 匿名访客：配置写 localStorage，仅本机生效；
 * - 登录后可一键把本地匿名配置上传到账号加密存储。
 */
export default function AiSettingsForm({ onClose, onSaved }: AiSettingsFormProps) {
  const {
    loggedIn,
    config,
    anonConfig,
    loading,
    save,
    clear,
    uploadAnonToAccount,
    refresh,
  } = useAiConfig();

  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  /** 当前选中的服务商 id（'' 表示未匹配预设，等于自定义手填） */
  const [providerId, setProviderId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(
    null,
  );

  // 加载已有配置回填表单
  useEffect(() => {
    if (config) {
      const pid = config.baseUrl
        ? detectProvider(config.baseUrl) ?? "custom"
        : "";
      const preset = PROVIDER_PRESETS.find((p) => p.id === pid);
      let m = config.model ?? "";
      // 已弃用的旧模型名自动迁移到新版（如 deepseek-chat → deepseek-v4-flash）
      if (preset?.legacy && preset.legacy[m]) {
        m = preset.legacy[m];
      }
      setBaseUrl(config.baseUrl ?? "");
      setModel(m);
      setProviderId(pid);
    }
  }, [config]);

  const selectedProvider = PROVIDER_PRESETS.find((p) => p.id === providerId);

  /** 选择服务商：自动带出接口地址与默认模型，用户只需填 API Key */
  const handleProviderChange = (nextId: string) => {
    setProviderId(nextId);
    const preset = PROVIDER_PRESETS.find((p) => p.id === nextId);
    if (!preset) return; // 自定义：保留现有填写
    setBaseUrl(preset.baseUrl);
    // 模型候选里已有当前值则保留，否则自动带出该服务商第一个模型
    if (!preset.models.includes(model)) {
      setModel(preset.models[0] ?? "");
    }
  };

  const handleSave = async () => {
    const url = baseUrl.trim();
    const m = model.trim();
    if (!url || !m) {
      setMsg({ type: "err", text: "接口地址与模型名称不能为空" });
      return;
    }
    if (loggedIn && !config?.hasApiKey && !apiKey.trim()) {
      setMsg({ type: "err", text: "账号尚未保存过密钥，本次必须填写 API Key" });
      return;
    }
    if (!loggedIn && !apiKey.trim()) {
      setMsg({ type: "err", text: "访客模式必须填写 API Key（仅存本机）" });
      return;
    }
    setSaving(true);
    const ok = await save({
      apiKey: apiKey.trim() || undefined,
      baseUrl: url,
      model: m,
    });
    setSaving(false);
    if (ok) {
      setMsg({ type: "ok", text: loggedIn ? "已加密保存到你的账号" : "已保存到本机浏览器" });
      setApiKey("");
      onSaved?.();
    } else {
      setMsg({ type: "err", text: "保存失败，请稍后重试" });
    }
  };

  const handleUpload = async () => {
    setSaving(true);
    const ok = await uploadAnonToAccount();
    setSaving(false);
    if (ok) {
      setMsg({ type: "ok", text: "已将本地配置上传并加密保存到账号" });
      await refresh();
    } else {
      setMsg({ type: "err", text: "上传失败：本地无匿名配置或网络错误" });
    }
  };

  const handleClear = async () => {
    await clear();
    setApiKey("");
    setMsg({ type: "ok", text: loggedIn ? "已清除账号 AI 配置" : "已清除本机配置" });
  };

  return (
    <div className="w-full">
      {/* 标题栏（弹窗模式） */}
      {(onClose || true) && (
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-base font-semibold text-mist-800">
            <RefreshCw className="h-4 w-4 text-accent-500" />
            AI 设置
          </h3>
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-mist-400 transition hover:bg-mist-100 hover:text-mist-600"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-sm text-mist-400">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> 加载配置中…
        </div>
      ) : (
        <>
          {loggedIn ? (
            <p className="mb-4 rounded-lg bg-accent-50 px-3 py-2 text-xs leading-relaxed text-accent-600">
              已登录：API Key 将 AES 加密保存在你的账号，跨设备可用；原始密钥不会回传前端。
            </p>
          ) : (
            <p className="mb-4 rounded-lg bg-warn-50 px-3 py-2 text-xs leading-relaxed text-warn-700">
              访客模式：配置仅保存在本机浏览器（localStorage），不会上传服务器。
            </p>
          )}

          <div className="space-y-3">
            {/* ① 服务商选择：选中自动带出接口地址 + 模型，只需填 API Key */}
            <label className="block">
              <span className={labelCls}>
                <Building2 className="h-3.5 w-3.5 text-accent-500" />
                AI 服务商
              </span>
              <select
                value={providerId}
                onChange={(e) => handleProviderChange(e.target.value)}
                className={`${inputCls} cursor-pointer`}
              >
                <option value="">选择服务商，自动填充参数</option>
                {PROVIDER_PRESETS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
                <option value="custom">自定义（手动填写）</option>
              </select>
              {selectedProvider && (
                <span className="mt-1 block text-[11px] leading-relaxed text-mist-400">
                  已自动填入 {selectedProvider.name} 的接口地址与模型，只需在上方填写
                  API Key 即可。
                </span>
              )}
            </label>

            <label className="block">
              <span className={labelCls}>
                <KeyRound className="h-3.5 w-3.5 text-accent-500" />
                API Key
              </span>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  loggedIn && config?.hasApiKey
                    ? "已保存密钥，无需重复填写（留空则保留）"
                    : selectedProvider
                      ? `填入你的 ${selectedProvider.name} API Key`
                      : "sk-…"
                }
                className={inputCls}
                autoComplete="off"
              />
            </label>

            <label className="block">
              <span className={labelCls}>
                <Server className="h-3.5 w-3.5 text-accent-500" />
                接口地址 Base URL
              </span>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.deepseek.com"
                className={`${inputCls} ${
                  selectedProvider
                    ? "cursor-not-allowed bg-mist-50/60 text-mist-600 dark:bg-space-900 dark:text-mist-300"
                    : ""
                }`}
                readOnly={!!selectedProvider}
                title={selectedProvider ? "预设服务商已自动配置，如需修改请选择「自定义」" : undefined}
              />
            </label>

            <label className="block">
              <span className={labelCls}>
                模型版本 Model
                {selectedProvider && selectedProvider.models.length > 0 && (
                  <span className="rounded-full bg-accent-50 px-1.5 py-px text-[10px] font-medium text-accent-500">
                    {selectedProvider.models.length} 个版本可选
                  </span>
                )}
              </span>
              <ModelPicker
                value={model}
                candidates={selectedProvider?.models ?? []}
                providerName={selectedProvider?.name}
                onChange={setModel}
              />
              {!selectedProvider && (
                <span className="mt-1 block text-[11px] leading-relaxed text-mist-400">
                  先在上方选择 AI 服务商，这里即可列出它全部分支版本供选择。
                </span>
              )}
            </label>

            {msg && (
              <p
                className={
                  msg.type === "ok"
                    ? "rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-600"
                    : "rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600"
                }
              >
                {msg.text}
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                保存配置
              </button>

              {loggedIn && anonConfig && (
                <button
                  onClick={handleUpload}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-accent-200 bg-white px-4 py-2 text-sm font-medium text-accent-600 transition hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  上传本地配置到账号
                </button>
              )}

              {loggedIn && config?.hasApiKey && (
                <button
                  onClick={handleClear}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-mist-200 bg-white px-4 py-2 text-sm font-medium text-mist-500 transition hover:bg-mist-50 hover:text-rose-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  清除配置
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
