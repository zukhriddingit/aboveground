"""Rebuild the Blender library, map GLBs and reference plates from the repository."""
import os
from pathlib import Path
import shutil
import subprocess

if __name__ == "__main__":
    root = Path(__file__).resolve().parents[1]
    binary = os.environ.get("BLENDER") or shutil.which("blender") or "/Applications/Blender.app/Contents/MacOS/Blender"
    script = root / "frontend/src/components/map/blender/build_stations.py"
    subprocess.run([binary, "-b", "--factory-startup", "--python-exit-code", "1", "--python", str(script)], cwd=root, check=True)
