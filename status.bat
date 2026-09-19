@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ============ 进程状态 ============
call node_modules\.bin\pm2.cmd jlist > "%TEMP%\pm2_status.json" 2>nul
call node_modules\.bin\pm2.cmd status
echo.

REM ---- 从 jlist 提取后端重启次数与状态 ----
set BACKEND_STATUS=?
set BACKEND_RESTARTS=0
set BACKEND_UPTIME=?
for /f "tokens=*" %%i in ('node -e "try{const j=JSON.parse(require('fs').readFileSync(process.env.TEMP+'\\pm2_status.json','utf8'));const a=j.find(p=>p.name==='zhishi-backend');const f=j.find(p=>p.name==='zhishi-frontend');console.log((a?a.pm2_env.status:'down')+'|'+(a?a.pm2_env.restart_time:0)+'|'+(a?Math.floor(a.pm2_env.pm_uptime?((Date.now()-a.pm2_env.pm_uptime)/1000):0):0)+'|'+(f?f.pm2_env.status:'down'))}catch(e){console.log('parse_error')}"') do set "PARSE=%%i"
for /f "tokens=1-4 delims=|" %%a in ("%PARSE%") do (
  set BACKEND_STATUS=%%a
  set BACKEND_RESTARTS=%%b
  set BACKEND_UPTIME=%%c
  set FRONTEND_STATUS=%%d
)

echo ============ 健康检查 ============
set BACKEND_OK=0
set FRONTEND_OK=0
curl.exe -s -o NUL -w "%%{http_code}" http://localhost:3001/health >nul 2>nul
if not errorlevel 1 set BACKEND_OK=1
curl.exe -s -o NUL -w "%%{http_code}" http://localhost:3000 >nul 2>nul
if not errorlevel 1 set FRONTEND_OK=1

if "%BACKEND_OK%"=="1" (
  echo   后端 http://localhost:3001/health ...   [OK]
) else (
  echo   后端 http://localhost:3001/health ...   [失败]
  echo     ^> 后端没有响应，这是页面报 "Network Error" 的直接原因！
)
if "%FRONTEND_OK%"=="1" (
  echo   前端 http://localhost:3000 ...........   [OK]
) else (
  echo   前端 http://localhost:3000 ...........   [失败]
)

echo.
echo ============ 诊断信息 ============
echo   后端状态：%BACKEND_STATUS%    重启次数：%BACKEND_RESTARTS%    已运行：%BACKEND_UPTIME% 秒
echo   前端状态：%FRONTEND_STATUS%
if not "%BACKEND_RESTARTS%"=="0" (
  if not "%BACKEND_RESTARTS%"=="?" (
    echo.
    echo   [警告] 后端已重启 %BACKEND_RESTARTS% 次！
    echo   若反复重启（重启次数持续增加），说明后端异常崩溃。
    echo   请运行 fix.bat 一键修复（清理残留进程 + 重新编译 + 重启）。
  )
)
if "%BACKEND_STATUS%"=="errored" (
  echo.
  echo   [严重] 后端进程处于 errored 状态，无法提供服务。
  echo   请运行 fix.bat 一键修复后重新启动。
)
if not "%BACKEND_OK%"=="1" (
  echo.
  echo   [结论] 后端不可用，前端会报 Network Error。
  echo   修复方法：双击运行 fix.bat（或 start.bat）。
)
echo.
echo ============ 最近日志 ============
call node_modules\.bin\pm2.cmd logs --lines 20 --nostream
echo.
pause
