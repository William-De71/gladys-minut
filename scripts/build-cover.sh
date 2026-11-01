#!/usr/bin/env bash
# Builds cover.jpg (800 x 534, < 150 KB, as the store requires) from
# docs/assets/cover.svg (the Minut wordmark in it is the official logo of
# Minut, a trademark of its owner). Needs Inkscape (or Chrome: CHROME=/path/to/chrome)
# and ImageMagick.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp="$(mktemp --suffix=.png)"
trap 'rm -f "$tmp"' EXIT
if command -v inkscape >/dev/null; then
  inkscape docs/assets/cover.svg --export-type=png --export-filename="$tmp" -w 800 -h 534 >/dev/null 2>&1
else
  "${CHROME:?Inkscape not found: set CHROME=/path/to/chrome}" --headless=new --no-sandbox \
    --disable-gpu --hide-scrollbars --window-size=800,800 --screenshot="$tmp" \
    "file://$PWD/docs/assets/cover.svg" >/dev/null 2>&1
fi
# Chrome draws a taller window: keep the 800 x 534 of the cover.
magick "$tmp" -crop 800x534+0+0 +repage -strip -quality 85 -sampling-factor 4:2:0 cover.jpg
size="$(stat -c %s cover.jpg)"
dims="$(magick identify -format '%wx%h' cover.jpg)"
echo "cover.jpg: ${dims}, ${size} bytes"
[ "$dims" = "800x534" ] || { echo "wrong dimensions" >&2; exit 1; }
[ "$size" -lt $((150 * 1024)) ] || { echo "too heavy" >&2; exit 1; }
