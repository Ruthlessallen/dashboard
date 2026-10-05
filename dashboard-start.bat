@echo off
cd /d "%~dp0"
start "Dashboard" npm run dev
timeout /t 8 >nul
start "" http://localhost:3111
