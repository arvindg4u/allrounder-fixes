---
name: credential-vault-map
description: Locate, read, and safely store passwords/API keys/credentials using a consistent local vault model. Use when users ask where credentials are, want to search config files for keys, need to save or read secrets, or want a secure standard location strategy for credentials on this machine.
---

# Credential Vault Map

Use a canonical encrypted vault plus an index of runtime credential locations.

## Best Locations

Use this standard layout:

- Canonical vault: `/root/.secrets/vault.json.gpg`
- Location index: `/root/.secrets/locations.json`
- Runtime consumers:
  - `/root/.kiro/settings/mcp.json`
  - `/root/.openclaw/openclaw.json`
  - `/root/.codex/config.toml`

Read detailed rationale in `references/best-locations.md`.

## Quick Workflow

1. Initialize secure storage once:
`bash scripts/credctl.sh init`
2. Save secret:
`bash scripts/credctl.sh save <name> <value>`
3. Read secret:
`bash scripts/credctl.sh read <name>`
4. List keys:
`bash scripts/credctl.sh list`
5. Search likely credential keys in common configs (redacted output):
`bash scripts/credctl.sh search`

## Operational Rules

- Keep secrets in vault first, then sync into runtime configs only when required.
- Do not commit vault/index or raw secrets into Git repos.
- If user asks to print secret values, do it only when explicitly requested.
- Prefer redacted output for discovery/search tasks.

## Notes

- `scripts/credctl.sh` requires: `gpg`, `jq`, and `rg`.
- For non-interactive automation, set `CRED_GPG_PASSPHRASE`.
