#!/bin/sh
# Headless screenshot of a local page.
# Needs tools/serve.js running on :5173.
# Usage: tools/shoot.sh <path-under-repo> <out.png> [query] [w] [h]
PAGE=$1; OUT=$2; QUERY=${3:-}; W=${4:-2560}; H=${5:-1440}
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=$W,$H --virtual-time-budget=6000 \
  --user-data-dir="$TEMP/sg-chrome-shot" \
  --screenshot="$(cygpath -w "$(realpath -m "$OUT")")" "http://localhost:5173/$PAGE${QUERY:+?$QUERY}" 2>&1 | grep -v external_registry
