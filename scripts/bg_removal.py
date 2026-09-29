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


# ---------------------------------------------------------------------------
# Residue pass (used by clean_asset_residue.py)
#
# remove_background() only flood-fills LOW-saturation pixels, so two kinds of
# fake-transparency survive it and showed up in the world as grey/checkered
# rectangles and triangles:
#   * checkerboard the generator TINTED (a warm vignette / drawn shadow laid
#     over the checker pushes it well past SAT_THRESH), and checker pockets
#     enclosed by the subject but too small / too tinted for the grid-matched
#     healing above;
#   * enclosed pockets of a flat white/grey studio backdrop (bench slats,
#     bridge rails, gaps in tree canopies) that a border-connected fill can't
#     reach.
# Checker detection is geometric rather than colour-based: fit the checker's
# (fractional) cell pitch and phase from the luminance edge profile, then a
# cell is checker only if it is flat inside AND all of its flat neighbours
# are uniformly brighter or uniformly darker than it with the same colour
# cast — a pattern real painted content essentially never has.
# ---------------------------------------------------------------------------


def _run_pitch(edges: np.ndarray) -> float | None:
    """Median distance between consecutive tone edges along each row of an
    edge map — the checker cell pitch, immune to the DFT's harmonic confusion."""
    runs = []
    for row in edges[:: max(1, edges.shape[0] // 400)]:
        xs = np.flatnonzero(row)
        if len(xs) > 2:
            d = np.diff(xs)
            runs.append(d[d > 6])
    runs = np.concatenate(runs) if runs else np.array([])
    return float(np.median(runs)) if len(runs) > 50 else None


def _fit_pitch(profile: np.ndarray, guess: float | None = None) -> tuple[float, float]:
    x = np.arange(len(profile))
    prof = profile - profile.mean()
    if guess:
        periods = np.arange(guess * 0.85, guess * 1.15, 0.02)
    else:
        periods = np.arange(10.0, 128.0, 0.02)
    mags = np.array([abs(np.dot(prof, np.exp(-2j * np.pi * x / p))) for p in periods])
    if guess:
        i = int(np.argmax(mags))
    else:
        # harmonics (P/2, P/3) peak too — the true cell pitch is the LARGEST
        # near-max period, refined to its local maximum
        i = int(np.where(mags >= 0.75 * mags.max())[0].max())
        lo = max(0, i - 60)
        i = lo + int(np.argmax(mags[lo:i + 1]))
    p = periods[i]
    ang = np.angle(np.dot(prof, np.exp(-2j * np.pi * x / p)))
    return p, (-ang * p / (2 * np.pi)) % p + 0.5


def checker_residue_mask(rgb: np.ndarray, known_bg: np.ndarray, tol: float = 16) -> np.ndarray:
    """Pixels of leftover (possibly tinted) checkerboard not in `known_bg`."""
    arr = rgb.astype(np.float32)
    lum = arr.mean(axis=2)
    h, w = lum.shape
    ex = np.abs(np.diff(lum, axis=1)) > 12
    ey = np.abs(np.diff(lum, axis=0)) > 12
    # pitch guess from edge spacing INSIDE the confirmed background only
    gx = _run_pitch(ex & known_bg[:, 1:] & known_bg[:, :-1])
    gy = _run_pitch((ey & known_bg[1:, :] & known_bg[:-1, :]).T)
    px, x0 = _fit_pitch(ex.sum(axis=0).astype(float), gx or gy)
    py, y0 = _fit_pitch(ey.sum(axis=1).astype(float), gy or gx)
    cx = np.floor((np.arange(w) - x0) / px).astype(int)
    cy = np.floor((np.arange(h) - y0) / py).astype(int)
    cx -= cx.min()
    cy -= cy.min()
    ncx, ncy = cx.max() + 1, cy.max() + 1
    CX, CY = np.meshgrid(cx, cy)
    lab = CY * ncx + CX
    n = ncy * ncx
    # cell statistics from inner pixels only (grid lines are antialiased)
    ix = ((np.arange(w) - x0) % px >= 2.5) & ((np.arange(w) - x0) % px <= px - 2.5)
    iy = ((np.arange(h) - y0) % py >= 2.5) & ((np.arange(h) - y0) % py <= py - 2.5)
    inner = iy[:, None] & ix[None, :]
    cnt = np.bincount(lab[inner], minlength=n).astype(np.float32)
    # per-cell mean + plane-detrended spread: a glow or drawn shadow over the
    # checker is a smooth gradient across a cell, which mustn't count as texture
    lx = ((np.arange(w) - x0) % px)[None, :].repeat(h, 0)[inner]
    ly = ((np.arange(h) - y0) % py)[:, None].repeat(w, 1)[inner]
    li = lab[inner]
    safe = np.maximum(cnt, 1)

    def cmean(v):
        return np.bincount(li, weights=v, minlength=n) / safe

    mx, my = cmean(lx), cmean(ly)
    vx = np.maximum(cmean(lx * lx) - mx * mx, 1e-3)
    vy = np.maximum(cmean(ly * ly) - my * my, 1e-3)
    means = np.zeros((n, 3), np.float32)
    resid = np.zeros((n, 3), np.float32)
    for c in range(3):
        v = arr[..., c][inner]
        m = cmean(v)
        var = cmean(v * v) - m * m
        cx_ = cmean(v * lx) - m * mx
        cy_ = cmean(v * ly) - m * my
        means[:, c] = m
        resid[:, c] = np.sqrt(np.maximum(var - cx_ * cx_ / vx - cy_ * cy_ / vy, 0))
    means = means.reshape(ncy, ncx, 3)
    uniform = (resid.reshape(ncy, ncx, 3).max(axis=2) < 6) & (cnt.reshape(ncy, ncx) >= 9)
    lc = means.mean(axis=2)
    chroma = means - lc[..., None]

    def shifted(a, dy, dx):
        return np.roll(np.roll(a, -dy, 0), -dx, 1)

    def in_bounds(dy, dx):
        v = np.ones((ncy, ncx), bool)
        if dy == 1: v[-1, :] = False
        if dy == -1: v[0, :] = False
        if dx == 1: v[:, -1] = False
        if dx == -1: v[:, 0] = False
        return v

    nbrs = ((0, 1), (1, 0), (0, -1), (-1, 0))
    pos = np.zeros((ncy, ncx), np.int32)
    neg = np.zeros((ncy, ncx), np.int32)
    flat = np.zeros((ncy, ncx), np.int32)
    for dy, dx in nbrs:
        valid = shifted(uniform, dy, dx) & in_bounds(dy, dx)
        d = lc - shifted(lc, dy, dx)
        same_cast = np.abs(chroma - shifted(chroma, dy, dx)).max(axis=2) < 20
        pos += valid & (d >= 7) & same_cast
        neg += valid & (d <= -7) & same_cast
        flat += valid & (np.abs(d) < 7)
    cell_bg = uniform & (np.maximum(pos, neg) >= 2) & (np.minimum(pos, neg) + flat == 0)

    kb = np.bincount(lab.ravel(), weights=known_bg.ravel().astype(np.float32), minlength=n)
    tot = np.bincount(lab.ravel(), minlength=n).astype(np.float32)
    known_cell = (kb / np.maximum(tot, 1)).reshape(ncy, ncx) > 0.5
    for _ in range(4):  # flat cells stranded between bg cells (tint/shadow transitions)
        b = cell_bg | known_cell
        around = sum(shifted(b, dy, dx) & in_bounds(dy, dx) for dy, dx in nbrs)
        cell_bg |= uniform & ~known_cell & (around >= 3)

    # drop isolated 1-2 cell hits unless they touch the image border or known bg
    clab, cn = ndimage.label(cell_bg)
    if cn:
        sizes = ndimage.sum(cell_bg, clab, range(1, cn + 1))
        touches = ndimage.maximum(ndimage.binary_dilation(known_cell) | _border(cell_bg.shape), clab, range(1, cn + 1))
        keep = np.concatenate([[False], (sizes >= 3) | (touches > 0)])
        cell_bg = keep[clab]

    # partial cells along the subject edge: per-pixel match against the
    # expected tone (mean of same-parity checker cells nearby)
    exp = np.zeros((ncy, ncx, 3), np.float32)
    wsum = np.zeros((ncy, ncx), np.float32)
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            if (dy + dx) % 2:
                continue
            sb = np.roll(np.roll(cell_bg | (known_cell & uniform), dy, 0), dx, 1)
            exp += np.roll(np.roll(means, dy, 0), dx, 1) * sb[..., None]
            wsum += sb
    exp /= np.maximum(wsum, 1)[..., None]
    # flat cells hemmed in by subject on most sides: one contrasting known-bg
    # neighbour plus a same-parity tone match (looser, glow/shadow tints it)
    edge_cells = uniform & ~known_cell & ~cell_bg & (flat == 0) & (np.maximum(pos, neg) >= 1)
    edge_cells &= sum(shifted(known_cell | cell_bg, dy, dx) & in_bounds(dy, dx) for dy, dx in nbrs) >= 1
    edge_cells &= (wsum > 0) & (np.abs(means - exp).max(axis=2) < 30)
    cell_bg = cell_bg | edge_cells
    pix_bg = cell_bg[CY, CX]
    diff = np.abs(arr - exp[CY, CX]).max(axis=2)
    cand = ndimage.binary_dilation(pix_bg) | ((wsum > 0)[CY, CX] & (diff < tol)) | known_bg
    plab, _ = ndimage.label(cand)
    ids = np.unique(plab[pix_bg | known_bg])
    out = np.isin(plab, ids[ids > 0]) & ~known_bg
    # a pocket fully enclosed by the subject must still LOOK like checker:
    # real ones are grey or only lightly tinted; saturated flat paint (a
    # smooth log/cap surface) that happened to pass the cell test is kept
    olab, on = ndimage.label(out)
    if on:
        near_known = ndimage.binary_dilation(known_bg, iterations=6)
        touches = ndimage.maximum(near_known, olab, range(1, on + 1)) > 0
        sat = arr.max(axis=2) - arr.min(axis=2)
        msat = ndimage.mean(sat, olab, range(1, on + 1))
        sizes = ndimage.sum(out, olab, range(1, on + 1))
        # enclosed pockets must span several whole cells — dark subject
        # shadow can pass the cell test in isolated specks, real checker
        # pockets never are that small
        keep = np.concatenate([[False], touches | ((msat < 60) & (sizes >= 3 * px * py))])
        out = keep[olab]
    return out


def _border(shape) -> np.ndarray:
    b = np.zeros(shape, bool)
    b[0, :] = b[-1, :] = b[:, 0] = b[:, -1] = True
    return b


def alternation_pocket_mask(rgb: np.ndarray, bg: np.ndarray, px: float, py: float) -> np.ndarray:
    """Tone-free checker test for pockets enclosed by the subject: a flat pixel
    whose neighbours one cell away on BOTH axes are equal to each other and
    differ from it (same sign both sides), while its diagonal neighbour
    (same checker parity) matches it."""
    lum = rgb.astype(np.float32).mean(axis=2)
    h, w = lum.shape
    X, Y = max(4, int(round(px))), max(4, int(round(py)))

    def at(dy, dx):
        out = np.full_like(lum, np.nan)
        ys = slice(max(dy, 0), h + min(dy, 0)); yd = slice(max(-dy, 0), h + min(-dy, 0))
        xs = slice(max(dx, 0), w + min(dx, 0)); xd = slice(max(-dx, 0), w + min(-dx, 0))
        out[yd, xd] = lum[ys, xs]
        return out

    m = ndimage.uniform_filter(lum, 5)
    flat = np.sqrt(np.maximum(ndimage.uniform_filter(lum * lum, 5) - m * m, 0)) < 4.5
    with np.errstate(invalid="ignore"):
        ok = np.zeros_like(flat)
        for dp in (-1, 0, 1):  # fractional pitch: accept the nearest whole offsets
            x_, y_ = X + dp, Y + dp
            nb = [at(0, x_), at(0, -x_), at(y_, 0), at(-y_, 0)]
            for sgn in (1, -1):
                # >=3 of the 4 one-cell neighbours on the other tone (a vine or
                # stem may cut one side of a narrow pocket)...
                votes = sum(((lum - v) * sgn > 8) for v in nb)
                other = np.nanmedian(np.stack(nb), axis=0)
                agree = sum((np.abs(v - other) < 8) for v in nb)
                # ...and at least one diagonal neighbour on the SAME tone
                diag = np.nanmin(np.stack([np.abs(lum - at(dy * y_, dx * x_)) for dy in (-1, 1) for dx in (-1, 1)]), axis=0)
                ok |= flat & (votes >= 3) & (agree >= 3) & (diag < 8)
    ok &= ~bg
    ok = ndimage.binary_closing(ok, iterations=3) & ~bg
    lab, n = ndimage.label(ok)
    if not n:
        return ok
    sizes = ndimage.sum(ok, lab, range(1, n + 1))
    keep = np.concatenate([[False], sizes >= 2 * X * Y])
    return keep[lab]


def backdrop_pocket_mask(rgb: np.ndarray, known_bg: np.ndarray, min_px: int = 150) -> np.ndarray:
    """Enclosed pockets of the flat studio backdrop (white/grey) — same tone
    as the border background, flat, and big enough not to be a highlight."""
    arr = rgb.astype(np.float32)
    if known_bg.sum() < 1000:
        return np.zeros(known_bg.shape, bool)
    tone = np.median(arr[known_bg], axis=0)
    sat = arr.max(axis=2) - arr.min(axis=2)
    cand = ~known_bg & (np.abs(arr - tone).max(axis=2) < 12) & (sat < 12)
    lab, n = ndimage.label(cand)
    if not n:
        return np.zeros(known_bg.shape, bool)
    sizes = ndimage.sum(cand, lab, range(1, n + 1))
    lum = arr.mean(axis=2)
    sd = np.sqrt(np.maximum(ndimage.mean(lum * lum, lab, range(1, n + 1)) - np.square(ndimage.mean(lum, lab, range(1, n + 1))), 0))
    keep = np.concatenate([[False], (sizes >= min_px) & (sd < 4)])
    return keep[lab]


def residue_cleanup(im: Image.Image) -> tuple[Image.Image, Image.Image, int]:
    """Returns (plain remove_background() result, residue kill-mask, px removed).
    The kill-mask is an "L" image at source resolution: 255 where leftover
    background must become transparent (feathered like the normal alpha)."""
    old = remove_background(im)
    rgb = np.asarray(im.convert("RGB")).astype(np.int16)
    known = np.asarray(old)[..., 3] < 128
    extra = checker_residue_mask(rgb, known) | backdrop_pocket_mask(rgb, known)
    lum = rgb.mean(axis=2)
    ex = np.abs(np.diff(lum, axis=1)) > 12
    ey = np.abs(np.diff(lum, axis=0)) > 12
    gx = _run_pitch(ex & known[:, 1:] & known[:, :-1])
    gy = _run_pitch((ey & known[1:, :] & known[:-1, :]).T)
    if gx or gy:
        # run lengths under-read the pitch by the antialiased edge; refine with the DFT
        px, _ = _fit_pitch(ex.sum(axis=0).astype(float), gx or gy)
        py, _ = _fit_pitch(ey.sum(axis=1).astype(float), gy or gx)
        extra |= alternation_pocket_mask(rgb, known | extra, px, py)
    if extra.any():
        # close the 1-3px grid-line/feather seams left between the old and new
        # background, but only right next to newly removed residue
        closed = ndimage.binary_closing(known | extra, iterations=2)
        extra |= closed & ndimage.binary_dilation(extra, iterations=4) & ~known
    kill = Image.fromarray(np.where(extra, 255, 0).astype(np.uint8), mode="L").filter(ImageFilter.GaussianBlur(FEATHER))
    return old, kill, int(extra.sum())


def trim_box(im: Image.Image, pad: int = 6):
    """The exact crop box trim() would use — lets a re-clean keep an asset's
    existing canvas (and therefore its in-world scale/anchor) unchanged."""
    bbox = im.getchannel("A").point(lambda p: 255 if p > 8 else 0).getbbox()
    if not bbox:
        return (0, 0, im.width, im.height)
    l, t, r, b = bbox
    return (max(0, l - pad), max(0, t - pad), min(im.width, r + pad), min(im.height, b + pad))
