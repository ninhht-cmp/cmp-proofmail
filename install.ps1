# Cai Proofmail bang MOT lenh (Windows PowerShell).
#
#   irm https://raw.githubusercontent.com/ninhht-cmp/cmp-proofmail/main/install.ps1 | iex
#
# Viec no lam: clone repo (giu .git -> launcher tu cap nhat ve sau) roi chay
# launcher de cai thu vien + tao .env. KHONG chua bi mat nao.
# (Khong dau tieng Viet trong file nay de tranh loi font tren PowerShell cu.)
$ErrorActionPreference = 'Stop'

$repo = 'https://github.com/ninhht-cmp/cmp-proofmail.git'
$dest = if ($env:PROOFMAIL_DIR) { $env:PROOFMAIL_DIR } else { Join-Path $HOME 'cmp-proofmail' }

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

# Create Desktop + Start Menu shortcuts so staff open the tool like an app instead
# of digging into the folder. Best-effort: any failure here never blocks the install.
# Drop assets/proofmail.ico to brand the icon; otherwise the default console icon is used.
try {
  $batPath = Join-Path $dest 'start.bat'
  $icoPath = Join-Path $dest 'assets\proofmail.ico'
  $shell = New-Object -ComObject WScript.Shell
  $links = @(
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Proofmail.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'Proofmail.lnk')
  )
  foreach ($lnk in $links) {
    $sc = $shell.CreateShortcut($lnk)
    $sc.TargetPath = $batPath
    $sc.WorkingDirectory = $dest
    $sc.Description = 'Proofmail'
    if (Test-Path $icoPath) { $sc.IconLocation = "$icoPath,0" }
    $sc.Save()
  }
  Write-Host "Da tao loi tat 'Proofmail' tren Desktop va Start Menu."
} catch {
  Write-Host "Khong tao duoc loi tat (bo qua - khong anh huong cai dat)."
}

Write-Host "Khoi dong Proofmail..."
& cmd /c start.bat
