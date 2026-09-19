"use client";

import { useEffect, useRef } from "react";

export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

/** 四种状态主色：薄荷绿系（待命=亮青、聆听=翠绿、思考=琥珀、讲话=深青）
 *  配合淡绿面板用，色相集中在青绿区间，靠明度区分状态。 */
const PALETTE: Record<VoicePhase, [number, number, number]> = {
  idle: [94, 234, 212],      // teal-300
  listening: [16, 185, 129], // emerald-500
  thinking: [245, 158, 11],  // amber-500
  speaking: [13, 148, 136],  // teal-600
};

interface Props {
  phase: VoicePhase;
  /** 麦克风实时音量（0~1），由 useMicLevel 提供 */
  levelRef: { current: number };
}

interface Dot {
  a: number;
  r: number;
  s: number;
  z: number;
}

/**
 * 语音对话的「星核」动效。
 *
 * 全部用 Canvas 手绘（项目没有动画库）：
 * 极光带 + 星尘 + 频谱环 + 呼吸光球 + 声波扩散，
 * 颜色与节奏跟着状态走，让人一眼知道现在是谁在说话。
 */
export default function VoiceOrbCanvas({ phase, levelRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let disposed = false;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const dots: Dot[] = Array.from({ length: 70 }, () => ({
      a: Math.random() * Math.PI * 2,
      r: 0.32 + Math.random() * 0.68,
      s: 0.0006 + Math.random() * 0.0018,
      z: 0.3 + Math.random() * 0.7,
    }));
    const rings: { r: number; a: number }[] = [];
    let lastRing = 0;
    const t0 = performance.now();

    const draw = (now: number) => {
      if (disposed) return;
      const t = (now - t0) / 1000;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const cx = w / 2;
      const cy = h / 2;
      const S = Math.min(w, h);
      const p = phaseRef.current;
      const level = levelRef.current;
      const [cr, cg, cb] = PALETTE[p];
      const breathe = 0.5 + 0.5 * Math.sin(t * 1.5);

      // ① 中心辉光底
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 0.72);
      bg.addColorStop(0, `rgba(${cr},${cg},${cb},0.16)`);
      bg.addColorStop(0.45, `rgba(${cr},${cg},${cb},0.05)`);
      bg.addColorStop(1, "rgba(4,6,13,0)");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // ② 星尘：绕着星核慢慢转，说话时转得快一点
      const speed = p === "idle" ? 1 : p === "thinking" ? 1.8 : 2.4;
      for (const d of dots) {
        d.a += d.s * speed;
        const rr = S * 0.44 * d.r;
        const x = cx + Math.cos(d.a) * rr;
        const y = cy + Math.sin(d.a) * rr * 0.6;
        const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 1.6 + d.r * 30));
        ctx.globalAlpha = tw * d.z * 0.65;
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.beginPath();
        ctx.arc(x, y, d.z * 1.7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // ③ 极光带：三条缓慢起伏的横向光带
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (let b = 0; b < 3; b++) {
        const yBase = cy + Math.sin(t * 0.16 + b * 2.1) * S * 0.14;
        const amp = S * (0.05 + 0.028 * b);
        const wave = (x: number) => {
          const u = x / Math.max(1, w);
          return (
            yBase +
            Math.sin(u * 3.4 + t * 0.5 + b * 1.7) * amp +
            Math.sin(u * 7.1 - t * 0.31) * amp * 0.4
          );
        };
        ctx.beginPath();
        for (let x = 0; x <= w; x += 14) {
          const y = wave(x) - amp * 0.5;
          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        for (let x = w; x >= 0; x -= 14) {
          ctx.lineTo(x, wave(x) + amp * 0.5);
        }
        ctx.closePath();
        const g = ctx.createLinearGradient(0, yBase - amp, 0, yBase + amp);
        g.addColorStop(0, `rgba(${cr},${cg},${cb},0)`);
        g.addColorStop(0.5, `rgba(${cr},${cg},${cb},${0.07 + 0.02 * b})`);
        g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = g;
        ctx.fill();
      }
      ctx.restore();

      // ④ 声波扩散环：助理讲话时一圈圈往外推
      if (p === "speaking" && now - lastRing > 900) {
        rings.push({ r: S * 0.18, a: 0.5 });
        lastRing = now;
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i];
        ring.r += S * 0.0045;
        ring.a -= 0.011;
        if (ring.a <= 0 || ring.r > S * 0.78) {
          rings.splice(i, 1);
          continue;
        }
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${ring.a})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, ring.r, 0, Math.PI * 2);
        ctx.stroke();
      }

      // ⑤ 频谱环：聆听时吃真实麦克风音量，讲话时用节奏波形
      const N = 72;
      const R0 = S * 0.17;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.lineCap = "round";
      for (let i = 0; i < N; i++) {
        const ang = (i / N) * Math.PI * 2 + (p === "thinking" ? t * 0.6 : 0);
        const noise =
          0.5 + 0.5 * Math.sin(i * 1.7 + t * 3.1) * Math.sin(i * 0.9 - t * 1.7);
        let v: number;
        if (p === "listening") v = 0.12 + level * 0.95 * (0.4 + 0.6 * noise);
        else if (p === "speaking")
          v = 0.18 + 0.55 * (0.5 + 0.5 * Math.sin(i * 0.8 + t * 5.2)) * (0.6 + 0.4 * noise);
        else if (p === "thinking") v = 0.1 + 0.24 * noise;
        else v = 0.06 + 0.1 * noise + breathe * 0.06;
        const len = S * 0.02 + v * S * 0.11;
        const ca = Math.cos(ang);
        const sa = Math.sin(ang);
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${0.3 + v * 0.5})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(ca * R0, sa * R0);
        ctx.lineTo(ca * (R0 + len), sa * (R0 + len));
        ctx.stroke();
      }
      ctx.restore();

      // ⑥ 中心光球：跟着音量呼吸
      const orbR =
        S *
        0.115 *
        (1 +
          (p === "listening"
            ? level * 0.5
            : p === "speaking"
              ? 0.1 * Math.sin(t * 4.2)
              : 0.03 * Math.sin(t * 1.5)));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, orbR * 2.6);
      gg.addColorStop(0, "rgba(255,255,255,0.9)");
      gg.addColorStop(0.16, `rgba(${cr},${cg},${cb},0.92)`);
      gg.addColorStop(0.5, `rgba(${cr},${cg},${cb},0.26)`);
      gg.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(cx, cy, orbR * 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.beginPath();
      ctx.arc(cx, cy, orbR * 0.52, 0, Math.PI * 2);
      ctx.fill();

      // ⑦ 思考中：三段弧线缓缓转圈
      if (p === "thinking") {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(t * 1.1);
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.arc(
            0,
            0,
            S * 0.235 + k * S * 0.022,
            (k * Math.PI * 2) / 3,
            (k * Math.PI * 2) / 3 + Math.PI * 0.5,
          );
          ctx.strokeStyle = `rgba(${cr},${cg},${cb},${0.5 - k * 0.13})`;
          ctx.lineWidth = 3;
          ctx.lineCap = "round";
          ctx.stroke();
        }
        ctx.restore();
      }

      // ⑧ 聆听中：外侧呼吸圈
      if (p === "listening") {
        const pr = S * (0.2 + 0.018 * Math.sin(t * 2) + level * 0.035);
        ctx.strokeStyle = `rgba(${cr},${cg},${cb},${0.22 + level * 0.38})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, pr, 0, Math.PI * 2);
        ctx.stroke();
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [levelRef]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}
