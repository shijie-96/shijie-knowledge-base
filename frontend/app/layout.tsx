import type { Metadata, Viewport } from "next";
import "./globals.css";
import GlobalNav from "@/components/navigation/GlobalNav";
import ThemeHydrator from "@/components/ThemeHydrator";

export const metadata: Metadata = {
  title: "识界",
  description: "识界——认知无界，成长无限。记录、整理、复用你的知识。",
  manifest: "/manifest.webmanifest",
  applicationName: "识界",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "识界",
  },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#0D9488", // 主品牌色 Teal · 与 globals.css --accent-600 同步
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/*
          主题启动脚本：在 body 渲染前同步决定明/暗（防首屏闪烁）。
          当前策略：始终跟随系统（prefers-color-scheme），不提供手动切换。
          历史本地偏好（shijie:theme）已废弃，加载时顺手清除避免干扰。
        */}
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=document.documentElement;var dark=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;d.classList.toggle('dark',!!dark);d.classList.toggle('light',!dark);try{localStorage.removeItem('shijie:theme');}catch(e){}}catch(e){}})();`,
          }}
        />
        {/*
          视觉自定义恢复脚本：body 首帧渲染前把用户存于 localStorage 的主题
          写回 <html> 的 CSS 变量，避免刷新后短暂回到默认样式再跳变。
          逻辑与 lib/ui-theme.ts 的 applyThemeToRoot 保持一致（两边需同步）。
        */}
        <script
          id="visual-theme-init"
          dangerouslySetInnerHTML={{
            __html: `(function () {
              try {
                var KEY = 'shijie_visual_theme_v1';
                var raw = localStorage.getItem(KEY);
                if (!raw) return;
                var t = JSON.parse(raw);
                if (!t || typeof t !== 'object') return;
                var s = document.documentElement.style;
                var clamp = function (v, mn, mx) { return Math.min(mx, Math.max(mn, v)); };
                var hexSpaced = function (h) {
                  var x = (h || '#000000').replace('#', '');
                  if (x.length === 3) x = x.split('').map(function (c) { return c + c; }).join('');
                  if (x.length !== 6) x = '000000';
                  var n = parseInt(x, 16);
                  if (isNaN(n)) return '0 0 0';
                  return ((n >> 16) & 255) + ' ' + ((n >> 8) & 255) + ' ' + (n & 255);
                };
                var rgba = function (h, a) {
                  var c = hexSpaced(h).split(' ');
                  return 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + a + ')';
                };
                var url = (t.bgImageUrl || '').trim();
                // 防御：blob URL 会话级有效，跨刷新必然失效；
                // 若存储里意外残留，首帧退回占位缩略图，等 ThemeHydrator 从 IndexedDB 恢复原图
                if (t.bgImageDb && url.indexOf('blob:') === 0) { url = t.bgImageThumb || ''; }
                s.setProperty('--ui-body-img', url ? 'url("' + url + '")' : 'none');
                s.setProperty('--ui-body-cover', hexSpaced(t.bgCoverColor || '#020617'));
                s.setProperty('--ui-body-cover-opacity', String(clamp(Number(t.bgCoverOpacity) || 0, 0, 1)));
                if (url) { document.documentElement.setAttribute('data-body-img', 'true'); }
                else { document.documentElement.removeAttribute('data-body-img'); }
                s.setProperty('--ui-radius-scale', String(clamp(Number(t.radiusScale) || 1, 0.5, 2.5)));
                s.setProperty('--ui-border-scale', String(clamp(Number(t.borderScale) || 1, 0, 3)));
                var sc = clamp(Number(t.shadowScale) || 1, 0, 2);
                var BASE = {
                  sm: [{ y: 1, b: 2, s: 0, a: 0.05 }],
                  d: [{ y: 1, b: 3, s: 0, a: 0.1 }, { y: 1, b: 2, s: -1, a: 0.1 }],
                  md: [{ y: 4, b: 6, s: -1, a: 0.1 }, { y: 2, b: 4, s: -2, a: 0.1 }],
                  lg: [{ y: 10, b: 15, s: -3, a: 0.1 }, { y: 4, b: 6, s: -4, a: 0.1 }],
                  xl: [{ y: 20, b: 25, s: -5, a: 0.1 }, { y: 8, b: 10, s: -6, a: 0.1 }],
                  '2xl': [{ y: 25, b: 50, s: -12, a: 0.25 }],
                  inner: [{ y: 2, b: 4, s: 0, a: 0.05, i: 1 }]
                };
                var fmt = function (k) {
                  if (sc <= 0) return 'none';
                  return BASE[k].map(function (l) {
                    var inset = l.i ? 'inset ' : '';
                    return inset + '0px ' + Math.round(l.y * sc * 10) / 10 + 'px ' + Math.round(l.b * sc * 10) / 10 + 'px ' + Math.round(l.s * sc * 10) / 10 + 'px rgb(0 0 0 / ' + l.a + ')';
                  }).join(', ');
                };
                s.setProperty('--ui-sh-sm', fmt('sm'));
                s.setProperty('--ui-sh-d', fmt('d'));
                s.setProperty('--ui-sh-md', fmt('md'));
                s.setProperty('--ui-sh-lg', fmt('lg'));
                s.setProperty('--ui-sh-xl', fmt('xl'));
                s.setProperty('--ui-sh-2xl', fmt('2xl'));
                s.setProperty('--ui-sh-inner', fmt('inner'));
                var sf = t.surface || {};
                var a0 = sf.bgOpacity === undefined ? 1 : Number(sf.bgOpacity);
                var alpha = clamp(isNaN(a0) ? 1 : a0, 0, 1);
                s.setProperty('--ui-bd-color', sf.borderColor || '#e2e8f0');
                var c1 = rgba(sf.bgColorA || '#ffffff', alpha);
                if (sf.gradient) {
                  s.setProperty('--ui-surface-bg', 'linear-gradient(135deg, ' + c1 + ' 0%, ' + rgba(sf.bgColorB || '#e0e7ff', alpha) + ' 100%)');
                } else {
                  s.setProperty('--ui-surface-bg', c1);
                }
              } catch (e) {}
            })();`,
          }}
        />
        {/* PWA：Service Worker 注册（加载完成后注册，失败仅告警不影响页面） */}
        <script
          id="pwa-sw-register"
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function () {
                  navigator.serviceWorker.register('/sw.js').catch(function (err) {
                    console.warn('[PWA] SW 注册失败：', err);
                  });
                });
              }
            `,
          }}
        />
      </head>
      <body className="antialiased">
        {children}
        <GlobalNav />
        {/*
          视觉主题水合：挂载后若主题带 bgImageDb 标记，则从 IndexedDB
          读回原图替换首帧占位缩略图，恢复全画质背景（见 ThemeHydrator.tsx）
        */}
        <ThemeHydrator />
      </body>
    </html>
  );
}
