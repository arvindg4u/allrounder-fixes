---
name: credential-vault-map
description: Use a Bitwarden-first model to locate, search, save, and read passwords/API keys/credentials with a no-code workflow. Trigger when users ask where credentials should live, want direct credential search, want to save passwords safely in cloud, or need optional local fallback handling for runtime configs.
---

# Credential Vault Map

Use Bitwarden Cloud as primary credential storage, with local files only as runtime consumers or metadata pointers.

## Agent Autopilot Flow

When this skill is triggered, execute this sequence by default:

1. `bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh ready`
2. If output says `reason=login_required`, run `bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh login` and continue.
3. For fully automatic auth/session, provide env inputs once via `~/.config/credential-vault-map/bw.env` (see below), then run:
`bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh session`
4. For search tasks, prefer one-step auto command:
`bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh search-auto <query>`
5. For save/create tasks, prefer one-step auto command:
`bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh create-login-auto <name> <user> <pass> [uri]`
6. If automation fails due to missing session/password, ask user once for unlock action and retry.

Important runtime note:
- `BW_SESSION` is shell-scoped and not persistent across new terminal sessions.

## Platform Choice

Primary platform: Bitwarden Cloud (no-code friendly)

Why:

- Direct search in vault UI
- Easy password/API key save via web/mobile/desktop app
- Central cloud sync
- Optional CLI automation when needed

## What Is Needed To Connect Bitwarden

Minimum requirements:

- Bitwarden account
- Bitwarden app login (web/app) for no-code flow

For CLI automation with this skill:

- Bitwarden CLI (`bw`) installed
- Authenticated login (`bw login` or `bw login --apikey`)
- Unlocked session (`export BW_SESSION="$(bw unlock --raw)"`)
- Optional auto mode env inputs:
  - `BW_EMAIL` + `BW_PASSWORD` (for login+unlock)
  - OR `BW_CLIENTID` + `BW_CLIENTSECRET` + `BW_MASTER_PASSWORD`
  - OR `BW_PASSWORD_FILE` (first line master password)

Use `bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh doctor` for quick readiness check.
Read setup details in `references/bitwarden-setup.md`.

## Best Locations

Use this layout:

- Canonical secret store: Bitwarden vault (items, secure notes, logins)
- Local pointer map (no plaintext secrets): `/root/.secrets/bitwarden-map.json`
- Runtime consumer files:
  - `/root/.kiro/settings/mcp.json`
  - `/root/.openclaw/openclaw.json`
  - `/root/.codex/config.toml`

Read details in `references/best-locations.md`.

## No-Code Workflow (Default)

1. Open Bitwarden vault app or web vault.
2. Save new secret as item with clear name (example: `api/github/token-prod`).
3. Add notes/labels for owner, environment, rotation date.
4. Use Bitwarden search to find item quickly by name/tag.
5. Copy secret into runtime config only when required.

## CLI Workflow (Optional)

- Check readiness: `bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh doctor`
- Automation readiness: `bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh ready`
- Resolve session key automatically: `bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh session`
- Login: `bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh login`
- Unlock session: `export BW_SESSION="$(bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh unlock)"`
- Sync: `bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh sync`
- Search: `bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh search <query>`
- Auto search (preferred for agents): `bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh search-auto <query>`
- Create login item: `bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh create-login <name> <user> <pass> [uri]`
- Auto create (preferred for agents): `bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh create-login-auto <name> <user> <pass> [uri]`

Use `scripts/credctl.sh` only as local encrypted fallback, not primary cloud store.

## Secure Auto Credentials File

Use a local file (not git) for automation inputs:

```bash
mkdir -p ~/.config/credential-vault-map
chmod 700 ~/.config/credential-vault-map
cat > ~/.config/credential-vault-map/bw.env <<'EOF'
BW_EMAIL="you@example.com"
BW_PASSWORD="your_master_password"
EOF
chmod 600 ~/.config/credential-vault-map/bw.env
```

Then run:

```bash
bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh session
```

## Operational Rules

- Keep real secrets in Bitwarden, not in Git repositories.
- Keep local pointer files metadata-only (item ids, paths, tags), never plaintext passwords/tokens.
- Prefer redacted output while scanning configs.
- Print full secret values only when user explicitly asks.

## Notes

- Bitwarden-first keeps search and save fast with no-code UX.
- Local runtime files remain consumer endpoints, not source-of-truth.
