# Error Handling Reference

## 1) Invalid Client

Symptom:

- Page shows: `Oops, an error occurred!`
- Message: `Invalid client. Please start over.`

Action:

1. Read fresh auth URL from `/home/rvndk/.codex/.last-login-link`.
2. Navigate to that exact URL.
3. Repeat signup steps from email entry.

## 2) Browser Session Lock (Edge)

Symptom:

- Playwright error includes `Opening in existing browser session`.

Action:

1. Kill Edge processes:
   - `cmd.exe /c taskkill /F /IM msedge.exe`
   - `cmd.exe /c taskkill /F /IM msedgewebview2.exe`
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

1. Run `bash scripts/kill_stale_login.sh`.
2. Restart `crelogin`.

## 6) Alias Cleanup Before Restart

When user asks fresh reset:

1. Run `bash scripts/delete_all_aliases.sh --yes`.
2. Verify no aliases remain via control-cli list.

## 7) Script Permission Denied After Reinstall

Symptom:

- Shell returns `Permission denied` while running `scripts/*.sh` directly.

Action:

1. Run scripts as `bash scripts/<name>.sh` (recommended default).
2. Optional one-time fix: `chmod +x scripts/*.sh`.
