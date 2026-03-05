param(
  [string]$BaseUrl = 'https://app.arvindlab.dedyn.io',
  [string]$OwnerEmail = 'rvndkaswan@gmail.com',
  [string]$DestinationEmail = 'rvndkaswan@gmail.com',
  [string]$AliasDomain = 'arvindlab.dedyn.io',
  [string]$AliasPrefix = 'app',
  [string]$Label = ''
)

$ErrorActionPreference = 'Stop'

function Resolve-ControlCli {
  if ($env:CONTROL_CLI -and (Test-Path -LiteralPath $env:CONTROL_CLI)) {
    return $env:CONTROL_CLI
  }

  $candidates = @(
    (Join-Path $HOME '.codex\skills\control-cli\scripts\control-cli.mjs'),
    (Join-Path $HOME '.codex-shared\skills\control-cli\scripts\control-cli.mjs')
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }

  throw 'control-cli.mjs not found. Set CONTROL_CLI env var.'
}

$controlCli = Resolve-ControlCli
$cmd = @(
  $controlCli,
  'aliases:create-random',
  '--owner-email', $OwnerEmail,
  '--destination-email', $DestinationEmail,
  '--alias-domain', $AliasDomain,
  '--alias-prefix', $AliasPrefix,
  '--base-url', $BaseUrl
)

if ($Label) {
  $cmd += @('--label', $Label)
}

$raw = & node @cmd 2>&1
if ($LASTEXITCODE -ne 0) {
  throw ($raw | Out-String)
}

$obj = ($raw | Out-String) | ConvertFrom-Json
if (-not $obj.ok) {
  throw (($raw | Out-String).Trim())
}

$alias = $obj.payload.alias
if (-not $alias.aliasEmail -or -not $alias.id) {
  throw 'alias response missing aliasEmail or id'
}

Write-Output "alias_id=$($alias.id)"
Write-Output "alias_email=$($alias.aliasEmail)"
Write-Output "status=$($alias.status)"
Write-Output "created_at=$($alias.createdAt)"
