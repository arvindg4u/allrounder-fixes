# Best Locations For Passwords, API Keys, and Credentials

Use a 3-layer model for speed + safety.

## Layer 1: Canonical Vault (primary source)

- Path: `/root/.secrets/vault.json.gpg`
- Why: single source of truth, encrypted at rest, fast lookup by key name
- Use for: passwords, API keys, tokens, private endpoints, service credentials

## Layer 2: Location Index (metadata only)

- Path: `/root/.secrets/locations.json`
- Why: track where runtime credentials are consumed without storing plaintext secrets
- Store: service name, config path, variable/key name, owner, rotation note

## Layer 3: Runtime Config Files (consumers)

Common runtime locations on this system:

- Kiro MCP config: `/root/.kiro/settings/mcp.json`
- OpenClaw config: `/root/.openclaw/openclaw.json`
- Codex config: `/root/.codex/config.toml`
- App-specific env files: `<project>/.env`

Keep these as consumer files, not the canonical secret source.

## Rules

- Never store secrets inside Git repositories.
- Keep vault files permission-restricted (`chmod 700 /root/.secrets`, `chmod 600` files).
- Prefer named keys in vault, then inject values into runtime configs only when needed.
- Rotate by updating vault first, then syncing runtime configs.
