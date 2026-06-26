@echo off
chcp 65001 >nul
cd /d "%~dp0"

rem --- Kiem tra cap nhat: CHI BAO, khong tu doi code (mo hinh ghim-tag). ---
rem May nay chay dung ban (release tag) dang ghim. Muon len ban moi thi chay
rem update.bat (co chay test + tu quay ve ban cu neu loi). Day chi fetch tag de bao.
if not exist ".git" goto afterupdate
where git >nul 2>nul || goto afterupdate
git fetch --tags --quiet 2>nul
for /f "delims=" %%i in ('git describe --tags --abbrev^=0 2^>nul') do set "CURRENT=%%i"
for /f "delims=" %%i in ('git tag -l "v*" --sort^=-v:refname 2^>nul') do if not defined LATEST set "LATEST=%%i"
if defined LATEST if not "%LATEST%"=="%CURRENT%" (
  echo Co ban moi: %LATEST% ^(dang dung %CURRENT%^).
  echo   -^> Chay update.bat de cap nhat ^(tu kiem tra; loi thi tu quay ve ban cu^).
)
:afterupdate

where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Tai tai https://nodejs.org ^(ban LTS^) roi chay lai.
  pause & exit /b 1
)

rem De chinh node so sanh phien ban (>= 20). Chuoi -e duoc dat trong ngoac kep
rem nen dau >= khong bi cmd hieu la chuyen huong.
node -e "process.exit(+process.versions.node.split('.')[0] >= 20 ? 0 : 1)"
if errorlevel 1 (
  echo Node.js qua cu - can phien ban 20 tro len. Dang dung:
  node -v
  echo Tai ban LTS moi tai https://nodejs.org roi chay lai.
  pause & exit /b 1
)

rem Cai thu vien khi chua co HOAC khi package.json doi so voi ban "dau" da luu.
set "NEED=0"
if not exist node_modules set "NEED=1"
if not exist node_modules\.pkg-stamp set "NEED=1"
if exist node_modules\.pkg-stamp fc /b package.json node_modules\.pkg-stamp >nul 2>nul || set "NEED=1"
if "%NEED%"=="1" goto install
goto checkenv

:install
echo Cai dat / cap nhat thu vien ^(co the mat 1-2 phut^)...
rem --omit=dev: may nhan vien chi can thu vien CHAY THAT, khong can bo cong cu dev.
call npm install --omit=dev
if errorlevel 1 (
  echo Cai dat thu vien loi ^(kiem tra mang/proxy^) roi chay lai.
  pause & exit /b 1
)
rem Tai Chromium - KHONG bat buoc: neu loi tool tu dung Edge/Chrome co san.
echo Tai trinh duyet Chromium ^(co the bo qua neu may da co Edge/Chrome^)...
call npx playwright install chromium
if errorlevel 1 echo Khong tai duoc Chromium - khong sao, tool se dung Microsoft Edge / Google Chrome co san.
copy /y package.json node_modules\.pkg-stamp >nul

:checkenv
if exist .env goto run
copy .env.example .env >nul
echo.
echo Da tao file cau hinh .env. Hay mo no, dien tai khoan gui mail ^(SMTP^),
echo luu lai roi chay lai file nay. ^(Xem README muc cau hinh.^)
pause & exit /b 0

:run
rem Bien dich TypeScript -> dist (incremental: nhanh khi nguon khong doi).
rem tsc la dependency (pure-JS) nen luon co san du cai --omit=dev.
echo Bien dich ma nguon...
call npm run build
if errorlevel 1 (
  echo Bien dich loi. Chay update.bat de ve ban chay duoc, hoac bao nguoi phu trach.
  pause & exit /b 1
)
node dist/cli/main.js %*
echo.
pause
