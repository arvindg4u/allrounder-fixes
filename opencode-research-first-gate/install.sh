#!/usr/bin/env bash
#
# install.sh — install the OpenCode research-first gate globally.
#
# Copies the rule and plugin into ~/.config/opencode, then registers them in
# opencode.json. Idempotent: re-running it updates the files in place and does not
# duplicate the config entries. The existing config is backed up first.

set -euo pipefail

CONFIG_DIR="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_NAME="research-first-gate"
RULE_NAME="web-research-first.md"

if [[ ! -f "$SRC_DIR/rules/$RULE_NAME" || ! -f "$SRC_DIR/plugins/$PLUGIN_NAME/index.ts" ]]; then
  echo "error: expected rules/ and plugins/$PLUGIN_NAME/ next to this script" >&2
  exit 1
fi

echo "Installing research-first gate into $CONFIG_DIR"

# --- 1. the rule ------------------------------------------------------------
mkdir -p "$CONFIG_DIR/rules"
cp "$SRC_DIR/rules/$RULE_NAME" "$CONFIG_DIR/rules/$RULE_NAME"
echo "  rule    -> $CONFIG_DIR/rules/$RULE_NAME"

# --- 2. the plugin ----------------------------------------------------------
mkdir -p "$CONFIG_DIR/plugins/$PLUGIN_NAME"
cp "$SRC_DIR/plugins/$PLUGIN_NAME/"*.ts "$CONFIG_DIR/plugins/$PLUGIN_NAME/"
echo "  plugin  -> $CONFIG_DIR/plugins/$PLUGIN_NAME/"

# --- 3. register both in opencode.json -------------------------------------
# Prefer an existing opencode.jsonc, otherwise opencode.json.
CONFIG_FILE=""
for candidate in "$CONFIG_DIR/opencode.jsonc" "$CONFIG_DIR/opencode.json"; do
  if [[ -f "$candidate" ]]; then
    CONFIG_FILE="$candidate"
    break
  fi
done

if [[ -z "$CONFIG_FILE" ]]; then
  CONFIG_FILE="$CONFIG_DIR/opencode.json"
  echo '{}' > "$CONFIG_FILE"
  echo "  config  -> created $CONFIG_FILE"
fi

command -v python3 >/dev/null 2>&1 || {
  echo
  echo "python3 not found. Add these entries to $CONFIG_FILE manually:"
  echo '  "instructions": ["~/.config/opencode/rules/web-research-first.md"]'
  echo '  "plugins": [{ "package": "./plugins/research-first-gate" }]'
  exit 0
}

python3 - "$CONFIG_FILE" <<'PY'
import json, os, shutil, sys, datetime

path = sys.argv[1]
raw = open(path, encoding="utf-8").read()

try:
    config = json.loads(raw)
except json.JSONDecodeError as error:
    sys.stderr.write(
        f"\nerror: {path} is not plain JSON ({error}).\n"
        "It may be JSONC with comments. Add these entries manually:\n"
        '  "instructions": ["~/.config/opencode/rules/web-research-first.md"]\n'
        '  "plugins": [{ "package": "./plugins/research-first-gate" }]\n'
    )
    sys.exit(1)

if not isinstance(config, dict):
    sys.stderr.write(f"\nerror: {path} must contain a JSON object\n")
    sys.exit(1)

backup = f"{path}.bak-{datetime.datetime.now():%Y%m%d-%H%M%S}"
counter = 1
while os.path.exists(backup):
    backup = f"{path}.bak-{datetime.datetime.now():%Y%m%d-%H%M%S}-{counter}"
    counter += 1
shutil.copy2(path, backup)

# instructions — keep every existing entry, add ours once
rule = "~/.config/opencode/rules/web-research-first.md"
instructions = config.get("instructions")
if instructions is None:
    instructions = []
elif not isinstance(instructions, list):
    sys.stderr.write("\nerror: \"instructions\" exists but is not a list; add the rule manually\n")
    sys.exit(1)
if rule not in instructions:
    instructions.append(rule)
config["instructions"] = instructions

# plugins — keep every existing entry, replace only our own by package path
package = "./plugins/research-first-gate"
plugins = config.get("plugins")
if plugins is None:
    plugins = []
elif not isinstance(plugins, list):
    sys.stderr.write("\nerror: \"plugins\" exists but is not a list; add the plugin manually\n")
    sys.exit(1)


def package_of(entry):
    if isinstance(entry, str):
        return entry
    if isinstance(entry, dict):
        return entry.get("package")
    return None


plugins = [entry for entry in plugins if package_of(entry) != package]
plugins.append({"package": package})
config["plugins"] = plugins

with open(path, "w", encoding="utf-8") as handle:
    json.dump(config, handle, indent=2)
    handle.write("\n")

print(f"  config  -> updated {path}")
print(f"  backup  -> {backup}")
PY

echo
echo "Done. OpenCode reloads config without a restart."
echo "Audit log: ~/.local/share/opencode/log/research-first-gate.log"
