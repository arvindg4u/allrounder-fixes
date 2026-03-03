# Commands

## Quick Start

```bash
# 1) sanity
npm run control -- config:check
npm run control -- health

# 2) list aliases
npm run control -- aliases:list --owner-email rvndkaswan@gmail.com

# 3) create random alias
npm run control -- aliases:create-random --owner-email rvndkaswan@gmail.com --destination-email rvndkaswan@gmail.com --alias-domain arvindlab.dedyn.io --alias-prefix app
```

## Global Options

- `--base-url <url>` default: `NEXT_PUBLIC_APP_URL` or `http://localhost:3000`
- `--retries <number>` default: `2`
- `--retry-delay-ms <number>` default: `500`

## Base URL Resolution

Resolve order:
1. `--base-url`
2. `NEXT_PUBLIC_APP_URL` (env)
3. fallback `http://localhost:3000`

If local app run nahi ho rahi aur `--base-url`/env set nahi hai, to `health` me `fetch failed` aayega.

Quick fix:

```bash
npm run control -- health --base-url https://app.arvindlab.dedyn.io
```

Permanent fix (`.env.local`):

```bash
NEXT_PUBLIC_APP_URL=https://app.arvindlab.dedyn.io
```

## Command Matrix

| Command | Required options | Optional options | API |
|---|---|---|---|
| `health` | none | `--base-url` | `GET /api/health` |
| `aliases:list` | `--owner-email` | `--status`, `--base-url`, `--control-token` | `GET /api/aliases` |
| `aliases:create` | `--owner-email`, `--alias-email`, `--destination-email` | `--label`, `--base-url`, `--control-token`, `--idempotency-key` | `POST /api/aliases` |
| `aliases:create-random` | `--owner-email`, `--destination-email` | `--alias-domain`, `--alias-prefix`, `--length`, `--label`, `--base-url`, `--control-token`, `--idempotency-key` | `POST /api/aliases` |
| `aliases:toggle` | `--owner-email`, `--alias-id` | `--status`, `--base-url`, `--control-token`, `--idempotency-key` | `PATCH /api/aliases/:id` |
| `aliases:delete` | `--owner-email`, `--alias-id`, `--yes` | `--base-url`, `--control-token`, `--idempotency-key` | `DELETE /api/aliases/:id` |
| `auth:request-link` | `--email` | `--redirect-to`, `--base-url`, `--control-token`, `--idempotency-key` | `POST /api/auth/request-login-link` |
| `auth:verify` | `--token` | `--redirect-to`, `--base-url` | `GET /auth/verify` |
| `mail:inbound:test` | `--from-email`, `--to-email` | `--subject`, `--text`, `--provider-event-id`, `--base-url`, `--inbound-token`, `--inbound-signing-secret` | `POST /api/mail/inbound` |
| `mail:jobs:list` | `--owner-email` | `--status`, `--limit`, `--base-url`, `--control-token` | `GET /api/mail/jobs` |
| `mail:worker:run` | none | `--limit`, `--base-url`, `--worker-token` | `POST /api/mail/worker/run` |
| `config:check` | none | `--base-url` | local env inspection |

## Notes

1. `mail:worker:run` and `mail:inbound:test` token flags become mandatory only when `ENFORCE_API_TOKENS=true`.
2. `aliases:create-random` accepts `--length` from `6` to `30`.
3. `aliases:delete` always requires `--yes` guard.
4. Write commands use idempotency cache file from `CONTROL_IDEMPOTENCY_STORE` (default `.control/idempotency-store.json`).

## Useful Recipes

### Create alias then request login link

```bash
npm run control -- aliases:create-random \
  --owner-email rvndkaswan@gmail.com \
  --destination-email arvindg4u365@gmail.com \
  --alias-domain arvindlab.dedyn.io \
  --alias-prefix app

npm run control -- auth:request-link \
  --email rvndkaswan@gmail.com \
  --redirect-to https://app.arvindlab.dedyn.io/dashboard
```

### Simulate inbound mail to an alias

```bash
npm run control -- mail:inbound:test \
  --from-email otp@tm1.openai.com \
  --to-email app-12345678@arvindlab.dedyn.io \
  --subject "OTP test" \
  --text "Your code is 123456"
```

### Inspect and process queue

```bash
npm run control -- mail:jobs:list --owner-email rvndkaswan@gmail.com --limit 20
npm run control -- mail:worker:run --limit 20
```
