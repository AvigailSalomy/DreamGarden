#!/usr/bin/env python3
"""Targeted fake-transparency cleanup for already-shipped production PNGs.

Finds each listed asset's leftover background in its raw source with
bg_removal's residue pass (tinted/enclosed checkerboard + enclosed
studio-backdrop pockets — see bg_removal.residue_cleanup), maps that mask
through the SAME crop box and downscale the original pipeline used, and
lowers the shipped PNG's alpha there. Nothing else changes: same pixel
dimensions, same content placement (so no in-world scale/anchor moves), and
every pixel outside the residue mask is kept byte-for-byte.

Safety: if the file on disk doesn't have the canvas the pipeline's crop
produces, the mask can't be aligned and the asset is skipped and reported.

    python3 scripts/clean_asset_residue.py                 # all TARGETS
    python3 scripts/clean_asset_residue.py --preview DIR   # write before/after sheets, don't touch assets
    python3 scripts/clean_asset_residue.py resources/fox_grape_vine_restored ...
    python3 scripts/clean_asset_residue.py --feather-edges     # soften canvas-cut edges (EDGE_FEATHER); run once
"""
import os
import sys

import numpy as np
from PIL import Image

from bg_removal import residue_cleanup, trim_box
import process_dg_assets as dg
import process_resource_assets as res

OUT = os.path.join(dg.ROOT, "public", "assets", "dg")

# Every shipped world asset the residue audit found with visible checker /
# grey-box / backdrop remnants (animals and accessories deliberately excluded).
TARGETS = [
    "decor/bench_01",
    "decor/birdhouse_01",
    "decor/lantern_01",
    "decor/planter_01",
    "decor/sign_01",
    "foreground/foreground_02",
    "foreground/foreground_03",
    "nature/log_01",
    "nature/mushrooms_01",
    "structures/bridge_wood_01",
    "trees/tree_large_01",
    "vegetation/bush_green_01",
    "vegetation/fern_01",
    "water/pond_restored_01",
    "water/water_lilies_01",
    "resources/bird_blossom_tree_damaged",
    "resources/bird_blossom_tree_restored",
    "resources/bird_water_lily_patch_restored",
    "resources/deer_enchanted_mushroom_ring_damaged",
    "resources/deer_enchanted_mushroom_ring_restored",
    "resources/deer_moonflower_meadow_damaged",
    "resources/deer_moonflower_meadow_restored",
    "resources/fox_berry_vine_damaged",
    "resources/fox_berry_vine_restored",
    "resources/fox_fern_cluster_restored",
    "resources/fox_grape_vine_damaged",
    "resources/fox_grape_vine_restored",
    "resources/hedgehog_herb_patch_damaged",
    "resources/hedgehog_herb_patch_restored",
    "resources/hedgehog_mossy_log_damaged",
    "resources/hedgehog_mossy_log_restored",
    "resources/rabbit_wildflower_patch_damaged",
    "resources/squirrel_apple_tree_damaged",
    "resources/squirrel_apple_tree_restored",
    "resources/squirrel_nut_cache_restored",
]


# Assets whose painted ground runs right to the canvas edge, leaving a hard
# straight (rectangular) boundary in the world. Those edges get a soft alpha
# fade instead. Values: which edges, and how far in the fade reaches
# (fraction of that dimension).
EDGE_FEATHER = {
    "resources/fox_berry_vine_damaged": ("bottom", "left", "right"),
    "resources/hedgehog_herb_patch_damaged": ("bottom", "left", "right"),
    "resources/hedgehog_herb_patch_restored": ("bottom", "left", "right"),
    "resources/deer_enchanted_berry_shrine_damaged": ("bottom",),
    "resources/squirrel_nut_cache_damaged": ("top",),
    "resources/squirrel_nut_cache_restored": ("top",),
}
FEATHER_REACH = 0.09


