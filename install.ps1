# Cai Proofmail bang MOT lenh (Windows PowerShell).
#
#   irm https://raw.githubusercontent.com/ninhht-cmp/proofmail/main/install.ps1 | iex
#
# Viec no lam: clone repo (giu .git -> launcher tu cap nhat ve sau) roi chay
# launcher de cai thu vien + tao .env. KHONG chua bi mat nao.
# (Khong dau tieng Viet trong file nay de tranh loi font tren PowerShell cu.)
$ErrorActionPreference = 'Stop'

$repo = 'https://github.com/ninhht-cmp/proofmail.git'
$dest = if ($env:PROOFMAIL_DIR) { $env:PROOFMAIL_DIR } else { Join-Path $HOME 'proofmail' }

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "Chua cai Git. Cai tai https://git-scm.com (de mac dinh) roi chay lai lenh nay."
  return
}

if (Test-Path (Join-Path $dest '.git')) {
  Write-Host "Da co Proofmail tai: $dest - se tu cap nhat khi chay."
} else {
  Write-Host "Tai Proofmail ve: $dest"
  git clone $repo $dest
}

Set-Location $dest
Write-Host "Khoi dong Proofmail..."
& cmd /c start.bat
