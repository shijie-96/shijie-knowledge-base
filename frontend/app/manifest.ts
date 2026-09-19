import type { MetadataRoute } from "next";

// PWA 应用清单：手机浏览器"添加到主屏幕"后，
// 生成独立图标 + 全屏窗口的 App 入口
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "识界",
    short_name: "识界",
    description: "识界——认知无界，成长无限。记录、整理、复用你的知识。",
    id: "/",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8fafc",
    theme_color: "#4f46e5",
    lang: "zh-CN",
    dir: "ltr",
    categories: ["education", "productivity", "knowledge"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "知识库",
        short_name: "知识库",
        description: "浏览知识图谱与知识原子",
        url: "/atoms",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
      {
        name: "智能助手",
        short_name: "助手",
        description: "与智能助手对话",
        url: "/assistant",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      },
    ],
  };
}