def feather_edges(im: Image.Image, edges) -> Image.Image:
    arr = np.asarray(im.convert("RGBA")).copy()
    h, w = arr.shape[:2]
    ramp = np.ones((h, w), np.float32)

    def smooth(n):  # 0 at the edge -> 1 at `n` px in, eased
        t = np.clip(np.arange(max(n, 1)) / max(n - 1, 1), 0, 1)
        return t * t * (3 - 2 * t)

    ny, nx = int(h * FEATHER_REACH), int(w * FEATHER_REACH)
    if "top" in edges: ramp[:ny] *= smooth(ny)[:, None]
    if "bottom" in edges: ramp[h - ny:] *= smooth(ny)[::-1][:, None]
    if "left" in edges: ramp[:, :nx] *= smooth(nx)[None, :]
    if "right" in edges: ramp[:, w - nx:] *= smooth(nx)[::-1][None, :]
    arr[..., 3] = np.round(arr[..., 3] * ramp).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def source_map() -> dict[str, tuple[str, int]]:
    """'slug/name' -> (raw source path, max side), mirroring both pipelines' naming."""
    m = {}
    for folder, slug in dg.CATEGORY_SLUG.items():
        src_dir = os.path.join(dg.SRC, folder)
        if not os.path.isdir(src_dir):
            continue
        seq = 1
        for fname in sorted(os.listdir(src_dir)):
            if fname.startswith(".") or not fname.lower().endswith((".png", ".jpg", ".jpeg")):
                continue
            name = dg.clean_name(folder, fname)
            if name is None:
                name = f"{slug}_{seq:02d}"
                seq += 1
            m[f"{slug}/{name}"] = (os.path.join(src_dir, fname), dg.MAX_SIDE)
    for folder in res.FOLDERS:
        d = os.path.join(res.SRC, folder)
        for fname in sorted(os.listdir(d)):
            if fname.lower().endswith(".png"):
                m[f"resources/{os.path.splitext(fname.strip())[0]}"] = (os.path.join(d, fname), res.MAX_SIDE)
    return m


def fit(im: Image.Image, box, max_side: int) -> Image.Image:
    return dg.downscale(im.crop(box), max_side)


def main() -> None:
    args = sys.argv[1:]
    if "--feather-edges" in args:
        for key, edges in EDGE_FEATHER.items():
            dest = os.path.join(OUT, key + ".png")
            feather_edges(Image.open(dest), edges).save(dest, "PNG", optimize=True)
            print(f"FEATHERED {key}: {', '.join(edges)}")
        return
    preview = None
    if "--preview" in args:
        i = args.index("--preview")
        preview = args[i + 1]
        del args[i:i + 2]
        os.makedirs(preview, exist_ok=True)
    targets = args or TARGETS
    sources = source_map()
    for key in targets:
        dest = os.path.join(OUT, key + ".png")
        if key not in sources or not os.path.exists(dest):
            print(f"SKIP {key}: no source/output mapping")
            continue
        src, max_side = sources[key]
        old, kill, removed = residue_cleanup(Image.open(src))
        box = trim_box(old)
        current = Image.open(dest).convert("RGBA")
        if fit(old, box, max_side).size != current.size:
            print(f"SKIP {key}: on-disk canvas doesn't match the pipeline's crop — can't align the mask")
            continue
        # only ever LOWER alpha where residue was found; every other pixel of
        # the shipped file is kept byte-for-byte
        k = np.asarray(fit(kill, box, max_side)).astype(np.float32) / 255
        arr = np.asarray(current).copy()
        arr[..., 3] = np.round(arr[..., 3] * (1 - k)).astype(np.uint8)
        new_out = Image.fromarray(arr, "RGBA")
        if preview:
            w, h = current.size
            sheet = Image.new("RGBA", (w * 2 + 12, h), (80, 150, 60, 255))
            sheet.alpha_composite(current, (0, 0))
            sheet.alpha_composite(new_out, (w + 12, 0))
            sheet.thumbnail((1400, 700))
            sheet.save(os.path.join(preview, key.replace("/", "__") + ".png"))
        else:
            new_out.save(dest, "PNG", optimize=True)
        print(f"{'PREVIEW' if preview else 'CLEANED'} {key}: {removed} residue px at source res, {current.size[0]}x{current.size[1]} unchanged")


if __name__ == "__main__":
    main()
