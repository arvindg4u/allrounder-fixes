#!/usr/bin/env bash
set -euo pipefail

SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST_DIR="${HOME}/.local/bin"

mkdir -p "$DEST_DIR"

cp "$SOURCE_DIR/codex-auth-helpers.sh" "$DEST_DIR/codex-auth-helpers.sh"
cp "$SOURCE_DIR/crelogin" "$DEST_DIR/crelogin"
cp "$SOURCE_DIR/crelogindev" "$DEST_DIR/crelogindev"
cp "$SOURCE_DIR/clogin" "$DEST_DIR/clogin"
cp "$SOURCE_DIR/cloginweb" "$DEST_DIR/cloginweb"
cp "$SOURCE_DIR/clogout" "$DEST_DIR/clogout"
cp "$SOURCE_DIR/cstatus" "$DEST_DIR/cstatus"
cp "$SOURCE_DIR/cloginlink" "$DEST_DIR/cloginlink"
cp "$SOURCE_DIR/ckilllogin" "$DEST_DIR/ckilllogin"

chmod +x "$DEST_DIR/codex-auth-helpers.sh" \
  "$DEST_DIR/crelogin" \
  "$DEST_DIR/crelogindev" \
  "$DEST_DIR/clogin" \
  "$DEST_DIR/cloginweb" \
  "$DEST_DIR/clogout" \
  "$DEST_DIR/cstatus" \
  "$DEST_DIR/cloginlink" \
  "$DEST_DIR/ckilllogin"

echo "wrappers_installed_dir=$DEST_DIR"
