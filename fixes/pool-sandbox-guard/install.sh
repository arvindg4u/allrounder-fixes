#!/usr/bin/env bash
#
# Install pool-sandbox-guard: hookify rules for Claude Code, guard plugin
# for OpenCode, and guard plugin + advisory rule for Cline. Templates live
# next to this script (hookify/*.md, opencode/*.js, cline/*) with __POOL_*__
# placeholders; this script substitutes your persistent root and installs them.
#
# Usage:
#   install.sh --root /persistent/dir [--alias /other/persistent/dir]
#              [--target-dir DIR] [--opencode-plugins DIR] [--cline-plugins DIR]
#              [--no-claude] [--no-opencode] [--no-cline]
#
# Examples:
#   install.sh --root /home/deploy/app
#   install.sh --root /teamspace/studios/this_studio --alias /home/zeus/content \
#     --opencode-plugins ~/.config/opencode/plugins

set -euo pipefail

ROOT=""; ALIAS=""; TARGET_DIR=""; OPENCODE_PLUGINS=""; CLINE_PLUGINS=""; NO_CLAUDE=0; NO_OPENCODE=0; NO_CLINE=0

usage() { sed -n '2,17p' "$0"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --root) ROOT="${2:?--root needs a value}"; shift 2;;
    --alias) ALIAS="${2:?--alias needs a value}"; shift 2;;
    --target-dir) TARGET_DIR="${2:?--target-dir needs a value}"; shift 2;;
    --opencode-plugins) OPENCODE_PLUGINS="${2:?--opencode-plugins needs a value}"; shift 2;;
    --cline-plugins) CLINE_PLUGINS="${2:?--cline-plugins needs a value}"; shift 2;;
    --no-claude) NO_CLAUDE=1; shift;;
    --no-opencode) NO_OPENCODE=1; shift;;
    --no-cline) NO_CLINE=1; shift;;
    -h|--help) usage; exit 0;;
    *) echo "error: unknown option $1" >&2; usage >&2; exit 1;;
  esac
done

