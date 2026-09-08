@echo off
cd /d "C:\Users\Ruth\Desktop\PROGRAMACION\PROYECTOS\PROYECTOS-PERSONALES\Dashboard"
start npm run dev
timeout /t 5
start http://localhost:3111
