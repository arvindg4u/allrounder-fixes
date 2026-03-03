#!/usr/bin/env bash
set -euo pipefail

PIDS="$(ps -ef | awk '/bash \/home\/rvndk\/.local\/bin\/crelogin|codex login/ {print $2}')"
if [[ -n "${PIDS}" ]]; then
  kill ${PIDS} 2>/dev/null || true
  sleep 1
fi

if command -v lsof >/dev/null 2>&1; then
  PORT_PIDS="$(lsof -t -i :1455 -sTCP:LISTEN 2>/dev/null | xargs -r echo || true)"
  if [[ -n "${PORT_PIDS}" ]]; then
    kill ${PORT_PIDS} 2>/dev/null || true
  fi
fi

echo "stale_login_processes_cleared=true"
