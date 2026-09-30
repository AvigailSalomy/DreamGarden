"""
Rebuilds every Frosted Valley Shop PNG in public/assets/frosted/shop/ with a
clean, genuinely transparent background.

Why: the Shop's source art (Game_Assets_frozen_world_Compressed/shop/) is JPEG
with a fake "transparency" checkerboard baked in. The earlier
fix_shop_alpha.py removed ANY near-gray pixel (plus enclosed gray pockets), so
it also punched holes through white/gray snow on roofs, barrels, benches and
hedges, left checkerboard fragments around glows and shadows, produced
jagged all-or-nothing alpha, and kept large off-centre transparent margins.

This script does two things:

1. COPY — 17 of the 20 placeable items are the very same artwork as a world
   prop that was already cut out cleanly for the world itself (soft edges, tight
   ~10px margin). Those are copied byte-for-byte, so a house bought in the Shop
   is literally the same image as the matching house already in the valley.

2. MATTE — the rest (the three items with no world twin, plus the pet
   accessories) are re-extracted from their source JPEG by reconstructing the
   exact checkerboard behind the art (two gray levels, square size, phase) and
   removing only background that is connected to the image border — enclosed
   snow is never touched. Edges get real anti-aliased alpha with the
   background un-blended out of the edge colour; "glow" items keep their halo
   as genuine semi-transparency. World items are cropped to their content
   (+10px); pet accessories keep their full 2048px canvas because
   FrostedShopScene's ACCESSORY_ART anchors are fractions of that canvas.

Run from the repo root:  py scripts/rebuild_shop_assets.py
"""

import os
import sys
import shutil

import numpy as np
from PIL import Image
from scipy import ndimage

SRC = "Game_Assets_frozen_world_Compressed/shop"
WORLD = "public/assets/frosted"
DST = sys.argv[1] if len(sys.argv) > 1 else "public/assets/frosted/shop"
MARGIN = 10

# shop texture key -> clean world prop that is the same artwork
COPY_FROM_WORLD = {
    "fv_shop_cottage_snow": "fv_cottage_a",
    "fv_shop_cottage_stone": "fv_cottage_b",
    "fv_shop_gazebo": "fv_ice_gazebo",
    "fv_shop_decor_lamppost": "fv_lamppost",
    "fv_shop_decor_bench": "fv_bench",
    "fv_shop_decor_wheelbarrow": "fv_wheelbarrow",
    "fv_shop_decor_signpost": "fv_signpost",
    "fv_shop_decor_barrel": "fv_barrel_b",
    "fv_shop_decor_fence": "fv_fence",
    "fv_shop_decor_birdhouse": "fv_birdhouse_post",
    "fv_shop_decor_arch": "fv_flower_pot",  # (the world file named "flower_pot" IS the blossom arch)
    "fv_shop_plant_berrybush": "fv_hedge",
    "fv_shop_plant_lily": "fv_flower_bush_b",
    "fv_shop_plant_thicket": "fv_flower_arch",  # (and "flower_arch" is the glowing thicket)
    "fv_shop_plant_crystalbloom": "fv_flower_cluster_a",
    "fv_shop_plant_hedge": "fv_flower_cluster_b",
    "fv_shop_plant_petalbush": "fv_flower_cluster_c",
}

