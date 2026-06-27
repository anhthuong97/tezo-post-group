@echo off
title Tezo - Startup
cd /d "%~dp0"
chcp 65001 >nul

set LOG=%~dp0start_last.log
echo [%DATE% %TIME%] === STARTING === > "%LOG%"

echo.
echo  ==========================================
echo   TEZO ^| FB Auto Poster
echo  ==========================================
echo.

:: Buoc 1: Kiem tra Node.js
echo [1/6] Kiem tra Node.js...
echo [%TIME%] Step 1: node check >> "%LOG%"
where node >nul 2>&1
if errorlevel 1 (
    echo [LOI] Khong tim thay Node.js. Hay cai tai https://nodejs.org
    echo [%TIME%] FAIL: node not found >> "%LOG%"
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>nul') do (
    echo       Node.js %%v da san sang.
    echo [%TIME%] OK: node %%v >> "%LOG%"
)

:: Buoc 2: Kiem tra .env
echo [2/6] Kiem tra .env...
echo [%TIME%] Step 2: env check >> "%LOG%"
if not exist "apps\api\.env" (
    echo       Chua co .env, tao tu .env.example...
    copy "apps\api\.env.example" "apps\api\.env" >nul
    echo       Da tao apps\api\.env - hay dien DB_PASSWORD va SESSION_SECRET.
    notepad "apps\api\.env"
    echo       Nhan phim bat ky sau khi luu file...
    pause >nul
    echo.
) else (
    echo       .env da ton tai.
    echo [%TIME%] OK: .env exists >> "%LOG%"
)

:: Buoc 3: Giai phong port 3000 va 3001
echo [3/6] Giai phong port 3000 va 3001...
echo [%TIME%] Step 3: free ports >> "%LOG%"
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3001 " ^| findstr "LISTENING"') do (
    taskkill /PID %%a /F >nul 2>&1
)
ping -n 2 127.0.0.1 >nul
echo       Xong.

:: Buoc 4: Cai npm dependencies neu chua co
echo [4/6] Kiem tra dependencies...
echo [%TIME%] Step 4: node_modules >> "%LOG%"
if not exist "node_modules" (
    echo       Chua co node_modules, dang chay npm install...
    npm install
    if errorlevel 1 (
        echo [LOI] npm install that bai.
        echo [%TIME%] FAIL: npm install >> "%LOG%"
        pause
        exit /b 1
    )
    echo       Da cai xong.
) else (
    echo       node_modules da co san.
    echo [%TIME%] OK: node_modules exists >> "%LOG%"
)

:: Buoc 5a: Build NestJS API neu chua co
echo [5a] Kiem tra NestJS API build...
echo [%TIME%] Step 5a: nestjs build check >> "%LOG%"
if not exist "apps\api\dist\main.js" (
    echo       Chua co build, dang build NestJS API ^(co the mat 1 phut^)...
    echo [%TIME%] Building NestJS... >> "%LOG%"
    call node "%~dp0node_modules\@nestjs\cli\bin\nest.js" build --config "%~dp0apps\api\nest-cli.json"
    if errorlevel 1 (
        echo [LOI] NestJS build that bai.
        echo [%TIME%] FAIL: nestjs build >> "%LOG%"
        pause
        exit /b 1
    )
    echo       Build xong.
    echo [%TIME%] OK: nestjs build done >> "%LOG%"
) else (
    echo       Build da co san.
    echo [%TIME%] OK: nestjs build exists >> "%LOG%"
)

:: Buoc 5b: Kiem tra Playwright Chromium
echo [5b] Kiem tra Playwright Chromium...
echo [%TIME%] Step 5: playwright >> "%LOG%"
dir /b "%LOCALAPPDATA%\ms-playwright" 2>nul | findstr /i "^chromium" >nul 2>&1
if errorlevel 1 (
    echo       Chua co Chromium, dang cai dat ^(co the mat vai phut^)...
    npx playwright install chromium
    if errorlevel 1 (
        echo [CANH BAO] Playwright install co loi, bo qua.
        echo [%TIME%] WARN: playwright install failed >> "%LOG%"
    ) else (
        echo       Da cai xong Playwright Chromium.
        echo [%TIME%] OK: playwright installed >> "%LOG%"
    )
) else (
    echo       Playwright Chromium da san sang.
    echo [%TIME%] OK: playwright exists >> "%LOG%"
)

