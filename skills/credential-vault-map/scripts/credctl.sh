#!/usr/bin/env bash
set -euo pipefail

BASE_DIR="${CRED_VAULT_DIR:-$HOME/.secrets}"
VAULT_GPG="${CRED_VAULT_FILE:-$BASE_DIR/vault.json.gpg}"
INDEX_FILE="${CRED_INDEX_FILE:-$BASE_DIR/locations.json}"
PASSPHRASE="${CRED_GPG_PASSPHRASE:-}"

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

ensure_base() {
  mkdir -p "$BASE_DIR"
  chmod 700 "$BASE_DIR" || true
}

gpg_encrypt() {
  local in_file="$1"
  local out_file="$2"
  if [[ -n "$PASSPHRASE" ]]; then
    gpg --batch --yes --pinentry-mode loopback --passphrase "$PASSPHRASE" \
      --symmetric --cipher-algo AES256 --output "$out_file" "$in_file"
  else
    gpg --batch --yes --symmetric --cipher-algo AES256 --output "$out_file" "$in_file"
  fi
}

gpg_decrypt_to() {
  local in_file="$1"
  local out_file="$2"
  if [[ -n "$PASSPHRASE" ]]; then
    gpg --batch --yes --pinentry-mode loopback --passphrase "$PASSPHRASE" \
      --decrypt --output "$out_file" "$in_file"
  else
    gpg --batch --yes --decrypt --output "$out_file" "$in_file"
  fi
}

init_vault() {
  ensure_base
  local tmp
  tmp="$(mktemp)"
  printf '{}\n' > "$tmp"
  gpg_encrypt "$tmp" "$VAULT_GPG"
  rm -f "$tmp"
  chmod 600 "$VAULT_GPG" || true

  cat > "$INDEX_FILE" <<'JSON'
{
  "locations": [
    {
      "service": "kiro",
      "path": "/root/.kiro/settings/mcp.json",
      "note": "Kiro MCP runtime config"
    },
    {
      "service": "openclaw",
      "path": "/root/.openclaw/openclaw.json",
      "note": "OpenClaw runtime config"
    },
    {
      "service": "codex",
      "path": "/root/.codex/config.toml",
      "note": "Codex MCP/runtime config"
    }
  ]
}
JSON
  chmod 600 "$INDEX_FILE" || true
  echo "Initialized vault: $VAULT_GPG"
  echo "Initialized index: $INDEX_FILE"
}

with_vault_json() {
  local callback="$1"
  shift
  local work
  work="$(mktemp)"

  if [[ ! -f "$VAULT_GPG" ]]; then
    echo "Vault not found. Run: credctl.sh init" >&2
    rm -f "$work"
    exit 1
  fi

  gpg_decrypt_to "$VAULT_GPG" "$work"
  "$callback" "$work" "$@"
  gpg_encrypt "$work" "$VAULT_GPG"
  chmod 600 "$VAULT_GPG" || true
  rm -f "$work"
}

cmd_list() {
  local work
  work="$(mktemp)"
  gpg_decrypt_to "$VAULT_GPG" "$work"
  jq -r 'keys[]?' "$work"
  rm -f "$work"
}

save_cb() {
  local work="$1"
  local name="$2"
  local value="$3"
  jq --arg name "$name" --arg value "$value" --arg ts "$(date -Is)" \
    '.[$name] = {value:$value, updated_at:$ts}' "$work" > "$work.tmp"
  mv "$work.tmp" "$work"
}

cmd_save() {
  local name="${1:-}"
  local value="${2:-}"
  if [[ -z "$name" || -z "$value" ]]; then
    echo "Usage: credctl.sh save <name> <value>" >&2
    exit 1
  fi
  with_vault_json save_cb "$name" "$value"
  echo "Saved secret: $name"
}

read_cb() {
  local work="$1"
  local name="$2"
  jq -r --arg name "$name" '.[$name].value // empty' "$work"
}

cmd_read() {
  local name="${1:-}"
  if [[ -z "$name" ]]; then
    echo "Usage: credctl.sh read <name>" >&2
    exit 1
  fi
  local work
  work="$(mktemp)"
  gpg_decrypt_to "$VAULT_GPG" "$work"
  read_cb "$work" "$name"
  rm -f "$work"
}

cmd_delete() {
  local name="${1:-}"
  if [[ -z "$name" ]]; then
    echo "Usage: credctl.sh delete <name>" >&2
    exit 1
  fi
  with_vault_json delete_cb "$name"
  echo "Deleted secret: $name"
}

delete_cb() {
  local work="$1"
  local name="$2"
  jq --arg name "$name" 'del(.[$name])' "$work" > "$work.tmp"
  mv "$work.tmp" "$work"
}

cmd_search() {
  local pattern='api[_-]?key|token|secret|password|authorization|x-goog-api-key'
  local files=(
    "$HOME/.kiro/settings/mcp.json"
    "$HOME/.openclaw/openclaw.json"
    "$HOME/.codex/config.toml"
    "$HOME/.env"
    "$PWD/.env"
  )

  for f in "${files[@]}"; do
    [[ -f "$f" ]] || continue
    echo "# $f"
    rg -n --ignore-case "$pattern" "$f" \
      | sed -E 's/(:|=).*/\1 [REDACTED]/' || true
  done
}

usage() {
  cat <<USAGE
Usage: credctl.sh <command> [args]

Commands:
  init                       Initialize encrypted vault + location index
  list                       List secret names from vault
  save <name> <value>        Save or update a secret
  read <name>                Read secret value
  delete <name>              Delete secret
  search                     Search common config files for credential-like keys (redacted)

Environment:
  CRED_VAULT_DIR             Base dir (default: ~/.secrets)
  CRED_VAULT_FILE            Vault file path (default: ~/.secrets/vault.json.gpg)
  CRED_INDEX_FILE            Index file path (default: ~/.secrets/locations.json)
  CRED_GPG_PASSPHRASE        Optional non-interactive passphrase for gpg
USAGE
}

main() {
  require_cmd gpg
  require_cmd jq
  require_cmd rg

  local cmd="${1:-}"
  shift || true

  case "$cmd" in
    init) init_vault ;;
    list) cmd_list ;;
    save) cmd_save "$@" ;;
    read) cmd_read "$@" ;;
    delete) cmd_delete "$@" ;;
    search) cmd_search ;;
    ""|-h|--help|help) usage ;;
    *)
      echo "Unknown command: $cmd" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
