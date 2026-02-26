#!/usr/bin/env bash
set -euo pipefail

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing required command: $1" >&2
    exit 1
  }
}

usage() {
  cat <<'USAGE'
Usage: bw-connect.sh <command> [args]

Commands:
  doctor                         Check CLI install + auth status
  ready                          Check if login/unlock/session are usable for automation
  session                        Print resolved session key (auto login+unlock)
  login [args...]                Run bw login (pass-through args)
  unlock                         Print export command for BW_SESSION
  status                         Show bw status
  sync                           Run bw sync
  search <query>                 Search vault items (requires BW_SESSION)
  search-auto <query>            Search with auto session handling
  create-login <name> <user> <pass> [uri]
                                 Create login item (requires BW_SESSION)
  create-login-auto <name> <user> <pass> [uri]
                                 Create login with auto session handling
  lock                           Run bw lock
  logout                         Run bw logout

Examples:
  bw-connect.sh doctor
  bw-connect.sh ready
  bw-connect.sh session
  bw-connect.sh login
  export BW_SESSION="$(bash /root/.codex/skills/credential-vault-map/scripts/bw-connect.sh unlock)"
  bw-connect.sh search github
  bw-connect.sh search-auto github
USAGE
}

require_bw() {
  if ! command -v bw >/dev/null 2>&1; then
    echo "Bitwarden CLI not found. Install from: https://bitwarden.com/help/cli/" >&2
    exit 1
  fi
}

require_session() {
  if [[ -z "${BW_SESSION:-}" ]]; then
    echo 'BW_SESSION is missing. Run: export BW_SESSION="$(bw unlock --raw)"' >&2
    exit 1
  fi
}

get_status_value() {
  require_bw
  need_cmd jq
  bw status | jq -r '.status'
}

load_local_env() {
  local env_file="${BW_CONNECT_ENV_FILE:-$HOME/.config/credential-vault-map/bw.env}"
  if [[ -f "$env_file" ]]; then
    # shellcheck disable=SC1090
    set -a
    source "$env_file"
    set +a
  fi
}

auto_login_if_needed() {
  local status
  status="$(get_status_value)"
  if [[ "$status" != "unauthenticated" ]]; then
    return 0
  fi

  if [[ -n "${BW_CLIENTID:-}" && -n "${BW_CLIENTSECRET:-}" ]]; then
    bw login --apikey >/dev/null
    return 0
  fi

  if [[ -n "${BW_EMAIL:-}" && -n "${BW_PASSWORD:-}" ]]; then
    bw login "$BW_EMAIL" --passwordenv BW_PASSWORD >/dev/null
    return 0
  fi

  if [[ -n "${BW_EMAIL:-}" && -n "${BW_PASSWORD_FILE:-}" ]]; then
    bw login "$BW_EMAIL" --passwordfile "$BW_PASSWORD_FILE" >/dev/null
    return 0
  fi

  return 3
}

resolve_session() {
  # Prefer explicit session from environment.
  if [[ -n "${BW_SESSION:-}" ]]; then
    printf '%s\n' "$BW_SESSION"
    return 0
  fi

  if ! auto_login_if_needed; then
    echo "login_required=yes" >&2
    echo "Set BW_EMAIL+BW_PASSWORD (or BW_CLIENTID+BW_CLIENTSECRET) for auto login." >&2
    return 3
  fi

  if [[ -n "${BW_MASTER_PASSWORD:-}" ]]; then
    bw unlock --raw --passwordenv BW_MASTER_PASSWORD
    return 0
  fi

  if [[ -n "${BW_PASSWORD:-}" ]]; then
    bw unlock --raw --passwordenv BW_PASSWORD
    return 0
  fi

  if [[ -n "${BW_PASSWORD_FILE:-}" ]]; then
    bw unlock --raw --passwordfile "$BW_PASSWORD_FILE"
    return 0
  fi

  local status
  status="$(get_status_value)"
  if [[ "$status" == "unlocked" ]]; then
    echo "session_required=yes" >&2
    echo "Vault unlocked but no BW_SESSION in this shell. Export session from: bw unlock --raw" >&2
    return 4
  fi

  if [[ "$status" == "locked" ]]; then
    echo "session_required=yes" >&2
    echo "Set BW_MASTER_PASSWORD or BW_PASSWORD (or BW_PASSWORD_FILE) for auto unlock." >&2
    return 4
  fi

  echo "session_required=yes" >&2
  echo "Set BW_SESSION or unlock credentials for automation." >&2
  return 4
}

cmd_doctor() {
  if ! command -v bw >/dev/null 2>&1; then
    echo "bw_installed=no"
    echo "install_url=https://bitwarden.com/help/cli/"
    return 0
  fi

  echo "bw_installed=yes"
  bw --version || true
  bw status || true
}

