#!/usr/bin/env bash

# Codex auth helper functions and shortcuts.
# This is a custom wrapper system (not an official Codex command set).

CODEX_SHARED_HOME="${CODEX_SHARED_HOME:-$HOME/.codex-shared}"

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

codex_auth_status() { CODEX_HOME="$CODEX_SHARED_HOME" command codex login status; }
codex_auth_login() { CODEX_HOME="$CODEX_SHARED_HOME" command codex login --device-auth; }
codex_auth_login_browser() { CODEX_HOME="$CODEX_SHARED_HOME" command codex login; }
codex_auth_logout() { CODEX_HOME="$CODEX_SHARED_HOME" command codex logout; }

codex_auth_login_link() {
  local line
  local link=""
  while IFS= read -r line; do
    printf '%s\n' "$line"
    if [[ -z "$link" && "$line" == https://auth.openai.com/* ]]; then
      link="$line"
      if _copy_to_clipboard "$link"; then
        echo "Login link copied to clipboard."
      else
        echo "Login link found (copy tool unavailable): $link"
      fi
    fi
  done < <(CODEX_HOME="$CODEX_SHARED_HOME" command codex login 2>&1)
}

# Main relogin helpers.
codex_auth_relogin() { codex_auth_logout >/dev/null 2>&1 || true; codex_auth_login_link; }
codex_auth_relogin_device() { codex_auth_logout >/dev/null 2>&1 || true; codex_auth_login; }

# User-facing shortcuts.
crelogin() { codex_auth_relogin; }
crelogindev() { codex_auth_relogin_device; }
clogin() { codex_auth_login; }
cloginweb() { codex_auth_login_browser; }
clogout() { codex_auth_logout; }
cstatus() { codex_auth_status; }
cloginlink() { codex_auth_login_link; }
