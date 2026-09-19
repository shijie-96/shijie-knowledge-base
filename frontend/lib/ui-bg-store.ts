/**
 * 网页视觉自定义 · 背景原图存储（IndexedDB）
 * ------------------------------------------------------------
 * 用户上传的「原图」不再压进 localStorage（有 ~5MB 配额且刷新受限于 base64），
 * 而是以原始 Blob 形式存入 IndexedDB —— 不重编码、不降采样、画质无损。
 * 渲染时用 URL.createObjectURL(blob) 生成同源 blob URL 作 body 背景，
 * 刷新后由全局 hydrator 组件重新从 IDB 取出原图恢复，保证任意页面全画质。
 */

const DB_NAME = "shijie-visual-theme";
const STORE = "bg-image";
const KEY = "original";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB 不可用"));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB 打开失败"));
  });
  return dbPromise;
}

/** 保存原图 Blob（覆盖旧图），失败返回 false（隐私模式等） */
export async function saveBgImageBlob(blob: Blob): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(blob, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch {
    return false;
  }
}

/** 读取原图 Blob；不存在或不可用时返回 null */
export async function loadBgImageBlob(): Promise<Blob | null> {
  try {
    const db = await openDb();
    const blob = await new Promise<Blob | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as Blob) ?? null);
      req.onerror = () => reject(req.error);
    });
    return blob;
  } catch {
    return null;
  }
}

/** 清空原图（移除背景 / 一键重置时调用） */
export async function clearBgImageBlob(): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* ignore */
  }
}

/**
 * 把图片 Blob 解码后缩成小图 dataURL —— 仅作「首帧占位缩略图」落 localStorage。
 * 需要浏览器 canvas，仅在客户端调用。
 */
export async function makeBlobThumbDataUrl(
  blob: Blob,
  maxSide = 480,
  quality = 0.72,
): Promise<string> {
  const url = URL.createObjectURL(blob);
  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve("");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve("");
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve("");
    };
    img.src = url;
  });
}
