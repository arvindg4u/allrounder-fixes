# Error Handling Reference

## 1) Invalid Client

Symptom:

- Page shows: `Oops, an error occurred!`
- Message: `Invalid client. Please start over.`

Action:

1. Read fresh auth URL from side-specific file:
   - Linux/WSL: `/home/rvndk/.codex/.last-login-link`
   - Windows: `%USERPROFILE%\.codex\.last-login-link`
2. Navigate to that exact URL.
3. Repeat signup steps from email entry.

## 2) Browser Session Lock (Edge)

Symptom:

- Playwright error includes `Opening in existing browser session`.

Action:

1. Kill Edge processes:
   - `taskkill /F /IM msedge.exe`
   - `taskkill /F /IM msedgewebview2.exe`
2. Re-run Playwright navigation.

## 3) OTP Missing

Symptom:

- No code available for alias within polling window.

Action:

1. Run `bash scripts/get_code_for_alias.sh --alias-email <alias> --max-tries 40 --sleep-secs 2`.
2. If still missing, click `Resend email` once.
3. Poll again.

## 4) OTP Rejected

Symptom:

- Verification fails after submit.

Action:

1. Click `Resend email`.
2. Fetch fresh code again.
3. Fill new code and submit.

## 5) Stale Login Process

Symptom:

- `crelogin` conflicts on port `1455` or old session behavior appears.

Action:

1. Run side-specific stale cleanup:
   - Linux/WSL: `bash scripts/kill_stale_login.sh`
   - Windows: `powershell -ExecutionPolicy Bypass -File scripts/windows/kill_stale_login.ps1`
   - If direct PowerShell invocation behaves unexpectedly, use `ckilllogin` wrapper fallback.
2. Restart `crelogin` in that same side.

## 6) crelogin Started but No Listener

Symptom:

- `crelogin` does not produce active listener (`localhost:1455`).
- Link file does not refresh.

Action:

1. Linux/WSL: start `crelogin` in an interactive TTY and keep it open.
2. Windows: run `crelogin` again (hidden background mode) and inspect `%USERPROFILE%\.codex\tmp\crelogin-*.out.log`.
3. Read fresh URL from side-specific `.last-login-link`.
4. Continue browser flow from signup step.

## 7) DOB Fill Fails on About-You Screen

Symptom:

- Playwright form helper fails with: `invalid option: expected one of ...`.
- Birthday fields do not update via generic `fill_form`.

Action:

1. Fill full name normally.
2. Fill birthday month/day/year by typing into `spinbutton` controls (or element evaluate).
3. Click `Finish creating account`.

## 8) Alias Cleanup Before Restart

When user asks fresh reset:

1. Run side-specific alias cleanup:
   - Linux/WSL: `bash scripts/delete_all_aliases.sh --yes`
   - Windows: `powershell -ExecutionPolicy Bypass -File scripts/windows/delete_all_aliases.ps1 -Yes`
2. Verify no aliases remain via control-cli list.

## 9) Script Permission Denied After Reinstall

Symptom:

- Shell returns `Permission denied` while running `scripts/*.sh` directly.

Action:

1. Run scripts as `bash scripts/<name>.sh` (recommended default).
2. Optional one-time fix: `chmod +x scripts/*.sh`.

## 10) Side Not Specified by User

Symptom:

- User asks for signup workflow but does not specify `windows` or `linux/wsl`.

Action:

1. Ask one short clarification question: `Signup Windows side karna hai ya Linux/WSL side?`
2. Use only that side's commands for the rest of the run.

## 11) Wrappers Missing on Target Side

Symptom:

- `crelogin`/`cstatus` commands are not found.

Action:

1. Install wrappers on selected side:
   - Linux/WSL: `bash scripts/linux/install_wrappers.sh`
   - Windows: `powershell -ExecutionPolicy Bypass -File scripts/windows/install_wrappers.ps1`
2. Re-run `cstatus` to confirm wrapper availability.

## 12) Windows Browser Opens Automatically During Login-Link Step

Symptom:

- `crelogin` / `cloginlink` opens browser automatically on Windows when it should stay manual.

Action:

1. Reinstall updated wrappers:
   - `powershell -ExecutionPolicy Bypass -File scripts/windows/install_wrappers.ps1`
2. Re-run `cloginlink`. Updated helper uses device-auth on Windows (manual URL flow) and forces:
   - `CODEX_AUTH_AUTO_OPEN=0`
   - `NO_BROWSER=1`
   - `OPENAI_NO_BROWSER=1`
   - `BROWSER=cmd /c exit 0`
3. Updated Windows wrapper first tries a WSL bridge (`~/.local/bin/cloginlink`) with browser disabled; this is the preferred no-auto-open path.
4. If auto-open still persists after reinstall, continue signup flow from Linux/WSL side for link generation, then proceed with browser automation.

## 13) Windows CMD Window Pops Up During `crelogin`

Symptom:

- Running `crelogin` opens an extra visible CMD window.

Action:

1. Reinstall wrappers:
   - `powershell -ExecutionPolicy Bypass -File scripts/windows/install_wrappers.ps1`
2. Confirm `%USERPROFILE%\.local\bin\crelogin.cmd` invokes `login_link_bg`.
3. Run `crelogin` again; expected behavior is hidden background session with logs under `%USERPROFILE%\.codex\tmp\crelogin-*.out.log`.