# (source jpeg, shop texture key, mode) — mode: "crop" (world item), "canvas" (pet, keep size), "glow" (pet with halo)
MATTE = [
    ("buildings/Gemini_Generated_Image_q3e677q3e677q3e6.jpeg", "fv_shop_cabin_small", "crop"),
    ("Decorations/Gemini_Generated_Image_1ckb5s1ckb5s1ckb.jpeg", "fv_shop_decor_barrel_bloom", "crop"),
    ("Plants/Gemini_Generated_Image_y840jgy840jgy840.jpeg", "fv_shop_plant_powderbush", "crop"),
    ("PET ACCESSORIES/Gemini_Generated_Image_bvsqsdbvsqsdbvsq.jpeg", "fv_shop_pet_bow_pink", "canvas"),
    ("PET ACCESSORIES/Gemini_Generated_Image_mzo9mcmzo9mcmzo9.jpeg", "fv_shop_pet_tiara", "canvas"),
    ("PET ACCESSORIES/Gemini_Generated_Image_z99lbgz99lbgz99l.jpeg", "fv_shop_pet_clip_snowflake", "canvas"),
    ("PET ACCESSORIES/Gemini_Generated_Image_2784692784692784.jpeg", "fv_shop_pet_tiara_blossom", "canvas"),
    ("PET ACCESSORIES/Gemini_Generated_Image_xjlp4gxjlp4gxjlp.jpeg", "fv_shop_pet_tiara_aqua", "canvas"),
    ("PET ACCESSORIES/Gemini_Generated_Image_q0snocq0snocq0sn.jpeg", "fv_shop_pet_tiara_violet", "glow"),
    ("PET ACCESSORIES/Gemini_Generated_Image_2q4f732q4f732q4f.jpeg", "fv_shop_pet_wreath_violet", "glow"),
    ("PET ACCESSORIES/Gemini_Generated_Image_l2xygwl2xygwl2xy.jpeg", "fv_shop_pet_bow_starlight", "glow"),
]


