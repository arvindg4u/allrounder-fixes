---
name: control-cli
description: Operate the personal alias/login mail system through a deterministic Node CLI for health, alias CRUD, magic-link auth, inbound mail simulation, job inspection, and worker runs. Use when user asks to control or automate the alias service APIs from terminal instead of dashboard clicks.
---

# Control CLI

Run the personal alias/login control plane from terminal using the bundled script.

## Use This Skill

1. Work from the service repo root when possible so `.env.local` and `.env` auto-load.
2. Run the bundled CLI directly when needed:

```bash
node C:/Users/rvndk/.codex/skills/control-cli/scripts/control-cli.mjs <command> [options]
```

3. Prefer the project-local CLI when it exists:

```bash
npm run control -- <command> [options]
```

## Command Flow

1. Run `config:check` first to confirm base URL and env readiness.
2. Run `health`.
3. If `health` shows `fetch failed`, set `--base-url` or configure `.env.local` with `NEXT_PUBLIC_APP_URL`.
4. Run alias/auth/mail commands from [references/commands.md](references/commands.md).
5. Use `--retries` and `--retry-delay-ms` for transient network issues.

## Personal Mode vs Token Mode

- If `ENFORCE_API_TOKENS=false` or unset, token flags are optional.
- If `ENFORCE_API_TOKENS=true`, pass token flags or set env vars:
  - `CONTROL_API_TOKEN`
  - `INBOUND_WEBHOOK_TOKEN`
  - `MAIL_WORKER_TOKEN`

## Reliability Rules

1. Use idempotent commands for writes (`aliases:create`, `aliases:create-random`, `aliases:toggle`, `aliases:delete`, `auth:request-link`).
2. Reuse `--idempotency-key` for safe retries when required.
3. Keep deletion guarded with `--yes`.
4. Print and inspect JSON response payload before next mutation.

## References

- Read [references/commands.md](references/commands.md) for full command list, required flags, and API endpoint mapping.
