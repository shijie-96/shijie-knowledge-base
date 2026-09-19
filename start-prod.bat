@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

echo ==========================================
echo    知识平台 - 生产模式启动
echo    （前端构建后运行，不再实时编译，流畅度明显提升）
echo ==========================================
echo.

REM ---------- [1/6] 检查环境与依赖 ----------
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未找到 Node.js，请先安装 Node 20 或更高版本。
  pause & exit /b 1
)

echo [1/6] 检查依赖...
if not exist "frontend\node_modules" (
  echo   安装前端依赖，请稍候...
  call npm --prefix frontend install
  if errorlevel 1 (
    echo [错误] 前端依赖安装失败。
    pause & exit /b 1
  )
)
if not exist "backend\node_modules" (
  echo   安装后端依赖，请稍候...
  call npm --prefix backend install
  if errorlevel 1 (
    echo [错误] 后端依赖安装失败。
    pause & exit /b 1
  )
)
if not exist "node_modules\.bin\pm2.cmd" (
  echo   安装 pm2 进程守护...
  call npm install --save-dev pm2
)

REM ---------- [2/6] 检查数据库 ----------
echo [2/6] 检查数据库容器...
docker info >nul 2>nul
if errorlevel 1 (
  echo.
  echo [错误] Docker 没有运行！后端依赖 Docker 里的 PostgreSQL 数据库。
  echo   请先启动 Docker Desktop（桌面图标），然后再运行本脚本。
  echo.
  pause & exit /b 1
)
docker ps --format "{{.Names}}" 2>nul | findstr /c:"zhishi-postgres" >nul
if errorlevel 1 (
  echo   正在启动 PostgreSQL 容器...
  docker start zhishi-postgres >nul 2>nul
  if errorlevel 1 docker compose up -d postgres
)
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

REM ---------- [3/6] 停止旧进程并清理端口 ----------
echo [3/6] 停止正在运行的开发/生产进程...
call node_modules\.bin\pm2.cmd delete zhishi-backend >nul 2>nul
call node_modules\.bin\pm2.cmd delete zhishi-frontend >nul 2>nul
call node_modules\.bin\pm2.cmd delete ecosystem.config.js >nul 2>nul
call node_modules\.bin\pm2.cmd delete ecosystem.prod.config.js >nul 2>nul

for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr /c:":3000 "') do (
  echo   结束残留进程 PID %%p (3000)
  taskkill /F /T /PID %%p >nul 2>nul
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr /c:":3001 "') do (
  echo   结束残留进程 PID %%p (3001)
  taskkill /F /T /PID %%p >nul 2>nul
)
timeout /t 2 /nobreak >nul

REM ---------- [4/6] 编译后端 ----------
echo [4/6] 编译后端（约 30~60 秒，请耐心等待）...
call npm --prefix backend run build
if errorlevel 1 (
  echo.
  echo [错误] 后端编译失败！请检查 backend\src 下的代码语法。
  pause & exit /b 1
)

REM ---------- [5/6] 构建前端生产版 ----------
echo [5/6] 构建前端生产版（首次约 2~5 分钟，请耐心等待）...
if exist "frontend\.next" (
  echo   清理旧编译缓存 frontend\.next ...
  rmdir /s /q "frontend\.next"
)
if exist "frontend\.next" (
  echo   [警告] .next 目录仍被占用（可能被杀毒软件或其它程序锁定），
  echo   可忽略该警告直接继续；如后续构建异常，请关闭相关程序后重试。
)
call npm --prefix frontend run build
if errorlevel 1 (
  echo.
  echo [错误] 前端构建失败！请查看上方错误日志。
  echo   提示：报错信息通常为英文，可直接把红色错误行发给我。
  pause & exit /b 1
)

REM ---------- [6/6] 启动服务（生产模式） ----------
echo [6/6] 启动服务（生产模式，pm2 守护，关闭窗口不影响）...
if not exist logs mkdir logs
call node_modules\.bin\pm2.cmd start ecosystem.prod.config.js
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
goto DONE

:READY
echo.
echo ==========================================
echo   生产模式已启动！
echo   前端 http://localhost:3000 （已构建，不再实时编译，应明显流畅）
echo   后端 http://localhost:3001
echo ==========================================
echo.
echo 使用提示：
echo   改完代码重新测试：再次运行本脚本（会自动重新构建，约 2~5 分钟）。
echo   想切回开发模式（改代码即时生效）：运行 start.bat。
echo   一键停止：stop.bat   一键查看状态：status.bat
echo.
start http://localhost:3000

:DONE
echo.
pause
