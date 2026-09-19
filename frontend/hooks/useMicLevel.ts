"use client";

import { useEffect, useRef } from "react";

/**
 * 采集麦克风实时音量（0~1），用于语音界面里的波形/光球动效。
 *
 * 刻意返回 ref 而不是 state：音量每帧都在变，走 state 会让整棵组件树每帧重渲染，
 * 而动效只需要 canvas 在 rAF 里读一下当前值就够了。
 */
export function useMicLevel(active: boolean) {
  const levelRef = useRef(0);

  useEffect(() => {
    if (!active) {
      levelRef.current = 0;
      return;
    }
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return;

    let raf = 0;
    let disposed = false;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;

    const boot = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        if (disposed) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor();
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.7;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        let smooth = 0;

        const tick = () => {
          if (disposed) return;
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
          const rms = Math.sqrt(sum / data.length) / 255;
          const raw = Math.min(1, rms * 2.8);
          // 起音快、收音慢：说话时立刻有反应，停下来缓缓落下去
          smooth += (raw - smooth) * (raw > smooth ? 0.45 : 0.1);
          levelRef.current = smooth;
          raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        /* 没给麦克风权限就静默降级为「无音量」：界面仍然能用，只是波形不动 */
        levelRef.current = 0;
      }
    };
    void boot();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      levelRef.current = 0;
    };
  }, [active]);

  return levelRef;
}
