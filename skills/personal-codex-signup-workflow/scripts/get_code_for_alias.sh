#!/usr/bin/env bash
set -euo pipefail

CONTROL_CLI="${CONTROL_CLI:-/home/rvndk/.codex/skills/control-cli/scripts/control-cli.mjs}"
BASE_URL="${BASE_URL:-https://app.arvindlab.dedyn.io}"
OWNER_EMAIL="${OWNER_EMAIL:-rvndkaswan@gmail.com}"
ALIAS_EMAIL=""
MAX_TRIES="${MAX_TRIES:-20}"
SLEEP_SECS="${SLEEP_SECS:-2}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --alias-email) ALIAS_EMAIL="$2"; shift 2 ;;
    --owner-email) OWNER_EMAIL="$2"; shift 2 ;;
    --base-url) BASE_URL="$2"; shift 2 ;;
    --max-tries) MAX_TRIES="$2"; shift 2 ;;
    --sleep-secs) SLEEP_SECS="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

if [[ -z "$ALIAS_EMAIL" ]]; then
  echo "--alias-email is required" >&2
  exit 2
fi

for ((i=1; i<=MAX_TRIES; i++)); do
  OUT="$(node "$CONTROL_CLI" mail:jobs:list --owner-email "$OWNER_EMAIL" --limit 50 --base-url "$BASE_URL")"
  CODE="$(printf '%s' "$OUT" | node -e '
const fs=require("fs");
const alias=process.argv[1];
const raw=fs.readFileSync(0,"utf8");
let j={};
try{j=JSON.parse(raw)}catch{process.exit(0)}
const jobs=j?.payload?.jobs||[];
for(const job of jobs){
  if(job?.toAliasEmail!==alias) continue;
  const s=String(job?.subject||"");
  const m=s.match(/(\d{6})/);
  if(m){process.stdout.write(m[1]); process.exit(0);}
}
' "$ALIAS_EMAIL")"

  if [[ -n "$CODE" ]]; then
    echo "$CODE"
    exit 0
  fi

  sleep "$SLEEP_SECS"
done

echo "OTP not found for alias: $ALIAS_EMAIL after ${MAX_TRIES} tries" >&2
exit 1