def checker_model(rgb):
    """Reconstruct the baked checkerboard: per-pixel expected background (H, W) in gray levels."""
    g = rgb.mean(axis=2)
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    H, W = g.shape
    b = 14
    border = np.concatenate([g[:b].ravel(), g[-b:].ravel(), g[:, :b].ravel(), g[:, -b:].ravel()])
    bchroma = np.concatenate([chroma[:b].ravel(), chroma[-b:].ravel(), chroma[:, :b].ravel(), chroma[:, -b:].ravel()])
    vals = border[bchroma < 12]
    lo, hi = np.percentile(vals, 5), np.percentile(vals, 95)
    for _ in range(12):  # 2-means
        mid = (lo + hi) / 2
        lo_n, hi_n = vals[vals <= mid].mean() if (vals <= mid).any() else lo, vals[vals > mid].mean() if (vals > mid).any() else hi
        if abs(lo_n - lo) < 0.1 and abs(hi_n - hi) < 0.1:
            break
        lo, hi = lo_n, hi_n
    if hi - lo < 8:  # effectively a flat backdrop
        return np.full((H, W), (lo + hi) / 2), (lo, hi, 0)

    def runs(line):
        cls = line > (lo + hi) / 2
        edges = np.flatnonzero(np.diff(cls.astype(np.int8)) != 0)
        return cls, edges

    # square size = median run length along the top and left border lines
    lens = []
    for line in (g[3], g[H - 4], g[:, 3], g[:, W - 4]):
        _, e = runs(line)
        if len(e) > 3:
            lens.extend(np.diff(e).tolist())
    s = int(round(np.median(lens))) if lens else 32
    # phase: which offsets make the model best match the border (scored on border pixels only)
    mask = np.zeros((H, W), bool)
    mask[:b], mask[-b:], mask[:, :b], mask[:, -b:] = True, True, True, True
    mask &= chroma < 12
    by_, bx_ = np.nonzero(mask)
    gv = g[mask]
    best, best_err = (0, 0, 0), 1e18
    for ox in range(s):
        for oy in range(s):
            par = (((bx_ + ox) // s) + ((by_ + oy) // s)) % 2
            for flip in (0, 1):
                err = np.abs(np.where(par == flip, lo, hi) - gv).mean()
                if err < best_err:
                    best_err, best = err, (ox, oy, flip)
    ox, oy, flip = best
    yy, xx = np.mgrid[0:H, 0:W]
    par = (((xx + ox) // s) + ((yy + oy) // s)) % 2
    return np.where(par == flip, lo, hi).astype(np.float32), (lo, hi, s)


def matte(rgb, mode):
    rgb = rgb.astype(np.float32)
    bg, (lo, hi, s) = checker_model(rgb)
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    lum = rgb.mean(axis=2)
    # distance to the predicted checker (and to either level, which tolerates JPEG blur at square seams)
    d_pred = np.abs(rgb - bg[..., None]).max(axis=2)
    d_any = np.minimum(np.abs(rgb - lo).max(axis=2), np.abs(rgb - hi).max(axis=2))
    d = np.minimum(d_pred, d_any + 3)

    bg_like = (d < 16) & (chroma < 14)
    # soft gray drop shadows cast onto the checker — the world art has none; remove them too
    shadow = (chroma < 14) & (lum < bg - 5) & (lum > bg * 0.45)
    cand = bg_like | shadow
    if mode == "glow":
        cand |= d < 70  # faint coloured halo over the checker: keep it, but as partial alpha (below)

    lab, _ = ndimage.label(cand)
    edge_labels = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    edge_labels = edge_labels[edge_labels != 0]
    region = np.isin(lab, edge_labels)  # background = only what's connected to the border

    fg = ~region
    # drop tiny specks (JPEG noise islands out in the background)
    flab, n = ndimage.label(fg)
    if n:
        sizes = ndimage.sum(fg, flab, range(1, n + 1))
        fg &= np.isin(flab, np.flatnonzero(sizes >= 400) + 1)

    alpha = fg.astype(np.float32)
    # anti-aliased rim: the 2px band of background next to the art gets partial alpha
    near = ndimage.binary_dilation(fg, iterations=2) & ~fg
    alpha[near] = np.clip((d[near] - 8) / 40, 0, 1)
    if mode == "glow":
        halo = region & (d < 70) & ~near
        alpha[halo] = np.clip((d[halo] - 12) / 58, 0, 1) ** 1.2
    # a touch of smoothing on the very edge only
    soft = ndimage.gaussian_filter(alpha, 0.6)
    edge = ndimage.binary_dilation(fg, iterations=1) ^ ndimage.binary_erosion(fg, iterations=1)
    alpha[edge] = np.minimum(alpha[edge], soft[edge]) if mode != "glow" else soft[edge]

    # un-blend the checker out of partially transparent pixels: P = a*F + (1-a)*B
    a3 = alpha[..., None]
    with np.errstate(divide="ignore", invalid="ignore"):
        F = (rgb - (1 - a3) * bg[..., None]) / np.maximum(a3, 1e-3)
    out_rgb = np.where(a3 > 0.999, rgb, np.clip(F, 0, 255))
    out = np.dstack([out_rgb, alpha * 255]).round().clip(0, 255).astype(np.uint8)
    return out, (lo, hi, s)


def crop_to_content(img):
    a = np.asarray(img)[..., 3]
    ys, xs = np.nonzero(a > 8)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    W, H = img.size
    return img.crop((max(0, x0 - MARGIN), max(0, y0 - MARGIN), min(W, x1 + MARGIN), min(H, y1 + MARGIN)))


def main():
    os.makedirs(DST, exist_ok=True)
    for key, world in COPY_FROM_WORLD.items():
        shutil.copyfile(os.path.join(WORLD, f"{world}.png"), os.path.join(DST, f"{key}.png"))
        print(f"copy   {key:32s} <- {world}.png")
    for src, key, mode in MATTE:
        rgb = np.asarray(Image.open(os.path.join(SRC, src)).convert("RGB"))
        out, model = matte(rgb, mode)
        img = Image.fromarray(out, "RGBA")
        if mode == "crop":
            img = crop_to_content(img)
        img.save(os.path.join(DST, f"{key}.png"), optimize=True)
        print(f"matte  {key:32s} {img.size} checker lo/hi/square={tuple(round(float(v)) for v in model)}")


if __name__ == "__main__":
    main()
