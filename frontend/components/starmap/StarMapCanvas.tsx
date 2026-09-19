"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, X } from "lucide-react";
import type {
  CognitiveStarMapData,
  StarMapConnections,
  StarMapOtherNode,
  StarMapReferenceItem,
  StarMapSelfNode,
} from "@/types";

/**
 * 光点外观：星图客观统一，所有用户一律同尺寸同外观（已取消会员等级区分）。
 */
const NODE_UI = { radius: 9, ring: "rgba(200,210,235,0.95)", fill: "rgba(165,180,220,0.65)" };

/**
 * 光点命中半径：按透视比例 k 近大远小（k≈1 即“正常视距”的光点）。
 * 同一颗物理光点，离我越近在画布上越大、越易命中。
 * 最小值提到 0.55：远景的小头像也要能被点到，不要太小。
 */
const nodeHitRadius = (k: number) =>
  NODE_UI.radius * clamp(k, 0.55, 3) * 0.95;

/** 深空背景的微弱星点（确定性伪随机，SSR/客户端一致） */
const BG_STARS = Array.from({ length: 90 }, (_, i) => ({
  left: (i * 37.7) % 100,
  top: (i * 61.3) % 100,
  size: i % 4 === 0 ? 2 : 1,
  opacity: 0.12 + (i % 5) * 0.07,
}));

/**
 * 深空氛围 · 屏幕空间星尘场（确定性伪随机）。
 * 与 BG_STARS 的分工：DOM 层保留兜底静态星点，本层在 Canvas 内
 * 以「加法合成」提供会闪烁的星尘与偶见带十字光芒的亮星 → 诗云感。
 */
const AMBIENT_DUST = Array.from({ length: 300 }, (_, i) => {
  const bright = i % 19 === 0; // 更密的星尘场：每 19 颗一颗带星芒的亮星
  const warm = i % 3 === 0; // 冷暖交替，接近诗云「蓝 / 金双色」
  return {
    x: (i * 0.6180339887) % 1,
    y: (i * 0.527864045) % 1,
    size: bright ? 1.7 : 0.5 + (i % 6) * 0.2,
    tw: 0.4 + (i % 7) * 0.33, // 闪烁速度
    phase: i * 2.399, // 闪烁相位
    alpha: 0.06 + (i % 9) * 0.07,
    bright,
    warm,
  };
});

/** 深空氛围 · 前景失焦星尘（近在眼前的大光斑，缓慢呼吸，为第一人称垫一层空气纵深） */
const AMBIENT_BOKEH = Array.from({ length: 18 }, (_, i) => ({
  x: (i * 0.3926990817) % 1,
  y: (i * 0.7404804897) % 1,
  size: 16 + ((i * 37) % 9) * 6,
  warm: i % 2 === 0,
  o: 0.05 + (i % 5) * 0.02,
  tw: 0.12 + (i % 5) * 0.08,
  phase: i * 1.7,
}));

