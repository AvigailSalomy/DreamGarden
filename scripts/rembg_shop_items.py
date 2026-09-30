"""
Re-cuts the Winter Market's placeable items (buildings, plants, decorations)
with rembg's BiRefNet segmentation model.

fix_shop_alpha.py's grey-flood approach can't tell white snow from the grey
fake checkerboard these images were exported on: it punched holes through
snowy roofs and benches, and it left tinted checker in lamp glows and drawn
ground shadows. A segmentation model keys the object itself instead.

Output is trimmed to the artwork (like the world's own props in
public/assets/frosted/), and each item's visibleHeightFraction for
src/data/frostedShop.ts is printed.

Run once from the repo root (downloads the model on first use):
  py scripts/rembg_shop_items.py [name-filter]
"""

import os
import sys

from PIL import Image
from rembg import new_session, remove

from fix_shop_alpha import JOBS, SRC_ROOT, DST_ROOT

MODEL = "birefnet-general"
PAD = 6


def main():
    only = sys.argv[1] if len(sys.argv) > 1 else ""
    session = new_session(MODEL)
    for src_rel, dst_name, *_ in JOBS:
        if "_pet_" in dst_name or dst_name == "fv_shop_world.png" or only not in dst_name:
            continue
        img = Image.open(os.path.join(SRC_ROOT, src_rel)).convert("RGB")
        cut = remove(img, session=session)
        # trim to the artwork, keeping a small margin like the world props
        l, t, r, b = cut.getchannel("A").point(lambda p: 255 if p > 8 else 0).getbbox()
        cut = cut.crop((max(0, l - PAD), max(0, t - PAD), min(cut.width, r + PAD), min(cut.height, b + PAD)))
        cut.save(os.path.join(DST_ROOT, dst_name))
        # the same "visible" threshold the world props were measured at
        _, vt, _, vb = cut.getchannel("A").point(lambda p: 255 if p > 40 else 0).getbbox()
        print(f"{dst_name}: {cut.size} visibleHeightFraction={(vb - vt) / cut.height:.3f}")


if __name__ == "__main__":
    main()
