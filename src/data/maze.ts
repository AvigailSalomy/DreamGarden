/**
 * Data-driven Garden Maze configuration. The maze itself is generated (a
 * seeded recursive-backtracker carve + a few extra knocked-through walls for
 * loops/alternate routes) rather than hand-authored pixel art, so the same
 * small system works for every resource on every animal — only the title,
 * target icon/count, and enemy count change per hunt (see GardenMazeScene).
 */

export type MazeDifficulty = "easy" | "medium" | "hard";

export interface MazeLevelConfig {
  difficulty: MazeDifficulty;
  /** Odd "logical" cell grid (recursive-backtracker carves on this, not the tile grid). */
  cols: number;
  rows: number;
  seed: number;
  /** Fraction of interior walls beyond the perfect-maze tree that get knocked
   *  through, to create loops/alternate routes instead of one linear path. */
  loopFactor: number;
  enemyCount: number;
  enemySpeed: number;
  leafCount: number;
  magicFlowerCount: number;
  lives: number;
}

export const MAZE_LEVELS: Record<MazeDifficulty, MazeLevelConfig> = {
  easy: {
    difficulty: "easy",
    cols: 7,
    rows: 9,
    seed: 1001,
    loopFactor: 0.16,
    enemyCount: 3,
    enemySpeed: 82, // original: 2 enemies @ 78 — now +1 enemy, +5% speed
    leafCount: 16,
    magicFlowerCount: 1,
    lives: 3,
  },
  medium: {
    difficulty: "medium",
    cols: 9,
    rows: 11,
    seed: 2002,
    loopFactor: 0.14,
    enemyCount: 4,
    enemySpeed: 97, // original: 3 @ 92
    leafCount: 22,
    magicFlowerCount: 1,
    lives: 3,
  },
  hard: {
    difficulty: "hard",
    cols: 11,
    rows: 13,
    seed: 3003,
    loopFactor: 0.12,
    enemyCount: 5,
    enemySpeed: 110, // original: 4 @ 104
    leafCount: 28,
    magicFlowerCount: 2,
    lives: 3,
  },
};

/** Tiny deterministic PRNG (mulberry32) so a given seed always carves the same maze. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MazeGrid {
  /** tile grid: 2*cols+1 wide, 2*rows+1 tall. true = wall. */
  walls: boolean[][];
  tileCols: number;
  tileRows: number;
  /** logical (carve) cell centers, in tile coords — good candidate spots for
   *  collectibles/enemies/spawn (always open floor, never a wall). */
  cellTiles: { tx: number; ty: number }[];
}

/**
 * Recursive-backtracker carve on a `cols x rows` logical grid, expressed on a
 * `(2*cols+1) x (2*rows+1)` tile grid (odd tiles = cells, even tiles = walls
 * between them) — the standard technique for a maze that reads as corridors
 * with real width, not a 1px line-drawing.
 */
export function generateMaze(cfg: MazeLevelConfig): MazeGrid {
  const { cols, rows, seed, loopFactor } = cfg;
  const rng = mulberry32(seed);
  const tileCols = cols * 2 + 1;
  const tileRows = rows * 2 + 1;
  const walls: boolean[][] = Array.from({ length: tileRows }, () => Array(tileCols).fill(true));
  const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false));

  const toTile = (cx: number, cy: number) => ({ tx: cx * 2 + 1, ty: cy * 2 + 1 });

  const carveCell = (cx: number, cy: number) => {
    const { tx, ty } = toTile(cx, cy);
    walls[ty][tx] = false;
  };
  const carveBetween = (ax: number, ay: number, bx: number, by: number) => {
    const a = toTile(ax, ay);
    const b = toTile(bx, by);
    walls[(a.ty + b.ty) / 2][(a.tx + b.tx) / 2] = false;
  };

  const DIRS = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];

  const stack: [number, number][] = [[0, 0]];
  visited[0][0] = true;
  carveCell(0, 0);
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const options: [number, number][] = [];
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !visited[ny][nx]) options.push([nx, ny]);
    }
    if (!options.length) {
      stack.pop();
      continue;
    }
    const [nx, ny] = options[Math.floor(rng() * options.length)];
    visited[ny][nx] = true;
    carveCell(nx, ny);
    carveBetween(cx, cy, nx, ny);
    stack.push([nx, ny]);
  }

  // Knock through a fraction of the remaining internal walls (between two
  // already-open cells) so the maze has loops/alternate routes, not just one
  // perfect-tree path between any two points.
  const candidates: { ty: number; tx: number }[] = [];
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      if (cx < cols - 1) {
        const a = toTile(cx, cy);
        const b = toTile(cx + 1, cy);
        const wt = { ty: a.ty, tx: (a.tx + b.tx) / 2 };
        if (walls[wt.ty][wt.tx]) candidates.push(wt);
      }
      if (cy < rows - 1) {
        const a = toTile(cx, cy);
        const b = toTile(cx, cy + 1);
        const wt = { ty: (a.ty + b.ty) / 2, tx: a.tx };
        if (walls[wt.ty][wt.tx]) candidates.push(wt);
      }
    }
  }
  const extra = Math.round(candidates.length * loopFactor);
  for (let i = 0; i < extra && candidates.length; i++) {
    const idx = Math.floor(rng() * candidates.length);
    const { ty, tx } = candidates.splice(idx, 1)[0];
    walls[ty][tx] = false;
  }

  const cellTiles: { tx: number; ty: number }[] = [];
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const { tx, ty } = toTile(cx, cy);
      cellTiles.push({ tx, ty });
    }
  }

  return { walls, tileCols, tileRows, cellTiles };
}
