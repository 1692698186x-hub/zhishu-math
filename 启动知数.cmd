@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "ZHISHU_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "ZHISHU_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not "%ZHISHU_NODE%"=="node" if not exist "%ZHISHU_NODE%" (
  echo 请先安装 Node.js 20 或更新版本，也可以直接打开 dist\index.html 使用离线版。
  pause
  exit /b 1
)
echo 启动后请在浏览器打开 http://127.0.0.1:8787
echo 关闭本窗口即可停止本地服务。
"%ZHISHU_NODE%" server.cjs
pause
