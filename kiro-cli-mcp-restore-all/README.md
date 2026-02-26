# Kiro CLI MCP Restore (All Enabled)

This folder stores the full Kiro CLI MCP restore config with all MCP servers enabled.

## Files

- `mcp.json` -> place at `/root/.kiro/settings/mcp.json`
- `cli.json` -> place at `/root/.kiro/settings/cli.json`

## Restore Commands

```bash
mkdir -p /root/.kiro/settings
cp kiro-cli-mcp-restore-all/mcp.json /root/.kiro/settings/mcp.json
cp kiro-cli-mcp-restore-all/cli.json /root/.kiro/settings/cli.json
kiro-cli mcp list
```

Created on: 2026-02-26
