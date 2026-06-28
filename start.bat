@echo off
title Tezo - Startup
cd /d "%~dp0"
chcp 65001 >nul

echo.
echo  ==========================================
echo   TEZO ^| FB Auto Poster
echo  ==========================================
echo.

:: Buoc 1: Kiem tra Node.js
echo [1/7] Kiem tra Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo [LOI] Khong tim thay Node.js. Hay cai tai https://nodejs.org
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>nul') do echo       Node.js %%v da san sang.

:: Buoc 2: Kiem tra .env
echo [2/7] Kiem tra .env...
if not exist "apps\api\.env" (
    echo       Chua co .env, tao tu .env.example...
    copy "apps\api\.env.example" "apps\api\.env" >nul
    echo       Da tao apps\api\.env - hay dien DB_PASSWORD va SESSION_SECRET.
    notepad "apps\api\.env"
    echo       Nhan phim bat ky sau khi luu file...
    pause >nul
) else (
    echo       .env da ton tai.
)

:: Buoc 3: Giai phong port 3000 va 3001
echo [3/7] Giai phong port 3000 va 3001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " ^| findstr "LISTENING"') do taskkill /PID %%a /F >nul 2>&1
ping -n 2 127.0.0.1 >nul
echo       Xong.

:: Buoc 4: Cai npm dependencies
echo [4/7] Kiem tra dependencies...
if not exist "node_modules" (
    echo       Chua co node_modules, dang chay npm install...
    npm install
    if errorlevel 1 ( echo [LOI] npm install that bai. & pause & exit /b 1 )
    echo       Da cai xong.
) else (
    echo       node_modules da co san.
)

:: Buoc 5: Cai dependencies cho Agent neu chua co
echo [5/7] Kiem tra Agent dependencies...
if not exist "apps\agent\node_modules" (
    echo       Chua co node_modules cho Agent, dang cai...
    pushd "%~dp0apps\agent"
    npm install
    if errorlevel 1 ( echo [CANH BAO] npm install Agent co loi, bo qua. ) else ( echo       Agent da cai xong. )
    popd
) else (
    echo       Agent node_modules da co san.
)

:: Buoc 6: Build NestJS API neu chua co
echo [6/7] Kiem tra NestJS API build...
if not exist "apps\api\dist\main.js" (
    echo       Chua co build, dang build NestJS API ^(co the mat 1 phut^)...
    call node "%~dp0node_modules\@nestjs\cli\bin\nest.js" build --config "%~dp0apps\api\nest-cli.json"
    if errorlevel 1 ( echo [LOI] NestJS build that bai. & pause & exit /b 1 )
    echo       Build xong.
) else (
    echo       Build da co san.
)

:: Buoc 7: Khoi dong server voi PM2
echo [7/7] Dang khoi dong server voi PM2...
call pm2 delete tezo-api >nul 2>&1
call pm2 delete tezo-web >nul 2>&1
call pm2 start "%~dp0ecosystem.config.js"
if errorlevel 1 ( echo [LOI] PM2 khong the khoi dong server. & pause & exit /b 1 )

:: Doi API san sang (port 3000)
echo.
echo  Dang cho API san sang ^(20-30 giay^)...
set WAIT=0
:WAIT_API
netstat -ano 2>nul | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 goto API_OK
ping -n 3 127.0.0.1 >nul
set /a WAIT+=1
if %WAIT% lss 60 goto WAIT_API
echo  [LOI] API khong khoi dong duoc. Chay: pm2 logs tezo-api
goto DONE

:API_OK
echo  [OK] API  san sang : http://localhost:3000

:: Doi Web san sang (port 3001)
set WAIT=0
:WAIT_WEB
netstat -ano 2>nul | findstr ":3001 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 goto WEB_OK
ping -n 3 127.0.0.1 >nul
set /a WAIT+=1
if %WAIT% lss 30 goto WAIT_WEB
echo  [LOI] Web khong khoi dong duoc. Chay: pm2 logs tezo-web
goto DONE

:WEB_OK
echo  [OK] Web  san sang : http://localhost:3001
echo.
echo  +-----------------------------------------+
echo  ^|   SERVER DA SAN SANG!                   ^|
echo  ^|   http://localhost:3001/post-group      ^|
echo  +-----------------------------------------+
echo.
start http://localhost:3001/post-group/dashboard

:: Khoi dong TeZo Agent (Electron)
echo  Dang khoi dong TeZo Agent...
if exist "apps\agent\node_modules\.bin\electron.cmd" (
    start "TeZo Agent" /B cmd /c "cd /d "%~dp0apps\agent" && npx electron . 2>nul"
    echo  [OK] TeZo Agent da khoi dong ^(icon TEZO tren system tray^)
) else (
    echo  [CANH BAO] Agent chua cai xong, bo qua.
)

:DONE
echo.
echo  Lenh PM2 hay dung:
echo    pm2 list          - xem trang thai server
echo    pm2 logs          - xem log theo thoi gian thuc
echo    pm2 restart all   - khoi dong lai
echo    pm2 stop all      - dung server
echo.
echo  Co the dong cua so nay - server va agent van chay ngam.
echo.
pause
