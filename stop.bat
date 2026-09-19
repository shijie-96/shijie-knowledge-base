@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

echo 正在停止知识平台服务...
REM 同时停止开发/生产两种配置启动的进程（按应用名统一清理）
call node_modules\.bin\pm2.cmd stop zhishi-backend >nul 2>nul
call node_modules\.bin\pm2.cmd stop zhishi-frontend >nul 2>nul
call node_modules\.bin\pm2.cmd delete zhishi-backend >nul 2>nul
call node_modules\.bin\pm2.cmd delete zhishi-frontend >nul 2>nul
call node_modules\.bin\pm2.cmd delete ecosystem.config.js >nul 2>nul
call node_modules\.bin\pm2.cmd delete ecosystem.prod.config.js >nul 2>nul

REM 结束占用 3000 / 3001 的残留进程（含 pm2 派生、手动 dev 启动），
REM 确保停止后端口完全释放，下次 start.bat 不会 EADDRINUSE。
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr /c:":3000 "') do (
  echo   结束残留进程 PID %%p (3000)
  taskkill /F /T /PID %%p >nul 2>nul
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr /c:":3001 "') do (
  echo   结束残留进程 PID %%p (3001)
  taskkill /F /T /PID %%p >nul 2>nul
)

echo.
echo 已停止，3000 / 3001 端口已释放。再次启动请双击 start.bat。
pause
