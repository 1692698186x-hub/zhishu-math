@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "AI_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "AI_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if not exist dist\index.html "%AI_NODE%" build.cjs
start "" http://127.0.0.1:8877/
"%AI_NODE%" ai-server.cjs
pause
