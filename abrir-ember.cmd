@echo off
setlocal
cd /d "%~dp0"

powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8000/api/config' -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  start "Ember Studio" /min cmd /c call "%~dp0start-ember.cmd"
  timeout /t 2 /nobreak >nul
)

start "" "http://127.0.0.1:8000/"
endlocal
