/**
 * Reusable, deterministic jigsaw-cut geometry. Phaser-free so it can be unit tested.
 *
 * The logical layout is still a `cols × rows` grid. Every INTERNAL edge is a tab
 * (+1) or socket (-1) chosen from a seeded RNG; the two pieces that share an edge
 * get inverse shapes so they interlock. The outer border stays flat (0).
 * `piecePath()` turns one piece's four edges into an SVG path (soft rounded knobs,
 * no thin necks). `pieceBounds()` reports how far the knobs push past the base cell.
 */
import { mulberry32 } from "../core/rng";

export type Edge = -1 | 0 | 1; // socket (in), flat/border, tab (out)

export interface PieceEdges {
  top: Edge;
  right: Edge;
  bottom: Edge;
  left: Edge;
}

export interface GridSize2 {
  cols: number;
  rows: number;
}

/** One tab/socket edge for every internal seam; the border is flat. Deterministic per seed. */
export function edgeGrid(cols: number, rows: number, seed: number): PieceEdges[] {
  const rng = mulberry32(seed >>> 0);
  // v[r][c] = RIGHT edge of piece (r, c), for c in [0 .. cols-2]
  const v: Edge[][] = [];
  for (let r = 0; r < rows; r++) {
    v[r] = [];
    for (let c = 0; c < cols - 1; c++) v[r][c] = rng() < 0.5 ? -1 : 1;
  }
  // h[r][c] = BOTTOM edge of piece (r, c), for r in [0 .. rows-2]
  const h: Edge[][] = [];
  for (let r = 0; r < rows - 1; r++) {
    h[r] = [];
    for (let c = 0; c < cols; c++) h[r][c] = rng() < 0.5 ? -1 : 1;
  }

  const out: PieceEdges[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.push({
        top: r === 0 ? 0 : (-h[r - 1][c] as Edge),
        bottom: r === rows - 1 ? 0 : h[r][c],
        left: c === 0 ? 0 : (-v[r][c - 1] as Edge),
        right: c === cols - 1 ? 0 : v[r][c],
      });
    }
  }
  return out;
}

/** Convenience: 4-edge record for piece index `i` in a grid. */
export function pieceEdgesAt(all: PieceEdges[], i: number): PieceEdges {
  return all[i];
}

type Pt = { x: number; y: number };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Append one edge (a straight run + an optional rounded knob) to `cmds`.
 * `from`→`to` is the edge as travelled clockwise around the piece; `sign` is +1
 * for a tab (knob bulges away from the interior), -1 for a socket, 0 for flat.
 */
function edgeCmds(cmds: string[], from: Pt, to: Pt, sign: Edge, tab: number): void {
  if (sign === 0) {
    cmds.push(`L ${r(to.x)} ${r(to.y)}`);
    return;
  }
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  // outward normal for a clockwise traversal
  const nx = uy * sign;
  const ny = -ux * sign;

  // sample a point: `t` along the edge (0..1), `o` outward in tab units
  const p = (t: number, o: number): Pt => ({
    x: lerp(from.x, to.x, t) + nx * tab * o,
    y: lerp(from.y, to.y, t) + ny * tab * o,
  });

  const a = p(0.32, 0);
  const b = p(0.42, 1.05);
  const c = p(0.58, 1.05);
  const d = p(0.68, 0);
  const apex = p(0.5, 1.75);

  cmds.push(`L ${r(a.x)} ${r(a.y)}`);
  cmds.push(`Q ${r(p(0.4, 0.35).x)} ${r(p(0.4, 0.35).y)} ${r(b.x)} ${r(b.y)}`);
  cmds.push(`Q ${r(apex.x)} ${r(apex.y)} ${r(c.x)} ${r(c.y)}`);
  cmds.push(`Q ${r(p(0.6, 0.35).x)} ${r(p(0.6, 0.35).y)} ${r(d.x)} ${r(d.y)}`);
  cmds.push(`L ${r(to.x)} ${r(to.y)}`);
}

function r(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * SVG path for one piece. The base cell is `w × h`; its top-left sits at
 * `(offsetX, offsetY)`. Knobs on tab/socket edges push about `1.75 * tab` past
 * the base cell — keep the containing frame at least that wide.
 */
export function piecePath(
  edges: PieceEdges,
  w: number,
  h: number,
  tab: number,
  offsetX = 0,
  offsetY = 0,
): string {
  const x0 = offsetX;
  const y0 = offsetY;
  const x1 = offsetX + w;
  const y1 = offsetY + h;
  const cmds: string[] = [`M ${r(x0)} ${r(y0)}`];
  edgeCmds(cmds, { x: x0, y: y0 }, { x: x1, y: y0 }, edges.top, tab); // top L→R
  edgeCmds(cmds, { x: x1, y: y0 }, { x: x1, y: y1 }, edges.right, tab); // right T→B
  edgeCmds(cmds, { x: x1, y: y1 }, { x: x0, y: y1 }, edges.bottom, tab); // bottom R→L
  edgeCmds(cmds, { x: x0, y: y1 }, { x: x0, y: y0 }, edges.left, tab); // left B→T
  cmds.push("Z");
  return cmds.join(" ");
}

/** How far the piece's outline reaches, relative to the base-cell CENTRE. */
export function pieceBounds(
  edges: PieceEdges,
  w: number,
  h: number,
  tab: number,
): { left: number; right: number; top: number; bottom: number } {
  const ext = tab * 1.75;
  return {
    left: -w / 2 - (edges.left === 1 ? ext : 0),
    right: w / 2 + (edges.right === 1 ? ext : 0),
    top: -h / 2 - (edges.top === 1 ? ext : 0),
    bottom: h / 2 + (edges.bottom === 1 ? ext : 0),
  };
}
