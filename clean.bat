@echo off
chcp 65001 >nul
cd /d "%~dp0"
rem Don file tam (anh chup gian hang + cache) de lay lai dung luong.
rem GIU NGUYEN: lich su gui, danh sach chan, bao cao.
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Cai ban LTS tai https://nodejs.org roi chay lai.
  pause
  exit /b 1
)
node scripts/clean.js
pause
