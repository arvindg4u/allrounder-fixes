#!/usr/bin/env bash
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$SKILL_DIR/.venv"

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required. Install uv first, then re-run." >&2
  exit 1
fi

uv venv "$VENV_DIR"
source "$VENV_DIR/bin/activate"
uv pip install -r "$SKILL_DIR/scripts/requirements.txt"

echo "Environment ready at $VENV_DIR"
