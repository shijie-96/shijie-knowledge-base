/** @type {import('next').NextConfig} */
const nextConfig = {
  // 生产独立部署：输出 standalone（Docker 场景无需 node_modules 全量）
  output: "standalone",
  reactStrictMode: true,
  // 安全：隐藏框架指纹
  poweredByHeader: false,
  // 包体积优化：lucide-react 只打包用到的图标（替代全量导入）
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
  images: {
    formats: ["image/avif", "image/webp"],
  },
  // 本地开发代理：浏览器端 API 走同源 /api（见 lib/axios.ts），
  // 开发时由 Next 转发到后端 3001（后端无 /api 前缀）。
  // 生产环境由 Nginx 剥掉 /api 前缀反代，请求到不了 Next，此规则不影响生产。
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:3001/:path*",
      },
      // 头像 / 用户上传：开发环境由 Next 代理到后端静态目录，避免浏览器跨端口
      // 生产环境由 Nginx 直接 serve 静态目录，此规则不生效
      {
        source: "/uploads/:path*",
        destination: "http://127.0.0.1:3001/uploads/:path*",
      },
    ];
  },
  webpack(config) {
    // 代码分割：第三方依赖独立拆包，提升缓存命中率与首屏并行下载
    if (config.optimization && config.optimization.splitChunks) {
      const cacheGroups = config.optimization.splitChunks.cacheGroups || {};
      config.optimization.splitChunks.cacheGroups = {
        ...cacheGroups,
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: "vendor",
          chunks: "all",
        },
        lucide: {
          test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
          name: "lucide",
          chunks: "all",
        },
      };
    }
    return config;
  },
};

export default nextConfig;
