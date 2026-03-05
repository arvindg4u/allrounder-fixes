param(
  [switch]$Yes,
  [string]$BaseUrl = 'https://app.arvindlab.dedyn.io',
  [string]$OwnerEmail = 'rvndkaswan@gmail.com'
)

$ErrorActionPreference = 'Stop'

if (-not $Yes) {
  throw 'Usage: delete_all_aliases.ps1 -Yes'
}

function Resolve-ControlCli {
  if ($env:CONTROL_CLI -and (Test-Path -LiteralPath $env:CONTROL_CLI)) {
    return $env:CONTROL_CLI
  }
  $candidate = Join-Path $HOME '.codex\skills\control-cli\scripts\control-cli.mjs'
  if (Test-Path -LiteralPath $candidate) {
    return $candidate
  }
  throw 'control-cli.mjs not found. Set CONTROL_CLI env var.'
}

$controlCli = Resolve-ControlCli
$listRaw = & node $controlCli 'aliases:list' '--owner-email' $OwnerEmail '--base-url' $BaseUrl 2>&1
if ($LASTEXITCODE -ne 0) {
  throw ($listRaw | Out-String)
}

$listObj = ($listRaw | Out-String) | ConvertFrom-Json
$aliases = @()
if ($listObj.payload.aliases) {
  $aliases = $listObj.payload.aliases
}

$count = 0
foreach ($alias in $aliases) {
  if (-not $alias.id) { continue }
  $deleteRaw = & node $controlCli 'aliases:delete' '--owner-email' $OwnerEmail '--alias-id' $alias.id '--yes' '--base-url' $BaseUrl 2>&1
  if ($LASTEXITCODE -eq 0) {
    $count++
  } else {
    throw ($deleteRaw | Out-String)
  }
}

Write-Output "deleted_count=$count"
