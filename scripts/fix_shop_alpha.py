"""
One-off asset fix: every Frosted Valley Shop source image (the building plus
all 27 catalog items) was exported as an opaque JPEG/PNG with a literal
checkerboard (or solid dark) placeholder baked in where real transparency
should be, instead of a true alpha channel. This detects that placeholder —
generically, as any near-grayscale pixel connected to the image border, plus
any sizable enclosed grayscale pocket the border flood-fill can't reach on
its own — and makes it transparent, then saves a proper PNG.

Run once from the repo root:
  "<python3.8>" scripts/fix_shop_alpha.py
"""

import os
from collections import deque
from PIL import Image

SRC_ROOT = "Game_Assets_frozen_world_Compressed/shop"
DST_ROOT = "public/assets/frosted/shop"
ENCLOSED_POCKET_THRESHOLD = 12

JOBS = [
    ("shop_world.png", "fv_shop_world.png"),
    ("buildings/Gemini_Generated_Image_5vtcg95vtcg95vtc.jpeg", "fv_shop_cottage_snow.png"),
    ("buildings/Gemini_Generated_Image_dq78o2dq78o2dq78.jpeg", "fv_shop_cottage_stone.png"),
    ("buildings/Gemini_Generated_Image_nzhsumnzhsumnzhs.jpeg", "fv_shop_gazebo.png"),
    ("buildings/Gemini_Generated_Image_q3e677q3e677q3e6.jpeg", "fv_shop_cabin_small.png"),
    ("PET ACCESSORIES/Gemini_Generated_Image_bvsqsdbvsqsdbvsq.jpeg", "fv_shop_pet_bow_pink.png"),
    ("PET ACCESSORIES/Gemini_Generated_Image_mzo9mcmzo9mcmzo9.jpeg", "fv_shop_pet_tiara.png"),
    ("PET ACCESSORIES/Gemini_Generated_Image_z99lbgz99lbgz99l.jpeg", "fv_shop_pet_clip_snowflake.png"),
    ("PET ACCESSORIES/Gemini_Generated_Image_2784692784692784.jpeg", "fv_shop_pet_tiara_blossom.png"),
    ("PET ACCESSORIES/Gemini_Generated_Image_xjlp4gxjlp4gxjlp.jpeg", "fv_shop_pet_tiara_aqua.png"),
    ("PET ACCESSORIES/Gemini_Generated_Image_q0snocq0snocq0sn.jpeg", "fv_shop_pet_tiara_violet.png", "glow"),
    ("PET ACCESSORIES/Gemini_Generated_Image_2q4f732q4f732q4f.jpeg", "fv_shop_pet_wreath_violet.png", "glow"),
    ("PET ACCESSORIES/Gemini_Generated_Image_l2xygwl2xygwl2xy.jpeg", "fv_shop_pet_bow_starlight.png", "glow"),
    ("Plants/Gemini_Generated_Image_90wqhh90wqhh90wq.jpeg", "fv_shop_plant_thicket.png"),
    ("Plants/Gemini_Generated_Image_bfp4ljbfp4ljbfp4.jpeg", "fv_shop_plant_lily.png"),
    ("Plants/Gemini_Generated_Image_lb6o5dlb6o5dlb6o.jpeg", "fv_shop_plant_berrybush.png"),
    ("Plants/Gemini_Generated_Image_m5hzf3m5hzf3m5hz.jpeg", "fv_shop_plant_crystalbloom.png"),
    ("Plants/Gemini_Generated_Image_ok54s0ok54s0ok54.jpeg", "fv_shop_plant_hedge.png"),
    ("Plants/Gemini_Generated_Image_t48ciwt48ciwt48c.jpeg", "fv_shop_plant_petalbush.png"),
    ("Plants/Gemini_Generated_Image_y840jgy840jgy840.jpeg", "fv_shop_plant_powderbush.png"),
    ("Decorations/Gemini_Generated_Image_1bxufo1bxufo1bxu.jpeg", "fv_shop_decor_fence.png"),
    ("Decorations/Gemini_Generated_Image_1ckb5s1ckb5s1ckb.jpeg", "fv_shop_decor_barrel_bloom.png"),
    ("Decorations/Gemini_Generated_Image_2hyi6s2hyi6s2hyi.jpeg", "fv_shop_decor_barrel.png"),
    ("Decorations/Gemini_Generated_Image_5b6vc05b6vc05b6v.jpeg", "fv_shop_decor_birdhouse.png"),
    ("Decorations/Gemini_Generated_Image_o5h84ro5h84ro5h8.jpeg", "fv_shop_decor_signpost.png"),
    ("Decorations/Gemini_Generated_Image_pqr9q1pqr9q1pqr9.jpeg", "fv_shop_decor_lamppost.png"),
    ("Decorations/Gemini_Generated_Image_srthussrthussrth.jpeg", "fv_shop_decor_wheelbarrow.png"),
    ("Decorations/Gemini_Generated_Image_t2toz5t2toz5t2to.jpeg", "fv_shop_decor_bench.png"),
    ("Plants/Gemini_Generated_Image_ds0k43ds0k43ds0k.jpeg", "fv_shop_decor_arch.png"),
]


