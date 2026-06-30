@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Chup anh website trong file danh sach -> tai len he thong -> ghi link anh vao file ket qua.
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Cai ban LTS tai https://nodejs.org roi chay lai.
  pause
  exit /b 1
)
call npm run enrich
pause
