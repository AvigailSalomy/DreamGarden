"""
One-off asset fix for the Garden Maze enemies: the four source images in
Game_Assets_frozen_world_Compressed/packman_game/enemys are 2816x1536 opaque
JPEGs with a literal grey checkerboard baked in where transparency should be
(same problem as the Shop art — see fix_shop_alpha.py).

A plain "grey = background" key (what fix_shop_alpha.py does) isn't enough
here: each creature has a translucent magic aura painted over the checker,
which tints it just enough to survive a grey test and leaves visible checker
squares. So this keys on the CREATURE instead — saturated or bright pixels —
keeps only the largest connected body, fills its interior holes, and drops the
auras and stray particles (the in-game sprite adds its own glow). Each sprite
is then cropped to its bounding box and downscaled for a ~70px maze cell.

Run once from the repo root (needs numpy + scipy + Pillow):
  py scripts/fix_maze_enemy_alpha.py
"""

import os
import numpy as np
from PIL import Image
from scipy import ndimage

SRC_ROOT = "Game_Assets_frozen_world_Compressed/packman_game/enemys"
DST_ROOT = "public/assets/frosted/maze"
MAX_SIDE = 320
PAD = 10

JOBS = [
    # (source, output, saturation threshold, brightness threshold)
    ("Frost_Mushroom.jpeg", "fv_enemy_mushroom.png", 45, 170),
    ("Frozen_Flame.jpeg", "fv_enemy_flame.png", 70, 200),
    ("ice_berg.jpeg", "fv_enemy_snowball.png", 45, 160),
    ("Ice_Thorn.jpeg", "fv_enemy_thorn.png", 55, 175),
]


def cut_out(img: Image.Image, sat_min: int, bright_min: int) -> Image.Image:
    rgb = np.asarray(img.convert("RGB")).astype(np.int16)
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    fg = ((mx - mn) > sat_min) | (mx > bright_min)

    fg = ndimage.binary_opening(fg, iterations=3)  # snap thin aura wisps off the body
    labels, n = ndimage.label(fg)
    if n == 0:
        raise RuntimeError("no foreground found")
    sizes = ndimage.sum(fg, labels, range(1, n + 1))
    body = labels == (int(np.argmax(sizes)) + 1)
    body = ndimage.binary_closing(body, iterations=6)
    # fill only SMALL interior holes (specks inside the body); a big enclosed
    # gap — e.g. between the flame's curls — is real background, keep it clear
    holes = ndimage.binary_fill_holes(body) & ~body
    hole_labels, hn = ndimage.label(holes)
    if hn:
        hole_sizes = ndimage.sum(holes, hole_labels, range(1, hn + 1))
        small = np.isin(hole_labels, np.nonzero(hole_sizes < 2500)[0] + 1)
        body = body | small
    body = ndimage.binary_erosion(body, iterations=2)  # shave the dark checker fringe

    alpha = ndimage.gaussian_filter(body.astype(np.float32) * 255, 1.6)
    out = np.dstack([rgb.astype(np.uint8), np.clip(alpha, 0, 255).astype(np.uint8)])
    return Image.fromarray(out, "RGBA")


def main():
    os.makedirs(DST_ROOT, exist_ok=True)
    for src_rel, dst_name, sat_min, bright_min in JOBS:
        fixed = cut_out(Image.open(os.path.join(SRC_ROOT, src_rel)), sat_min, bright_min)
        l, t, r, b = fixed.getchannel("A").point(lambda a: 255 if a > 40 else 0).getbbox()
        fixed = fixed.crop((max(0, l - PAD), max(0, t - PAD), min(fixed.width, r + PAD), min(fixed.height, b + PAD)))
        scale = MAX_SIDE / max(fixed.size)
        if scale < 1:
            fixed = fixed.resize((round(fixed.width * scale), round(fixed.height * scale)), Image.LANCZOS)
        fixed.save(os.path.join(DST_ROOT, dst_name), optimize=True)
        print(f"{dst_name}: {fixed.size}")


if __name__ == "__main__":
    main()
