"""Shared background-removal core for process_dg_assets.py and
process_resource_assets.py.

The supplied art sits on a baked-in PICTURE of a transparency checkerboard
(not real alpha). Plain border-connected low-saturation flood fill removes
the true OUTER background correctly, but leaves two kinds of defects on
assets where the subject has gaps in it (tree canopies, root hollows, spiky
fur): checker pockets fully ENCLOSED by the subject (unreachable by a
border-connected fill) and, worse, real dark/desaturated subject pixels
(bark shadow, fur shadow) that happen to be low-saturation too and would be
wrongly punched into holes by a naive "remove all low-saturation" pass.

The fix: fit the checkerboard's exact tile period and phase from the
CONFIRMED border-background pixels, then only treat an un-reached pixel as
leftover checker if it is both near-neutral-grey (real shadow always has a
color cast; checker doesn't) AND matches the fitted grid's predicted tone
for its exact cell, in a run of at least 6 connected pixels. Matches get
their COLOR healed via cv2 inpainting (not made transparent) so a false
positive can only ever locally blur a small patch of subject color -- it
can never punch a hole in real content. See the accessory/acorn-tree bug
writeup for how this was discovered."""
import numpy as np
import cv2
from PIL import Image, ImageFilter
from scipy import ndimage

SAT_THRESH = 26
FEATHER = 1.6


def remove_background(im: Image.Image) -> Image.Image:
    im = im.convert("RGB")
    arr = np.asarray(im).astype(np.int16)
    maxc = arr.max(axis=2)
    minc = arr.min(axis=2)
    sat = maxc - minc
    gray = arr.mean(axis=2)
    bgish = sat < SAT_THRESH

    labels, n = ndimage.label(bgish, structure=np.ones((3, 3)))
    h, w = bgish.shape
    border_labels = set(labels[0, :]) | set(labels[-1, :]) | set(labels[:, 0]) | set(labels[:, -1])
    border_labels.discard(0)
    border_mask = np.isin(labels, list(border_labels)) if border_labels else np.zeros_like(bgish)

    interior_mask = np.zeros_like(bgish)
    if border_mask.sum() > 5000:
        row_bg_frac = border_mask.mean(axis=1)
        best_row = int(np.argmax(row_bg_frac[: max(1, h // 4)]))
        row = arr[best_row, :, 0].astype(float)
        rowmask = border_mask[best_row]
        period = 48
        if rowmask.sum() > w * 0.5:
            rowc = row - row.mean()
            ac = np.correlate(rowc, rowc, mode="full")[len(rowc) - 1:]
            search = ac[10:80]
            period = int(np.argmax(search) + 10)

        bg_gray = gray[border_mask]
        med = np.median(bg_gray)
        dark_tone = bg_gray[bg_gray <= med].mean() if (bg_gray <= med).any() else med
        light_tone = bg_gray[bg_gray > med].mean() if (bg_gray > med).any() else med

        # Phase-fit against a random SUBSET of confirmed-background pixels
        # (capped at ~20k) instead of all of them -- statistically identical
        # confidence for a binary grid-parity fit, but avoids the brute-force
        # search doing multi-million-element boolean indexing per candidate
        # phase at full source resolution (was ~90s/image; this is ~2s).
        yy, xx = np.mgrid[0:h, 0:w]
        bx_full, by_full = xx[border_mask], yy[border_mask]
        if len(bx_full) > 20000:
            rng = np.random.default_rng(0)
            sel = rng.choice(len(bx_full), 20000, replace=False)
            bx, by, bg_gray_s = bx_full[sel], by_full[sel], bg_gray[sel]
        else:
            bx, by, bg_gray_s = bx_full, by_full, bg_gray

        best_score, best_phase = -1, (0, 0)
        step = max(1, period // 8)
        for px in range(0, period, step):
            for py in range(0, period, step):
                parity = (((bx + px) // period) + ((by + py) // period)) % 2
                predicted = np.where(parity == 0, light_tone, dark_tone)
                score = (np.abs(bg_gray_s - predicted) < 10).sum()
                if score > best_score:
                    best_score, best_phase = score, (px, py)
        px, py = best_phase
        for dpx in range(-step, step + 1):
            for dpy in range(-step, step + 1):
                tpx, tpy = (px + dpx) % period, (py + dpy) % period
                parity = (((bx + tpx) // period) + ((by + tpy) // period)) % 2
                predicted = np.where(parity == 0, light_tone, dark_tone)
                score = (np.abs(bg_gray_s - predicted) < 10).sum()
                if score > best_score:
                    best_score, best_phase = score, (tpx, tpy)
        px, py = best_phase

        parity_full = (((xx + px) // period) + ((yy + py) // period)) % 2
        predicted_full = np.where(parity_full == 0, light_tone, dark_tone)

        candidate = (~border_mask) & (sat < 14) & (np.abs(gray - predicted_full) < 14)

        clabels, cn = ndimage.label(candidate, structure=np.ones((3, 3)))
        if cn > 0:
            sizes = ndimage.sum(candidate, clabels, range(1, cn + 1))
            keep_ids = [i + 1 for i, s in enumerate(sizes) if s >= 6]
            interior_mask = np.isin(clabels, keep_ids)

    rgb = np.asarray(im).astype(np.uint8).copy()
    if interior_mask.any():
        inpaint_mask = cv2.dilate((interior_mask * 255).astype(np.uint8), np.ones((3, 3), np.uint8), iterations=1)
        bgr = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        healed = cv2.inpaint(bgr, inpaint_mask, 5, cv2.INPAINT_TELEA)
        rgb = cv2.cvtColor(healed, cv2.COLOR_BGR2RGB)

    alpha = np.where(border_mask, 0, 255).astype(np.uint8)
    a_img = Image.fromarray(alpha, mode="L").filter(ImageFilter.GaussianBlur(FEATHER))
    out = Image.fromarray(rgb, mode="RGB").convert("RGBA")
    out.putalpha(a_img)
    return out


def trim(im: Image.Image, pad: int = 6) -> Image.Image:
    bbox = im.getchannel("A").point(lambda p: 255 if p > 8 else 0).getbbox()
    if not bbox:
        return im
    l, t, r, b = bbox
    l = max(0, l - pad)
    t = max(0, t - pad)
    r = min(im.width, r + pad)
    b = min(im.height, b + pad)
    return im.crop((l, t, r, b))


def downscale(im: Image.Image, max_side: int) -> Image.Image:
    longest = max(im.width, im.height)
    if longest <= max_side:
        return im
    ratio = max_side / longest
    return im.resize((max(1, round(im.width * ratio)), max(1, round(im.height * ratio))), Image.LANCZOS)
