param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('status','login','login_browser','logout','login_link','relogin','relogin_device','kill_login')]
  [string]$Action,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ActionArgs
)

$ErrorActionPreference = 'Stop'

function Get-CodexHome {
  if ($env:CODEX_SHARED_HOME -and (Test-Path -LiteralPath $env:CODEX_SHARED_HOME)) {
    return $env:CODEX_SHARED_HOME
  }
  if ($env:CODEX_HOME -and (Test-Path -LiteralPath $env:CODEX_HOME)) {
    return $env:CODEX_HOME
  }
  return (Join-Path $HOME '.codex')
}

$script:CodexHome = Get-CodexHome
$script:LockDir = Join-Path $script:CodexHome '.locks'
$script:LockFile = Join-Path $script:LockDir 'crelogin.lock'
$script:LastLinkFile = Join-Path $script:CodexHome '.last-login-link'

function Ensure-CodexDirs {
  if (-not (Test-Path -LiteralPath $script:CodexHome)) {
    New-Item -ItemType Directory -Path $script:CodexHome -Force | Out-Null
  }
  if (-not (Test-Path -LiteralPath $script:LockDir)) {
    New-Item -ItemType Directory -Path $script:LockDir -Force | Out-Null
  }
}

function Copy-ToClipboard {
  param([string]$Text)
  try {
    Set-Clipboard -Value $Text
    return $true
  } catch {
    return $false
  }
}

function Release-Lock {
  if (-not (Test-Path -LiteralPath $script:LockFile)) {
    return
  }
  try {
    $current = Get-Content -LiteralPath $script:LockFile -ErrorAction Stop | Select-Object -First 1
  } catch {
    return
  }
  if ($current -eq "$PID") {
    Remove-Item -LiteralPath $script:LockFile -Force -ErrorAction SilentlyContinue
  }
}

function Acquire-Lock {
  Ensure-CodexDirs

  if (Test-Path -LiteralPath $script:LockFile) {
    $existingPid = $null
    try {
      $existingPid = Get-Content -LiteralPath $script:LockFile -ErrorAction Stop | Select-Object -First 1
    } catch {
      $existingPid = $null
    }

    if ($existingPid) {
      $proc = Get-Process -Id ([int]$existingPid) -ErrorAction SilentlyContinue
      if ($proc) {
        Write-Output "crelogin already running with PID $existingPid."
        Write-Output 'Wait for it to finish, or run ckilllogin to stop it.'
        return $false
      }
    }

    Remove-Item -LiteralPath $script:LockFile -Force -ErrorAction SilentlyContinue
  }

  Set-Content -LiteralPath $script:LockFile -Value "$PID" -Encoding ascii
  return $true
}

function Invoke-CodexCommand {
  param(
    [string[]]$Args,
    [bool]$SuppressAutoOpen = $false
  )

  $oldCodexHome = $env:CODEX_HOME
  $oldBrowser = $env:BROWSER

  $env:CODEX_HOME = $script:CodexHome
  if ($SuppressAutoOpen -and $env:CODEX_AUTH_AUTO_OPEN -ne '1') {
    $env:BROWSER = 'cmd /c exit 0'
  }

  try {
    & codex @Args @ActionArgs
    return $LASTEXITCODE
  } finally {
    if ($null -ne $oldCodexHome) { $env:CODEX_HOME = $oldCodexHome } else { Remove-Item Env:CODEX_HOME -ErrorAction SilentlyContinue }
    if ($null -ne $oldBrowser) { $env:BROWSER = $oldBrowser } else { Remove-Item Env:BROWSER -ErrorAction SilentlyContinue }
  }
}

function Invoke-LoginLink {
  if (-not (Acquire-Lock)) {
    return 1
  }

  $oldCodexHome = $env:CODEX_HOME
  $oldBrowser = $env:BROWSER
  $link = $null
  $exitCode = 0

  try {
    if ($env:CODEX_AUTH_AUTO_OPEN -ne '1') {
      Write-Output 'Browser auto-open is disabled (CODEX_AUTH_AUTO_OPEN=0).'
      Write-Output 'Link will only be printed/copied; open it manually when ready.'
      $env:BROWSER = 'cmd /c exit 0'
    }
    $env:CODEX_HOME = $script:CodexHome

    & codex login @ActionArgs 2>&1 | ForEach-Object {
      $line = $_.ToString()
      Write-Output $line
      if (-not $link -and $line -match '^https://auth\.openai\.com/\S+') {
        $link = $Matches[0]
        Set-Content -LiteralPath $script:LastLinkFile -Value $link -Encoding ascii
        if (Copy-ToClipboard -Text $link) {
          Write-Output "Login link copied to clipboard and saved: $script:LastLinkFile"
        } else {
          Write-Output "Login link found (copy tool unavailable): $link"
          Write-Output "Saved link to: $script:LastLinkFile"
        }
      }
    }
    $exitCode = $LASTEXITCODE
  } finally {
    if ($null -ne $oldCodexHome) { $env:CODEX_HOME = $oldCodexHome } else { Remove-Item Env:CODEX_HOME -ErrorAction SilentlyContinue }
    if ($null -ne $oldBrowser) { $env:BROWSER = $oldBrowser } else { Remove-Item Env:BROWSER -ErrorAction SilentlyContinue }
    Release-Lock
  }

  return $exitCode
}

function Invoke-KillLogin {
  if (Test-Path -LiteralPath $script:LockFile) {
    try {
      $existingPid = Get-Content -LiteralPath $script:LockFile -ErrorAction Stop | Select-Object -First 1
      if ($existingPid) {
        $proc = Get-Process -Id ([int]$existingPid) -ErrorAction SilentlyContinue
        if ($proc) {
          Stop-Process -Id ([int]$existingPid) -Force -ErrorAction SilentlyContinue
          Write-Output "Stopped crelogin PID $existingPid."
        } else {
          Write-Output 'Found stale crelogin lock.'
        }
      }
    } catch {
      Write-Output 'Found stale crelogin lock.'
    }
    Remove-Item -LiteralPath $script:LockFile -Force -ErrorAction SilentlyContinue
  } else {
    Write-Output 'No active crelogin lock found.'
  }

  $candidate = Get-CimInstance Win32_Process | Where-Object {
    ($_.CommandLine -like '*codex*login*') -and ($_.ProcessId -ne $PID)
  }
  foreach ($proc in $candidate) {
    try {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
    } catch {
      # ignore
    }
  }

  return 0
}

switch ($Action) {
  'status' { exit (Invoke-CodexCommand -Args @('login','status')) }
  'login' { exit (Invoke-CodexCommand -Args @('login','--device-auth')) }
  'login_browser' { exit (Invoke-CodexCommand -Args @('login')) }
  'logout' { exit (Invoke-CodexCommand -Args @('logout')) }
  'login_link' { exit (Invoke-LoginLink) }
  'relogin' {
    [void](Invoke-CodexCommand -Args @('logout'))
    exit (Invoke-LoginLink)
  }
  'relogin_device' {
    [void](Invoke-CodexCommand -Args @('logout'))
    exit (Invoke-CodexCommand -Args @('login','--device-auth'))
  }
  'kill_login' { exit (Invoke-KillLogin) }
}
