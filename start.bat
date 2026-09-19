@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

echo ==========================================
echo    知识平台 - 一键启动
echo ==========================================
echo.

REM ---------- [1/5] 检查环境与依赖 ----------
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装 Node 20 或更高版本。
  pause & exit /b 1
)

echo [1/5] 检查依赖...
if not exist "frontend\node_modules" (
  echo   安装前端依赖，请稍候...
  call npm --prefix frontend install
)
if not exist "backend\node_modules" (
  echo   安装后端依赖，请稍候...
  call npm --prefix backend install
)
if not exist "node_modules\.bin\pm2.cmd" (
  echo   安装 pm2 进程守护...
  call npm install --save-dev pm2
)

REM ---------- [2/5] 检查数据库 ----------
echo [2/5] 检查数据库容器...
docker info >nul 2>nul
if errorlevel 1 (
  echo.
  echo [错误] Docker 没有运行！后端依赖 Docker 里的 PostgreSQL 数据库。
  echo   请先启动 Docker Desktop（桌面图标），等待提示 Docker Desktop is running，
  echo   然后再双击运行本脚本。
  echo.
  pause & exit /b 1
)
docker ps --format "{{.Names}}" 2>nul | findstr /c:"zhishi-postgres" >nul
if errorlevel 1 (
  echo   正在启动 PostgreSQL 容器...
  docker start zhishi-postgres >nul 2>nul
  if errorlevel 1 docker compose up -d postgres
)
REM Redis 可选：未启动时后端自动降级为内存存储
docker start zhishi-redis >nul 2>nul
REM 等待数据库端口就绪（最多 30 秒）
set /a DB_WAIT=0
:DB_WAIT_LOOP
netstat -ano | findstr "LISTENING" | findstr ":5432" >nul
if not errorlevel 1 goto DB_READY
set /a DB_WAIT+=1
if %DB_WAIT% LSS 15 (
  timeout /t 2 /nobreak >nul
  goto DB_WAIT_LOOP
)
echo [警告] 数据库端口 5432 未能就绪，后端可能启动失败。
:DB_READY

REM ---------- [3/5] 检查端口冲突 ----------
echo [3/5] 检查端口占用...
netstat -ano | findstr "LISTENING" | findstr /c:":3000 " >nul
if not errorlevel 1 (
  echo   [警告] 端口 3000 已被占用（前端）。若是残留的旧进程，请先运行 fix.bat 清理。
)
netstat -ano | findstr "LISTENING" | findstr /c:":3001 " >nul
if not errorlevel 1 (
  echo   [警告] 端口 3001 已被占用（后端）。若是残留的旧进程，请先运行 fix.bat 清理。
)

REM ---------- [4/5] 编译后端 ----------
echo [4/5] 编译后端（约 30~60 秒，请耐心等待）...
call npm --prefix backend run build
if errorlevel 1 (
  echo.
  echo [错误] 后端编译失败！请检查 backend\src 下的代码语法，
  echo   或运行 fix.bat 清理残留进程后重试。
  pause & exit /b 1
)

REM ---------- [5/5] 启动服务（pm2 守护） ----------
echo [5/5] 启动服务（pm2 守护，关闭窗口不影响）...
if not exist logs mkdir logs

REM 按应用名清理（兼容由 ecosystem.prod.config.js 启动的生产模式进程），
REM 保证从生产模式切回开发模式时不会因同名进程导致启动失败。
call node_modules\.bin\pm2.cmd delete zhishi-backend >nul 2>nul
call node_modules\.bin\pm2.cmd delete zhishi-frontend >nul 2>nul
call node_modules\.bin\pm2.cmd delete ecosystem.config.js >nul 2>nul
call node_modules\.bin\pm2.cmd delete ecosystem.prod.config.js >nul 2>nul

REM 若之前跑过生产模式（.next 中存在 BUILD_ID），其构建产物会让 dev 模式错乱，
REM 需要清理；纯 dev 缓存（无 BUILD_ID）则保留，避免每次都要冷编译。
if exist "frontend\.next\BUILD_ID" (
  echo   清理生产构建缓存 frontend\.next ...
  rmdir /s /q "frontend\.next"
)

REM 清理未被 pm2 托管的残留进程（手动 dev 启动、旧版本残留等），
REM 避免新进程 EADDRINUSE 抢占端口失败。监听失败时后端进程会立即退出，
REM 此处先杀干净再启动，确保 3000/3001 由本次 pm2 全新接管。
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr /c:":3000 "') do (
  echo   清理残留进程 PID %%p (3000)
  taskkill /F /T /PID %%p >nul 2>nul
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr /c:":3001 "') do (
  echo   清理残留进程 PID %%p (3001)
  taskkill /F /T /PID %%p >nul 2>nul
)
timeout /t 2 /nobreak >nul
call node_modules\.bin\pm2.cmd start ecosystem.config.js
call node_modules\.bin\pm2.cmd save >nul

REM ---------- 等待后端就绪 ----------
echo 等待后端就绪（最长约 2 分钟）...
set /a WAITED=0
:WAIT_LOOP
timeout /t 10 /nobreak >nul
curl.exe -s -o NUL http://localhost:3001/health >nul 2>nul
if errorlevel 1 goto WAIT_NEXT
goto READY
:WAIT_NEXT
set /a WAITED+=1
if %WAITED% LSS 12 goto WAIT_LOOP
echo.
echo [警告] 后端未在预期时间内就绪。
echo 请运行 status.bat 查看健康检查，或运行 fix.bat 一键修复。
echo 提示：若端口被残留进程占用导致启动失败，请先运行 fix.bat。
goto DONE

:READY
echo.
echo ==========================================
echo   后端已就绪 http://localhost:3001
echo ==========================================
echo.
REM 前端（Next.js 开发模式）首次冷启动编译约需 2~4 分钟，属正常现象，
REM 后端已就绪即可正常使用，前端编译完成后自动可访问。
curl.exe -s -o NUL http://localhost:3000 >nul 2>nul
if errorlevel 1 (
  echo 前端 http://localhost:3000 正在编译（首次约 2~4 分钟），
  echo 编译完成后浏览器自动打开，请耐心等待...
  start http://localhost:3000
) else (
  start http://localhost:3000
)

:DONE
echo.
echo 管理命令：
echo   一键检查：  status.bat
echo   一键修复：  fix.bat（清理残留进程、重新编译、重启）
echo   一键停止：  stop.bat
echo.
pause
