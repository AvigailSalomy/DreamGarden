/**
 * Organic jigsaw cut for the Frosted Valley reward puzzles. Phaser-free so it
 * can be unit tested.
 *
 * Unlike the Garden's `jigsaw.ts` (one identical symmetric knob on every seam),
 * every INTERNAL seam here gets its own knob: its own position along the edge,
 * size, head width/height, neck skew and shoulder wobble, all drawn from a
 * seeded RNG. The lattice corners where four pieces meet are nudged off the
 * grid too, so pieces are irregular quads rather than identical rectangles.
 * `irregularity` (0..1) scales all of that — early puzzles cut clean, friendly
 * shapes; later ones wander further.
 *
 * Every seam is stored ONCE, in board coordinates, as a chain of three cubic
 * Béziers. The two pieces that share it both trace those exact points (one of
 * them in reverse), so neighbours always interlock perfectly — a tab on one is
 * the matching socket on the other by construction.
 */
import { mulberry32 } from "../core/rng";

export interface Pt {
  x: number;
  y: number;
}

/** -1 = socket (knob points into this piece), 0 = flat border, +1 = tab (knob points out). */
export type OrganicEdge = -1 | 0 | 1;

export interface OrganicPiece {
  index: number;
  col: number;
  row: number;
  /** Edge kinds as seen from this piece (for variety checks / debug). */
  edges: { top: OrganicEdge; right: OrganicEdge; bottom: OrganicEdge; left: OrganicEdge };
  /**
   * Each edge's points in clockwise traversal order, board coordinates. A flat
   * edge is `[start, end]`; a knobbed edge is `[P0, C, C, P, C, C, P, C, C, P9]`
   * (three cubic segments).
   */
  edgePoints: { top: Pt[]; right: Pt[]; bottom: Pt[]; left: Pt[] };
  /** SVG path (M/L/C/Z) of the whole outline, board coordinates. */
  path: string;
  /** Flattened outline, board coordinates — for strokes/highlights. */
  outline: Pt[];
  /** Conservative bounding box (includes Bézier control points), board coordinates. */
  bounds: { x: number; y: number; w: number; h: number };
}

export interface OrganicCut {
  cols: number;
  rows: number;
  width: number;
  height: number;
  pieces: OrganicPiece[];
}

type Seam = { pts: Pt[] } | null; // null = flat border

/**
 * Cut a `width × height` board into `cols × rows` interlocking pieces.
 * Deterministic for a given seed.
 */