:: Buoc 6: Khoi dong server voi PM2
echo [6/6] Dang khoi dong server voi PM2...
echo.
echo [%TIME%] Step 6: PM2 start >> "%LOG%"

echo [%TIME%] Calling pm2 delete all... >> "%LOG%"
call pm2 delete tezo-api >nul 2>&1
call pm2 delete tezo-api-watcher >nul 2>&1
call pm2 delete tezo-web >nul 2>&1
echo [%TIME%] pm2 delete done >> "%LOG%"

echo [%TIME%] Calling pm2 start... >> "%LOG%"
call pm2 start "%~dp0ecosystem.config.js"
echo [%TIME%] pm2 start done, EL=%ERRORLEVEL% >> "%LOG%"

if errorlevel 1 (
    echo [%TIME%] FAIL: pm2 start returned errorlevel 1 >> "%LOG%"
    echo.
    echo [LOI] PM2 khong the khoi dong server.
    echo       Kiem tra log tai: %~dp0start_last.log
    echo       Hoac chay: pm2 logs
    echo.
    pause
    exit /b 1
)

echo [%TIME%] PM2 OK, waiting for ports... >> "%LOG%"

:: Doi API san sang (port 3000)
echo.
echo  Dang cho API bien dich ^(co the mat 20-30 giay^)...
set WAIT=0
:WAIT_API
echo [%TIME%] Checking port 3000, WAIT=%WAIT% >> "%LOG%"
netstat -ano 2>nul | findstr ":3000 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 goto API_OK
ping -n 3 127.0.0.1 >nul
set /a WAIT+=1
if %WAIT% lss 60 goto WAIT_API
echo  [LOI] API khong khoi dong duoc sau 2 phut.
echo        Chay "pm2 logs tezo-api" de xem loi.
echo [%TIME%] FAIL: port 3000 timeout >> "%LOG%"
goto DONE

:API_OK
echo [%TIME%] OK: port 3000 ready >> "%LOG%"
echo  [OK] API  san sang : http://localhost:3000

:: Doi Web san sang (port 3001)
set WAIT=0
:WAIT_WEB
netstat -ano 2>nul | findstr ":3001 " | findstr "LISTENING" >nul 2>&1
if not errorlevel 1 goto WEB_OK
ping -n 3 127.0.0.1 >nul
set /a WAIT+=1
if %WAIT% lss 30 goto WAIT_WEB
echo  [LOI] Web khong khoi dong duoc sau 1 phut.
echo        Chay "pm2 logs tezo-web" de xem loi.
echo [%TIME%] FAIL: port 3001 timeout >> "%LOG%"
goto DONE

:WEB_OK
echo [%TIME%] OK: port 3001 ready >> "%LOG%"
echo  [OK] Web  san sang : http://localhost:3001
echo.
echo  +-----------------------------------------+
echo  ^|                                         ^|
echo  ^|   SERVER DA SAN SANG!                   ^|
echo  ^|   http://localhost:3001/post-group      ^|
echo  ^|                                         ^|
echo  +-----------------------------------------+
echo.
start http://localhost:3001/post-group/dashboard

:DONE
echo [%TIME%] === DONE === >> "%LOG%"
echo.
echo  Lenh PM2 hay dung:
echo    pm2 list              - xem trang thai server
echo    pm2 logs              - xem log theo thoi gian thuc
echo    pm2 logs tezo-api     - log cua API
echo    pm2 logs tezo-web     - log cua Web
echo    pm2 stop all          - dung server
echo    pm2 restart all       - khoi dong lai
echo.
echo  Co the dong cua so nay - server van chay ngam.
echo.
pause
