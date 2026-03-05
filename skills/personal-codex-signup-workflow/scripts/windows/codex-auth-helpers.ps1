param(
  [Parameter(Mandatory = $true)]
  [ValidateSet('status','login','login_browser','logout','login_link','login_link_bg','relogin','relogin_bg','relogin_device','kill_login')]
  [string]$Action,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ActionArgs
)

$ErrorActionPreference = 'Continue'
$PSNativeCommandUseErrorActionPreference = $false

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

function Save-LoginLink {
  param([string]$Link)
  Set-Content -LiteralPath $script:LastLinkFile -Value $Link -Encoding ascii
  if (Copy-ToClipboard -Text $Link) {
    Write-Output "Login link copied to clipboard and saved: $script:LastLinkFile"
  } else {
    Write-Output "Login link found (copy tool unavailable): $Link"
    Write-Output "Saved link to: $script:LastLinkFile"
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
  $oldNoBrowser = $env:NO_BROWSER
  $oldOpenAiNoBrowser = $env:OPENAI_NO_BROWSER
  $oldAutoOpen = $env:CODEX_AUTH_AUTO_OPEN

  $env:CODEX_HOME = $script:CodexHome
  if ($SuppressAutoOpen -and $env:CODEX_AUTH_AUTO_OPEN -ne '1') {
    $env:CODEX_AUTH_AUTO_OPEN = '0'
    $env:BROWSER = 'cmd /c exit 0'
    $env:NO_BROWSER = '1'
    $env:OPENAI_NO_BROWSER = '1'
  }

  try {
    & codex @Args @ActionArgs
    return $LASTEXITCODE
  } finally {
    if ($null -ne $oldCodexHome) { $env:CODEX_HOME = $oldCodexHome } else { Remove-Item Env:CODEX_HOME -ErrorAction SilentlyContinue }
    if ($null -ne $oldBrowser) { $env:BROWSER = $oldBrowser } else { Remove-Item Env:BROWSER -ErrorAction SilentlyContinue }
    if ($null -ne $oldNoBrowser) { $env:NO_BROWSER = $oldNoBrowser } else { Remove-Item Env:NO_BROWSER -ErrorAction SilentlyContinue }
    if ($null -ne $oldOpenAiNoBrowser) { $env:OPENAI_NO_BROWSER = $oldOpenAiNoBrowser } else { Remove-Item Env:OPENAI_NO_BROWSER -ErrorAction SilentlyContinue }
    if ($null -ne $oldAutoOpen) { $env:CODEX_AUTH_AUTO_OPEN = $oldAutoOpen } else { Remove-Item Env:CODEX_AUTH_AUTO_OPEN -ErrorAction SilentlyContinue }
  }
}

function Invoke-LoginLink {
  if (-not (Acquire-Lock)) {
    return 1
  }

  $oldCodexHome = $env:CODEX_HOME
  $oldBrowser = $env:BROWSER
  $oldNoBrowser = $env:NO_BROWSER
  $oldOpenAiNoBrowser = $env:OPENAI_NO_BROWSER
  $oldAutoOpen = $env:CODEX_AUTH_AUTO_OPEN
  $link = $null
  $exitCode = 0
  $useWslBridge = $false

  try {
    Write-Output 'Browser auto-open is disabled (CODEX_AUTH_AUTO_OPEN=0).'
    Write-Output 'Link will only be printed/copied; open it manually when ready.'

    $env:CODEX_HOME = $script:CodexHome
    if ($env:CODEX_AUTH_AUTO_OPEN -ne '1') {
      $env:CODEX_AUTH_AUTO_OPEN = '0'
      $env:BROWSER = 'cmd /c exit 0'
      $env:NO_BROWSER = '1'
      $env:OPENAI_NO_BROWSER = '1'
    }

    $wsl = Get-Command wsl.exe -ErrorAction SilentlyContinue
    if ($wsl) {
      $useWslBridge = $true
      Write-Output 'Using WSL login-link bridge to avoid Windows browser auto-open.'
      & wsl.exe -e bash -lc "export CODEX_AUTH_AUTO_OPEN=0; export CODEX_AUTH_BROWSER_CMD=/bin/true; ~/.local/bin/cloginlink" 2>&1 | ForEach-Object {
        $line = $_.ToString()
        Write-Output $line
        if (-not $link -and $line -match 'https://auth\.openai\.com/\S+') {
          $link = $Matches[0]
          Save-LoginLink -Link $link
        }
      }
      $exitCode = $LASTEXITCODE
    } else {
      Write-Output 'WSL not found; using native device-auth flow.'
      & codex login --device-auth @ActionArgs 2>&1 | ForEach-Object {
        $line = $_.ToString()
        Write-Output $line
        if (-not $link -and $line -match 'https://auth\.openai\.com/\S+') {
          $link = $Matches[0]
          Save-LoginLink -Link $link
        }
      }
      $exitCode = $LASTEXITCODE
    }

    if (-not $link) {
      Write-Output "No auth link was parsed automatically. You can still continue manually with the on-screen device-auth URL + code."
    }
  } finally {
    if ($null -ne $oldCodexHome) { $env:CODEX_HOME = $oldCodexHome } else { Remove-Item Env:CODEX_HOME -ErrorAction SilentlyContinue }
    if ($null -ne $oldBrowser) { $env:BROWSER = $oldBrowser } else { Remove-Item Env:BROWSER -ErrorAction SilentlyContinue }
    if ($null -ne $oldNoBrowser) { $env:NO_BROWSER = $oldNoBrowser } else { Remove-Item Env:NO_BROWSER -ErrorAction SilentlyContinue }
    if ($null -ne $oldOpenAiNoBrowser) { $env:OPENAI_NO_BROWSER = $oldOpenAiNoBrowser } else { Remove-Item Env:OPENAI_NO_BROWSER -ErrorAction SilentlyContinue }
    if ($null -ne $oldAutoOpen) { $env:CODEX_AUTH_AUTO_OPEN = $oldAutoOpen } else { Remove-Item Env:CODEX_AUTH_AUTO_OPEN -ErrorAction SilentlyContinue }
    Release-Lock
  }

  return $exitCode
}

function Invoke-LoginLinkBackground {
  param([bool]$DoLogout = $false)

  Ensure-CodexDirs

  if ($DoLogout) {
    try {
      [void](Invoke-CodexCommand -Args @('logout'))
    } catch {
      # continue even if logout is non-interactive-unfriendly
    }
  }

  $tmpDir = Join-Path $script:CodexHome 'tmp'
  if (-not (Test-Path -LiteralPath $tmpDir)) {
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
  }

  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $outLog = Join-Path $tmpDir "crelogin-$stamp.out.log"
  $errLog = Join-Path $tmpDir "crelogin-$stamp.err.log"
  $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
  $psArgs = @(
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', $PSCommandPath,
    'login_link'
  )
  if ($ActionArgs) {
    $psArgs += $ActionArgs
  }

  $proc = Start-Process -FilePath $ps -ArgumentList $psArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog

  Write-Output 'crelogin started in hidden background mode.'
  Write-Output "crelogin_pid=$($proc.Id)"
  Write-Output "crelogin_out_log=$outLog"
  Write-Output "crelogin_err_log=$errLog"
  Write-Output "link_file=$script:LastLinkFile"
  Write-Output 'Use `Get-Content $env:USERPROFILE\.codex\.last-login-link` after a few seconds.'
  return 0
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

  $wslCandidate = Get-CimInstance Win32_Process | Where-Object {
    ($_.CommandLine -like '*wsl.exe*cloginlink*') -or ($_.CommandLine -like '*wsl.exe*codex*login*')
  }
  foreach ($proc in $wslCandidate) {
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
  'login_browser' { exit (Invoke-CodexCommand -Args @('login') -SuppressAutoOpen $true) }
  'logout' { exit (Invoke-CodexCommand -Args @('logout')) }
  'login_link' { exit (Invoke-LoginLink) }
  'login_link_bg' { exit (Invoke-LoginLinkBackground) }
  'relogin' {
    [void](Invoke-CodexCommand -Args @('logout'))
    exit (Invoke-LoginLink)
  }
  'relogin_bg' { exit (Invoke-LoginLinkBackground -DoLogout $true) }
  'relogin_device' {
    [void](Invoke-CodexCommand -Args @('logout'))
    exit (Invoke-CodexCommand -Args @('login','--device-auth'))
  }
  'kill_login' { exit (Invoke-KillLogin) }
}
