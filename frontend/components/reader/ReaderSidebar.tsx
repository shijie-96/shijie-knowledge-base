"use client";

import {
  Bookmark,
  Highlighter,
  ListTree,
  Send,
  StickyNote,
} from "lucide-react";
import type { MaterialAnnotation } from "@/types";

export interface OutlineItem {
  blockIndex: number;
  level: number;
  title: string;
}

interface ReaderSidebarProps {
  open: boolean;
  tab: "outline" | "bookmarks" | "notes";
  onTabChange: (tab: "outline" | "bookmarks" | "notes") => void;
  outline: OutlineItem[];
  bookmarks: MaterialAnnotation[];
  notes: MaterialAnnotation[];
  onNavigateBlock: (blockIndex: number) => void;
  onNavigateBookmark: (anno: MaterialAnnotation) => void;
  onEditNote: (anno: MaterialAnnotation) => void;
  onSendDigest: (anno: MaterialAnnotation) => void;
}

/** 阅读器左侧边栏：大纲 / 书签 / 划线笔记 */
export default function ReaderSidebar({
  open,
  tab,
  onTabChange,
  outline,
  bookmarks,
  notes,
  onNavigateBlock,
  onNavigateBookmark,
  onEditNote,
  onSendDigest,
}: ReaderSidebarProps) {
  if (!open) return null;

  const tabs: { key: "outline" | "bookmarks" | "notes"; label: string; count: number; icon: React.ReactNode }[] = [
    { key: "outline", label: "大纲", count: outline.length, icon: <ListTree className="h-3.5 w-3.5" /> },
    { key: "bookmarks", label: "书签", count: bookmarks.length, icon: <Bookmark className="h-3.5 w-3.5" /> },
    { key: "notes", label: "划线", count: notes.length, icon: <Highlighter className="h-3.5 w-3.5" /> },
  ];

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-mist-200 bg-white/80 backdrop-blur dark:border-space-800 dark:bg-space-900/80">
      {/* tab 切换 */}
      <div className="flex gap-1 border-b border-mist-100 p-2 dark:border-space-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => onTabChange(t.key)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition ${
              tab === t.key
                ? "bg-mist-800 text-white dark:bg-mist-100 dark:text-mist-900"
                : "text-mist-500 hover:bg-mist-100 dark:hover:bg-space-800"
            }`}
          >
            {t.icon}
            {t.label}
            {t.count > 0 && (
              <span
                className={`rounded-full px-1.5 text-[10px] ${
                  tab === t.key
                    ? "bg-white/20 dark:bg-space-900/20"
                    : "bg-mist-100 dark:bg-space-800"
                }`}
              >
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto p-2">
        {tab === "outline" && (
          <div className="space-y-0.5">
            {outline.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-mist-400">
                本文档没有标题，无法生成大纲
              </p>
            )}
            {outline.map((item, i) => (
              <button
                key={`${item.blockIndex}-${i}`}
                onClick={() => onNavigateBlock(item.blockIndex)}
                className="block w-full truncate rounded-lg px-3 py-1.5 text-left text-[13px] text-mist-600 transition hover:bg-mist-100 hover:text-mist-900 dark:text-mist-300 dark:hover:bg-space-800 dark:hover:text-white"
                style={{ paddingLeft: 12 + (item.level - 1) * 14 }}
              >
                {item.title}
              </button>
            ))}
          </div>
        )}

        {tab === "bookmarks" && (
          <div className="space-y-1.5">
            {bookmarks.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-mist-400">
                还没有书签，阅读时点顶部书签按钮即可添加
              </p>
            )}
            {bookmarks.map((b) => (
              <button
                key={b.id}
                onClick={() => onNavigateBookmark(b)}
                className="block w-full rounded-lg border border-mist-100 bg-white px-3 py-2 text-left text-[13px] text-mist-600 transition hover:border-warn-200 hover:bg-warn-50 dark:border-space-800 dark:bg-space-800/60 dark:text-mist-300 dark:hover:border-warn-500/40"
              >
                <span className="line-clamp-3">{b.excerptText}</span>
                <span className="mt-1 block text-[10px] text-mist-400">
                  {new Date(b.createdAt).toLocaleString("zh-CN")}
                </span>
              </button>
            ))}
          </div>
        )}

        {tab === "notes" && (
          <div className="space-y-1.5">
            {notes.length === 0 && (
              <p className="px-3 py-6 text-center text-xs text-mist-400">
                还没有划线。阅读时选中文字即可高亮并写下思考
              </p>
            )}
            {notes.map((n) => (
              <div
                key={n.id}
                className="rounded-xl border border-mist-100 bg-white p-3 dark:border-space-800 dark:bg-space-800/60"
              >
                <div className="rounded-md border-l-3 border-l-warn-400 bg-warn-50/60 pl-2 text-[13px] leading-relaxed text-mist-700 dark:bg-warn-500/10 dark:text-mist-200">
                  <span className="line-clamp-3">{n.excerptText}</span>
                </div>
                {n.userThought && (
                  <p className="mt-2 flex gap-1.5 text-[12px] leading-relaxed text-emerald-700 dark:text-emerald-400">
                    <StickyNote className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="line-clamp-4">{n.userThought}</span>
                  </p>
                )}
                <div className="mt-2 flex items-center gap-1">
                  <button
                    onClick={() => onEditNote(n)}
                    className="rounded-md px-2 py-1 text-[11px] text-mist-500 transition hover:bg-mist-100 dark:hover:bg-space-700"
                  >
                    编辑
                  </button>
                  <button
                    onClick={() => onSendDigest(n)}
                    className="ml-auto flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-600 transition hover:bg-emerald-500/20 dark:text-emerald-400"
                  >
                    <Send className="h-3 w-3" />
                    送入消化
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
