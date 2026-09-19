import type { Config } from "tailwindcss";

const config: Config = {
  // 明/暗主题由 html 上的 .dark/.light class 显式驱动
  // （脚本在 head 同步写入，避免首屏闪烁；system=跟随系统时脚本按媒体查询换算）
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          '"PingFang SC"',
          '"HarmonyOS Sans SC"',
          "MiSans",
          '"Noto Sans SC"',
          '"Source Han Sans SC"',
          '"Microsoft YaHei"',
          '"Helvetica Neue"',
          "sans-serif",
        ],
        // 用于大数字 / 度量感的拉丁字：等宽数字 + 几何感
        metric: [
          '"SF Mono"',
          '"JetBrains Mono"',
          "ui-monospace",
          "Menlo",
          "Consolas",
          '"Courier New"',
          "monospace",
        ],
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // 识界 · 深空域（引力场窗口 / 星图通用；有界使用，禁止铺满正文）
        space: {
          950: "#04060D",
          900: "#070B16",
          850: "#0A1020",
          800: "#101831",
          700: "#1B2540",
          600: "#2B3660",
          500: "#42517A",
          400: "#5C6E9E",
        },
        // 识界 · 月白浅色域（工具台正文 / 效率页）
        mist: {
          25: "#FBFCFE",
          50: "#F5F7FB",
          100: "#EDF1F8",
          200: "#E0E6F0",
          300: "#C8D2E2",
          400: "#9BA8C0",
          500: "#74819B",
          600: "#56637D",
          700: "#3D4860",
          800: "#2A3450",
          900: "#1B2237",
          950: "#12172B",
        },
        // 深空里的暖星尘（与 warn 呼应；正文勿用）
        stardust: {
          300: "#F5DEA0",
          400: "#ECC97C",
          500: "#DFB45A",
        },
        /* ===== 语义色层 · 全站换肤的唯一开关 =====
         * 页面代码只用三套语义令牌：
         *   · accent    → 品牌主强调（蓝绿 teal · 2026-09 换肤后）
         *   · cta       → 主行动按钮（橙 orange · 单屏最多 1 个）
         *   · warn      → 警示 / 待处理（琥珀 amber）
         * 三套全部指向 CSS 变量，默认值在 app/globals.css「全站换肤层」里。
         * 想整体换风格：只改那一个文件里的 --accent-* / --cta-* / --warn-*，
         * 或运行期给 :root 覆写变量 —— 全站页面随之更换，无需触碰组件。
         */
        accent: {
          50: "rgb(var(--accent-50) / <alpha-value>)",
          100: "rgb(var(--accent-100) / <alpha-value>)",
          200: "rgb(var(--accent-200) / <alpha-value>)",
          300: "rgb(var(--accent-300) / <alpha-value>)",
          400: "rgb(var(--accent-400) / <alpha-value>)",
          500: "rgb(var(--accent-500) / <alpha-value>)",
          600: "rgb(var(--accent-600) / <alpha-value>)",
          700: "rgb(var(--accent-700) / <alpha-value>)",
          800: "rgb(var(--accent-800) / <alpha-value>)",
          900: "rgb(var(--accent-900) / <alpha-value>)",
          950: "rgb(var(--accent-950) / <alpha-value>)",
        },
        warn: {
          50: "rgb(var(--warn-50) / <alpha-value>)",
          100: "rgb(var(--warn-100) / <alpha-value>)",
          200: "rgb(var(--warn-200) / <alpha-value>)",
          300: "rgb(var(--warn-300) / <alpha-value>)",
          400: "rgb(var(--warn-400) / <alpha-value>)",
          500: "rgb(var(--warn-500) / <alpha-value>)",
          600: "rgb(var(--warn-600) / <alpha-value>)",
          700: "rgb(var(--warn-700) / <alpha-value>)",
          800: "rgb(var(--warn-800) / <alpha-value>)",
          900: "rgb(var(--warn-900) / <alpha-value>)",
          950: "rgb(var(--warn-950) / <alpha-value>)",
        },
        /* CTA · Orange 橙系（主行动按钮专用色阶）
         * 铁律：单屏最多 1 个 cta-* 元素；与 accent(品牌) 区分语义 */
        cta: {
          50: "rgb(var(--cta-50) / <alpha-value>)",
          100: "rgb(var(--cta-100) / <alpha-value>)",
          200: "rgb(var(--cta-200) / <alpha-value>)",
          300: "rgb(var(--cta-300) / <alpha-value>)",
          400: "rgb(var(--cta-400) / <alpha-value>)",
          500: "rgb(var(--cta-500) / <alpha-value>)",
          600: "rgb(var(--cta-600) / <alpha-value>)",
          700: "rgb(var(--cta-700) / <alpha-value>)",
          800: "rgb(var(--cta-800) / <alpha-value>)",
          900: "rgb(var(--cta-900) / <alpha-value>)",
          950: "rgb(var(--cta-950) / <alpha-value>)",
        },
      },
      /* ===== 圆角 · 渐变深度 · 过渡曲线 · 动效 =====
       * 视觉自定义后，rounded-* / border-* / shadow-* 全部读 CSS 变量，
       * 默认值 = 原视觉（scale=1），设置面板实时调整 → 全站按钮/卡片/弹窗统一联动。
       * 变量定义见 app/globals.css「网页视觉自定义主题令牌层」。 */
      borderRadius: {
        none: "0px",
        sm: "var(--ui-r-sm)",
        DEFAULT: "var(--ui-r-d)", // rounded
        md: "var(--ui-r-md)",
        lg: "var(--ui-r-lg)",
        xl: "var(--ui-r-xl)",
        "2xl": "var(--ui-r-2xl)",
        "3xl": "var(--ui-r-3xl)",
        card: "var(--ui-r-card)", // 12px · 卡片
        panel: "var(--ui-r-panel)", // 16px · 模态/抽屉
        pill: "9999px", // 全圆 · 徽章/标签
      },
      borderWidth: {
        DEFAULT: "var(--ui-bw)", // border
        0: "0px",
        2: "var(--ui-bw2)",
        4: "var(--ui-bw4)",
        8: "var(--ui-bw8)",
      },
      boxShadow: {
        sm: "var(--ui-sh-sm)",
        DEFAULT: "var(--ui-sh-d)",
        md: "var(--ui-sh-md)",
        lg: "var(--ui-sh-lg)",
        xl: "var(--ui-sh-xl)",
        "2xl": "var(--ui-sh-2xl)",
        inner: "var(--ui-sh-inner)",
        "brand-sm": "0 1px 2px 0 rgb(20 184 166 / 0.08)", // 极淡蓝绿影
        "brand-md": "0 4px 12px 0 rgb(20 184 166 / 0.12)", // 卡片
        "brand-lg": "0 10px 30px 0 rgb(20 184 166 / 0.16)", // 抽屉/模态
        "cta-glow": "0 6px 20px 0 rgb(249 115 22 / 0.35)", // CTA 按钮悬浮辉光
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "in-out-soft": "cubic-bezier(0.4, 0, 0.2, 1)",
      },
      transitionDuration: {
        250: "250ms",
        400: "400ms",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "soft-pulse": {
          "0%, 100%": { opacity: "0.45" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "fade-up": "fade-up 400ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 250ms ease-out both",
        "soft-pulse": "soft-pulse 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
