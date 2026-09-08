/** Pure geometry + helpers for the drag-and-snap picture puzzle. No Phaser imports. */

export interface GridSize {
  cols: number;
  rows: number;
}

export interface TileRect {
  index: number;
  col: number;
  row: number;
  /** Sub-rectangle of the source texture, in texture pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Cell {
  index: number;
  x: number;
  y: number;
  filled: boolean;
}

/** Split a texture of `texW x texH` into `grid.cols * grid.rows` rectangular tiles. */
export function sliceGrid(texW: number, texH: number, grid: GridSize): TileRect[] {
  const w = texW / grid.cols;
  const h = texH / grid.rows;
  const out: TileRect[] = [];
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.cols; col++) {
      out.push({ index: row * grid.cols + col, col, row, x: col * w, y: row * h, w, h });
    }
  }
  return out;
}

/** Fisher-Yates using an injected rng. Returns a new array; input is untouched. */
export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Nearest empty cell to a point, or null if every cell is filled. */
export function nearestEmptyCell(
  px: number,
  py: number,
  cells: readonly Cell[],
): { cell: Cell; dist: number } | null {
  let best: Cell | null = null;
  let bestD = Infinity;
  for (const c of cells) {
    if (c.filled) continue;
    const d = Math.hypot(px - c.x, py - c.y);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best ? { cell: best, dist: bestD } : null;
}

/**
 * Layout for the scattered tray: pack `count` items into rows that fit `maxWidth`,
 * returning a local position per slot (origin at the tray's top-centre).
 */
export function trayLayout(
  count: number,
  itemW: number,
  itemH: number,
  gap: number,
  maxWidth: number,
): { x: number; y: number }[] {
  const perRow = Math.max(1, Math.floor((maxWidth + gap) / (itemW + gap)));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow);
    const inRow = i % perRow;
    const rowCount = Math.min(perRow, count - row * perRow);
    const rowWidth = rowCount * itemW + (rowCount - 1) * gap;
    const x = -rowWidth / 2 + itemW / 2 + inRow * (itemW + gap);
    const y = row * (itemH + gap) + itemH / 2;
    out.push({ x, y });
  }
  return out;
}
