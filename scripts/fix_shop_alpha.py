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
# checkerboard (2048px canvas, 50×50 cells alternating 0 and 60 gray). The
# glow tints the checker squares so they fail is_bg_candidate and survive as
# a visible tinted checkerboard ring. Instead, reconstruct the checker color
# expected at each pixel and difference-matte against it: the glow (additive
# light over the placeholder) becomes real semi-transparent color.
CHECKER_CELL = 2048 / 50
CHECKER_DARK, CHECKER_LIGHT = 0, 60
GLOW_SOLID = 70  # channel difference from the checker at which a pixel is fully opaque art
GLOW_FLOOR = 10  # below this it is just JPEG noise over the checker
GLOW_POCKET_THRESHOLD = 3000  # enclosed low-difference regions this big (e.g. a wreath's hole) are background too


def fix_alpha_glow(img: Image.Image):
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    cell = CHECKER_CELL * w / 2048

    def expected_bg(x, y):
        cx, cy = x / cell, y / cell
        v = CHECKER_LIGHT if (int(cx) + int(cy)) % 2 else CHECKER_DARK
        # within JPEG ringing distance of a cell edge either shade is plausible
        near_edge = min(cx % 1, 1 - cx % 1, cy % 1, 1 - cy % 1) * cell < 2.5
        return v, near_edge

    diff = [0] * (w * h)
    bgv = [0] * (w * h)
    for y in range(h):
        for x in range(w):
            r, g, b, _ = px[x, y]
            v, near_edge = expected_bg(x, y)
            d = max(abs(r - v), abs(g - v), abs(b - v))
            if near_edge:
                alt = CHECKER_LIGHT + CHECKER_DARK - v
                d_alt = max(abs(r - alt), abs(g - alt), abs(b - alt))
                if d_alt < d:
                    d, v = d_alt, alt
            diff[y * w + x] = d
            bgv[y * w + x] = v

    # region = everything reachable from the border (or a big enclosed pocket)
    # through pixels that are not yet solid art
    in_region = bytearray(w * h)
    visited = bytearray(w * h)

    def flood(seeds):
        comp = []
        q = deque(seeds)
        while q:
            x, y = q.popleft()
            comp.append(y * w + x)
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h:
                    ni = ny * w + nx
                    if not visited[ni] and diff[ni] < GLOW_SOLID:
                        visited[ni] = 1
                        q.append((nx, ny))
        return comp

    border = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    seeds = []
    for x, y in border:
        i = y * w + x
        if not visited[i] and diff[i] < GLOW_SOLID:
            visited[i] = 1
            seeds.append((x, y))
    for i in flood(seeds):
        in_region[i] = 1
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if visited[i] or diff[i] >= GLOW_SOLID:
                continue
            visited[i] = 1
            comp = flood([(x, y)])
            if len(comp) >= GLOW_POCKET_THRESHOLD:
                for j in comp:
                    in_region[j] = 1

    count = 0
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if not in_region[i]:
                continue
            d = diff[i]
            a = 0.0 if d <= GLOW_FLOOR else min(1.0, (d - GLOW_FLOOR) / (GLOW_SOLID - GLOW_FLOOR))
            if a <= 0:
                px[x, y] = (0, 0, 0, 0)
                count += 1
                continue
            v = bgv[i]
            r, g, b, _ = px[x, y]
            # un-composite: pixel = art*a + bg*(1-a)  =>  art = (pixel - bg*(1-a)) / a
            un = lambda c: max(0, min(255, round((c - v * (1 - a)) / a)))
            px[x, y] = (un(r), un(g), un(b), round(a * 255))
    return img, count


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
