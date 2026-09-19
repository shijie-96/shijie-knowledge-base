@echo off
chcp 65001 >nul
setlocal EnableExtensions
cd /d "%~dp0"

echo ==========================================
echo    知识平台 - 一键修复
echo    适用：页面报 Network Error / 后端反复重启
echo ==========================================
echo.

REM ---------- [1/5] 停止并移除 pm2 托管 ----------
echo [1/5] 停止 pm2 托管服务...
call node_modules\.bin\pm2.cmd delete all >nul 2>nul

REM ---------- [2/5] 清理残留进程（端口占用） ----------
echo [2/5] 清理占用 3000 / 3001 端口的残留进程...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr /c:":3000 "') do (
  echo   结束残留进程 PID %%p (3000)
  taskkill /F /T /PID %%p >nul 2>nul
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr "LISTENING" ^| findstr /c:":3001 "') do (
  echo   结束残留进程 PID %%p (3001)
  taskkill /F /T /PID %%p >nul 2>nul
)
timeout /t 2 /nobreak >nul

REM ---------- [3/5] 清理旧编译产物 ----------
echo [3/5] 清理旧编译产物 backend\dist...
if exist "backend\dist" (
  attrib -R "backend\dist\*.*" /S >nul 2>nul
  rmdir /s /q "backend\dist"
)
if exist "backend\dist" (
  echo   [警告] dist 目录仍被占用（可能有进程持有文件句柄）。
  echo   请关闭其它占用 backend 目录的程序（如 VSCode 终端、杀毒软件），
  echo   或重启电脑后再次运行 fix.bat。
)

REM ---------- [4/5] 重新编译后端 ----------
echo [4/5] 重新编译后端（约 30~60 秒，请耐心等待）...
call npm --prefix backend run build
if errorlevel 1 (
  echo.
  echo [错误] 后端编译失败！请检查 backend\src 下的代码语法。
  pause & exit /b 1
)

REM ---------- [5/5] 启动并自检 ----------
echo [5/5] 启动服务（pm2 守护）...
if not exist logs mkdir logs
call node_modules\.bin\pm2.cmd start ecosystem.config.js
call node_modules\.bin\pm2.cmd save >nul

echo.
echo 正在自检服务是否可用...
set /a WAITED=0
:CHECK_LOOP
timeout /t 5 /nobreak >nul
curl.exe -s -o NUL http://localhost:3001/health >nul 2>nul
if not errorlevel 1 (
  echo   后端 http://localhost:3001/health ...   [OK]
  goto CHECK_FRONT
)
set /a WAITED+=1
if %WAITED% LSS 12 goto CHECK_LOOP
echo   后端 http://localhost:3001/health ...   [失败]
echo   ^> 请查看 logs\backend.err.log 或运行 status.bat 查看更多信息。
goto DONE

:CHECK_FRONT
curl.exe -s -o NUL http://localhost:3000 >nul 2>nul
if not errorlevel 1 (
  echo   前端 http://localhost:3000 ...........   [OK]
  echo.
  echo ==========================================
  echo   修复完成！服务运行正常。
  echo   前端 http://localhost:3000
  echo   后端 http://localhost:3001
  echo ==========================================
  start http://localhost:3000
) else (
  echo   前端 http://localhost:3000 ...........   [等待中]
  echo   前端编译较慢，请稍后访问 http://localhost:3000
)

:DONE
echo.
pause
