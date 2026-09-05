"""Export the approved artwork at extension icon sizes without redrawing it.

Requires macOS sips. Run from any directory with python3 scripts/generate_icons.py.
"""
from pathlib import Path
import subprocess

root = Path(__file__).resolve().parent.parent
source = root / "icons/source/veiled-statue.png"
for size in (16, 32, 48, 128):
    output = root / f"icons/icon-{size}.png"
    subprocess.run(["sips", "--resampleHeightWidth", str(size), str(size), str(source), "--out", str(output)], check=True)
