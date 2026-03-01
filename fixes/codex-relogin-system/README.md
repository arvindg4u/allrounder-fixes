# Codex Direct Re-Login System (`crelogin`)

This repository folder documents a custom Codex auth helper system used in Termux/Android and portable to Windows Linux terminal (WSL).

Important:
- `crelogin` is a custom shell function.
- It is not an official Codex CLI command.

## What this system does

The system wraps official Codex auth commands to create faster login workflows.

Main behavior:
1. `crelogin` runs logout first to clear stale credentials.
2. It immediately starts login again.
3. It detects the `https://auth.openai.com/...` URL from output.
4. It copies the login link to clipboard when possible.

This gives a direct re-login experience.

## Commands included

- `cstatus` -> `codex login status`
- `clogin` -> `codex login --device-auth`
- `cloginweb` -> `codex login`
- `clogout` -> `codex logout`
- `cloginlink` -> starts web login and copies auth URL
- `crelogin` -> force logout, then web login link flow
- `crelogindev` -> force logout, then device-auth flow

## Files

- `codex-auth-helpers.sh` - reusable shell helper script

## Install on Termux (Android)

1. Ensure Codex CLI is installed and `codex` works.
2. Copy `codex-auth-helpers.sh` to a stable path, for example:
   - `~/.config/codex/codex-auth-helpers.sh`
3. Add this to `~/.bashrc` (or your shell rc file):

```bash
source "$HOME/.config/codex/codex-auth-helpers.sh"
```

4. Reload shell:

```bash
source ~/.bashrc
```

5. Test:

```bash
cstatus
crelogin
```

## Install on Windows Linux Terminal (WSL)

1. Install Codex CLI inside WSL and verify:

```bash
codex --version
```

2. Save `codex-auth-helpers.sh` in WSL home, for example:
   - `~/.config/codex/codex-auth-helpers.sh`

3. Add to `~/.bashrc`:

```bash
source "$HOME/.config/codex/codex-auth-helpers.sh"
```

4. Reload:

```bash
source ~/.bashrc
```

5. Verify helpers:

```bash
type crelogin
cstatus
```

Clipboard note for WSL:
- Script supports `clip.exe` if available.
- If clipboard tools are unavailable, the login URL is printed so you can copy manually.

## Shared auth location

By default, helpers store auth/session at:

```bash
$HOME/.codex-shared
```

To change location, set before loading script:

```bash
export CODEX_SHARED_HOME="$HOME/.codex-shared"
source "$HOME/.config/codex/codex-auth-helpers.sh"
```

## Security notes

- This script only wraps Codex login/logout commands.
- Do not commit personal tokens or `auth.json` files.
- Keep this as workflow docs and helper logic only.

## Troubleshooting

- `crelogin: command not found`
  - Ensure script is sourced from your shell rc.
- No clipboard copy
  - Install clipboard tool (`xclip`, `xsel`, `wl-copy`) or use printed URL.
- Wrong auth state
  - Run `clogout`, then `crelogin`, then `cstatus`.
