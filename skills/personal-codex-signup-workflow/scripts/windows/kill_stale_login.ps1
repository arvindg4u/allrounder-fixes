$ErrorActionPreference = 'Continue'
$PSNativeCommandUseErrorActionPreference = $false

try {
  $helper = Join-Path $HOME '.local\bin\codex-auth-helpers.ps1'
  if (Test-Path -LiteralPath $helper) {
    & $helper kill_login | Out-Null
  }
} catch {
  # continue with fallback cleanup
}

$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
$lockFile = Join-Path (Join-Path $codexHome '.locks') 'crelogin.lock'

if (Test-Path -LiteralPath $lockFile) {
  try {
    $pidText = Get-Content -LiteralPath $lockFile | Select-Object -First 1
    if ($pidText -match '^\d+$') {
      Stop-Process -Id ([int]$pidText) -Force -ErrorAction SilentlyContinue
    }
  } catch {
    # ignore stale/invalid lock content
  }
  Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
}

Get-CimInstance Win32_Process | Where-Object {
  ($_.CommandLine -like '*codex*login*') -or
  ($_.CommandLine -like '*wsl.exe*cloginlink*') -or
  ($_.CommandLine -like '*wsl.exe*codex*login*')
} | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

if (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue) {
  $listeners = Get-NetTCPConnection -LocalPort 1455 -State Listen -ErrorAction SilentlyContinue
  foreach ($listener in $listeners) {
    Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
  }
}

try {
  if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
    & wsl.exe -e bash -lc "~/.local/bin/ckilllogin >/dev/null 2>&1 || true" | Out-Null
  }
} catch {
  # optional WSL cleanup only
}

Write-Output 'stale_login_processes_cleared=true'
exit 0
