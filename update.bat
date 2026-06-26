@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem Cap nhat len ban phat hanh (release tag) moi nhat - AN TOAN: nho ban dang dung
rem -> doi sang ban moi -> cai thu vien -> CHAY TEST. Test loi thi TU QUAY VE ban cu.

if not exist ".git" goto nogit
where git >nul 2>nul || goto nogit

echo Dang lay danh sach ban phat hanh...
git fetch --tags --quiet
if errorlevel 1 ( echo Khong ket noi duoc ^(mang/proxy^). Thu lai sau. & pause & exit /b 1 )

set "CURRENT="
for /f "delims=" %%i in ('git describe --tags --abbrev^=0 2^>nul') do set "CURRENT=%%i"
if not defined CURRENT for /f "delims=" %%i in ('git rev-parse --short HEAD') do set "CURRENT=%%i"

set "LATEST="
for /f "delims=" %%i in ('git tag -l "v*" --sort^=-v:refname 2^>nul') do if not defined LATEST set "LATEST=%%i"

if not defined LATEST ( echo Chua co ban phat hanh nao de cap nhat. & pause & exit /b 0 )
if "%LATEST%"=="%CURRENT%" ( echo Dang o ban moi nhat ^(%CURRENT%^). Khong can cap nhat. & pause & exit /b 0 )

echo Cap nhat: %CURRENT% -^> %LATEST%
(echo %CURRENT%)>.proofmail-prev-version

git checkout --quiet "%LATEST%"
if errorlevel 1 (
  echo Khong doi duoc sang %LATEST% - co the ban da sua file trong thu muc cai dat.
  echo  ^(Dung sua code o day; cau hinh nam o .env - file do an toan.^)
  pause & exit /b 1
)

echo Cai thu vien cho ban moi...
call npm install --omit=dev
if errorlevel 1 (
  echo Cai thu vien loi - quay ve %CURRENT%.
  git checkout --quiet "%CURRENT%"
  call npm install --omit=dev
  pause & exit /b 1
)

echo Kiem tra ban moi ^(chay test^)...
call npm test
if errorlevel 1 (
  echo Ban %LATEST% KHONG dat kiem tra - tu quay ve ban cu %CURRENT%.
  git checkout --quiet "%CURRENT%"
  call npm install --omit=dev
  echo Da quay ve %CURRENT% ^(ban chay on truoc do^). Bao nguoi phu trach ve loi cua %LATEST%.
) else (
  echo Cap nhat thanh cong len %LATEST%.
)
pause & exit /b 0

:nogit
echo Ban nay khong cai bang git ^(hoac may chua co git^) - khong tu cap nhat duoc.
pause & exit /b 1
