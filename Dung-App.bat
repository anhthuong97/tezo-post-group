@echo off
title Dung FB Auto Poster
echo Dang dung ung dung...

set "DA_DUNG=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do (
  taskkill /PID %%P /F >nul 2>nul
  set "DA_DUNG=1"
)

if "%DA_DUNG%"=="1" (
  echo Da dung ung dung.
) else (
  echo Ung dung khong dang chay.
)

pause
