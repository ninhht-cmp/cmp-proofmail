@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Them mot email vao danh sach KHONG gui lai (khi nguoi nhan xin huy dang ky).
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Cai ban LTS tai https://nodejs.org roi chay lai.
  pause
  exit /b 1
)
call npm run suppress
pause