/** 深空氛围 · 银河雾 + 星尘（每帧一次，加法合成让亮度叠出「发光感」） */
function drawAmbience(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  // 靛蓝银河雾（左上缓移，像远处的星云）
  const ax = w * (0.32 + Math.sin(t * 0.05) * 0.03);
  const ay = h * (0.6 + Math.cos(t * 0.043) * 0.03);
  const ar = Math.max(w, h) * 0.52;
  let g = ctx.createRadialGradient(ax, ay, 0, ax, ay, ar);
  g.addColorStop(0, "rgba(99,102,241,0.06)");
  g.addColorStop(1, "rgba(99,102,241,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(ax, ay, ar, 0, Math.PI * 2);
  ctx.fill();

  // 暗金银河雾（右下缓移，诗云的金色暖尘）
  const bx = w * (0.72 + Math.cos(t * 0.037) * 0.04);
  const by = h * (0.4 + Math.sin(t * 0.058) * 0.03);
  const br = Math.max(w, h) * 0.46;
  g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
  g.addColorStop(0, "rgba(217,175,117,0.055)");
  g.addColorStop(1, "rgba(217,175,117,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fill();

  // 星尘：普通小星闪烁 + 亮星带柔和十字光芒
  for (const s of AMBIENT_DUST) {
    const px = s.x * w;
    const py = s.y * h;
    const twinkle = s.alpha * (0.5 + 0.5 * Math.sin(t * s.tw + s.phase));
    if (twinkle <= 0.03) continue;
    if (s.bright) {
      const ray = s.size * 6;
      ctx.fillStyle = s.warm ? "rgba(255,244,215,0.95)" : "rgba(228,232,255,0.95)";
      ctx.beginPath();
      ctx.arc(px, py, s.size * 0.9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = s.warm
        ? `rgba(233,201,148,${0.5 * Math.min(1, twinkle)})`
        : `rgba(187,202,255,${0.5 * Math.min(1, twinkle)})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(px - ray, py);
      ctx.lineTo(px + ray, py);
      ctx.moveTo(px, py - ray);
      ctx.lineTo(px, py + ray);
      ctx.stroke();
    } else {
      ctx.fillStyle = s.warm ? "rgba(233,201,148,0.9)" : "rgba(203,213,255,0.9)";
      ctx.globalAlpha = twinkle;
      const d = s.size;
      ctx.fillRect(px, py, d, d);
      ctx.globalAlpha = 1;
    }
  }

  // 前景失焦尘：贴脸的大光斑，呼吸明灭 → 第一人称立刻有了“尘埃就在眼前”的景深
  const bokehWarm = getGlowSprite(true);
  const bokehCool = getGlowSprite(false);
  for (const b of AMBIENT_BOKEH) {
    const spr = b.warm ? bokehWarm : bokehCool;
    if (!spr) continue;
    const bx = b.x * w;
    const by = b.y * h;
    const br = b.size * (0.92 + 0.08 * Math.sin(t * 0.3 + b.phase));
    const ba = b.o * (0.6 + 0.4 * Math.sin(t * b.tw + b.phase));
    if (ba <= 0.008) continue;
    ctx.globalAlpha = ba;
    ctx.drawImage(spr, bx - br, by - br, br * 2, br * 2);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * 星海微尘（世界系 · 三维天球分布，确定性伪随机）。
 * 以「第一人称视点」为中心：横轴 yaw 绕身、纵轴 pitch 高矮、dist 是离我距离乘子。
 * 与人点共用同一套透视变换 → 转头时近尘擦身、远尘缓移，是「身在其中」的纵深来源。
 * 内外两层：内环暖金细尘（近而亮）+ 外球冷蓝薄雾（远而淡）。
 */
const GALAXY_DUST = (() => {
  const arr: {
    yaw: number;
    pitch: number;
    dist: number;
    s: number;
    warm: boolean;
    o: number;
    tw: number;
    phase: number;
  }[] = [];
  // 内环：围绕人群的“认知尘埃”，近、亮、色温偏金
  for (let i = 0; i < 150; i++) {
    const yaw = i * 2.399963229728653 + 0.6;
    const pitch = (Math.random() - 0.5) * 1.1;
    const dist = 0.42 + Math.random() * 0.5;
    arr.push({
      yaw,
      pitch,
      dist,
      s: 1.1 + (i % 4) * 0.55,
      warm: i % 2 === 0,
      o: Math.max(0.05, 0.42 - dist * 0.5),
      tw: 0.3 + (i % 6) * 0.1,
      phase: i * 1.9 + 0.4,
    });
  }
  // 外球：远而稀的冷色星雾，填满天球
  for (let i = 0; i < 260; i++) {
    const phi = Math.acos(1 - 2 * ((i + 0.5) / 260)); // 球面均匀
    const yaw = i * 2.399963229728653 + 2.2;
    const pitch = Math.PI / 2 - phi;
    arr.push({
      yaw,
      pitch,
      dist: 1.15 + ((i * 37) % 1) * 1.1,
      s: 1.6 + (i % 5) * 0.9,
      warm: i % 3 === 0,
      o: 0.035 + (i % 4) * 0.014,
      tw: 0.22 + (i % 5) * 0.1,
      phase: i * 2.6,
    });
  }
  return arr;
})();

/**
 * 深空巨云 · 超远景多色星云（世界系三维坐标，与人点共用同一套透视变换）。
 * 视角转动时它们缓缓反向滑移 → 抬头/转身都看到壮丽星系之海，真正“身在其中”。
 */
const NEBULAE: {
  yaw: number;
  pitch: number;
  radius: number;
  /** 视在角尺寸（乘 sceneS 后为屏上半径参考） */
  ang: number;
  a: number;
  /** "r,g,b" */
  c: string;
  seed: number;
}[] = [
  { yaw: 0.0, pitch: 0.36, radius: 2.9, ang: 0.52, a: 0.13, c: "129,140,248", seed: 0 },
  { yaw: 1.05, pitch: -0.06, radius: 3.05, ang: 0.6, a: 0.11, c: "167,139,250", seed: 1 },
  { yaw: 1.95, pitch: 0.2, radius: 2.8, ang: 0.52, a: 0.1, c: "45,212,191", seed: 2 },
  { yaw: 2.85, pitch: -0.3, radius: 3.1, ang: 0.62, a: 0.1, c: "99,102,241", seed: 3 },
  { yaw: 3.7, pitch: 0.42, radius: 2.9, ang: 0.5, a: 0.13, c: "217,175,117", seed: 4 },
  { yaw: 4.55, pitch: -0.04, radius: 2.95, ang: 0.54, a: 0.1, c: "96,165,250", seed: 5 },
  { yaw: 5.35, pitch: 0.3, radius: 2.9, ang: 0.52, a: 0.09, c: "244,114,182", seed: 6 },
  { yaw: 5.9, pitch: -0.45, radius: 3.2, ang: 0.6, a: 0.09, c: "59,130,246", seed: 7 },
  { yaw: 2.35, pitch: 0.08, radius: 3.0, ang: 0.5, a: 0.09, c: "148,163,184", seed: 8 },
];

/**
 * 银河星尘：不再走“两条粗臂”路线，改为铺在天球里的呼吸微粒。
 * 有轻微螺旋密度调制，但近端/远端、暖金/冷蓝混撒，避免形成意义不明的条带。
 */
const ARM_DUST = (() => {
  const arr: {
    yaw: number;
    pitch: number;
    dist: number;
    s: number;
    o: number;
    tw: number;
    phase: number;
    warm: boolean;
  }[] = [];
  const count = 300;
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const dist = 0.6 + t * 1.6 + Math.random() * 0.2;
    const yaw = i * 2.399963229728653 + Math.random() * 1.2;
    // 以微微倾斜的银河盘为主，但上下都有分布，不贴地平线
    const spiral = Math.sin(yaw * 2 + dist * 2.4) * 0.18;
    const pitch = (Math.random() * 2 - 1) * 0.5 + spiral;
    arr.push({
      yaw,
      pitch,
      dist,
      s: 0.9 + (i % 5) * 0.35 + Math.random() * 0.6,
      o: 0.04 + (1 - t) * 0.1 + Math.random() * 0.04,
      tw: 0.22 + (i % 5) * 0.12,
      phase: i * 1.7 + Math.random() * 2,
      warm: Math.random() < 0.45,
    });
  }
  return arr;
})();

/** 光晕精灵缓存（暖金 / 冷蓝两枚；加法合成下 drawImage 比逐粒子建渐变便宜得多） */
let glowWarmSprite: HTMLCanvasElement | null = null;
let glowCoolSprite: HTMLCanvasElement | null = null;
function buildGlowSprite(warm: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    if (warm) {
      grad.addColorStop(0, "rgba(255,250,236,1)");
      grad.addColorStop(0.3, "rgba(235,203,150,0.6)");
      grad.addColorStop(1, "rgba(178,116,52,0)");
    } else {
      grad.addColorStop(0, "rgba(240,244,255,1)");
      grad.addColorStop(0.3, "rgba(152,168,255,0.55)");
      grad.addColorStop(1, "rgba(84,94,205,0)");
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  return c;
}
const getGlowSprite = (warm: boolean): HTMLCanvasElement | null => {
  if (typeof document === "undefined") return null;
  if (warm) {
    if (!glowWarmSprite) glowWarmSprite = buildGlowSprite(true);
    return glowWarmSprite;
  }
  if (!glowCoolSprite) glowCoolSprite = buildGlowSprite(false);
  return glowCoolSprite;
};

/** 自己：脚底星芒的最大半径 */
const SELF_RADIUS = 22;
const DEFAULT_GLOW = "#6366f1";
const ZOOM_MIN = 0.55;
const ZOOM_MAX = 2.4;
/** 拖拽旋转灵敏度（弧度/像素） */
const ROTATE_SPEED = 0.005;
/** 拖拽位移超过该值视为旋转而非点击 */
const DRAG_CLICK_THRESHOLD = 6;

/** 连线数量限制：默认显示 50 条，放大后最多 100 条 */
const REF_LINE_BASE = 50;
const REF_LINE_MAX = 100;
/** 弱联系（虚线）数量更少 */
const WEAK_LINE_LIMIT = 5;

/** 低缩放时光点整体缩小比例：不再额外缩小，远景也要看得见 */
const LOD_DOT_RADIUS_SCALE = 1.0;

/**
 * 陌生人语义缩放：zoom 低于该值时陌生人不显示昵称（保持头像光点）。
 * 全景聚焦「亲近层」（相关 / 弱联系），陌生人需要放大后才逐个显形 → 放大 = 看到更多。
 */
const STRANGER_LABEL_ZOOM = 1.15;
/**
 * 陌生人超过该数量时启用「陌生星云」聚合。
 * 本地 / 演示需要 100 位测试旅人全部逐个露脸（一进来就能看到人），
 * 因此把阈值调到不可能触发的量级 —— 任何人数下都不再聚合成星云。
 */
const STRANGER_CLUSTER_MIN = Number.POSITIVE_INFINITY;
/** 聚合时逐个点亮展示的陌生人数上限（窗口大小） */
const STRANGER_SPOTLIGHT_MAX = 16;
/** 放大超过该 zoom 后解散星云簇，逐个展示全部陌生人 */
const STRANGER_EXPAND_ZOOM = 1.45;
/** 陌生星云簇数量上限 */
const NEBULA_CLUSTER_MAX = 4;

type LODLevel = "dot" | "avatar" | "full";
type Tier = "related" | "weak" | "stranger";

/** 第一人称天球布局：angle = 水平方位 / pitch = 俯仰（抬头为正）/ radius = 距离乘子 */
interface StarPos {
  angle: number;
  pitch: number;
  radius: number;
  tier: Tier;
}

/**
 * 层级距离范围（乘子 × 画布短边，即“距我的世界距离”）。
 * 把所有人都收到同一个水平环带里，近中远错开但不要离得太远，
 * 保证一进来就全是头像、没有缩成小点的远景。
 */
const TIER_DIST: Record<Tier, [number, number]> = {
  related: [0.55, 0.78],
  weak: [0.68, 0.92],
  stranger: [0.82, 1.08],
};

/** 层级俯仰张角（弧度）：尽量贴在同一水平线上，只留极小的上下错落 */
const TIER_PITCH: Record<Tier, number> = {
  related: 0.025,
  weak: 0.035,
  stranger: 0.045,
};

/** 各层在水平整圈上的起始偏移：错开层间，避免同一角度扎堆 */
const TIER_ANGLE_OFFSET: Record<Tier, number> = {
  related: 0,
  weak: 0.8,
  stranger: 1.6,
};

interface RefLine {
  id: string;
  targetUserId: string;
  direction: "outgoing" | "incoming";
  note: string | null;
  citerAtom: string | null;
  citedAtom: string | null;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * 节点语义 LOD：陌生人（非相关 / 非弱联系）在 zoom 不够大时不显示昵称，
 * 全景优先突出亲近层，放大后才让陌生人逐个显形。
 */
/** 随机三维分布：related 靠近我（同高近环）、weak 中环、stranger 远环铺满天球 */
function makePositions(others: StarMapOtherNode[], connections: StarMapConnections): StarPos[] {
  const relatedIds = new Set(connections.references.map((r) => r.otherUser.userId));
  const weakIds = new Set(connections.weakLinks.map((w) => w.userId));
  const tiers = others.map((n): Tier =>
    relatedIds.has(n.userId) ? "related" : weakIds.has(n.userId) ? "weak" : "stranger",
  );
  // 统计每层总人数，让每层在水平扇区里均匀铺开
  const tierTotal = tiers.reduce<Record<Tier, number>>(
    (acc, t) => {
      acc[t]++;
      return acc;
    },
    { related: 0, weak: 0, stranger: 0 },
  );
  const next = { related: 0, weak: 0, stranger: 0 };

  return others.map((_, i) => {
    const tier = tiers[i];
    const idx = next[tier]++;
    const total = tierTotal[tier] || 1;
    // 把每层的人沿水平整圈均匀铺开（带层间错位），自动旋转到任意角度都有人从左到右
    const step = (Math.PI * 2) / total;
    const angle =
      TIER_ANGLE_OFFSET[tier] + idx * step + (Math.random() - 0.5) * step * 0.5;
    // 俯仰几乎为 0，只留极小随机错开，保证人严格排在水平带上
    const maxPitch = TIER_PITCH[tier];
    const pitch = (Math.random() * 2 - 1) * maxPitch;
    const [minR, maxR] = TIER_DIST[tier];
    return { angle, pitch, radius: minR + Math.random() * (maxR - minR), tier };
  });
}

/**
 * 挑选最佳初始视角：让人最多的 180° 扇区正对屏幕中央。
 *
 * 与其固定朝正前方（yaw=0），不如按当前数据实际分布，对准最热闹的方向。
 * 加权：related 最重要（×3），weak 次要（×2），stranger 兜底（×1）。
 */
function pickBestInitialYaw(positions: StarPos[]): number {
  if (positions.length === 0) return 0;
  const weights: Record<Tier, number> = { related: 3, weak: 2, stranger: 1 };
  const half = Math.PI / 2; // 半窗 90°，总视野 180°，对准最热闹的方向
  let bestYaw = 0;
  let bestScore = -1;
  for (const p of positions) {
    const center = p.angle;
    let score = 0;
    for (const q of positions) {
      let diff = q.angle - center;
      // 处理 0/2π 环绕
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      if (Math.abs(diff) <= half) score += weights[q.tier];
    }
    if (score > bestScore) {
      bestScore = score;
      bestYaw = center;
    }
  }
  return bestYaw;
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

function hexToRgba(hex: string, alpha: number): string {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/** 由用户 ID 推出一个稳定的呼吸相位：只与时间有关，不随屏幕位置变化（避免旋转时闪烁） */
function stablePhase(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 1000003;
  return ((h % 628) / 100) * 1;
}

/**
 * 其他用户：统一为「圆形头像 + 昵称」样式，和画面底部的「自己」保持一致。
 * 远看是发光小星球，走近后显示头像与名字。
 */
function drawNode(
  ctx: CanvasRenderingContext2D,
  node: StarMapOtherNode,
  x: number,
  y: number,
  zoom: number,
  avatar: HTMLImageElement | null | undefined,
  lod: LODLevel,
  tier: Tier,
  t: number,
) {
  // 呼吸相位只由「用户 ID + 时间」决定，画面旋转/移动时不会跳变闪烁
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.85 + stablePhase(node.userId));
  const color = tier === "related" ? "#e9c984" : tier === "weak" ? "#94a3b8" : "#818cf8";
  const rScale = lod === "dot" ? LOD_DOT_RADIUS_SCALE : 1;
  const baseR = nodeHitRadius(zoom) * rScale;

  // 极简光点：体积光球（兜底：极远景也至少 5.5px，不要缩成几乎看不见的小点）
  if (lod === "dot") {
    const dr = Math.max(5.5, baseR * 1.0);
    const ball = ctx.createRadialGradient(
      x - dr * 0.35,
      y - dr * 0.42,
      dr * 0.1,
      x,
      y,
      dr,
    );
    ball.addColorStop(0, "rgba(255,255,255,0.95)");
    ball.addColorStop(0.4, "rgba(233,201,148,0.65)");
    ball.addColorStop(1, "rgba(96,112,196,0.35)");
    ctx.fillStyle = ball;
    ctx.beginPath();
    ctx.arc(x, y, dr, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  // 圆形头像：与「自己」同风格
  const rr = SELF_RADIUS * clamp(zoom, 0.45, 1.15) * (lod === "full" ? 1 : 0.78);

  // 呼吸光晕
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const haloR = rr * (1.8 + pulse * 0.08);
  const halo = ctx.createRadialGradient(x, y, rr * 0.4, x, y, haloR);
  halo.addColorStop(0, hexToRgba(color, 0.3 + pulse * 0.06));
  halo.addColorStop(1, hexToRgba(color, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 外圈光环（尺寸固定，只有极轻微的明暗起伏）
  ctx.strokeStyle = hexToRgba(color, 0.5 + pulse * 0.1);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, rr + 4, 0, Math.PI * 2);
  ctx.stroke();

  // 头像/底色
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, rr, 0, Math.PI * 2);
  ctx.clip();
  if (avatar) {
    ctx.drawImage(avatar, x - rr, y - rr, rr * 2, rr * 2);
  } else {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, rr, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 白色内环
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, rr, 0, Math.PI * 2);
  ctx.stroke();

  // 昵称在头像下方（远景头像略小字，近景正常，减少拥挤）
  const name = truncate(node.nickname || "未命名", 6);
  ctx.font = lod === "full"
    ? "600 12px system-ui, -apple-system, 'PingFang SC', sans-serif"
    : "600 11px system-ui, -apple-system, 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "#f1f5f9";
  ctx.fillText(name, x, y + rr + (lod === "full" ? 16 : 14));
}

/** 自己：固定中心偏上 + 呼吸光晕 + 专属光效，始终最显著 */
function drawSelf(
  ctx: CanvasRenderingContext2D,
  self: StarMapSelfNode,
  x: number,
  y: number,
  t: number,
  avatar: HTMLImageElement | null | undefined,
) {
  const glow = self.glowColor ?? DEFAULT_GLOW;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2.1);

  // 加法光层①：压扁的「星系核」椭圆光晕（诗云的银河核心观感）
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const coreRx = SELF_RADIUS * (3.5 + pulse * 0.8);
  const coreRy = SELF_RADIUS * (1.1 + pulse * 0.25);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, coreRy / coreRx);
  const eg = ctx.createRadialGradient(0, 0, 0, 0, 0, coreRx);
  eg.addColorStop(0, hexToRgba(glow, 0.4));
  eg.addColorStop(0.55, hexToRgba(glow, 0.09));
  eg.addColorStop(1, hexToRgba(glow, 0));
  ctx.fillStyle = eg;
  ctx.beginPath();
  ctx.arc(0, 0, coreRx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 加法光层②：呼吸大辉光
  const haloR = SELF_RADIUS * (1.9 + pulse * 0.8);
  const halo = ctx.createRadialGradient(x, y, SELF_RADIUS * 0.5, x, y, haloR);
  halo.addColorStop(0, hexToRgba(glow, 0.55));
  halo.addColorStop(1, hexToRgba(glow, 0));
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, Math.PI * 2);
  ctx.fill();

  // 加法光层③：绕自己旋转的轨道微尘（细碎亮点）
  const ringR = SELF_RADIUS * (2.35 + pulse * 0.3);
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2 + t * 0.16;
    const rr = ringR * (0.82 + 0.22 * Math.abs(Math.sin(t * 0.7 + k * 1.7)));
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr * 0.6;
    const al = 0.18 + 0.4 * Math.abs(Math.sin(t * 1.1 + k * 2.1));
    ctx.fillStyle = k % 3 === 0 ? "rgba(233,201,148,0.95)" : "rgba(222,226,255,0.95)";
    ctx.globalAlpha = al;
    ctx.beginPath();
    ctx.arc(px, py, k % 3 === 0 ? 1.5 : 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.strokeStyle = hexToRgba(glow, 0.35 + 0.35 * pulse);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, SELF_RADIUS + 5 + pulse * 3, 0, Math.PI * 2);
  ctx.stroke();

  if (avatar) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, SELF_RADIUS, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatar, x - SELF_RADIUS, y - SELF_RADIUS, SELF_RADIUS * 2, SELF_RADIUS * 2);
    ctx.restore();
  } else {
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, SELF_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x, y, SELF_RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  ctx.font = "600 12px system-ui, -apple-system, 'PingFang SC', sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "#f1f5f9";
  ctx.fillText("我", x, y + SELF_RADIUS + 17);
}

/**
 * 陌生星云簇：把「还没点亮的陌生人」聚成一团可交互的星云。
 * 星云代表一群认知旅人：常态呼吸柔光 + 环绕微光点 + 人数徽章；
 * 悬停高亮并提示，点击轮换一批新面孔。
 */
function drawNebula(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  seed: number,
  t: number,
  hovered: boolean,
) {
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.7 + seed);
  const coreR = 17 + pulse * 4;

  // 柔光核
  const g = ctx.createRadialGradient(x, y, 2, x, y, coreR * 2.4);
  g.addColorStop(
    0,
    hovered ? "rgba(167,139,250,0.5)" : "rgba(129,140,248,0.28)",
  );
  g.addColorStop(1, "rgba(129,140,248,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, coreR * 2.4, 0, Math.PI * 2);
  ctx.fill();

  // 环绕微光点（像一圈细碎星尘）
  const dots = 11;
  for (let k = 0; k < dots; k++) {
    const a = (k / dots) * Math.PI * 2 + t * 0.22 + seed;
    const rr = coreR * (0.55 + 0.6 * Math.abs(Math.sin(t * 0.8 + k * 1.9 + seed)));
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr * 0.72;
    ctx.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(t * 1.2 + k * 2.3));
    ctx.fillStyle = k % 4 === 0 ? "rgba(203,213,225,0.85)" : "rgba(139,92,246,0.75)";
    ctx.beginPath();
    ctx.arc(px, py, k % 3 === 0 ? 1.6 : 1.05, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // 中心核
  ctx.fillStyle = hovered ? "rgba(221,214,254,0.98)" : "rgba(165,180,252,0.9)";
  ctx.beginPath();
  ctx.arc(x, y, 3.2 + pulse * 1.4, 0, Math.PI * 2);
  ctx.fill();

  // 悬停高亮环
  if (hovered) {
    ctx.strokeStyle = "rgba(199,210,254,0.95)";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(x, y, coreR * 2.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

}

export interface StarMapCanvasProps {
  data: CognitiveStarMapData;
  connections: StarMapConnections;
}

export default function StarMapCanvas({ data, connections }: StarMapCanvasProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [detail, setDetail] = useState<StarMapReferenceItem | null>(null);
  const [hoverNode, setHoverNode] = useState<StarMapOtherNode | StarMapSelfNode | null>(null);
  const hoverRef = useRef<{ userId: string; x: number; y: number } | null>(null);
  /** 由渲染 effect 内部写入，供「复位视角」按钮一键回到初始站位 */
  const resetViewRef = useRef<() => void>(() => {});

  const positions = useMemo(
    () => makePositions(data.others, connections),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.refreshedAt, data.others.length, connections.refreshedAt],
  );

  const refLines = useMemo(() => {
    const visible = Math.min(REF_LINE_MAX, REF_LINE_BASE);
    return connections.references.slice(0, visible).map((r) => ({
      id: r.id,
      targetUserId: r.otherUser.userId,
      direction: r.direction,
      note: r.note,
      citerAtom: r.citerAtom?.coreQuestion ?? null,
      citedAtom: r.citedAtom?.coreQuestion ?? null,
    })) as RefLine[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connections.refreshedAt]);

  const weakLines = useMemo(
    () => connections.weakLinks.slice(0, WEAK_LINE_LIMIT),
    [connections.weakLinks],
  );

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    /** 第一人称相机：yaw 水平转向 / pitch 俯仰抬头 / zoom 焦距推进（滚轮走近走远）。
     *  观察者 = 世界原点 = 星海之心，「我」的认知连线从这里射向四周的旅人。 */
    const cam = { yaw: 0, pitch: 0, zoom: 1 };
    // 初始站位对准最热闹的扇区，而不是固定正前方：一进来就有光点
    cam.yaw = pickBestInitialYaw(positions);
    // zoom=1 是默认广角，保证满屏头像；不会把人缩成点（距离范围已收紧）
    cam.zoom = 1.0;
    // 开场自动旋转计时：前 5 秒稍快把人带进视野；之后慢慢巡览
    const autoSpinStart = performance.now();
    let width = 0;
    let height = 0;
    let raf = 0;

    // ---- 陌生人聚合（陌生星云）：人多了靠聚合，不与画布容量挂钩 ----
    const strangerIndexes = positions.flatMap((p, i) =>
      p.tier === "stranger" ? [i] : [],
    );
    const clusterMode = strangerIndexes.length > STRANGER_CLUSTER_MIN;
    /** 聚合时逐个点亮展示的陌生人数（窗口大小） */
    const spotlightN = clusterMode
      ? Math.min(STRANGER_SPOTLIGHT_MAX, strangerIndexes.length)
      : strangerIndexes.length;
    /** 藏在星云中的陌生人数 */
    const restCount = strangerIndexes.length - spotlightN;
    /** 星云簇世界锚点（三维天球：angle 方位 / pitch 俯仰 / radius 距离）：
     *  只取决于陌生人总量（轮换窗口不改变总数）。簇放在 strangers 半程之处，
     *  近处可点、远处成景。 */
    const clusterAnchors = (() => {
      if (restCount <= 0) return [] as { angle: number; pitch: number; radius: number; size: number }[];
      const count = Math.min(
        NEBULA_CLUSTER_MAX,
        Math.max(1, Math.ceil(restCount / 18)),
      );
      return Array.from({ length: count }, (_, k) => {
        const angle = (k / count) * Math.PI * 2 + Math.random() * 0.7;
        return {
          angle,
          pitch: (Math.random() - 0.5) * 0.6,
          radius: 1.15 + Math.random() * 0.25,
          size: Math.floor(restCount / count) + (k < restCount % count ? 1 : 0),
        };
      });
    })();
    /** 已点亮窗口在陌生人列表中的首元素下标（点击星云簇 = 窗口滑动轮换） */
    let strangerWindow = 0;
    /** 悬停中的星云簇下标（-1 = 无）；在 Canvas 内绘制提示，无需 React state */
    let nebulaHover = -1;
    /** 点击星云簇后的扩散脉冲截止时间（performance.now() ms），0 = 无脉冲 */
    let nebulaBurst = 0;
    /** 是否已推进到「星云解散、逐个展示全部陌生人」 */
    const isExpanded = () => !clusterMode || cam.zoom >= STRANGER_EXPAND_ZOOM;
    /** 陌生人在窗口内才逐个展示；放大后（isExpanded）全部展示 */
    const isStrangerVisible = (globalIdx: number) => {
      if (isExpanded()) return true;
      const posInList = strangerIndexes.indexOf(globalIdx);
      if (posInList < 0) return false;
      const rel =
        (posInList - strangerWindow + strangerIndexes.length) % strangerIndexes.length;
      return rel < spotlightN;
    };

    const avatars = new Map<string, HTMLImageElement | null>();
    const nodes: { userId: string; avatar: string | null }[] = [data.self, ...data.others];
    for (const n of nodes) {
      if (!n.avatar) {
        avatars.set(n.userId, null);
        continue;
      }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => avatars.set(n.userId, img);
      img.onerror = () => avatars.set(n.userId, null);
      img.src = n.avatar;
    }

    const resize = () => {
      width = container.clientWidth;
      height = container.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    // ===================== 第一人称三维投影 =====================
    // 观察者站在世界原点 = 星海之心。cam.yaw 决定看向哪个水平方位、
    // cam.pitch 决定俯仰、cam.zoom 决定推进距离（滚轮走近 / 走远）。
    // 世界点用 (方位角 angle, 俯仰 pitch, 距离 radius) 描述，先转到世界直角坐标，
    // 再按相机姿态旋转到视野，最后针孔投影 → 近大远小、背后剔除、前后遮挡都有。
    const sceneS = () => Math.min(width, height);
    /** 世界尺度：radius=1 对应离我 sceneS * 0.78 的世界距离，
     *  把人稍微推远，让天球上下的人不会被“贴脸放大”挤出屏幕 */
    const WORLD_DIST = () => sceneS() * 0.78;
    /** 参考焦距：稍微拉广角，使上下分布的节点能同时入画 */
    const FOCAL = () => sceneS() * 0.82;
    /** 低于该深度（视野轴）的点贴脸太近，剔除避免爆屏 */
    const NEAR_Z = () => sceneS() * 0.06;

    interface Proj {
      x: number;
      y: number;
      /** 视野轴深度（世界距离），用于深度排序：远先画、近后画 */
      depth: number;
      /** 针孔比例 focal/z：1 = 处于参考深度（约 radius 0.7 的位置），越大越近 */
      k: number;
      /** 该点是否落在视锥内（z>近裁剪即可，x/y 可越界，调用方再按屏裁） */
      visible: boolean;
    }

    /**
     * 三维投影：天球上一点 → 屏幕坐标与视在比例。
     * 近大远小：同一距离的旅人，越靠近视线轴越居中；半径越近（radius 小）视在越大。
     */
    const project = (angle: number, pitch: number, radius: number): Proj => {
      const zoom = cam.zoom;
      // 世界直角坐标：angle 绕垂轴（yaw），pitch 俯仰，radius 为距我距离
      const dist = radius * WORLD_DIST();
      const cp = Math.cos(pitch);
      const sp = Math.sin(pitch);
      // 世界系：x 右 / y 上 / z 后（向我的前方为 -z）
      const wx = dist * cp * Math.sin(angle);
      const wy = dist * sp;
      const wz = -dist * cp * Math.cos(angle);
      // 相机系旋转：绕垂轴抵消 cam.yaw、绕水平轴抵消 cam.pitch
      const cy = Math.cos(cam.yaw);
      const sy = Math.sin(cam.yaw);
      const cxx = Math.cos(cam.pitch);
      const sxx = Math.sin(cam.pitch);
      const x1 = wx * cy - wz * sy;
      const z1 = wx * sy + wz * cy;
      const x2 = x1;
      const y2 = wy * cxx - z1 * sxx;
      const z2 = wy * sxx + z1 * cxx;
      // 向前为相机 +z：背面剔除 + 近裁
      const zc = -z2;
      if (zc < NEAR_Z()) {
        return { x: 0, y: 0, depth: zc, k: 0, visible: false };
      }
      // 长焦推进：zoom 越大，等效焦距越长 → 中央世界被“拉近”（走近了）
      const f = FOCAL() * (0.5 + 0.5 * zoom);
      const k = f / zc;
      return {
        x: width / 2 + x2 * k,
        y: height / 2 - y2 * k,
        depth: zc / WORLD_DIST(), // 归一化深度，便于与 radius 量级比较
        k,
        visible: true,
      };
    };

    /** 自己：第一人称里是“脚下的星芒” —— 固定在画面底部中央的锚点，视线转动不位移 */
    const selfAnchor = () => ({
      x: width / 2,
      y: height - Math.max(64, sceneS() * 0.16),
    });

    /** 他人光点投影 */
    const otherProj = (i: number): Proj | null => {
      const p = positions[i];
      const r = project(p.angle, p.pitch, p.radius);
      return r.visible ? r : null;
    };

    /** 星云簇投影 */
    const clusterProj = (k: number): Proj | null => {
      const c = clusterAnchors[k];
      const r = project(c.angle, c.pitch, c.radius);
      return r.visible ? r : null;
    };

    /** 目标光点投影（by userId） */
    const targetProj = (targetUserId: string): Proj | null => {
      const idx = data.others.findIndex((o) => o.userId === targetUserId);
      if (idx < 0) return null;
      return otherProj(idx);
    };

    const isOnScreen = (x: number, y: number, margin = 0) =>
      x >= -margin && x <= width + margin && y >= -margin && y <= height + margin;

    let pageVisible = true;
    /** 空闲「巡览」：进入页面缓缓自转环视，任意角度都能看到一圈人。
     *  初始 yaw 已对准最热闹的扇区，所以转动时视野里始终有人，不会出现空场景。 */
    let idleSpin = true;
    let prevFrame = 0;
    const onVisibility = () => {
      const visible = document.visibilityState === "visible";
      if (visible && !pageVisible) {
        prevFrame = 0; // 防止切回时按“休眠时长”猛跳一次自动旋转
        raf = requestAnimationFrame(draw);
      }
      pageVisible = visible;
    };

    // （旧的“星海穿梭 / 穿越”模式已整体移除：默认即第一人称环绕视角）

    const draw = (now: number) => {
      try {
        const t = now / 1000;

        // 空闲「巡览」：无人操作且未走近时，让视线缓缓绕身旋转，
        // 一出场即看见星海环绕在四周，显出「你站在人群中央」的第一人称纵深
        if (
          idleSpin &&
          !dragging &&
          !hoverRef.current &&
          cam.zoom < 1.25 &&
          prevFrame > 0
        ) {
          const age = (now - autoSpinStart) / 1000;
          // 起步缓入 1.5s：镜头几乎不动地把满屏旅人先交到眼前，再平滑加速到巡览速度。
          // 已取消原来的「开场 5 秒快转」——那会先把镜头扫过空处，才有用户转进来。
          const ramp = Math.min(1, Math.max(0, age / 1.5));
          const speed = 0.08 * ramp;
          cam.yaw += ((now - prevFrame) / 1000) * speed;
        }
        prevFrame = now;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const anchor = selfAnchor();
        const selfX = anchor.x;
        const selfY = anchor.y;

        // 画布透明，让容器层的深空背景透出
        ctx.clearRect(0, 0, width, height);

        // 深空氛围：银河雾 + 闪烁星尘（先于一切，垫在节点之下）
        drawAmbience(ctx, width, height, t);

        // ---- 深空巨云：超远景多彩星云。转头时它们在天幕里缓缓移动，
        //      放大看是一团团「能吞下视线」的云海 —— 站在星系深处的视觉证据 ----
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const nb of NEBULAE) {
          const p = project(nb.yaw, nb.pitch, nb.radius);
          if (!p.visible) continue;
          const S = sceneS();
          const haloR = nb.ang * S * clamp(p.k * 0.95, 0.32, 1.1);
          if (haloR < 16 || !isOnScreen(p.x, p.y, haloR)) continue;
          const breath = 1 + 0.07 * Math.sin(t * 0.24 + nb.seed);
          const outer = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, haloR);
          outer.addColorStop(0, `rgba(${nb.c},${nb.a * breath})`);
          outer.addColorStop(0.42, `rgba(${nb.c},${nb.a * breath * 0.5})`);
          outer.addColorStop(1, `rgba(${nb.c},0)`);
          ctx.fillStyle = outer;
          ctx.beginPath();
          ctx.arc(p.x, p.y, haloR, 0, Math.PI * 2);
          ctx.fill();
          // 内核亮芯：给云团一个更亮的「心」，体积感更强
          const coreR = haloR * 0.46;
          const inner = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, coreR);
          inner.addColorStop(0, `rgba(${nb.c},${nb.a * 1.5 * breath})`);
          inner.addColorStop(0.6, `rgba(${nb.c},${nb.a * 0.55 * breath})`);
          inner.addColorStop(1, `rgba(${nb.c},0)`);
          ctx.fillStyle = inner;
          ctx.beginPath();
          ctx.arc(p.x, p.y, coreR, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();

        // ---- 世界系三维星尘：绕身一圈，转头时近尘擦身、远尘缓移（视差 = 身在其中）----
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (const d of GALAXY_DUST) {
          const p = project(d.yaw, d.pitch, d.dist);
          if (!p.visible || !isOnScreen(p.x, p.y, 80)) continue;
          const spr = getGlowSprite(d.warm);
          if (!spr) continue;
          // 视在尺寸：近大远小 + 依据粒子自身尺度
          const sizeK = clamp(p.k, 0.35, 3);
          const sz = d.s * sizeK * 0.9;
          ctx.globalAlpha =
            d.o * (0.72 + 0.28 * Math.sin(t * d.tw + d.phase)) * clamp(p.k / 1.4, 0.3, 1);
          ctx.drawImage(spr, p.x - sz, p.y - sz, sz * 2, sz * 2);
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // ---- 银河背景：删掉了意义不明的粗绸带，只保留星云 + 呼吸星尘作为深空氛围 ----
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < ARM_DUST.length; i++) {
          const d = ARM_DUST[i];
          const p = project(d.yaw, d.pitch, d.dist);
          if (!p.visible || !isOnScreen(p.x, p.y, 90)) continue;
          const spr = getGlowSprite(d.warm);
          if (!spr) continue;
          const breath = 0.78 + 0.22 * Math.sin(t * d.tw + d.phase);
          const sz = d.s * clamp(p.k, 0.25, 2.4) * breath;
          ctx.globalAlpha =
            d.o * (0.8 + 0.2 * Math.sin(t * d.tw + d.phase)) *
            clamp(p.k / 1.25, 0.25, 1.1);
          ctx.drawImage(spr, p.x - sz, p.y - sz, sz * 2, sz * 2);
        }
        ctx.globalAlpha = 1;
        ctx.restore();

        // ---- 可见节点集合：先做投影，再按深度排序（远先画、近后画，近者覆盖远者）----
        interface DrawItem {
          i: number;
          tier: Tier;
          x: number;
          y: number;
          k: number;
          depth: number;
          lod: LODLevel;
        }
        const items: DrawItem[] = [];
        const expanded = isExpanded();
        // 节点视在 LOD：近者展开名片，中距手书印章，远者只留光点；
        // 陌生人保持「走近才显形」的语义 —— 需 zoom 推进且足够近
        const lodAt = (tier: Tier, k: number): LODLevel => {
          // 默认全景下尽量显示头像和昵称，不要缩成小点；只有极远景才降级
          if (tier === "stranger" && (cam.zoom < STRANGER_LABEL_ZOOM || k < 1.1)) {
            return k < 0.28 ? "dot" : "avatar";
          }
          if (k >= 1.0) return "full";
          if (k >= 0.35) return "avatar";
          return "dot";
        };
        for (let i = 0; i < data.others.length; i++) {
          const tier = positions[i].tier;
          // 陌生星云模式下，未点亮的陌生人藏在星云里不逐个绘制
          if (tier === "stranger" && !expanded && !isStrangerVisible(i)) continue;
          const p = otherProj(i);
          if (!p || !isOnScreen(p.x, p.y, 100)) continue;
          items.push({
            i,
            tier,
            x: p.x,
            y: p.y,
            k: p.k,
            depth: p.depth,
            lod: lodAt(tier, p.k),
          });
        }
        items.sort((a, b) => a.depth - b.depth);

        // ---- 认知连线：从「我」（脚底星芒）射向世界里的旅人，构成三维光束 ----
        // 弱联系：低调虚线
        for (const weak of weakLines) {
          const tgt = targetProj(weak.userId);
          if (!tgt || !isOnScreen(tgt.x, tgt.y, 60)) continue;
          const fade = clamp(1.6 / Math.max(0.6, tgt.depth), 0.15, 0.9);
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.strokeStyle = `rgba(148,163,184,${0.16 * fade})`;
          ctx.lineWidth = 2.4;
          ctx.setLineDash([3, 10]);
          ctx.beginPath();
          ctx.moveTo(selfX, selfY);
          ctx.lineTo(tgt.x, tgt.y);
          ctx.stroke();
          ctx.restore();
          ctx.strokeStyle = `rgba(165,180,212,${0.4 * fade})`;
          ctx.lineWidth = 0.8;
          ctx.setLineDash([3, 7]);
          ctx.beginPath();
          ctx.moveTo(selfX, selfY);
          ctx.lineTo(tgt.x, tgt.y);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // 引用关系：亮色光束（外层辉光 + 细芯），方向色区分
        for (let i = 0; i < refLines.length && i < REF_LINE_MAX; i++) {
          const line = refLines[i];
          const tgt = targetProj(line.targetUserId);
          if (!tgt || !isOnScreen(tgt.x, tgt.y, 90)) continue;
          // 越远的旅人线越淡，避免远空一团乱线
          const fade = clamp(1.8 / Math.max(0.6, tgt.depth), 0.12, 1);
          const base = line.direction === "outgoing" ? "129,140,248" : "52,211,153";
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.lineCap = "round";
          // 辉光
          const glow = ctx.createLinearGradient(selfX, selfY, tgt.x, tgt.y);
          glow.addColorStop(0, `rgba(${base},${0.2 * fade})`);
          glow.addColorStop(1, `rgba(${base},${0.02 * fade})`);
          ctx.strokeStyle = glow;
          ctx.lineWidth = 3.4 * clamp(tgt.k * 0.4, 0.5, 1.4);
          ctx.beginPath();
          ctx.moveTo(selfX, selfY);
          ctx.lineTo(tgt.x, tgt.y);
          ctx.stroke();
          // 亮芯
          const core = ctx.createLinearGradient(selfX, selfY, tgt.x, tgt.y);
          core.addColorStop(0, `rgba(${base},${0.8 * fade})`);
          core.addColorStop(1, `rgba(${base},${0.08 * fade})`);
          ctx.strokeStyle = core;
          ctx.lineWidth = 1.1 * clamp(tgt.k * 0.4, 0.5, 1.4);
          ctx.beginPath();
          ctx.moveTo(selfX, selfY);
          ctx.lineTo(tgt.x, tgt.y);
          ctx.stroke();
          ctx.restore();
        }

        // ---- 陌生星云簇：把未点亮的人聚成远空的星云；推进后（expanded）自动解散 ----
        if (clusterMode && !expanded) {
          for (let k = 0; k < clusterAnchors.length; k++) {
            const cp = clusterProj(k);
            if (!cp || !isOnScreen(cp.x, cp.y, 140)) continue;
            // 星云距我略远，按视在比例轻微缩放
            ctx.save();
            const nscale = clamp(cp.k * 0.6, 0.5, 1.4);
            ctx.translate(cp.x, cp.y);
            ctx.scale(nscale, nscale);
            drawNebula(ctx, 0, 0, k * 1.71, t, nebulaHover === k);
            ctx.restore();
            if (nebulaBurst > now) {
              const bp = (nebulaBurst - now) / 450;
              ctx.strokeStyle = `rgba(199,210,254,${0.55 * bp})`;
              ctx.lineWidth = 1.8;
              ctx.beginPath();
              ctx.arc(cp.x, cp.y, (32 + (1 - bp) * 84) * nscale, 0, Math.PI * 2);
              ctx.stroke();
            }
            if (nebulaHover === k) {
              const hidden = clusterAnchors[k].size;
              const label = `陌生星云 · ${hidden} 位旅人 · 点击唤来新面孔`;
              ctx.font = "11px system-ui, -apple-system, 'PingFang SC', sans-serif";
              ctx.textAlign = "center";
              ctx.fillStyle = "rgba(199,210,254,0.95)";
              ctx.fillText(
                label,
                clamp(cp.x, 80, width - 80),
                clamp(cp.y + 46 * nscale, 18, height - 14),
              );
            }
          }
        }

        // ---- 旅人光点：深度近的盖在远的上面 ----
        for (const it of items) {
          drawNode(
            ctx,
            data.others[it.i],
            it.x,
            it.y,
            it.k,
            avatars.get(data.others[it.i].userId),
            it.lod,
            it.tier,
            t,
          );
        }

        // ---- 自己：第一人称的「脚底星芒」固定于画面底部中央 ----
        drawSelf(ctx, data.self, selfX, selfY, t, avatars.get(data.self.userId));

        // 悬停名片实时跟随节点位置（相机在移动，节点屏幕位每帧在变）
        if (hoverRef.current) {
          let pos: { x: number; y: number } | null = null;
          if (hoverRef.current.userId === data.self.userId) {
            pos = { x: selfX, y: selfY };
          } else {
            const idx = data.others.findIndex((o) => o.userId === hoverRef.current!.userId);
            if (idx >= 0) {
              const p = otherProj(idx);
              if (p) pos = { x: p.x, y: p.y };
            }
          }
          if (pos) {
            hoverRef.current.x = pos.x;
            hoverRef.current.y = pos.y;
            positionCard(pos.x, pos.y);
          }
        }
      } catch (err) {
        // 技术细节只进控制台，画布上给用户可读的中文提示
        console.error("[StarMapCanvas] draw error:", err);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = "#ef4444";
        ctx.font = "13px system-ui, sans-serif";
        ctx.textAlign = "left";
        ctx.fillText("认知星图渲染出错，请刷新页面重试", 16, 32);
      }

      if (pageVisible) raf = requestAnimationFrame(draw);
    };
    document.addEventListener("visibilitychange", onVisibility);
    raf = requestAnimationFrame(draw);

    // ---- 交互（第一人称）：拖拽 = 左右转头环视（仅 yaw）、滚轮 = 沿视线走近/走远、
    //      悬停 = 名片、点击 = 跳转 / 连线详情 / 陌生星云轮换 ----
    let dragging = false;
    let moved = 0;
    let lastX = 0;
    let lastY = 0;

    const positionCard = (nodeX: number, nodeY: number) => {
      const card = cardRef.current;
      if (!card) return;
      const cw = 224;
      const ch = 120;
      let tx = nodeX + 14;
      let ty = nodeY + 14;
      if (tx + cw > width) tx = nodeX - cw - 14;
      if (ty + ch > height) ty = nodeY - ch - 14;
      card.style.transform = `translate(${tx}px, ${ty}px)`;
      card.style.opacity = "1";
    };

    type CanvasHit =
      | { kind: "node"; node: StarMapOtherNode | StarMapSelfNode; x: number; y: number }
      | { kind: "cluster"; index: number; x: number; y: number };

    const hitTest = (px: number, py: number): CanvasHit | null => {
      const anchor = selfAnchor();

      // 自己（脚底星芒）优先：点击进入自己的工作台
      if (Math.hypot(px - anchor.x, py - anchor.y) <= SELF_RADIUS + 14) {
        return { kind: "node", node: data.self, x: anchor.x, y: anchor.y };
      }

      // 其他光点（陌生星云模式下仅窗口内点亮的陌生人参与命中）
      const expanded = isExpanded();
      for (let i = 0; i < data.others.length; i++) {
        if (
          positions[i].tier === "stranger" &&
          !expanded &&
          !isStrangerVisible(i)
        ) {
          continue;
        }
        const p = otherProj(i);
        if (!p || !isOnScreen(p.x, p.y, 60)) continue;
        const r = nodeHitRadius(p.k);
        if (Math.hypot(px - p.x, py - p.y) <= Math.max(r + 8, 14)) {
          return { kind: "node", node: data.others[i], x: p.x, y: p.y };
        }
      }

      // 星云簇
      if (clusterMode && !expanded) {
        for (let k = 0; k < clusterAnchors.length; k++) {
          const cp = clusterProj(k);
          if (!cp || !isOnScreen(cp.x, cp.y, 60)) continue;
          if (Math.hypot(px - cp.x, py - cp.y) <= 34) {
            return { kind: "cluster", index: k, x: cp.x, y: cp.y };
          }
        }
      }
      return null;
    };

    const handleClickAt = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      const px = clientX - rect.left;
      const py = clientY - rect.top;
      const anchor = selfAnchor();

      const hit = hitTest(px, py);
      // 自己 → 进入工具台；其他光点 → 进入公开主页
      if (hit?.kind === "node") {
        if (hit.node.userId === data.self.userId) {
          router.push("/dashboard");
        } else {
          router.push(`/u/${hit.node.userId}`);
        }
        return;
      }
      // 陌生星云 → 窗口滑动，唤来一批新面孔
      if (hit?.kind === "cluster") {
        strangerWindow =
          (strangerWindow + STRANGER_SPOTLIGHT_MAX) % strangerIndexes.length;
        // 被换下的旧面孔可能正被悬停，清理卡片；星云给一个扩散脉冲作反馈
        hoverRef.current = null;
        setHoverNode(null);
        nebulaHover = -1;
        nebulaBurst = performance.now() + 450;
        return;
      }

      // 引用连线命中 → 显示详情（在第一人称里即“从我的光束上点一下”）
      const selfPos = { x: anchor.x, y: anchor.y };
      for (let i = 0; i < refLines.length; i++) {
        const line = refLines[i];
        const tgt = targetProj(line.targetUserId);
        if (!tgt) continue;
        const a = tgt.x - selfPos.x;
        const b = tgt.y - selfPos.y;
        const len = Math.hypot(a, b);
        if (len < 1) continue;
        const d = Math.abs(a * (selfPos.y - py) - (selfPos.x - px) * b) / len;
        if (d < 12) {
          const item = connections.references.find((r) => r.id === line.id);
          if (item) {
            setDetail(item);
            return;
          }
        }
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      idleSpin = false; // 用户上手即定格，之后由他掌控视角
      dragging = true;
      moved = 0;
      lastX = e.clientX;
      lastY = e.clientY;
      // 拖拽期间隐藏悬停名片与星云提示，避免相机移动时提示跟着跳动
      hoverRef.current = null;
      setHoverNode(null);
      if (nebulaHover !== -1) nebulaHover = -1;
      try {
        canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) {
        const rect = canvas.getBoundingClientRect();
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const hit = hitTest(px, py);
        if (hit?.kind === "node") {
          if (nebulaHover !== -1) nebulaHover = -1;
          if (hoverRef.current?.userId !== hit.node.userId) {
            hoverRef.current = { userId: hit.node.userId, x: hit.x, y: hit.y };
            setHoverNode(hit.node);
            positionCard(hit.x, hit.y);
          } else if (
            Math.hypot(hit.x - hoverRef.current.x, hit.y - hoverRef.current.y) > 6
          ) {
            hoverRef.current.x = hit.x;
            hoverRef.current.y = hit.y;
            positionCard(hit.x, hit.y);
          }
        } else if (hit?.kind === "cluster") {
          // 星云簇悬停：关闭用户名片，画布内绘制提示（nebulaHover 供 draw 读取）
          hoverRef.current = null;
          setHoverNode(null);
          nebulaHover = hit.index;
        } else {
          hoverRef.current = null;
          setHoverNode(null);
          if (nebulaHover !== -1) nebulaHover = -1;
        }
        return;
      }
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      lastX = e.clientX;
      lastY = e.clientY;
      // 拖动 → 只做水平环视（“抓住星空往哪拖就往哪看”）：
      // 旅人全部排在水平星带上，上下俯仰没有意义，因此锁定 cam.pitch，
      // 只允许左右转头（yaw）与滚轮缩放（zoom）。
      cam.yaw += dx * ROTATE_SPEED;
    };
    const onPointerUp = (e: PointerEvent) => {
      dragging = false;
      if (moved <= DRAG_CLICK_THRESHOLD) {
        handleClickAt(e.clientX, e.clientY);
      }
    };
    const onPointerLeave = () => {
      hoverRef.current = null;
      setHoverNode(null);
      if (nebulaHover !== -1) nebulaHover = -1;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // 滚轮 = 沿视线推进：向下滚走近人群、向上滚拉远看全景
      const oldZoom = cam.zoom;
      const newZoom = clamp(oldZoom * (1 - e.deltaY * 0.0011), ZOOM_MIN, ZOOM_MAX);
      if (newZoom !== oldZoom) cam.zoom = newZoom;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("wheel", onWheel, { passive: false });

    /** 复位视角：一键回到初始站位（对准最热闹扇区 + 缓缓环视） */
    resetViewRef.current = () => {
      cam.yaw = pickBestInitialYaw(positions);
      cam.pitch = 0;
      cam.zoom = 1.0; // 复位也保持默认广角，满屏头像
      idleSpin = true; // 回到初始站位 = 重新进入“缓缓环视”
      hoverRef.current = null;
      setHoverNode(null);
      if (nebulaHover !== -1) nebulaHover = -1;
    };

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [data, positions, router, refLines, weakLines, connections.references]);

  return (
    <>
      <div
        ref={containerRef}
        className="starmap-sky absolute inset-0 overflow-hidden"
      >
        {/* 背景层：深空渐变 + 微弱星点（原认知星海氛围） */}
        <div className="pointer-events-none absolute inset-0 z-0">
          {BG_STARS.map((s, i) => (
            <span
              key={i}
              className="absolute rounded-full bg-slate-200/80"
              style={{
                left: `${s.left}%`,
                top: `${s.top}%`,
                width: s.size,
                height: s.size,
                opacity: s.opacity,
              }}
            />
          ))}
        </div>
        {/* 前景层：星图（透明画布，光点 / 连线 / 自己头像） */}
        <canvas
          ref={canvasRef}
          className="relative z-10 block h-full w-full touch-none select-none"
          aria-label="识界·星图·第一人称：你站在人群中央，拖动环视周围，滚轮走近查看旅人，悬停光点查看简介，点击光点进入对方主页，点击光束查看引用详情，点击陌生星云唤来一批新面孔，脚底光点可回到自己的工作台"
        />
        {/* 暗角：四周轻微压暗聚焦中心，给巨云星海留出呼吸（不挡交互） */}
        <div className="pointer-events-none absolute inset-0 z-[15] bg-[radial-gradient(ellipse_at_center,transparent_62%,rgba(2,6,23,0.34)_100%)]" />
      </div>

      {/* 第一人称引导：轻量叠加在左下角，不挡交互 */}
      <div className="pointer-events-none absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-20 flex flex-col gap-1 text-[11px] leading-relaxed text-white/55">
        <span className="backdrop-blur-sm">
          拖动环视 · 滚轮走近 · 悬停查看简介 · 点击光点进入主页
        </span>
      </div>

      {/* 视角控制：回到人群中心（初始站位） */}
      <div className="pointer-events-auto absolute bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 z-20 flex flex-col items-end gap-2">
        <button
          onClick={() => resetViewRef.current()}
          title="回到初始站位：正前方全景 + 缓缓环视"
          aria-label="复位视角"
          className="inline-flex items-center gap-1.5 rounded-full bg-black/30 px-3 py-1.5 text-xs text-white/85 ring-1 ring-white/15 backdrop-blur transition hover:bg-black/50"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          复位视角
        </button>
      </div>

      {/* 悬停认知名片：使用对方装扮背景，无装扮则用默认渐变 */}
      <div
        ref={cardRef}
        className={`pointer-events-none absolute left-0 top-0 z-20 w-56 overflow-hidden rounded-xl border border-white/20 p-3 shadow-xl backdrop-blur transition-opacity duration-150 ${
          hoverNode?.cardBackground
            ? ""
            : "bg-gradient-to-r from-accent-600 via-violet-600 to-fuchsia-600"
        } ${hoverNode ? "opacity-100" : "opacity-0"}`}
        style={{
          transform: hoverNode ? undefined : "translate(-9999px, -9999px)",
          background: hoverNode?.cardBackground ?? undefined,
        }}
      >
        {/* 压暗遮罩，保证文字在各种背景下都可读 */}
        <div className="absolute inset-0 rounded-xl bg-black/40" />
        {hoverNode ? (
          <div className="relative z-10">
            <div className="flex items-center gap-2.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  hoverNode.avatar ??
                  `https://api.dicebear.com/9.x/initials/svg?seed=${hoverNode.nickname}`
                }
                alt={hoverNode.nickname}
                className="h-10 w-10 rounded-full object-cover ring-1 ring-white/40"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-100">
                  {hoverNode.nickname}
                </p>
                <p className="text-[10px] text-slate-200/80">
                  {hoverNode.userId === data.self.userId ? "我" : "认知旅人"}
                </p>
              </div>
            </div>
            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-slate-100/90">
              {hoverNode.bio ?? "这位旅人还没有写下简介。"}
            </p>
            <p className="mt-2 text-[10px] text-slate-300/70">
              {hoverNode.userId === data.self.userId
                ? "点击自己头像回到工作台"
                : "点击光点进入 TA 的认知空间"}
            </p>
          </div>
        ) : null}
      </div>

      {/* 连线详情弹层 */}
      {detail ? (
        <div
          className="absolute inset-x-0 bottom-24 z-20 flex justify-center px-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-sm rounded-2xl bg-slate-900/95 p-4 shadow-lg ring-1 ring-slate-700 backdrop-blur">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-slate-100">
                {detail.direction === "outgoing" ? "我引用了" : "引用了我"} · {detail.otherUser.nickname}
              </p>
              <button
                onClick={() => setDetail(null)}
                aria-label="关闭详情"
                className="rounded-full p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 space-y-1 text-xs text-slate-300">
              {detail.citerAtom ? (
                <p className="line-clamp-2">
                  <span className="text-slate-500">引用自：</span>
                  {truncate(detail.citerAtom.coreQuestion, 40)}
                </p>
              ) : null}
              {detail.citedAtom ? (
                <p className="line-clamp-2">
                  <span className="text-slate-500">被引用：</span>
                  {truncate(detail.citedAtom.coreQuestion, 40)}
                </p>
              ) : null}
              {detail.note ? (
                <p className="line-clamp-2">
                  <span className="text-slate-500">说明：</span>
                  {truncate(detail.note, 60)}
                </p>
              ) : null}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => router.push(`/u/${detail.otherUser.userId}`)}
                className="flex-1 rounded-lg bg-accent-500 py-2 text-xs font-medium text-white transition hover:bg-accent-600"
              >
                进入对方主页
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
