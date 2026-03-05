---
name: personal-codex-signup-workflow
description: "End-to-end personal Codex signup automation for Arvind using crelogin + control-cli alias + OTP + Playwright with strict step ordering and recovery. Use when user asks to run full signup/login/reset automatically on this personal setup. Resolve target side first: if user already mentions Windows or Linux/WSL, use it directly; otherwise ask one short side-selection question before running the workflow."
---

# Personal Codex Signup Workflow

Run this only for Arvind's personal environment.

## Target Side Selection (Mandatory First)

Do this before any command:

1. Check if user already specified side (`windows`, `linux`, `wsl`, etc.).
2. If side is already specified, do not ask again.
3. If side is not specified, ask exactly one short question: `Signup Windows side karna hai ya Linux/WSL side?`
4. Use only that side's command set for the whole run.

## Fixed Personal Defaults

Use these defaults unless user explicitly overrides:

- `OWNER_EMAIL=rvndkaswan@gmail.com`
- `DEST_EMAIL=rvndkaswan@gmail.com`
- `ALIAS_DOMAIN=arvindlab.dedyn.io`
- `ALIAS_PREFIX=app`
- `BASE_URL=https://app.arvindlab.dedyn.io`

## Paths and Command Surface by Side

### Linux/WSL Side

- `CODEX_HOME=/home/rvndk/.codex`
- Skill root: `/home/rvndk/.codex/skills/personal-codex-signup-workflow`
- Control CLI: `/home/rvndk/.codex/skills/control-cli/scripts/control-cli.mjs`
- Last auth link: `/home/rvndk/.codex/.last-login-link`
- Wrapper install script: `bash scripts/linux/install_wrappers.sh`

### Windows Side

- `CODEX_HOME=%USERPROFILE%\\.codex`
- Skill root: `%USERPROFILE%\\.codex\\skills\\personal-codex-signup-workflow`
- Control CLI: `%USERPROFILE%\\.codex\\skills\\control-cli\\scripts\\control-cli.mjs`
- Last auth link: `%USERPROFILE%\\.codex\\.last-login-link`
- Wrapper install script: `powershell -ExecutionPolicy Bypass -File scripts/windows/install_wrappers.ps1`

## Prebuilt Wrappers Included in This Skill

Install wrappers before signup if missing.

### Linux/WSL

```bash
bash scripts/linux/install_wrappers.sh
```

### Windows

```powershell
powershell -ExecutionPolicy Bypass -File scripts/windows/install_wrappers.ps1
```

Expected wrapper commands after install:

- `crelogin`
- `crelogindev`
- `clogin`
- `cloginweb`
- `clogout`
- `cstatus`
- `cloginlink`
- `ckilllogin`

## Core Workflow (Run In Order)

1. Preflight
- Linux/WSL:
  - `bash scripts/kill_stale_login.sh`
  - `node /home/rvndk/.codex/skills/control-cli/scripts/control-cli.mjs health --base-url "$BASE_URL"`
- Windows:
  - `powershell -ExecutionPolicy Bypass -File scripts/windows/kill_stale_login.ps1`
  - `node "%USERPROFILE%\\.codex\\skills\\control-cli\\scripts\\control-cli.mjs" health --base-url "$BASE_URL"`
- If health fails, stop and report before browser actions.

2. Optional hard reset aliases (only when requested)
- Linux/WSL: `bash scripts/delete_all_aliases.sh --yes`
- Windows: `powershell -ExecutionPolicy Bypass -File scripts/windows/delete_all_aliases.ps1 -Yes`

3. Start fresh login session
- Linux/WSL: run `crelogin` in an interactive TTY and keep session alive.
- Windows: run `crelogin` (updated wrapper starts hidden background login-link session; no extra visible CMD window required).
- Confirm listener on `localhost:1455`:
  - Linux/WSL: `lsof -i :1455 -sTCP:LISTEN -n -P`
  - Windows: `netstat -ano | findstr :1455`
- Read fresh auth URL from side-specific `.last-login-link` file.
- Open that exact URL in Playwright (never start from generic `/log-in` URL for a fresh run).

4. Create alias
- Linux/WSL: `bash scripts/create_alias.sh`
- Windows: `powershell -ExecutionPolicy Bypass -File scripts/windows/create_alias.ps1`
- Parse and store `alias_email` and `alias_id`.

5. Signup browser flow
- Open auth URL if not already open.
- Click `Sign up`.
- Fill email with `alias_email`.
- Click `Continue`.
- Fill password with strong random password (`>=12` chars).
- Click `Continue`.

6. OTP flow
- Wait for email verification page.
- Fetch OTP:
  - Linux/WSL: `bash scripts/get_code_for_alias.sh --alias-email <alias_email>`
  - Windows: `powershell -ExecutionPolicy Bypass -File scripts/windows/get_code_for_alias.ps1 -AliasEmail <alias_email>`
- Fill code and click `Continue`.

7. About-you flow
- Fill random female American full name.
- Fill DOB with age `>= 20` (recommended year `<= current_year - 20`).
- Birthday controls are contenteditable `spinbutton`s. Use typing/evaluate on month/day/year fields if generic form-fill fails.
- Click `Finish creating account`.

8. Consent/finalization
- If consent page appears (`Sign in to Codex with ChatGPT`), click `Continue`.
- Verify success page contains `Signed in to Codex` or equivalent signal.
- Verify CLI side status confirms login (`cstatus` or equivalent).

## Random Data Rules

- Password format: at least 12 chars with upper/lower/number/symbol.
- Name pool (example set): `Emily Johnson`, `Sophia Miller`, `Olivia Davis`, `Ava Wilson`, `Mia Taylor`.
- DOB examples (20+ safe): `1997-06-11`, `1998-07-14`, `1996-10-22`.

## Mandatory Error Handling

If any of these errors appear, apply the exact recovery:

- `Invalid client. Please start over.`
  - Read fresh URL from side-specific `.last-login-link`.
  - Re-open that exact URL and repeat from signup step.

- Playwright launch error: `Opening in existing browser session`
  - Kill Edge processes and re-open Playwright:
    - Windows: `taskkill /F /IM msedge.exe` and `taskkill /F /IM msedgewebview2.exe`

- OTP not found
  - Re-run OTP polling with higher retries.
  - Click `Resend email` once, then poll again.

- OTP rejected/expired
  - Click `Resend email`.
  - Poll fresh OTP and retry.

- Stuck on extension/connect tab
  - Ensure Playwright MCP is not in extension mode.
  - Restart MCP and re-open the exact auth URL.

- `crelogin` started but no active listener on `localhost:1455`
  - Linux/WSL: restart `crelogin` in interactive TTY and keep it open.
  - Windows: run `crelogin` again (hidden background mode) and check logs from `%USERPROFILE%\.codex\tmp\crelogin-*.out.log`.
  - Re-read `.last-login-link` and continue from signup.

- DOB fill error: `invalid option: expected one of ...` (spinbutton type)
  - Fill only full name via standard helper.
  - Fill DOB month/day/year via typing/evaluate on spinbuttons.
  - Retry `Finish creating account`.

- Permission denied while running shell scripts
  - Run with explicit shell (`bash scripts/<name>.sh`) or fix once with `chmod +x scripts/*.sh`.

See detailed troubleshooting: `references/error-handling.md`.

## Output Contract

After completion, report:

- `target_side` (`windows` or `linux`)
- `alias_email`
- generated password
- OTP used
- final page URL
- login success confirmation text

If workflow fails, report:

- failing step number
- exact error text
- recovery already attempted
- next recovery action
