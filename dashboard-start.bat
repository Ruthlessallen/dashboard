@echo off
rem Enciende el dashboard y abre el navegador. Si ya esta encendido, solo abre el navegador.
cd /d "%~dp0"

powershell -NoProfile -Command "try { Invoke-WebRequest http://localhost:3111 -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if %errorlevel%==0 (
  start "" http://localhost:3111
  exit /b
)

start "Dashboard (cierra esta ventana para apagarlo)" npm run dev

echo Arrancando el dashboard...
set /a intentos=0
:esperar
set /a intentos+=1
if %intentos% gtr 60 goto abrir
timeout /t 2 >nul
powershell -NoProfile -Command "try { Invoke-WebRequest http://localhost:3111 -UseBasicParsing -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }"
if not %errorlevel%==0 goto esperar

:abrir
start "" http://localhost:3111
