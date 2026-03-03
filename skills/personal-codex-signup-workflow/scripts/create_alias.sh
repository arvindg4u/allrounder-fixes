#!/usr/bin/env bash
set -euo pipefail

CONTROL_CLI="${CONTROL_CLI:-/home/rvndk/.codex/skills/control-cli/scripts/control-cli.mjs}"
BASE_URL="${BASE_URL:-https://app.arvindlab.dedyn.io}"
OWNER_EMAIL="${OWNER_EMAIL:-rvndkaswan@gmail.com}"
DEST_EMAIL="${DEST_EMAIL:-rvndkaswan@gmail.com}"
ALIAS_DOMAIN="${ALIAS_DOMAIN:-arvindlab.dedyn.io}"
ALIAS_PREFIX="${ALIAS_PREFIX:-app}"
LABEL="${LABEL:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-url) BASE_URL="$2"; shift 2 ;;
    --owner-email) OWNER_EMAIL="$2"; shift 2 ;;
    --destination-email) DEST_EMAIL="$2"; shift 2 ;;
    --alias-domain) ALIAS_DOMAIN="$2"; shift 2 ;;
    --alias-prefix) ALIAS_PREFIX="$2"; shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

CMD=(node "$CONTROL_CLI" aliases:create-random
  --owner-email "$OWNER_EMAIL"
  --destination-email "$DEST_EMAIL"
  --alias-domain "$ALIAS_DOMAIN"
  --alias-prefix "$ALIAS_PREFIX"
  --base-url "$BASE_URL")

if [[ -n "$LABEL" ]]; then
  CMD+=(--label "$LABEL")
fi

OUT="$(${CMD[@]})"

printf '%s' "$OUT" | node -e '
const fs=require("fs");
const raw=fs.readFileSync(0,"utf8");
let j;
try{j=JSON.parse(raw)}catch(e){console.error(raw);process.exit(1)}
if(!j.ok){console.error(raw);process.exit(1)}
const a=j?.payload?.alias;
if(!a?.aliasEmail||!a?.id){console.error(raw);process.exit(1)}
process.stdout.write(`alias_id=${a.id}\nalias_email=${a.aliasEmail}\nstatus=${a.status}\ncreated_at=${a.createdAt}\n`);
'