[ -n "$ROOT" ] || { echo "error: --root is required (absolute path of the persistent directory)" >&2; exit 1; }
case "$ROOT" in /*) ;; *) echo "error: --root must be absolute: $ROOT" >&2; exit 1;; esac
if [ -n "$ALIAS" ]; then
  case "$ALIAS" in /*) ;; *) echo "error: --alias must be absolute: $ALIAS" >&2; exit 1;; esac
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${TARGET_DIR:-$PWD}"

command -v python3 >/dev/null 2>&1 || { echo "error: python3 is required" >&2; exit 1; }

if [ "$NO_OPENCODE" -eq 0 ] && [ -z "$OPENCODE_PLUGINS" ]; then
  if [ -n "${OPENCODE_CONFIG_DIR:-}" ]; then OPENCODE_PLUGINS="$OPENCODE_CONFIG_DIR/plugins";
  elif [ -d "$HOME/.config/opencode" ]; then OPENCODE_PLUGINS="$HOME/.config/opencode/plugins";
  else OPENCODE_PLUGINS="$TARGET_DIR/.opencode/plugins"; fi
fi

if [ "$NO_CLINE" -eq 0 ] && [ -z "$CLINE_PLUGINS" ]; then
  if [ -d "$HOME/.cline" ]; then CLINE_PLUGINS="$HOME/.cline/plugins";
  else CLINE_PLUGINS="$TARGET_DIR/.cline/plugins"; fi
fi

python3 - "$SCRIPT_DIR" "$ROOT" "$ALIAS" "$TARGET_DIR" "$OPENCODE_PLUGINS" "$CLINE_PLUGINS" "$NO_CLAUDE" "$NO_OPENCODE" "$NO_CLINE" <<'PYEOF'
import os
import re
import sys

script_dir, root, alias, target, oc_plugins, cline_plugins, no_claude, no_opencode, no_cline = sys.argv[1:10]
no_claude = no_claude == '1'
no_opencode = no_opencode == '1'
no_cline = no_cline == '1'

BS = chr(92)  # backslash without nesting-escaping headaches
# Hookify patterns consume the leading '/' themselves, so RX tokens expand
# to slash-less paths (exactly like the originals they replace).
rx_root = re.escape(root.lstrip('/'))
rx_alias = re.escape(alias.lstrip('/')) if alias else r'(?!)'
raw_alias = alias if alias else root
roots_display = root if not alias else root + ' (also ' + alias + ')'

def js_escape(s):
    # Escape for embedding inside a /.../  JS regex literal.
    out = []
    for ch in s:
        if ch in BS + '^$.|?*+()[]{}':
            out.append(BS + ch)
        elif ch == '/':
            out.append(BS + '/')
        else:
            out.append(ch)
    return ''.join(out)

js_rx_root = js_escape(root)
js_rx_alias = js_escape(alias) if alias else r'(?!)'

def sub_md(text):
    return (text.replace('__POOL_ROOT_RX__', rx_root)
                .replace('__POOL_ALIAS_RX__', rx_alias)
                .replace('__POOL_ROOTS__', roots_display)
                .replace('__POOL_ROOT__', root)
                .replace('__POOL_ALIAS__', raw_alias))

def sub_js(text):
    return (text.replace('__POOL_ROOT_RX__', js_rx_root)
                .replace('__POOL_ALIAS_RX__', js_rx_alias)
                .replace('__POOL_ROOTS__', roots_display)
                .replace('__POOL_ROOT__', root)
                .replace('__POOL_ALIAS__', raw_alias))

def sub_txt(text):
    return (text.replace('__POOL_ROOTS__', roots_display)
                .replace('__POOL_ROOT__', root)
                .replace('__POOL_ALIAS__', raw_alias))

if not no_claude:
    dest = os.path.join(target, '.claude')
    os.makedirs(dest, exist_ok=True)
    src = os.path.join(script_dir, 'hookify')
    for fname in sorted(os.listdir(src)):
        if not fname.endswith('.md'):
            continue
        with open(os.path.join(src, fname)) as f:
            content = sub_md(f.read())
        out = fname[:-3] + '.local.md'
        with open(os.path.join(dest, out), 'w') as f:
            f.write(content)
        print('claude: wrote ' + os.path.join(dest, out))
    print('claude: rules are active immediately - no restart needed.')

if not no_opencode:
    os.makedirs(oc_plugins, exist_ok=True)
    with open(os.path.join(script_dir, 'opencode', 'pool-sandbox-guard.js')) as f:
        content = sub_js(f.read())
    out = os.path.join(oc_plugins, 'pool-sandbox-guard.js')
    with open(out, 'w') as f:
        f.write(content)
    print('opencode: wrote ' + out)
    print('opencode: make sure your opencode.json "plugin" list includes that plugins dir, then reload OpenCode.')

if not no_cline:
    os.makedirs(cline_plugins, exist_ok=True)
    with open(os.path.join(script_dir, 'cline', 'pool-sandbox-guard.js')) as f:
        content = sub_js(f.read())
    out = os.path.join(cline_plugins, 'pool-sandbox-guard.js')
    with open(out, 'w') as f:
        f.write(content)
    print('cline: wrote ' + out)
    print('cline: global plugin, picked up by new sessions (no restart needed).')
    cline_rules = os.path.join(os.path.dirname(os.path.normpath(cline_plugins)), 'rules')
    os.makedirs(cline_rules, exist_ok=True)
    with open(os.path.join(script_dir, 'cline', 'pool-sandbox-guard.md')) as f:
        md = sub_txt(f.read())
    md_out = os.path.join(cline_rules, 'pool-sandbox-guard.md')
    with open(md_out, 'w') as f:
        f.write(md)
    print('cline: wrote ' + md_out)
PYEOF
