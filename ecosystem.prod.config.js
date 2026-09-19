// pm2 进程编排：zhishi2.0 生产模式配置
// 前端不再实时编译（next start），性能明显优于开发模式，适合流畅性测试。
// 由 start-prod.bat 使用；切回开发模式请运行 start.bat。
const path = require('path');

const ROOT = __dirname;

module.exports = {
  apps: [
    {
      // 后端与开发模式相同：直接运行编译产物 dist。
      // 注意保持 NODE_ENV=development，与开发模式行为完全一致，避免影响后端逻辑。
      name: 'zhishi-backend',
      cwd: path.join(ROOT, 'backend'),
      script: path.join(ROOT, 'backend', 'dist', 'src', 'main.js'),
      args: '',
      autorestart: true,
      max_restarts: 10,
      min_uptime: 5000,
      restart_delay: 2000,
      out_file: path.join(ROOT, 'logs', 'backend.out.log'),
      error_file: path.join(ROOT, 'logs', 'backend.err.log'),
      merge_logs: true,
      time: true,
      env: { NODE_ENV: 'development' }
    },
    {
      // 前端生产模式：next start。前提是已执行 npm run build（start-prod.bat 会自动构建）。
      name: 'zhishi-frontend',
      cwd: path.join(ROOT, 'frontend'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      autorestart: true,
      max_restarts: 10,
      min_uptime: 5000,
      restart_delay: 2000,
      out_file: path.join(ROOT, 'logs', 'frontend-prod.out.log'),
      error_file: path.join(ROOT, 'logs', 'frontend-prod.err.log'),
      merge_logs: true,
      time: true,
      env: { NODE_ENV: 'production' }
    }
  ]
};
