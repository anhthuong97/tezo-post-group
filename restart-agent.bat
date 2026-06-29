@echo off
title TeZo Agent - Restart
cd /d "%~dp0"
chcp 65001 >nul

echo.
echo  Dang tat Agent cu...
taskkill /IM electron.exe /F >nul 2>&1
ping -n 2 127.0.0.1 >nul

set ELECTRON_EXE=%~dp0apps\agent\node_modules\electron\dist\electron.exe
set AGENT_DIR=%~dp0apps\agent

if not exist "%ELECTRON_EXE%" goto NO_ELECTRON

echo  Dang khoi dong TeZo Agent...
start "" "%ELECTRON_EXE%" "%AGENT_DIR%"
echo  [OK] TeZo Agent da khoi dong (chay nen, khong co cua so CMD).
goto DONE

:NO_ELECTRON
echo  [LOI] Khong tim thay electron.exe tai:
echo        %ELECTRON_EXE%
echo  Hay chay start.bat truoc de cai node_modules.
pause
exit /b 1

:DONE
echo.
echo  Co the dong cua so nay.
echo.
timeout /t 2 >nul
