#!/usr/bin/env bash
# Build a clean Chrome Web Store upload zip in dist/.
# Uses python3's zipfile so it works without a zip binary installed.
set -euo pipefail

cd "$(dirname "$0")/.."

python3 - <<'EOF'
import json
import zipfile
from pathlib import Path

FILES = [
    "manifest.json",
    "content.js",
    "main-world.js",
    "styles.css",
    "popup/popup.html",
    "popup/popup.css",
    "popup/popup.js",
    "icons/icon-16.png",
    "icons/icon-32.png",
    "icons/icon-48.png",
    "icons/icon-128.png",
]

version = json.loads(Path("manifest.json").read_text())["version"]
out = Path(f"dist/twitch-vertical-theater-chat-{version}.zip")
out.parent.mkdir(exist_ok=True)

with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
    for name in FILES:
        zf.write(name)

print(f"wrote {out}")
for info in zipfile.ZipFile(out).infolist():
    print(f"  {info.file_size:>7}  {info.filename}")
EOF
