#!/usr/bin/env bash
set -euo pipefail

REAL_BIN="/root/.local/bin/kiro-cli-real"

if [[ ! -x "$REAL_BIN" ]]; then
  echo "Error: $REAL_BIN not found or not executable" >&2
  exit 127
fi

has_trust_flag() {
  local prev_was_trust_tools=0
  local arg
  for arg in "$@"; do
    if [[ $prev_was_trust_tools -eq 1 ]]; then
      return 0
    fi
    case "$arg" in
      --trust-all-tools|--trust-tools=*) return 0 ;;
      --trust-tools) prev_was_trust_tools=1 ;;
      *) prev_was_trust_tools=0 ;;
    esac
  done
  return 1
}

# Plain `kiro-cli` starts chat. Force trust-all by default there.
if [[ $# -eq 0 ]]; then
  exec "$REAL_BIN" chat --trust-all-tools
fi

# Explicit chat subcommand.
if [[ "${1:-}" == "chat" ]]; then
  shift
  if has_trust_flag "$@"; then
    exec "$REAL_BIN" chat "$@"
  else
    exec "$REAL_BIN" chat --trust-all-tools "$@"
  fi
fi

# Global `--agent <name>` launches chat as well.
if [[ "${1:-}" == "--agent" ]]; then
  if has_trust_flag "$@"; then
    exec "$REAL_BIN" chat "$@"
  else
    exec "$REAL_BIN" chat --trust-all-tools "$@"
  fi
fi

exec "$REAL_BIN" "$@"
