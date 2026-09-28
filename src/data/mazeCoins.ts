import type { MazeGrid, MazeDifficulty } from "./maze";
import { MAZE_ECONOMY } from "./economy";
type Tile = { tx: number; ty: number };
const key = (t: Tile) => `${t.tx},${t.ty}`;
const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Prioritize optional branches, dead ends and far corridors. Include one near
 * spawn so the secondary objective is discoverable on every run. */
export function mazeCoinTiles(grid: MazeGrid, difficulty: MazeDifficulty, occupied: Set<string>, targets: Tile[]): Tile[] {
  const start = grid.cellTiles[0];
  const neighbours = (t: Tile) => dirs.map(([dx, dy]) => ({ tx: t.tx + dx, ty: t.ty + dy }))
    .filter(t => grid.walls[t.ty]?.[t.tx] === false);
  const queue = [start], parents = new Map<string, Tile | null>([[key(start), null]]);
  for (let i = 0; i < queue.length; i++) for (const n of neighbours(queue[i])) {
    if (!parents.has(key(n))) { parents.set(key(n), queue[i]); queue.push(n); }
  }
  const route = new Set<string>();
  for (const target of targets) {
    let t: Tile | null | undefined = target;
    while (t) { route.add(key(t)); t = parents.get(key(t)); }
  }
  const candidates = queue.filter(t => key(t) !== key(start) && !occupied.has(key(t)));
  const result: Tile[] = [];
  const add = (t?: Tile) => { if (t && !result.some(r => key(r) === key(t))) result.push(t); };
  add(candidates[0]);
  // Stable coordinate hash scatters picks without consuming the maze's RNG.
  const hash = (t: Tile) => ((Math.imul(t.tx + 17, 73856093) ^ Math.imul(t.ty + 31, 19349663)) >>> 0);
  const scattered = [...candidates].sort((a, b) => hash(a) - hash(b));
  const count = MAZE_ECONOMY[difficulty].count;
  for (const t of scattered.filter(t => neighbours(t).length === 1).slice(0, Math.ceil(count / 4))) add(t);
  for (const t of scattered.filter(t => !route.has(key(t)))) { if (result.length >= Math.ceil(count * 0.65)) break; add(t); }
  for (const t of [...candidates].reverse().slice(0, 3)) add(t);
  for (const t of scattered) { if (result.length >= count) break; add(t); }
  return result.slice(0, count);
}
