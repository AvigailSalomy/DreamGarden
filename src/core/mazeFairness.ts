/**
 * Dream Garden maze fairness — pure (Phaser-free) so the exact trapping
 * geometries can be unit tested.
 *
 * The problem this solves: enemies only make decisions at junctions and know
 * nothing about the player's ESCAPE ROUTES. A single enemy wandering into the
 * mouth of the corridor the player is in (whose other end is a dead end) — or
 * pacing back and forth there — leaves the player no way out except through
 * it. Counting "how many enemies are near" never catches that.
 *
 * Rule: find the player's viable exits (a direction only counts if it leads
 * somewhere — at least MIN_REGION_TILES of open maze — so the stub into a dead
 * end does not). An exit is blocked when an enemy sits on that branch within
 * BLOCK_TILES of corridor. If EVERY viable exit is blocked, enemies on one exit
 * must yield so it opens up again — the exit whose blockers don't include the
 * active pursuer is cleared first (the pursuer may keep the pressure on the
 * other side). If at least one viable exit is clear, nobody has to yield.
 */

export interface FairnessGrid {
  walls: boolean[][];
}

type Tile = { tx: number; ty: number };

/** A direction only counts as an escape if this much open maze lies beyond it. */
export const MIN_REGION_TILES = 12;
/** An enemy this close (tiles of corridor, along that exit's branch) blocks it. */
export const BLOCK_TILES = 6;
/** How far a yielding enemy must keep off the escape branch (tiles of corridor). */
export const AVOID_TILES = 8;

const DIRS: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const key = (x: number, y: number) => `${x},${y}`;

/** BFS over open tiles from `start`, never stepping onto `blocked`, up to `max` tiles away. */
function branchDistances(walls: boolean[][], start: Tile, blocked: Tile, max: number): Map<string, number> {
  const d = new Map<string, number>([[key(start.tx, start.ty), 1]]);
  const q: Tile[] = [start];
  for (let i = 0; i < q.length; i++) {
    const { tx, ty } = q[i];
    const cur = d.get(key(tx, ty))!;
    if (cur >= max) continue;
    for (const [dx, dy] of DIRS) {
      const nx = tx + dx, ny = ty + dy;
      const k = key(nx, ny);
      if (walls[ny]?.[nx] !== false || d.has(k) || (nx === blocked.tx && ny === blocked.ty)) continue;
      d.set(k, cur + 1);
      q.push({ tx: nx, ty: ny });
    }
  }
  return d;
}

export interface ExitInfo {
  dir: [number, number];
  /** Corridor distance from the player to each tile reachable through this exit (≤ max). */
  branch: Map<string, number>;
  /** Enough open maze beyond it to count as a real escape. */
  viable: boolean;
}

export function playerExits(grid: FairnessGrid, player: Tile, max = 40): ExitInfo[] {
  const out: ExitInfo[] = [];
  for (const [dx, dy] of DIRS) {
    const n = { tx: player.tx + dx, ty: player.ty + dy };
    if (grid.walls[n.ty]?.[n.tx] !== false) continue;
    const branch = branchDistances(grid.walls, n, player, max);
    out.push({ dir: [dx, dy], branch, viable: branch.size >= MIN_REGION_TILES });
  }
  return out;
}

export interface YieldOrder {
  /** Indices (into the enemy list) that must yield right now. */
  enemies: number[];
  /** Tiles the yielding enemies must keep off: the cleared exit's branch near the player. */
  avoid: Set<string>;
}

/**
 * Which enemies must get out of the way so the player keeps at least one
 * viable exit. `pursuer` is the index of the active pursuer (or -1).
 */
export function enemiesToYield(grid: FairnessGrid, player: Tile, enemies: Tile[], pursuer = -1): YieldOrder {
  const exits = playerExits(grid, player);
  let viable = exits.filter((e) => e.viable);
  // no exit leads anywhere big (a tiny closed-off area): treat every exit as the way out
  if (!viable.length) viable = exits;
  if (!viable.length) return { enemies: [], avoid: new Set() };

  const blockersOf = (ex: ExitInfo) =>
    enemies
      .map((e, i) => ({ i, d: ex.branch.get(key(e.tx, e.ty)) }))
      .filter((b): b is { i: number; d: number } => b.d !== undefined && b.d <= BLOCK_TILES);

  const blocked = viable.map((ex) => ({ ex, blockers: blockersOf(ex) }));
  if (blocked.some((b) => b.blockers.length === 0)) return { enemies: [], avoid: new Set() };

  // every viable exit is blocked: clear the one whose blockers exclude the
  // pursuer (else the one with the fewest / farthest blockers)
  blocked.sort(
    (a, b) =>
      Number(a.blockers.some((x) => x.i === pursuer)) - Number(b.blockers.some((x) => x.i === pursuer)) ||
      a.blockers.length - b.blockers.length ||
      Math.min(...b.blockers.map((x) => x.d)) - Math.min(...a.blockers.map((x) => x.d)),
  );
  const clear = blocked[0];
  const avoid = new Set<string>();
  for (const [k, d] of clear.ex.branch) if (d <= AVOID_TILES) avoid.add(k);
  return { enemies: clear.blockers.map((b) => b.i), avoid };
}
