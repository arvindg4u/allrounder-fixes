$ErrorActionPreference = 'Stop'

$sourceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$destDir = Join-Path $HOME '.local\bin'

if (-not (Test-Path -LiteralPath $destDir)) {
  New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

$files = @(
  'codex-auth-helpers.ps1',
  'crelogin.cmd',
  'crelogindev.cmd',
  'clogin.cmd',
  'cloginweb.cmd',
  'clogout.cmd',
  'cstatus.cmd',
  'cloginlink.cmd',
  'ckilllogin.cmd'
)

foreach ($file in $files) {
  Copy-Item -LiteralPath (Join-Path $sourceDir $file) -Destination (Join-Path $destDir $file) -Force
}

Write-Output "wrappers_installed_dir=$destDir"
Write-Output ('wrappers=' + ($files -join ','))
