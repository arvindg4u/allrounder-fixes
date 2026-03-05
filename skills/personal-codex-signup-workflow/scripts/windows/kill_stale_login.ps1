$ErrorActionPreference = 'SilentlyContinue'

$codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME '.codex' }
$lockFile = Join-Path (Join-Path $codexHome '.locks') 'crelogin.lock'

if (Test-Path -LiteralPath $lockFile) {
  $pidText = Get-Content -LiteralPath $lockFile | Select-Object -First 1
  if ($pidText -match '^\d+$') {
    Stop-Process -Id ([int]$pidText) -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $lockFile -Force -ErrorAction SilentlyContinue
}

Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -like '*codex*login*'
} | ForEach-Object {
  Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
}

$listeners = Get-NetTCPConnection -LocalPort 1455 -State Listen -ErrorAction SilentlyContinue
foreach ($listener in $listeners) {
  Stop-Process -Id $listener.OwningProcess -Force -ErrorAction SilentlyContinue
}

Write-Output 'stale_login_processes_cleared=true'