def is_bg_candidate(r, g, b):
    mx, mn = max(r, g, b), min(r, g, b)
    return (mx - mn) <= 10  # near-grayscale, any brightness — checkerboard/black/white placeholders are all neutral


def fix_alpha(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    visited = bytearray(w * h)
    transparent = bytearray(w * h)

    def idx(x, y):
        return y * w + x

    # pass 1: flood fill from the border
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            i = idx(x, y)
            r, g, b, a = px[x, y]
            if is_bg_candidate(r, g, b) and not visited[i]:
                visited[i] = 1
                transparent[i] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            i = idx(x, y)
            r, g, b, a = px[x, y]
            if is_bg_candidate(r, g, b) and not visited[i]:
                visited[i] = 1
                transparent[i] = 1
                q.append((x, y))
    while q:
        x, y = q.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                ni = idx(nx, ny)
                if not visited[ni]:
                    r, g, b, a = px[nx, ny]
                    if is_bg_candidate(r, g, b):
                        visited[ni] = 1
                        transparent[ni] = 1
                        q.append((nx, ny))

    # pass 2: any remaining sizable enclosed grayscale pocket is also background
    for y in range(h):
        for x in range(w):
            i = idx(x, y)
            if visited[i]:
                continue
            r, g, b, a = px[x, y]
            if not is_bg_candidate(r, g, b):
                visited[i] = 1
                continue
            comp = [(x, y)]
            visited[i] = 1
            qi = deque([(x, y)])
            while qi:
                cx, cy = qi.popleft()
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < w and 0 <= ny < h:
                        ni = idx(nx, ny)
                        if not visited[ni]:
                            r2, g2, b2, a2 = px[nx, ny]
                            if is_bg_candidate(r2, g2, b2):
                                visited[ni] = 1
                                qi.append((nx, ny))
                                comp.append((nx, ny))
            if len(comp) >= ENCLOSED_POCKET_THRESHOLD:
                for (cx, cy) in comp:
                    transparent[idx(cx, cy)] = 1

    count = 0
    for y in range(h):
        for x in range(w):
            if transparent[idx(x, y)]:
                r, g, b, a = px[x, y]
                px[x, y] = (r, g, b, 0)
                count += 1
    return img, count


# "glow" jobs: art with a soft colored glow/sparkle halo painted over the fake
# checkerboard (2048px canvas, a 50×50 grid of dark/light gray cells whose
# exact shades vary per image and drift across it). The glow tints the
# checker squares so they fail is_bg_candidate, and fix_alpha keeps them as a
# visible tinted checkerboard ring. Per pixel, dim glow and dark art are
# indistinguishable — but spatially they differ: wherever the checker still
# shows through, neighboring light and dark cells stay apart in brightness,
# while over solid art that parity contrast averages out. So measure, per
# cell, how much of the checker's own light/dark contrast survives (that is
# how much background shows through), and un-composite only there.
CHECKER_CELLS = 50
HALO_OPAQUE = 0.9  # a cell showing less checker than this fraction of full contrast is left as fix_alpha had it


def estimate_checker(px, w, h):
    """Per-cell background gray: measured where the cell is clean, else borrowed from the nearest clean same-parity cells."""
    n = CHECKER_CELLS
    cw, ch = w / n, h / n
    val = [[None] * n for _ in range(n)]
    for j in range(n):
        for i in range(n):
            xs = range(int(i * cw) + 5, int((i + 1) * cw) - 5, 3)
            ys = range(int(j * ch) + 5, int((j + 1) * ch) - 5, 3)
            samples = [px[x, y] for y in ys for x in xs]
            spread = max(max(s[:3]) - min(s[:3]) for s in samples)
            lum = sorted(sum(s[:3]) / 3 for s in samples)
            if spread <= 12 and lum[-1] - lum[0] <= 16:
                val[j][i] = lum[len(lum) // 2]
    out = [[0.0] * n for _ in range(n)]
    for j in range(n):
        for i in range(n):
            if val[j][i] is not None:
                out[j][i] = val[j][i]
                continue
            # same-parity neighbors only (diagonals / two steps away), widening until found
            for rad in range(2, n, 2):
                picks = [val[jj][ii] for jj in range(max(0, j - rad), min(n, j + rad + 1))
                         for ii in range(max(0, i - rad), min(n, i + rad + 1))
                         if (ii + jj) % 2 == (i + j) % 2 and val[jj][ii] is not None]
                if picks:
                    out[j][i] = sum(picks) / len(picks)
                    break
    return out


def fix_alpha_glow(img: Image.Image):
    src = img.convert("RGB")
    spx = src.load()
    w, h = src.size
    out, count = fix_alpha(src)
    px = out.load()
    n = CHECKER_CELLS
    cw, ch = w / n, h / n
    bg = estimate_checker(spx, w, h)

    # mean brightness of each cell's interior (clear of JPEG edge ringing)
    mean = [[0.0] * n for _ in range(n)]
    for j in range(n):
        for i in range(n):
            xs = range(int(i * cw) + 4, int((i + 1) * cw) - 4, 2)
            ys = range(int(j * ch) + 4, int((j + 1) * ch) - 4, 2)
            s = [sum(spx[x, y]) / 3 for y in ys for x in xs]
            mean[j][i] = sum(s) / len(s)

    # background visibility per cell, from the 3×3 cell window around it:
    # (light-cell mean − dark-cell mean) / (light bg − dark bg)
    vis = [[0.0] * n for _ in range(n)]
    for j in range(n):
        for i in range(n):
            hi_m = hi_b = lo_m = lo_b = 0.0
            hi_n = lo_n = 0
            window = [(ii, jj) for jj in range(max(0, j - 1), min(n, j + 2)) for ii in range(max(0, i - 1), min(n, i + 2))]
            mid = (max(bg[jj][ii] for ii, jj in window) + min(bg[jj][ii] for ii, jj in window)) / 2
            for ii, jj in window:
                if bg[jj][ii] > mid:
                    hi_m += mean[jj][ii]; hi_b += bg[jj][ii]; hi_n += 1
                else:
                    lo_m += mean[jj][ii]; lo_b += bg[jj][ii]; lo_n += 1
            if not hi_n or not lo_n:
                continue
            span = hi_b / hi_n - lo_b / lo_n
            if span > 8:
                vis[j][i] = max(0.0, min(1.0, (hi_m / hi_n - lo_m / lo_n) / span))

    def vis_at(x, y):
        # bilinear between cell centers so the matte has no blocky seams
        fx = min(max(x / cw - 0.5, 0), n - 1.001)
        fy = min(max(y / ch - 0.5, 0), n - 1.001)
        i0, j0 = int(fx), int(fy)
        tx, ty = fx - i0, fy - j0
        top = vis[j0][i0] * (1 - tx) + vis[j0][i0 + 1] * tx
        bot = vis[j0 + 1][i0] * (1 - tx) + vis[j0 + 1][i0 + 1] * tx
        return top * (1 - ty) + bot * ty

    for y in range(h):
        for x in range(w):
            r, g, b, a0 = px[x, y]
            if a0 == 0:
                continue
            v = vis_at(x, y)
            a = 1 - v
            if a >= HALO_OPAQUE:
                continue
            if a <= 0.04:
                px[x, y] = (r, g, b, 0)
                count += 1
                continue
            B = bg[min(n - 1, int(y / ch))][min(n - 1, int(x / cw))]
            # un-composite: pixel = art*a + bg*(1-a)  =>  art = (pixel - bg*(1-a)) / a
            un = lambda c: max(0, min(255, round((c - B * (1 - a)) / a)))
            px[x, y] = (un(r), un(g), un(b), round(a * 255))
    return out, count


def main():
    os.makedirs(DST_ROOT, exist_ok=True)
    for src_rel, dst_name, *mode in JOBS:
        src_path = os.path.join(SRC_ROOT, src_rel)
        dst_path = os.path.join(DST_ROOT, dst_name)
        img = Image.open(src_path)
        fixed, transparent_count = (fix_alpha_glow if mode == ["glow"] else fix_alpha)(img)
        fixed.save(dst_path)
        print(f"{dst_name}: {fixed.size} -> {transparent_count} transparent px")


if __name__ == "__main__":
    main()
