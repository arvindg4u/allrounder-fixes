# Playwright MCP Edge Bridge Fix

## Problem

Playwright MCP Bridge keeps showing manual approval in Edge:

- `Allow / Reject` prompt appears repeatedly
- Connect URL does not include `token=...`
- Sometimes errors like `Extension connection timeout`

Typical URL symptom:

- `chrome-extension://mmlmfjhmonkocbjadbfplnigmagldckm/connect.html?...&newTab=true`
- Missing `&token=<PLAYWRIGHT_MCP_EXTENSION_TOKEN>`

## Root Cause

In extension mode, token bypass works only when the MCP process actually receives `PLAYWRIGHT_MCP_EXTENSION_TOKEN` and appends it into connect URL.

In some Codex/WSL setups, env passthrough can be inconsistent, so the token is not injected.

## Working Fix

1. Use Edge channel explicitly.
2. Run Playwright MCP from Windows side (`cmd.exe`) in WSL setups.
3. Set token inline in launch command so it is always present.

## Config Snippet

Use the snippet in `config.toml.snippet`.

Important values:

- `--extension`
- `--browser msedge`
- `--host 127.0.0.1`
- Inline `set PLAYWRIGHT_MCP_EXTENSION_TOKEN=...`

## Verify

1. Restart client.
2. Trigger any Playwright action.
3. Opened connect URL should include `&token=...`.
4. Manual Allow prompt should be bypassed (except first-run/profile mismatch cases).

## Notes

- Token is profile-specific. Copy from Edge extension status page.
- If prompt returns, refresh token in extension UI and update config.
- Keep Edge open in the same profile where token was generated.
