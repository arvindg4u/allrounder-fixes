#!/usr/bin/env bash

# Codex auth helper functions and shortcuts.
# This is a custom wrapper system (not an official Codex command set).

CODEX_SHARED_HOME="${CODEX_SHARED_HOME:-$HOME/.codex-shared}"
CODEX_AUTH_AUTO_OPEN="${CODEX_AUTH_AUTO_OPEN:-0}"
CODEX_AUTH_BROWSER_CMD="${CODEX_AUTH_BROWSER_CMD:-/bin/true}"

_codex_home() {
  if [[ -d "$CODEX_SHARED_HOME" ]]; then
    printf '%s\n' "$CODEX_SHARED_HOME"
    return 0
  fi
  if [[ -d "$HOME/.codex" ]]; then
    printf '%s\n' "$HOME/.codex"
    return 0
  fi
  mkdir -p "$CODEX_SHARED_HOME"
  printf '%s\n' "$CODEX_SHARED_HOME"
}

_copy_to_clipboard() {
  local text="$1"
  if command -v wl-copy >/dev/null 2>&1; then
    printf '%s' "$text" | wl-copy
    return 0
  fi
  if command -v xclip >/dev/null 2>&1; then
    printf '%s' "$text" | xclip -selection clipboard
    return 0
  fi
  if command -v xsel >/dev/null 2>&1; then
    printf '%s' "$text" | xsel --clipboard --input
    return 0
  fi
  if command -v pbcopy >/dev/null 2>&1; then
    printf '%s' "$text" | pbcopy
    return 0
  fi
  if command -v clip.exe >/dev/null 2>&1; then
    printf '%s' "$text" | clip.exe
    return 0
  fi
  if command -v base64 >/dev/null 2>&1; then
    printf '\033]52;c;%s\a' "$(printf '%s' "$text" | base64 | tr -d '\n')"
    return 0
  fi
  return 1
}

_codex_auth_lock_file() {
  printf '%s\n' "$(_codex_home)/.locks/crelogin.lock"
}

_codex_auth_last_link_file() {
  printf '%s\n' "$(_codex_home)/.last-login-link"
}

_codex_auth_release_lock() {
  local lock_file current_pid
  lock_file="$(_codex_auth_lock_file)"
  if [[ -f "$lock_file" ]]; then
    current_pid="$(cat "$lock_file" 2>/dev/null || true)"
    if [[ "$current_pid" == "$$" ]]; then
      rm -f "$lock_file"
    fi
  fi
}

_codex_auth_acquire_lock() {
  local lock_file existing_pid
  lock_file="$(_codex_auth_lock_file)"
  mkdir -p "$(dirname "$lock_file")"

  if [[ -f "$lock_file" ]]; then
    existing_pid="$(cat "$lock_file" 2>/dev/null || true)"
    if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
      echo "crelogin already running with PID $existing_pid."
      echo "Wait for it to finish, or run ckilllogin to stop it."
      return 1
    fi
    rm -f "$lock_file"
  fi

  printf '%s\n' "$$" > "$lock_file"
  trap '_codex_auth_release_lock' EXIT INT TERM
}

_codex_auth_login_cmd() {
  local codex_home
  codex_home="$(_codex_home)"
  if [[ "$CODEX_AUTH_AUTO_OPEN" == "1" ]]; then
    CODEX_HOME="$codex_home" command codex login
    return
  fi
  BROWSER="$CODEX_AUTH_BROWSER_CMD" CODEX_HOME="$codex_home" command codex login
}

codex_auth_status() { CODEX_HOME="$(_codex_home)" command codex login status; }
codex_auth_login() { CODEX_HOME="$(_codex_home)" command codex login --device-auth; }
codex_auth_login_browser() { CODEX_HOME="$(_codex_home)" command codex login; }
codex_auth_logout() { CODEX_HOME="$(_codex_home)" command codex logout; }

codex_auth_login_link() {
  _codex_auth_acquire_lock || return 1

  local line
  local link=""
  local last_link_file
  last_link_file="$(_codex_auth_last_link_file)"

  if [[ "$CODEX_AUTH_AUTO_OPEN" != "1" ]]; then
    echo "Browser auto-open is disabled (CODEX_AUTH_AUTO_OPEN=0)."
    echo "Link will only be printed/copied; open it manually when ready."
  fi

  while IFS= read -r line; do
    printf '%s\n' "$line"
    if [[ -z "$link" && "$line" == https://auth.openai.com/* ]]; then
      link="$line"
      printf '%s\n' "$link" > "$last_link_file"
      if _copy_to_clipboard "$link"; then
        echo "Login link copied to clipboard and saved: $last_link_file"
      else
        echo "Login link found (copy tool unavailable): $link"
        echo "Saved link to: $last_link_file"
      fi
    fi
  done < <(_codex_auth_login_cmd 2>&1)

  _codex_auth_release_lock
  trap - EXIT INT TERM
}

# Main relogin helpers.
codex_auth_relogin() { codex_auth_logout >/dev/null 2>&1 || true; codex_auth_login_link; }
codex_auth_relogin_device() { codex_auth_logout >/dev/null 2>&1 || true; codex_auth_login; }
codex_auth_kill_login() {
  local lock_file existing_pid
  lock_file="$(_codex_auth_lock_file)"
  if [[ ! -f "$lock_file" ]]; then
    echo "No active crelogin lock found."
    return 0
  fi

  existing_pid="$(cat "$lock_file" 2>/dev/null || true)"
  if [[ -n "$existing_pid" ]] && kill -0 "$existing_pid" 2>/dev/null; then
    kill "$existing_pid" >/dev/null 2>&1 || true
    echo "Stopped crelogin PID $existing_pid."
  else
    echo "Found stale crelogin lock."
  fi
  rm -f "$lock_file"
}

# User-facing shortcuts.
crelogin() { codex_auth_relogin; }
crelogindev() { codex_auth_relogin_device; }
clogin() { codex_auth_login; }
cloginweb() { codex_auth_login_browser; }
clogout() { codex_auth_logout; }
cstatus() { codex_auth_status; }
cloginlink() { codex_auth_login_link; }
ckilllogin() { codex_auth_kill_login; }
