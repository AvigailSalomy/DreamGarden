"""
One-off asset prep for the Frosted Valley animal puzzles: copies the final,
already-painted puzzle artwork from
  Game_Assets_frozen_world_Compressed/pazzel/pazzel_final_photos/
into public/assets/frosted/puzzle/ under stable per-animal names, downscaled
from 2816x1536 to 1920 wide (the puzzle board never renders larger) — the
art itself is untouched, never regenerated.

Run once from the repo root:
  py scripts/prepare_frosted_puzzles.py
"""

import os
from PIL import Image

SRC = "Game_Assets_frozen_world_Compressed/pazzel/pazzel_final_photos"
DST = "public/assets/frosted/puzzle"
TARGET_W = 1920

# source filename -> animal id (the penguin/shore art kept its generator's name)
MAPPING = {
    "rabbit.jpeg": "fv_rabbit",
    "fox.jpeg": "fv_fox",
    "deer.jpeg": "fv_deer",
    "squarle.jpeg": "fv_squirrel",
    "bear.jpeg": "fv_polarbear",
    "Gemini_Generated_Image_txygoftxygoftxyg (1).jpeg": "fv_penguin",
}

os.makedirs(DST, exist_ok=True)
for src_name, animal_id in MAPPING.items():
    im = Image.open(os.path.join(SRC, src_name)).convert("RGB")
    h = round(im.height * TARGET_W / im.width)
    im = im.resize((TARGET_W, h), Image.LANCZOS)
    out = os.path.join(DST, f"{animal_id}_puzzle.jpg")
    im.save(out, "JPEG", quality=86, optimize=True, progressive=True)
    print(out, im.size, os.path.getsize(out) // 1024, "KB")
