@echo off
title Cai dat - FB Auto Poster
cd /d "%~dp0"

echo ============================================
echo   CAI DAT UNG DUNG - FB AUTO POSTER
echo ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Khong tim thay Node.js tren may nay.
  echo.
  echo Ban can cai Node.js truoc khi dung app nay:
  echo   1. Mo trang: https://nodejs.org
  echo   2. Bam tai ban "LTS" va cai dat nhu binh thuong (Next, Next, Finish).
  echo   3. Khoi dong lai may tinh, sau do mo lai file nay.
  echo.
  pause
  exit /b 1
)
echo [OK] Da co Node.js tren may, khong can cai lai.
echo.

if exist "node_modules\" (
  echo [OK] Cac thanh phan can thiet cho app da co san, bo qua buoc nay.
) else (
  echo Dang cai cac thanh phan can thiet cho app...
  echo ^(Buoc nay can Internet va co the mat vai phut, vui long doi^)
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [LOI] Cai dat thanh phan that bai.
    echo Kiem tra lai ket noi Internet roi bam lai file nay.
    pause
    exit /b 1
  )
  echo [OK] Da cai xong cac thanh phan can thiet.
)
echo.

set "CHROMIUM_DA_CO=0"
if exist "%USERPROFILE%\AppData\Local\ms-playwright\" (
  for /d %%D in ("%USERPROFILE%\AppData\Local\ms-playwright\chromium-*") do set "CHROMIUM_DA_CO=1"
)

if "%CHROMIUM_DA_CO%"=="1" (
  echo [OK] Trinh duyet phuc vu tu dong dang bai da co san, bo qua buoc nay.
) else (
  echo Dang cai trinh duyet phuc vu tinh nang tu dong dang bai...
  echo ^(Buoc nay can Internet, co the mat vai phut^)
  echo.
  call npx playwright install chromium
  if errorlevel 1 (
    echo.
    echo [LOI] Cai trinh duyet that bai.
    echo Kiem tra lai ket noi Internet roi bam lai file nay.
    pause
    exit /b 1
  )
  echo [OK] Da cai xong trinh duyet.
)

echo.
echo ============================================
echo   CAI DAT XONG! May nay da san sang.
echo   Bay gio ban co the bam vao file "Chay-App.bat"
echo   de mo ung dung.
echo ============================================
echo.
pause
