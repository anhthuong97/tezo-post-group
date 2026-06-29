@echo off
title TeZo Agent - Restart
cd /d "%~dp0"
chcp 65001 >nul

echo.
echo  Dang tat Agent cu...
taskkill /IM electron.exe /F >nul 2>&1
ping -n 2 127.0.0.1 >nul

echo  Dang khoi dong TeZo Agent...
if not exist "apps\agent\node_modules\.bin\electron.cmd" goto NO_MODULES

pushd "%~dp0apps\agent"
start "TeZo Agent" cmd /k npx electron .
popd
echo  [OK] TeZo Agent da khoi dong lai (xem cua so "TeZo Agent").
goto DONE

:NO_MODULES
echo  [LOI] Chua cai node_modules cho agent. Chay start.bat truoc.
pause
exit /b 1

:DONE
echo.
echo  Co the dong cua so nay.
echo.
timeout /t 3 >nul
