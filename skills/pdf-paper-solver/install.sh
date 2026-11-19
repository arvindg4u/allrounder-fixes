#!/usr/bin/env bash
# install.sh — install the pdf-paper-solver skill + /solve-paper command into OpenCode
#
# usage: bash install.sh [--dry-run]
#
# Copies (or links) this folder into the OpenCode config dir:
#   <config>/skills/pdf-paper-solver/
#   <config>/commands/solve-paper.md
# Config dir resolution: $OPENCODE_CONFIG_DIR, else ~/.config/opencode
set -euo pipefail

dry=0
[ "${1:-}" = "--dry-run" ] && dry=1

src="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cfg="${OPENCODE_CONFIG_DIR:-$HOME/.config/opencode}"
skill_dst="$cfg/skills/pdf-paper-solver"
cmd_dst="$cfg/commands/solve-paper.md"

echo "source : $src"
echo "config : $cfg"
echo

run() { if [ "$dry" = 1 ]; then echo "DRY  $*"; else "$@"; fi; }

for tool in pdftoppm pdfinfo python3; do
  command -v "$tool" >/dev/null 2>&1 && echo "ok      $tool found" || echo "MISSING $tool  (install: sudo apt-get install -y poppler-utils)"
done
command -v tesseract >/dev/null 2>&1 && echo "ok      tesseract (optional, for unreadable words)" || echo "info    tesseract not installed (optional)"

run mkdir -p "$cfg/skills" "$cfg/commands"
run rm -rf "$skill_dst"
run mkdir -p "$skill_dst"
run cp -R "$src/SKILL.md" "$src/scripts" "$src/references" "$src/command" "$src/examples" "$skill_dst/"
run cp "$src/command/solve-paper.md" "$cmd_dst"
run chmod +x "$skill_dst/scripts/render_pages.sh"

echo
echo "installed:"
echo "  $skill_dst"
echo "  $cmd_dst"
echo
echo "verify : python3 \"$skill_dst/scripts/validate.py\" <note.md> <total_questions>"
echo "use    : /solve-paper <your-paper.pdf>   (or just upload a paper PDF and ask to solve it)"
