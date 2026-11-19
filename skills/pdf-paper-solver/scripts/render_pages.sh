#!/usr/bin/env bash
# render_pages.sh — prepare a paper PDF for page-by-page solving.
#
# usage: render_pages.sh <paper.pdf> <workdir> [dpi]
#   creates  <workdir>/pages/p-01.png …   authoritative page images
#            <workdir>/text-dump.txt      garbled OCR — locator/index only
#   prints   page count, tool availability, first files
set -euo pipefail

pdf="${1:?usage: render_pages.sh <paper.pdf> <workdir> [dpi]}"
work="${2:?usage: render_pages.sh <paper.pdf> <workdir> [dpi]}"
dpi="${3:-150}"

for tool in pdftoppm pdfinfo; do
  command -v "$tool" >/dev/null 2>&1 || { echo "MISSING: $tool (install poppler-utils)"; exit 1; }
done

mkdir -p "$work/pages" "$work/crops"

pages=$(pdfinfo "$pdf" | awk '/^Pages:/ {print $2}')
pdftoppm -r "$dpi" -png "$pdf" "$work/pages/p"
pdftotext -layout "$pdf" "$work/text-dump.txt" 2>/dev/null || : > "$work/text-dump.txt"

# hygiene check: a scanned Adobe Scan paper produces garbage here — never transcribe from it
if grep -q "F-'ki" "$work/text-dump.txt" 2>/dev/null; then
  echo "WARNING: text layer is garbled scan OCR — read page images, use the dump only to locate questions."
fi

echo "pdf        : $pdf"
echo "pages      : $pages"
echo "dpi        : $dpi"
echo "images     : $(ls "$work/pages" | wc -l) files in $work/pages"
echo "text dump  : $work/text-dump.txt  (garbled; index only)"
if command -v tesseract >/dev/null 2>&1; then
  echo "tesseract  : $(tesseract --list-langs 2>/dev/null | tail -n +2 | tr '\n' ' ')"
else
  echo "tesseract  : not installed (optional; needed only to rescue unreadable words)"
fi
echo
echo "next: read $work/pages/p-01.png and the last page to capture paper metadata, then write meta.json"