cmd_ready() {
  if ! command -v bw >/dev/null 2>&1; then
    echo "bw_installed=no"
    return 2
  fi

  need_cmd jq
  echo "bw_installed=yes"
  bw --version || true

  local status
  status="$(bw status | jq -r '.status')"
  echo "status=$status"

  if [[ -n "${BW_SESSION:-}" ]]; then
    echo "session_env=present"
  else
    echo "session_env=missing"
  fi

  if [[ -n "${BW_EMAIL:-}" ]] || { [[ -n "${BW_CLIENTID:-}" ]] && [[ -n "${BW_CLIENTSECRET:-}" ]]; }; then
    echo "auto_login_inputs=present"
  else
    echo "auto_login_inputs=missing"
  fi

  if [[ -n "${BW_MASTER_PASSWORD:-}" || -n "${BW_PASSWORD:-}" || -n "${BW_PASSWORD_FILE:-}" ]]; then
    echo "auto_unlock_inputs=present"
  else
    echo "auto_unlock_inputs=missing"
  fi

  if [[ "$status" == "unauthenticated" ]]; then
    echo "ready=no reason=login_required"
    return 3
  fi
  if [[ "$status" == "locked" && -z "${BW_SESSION:-}" ]]; then
    echo "ready=no reason=unlock_required"
    return 4
  fi

  echo "ready=yes"
}

cmd_login() {
  require_bw
  bw login "$@"
}

cmd_unlock() {
  require_bw
  bw unlock --raw "$@"
}

cmd_session() {
  require_bw
  resolve_session
}

cmd_status() {
  require_bw
  bw status
}

cmd_sync() {
  require_bw
  bw sync
}

cmd_search() {
  require_bw
  require_session
  local query="${1:-}"
  if [[ -z "$query" ]]; then
    echo "Usage: bw-connect.sh search <query>" >&2
    exit 1
  fi
  need_cmd jq
  bw list items --search "$query" --session "$BW_SESSION" \
    | jq -r '.[] | [.id, .name, (.login.username // ""), (.organizationId // "")] | @tsv'
}

cmd_search_auto() {
  require_bw
  need_cmd jq
  local query="${1:-}"
  if [[ -z "$query" ]]; then
    echo "Usage: bw-connect.sh search-auto <query>" >&2
    exit 1
  fi

  local session
  session="$(resolve_session)"
  bw sync --session "$session" >/dev/null
  bw list items --search "$query" --session "$session" \
    | jq -r '.[] | [.id, .name, (.login.username // ""), (.organizationId // "")] | @tsv'
}

cmd_create_login() {
  require_bw
  require_session
  need_cmd jq

  local name="${1:-}"
  local username="${2:-}"
  local password="${3:-}"
  local uri="${4:-}"

  if [[ -z "$name" || -z "$username" || -z "$password" ]]; then
    echo "Usage: bw-connect.sh create-login <name> <user> <pass> [uri]" >&2
    exit 1
  fi

  local template_json
  template_json="$(bw get template item --session "$BW_SESSION")"

  local item_json
  item_json="$(printf '%s' "$template_json" | jq \
    --arg name "$name" \
    --arg username "$username" \
    --arg password "$password" \
    --arg uri "$uri" \
    '
      .type = 1
      | .name = $name
      | .login.username = $username
      | .login.password = $password
      | .login.uris = (if $uri == "" then [] else [{uri: $uri}] end)
    '
  )"

  local encoded
  encoded="$(printf '%s' "$item_json" | bw encode)"
  bw create item "$encoded" --session "$BW_SESSION" >/dev/null
  echo "created_login_item=$name"
}

cmd_create_login_auto() {
  require_bw
  need_cmd jq

  local name="${1:-}"
  local username="${2:-}"
  local password="${3:-}"
  local uri="${4:-}"

  if [[ -z "$name" || -z "$username" || -z "$password" ]]; then
    echo "Usage: bw-connect.sh create-login-auto <name> <user> <pass> [uri]" >&2
    exit 1
  fi

  local session
  session="$(resolve_session)"

  local template_json
  template_json="$(bw get template item --session "$session")"

  local item_json
  item_json="$(printf '%s' "$template_json" | jq \
    --arg name "$name" \
    --arg username "$username" \
    --arg password "$password" \
    --arg uri "$uri" \
    '
      .type = 1
      | .name = $name
      | .login.username = $username
      | .login.password = $password
      | .login.uris = (if $uri == "" then [] else [{uri: $uri}] end)
    '
  )"

  local encoded
  encoded="$(printf '%s' "$item_json" | bw encode)"
  bw create item "$encoded" --session "$session" >/dev/null
  echo "created_login_item=$name"
}

main() {
  load_local_env
  local cmd="${1:-}"
  shift || true

  case "$cmd" in
    doctor) cmd_doctor ;;
    ready) cmd_ready ;;
    session) cmd_session ;;
    login) cmd_login "$@" ;;
    unlock) cmd_unlock "$@" ;;
    status) cmd_status ;;
    sync) cmd_sync ;;
    search) cmd_search "$@" ;;
    search-auto) cmd_search_auto "$@" ;;
    create-login) cmd_create_login "$@" ;;
    create-login-auto) cmd_create_login_auto "$@" ;;
    lock) require_bw; bw lock ;;
    logout) require_bw; bw logout ;;
    ""|-h|--help|help) usage ;;
    *)
      echo "Unknown command: $cmd" >&2
      usage
      exit 1
      ;;
  esac
}

main "$@"
