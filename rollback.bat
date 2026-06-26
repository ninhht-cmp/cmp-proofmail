@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem Quay ve ban da dung TRUOC lan cap nhat gan nhat (ghi trong .proofmail-prev-version).

if not exist ".git" goto nogit
where git >nul 2>nul || goto nogit

if not exist ".proofmail-prev-version" (
  echo Khong co ban truoc de quay ve ^(chua tung cap nhat qua update.bat^).
  echo  Xem cac ban co san:  git tag -l "v*"
  echo  Quay ve ban cu the:  git checkout v1.0.0 ^&^& npm install
  pause & exit /b 0
)

set /p PREV=<.proofmail-prev-version
set "CURRENT="
for /f "delims=" %%i in ('git describe --tags --abbrev^=0 2^>nul') do set "CURRENT=%%i"
echo Quay ve: %CURRENT% -^> %PREV%

git checkout --quiet "%PREV%"
if errorlevel 1 (
  echo Khong quay ve duoc %PREV% ^(ban do khong con?^). Thu: git checkout ^<ten-ban^> ^&^& npm install
  pause & exit /b 1
)
call npm install --omit=dev
echo Da quay ve %PREV%.
pause & exit /b 0

:nogit
echo Ban nay khong cai bang git - khong rollback tu dong duoc.
pause & exit /b 1
