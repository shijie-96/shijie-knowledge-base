"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * CosmosWindow —— 识界工具台首页「引力场窗口」
 *
 * 一张有界的深空 Canvas，把"积累的未来"画出来：
 * - 已沉淀原子（atomTotal）→ 一颗颗从内向外点亮的星；
 * - 未点亮的槽位 → 极暗的占位点 + 一个"下一颗"的虚线提示圈；
 * - 待消化素材（pendingCount）→ 如光点从画面外划向核心（落定即亮）；
 * - 全部位置由确定性 hash 生成：数据不变、刷新后星空不变。
 *
 * 反 slop：窗口有界、数据驱动；正文页不会出现第二个暗色区。
 */
const SLOT_COUNT = 46;
const DUST_COUNT = 70;
const CORE_X = 0.74;
const CORE_Y = 0.4;

/** 确定性伪随机：同一整数永远得到同一 [0,1)，保证星象稳定 */
function rand(seed: number): number {
  const s = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

interface CosmosWindowProps {
  /** 已沉淀的原子数：决定点亮的星数 */
  atomTotal: number;
  /** 待消化素材数：决定划过画面的光点数量 */
  pendingCount: number;
  /** 外层注入文案（放在星空之上） */
  children?: ReactNode;
  className?: string;
}

export default function CosmosWindow({
  atomTotal,
  pendingCount,
  children,
  className = "",
}: CosmosWindowProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    let raf = 0;
    let w = 0;
    let h = 0;
    let dpr = 1;

    /** 星槽：确定性位置，靠近画面的"引力区"（偏右上） */
    interface Slot {
      x: number;
      y: number;
      r: number;
      heat: number; // 色温权重 0=白 1=琥珀
      phase: number;
    }
    const slots: Slot[] = [];
    /** 按到核心距离排序后的索引（原子从内圈先亮起） */
    let order: number[] = [];

    const dust: { x: number; y: number; r: number; a: number; tint: number }[] =
      [];

    const layout = () => {
      const rect = wrap.getBoundingClientRect();
      w = rect.width;
      h = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cx = w * CORE_X;
      const cy = h * CORE_Y;
      const span = Math.min(w, h) * 0.62;

      slots.length = 0;
      order.length = 0;
      for (let i = 0; i < SLOT_COUNT; i++) {
        const a = rand(i) * Math.PI * 2;
        const dist = 0.14 + rand(i + 137) * 0.86; // 内→外
        const x = cx + Math.cos(a) * span * dist * 1.1;
        const y = cy + Math.sin(a) * span * dist;
        slots.push({
          x: Math.max(14, Math.min(w - 14, x)),
          y: Math.max(14, Math.min(h - 16, y)),
          r: 0.7 + rand(i + 233) * 1.3,
          heat: rand(i + 311) > 0.82 ? 1 : 0,
          phase: rand(i + 411) * Math.PI * 2,
        });
      }
      order = slots
        .map((_, i) => i)
        .sort((a, b) => {
          const da = Math.hypot(slots[a].x - cx, slots[a].y - cy);
          const db = Math.hypot(slots[b].x - cx, slots[b].y - cy);
          return da - db;
        });

      dust.length = 0;
      for (let i = 0; i < DUST_COUNT; i++) {
        dust.push({
          x: rand(i + 53) * w,
          y: rand(i + 71) * h,
          r: 0.35 + rand(i + 89) * 0.8,
          a: 0.12 + rand(i + 103) * 0.34,
          tint: rand(i + 127) > 0.85 ? 1 : 0,
        });
      }
    };

    const resize = () => {
      layout();
      if (reduceMotion) draw(0);
    };

    let ro: ResizeObserver | null = null;
    try {
      ro = new ResizeObserver(resize);
      ro.observe(wrap);
    } catch {
      window.addEventListener("resize", resize);
    }
    layout();

    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w * CORE_X;
      const cy = h * CORE_Y;

      /* ---- 尘埃噪点（纯质感，不承载数据） ---- */
      for (const d of dust) {
        ctx.fillStyle = d.tint
          ? `rgba(158,190,255,${d.a * 0.6})`
          : `rgba(255,255,255,${d.a * 0.5})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }

      /* ---- 核心光晕：随原子增长而增强 ---- */
      const coreR = 16 + Math.min(atomTotal, SLOT_COUNT) * 0.55;
      const coreG = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR * 4);
      const coreA = 0.12 + Math.min(atomTotal, 20) / 20 * 0.08;
      coreG.addColorStop(0, `rgba(129,150,255,${coreA})`);
      coreG.addColorStop(0.4, "rgba(96,118,222,0.05)");
      coreG.addColorStop(1, "rgba(96,118,222,0)");
      ctx.fillStyle = coreG;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR * 4, 0, Math.PI * 2);
      ctx.fill();

      /* ---- 轨道细环（桌面宽才画，暗示引用关系在长成） ---- */
      if (w >= 640) {
        ctx.lineWidth = 0.6;
        ctx.strokeStyle = "rgba(140,160,230,0.10)";
        for (let k = 0; k < 2; k++) {
          ctx.setLineDash([3, 7]);
          ctx.beginPath();
          ctx.ellipse(cx, cy, coreR * (2.4 + k * 1.7), coreR * (1.8 + k * 1.4), -0.32, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      }

      /* ---- 已点亮的星（原子）→ 核心的引力细线 ---- */
      const litCount = Math.min(atomTotal, SLOT_COUNT);
      ctx.lineWidth = 0.7;
      for (let oi = 0; oi < litCount; oi++) {
        const s = slots[order[oi]];
        ctx.strokeStyle = `rgba(160,180,255,${0.05 + (oi / SLOT_COUNT) * 0.07})`;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(cx, cy);
        ctx.stroke();
      }

      /* ---- 行星：点亮的星（呼吸） + 未点亮的暗座 ---- */
      for (let i = 0; i < SLOT_COUNT; i++) {
        const s = slots[i];
        const lit = i < litCount;
        if (lit) {
          const breathe = 0.85 + Math.sin(t * 0.7 + s.phase) * 0.15;
          const r = s.r * (1.35 + s.phase % 1 * 0.4);
          // 外晕
          ctx.fillStyle = s.heat
            ? `rgba(245,222,160,${0.16 * breathe})`
            : `rgba(190,208,255,${0.18 * breathe})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, r * 3.1, 0, Math.PI * 2);
          ctx.fill();
          // 星核
          ctx.fillStyle = s.heat
            ? `rgba(255,238,200,${0.95 * breathe})`
            : `rgba(240,245,255,${0.92 * breathe})`;
          ctx.beginPath();
          ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
          ctx.fill();
        } else if (litCount >= SLOT_COUNT) {
          // 满员：再多也只是一点微尘，不再加戏
        } else {
          ctx.fillStyle = "rgba(150,165,205,0.13)";
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 0.55, 0, Math.PI * 2);
          ctx.fill();
          // 只有"下一颗"给出提示圈：潜能可见
          if (order[litCount] === i) {
            const pulse = 0.5 + Math.sin(t * 1.2 + s.phase) * 0.25;
            ctx.strokeStyle = `rgba(245,222,160,${0.3 * pulse})`;
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 5]);
            ctx.beginPath();
            ctx.arc(s.x, s.y, 8 + Math.sin(t * 1.2) * 1.5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          }
        }
      }

      /* ---- 素材光点：待消化素材如流星划入核心 ---- */
      if (!reduceMotion && pendingCount > 0) {
        const count = Math.min(3, 1 + Math.ceil(pendingCount / 4));
        for (let c = 0; c < count; c++) {
          const dur = 3600 + rand(c + 601) * 2600;
          const p = ((t * 1000 + rand(c + 701) * 4000) % dur) / dur;
          if (p > 0.92) continue;
          const a = Math.min(1, p / 0.1) * Math.min(1, (1 - p) / 0.08);
          const sx = w * (0.55 + rand(c + 811) * 0.5);
          const sy = -12 - rand(c + 821) * h * 0.25;
          const ex = cx + (rand(c + 901) - 0.5) * w * 0.3;
          const ey = cy + (rand(c + 911) - 0.5) * h * 0.3;
          const x = sx + (ex - sx) * p;
          const y = sy + (ey - sy) * p;
          const dx = ex - sx;
          const dy = ey - sy;
          const len = Math.hypot(dx, dy) / 22;
          const nx = -dy / len;
          const ny = dx / len;
          const tx = nx * -1;
          const ty = ny * -1;
          const headLen = 26;
          const grad = ctx.createLinearGradient(x, y, x - tx * headLen, y - ty * headLen);
          grad.addColorStop(0, `rgba(255,244,214,${0.85 * a})`);
          grad.addColorStop(1, "rgba(255,244,214,0)");
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - tx * headLen, y - ty * headLen);
          ctx.stroke();
          ctx.fillStyle = `rgba(255,244,220,${0.9 * a})`;
          ctx.beginPath();
          ctx.arc(x, y, 1.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };

    if (reduceMotion) {
      draw(0);
      return () => {
        if (ro) ro.disconnect();
        else window.removeEventListener("resize", resize);
      };
    }

    const start = performance.now();
    const tick = (now: number) => {
      draw((now - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      else window.removeEventListener("resize", resize);
    };
  }, [atomTotal, pendingCount]);

  return (
    <div
      ref={wrapRef}
      className={`relative overflow-hidden rounded-[1.75rem] ${className}`}
      style={{
        background:
          "radial-gradient(130% 140% at 74% 6%, #26345F 0%, #131D3D 34%, #0B1226 62%, #05070F 100%)",
      }}
    >
      {/* 星云氛围光斑（纯质感） */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 46% at 80% 12%, rgba(84,110,255,0.16) 0%, transparent 70%), radial-gradient(42% 40% at 18% 90%, rgba(52,88,180,0.12) 0%, transparent 70%)",
        }}
      />
      {/* 细边框光（有界窗口的"舷窗"感） */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[1.75rem]"
        style={{
          boxShadow:
            "inset 0 1px 0 rgba(255,255,255,0.08), inset 0 0 0 1px rgba(255,255,255,0.04)",
        }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-0 flex flex-col">
        {children}
      </div>
    </div>
  );
}
