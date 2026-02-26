# Bitwarden Connection Setup (Skill Integration)

This file defines what is required to connect Bitwarden with the `credential-vault-map` skill.

## What is required

1. Bitwarden account (cloud or self-hosted).
2. Bitwarden app login (web/mobile/desktop) for no-code usage.
3. Optional for terminal automation: Bitwarden CLI (`bw`) installed.
4. For CLI data access: authenticated + unlocked session (`BW_SESSION`).

## Standard CLI connection flow

1. Check CLI:
- `bw --version`

2. Login (interactive):
- `bw login`

Alternative for automation:
- `bw login --apikey`
- Requires env vars: `BW_CLIENTID`, `BW_CLIENTSECRET`

3. Unlock vault and export session:
- `export BW_SESSION="$(bw unlock --raw)"`

4. Verify status:
- `bw status`
- expected status: `"unlocked"`

5. Sync before search:
- `bw sync`

6. Search items:
- `bw list items --search "<query>" --session "$BW_SESSION"`

## Agent-Friendly Commands (from this skill)

- Readiness check: `bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh ready`
- Search with auto session handling: `bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh search-auto <query>`
- Create login with auto session handling:
`bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh create-login-auto <name> <user> <pass> [uri]`

## Notes

- Session key does not persist across new terminal sessions.
- Use `bw lock` or `bw logout` when done.
- Keep plaintext secrets out of Git repositories.
