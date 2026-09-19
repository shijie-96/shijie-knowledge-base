"use client";

import { useCallback, useEffect, useState } from "react";
import { extractError } from "@/lib/format";
import { BookOpen, ScrollText } from "lucide-react";
import {
  Card,
  EmptyHint,
  ErrorBanner,
  LoadingBlock,
  Pill,
  SectionTitle,
} from "@/components/admin/ui";
import { adminConstitution } from "@/lib/api/admin";
import type { ConstitutionView } from "@/lib/api/admin";

export default function ConstitutionPanel({ onAuthError }: { onAuthError?: () => void }) {
  const [data, setData] = useState<ConstitutionView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await adminConstitution());
    } catch (e) {
      if ((e as { response?: { status?: number } })?.response?.status === 401) {
        onAuthError?.();
        return;
      }
      setError(extractError(e, "加载失败"));
    } finally {
      setLoading(false);
    }
  }, [onAuthError]);

  useEffect(() => {
    void load();
  }, [load]);

  const blocks: Array<{ key: keyof ConstitutionView; label: string; text: string }> =
    data
      ? [
          {
            key: "proactiveAssistant",
            label: "认知助理宪法（PROACTIVE_ASSISTANT_CONSTITUTION）",
            text: data.proactiveAssistant,
          },
          {
            key: "chatImport",
            label: "对话导入宪法（CHAT_IMPORT_CONSTITUTION）",
            text: data.chatImport,
          },
          {
            key: "qaProxy",
            label: "提问代答宪法（QA_PROXY_CONSTITUTION）",
            text: data.qaProxy,
          },
        ]
      : [];

  if (loading && !data) return <LoadingBlock text="正在读取宪法…" />;
  if (error && !data) return <ErrorBanner text={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-xl bg-warn-50 px-3 py-2 text-xs text-warn-700 ring-1 ring-warn-200 dark:bg-warn-500/10 dark:text-warn-300 dark:ring-warn-500/30">
        <ScrollText className="h-4 w-4 shrink-0" />
        {data?.note ?? "宪法为硬底线，仅允许查看。"}
      </div>
      <Card>
        <SectionTitle
          icon={<BookOpen className="h-4 w-4" />}
          title="L1 静态宪法（只读）"
          desc="硬底线内容，任何修改必须人工改动后端常量后重新部署"
          right={<Pill tone="muted">readonly</Pill>}
        />
        {blocks.length === 0 ? (
          <EmptyHint text="暂无宪法内容。" />
        ) : (
          <div className="space-y-4">
            {blocks.map((b) => (
              <div key={b.key}>
                <p className="mb-1.5 text-xs font-semibold text-mist-700 dark:text-mist-300">
                  {b.label}
                </p>
                <pre className="whitespace-pre-wrap break-words rounded-xl bg-mist-50 px-4 py-3 font-sans text-xs leading-6 text-mist-600 ring-1 ring-mist-100 dark:bg-space-850 dark:text-mist-300 dark:ring-space-700">
                  {b.text || "（空）"}
                </pre>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
