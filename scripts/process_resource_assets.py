#!/usr/bin/env python3
"""Background-removal pass for the six per-animal resource-source asset folders
(RABBIT/BIRD/HEDGEHOG/SQUIRREL/FOX/DEER). Uses the shared bg_removal core
(border-connected flood fill + grid-phase-matched interior checker healing —
see bg_removal.py's docstring for why plain flood fill wasn't enough for
tree-canopy/root-hollow assets). Output goes to public/assets/dg/resources/
<original filename>, flattened (names are already unique and descriptive:
rabbit_carrot_patch_damaged.png etc.)."""
import os
from PIL import Image
from bg_removal import remove_background, trim, downscale

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "Game_Assets_Dream_Garden")
OUT = os.path.join(ROOT, "public", "assets", "dg", "resources")
FOLDERS = ["RABBIT", "BIRD", "HEDGEHOG", "SQUIRREL", "FOX", "DEER"]

MAX_SIDE = 1100


def main():
    os.makedirs(OUT, exist_ok=True)
    for folder in FOLDERS:
        d = os.path.join(SRC, folder)
        for fname in sorted(os.listdir(d)):
            if not fname.lower().endswith(".png"):
                continue
            name = fname.strip()
            im = Image.open(os.path.join(d, fname))
            im = remove_background(im)
            im = trim(im)
            im = downscale(im, MAX_SIDE)
            out_path = os.path.join(OUT, name)
            im.save(out_path, "PNG", optimize=True)
            print(f"{folder}/{fname} -> resources/{name}  {im.size[0]}x{im.size[1]}")


if __name__ == "__main__":
    main()
