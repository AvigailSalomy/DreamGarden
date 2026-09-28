#!/usr/bin/env python3
"""
Production-asset pipeline for the Dream Garden visual rebuild.

The supplied "Game_Assets_Dream_Garden" pack is raw AI-generated output, not
game-ready sprites: every file (regardless of .png/.jpeg extension) is a flat
RGB JPEG with NO alpha channel, sitting on one of: a solid white studio
backdrop, a solid grey backdrop, or a baked-in PICTURE of a transparency
checkerboard (the generator drew a literal checker pattern instead of real
alpha — a known quirk of some image models when asked for "transparent bg").

This script turns each into a real, trimmed, alpha-transparent PNG:
  1. flood-fill outward from the border through any "background-ish"
     (low-saturation: near-white / near-grey / checkerboard) pixel run,
     marking it transparent — leaves saturated subject pixels untouched.
  2. feathers the resulting alpha mask slightly, for a soft anti-aliased edge.
  3. trims to the opaque content's bounding box (+ padding).
  4. downscales so the longest side fits a web-sane cap.
  5. writes optimized PNG to public/assets/dg/<category>/<name>.png.

Deterministic, no ML/network — classical background subtraction only.
Re-run any time; it's idempotent (reads SRC, never mutates it).
"""
import os
import sys

from PIL import Image
from bg_removal import remove_background, trim, downscale

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "Game_Assets_Dream_Garden")
OUT = os.path.join(ROOT, "public", "assets", "dg")

MAX_SIDE = 1100  # web-sane cap; Phaser scales further at render time

# Category folder -> output slug
CATEGORY_SLUG = {
    "ACCESSORIES": "accessories",
    "ANIMALS": "animals",
    "BRIDGES": "structures",
    "BUILDINGS": "structures",
    "BUSHES & FLOWERS": "vegetation",
    "DECORATIONS": "decor",
    "FOREGROUND": "foreground",
    "FX": "fx",
    "RESTORATION": "vegetation",
    "ROCKS : NATURE": "nature",
    "TERRAIN : PATHS": "terrain",
    "TREES": "trees",
    "WATER": "water",
}

# Explicit renames for the un-named "Gemini_Generated_Image_*" files where the
# identity matters for gameplay (animals) or composition (the rest get a
# stable sequential name within their category).
ANIMAL_NAMES = {
    "Gemini_Generated_Image_mufb3xmufb3xmufb": "hedgehog",
    "Gemini_Generated_Image_8eckkh8eckkh8eck": "fox",
    "Gemini_Generated_Image_eql4cyeql4cyeql4": "deer",
    "Gemini_Generated_Image_gbspv8gbspv8gbsp": "rabbit",
    "Gemini_Generated_Image_nrvqljnrvqljnrvq": "bluebird",
    "Gemini_Generated_Image_qsr025qsr025qsr0": "squirrel",
}


def clean_name(folder: str, fname: str) -> str:
    base = os.path.splitext(fname)[0].strip()
    if base in ANIMAL_NAMES:
        return ANIMAL_NAMES[base]
    if base.startswith("dg_"):
        return base[3:]
    if base.startswith("Gemini_Generated_Image"):
        return None  # sequential name assigned by caller
    return base.lower().replace(" ", "_")


def process_one(path: str, out_path: str) -> tuple[int, int]:
    im = Image.open(path)
    im = remove_background(im)
    im = trim(im)
    im = downscale(im, MAX_SIDE)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    im.save(out_path, "PNG", optimize=True)
    return im.size


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else None
    manifest = []
    for folder, slug in CATEGORY_SLUG.items():
        src_dir = os.path.join(SRC, folder)
        if not os.path.isdir(src_dir):
            continue
        seq = 1
        for fname in sorted(os.listdir(src_dir)):
            if fname.startswith(".") or not fname.lower().endswith((".png", ".jpg", ".jpeg")):
                continue
            if only and only not in folder:
                continue
            name = clean_name(folder, fname)
            if name is None:
                name = f"{slug}_{seq:02d}"
                seq += 1
            out_path = os.path.join(OUT, slug, f"{name}.png")
            size = process_one(os.path.join(src_dir, fname), out_path)
            manifest.append((folder, fname, slug, name, size))
            print(f"{folder}/{fname}  ->  dg/{slug}/{name}.png  {size[0]}x{size[1]}")

    print(f"\n{len(manifest)} assets processed into {OUT}")


if __name__ == "__main__":
    main()
