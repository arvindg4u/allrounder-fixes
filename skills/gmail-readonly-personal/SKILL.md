---
name: gmail-readonly-personal
description: Manage a personal Gmail inbox through a local read-only CLI with persistent OAuth token and OTP extraction. Use when the user asks to authenticate Gmail once, list/read recent emails, fetch OTP or verification codes, or keep a ready-to-run personal Gmail workflow without reconfiguring credentials.
---

# Gmail Readonly Personal

Run a ready personal Gmail CLI with read-only scope and persistent token refresh.

## Use The Bundled Scripts

Run setup once:

```bash
/home/rvndk/.codex/skills/gmail-readonly-personal/scripts/setup_env.sh
```

Run the CLI:

```bash
/home/rvndk/.codex/skills/gmail-readonly-personal/scripts/gmail <command> [args]
```

## Commands

- `login` Authenticate and save token at `~/.config/gmail-readonly-cli/token.json`.
- `list --limit N --query "..."` List recent messages.
- `read <message_id> [--full]` Read a specific message.
- `otp [--limit N] [--all] [--query "..."]` Scan for OTP-like numeric codes.

## Personal Defaults

- OAuth client JSON: `assets/credentials.json` in this skill.
- If the skill is pulled from GitHub, copy `assets/credentials.example.json` to `assets/credentials.json` and fill your own OAuth values.
- Token cache: `~/.config/gmail-readonly-cli/token.json`.
- Scope: `https://www.googleapis.com/auth/gmail.readonly`.
- Local OAuth callback: `http://127.0.0.1:8080/`.

## Execution Rules

- Keep access read-only; do not add send/delete/modify scopes.
- Use `scripts/gmail` as the default entrypoint instead of invoking python directly.
- If OAuth flow fails on `8080`, free the port and retry `login`.
- If OTP scan returns noisy matches, use a stricter Gmail query first, then run `otp --query "..."`.

## Optional Reference

Read `references/otp-query-patterns.md` for stricter query templates when newsletters or alerts create false positives.
