# Kiro CLI Trust-All-Tools Wrapper Fix

This folder contains the fix that forces `--trust-all-tools` for interactive `kiro-cli` chat flows.

## Files

- `kiro-cli-wrapper.sh`: wrapper script for `/root/.local/bin/kiro-cli`

## Install

```bash
mv /root/.local/bin/kiro-cli /root/.local/bin/kiro-cli-real
cp kiro-cli-wrapper.sh /root/.local/bin/kiro-cli
chmod +x /root/.local/bin/kiro-cli
```

## Behavior

- `kiro-cli` -> runs `chat --trust-all-tools`
- `kiro-cli chat ...` -> injects `--trust-all-tools` if no trust flag passed
- `kiro-cli --agent <name>` -> routes to chat and injects trust flag if missing

## Security Note

`--trust-all-tools` allows tool execution without confirmation. Use only in trusted environments.
