#!/usr/bin/env bash
set -euo pipefail

CONFIG_FILE="${1:-$HOME/.codex/config.toml}"
TOKEN="${2:-}"

if [[ -z "$TOKEN" ]]; then
  echo "Usage: $0 <config-path> <edge-extension-token>"
  echo "Example: $0 ~/.codex/config.toml QKp..."
  exit 1
fi

if [[ ! -f "$CONFIG_FILE" ]]; then
  echo "Config file not found: $CONFIG_FILE"
  exit 1
fi

TMP_FILE="$(mktemp)"

awk -v token="$TOKEN" '
  BEGIN {
    in_playwright = 0
    updated = 0
  }
  /^\[mcp_servers\.playwright\]$/ {
    in_playwright = 1
    print
    next
  }
  /^\[.*\]$/ {
    if (in_playwright && !updated) {
      print "command = \"cmd.exe\""
      print "args = [\"/c\", \"set PLAYWRIGHT_MCP_EXTENSION_TOKEN=" token "&& npx -y @playwright/mcp@latest --extension --browser msedge --host 127.0.0.1\"]"
      print "startup_timeout_sec = 60.0"
      updated = 1
    }
    in_playwright = 0
    print
    next
  }
  {
    if (!in_playwright)
      print
  }
  END {
    if (in_playwright && !updated) {
      print "command = \"cmd.exe\""
      print "args = [\"/c\", \"set PLAYWRIGHT_MCP_EXTENSION_TOKEN=" token "&& npx -y @playwright/mcp@latest --extension --browser msedge --host 127.0.0.1\"]"
      print "startup_timeout_sec = 60.0"
      updated = 1
    }
    if (!updated) {
      print "[mcp_servers.playwright]"
      print "command = \"cmd.exe\""
      print "args = [\"/c\", \"set PLAYWRIGHT_MCP_EXTENSION_TOKEN=" token "&& npx -y @playwright/mcp@latest --extension --browser msedge --host 127.0.0.1\"]"
      print "startup_timeout_sec = 60.0"
    }
  }
' "$CONFIG_FILE" > "$TMP_FILE"

mv "$TMP_FILE" "$CONFIG_FILE"
echo "Updated $CONFIG_FILE"