export function cutOrganicJigsaw(
  cols: number,
  rows: number,
  width: number,
  height: number,
  seed: number,
  irregularity: number,
): OrganicCut {
  const rng = mulberry32(seed >>> 0);
  const irr = Math.max(0, Math.min(1, irregularity));
  const cw = width / cols;
  const ch = height / rows;
  const K = Math.min(cw, ch); // knob scale — same on horizontal & vertical seams
  const jig = (amp: number) => (rng() - 0.5) * 2 * amp; // uniform in [-amp, amp]

  // ---- lattice: interior corners wander; border corners slide only along the border
  const cornerJitter = 0.03 + 0.07 * irr;
  const L: Pt[][] = [];
  for (let r = 0; r <= rows; r++) {
    L[r] = [];
    for (let c = 0; c <= cols; c++) {
      const onLR = c === 0 || c === cols;
      const onTB = r === 0 || r === rows;
      L[r][c] = {
        x: c * cw + (onLR ? 0 : jig(cornerJitter * cw)),
        y: r * ch + (onTB ? 0 : jig(cornerJitter * ch)),
      };
    }
  }

  /**
   * One knobbed seam from `s` to `e`. `n` is the seam's canonical normal
   * (down for horizontal seams, right for vertical ones); `sign` says which
   * side the knob bulges toward. Shape after draradech's classic jigsaw
   * curve, with every parameter individually jittered.
   */
  const knobSeam = (s: Pt, e: Pt, n: Pt, sign: 1 | -1): Pt[] => {
    const dx = e.x - s.x;
    const dy = e.y - s.y;
    const len = Math.hypot(dx, dy);
    const u = { x: dx / len, y: dy / len };
    const v = { x: n.x * sign, y: n.y * sign };
    const at = (along: number, perp: number): Pt => ({
      x: s.x + u.x * along + v.x * perp,
      y: s.y + u.y * along + v.y * perp,
    });

    const t = K * (0.088 + 0.018 * rng() + 0.02 * irr * rng()); // knob size
    const mid = len * (0.5 + jig(0.03 + 0.1 * irr)); // knob position along the edge
    const c = K * jig(0.012 + 0.03 * irr); // knob base offset (perp)
    const d = K * jig(0.015 + 0.05 * irr); // neck skew
    const wl = 1 + jig(0.08 + 0.22 * irr); // head width, left half
    const wr = 1 + jig(0.08 + 0.22 * irr); // head width, right half
    const hl = K * jig(0.01 + 0.03 * irr); // head height, left
    const hr = K * jig(0.01 + 0.03 * irr); // head height, right
    const a = K * jig(0.01 + 0.035 * irr); // shoulder wobble, first
    const b = K * jig(0.01 + 0.035 * irr); // shoulder wobble, last

    return [
      at(0, 0),
      at(len * 0.2, a),
      at(mid + d, -t + c),
      at(mid - t, t + c),
      at(mid - 2 * t * wl - d, 3 * t + c + hl),
      at(mid + 2 * t * wr - d, 3 * t + c + hr),
      at(mid + t, t + c),
      at(mid + d, -t + c),
      at(len * 0.8, b),
      at(len, 0),
    ];
  };

  // H[r][c]: seam along the TOP of row r (between rows r-1 and r), c in [0, cols)
  const H: Seam[][] = [];
  const Hsign: number[][] = [];
  for (let r = 0; r <= rows; r++) {
    H[r] = [];
    Hsign[r] = [];
    for (let c = 0; c < cols; c++) {
      if (r === 0 || r === rows) {
        H[r][c] = null;
        Hsign[r][c] = 0;
        continue;
      }
      const sign = rng() < 0.5 ? 1 : -1;
      H[r][c] = { pts: knobSeam(L[r][c], L[r][c + 1], { x: 0, y: 1 }, sign) };
      Hsign[r][c] = sign;
    }
  }
  // V[r][c]: seam along the LEFT of column c (between cols c-1 and c), r in [0, rows)
  const V: Seam[][] = [];
  const Vsign: number[][] = [];
  for (let r = 0; r < rows; r++) {
    V[r] = [];
    Vsign[r] = [];
    for (let c = 0; c <= cols; c++) {
      if (c === 0 || c === cols) {
        V[r][c] = null;
        Vsign[r][c] = 0;
        continue;
      }
      const sign = rng() < 0.5 ? 1 : -1;
      V[r][c] = { pts: knobSeam(L[r][c], L[r + 1][c], { x: 1, y: 0 }, sign) };
      Vsign[r][c] = sign;
    }
  }

  const pieces: OrganicPiece[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const tl = L[r][c];
      const tr = L[r][c + 1];
      const br = L[r + 1][c + 1];
      const bl = L[r + 1][c];

      const top = H[r][c] ? H[r][c]!.pts.slice() : [tl, tr];
      const right = V[r][c + 1] ? V[r][c + 1]!.pts.slice() : [tr, br];
      const bottom = H[r + 1][c] ? H[r + 1][c]!.pts.slice().reverse() : [br, bl];
      const left = V[r][c] ? V[r][c]!.pts.slice().reverse() : [bl, tl];

      // canonical +sign bulges down/right: INTO this piece on its top/left
      // edges (a socket here), OUT of it on its bottom/right edges (a tab)
      const edges = {
        top: (-Hsign[r][c] || 0) as OrganicEdge,
        right: (Vsign[r][c + 1] || 0) as OrganicEdge,
        bottom: (Hsign[r + 1][c] || 0) as OrganicEdge,
        left: (-Vsign[r][c] || 0) as OrganicEdge,
      };

      const edgePoints = { top, right, bottom, left };
      pieces.push({
        index: r * cols + c,
        col: c,
        row: r,
        edges,
        edgePoints,
        path: toPath(edgePoints),
        outline: toOutline(edgePoints),
        bounds: boundsOf([...top, ...right, ...bottom, ...left]),
      });
    }
  }

  return { cols, rows, width, height, pieces };
}

