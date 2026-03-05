param(
  [Parameter(Mandatory = $true)]
  [string]$AliasEmail,
  [string]$BaseUrl = 'https://app.arvindlab.dedyn.io',
  [string]$OwnerEmail = 'rvndkaswan@gmail.com',
  [int]$MaxTries = 20,
  [int]$SleepSecs = 2
)

$ErrorActionPreference = 'Stop'

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

for ($i = 1; $i -le $MaxTries; $i++) {
  $raw = & node $controlCli 'mail:jobs:list' '--owner-email' $OwnerEmail '--limit' '50' '--base-url' $BaseUrl 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ($raw | Out-String)
  }

  $obj = ($raw | Out-String) | ConvertFrom-Json
  $jobs = @()
  if ($obj.payload.jobs) {
    $jobs = $obj.payload.jobs
  }

  foreach ($job in $jobs) {
    if ($job.toAliasEmail -ne $AliasEmail) { continue }
    $subject = [string]$job.subject
    $match = [regex]::Match($subject, '\b(\d{6})\b')
    if ($match.Success) {
      Write-Output $match.Groups[1].Value
      exit 0
    }
  }

  Start-Sleep -Seconds $SleepSecs
}

throw "OTP not found for alias: $AliasEmail after $MaxTries tries"
