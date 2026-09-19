// pm2 进程编排：zhishi2.0 一键启动配置
// 由 pm2 守护进程托管前后端，关闭任何终端窗口都不会影响服务。
const path = require('path');

const ROOT = __dirname;

module.exports = {
  apps: [
    {
      // 说明：不启用 nest --watch。
      // Windows 下 watch 重编译会删除 dist/，若文件被残留进程/杀软锁定会报
      // EPERM 崩溃，Nest CLI 清理进程时 taskkill 已死 PID 又抛未捕获异常，
      // 形成“崩溃-重启”死循环，导致 3001 端口无人监听、前端报 Network Error。
      // 因此这里直接运行编译产物，代码变更后执行 start.bat（会自动重新 build）。
      name: 'zhishi-backend',
      cwd: path.join(ROOT, 'backend'),
      script: path.join(ROOT, 'backend', 'dist', 'src', 'main.js'),
      args: '',
      autorestart: true,          // 崩溃自动拉起
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
      name: 'zhishi-frontend',
      cwd: path.join(ROOT, 'frontend'),
      script: 'node_modules/next/dist/bin/next',
      // 默认 dev；设 FE_MODE=prod 则跑已构建产物（next start，不做文件监听）
      args: process.env.FE_MODE === 'prod' ? 'start' : 'dev',
      autorestart: true,
      max_restarts: 10,
      min_uptime: 5000,
      restart_delay: 2000,
      out_file: path.join(ROOT, 'logs', 'frontend.out.log'),
      error_file: path.join(ROOT, 'logs', 'frontend.err.log'),
      merge_logs: true,
      time: true,
      env: { NODE_ENV: 'development' }
    }
  ]
};
