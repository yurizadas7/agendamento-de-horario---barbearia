@echo off
setlocal
cd /d "%~dp0"
if "%ADMIN_PASSWORD%"=="" set "ADMIN_PASSWORD=ember2026"
where node >nul 2>nul
if %errorlevel%==0 (
  node server.js
) else (
  "C:\Users\yurim\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" server.js
)
endlocal
