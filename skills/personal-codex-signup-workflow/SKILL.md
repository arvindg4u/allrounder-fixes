---
name: personal-codex-signup-workflow
description: End-to-end personal Codex signup automation for Arvind using crelogin + control-cli alias + OTP + Playwright browser flow with strict step ordering and retry/error recovery. Use when user asks to run full signup/login workflow automatically without manual intervention, or to reset/restart the same workflow on this personal system.
---

# Personal Codex Signup Workflow

Run this only for Arvind's personal environment.

## Fixed Personal Defaults

Use these defaults unless user explicitly overrides:

- `OWNER_EMAIL=rvndkaswan@gmail.com`
- `DEST_EMAIL=rvndkaswan@gmail.com`
- `ALIAS_DOMAIN=arvindlab.dedyn.io`
- `ALIAS_PREFIX=app`
- `BASE_URL=https://app.arvindlab.dedyn.io`

## Required Tools

- `crelogin` command available in shell
- `control-cli` skill installed at `/home/rvndk/.codex/skills/control-cli`
- Playwright MCP available and running without extension mode

## Core Workflow (Run In Order)

1. Preflight
- Run `bash scripts/kill_stale_login.sh` to clear stale login listeners.
- Run `node /home/rvndk/.codex/skills/control-cli/scripts/control-cli.mjs health --base-url "$BASE_URL"`.
- If health fails, stop and report the failure before browser actions.

2. Optional hard reset aliases (only when requested)
- Run `bash scripts/delete_all_aliases.sh --yes`.

3. Start fresh login session
- Run `crelogin` in an interactive TTY session and keep that session alive (do not use `nohup`, detached `&`, or one-shot non-interactive execution).
- Confirm listener is active on `localhost:1455` before browser steps (optional check: `lsof -i :1455 -sTCP:LISTEN -n -P`).
- Read latest auth URL from `/home/rvndk/.codex/.last-login-link`.
- Open that exact URL in Playwright (do not start from generic `/log-in` URL when fresh state is needed).

4. Create alias
- Run `bash scripts/create_alias.sh`.
- Parse and store `alias_email` and `alias_id`.

5. Signup browser flow
- Open auth URL if not already open.
- Click `Sign up`.
- Fill email with `alias_email`.
- Click `Continue`.
- Fill password with strong random password (>=12 chars).
- Click `Continue`.

6. OTP flow
- Wait for email verification page.
- Fetch OTP using `bash scripts/get_code_for_alias.sh --alias-email <alias_email>`.
- Fill code and click `Continue`.

7. About-you flow
- Fill random female American full name.
- Fill DOB with age >= 20 (recommended year <= current_year - 20).
- Birthday controls are contenteditable `spinbutton`s. Use typing/evaluate on month/day/year fields if generic form-fill fails.
- Click `Finish creating account`.

8. Consent/finalization
- If consent page appears (`Sign in to Codex with ChatGPT`), click `Continue`.
- Verify success page contains `Signed in to Codex` or equivalent completion signal.
- Verify `crelogin` process output includes `Successfully logged in`.

## Random Data Rules

- Password format: at least 12 chars with upper/lower/number/symbol.
- Name pool (example set): `Emily Johnson`, `Sophia Miller`, `Olivia Davis`, `Ava Wilson`, `Mia Taylor`.
- DOB examples (20+ safe): `1997-06-11`, `1998-07-14`, `1996-10-22`.

## Mandatory Error Handling

If any of these errors appear, apply the exact recovery:

- `Invalid client. Please start over.`
  - Navigate again using the exact fresh URL from `.last-login-link`.
  - Re-run step 5.

- Playwright launch error: `Opening in existing browser session`
  - Kill Edge processes from shell.
  - Re-run Playwright navigation.

- OTP not found
  - Re-run OTP polling script with higher retries.
  - Use `Resend email` button once, then poll again.

- OTP rejected/expired
  - Click `Resend email`.
  - Poll new OTP and retry.

- Stuck on extension/connect tab
  - Ensure Playwright is not running in extension mode.
  - Restart Playwright MCP session and re-open auth URL.

- `crelogin` started but no active listener on `localhost:1455`
  - Do not use detached/background startup.
  - Restart `crelogin` in interactive TTY and keep session open until callback success.
  - Re-read `/home/rvndk/.codex/.last-login-link` and continue from step 5.

- Playwright DOB fill error: `invalid option: expected one of ...` (spinbutton type)
  - Fill only full name through standard form helper.
  - Fill DOB `month/day/year` using typing or element evaluate on the `spinbutton` controls.
  - Retry `Finish creating account`.

- Permission denied on script execution after reinstall
  - Run script with `bash scripts/<script-name>.sh`.
  - Optionally fix once: `chmod +x scripts/*.sh`.

See detailed troubleshooting: `references/error-handling.md`.

## Output Contract

After completion, report:

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
