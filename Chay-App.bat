@echo off
title FB Auto Poster - Dang khoi dong...
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Node.js. Hay bam vao file "Cai-Dat.bat" truoc.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [LOI] Chua cai dat thanh phan can thiet.
  echo Hay bam vao file "Cai-Dat.bat" truoc, sau do moi chay file nay.
  pause
  exit /b 1
)

REM Neu app da dang chay san (vi du lan truoc chua tat), chi can mo lai trinh duyet.
netstat -ano | findstr ":3000" | findstr "LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo App da dang chay san, dang mo lai trinh duyet...
  start http://localhost:3000
  exit
)

echo Dang khoi dong ung dung, cua so nay se tu dong tat sau vai giay...

REM Chay server o che do an, khong hien cua so den. Log se ghi vao file server.log.
start "" wscript.exe "%~dp0run-hidden.vbs"

REM Doi server khoi dong xong roi tu mo trinh duyet.
REM (dung ping thay cho timeout vi timeout loi khi chay khong co console tuong tac)
ping -n 4 127.0.0.1 >nul
start http://localhost:3000

exit
