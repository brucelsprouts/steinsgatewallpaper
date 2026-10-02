#!/bin/sh
# Usage: ./shoot.sh page.html out.png [w h]  — headless Chrome, writes synchronously.
W=${3:-2560}; H=${4:-1440}
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=$W,$H --virtual-time-budget=4000 \
  --user-data-dir="$TEMP/sg-chrome-shot" \
  --screenshot="$(cygpath -w "$PWD/$2")" "file:///$(cygpath -m "$PWD/$1")" 2>&1 | grep -v external_registry
