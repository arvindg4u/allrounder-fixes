#!/usr/bin/env bash
set -euo pipefail

CONTROL_CLI="${CONTROL_CLI:-/home/rvndk/.codex/skills/control-cli/scripts/control-cli.mjs}"
BASE_URL="${BASE_URL:-https://app.arvindlab.dedyn.io}"
OWNER_EMAIL="${OWNER_EMAIL:-rvndkaswan@gmail.com}"
CONFIRM="${1:-}"

if [[ "$CONFIRM" != "--yes" ]]; then
  echo "Usage: $0 --yes" >&2
  exit 2
fi

LIST_JSON="$(node "$CONTROL_CLI" aliases:list --owner-email "$OWNER_EMAIL" --base-url "$BASE_URL")"
IDS="$(printf '%s' "$LIST_JSON" | node -e '
const fs=require("fs");
const raw=fs.readFileSync(0,"utf8");
let j={};
try{j=JSON.parse(raw)}catch{process.exit(1)}
const ids=(j?.payload?.aliases||[]).map(a=>a.id).filter(Boolean);
process.stdout.write(ids.join("\n"));
')"

if [[ -z "$IDS" ]]; then
  echo "deleted_count=0"
  exit 0
fi

COUNT=0
while IFS= read -r id; do
  [[ -z "$id" ]] && continue
  node "$CONTROL_CLI" aliases:delete --owner-email "$OWNER_EMAIL" --alias-id "$id" --yes --base-url "$BASE_URL" >/dev/null
  COUNT=$((COUNT+1))
done <<< "$IDS"

echo "deleted_count=${COUNT}"
