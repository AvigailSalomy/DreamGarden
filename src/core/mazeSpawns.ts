/**
 * Dream Garden maze enemy placement — pure (Phaser-free) so it can be tested.
 *
 * The old rule put every enemy on the cells FARTHEST (straight-line) from the
 * start, so they all bunched in the opposite corner and took a long time to
 * matter. This spreads them instead, using real path distance through the
 * corridors:
 *  - nothing inside a safety zone around the start (SAFE_MIN_TILES of path);
 *  - enemy #1 (the maze's single active pursuer) at MEDIUM range (14–18 tiles
 *    of path), on the least-branching route to the start;
 *  - the others spaced across the rest of the distance range, each picked to
 *    be as far as possible (straight-line) from the enemies already placed, so
 *    they cover different parts/directions of the maze;
 *  - never on the start cell or an excluded tile (targets, magic flowers).
 * Deterministic for a given maze.
 */

export interface SpawnGrid {
  walls: boolean[][];
  cellTiles: Array<{ tx: number; ty: number }>;
}

/** Minimum corridor distance (in tiles) between the start and any enemy. */
export const SAFE_MIN_TILES = 10;
/** Where later enemies' distance targets start, as a fraction of the maze's deepest path distance. */
export const FIRST_ENEMY_FRACTION = 0.25;
/** Enemy #1 starts in this corridor-distance band (tiles) — close enough to
 *  matter within ~5–10s at maze enemy speeds, never adjacent to the start. */
export const FIRST_ENEMY_MIN_TILES = 14;
export const FIRST_ENEMY_MAX_TILES = 18;

/** Junctions (cells with 3+ open sides) on the shortest route from `from` back
 *  to the start — fewer means a wandering enemy is funnelled toward the player. */
function junctionsOnRoute(walls: boolean[][], dist: Map<string, number>, from: { tx: number; ty: number }): number {
  const open = (x: number, y: number) => walls[y]?.[x] === false;
  let { tx: x, ty: y } = from;
  let d = dist.get(`${x},${y}`) ?? 0;
  let n = 0;
  while (d > 0) {
    const sides = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => open(x + dx, y + dy)).length;
    if (sides >= 3 && d !== (dist.get(`${from.tx},${from.ty}`) ?? 0)) n++;
    const step = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => dist.get(`${x + dx},${y + dy}`) === d - 1);
    if (!step) break;
    x += step[0]; y += step[1]; d--;
  }
  return n;
}

/** Breadth-first path distance (in tiles) from `start` to every open tile. */
export function pathDistances(walls: boolean[][], start: { tx: number; ty: number }): Map<string, number> {
  const dist = new Map<string, number>([[`${start.tx},${start.ty}`, 0]]);
  const q: Array<[number, number]> = [[start.tx, start.ty]];
  for (let i = 0; i < q.length; i++) {
    const [x, y] = q[i];
    const d = dist.get(`${x},${y}`)!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      const k = `${nx},${ny}`;
      if (walls[ny]?.[nx] === false && !dist.has(k)) {
        dist.set(k, d + 1);
        q.push([nx, ny]);
      }
    }
  }
  return dist;
}

export function pickEnemySpawns(
  grid: SpawnGrid,
  count: number,
  exclude: Set<string> = new Set(),
): Array<{ tx: number; ty: number; pathDist: number }> {
  const start = grid.cellTiles[0];
  const dist = pathDistances(grid.walls, start);
  const all = grid.cellTiles
    .filter((c) => !(c.tx === start.tx && c.ty === start.ty))
    .map((c) => ({ ...c, pathDist: dist.get(`${c.tx},${c.ty}`) ?? -1 }))
    .filter((c) => c.pathDist >= 0);
  let pool = all.filter((c) => c.pathDist >= SAFE_MIN_TILES && !exclude.has(`${c.tx},${c.ty}`));
  // tiny maze fallback: relax the exclusions, then the safety zone, never the start cell
  if (pool.length < count) pool = all.filter((c) => c.pathDist >= SAFE_MIN_TILES);
  if (pool.length < count) pool = [...all];
  if (pool.length === 0) return [];

  const maxD = Math.max(...pool.map((c) => c.pathDist));
  const chosen: typeof pool = [];
  const sep = (c: { tx: number; ty: number }) =>
    chosen.length ? Math.min(...chosen.map((o) => Math.hypot(o.tx - c.tx, o.ty - c.ty))) : 0;

  // enemy #1: an early, fair threat — in the close-to-medium band, preferring the
  // cell whose route to the start branches least (so it actually arrives)
  let band1 = pool.filter((c) => c.pathDist >= FIRST_ENEMY_MIN_TILES && c.pathDist <= FIRST_ENEMY_MAX_TILES);
  if (!band1.length) {
    const nearest = Math.min(...pool.map((c) => c.pathDist));
    band1 = pool.filter((c) => c.pathDist === nearest);
  }
  band1.sort(
    (a, b) =>
      junctionsOnRoute(grid.walls, dist, a) - junctionsOnRoute(grid.walls, dist, b) ||
      Math.abs(a.pathDist - 16) - Math.abs(b.pathDist - 16) ||
      a.ty - b.ty || a.tx - b.tx,
  );
  if (count > 0) chosen.push(band1[0]);

  // the rest: spread over the remaining distance range, each as far as possible
  // (straight-line) from the enemies already placed, so they cover different areas
  for (let i = 1; i < count; i++) {
    const left = pool.filter((c) => !chosen.includes(c));
    if (!left.length) break;
    const target = maxD * (FIRST_ENEMY_FRACTION + ((0.9 - FIRST_ENEMY_FRACTION) * i) / Math.max(1, count - 1));
    const band = Math.max(4, maxD * 0.12);
    let near = left.filter((c) => Math.abs(c.pathDist - target) <= band);
    if (!near.length) {
      const closest = Math.min(...left.map((c) => Math.abs(c.pathDist - target)));
      near = left.filter((c) => Math.abs(c.pathDist - target) === closest);
    }
    near.sort((a, b) => sep(b) - sep(a) || a.ty - b.ty || a.tx - b.tx);
    chosen.push(near[0]);
  }
  return chosen.map(({ tx, ty, pathDist }) => ({ tx, ty, pathDist }));
}
