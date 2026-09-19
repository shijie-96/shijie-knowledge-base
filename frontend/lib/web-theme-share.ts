/**
 * 名片装扮 × 网页视觉自定义 · 背景素材联动
 * ------------------------------------------------------------
 * 「名片装扮」的背景存云端（公开主页，他人可见）；
 * 「网页视觉自定义」的背景存本机（IndexedDB 原图 + localStorage，仅自己可见）。
 * 这里提供两套素材互相引用 / 互相同步的最小桥：
 *  - snapshotWebThemeBg      ：读取网页视觉当前使用的背景摘要（供装扮页「一键导入云端」）
 *  - adoptRemoteUrlAsWebBg   ：把一张云端/外链图收进网页视觉背景（供装扮页「反向同步本机」）
 */

import {
  loadBgImageBlob,
  makeBlobThumbDataUrl,
  saveBgImageBlob,
} from "@/lib/ui-bg-store";
import {
  applyThemeToRoot,
  loadTheme,
  saveTheme,
  type UiTheme,
} from "@/lib/ui-theme";

export interface WebThemeBgSnapshot {
  /** 预览地址：IDB 原图为会话级 objectURL；外链为原 URL */
  previewUrl: string;
  /** 素材来源：idb = 本机无损原图；remote = 外链 URL */
  source: "idb" | "remote";
  /** remote 时的原始 URL（便于回传云端/取图） */
  remoteUrl?: string;
}

/** 释放 snapshot 中由本模块创建的 objectURL（卸载组件时调用） */
export function releaseWebThemeBgSnapshot(snapshot: WebThemeBgSnapshot | null) {
  if (snapshot && snapshot.source === "idb") {
    URL.revokeObjectURL(snapshot.previewUrl);
  }
}

/**
 * 读取「网页视觉自定义」当前使用的背景图摘要。
 * 优先 IndexedDB 无损原图（最接近用户实际看到的效果），
 * 其次为公开外链；本机 blob/dataURL（非持久形态）不返回。
 */
export async function snapshotWebThemeBg(): Promise<WebThemeBgSnapshot | null> {
  const theme = loadTheme();
  if (!theme.bgImageUrl) return null;
  const blob = await loadBgImageBlob();
  if (blob) {
    return { previewUrl: URL.createObjectURL(blob), source: "idb" };
  }
  if (/^https?:\/\//.test(theme.bgImageUrl)) {
    return { previewUrl: theme.bgImageUrl, source: "remote", remoteUrl: theme.bgImageUrl };
  }
  return null;
}

/**
 * 把某张云端 / 外链图片收进「网页视觉自定义」作为当前背景：
 * 原图存 IndexedDB（全画质），主题写入并实时生效（所有页面、星图背景均跟随）。
 * 返回 { ok }；失败（跨域受限 / 非图片 / 隐私模式等）时返回 false。
 */
export async function adoptRemoteUrlAsWebBg(url: string): Promise<{ ok: boolean }> {
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false };
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return { ok: false };

    const prev = loadTheme();
    const savedDb = await saveBgImageBlob(blob);
    if (!savedDb) return { ok: false };

    const thumb = await makeBlobThumbDataUrl(blob);
    const next: UiTheme = {
      ...prev,
      bgImageUrl: URL.createObjectURL(blob),
      bgImageDb: true,
      bgImageThumb: thumb || "",
      // 让背景图可见：若用户原本没有遮罩/容器完全不透明，补一档透出
      bgCoverOpacity: prev.bgCoverOpacity > 0 ? prev.bgCoverOpacity : 0.15,
    };
    if (prev.surface.bgOpacity >= 1) {
      next.surface = { ...prev.surface, bgOpacity: 0.45 };
    }
    saveTheme(next);
    applyThemeToRoot(next);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}