const f = (n: number) => Math.round(n * 100) / 100;

function edgeCmds(pts: Pt[], out: string[]): void {
  if (pts.length === 2) {
    out.push(`L ${f(pts[1].x)} ${f(pts[1].y)}`);
    return;
  }
  for (let i = 1; i + 2 < pts.length; i += 3) {
    out.push(`C ${f(pts[i].x)} ${f(pts[i].y)} ${f(pts[i + 1].x)} ${f(pts[i + 1].y)} ${f(pts[i + 2].x)} ${f(pts[i + 2].y)}`);
  }
}

function toPath(e: OrganicPiece["edgePoints"]): string {
  const out = [`M ${f(e.top[0].x)} ${f(e.top[0].y)}`];
  edgeCmds(e.top, out);
  edgeCmds(e.right, out);
  edgeCmds(e.bottom, out);
  edgeCmds(e.left, out);
  out.push("Z");
  return out.join(" ");
}

function cubic(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const m = 1 - t;
  const a = m * m * m;
  const b = 3 * m * m * t;
  const c = 3 * m * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

function toOutline(e: OrganicPiece["edgePoints"], steps = 8): Pt[] {
  const out: Pt[] = [e.top[0]];
  for (const pts of [e.top, e.right, e.bottom, e.left]) {
    if (pts.length === 2) {
      out.push(pts[1]);
      continue;
    }
    for (let i = 0; i + 3 < pts.length; i += 3) {
      for (let s = 1; s <= steps; s++) out.push(cubic(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], s / steps));
    }
  }
  out.pop(); // closing point duplicates the first
  return out;
}

function boundsOf(pts: Pt[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Scatter `count` item centres across `area`, keeping each item's half-size
 * clear of `avoid` (the board) and of the area's edges, as spread out as
 * possible (Mitchell best-candidate sampling). Uses the injected rng, so a
 * fresh `Math.random` gives a different table every time the puzzle opens.
 * If the area is too cramped, the least-overlapping candidate still wins —
 * pieces may overlap a little, like on a real table, but never land on the
 * board or off-screen.
 */
export function scatterAround(
  count: number,
  itemW: number,
  itemH: number,
  area: Rect,
  avoid: Rect,
  rng: () => number,
  candidates = 24,
): Pt[] {
  const hw = itemW / 2;
  const hh = itemH / 2;
  const minX = area.x + hw;
  const maxX = area.x + area.w - hw;
  const minY = area.y + hh;
  const maxY = area.y + area.h - hh;
  const blocked = (p: Pt) =>
    p.x + hw > avoid.x && p.x - hw < avoid.x + avoid.w && p.y + hh > avoid.y && p.y - hh < avoid.y + avoid.h;

  const out: Pt[] = [];
  for (let i = 0; i < count; i++) {
    let best: Pt | null = null;
    let bestScore = -Infinity;
    for (let k = 0; k < candidates * 4 && (k < candidates || !best); k++) {
      const p = { x: minX + rng() * Math.max(0, maxX - minX), y: minY + rng() * Math.max(0, maxY - minY) };
      if (blocked(p)) continue;
      let nearest = Infinity;
      for (const q of out) {
        // normalised so wide and tall pieces space out evenly
        const d = Math.hypot((p.x - q.x) / itemW, (p.y - q.y) / itemH);
        if (d < nearest) nearest = d;
      }
      if (nearest > bestScore) {
        bestScore = nearest;
        best = p;
      }
    }
    // pathological layouts (no free spot at all): fall back to the nearest area edge below the board
    out.push(best ?? { x: minX + rng() * Math.max(0, maxX - minX), y: maxY });
  }
  return out;
}
