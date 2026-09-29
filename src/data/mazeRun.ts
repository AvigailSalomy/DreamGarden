import { chooseTargetCell } from "./mazeAI";
import type { Cell, EnemyPersonality, EnemyPhase } from "./mazeAI";

/**
 * The Garden Maze's actual game rules, as a pure tick-based simulation with no
 * Phaser in it. FrostedMazeScene only renders this and forwards input;
 * tests/mazeRun.test.ts drives it directly (including a bot that plays whole
 * runs to check they're long enough and winnable).
 *
 *  - Player: continuous arcade movement — keeps going until a wall, buffered
 *    turns at the next opening, instant reversal mid-corridor.
 *  - Enemies: walk the real maze graph one tile at a time (never through
 *    walls or corners), with a mode per enemy — SLEEPING (spawn) → ACTIVE
 *    (which alternates SCATTER / its personality's CHASE, see mazeAI.ts) →
 *    FRIGHTENED while a Power Crystal is active → RETURNING home as a wisp
 *    once caught → RESPAWNING → ACTIVE again.
 *  - Collision is "actually on the same tile": the two fractional positions
 *    must overlap within COLLIDE_DIST (well under half a tile). An enemy on
 *    the neighbouring tile never touches the player.
 *  - A hit costs exactly one life, then the whole board freezes for the ~2s
 *    death sequence (status "dying"), then the ATTEMPT resets: mission
 *    progress back to 0, every mission item back in its original spot,
 *    Hearts and Power Crystals back, player at the start with spawn
 *    protection. Only the lives count carries over. Coins already paid out
 *    stay paid (and don't respawn) — they live in the one global wallet.
 *  - The requirement only completes with every item collected in ONE life.
 *
 * All coordinates are LAYOUT cells (row, col). The scene may draw the maze
 * transposed on portrait screens; that's purely presentation.
 */

export type { Cell } from "./mazeAI";

export interface Dir {
  dr: number;
  dc: number;
}

export const DIRS: Dir[] = [
  { dr: -1, dc: 0 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
  { dr: 0, dc: 1 },
];

export type EnemyKind = "flame" | "thorn" | "snowball" | "mushroom";

/** Each creature has its own brain, so which ones spawn changes how a run plays. */
export const ENEMY_KIND_PERSONALITY: Record<EnemyKind, EnemyPersonality> = {
  flame: "chaser", // bears straight down on you
  thorn: "ambusher", // aims where you're heading
  mushroom: "flanker", // comes around the other side
  snowball: "wanderer", // rolls about unpredictably, then lunges
};

export type Difficulty = "easy" | "medium" | "hard";

export interface DifficultyTuning {
  enemyRange: [number, number];
  enemyMsPerCell: number;
  chaseMs: number;
  scatterMs: number;
  powerCrystals: number;
}

/**
 * Difficulty is mostly MORE enemies, LONGER chase windows and fewer breathers
 * — speed only creeps up slightly between tiers.
 */
export const DIFFICULTY: Record<Difficulty, DifficultyTuning> = {
  easy: { enemyRange: [2, 3], enemyMsPerCell: 330, chaseMs: 7000, scatterMs: 5000, powerCrystals: 2 },
  medium: { enemyRange: [3, 4], enemyMsPerCell: 312, chaseMs: 8500, scatterMs: 4500, powerCrystals: 2 },
  hard: { enemyRange: [4, 5], enemyMsPerCell: 295, chaseMs: 10000, scatterMs: 4000, powerCrystals: 3 },
};

/** Rescue order 0-1 easy (Rabbit, Fox), 2-3 medium (Deer, Squirrel), 4-5 hard (Polar Bear, Penguin). */
export function difficultyForOrder(order: number): Difficulty {
  if (order <= 1) return "easy";
  if (order <= 3) return "medium";
  return "hard";
}

export const PLAYER_MS_PER_CELL = 205;
export const START_LIVES = 3;
/** Hearts can top lives up to this, never beyond. */
export const MAX_LIVES = 5;
/** Enemies stay asleep this long after GO, then wake one by one. */
export const FIRST_RELEASE_MS = 2000;
export const RELEASE_STAGGER_MS = 1600;
/** Collision: fractional positions closer than this (in tiles) = same tile. Adjacent tiles are 1.0 apart. */
export const COLLIDE_DIST = 0.4;
/** The frozen death sequence between a hit and the respawn. */
export const DEATH_SEQUENCE_MS = 2000;
/** Spawn protection after respawning at the start. */
export const RESPAWN_PROTECT_MS = 1800;
export const POWER_MS = 6500;
export const FRIGHTENED_SLOWDOWN = 1.45;
export const RETURN_MS_PER_CELL = 110;
export const ENEMY_RESPAWN_MS = 1600;
/** Mission items visible at once — the rest sprout one by one as these are picked up. */
export const MAX_VISIBLE_ITEMS = 2;
export const COIN_VALUE = 2;
export const TREASURE_COIN_VALUE = 5;
/** Coins paid into the ONE global wallet for catching a frightened enemy. */
export const ENEMY_CATCH_BONUS = 5;

export const cellKey = (c: Cell) => `${c.row},${c.col}`;
const manhattan = (a: Cell, b: Cell) => Math.abs(a.row - b.row) + Math.abs(a.col - b.col);

/* ---------------- maze graph helpers ---------------- */

export class MazeGrid {
  readonly rows: number;
  readonly cols: number;
  readonly start: Cell;
  readonly pathCells: Cell[];
  private distCache = new Map<string, Map<string, number>>();

  constructor(readonly layout: string[]) {
    this.rows = layout.length;
    this.cols = layout[0].length;
    let start: Cell | null = null;
    const cells: Cell[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (layout[r][c] === "#") continue;
        cells.push({ row: r, col: c });
        if (layout[r][c] === "S") start = { row: r, col: c };
      }
    }
    this.pathCells = cells;
    this.start = start ?? cells[0];
  }

  isOpen(r: number, c: number): boolean {
    return r >= 0 && r < this.rows && c >= 0 && c < this.cols && this.layout[r][c] !== "#";
  }

  neighbours(cell: Cell): Cell[] {
    const out: Cell[] = [];
    for (const d of DIRS) if (this.isOpen(cell.row + d.dr, cell.col + d.dc)) out.push({ row: cell.row + d.dr, col: cell.col + d.dc });
    return out;
  }

  degree(cell: Cell): number {
    return this.neighbours(cell).length;
  }

  /** BFS step-distance from `from` to every reachable cell. Cached — the maze never changes during a run. */
  distances(from: Cell): Map<string, number> {
    const fk = cellKey(from);
    const cached = this.distCache.get(fk);
    if (cached) return cached;
    const dist = new Map<string, number>([[fk, 0]]);
    const queue: Cell[] = [from];
    for (let i = 0; i < queue.length; i++) {
      const cur = queue[i];
      const d = dist.get(cellKey(cur))!;
      for (const n of this.neighbours(cur)) {
        const k = cellKey(n);
        if (dist.has(k)) continue;
        dist.set(k, d + 1);
        queue.push(n);
      }
    }
    this.distCache.set(fk, dist);
    return dist;
  }

  dist(a: Cell, b: Cell): number {
    return this.distances(a).get(cellKey(b)) ?? 999;
  }

  /** The number of independent loops (edges − nodes + 1) — a rough "how many escape routes" measure. */
  loopCount(): number {
    let edges = 0;
    for (const c of this.pathCells) {
      if (this.isOpen(c.row, c.col + 1)) edges++;
      if (this.isOpen(c.row + 1, c.col)) edges++;
    }
    return edges - this.pathCells.length + 1;
  }
}

/* ---------------- run state ---------------- */

export interface PlayerState {
  cell: Cell;
  /** The cell being walked into, or null when standing still. */
  next: Cell | null;
  /** 0..1 progress from `cell` to `next`. */
  t: number;
  dir: Dir | null;
  wantDir: Dir | null;
}

export type EnemyMode = "sleeping" | "active" | "frightened" | "returning" | "respawning";

/** What an enemy is doing right now, in words — drives its visuals and tests. */
export type EnemyBehaviour = "spawn" | "scatter" | "chase" | "ambush" | "flank" | "wander" | "frightened" | "returning" | "respawn";

export interface EnemyState {
  id: number;
  kind: EnemyKind;
  personality: EnemyPersonality;
  mode: EnemyMode;
  spawnCell: Cell;
  cell: Cell;
  next: Cell | null;
  t: number;
  lastDir: Dir | null;
  homeCorner: Cell;
  msPerCell: number;
  /** sleeping: wakes when run time reaches this; respawning: counts down. */
  modeTimerMs: number;
  wanderPatrolling: boolean;
  wanderTarget?: Cell;
  wanderTimerMs: number;
}

export interface CoinState {
  cell: Cell;
  value: number;
  treasure: boolean;
}

export type RunEvent =
  | { type: "coin"; cell: Cell; value: number; treasure: boolean }
  | { type: "item"; cell: Cell; collected: number }
  | { type: "itemSpawn"; cell: Cell }
  | { type: "power"; cell: Cell }
  | { type: "heart"; cell: Cell; lives: number }
  | { type: "heartFull"; cell: Cell }
  | { type: "powerEnding" }
  | { type: "powerEnd" }
  | { type: "enemyCaught"; enemyId: number; bonus: number }
  | { type: "enemyHome"; enemyId: number }
  | { type: "enemyWake"; enemyId: number }
  | { type: "hit"; enemyId: number; livesLeft: number }
  /** The attempt was reset after a death: `lostItems` mission items were put back. */
  | { type: "respawn"; lostItems: number }
  | { type: "phase"; phase: EnemyPhase }
  | { type: "won" }
  | { type: "lost" };

export type RunStatus = "playing" | "dying" | "won" | "lost";

export interface MazeRunConfig {
  layout: string[];
  requiredItems: number;
  difficulty: Difficulty;
  rand: () => number;
  /** Force an exact enemy count (tests); otherwise rolled inside the difficulty's range, capped by fairness. */
  enemyCount?: number;
  /** Force enemy kinds (tests). */
  enemyKinds?: EnemyKind[];
  /** Force spawn cells (tests). */
  enemySpawns?: Cell[];
  /** Skip coin / crystal / item placement (tests that need an empty board). */
  bare?: boolean;
  /** Coin cells already paid out by an earlier attempt at this same challenge — never respawned, so a retry can't double-pay. */
  bankedCoinKeys?: Iterable<string>;
}

export class MazeRun {
  readonly grid: MazeGrid;
  readonly difficulty: Difficulty;
  readonly requiredItems: number;
  readonly player: PlayerState;
  readonly enemies: EnemyState[] = [];
  readonly items = new Map<string, Cell>();
  readonly coins = new Map<string, CoinState>();
  readonly crystals = new Map<string, Cell>();
  readonly hearts = new Map<string, Cell>();
  /** Every mission item's spot, decided up front, in sprouting order — a death puts them all back. */
  readonly itemPlan: Cell[] = [];
  lives = START_LIVES;
  collected = 0;
  /** Coins paid out this attempt (pickups + enemy-catch bonuses). */
  coinsEarned = 0;
  timeMs = 0;
  /** Spawn protection remaining (after a respawn). */
  protectMs = 0;
  /** Power Crystal time remaining. */
  powerMs = 0;
  /** Time left in the frozen death sequence. */
  dyingMs = 0;
  phase: EnemyPhase = "scatter";
  status: RunStatus = "playing";
  /** Every coin cell paid out this attempt (plus any banked before it) — handed to a retry. */
  readonly bankedCoinKeys: Set<string>;

  private rand: () => number;
  private tuning: DifficultyTuning;
  private phaseMs = 0;
  private itemsSpawned = 0;
  private crystalCells: Cell[] = [];
  private heartCells: Cell[] = [];
  private lastHeartFullKey = "";
  private startDist: Map<string, number>;
  private powerEndingSent = false;

  constructor(cfg: MazeRunConfig) {
    this.grid = new MazeGrid(cfg.layout);
    this.difficulty = cfg.difficulty;
    this.tuning = DIFFICULTY[cfg.difficulty];
    this.requiredItems = Math.max(1, cfg.requiredItems);
    this.rand = cfg.rand;
    this.bankedCoinKeys = new Set(cfg.bankedCoinKeys ?? []);
    this.startDist = this.grid.distances(this.grid.start);
    this.player = { cell: { ...this.grid.start }, next: null, t: 0, dir: null, wantDir: null };

    this.placeEnemies(cfg);
    if (!cfg.bare) {
      this.planItems();
      this.placeCrystals();
      this.placeHearts();
      this.placeCoins();
      this.resetAttemptPickups();
    }
  }

  /** Put the attempt's temporary pickups (mission items, Hearts, Power Crystals) back in their original state. */
  private resetAttemptPickups(): void {
    this.items.clear();
    this.itemsSpawned = 0;
    this.collected = 0;
    const n = Math.min(MAX_VISIBLE_ITEMS, this.itemPlan.length);
    for (let i = 0; i < n; i++) this.spawnNextPlanned();
    this.hearts.clear();
    for (const c of this.heartCells) this.hearts.set(cellKey(c), c);
    this.crystals.clear();
    for (const c of this.crystalCells) this.crystals.set(cellKey(c), c);
  }

  private spawnNextPlanned(): Cell | null {
    const cell = this.itemPlan[this.itemsSpawned];
    if (!cell) return null;
    this.items.set(cellKey(cell), cell);
    this.itemsSpawned++;
    return cell;
  }

  /* ---------------- setup ---------------- */

  private pick<T>(arr: T[]): T {
    return arr[Math.floor(this.rand() * arr.length)];
  }

  private shuffle<T>(arr: T[]): T[] {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  private maxStartDist(): number {
    return Math.max(...this.startDist.values());
  }

  /**
   * Which kind of spot the n-th mission item goes in. The first two are out
   * at once (one near, one medium); the rest sprout one at a time as items
   * are picked up — a side pocket, a deep one, and the LAST one always in a
   * risky spot. Longer requirements repeat side/deep before the finale.
   */
  itemRole(index: number): "near" | "medium" | "side" | "deep" | "risky" {
    if (index === 0) return "near";
    if (index === 1) return "medium";
    if (index === this.requiredItems - 1) return "risky";
    return index % 2 === 0 ? "side" : "deep";
  }

  /**
   * Decide every mission item's spot up front. Two are out at a time; each
   * later one is placed relative to where the player will roughly be when it
   * sprouts (the item picked up just before it), so it always sends them
   * back across the maze rather than appearing next to them.
   */
  private planItems(): void {
    const maxS = this.maxStartDist();
    const dS = (c: Cell) => this.startDist.get(cellKey(c)) ?? 0;
    const deg = (c: Cell) => this.grid.degree(c);
    const spawnCells = this.enemies.map((e) => e.spawnCell);
    const nearestSpawn = (c: Cell) => (spawnCells.length ? Math.min(...spawnCells.map((e) => this.grid.dist(e, c))) : 99);

    for (let i = 0; i < this.requiredItems; i++) {
      const role = this.itemRole(i);
      const ref = i >= 2 ? this.itemPlan[i - 2] : this.grid.start;
      const fromRef = this.grid.distances(ref);
      const maxR = Math.max(...fromRef.values());
      const dR = (c: Cell) => fromRef.get(cellKey(c)) ?? 0;
      // never on/near an item that could be on the board at the same time
      const onBoard = this.itemPlan.slice(Math.max(0, i - 2), i);
      const base = this.grid.pathCells.filter(
        (c) =>
          cellKey(c) !== cellKey(this.grid.start) &&
          !this.itemPlan.some((p) => cellKey(p) === cellKey(c)) &&
          onBoard.every((p) => manhattan(p, c) >= 5) &&
          spawnCells.every((sc) => cellKey(sc) !== cellKey(c)),
      );
      const noise = new Map<string, number>();
      const jitter = (c: Cell) => {
        const k = cellKey(c);
        if (!noise.has(k)) noise.set(k, this.rand() * 3);
        return noise.get(k)!;
      };

      let pool: Cell[];
      let score: (c: Cell) => number;
      switch (role) {
        case "near":
          pool = base.filter((c) => dS(c) >= 5 && dS(c) <= Math.max(8, maxS * 0.3));
          score = (c) => (deg(c) <= 2 ? 2 : 0) + jitter(c);
          break;
        case "medium":
          pool = base.filter((c) => dS(c) >= maxS * 0.4 && dS(c) <= maxS * 0.7);
          score = (c) => (deg(c) <= 2 ? 2 : 0) + jitter(c);
          break;
        case "side":
          pool = base.filter((c) => dR(c) >= Math.max(8, maxR * 0.45));
          score = (c) => (deg(c) === 1 ? 8 : deg(c) === 2 ? 3 : 0) + jitter(c);
          break;
        case "deep":
          pool = base.filter((c) => dR(c) >= Math.max(8, maxR * 0.6));
          score = (c) => dR(c) * 0.6 + dS(c) * 0.3 + jitter(c);
          break;
        case "risky":
          pool = base.filter((c) => dR(c) >= Math.max(8, maxR * 0.4));
          // on a junction, in the enemies' home ground — but not on a spawn
          score = (c) => (deg(c) >= 3 ? 5 : 0) - Math.abs(nearestSpawn(c) - 3) * 0.8 + jitter(c);
          break;
      }
      const src = pool.length ? pool : base.filter((c) => dR(c) >= 4);
      const fallback = src.length ? src : base;
      if (!fallback.length) break;
      this.itemPlan.push(fallback.reduce((best, c) => (score(c) > score(best) ? c : best)));
    }
  }

  /**
   * Hearts are a risk/reward detour, never a freebie: not every run gets one,
   * and it's tucked in a dead end or side pocket far from the start.
   */
  private placeHearts(): void {
    const chance = this.difficulty === "hard" ? 0.9 : this.difficulty === "medium" ? 0.8 : 0.7;
    if (this.rand() >= chance) return;
    const maxS = this.maxStartDist();
    const taken = new Set([...this.itemPlan, ...this.crystalCells, this.grid.start].map(cellKey));
    const cands = this.grid.pathCells
      .filter((c) => !taken.has(cellKey(c)) && (this.startDist.get(cellKey(c)) ?? 0) >= maxS * 0.5)
      .map((c) => ({ c, s: (this.grid.degree(c) === 1 ? 6 : this.grid.degree(c) === 2 ? 2 : 0) + this.rand() * 5 }))
      .sort((a, b) => b.s - a.s);
    if (cands.length) this.heartCells.push(cands[0].c);
  }

  /** Power Crystals sit on junctions well out from the start, spread across the maze. */
  private placeCrystals(): void {
    const maxS = this.maxStartDist();
    const cands = this.grid.pathCells.filter(
      (c) =>
        this.grid.degree(c) >= 3 &&
        (this.startDist.get(cellKey(c)) ?? 0) >= maxS * 0.35 &&
        !this.itemPlan.some((p) => cellKey(p) === cellKey(c)),
    );
    const chosen: Cell[] = [];
    for (let i = 0; i < this.tuning.powerCrystals; i++) {
      const ranked = cands
        .filter((c) => !chosen.some((o) => cellKey(o) === cellKey(c)))
        .map((c) => ({
          c,
          s: (chosen.length ? Math.min(...chosen.map((o) => manhattan(o, c))) : this.rand() * 10) + this.rand() * 3,
        }))
        .sort((a, b) => b.s - a.s);
      if (!ranked.length) break;
      chosen.push(ranked[0].c);
    }
    this.crystalCells = chosen;
  }

  /**
   * Coins go where exploring is a DECISION: dead ends (treasure coins, worth
   * more), junctions the enemies patrol through, turns, around the Power
   * Crystals, and the far reaches — not lined up along the safest route.
   */
  private placeCoins(): void {
    const maxS = this.maxStartDist();
    const target = Math.round(this.grid.pathCells.length * 0.22);
    const nearCrystal = (c: Cell) => this.crystalCells.some((x) => manhattan(x, c) <= 2);
    const reserved = new Set([...this.itemPlan, ...this.crystalCells, ...this.heartCells].map(cellKey));
    const isTurn = (c: Cell) => {
      const n = this.grid.neighbours(c);
      return n.length === 2 && n[0].row !== n[1].row && n[0].col !== n[1].col;
    };
    const cands = this.grid.pathCells
      .filter((c) => {
        const k = cellKey(c);
        return (this.startDist.get(k) ?? 0) >= 3 && !reserved.has(k);
      })
      .map((c) => {
        const deg = this.grid.degree(c);
        const d = (this.startDist.get(cellKey(c)) ?? 0) / maxS;
        const s =
          (deg === 1 ? 7 : 0) + (deg >= 3 ? 2 : 0) + (isTurn(c) ? 1.5 : 0) + (nearCrystal(c) ? 2.5 : 0) + d * 3 + this.rand() * 3.5;
        return { c, deg, s };
      })
      .sort((a, b) => b.s - a.s);
    const chosen: Array<{ c: Cell; deg: number }> = [];
    for (const cand of cands) {
      if (chosen.length >= target) break;
      if (chosen.some((o) => manhattan(o.c, cand.c) < 2)) continue;
      chosen.push(cand);
    }
    for (const { c, deg } of chosen) {
      const k = cellKey(c);
      if (this.bankedCoinKeys.has(k)) continue;
      const treasure = deg === 1;
      this.coins.set(k, { cell: c, value: treasure ? TREASURE_COIN_VALUE : COIN_VALUE, treasure });
    }
  }

  /** How many enemies this maze can fairly hold — fewer when there are few loops to escape through. */
  maxFairEnemies(): number {
    return Math.max(2, 2 + Math.floor(this.grid.loopCount() / 2));
  }

  private placeEnemies(cfg: MazeRunConfig): void {
    const [lo, hi] = this.tuning.enemyRange;
    const rolled = lo + Math.floor(this.rand() * (hi - lo + 1));
    const count = cfg.enemyCount ?? Math.min(rolled, this.maxFairEnemies());

    // which creatures: a random pick of the four, no repeats until all four
    // are out, and always at least one hunter (chaser/ambusher)
    let kinds: EnemyKind[] = cfg.enemyKinds ? [...cfg.enemyKinds] : [];
    if (!cfg.enemyKinds) {
      let bag: EnemyKind[] = [];
      for (let i = 0; i < count; i++) {
        if (!bag.length) bag = this.shuffle<EnemyKind>(["flame", "thorn", "snowball", "mushroom"]);
        kinds.push(bag.pop()!);
      }
      if (!kinds.some((k) => k === "flame" || k === "thorn")) kinds[Math.floor(this.rand() * kinds.length)] = this.rand() < 0.5 ? "flame" : "thorn";
    }
    kinds = kinds.slice(0, count);

    // spawns: random but well spread, never near the player's start
    const spawns: Cell[] = cfg.enemySpawns ? [...cfg.enemySpawns] : [];
    if (!cfg.enemySpawns) {
      const spawnable = this.grid.pathCells.filter((c) => (this.startDist.get(cellKey(c)) ?? 0) >= 9 && manhattan(c, this.grid.start) >= 6);
      for (let i = 0; i < count; i++) {
        const pool = spawnable.filter((c) => !spawns.some((s) => cellKey(s) === cellKey(c)));
        if (!pool.length) break;
        if (!spawns.length) {
          spawns.push(this.pick(pool));
          continue;
        }
        const ranked = pool
          .map((c) => ({ c, s: Math.min(...spawns.map((s) => manhattan(s, c))) + this.rand() * 4 }))
          .sort((a, b) => b.s - a.s);
        spawns.push(ranked[0].c);
      }
    }

    const cornerOrder = this.shuffle(this.cornerCells());
    spawns.slice(0, kinds.length).forEach((cell, i) => {
      const kind = kinds[i];
      const personality = ENEMY_KIND_PERSONALITY[kind];
      this.enemies.push({
        id: i,
        kind,
        personality,
        mode: "sleeping",
        spawnCell: { ...cell },
        cell: { ...cell },
        next: null,
        t: 0,
        lastDir: null,
        homeCorner: cornerOrder[i % cornerOrder.length],
        // the wanderer ambles a touch slower — it's the unpredictable one, not the fast one
        msPerCell: this.tuning.enemyMsPerCell + (personality === "wanderer" ? 25 : 0),
        modeTimerMs: FIRST_RELEASE_MS + i * RELEASE_STAGGER_MS,
        wanderPatrolling: true,
        wanderTarget: this.pick(this.grid.pathCells),
        wanderTimerMs: 2500 + this.rand() * 1500,
      });
    });
  }

  /** The open cell nearest each of the four maze corners — SCATTER retreat targets. */
  private cornerCells(): Cell[] {
    const targets: Cell[] = [
      { row: 0, col: 0 },
      { row: 0, col: this.grid.cols - 1 },
      { row: this.grid.rows - 1, col: 0 },
      { row: this.grid.rows - 1, col: this.grid.cols - 1 },
    ];
    return targets.map((t) => this.grid.pathCells.reduce((best, c) => (manhattan(c, t) < manhattan(best, t) ? c : best)));
  }

  /* ---------------- input / queries ---------------- */

  /** Buffered: the player turns this way at the first opportunity, and keeps going until a wall. */
  setWantDir(dir: Dir): void {
    this.player.wantDir = dir;
  }

  /** Fractional (row, col) of the player — for rendering and contact tests. */
  playerPos(): { row: number; col: number } {
    return lerpPos(this.player.cell, this.player.next, this.player.t);
  }

  enemyPos(e: EnemyState): { row: number; col: number } {
    return lerpPos(e.cell, e.next, e.t);
  }

  /** Can this enemy hurt the player right now? */
  isDangerous(e: EnemyState): boolean {
    return e.mode === "active";
  }

  behaviour(e: EnemyState): EnemyBehaviour {
    switch (e.mode) {
      case "sleeping":
        return "spawn";
      case "frightened":
        return "frightened";
      case "returning":
        return "returning";
      case "respawning":
        return "respawn";
      case "active":
        if (this.phase === "scatter") return "scatter";
        if (e.personality === "chaser") return "chase";
        if (e.personality === "ambusher") return "ambush";
        if (e.personality === "flanker") return "flank";
        return e.wanderPatrolling ? "wander" : "chase";
    }
  }

  get invulnerable(): boolean {
    return this.protectMs > 0;
  }

  /* ---------------- tick ---------------- */

  tick(dtMs: number): RunEvent[] {
    const events: RunEvent[] = [];
    // big frame hitches are split so nobody can tunnel through anyone
    let remaining = Math.min(dtMs, 250);
    while (remaining > 0 && (this.status === "playing" || this.status === "dying")) {
      const step = Math.min(remaining, 16);
      remaining -= step;
      this.step(step, events);
    }
    return events;
  }

  private step(dt: number, events: RunEvent[]): void {
    this.timeMs += dt;

    if (this.status === "dying") {
      this.dyingMs -= dt;
      if (this.dyingMs <= 0) this.finishDeath(events);
      return;
    }

    this.protectMs = Math.max(0, this.protectMs - dt);
    if (this.powerMs > 0) {
      this.powerMs = Math.max(0, this.powerMs - dt);
      if (!this.powerEndingSent && this.powerMs <= 1800) {
        this.powerEndingSent = true;
        events.push({ type: "powerEnding" });
      }
      if (this.powerMs === 0) this.endPower(events);
    }

    this.phaseMs += dt;
    const phaseLen = this.phase === "chase" ? this.tuning.chaseMs : this.tuning.scatterMs;
    if (this.phaseMs >= phaseLen) {
      this.phaseMs = 0;
      this.phase = this.phase === "chase" ? "scatter" : "chase";
      events.push({ type: "phase", phase: this.phase });
      // a pacing change is visible: everyone on the board turns around
      for (const e of this.enemies) if (e.mode === "active") this.reverse(e);
    }

    this.stepPlayer(dt, events);
    if (this.status !== "playing") return;

    for (const e of this.enemies) this.stepEnemy(e, dt, events);
    this.checkContact(events);
  }

  private stepPlayer(dt: number, events: RunEvent[]): void {
    const p = this.player;
    const open = (c: Cell, d: Dir | null) => !!d && this.grid.isOpen(c.row + d.dr, c.col + d.dc);

    if (p.next && p.wantDir && p.dir && p.wantDir.dr === -p.dir.dr && p.wantDir.dc === -p.dir.dc) {
      // instant reversal mid-corridor — essential for dodging
      const back = p.cell;
      p.cell = p.next;
      p.next = back;
      p.t = 1 - p.t;
      p.dir = p.wantDir;
    }

    if (!p.next) {
      const d = open(p.cell, p.wantDir) ? p.wantDir : open(p.cell, p.dir) ? p.dir : null;
      if (!d) return;
      p.dir = d;
      p.next = { row: p.cell.row + d.dr, col: p.cell.col + d.dc };
      p.t = 0;
    }

    p.t += dt / PLAYER_MS_PER_CELL;
    while (p.next && p.t >= 1) {
      p.cell = p.next;
      p.t -= 1;
      this.onPlayerArrive(events);
      if (this.status !== "playing") return;
      const d = open(p.cell, p.wantDir) ? p.wantDir : open(p.cell, p.dir) ? p.dir : null;
      if (d) {
        p.dir = d;
        p.next = { row: p.cell.row + d.dr, col: p.cell.col + d.dc };
      } else {
        p.next = null;
        p.t = 0;
      }
    }
  }

  private onPlayerArrive(events: RunEvent[]): void {
    const k = cellKey(this.player.cell);
    const coin = this.coins.get(k);
    if (coin) {
      this.coins.delete(k);
      this.bankedCoinKeys.add(k);
      this.coinsEarned += coin.value;
      events.push({ type: "coin", cell: coin.cell, value: coin.value, treasure: coin.treasure });
    }
    const crystal = this.crystals.get(k);
    if (crystal) {
      this.crystals.delete(k);
      this.startPower();
      events.push({ type: "power", cell: crystal });
    }
    const heart = this.hearts.get(k);
    if (heart) {
      if (this.lives < MAX_LIVES) {
        this.hearts.delete(k);
        this.lives++;
        events.push({ type: "heart", cell: heart, lives: this.lives });
      } else if (this.lastHeartFullKey !== k) {
        // already at max: the Heart stays put for later
        events.push({ type: "heartFull", cell: heart });
      }
    }
    this.lastHeartFullKey = heart && this.lives >= MAX_LIVES ? k : "";
    const item = this.items.get(k);
    if (item) {
      this.items.delete(k);
      this.collected++;
      events.push({ type: "item", cell: item, collected: this.collected });
      if (this.collected >= this.requiredItems) {
        this.status = "won";
        events.push({ type: "won" });
        return;
      }
      const spawned = this.spawnNextPlanned();
      if (spawned) events.push({ type: "itemSpawn", cell: spawned });
    }
  }

  private startPower(): void {
    this.powerMs = POWER_MS;
    this.powerEndingSent = false;
    for (const e of this.enemies) {
      if (e.mode !== "active") continue;
      e.mode = "frightened";
      this.reverse(e);
    }
  }

  private endPower(events: RunEvent[]): void {
    for (const e of this.enemies) if (e.mode === "frightened") e.mode = "active";
    events.push({ type: "powerEnd" });
  }

  /** Turn an enemy around on the spot (mid-tile is fine — it just walks back). */
  private reverse(e: EnemyState): void {
    if (e.next) {
      const back = e.cell;
      e.cell = e.next;
      e.next = back;
      e.t = 1 - e.t;
    }
    e.lastDir = e.lastDir ? { dr: -e.lastDir.dr, dc: -e.lastDir.dc } : null;
  }

  private stepEnemy(e: EnemyState, dt: number, events: RunEvent[]): void {
    if (e.mode === "sleeping") {
      if (this.timeMs >= e.modeTimerMs) {
        e.mode = this.powerMs > 0 ? "frightened" : "active";
        events.push({ type: "enemyWake", enemyId: e.id });
      }
      return;
    }
    if (e.mode === "respawning") {
      e.modeTimerMs -= dt;
      if (e.modeTimerMs <= 0) {
        e.mode = "active";
        e.lastDir = null;
        events.push({ type: "enemyWake", enemyId: e.id });
      }
      return;
    }
    if (e.personality === "wanderer") {
      e.wanderTimerMs -= dt;
      if (e.wanderTimerMs <= 0) {
        e.wanderPatrolling = !e.wanderPatrolling;
        e.wanderTarget = e.wanderPatrolling ? this.pick(this.grid.pathCells) : undefined;
        e.wanderTimerMs = e.wanderPatrolling ? 2600 + this.rand() * 1800 : 3000 + this.rand() * 1500;
      }
    }

    const speed = e.mode === "returning" ? RETURN_MS_PER_CELL : e.mode === "frightened" ? e.msPerCell * FRIGHTENED_SLOWDOWN : e.msPerCell;
    if (!e.next) this.chooseEnemyStep(e);
    if (!e.next) {
      if (e.mode === "returning") this.arriveHome(e, events);
      return;
    }
    e.t += dt / speed;
    while (e.next && e.t >= 1) {
      e.cell = e.next;
      e.t -= 1;
      if (e.mode === "returning" && cellKey(e.cell) === cellKey(e.spawnCell)) {
        e.next = null;
        e.t = 0;
        this.arriveHome(e, events);
        return;
      }
      this.chooseEnemyStep(e);
    }
  }

  private arriveHome(e: EnemyState, events: RunEvent[]): void {
    e.mode = "respawning";
    e.modeTimerMs = ENEMY_RESPAWN_MS;
    e.lastDir = null;
    events.push({ type: "enemyHome", enemyId: e.id });
  }

  /**
   * Maze-ghost stepping, decided once per tile (never per frame): never turn
   * straight back unless it's a dead end, then take whichever open neighbour
   * is fewest real maze steps from this enemy's current target — with a
   * little per-personality randomness at junctions so routes don't become
   * fixed. Frightened enemies flee instead; returning ones head home.
   */
  private chooseEnemyStep(e: EnemyState): void {
    const options = DIRS.filter((d) => this.grid.isOpen(e.cell.row + d.dr, e.cell.col + d.dc));
    if (!options.length) {
      e.next = null;
      return;
    }
    const forward = e.lastDir ? options.filter((d) => !(d.dr === -e.lastDir!.dr && d.dc === -e.lastDir!.dc)) : options;
    const choices = forward.length ? forward : options;
    const stepTo = (d: Dir) => ({ row: e.cell.row + d.dr, col: e.cell.col + d.dc });

    let chosen: Dir;
    if (e.mode === "returning") {
      if (cellKey(e.cell) === cellKey(e.spawnCell)) {
        e.next = null;
        return;
      }
      const home = this.grid.distances(e.spawnCell);
      chosen = options.reduce((best, d) => ((home.get(cellKey(stepTo(d))) ?? 999) < (home.get(cellKey(stepTo(best))) ?? 999) ? d : best));
    } else if (e.mode === "frightened") {
      const fromPlayer = this.grid.distances(this.player.cell);
      chosen =
        choices.length > 1 && this.rand() < 0.25
          ? this.pick(choices)
          : choices.reduce((best, d) => ((fromPlayer.get(cellKey(stepTo(d))) ?? 0) > (fromPlayer.get(cellKey(stepTo(best))) ?? 0) ? d : best));
    } else {
      const jitter = e.personality === "chaser" ? 0.06 : e.personality === "wanderer" ? 0.2 : 0.12;
      if (choices.length > 1 && this.rand() < jitter) {
        chosen = this.pick(choices);
      } else if (e.personality === "wanderer" && e.wanderPatrolling && this.phase === "chase" && choices.length > 1 && this.rand() < 0.5) {
        chosen = this.pick(choices);
      } else {
        const target = chooseTargetCell(
          { personality: e.personality, cell: e.cell, homeCorner: e.homeCorner, wanderPatrolling: e.wanderPatrolling, wanderTarget: e.wanderTarget },
          this.player.cell,
          this.player.dir ? { row: this.player.dir.dr, col: this.player.dir.dc } : { row: 0, col: 0 },
          this.phase,
          (r, c) => this.grid.isOpen(r, c),
        );
        const dist = this.grid.distances(target);
        chosen = choices.reduce((best, d) => ((dist.get(cellKey(stepTo(d))) ?? 999) < (dist.get(cellKey(stepTo(best))) ?? 999) ? d : best));
      }
    }
    e.lastDir = chosen;
    e.next = stepTo(chosen);
  }

  private checkContact(events: RunEvent[]): void {
    const pp = this.playerPos();
    for (const e of this.enemies) {
      if (e.mode !== "active" && e.mode !== "frightened") continue;
      const ep = this.enemyPos(e);
      if (Math.hypot(pp.row - ep.row, pp.col - ep.col) >= COLLIDE_DIST) continue;

      if (e.mode === "frightened") {
        e.mode = "returning";
        this.coinsEarned += ENEMY_CATCH_BONUS;
        events.push({ type: "enemyCaught", enemyId: e.id, bonus: ENEMY_CATCH_BONUS });
        continue;
      }
      if (this.protectMs > 0) continue;

      // exactly one life per catch: the board freezes into the death
      // sequence immediately, so nothing can touch the player again
      this.lives--;
      this.status = "dying";
      this.dyingMs = DEATH_SEQUENCE_MS;
      events.push({ type: "hit", enemyId: e.id, livesLeft: this.lives });
      return;
    }
  }

  /**
   * End of the ~2s death sequence: out of lives → lost; otherwise the attempt
   * resets — mission progress back to 0 with every item back in its original
   * spot, Hearts and Power Crystals back, the power-up cleared, the player at
   * the START with spawn protection, anyone lurking near the start turned
   * around, and the pacing reset to a SCATTER breather. Lives carry over.
   */
  private finishDeath(events: RunEvent[]): void {
    if (this.lives <= 0) {
      this.status = "lost";
      events.push({ type: "lost" });
      return;
    }
    const lostItems = this.collected;
    this.resetAttemptPickups();
    this.player.cell = { ...this.grid.start };
    this.player.next = null;
    this.player.t = 0;
    this.player.dir = null;
    this.player.wantDir = null;
    this.protectMs = RESPAWN_PROTECT_MS;
    if (this.powerMs > 0) {
      this.powerMs = 0;
      this.endPower(events);
    }
    this.phase = "scatter";
    this.phaseMs = 0;
    for (const e of this.enemies) {
      if (e.mode !== "active") continue;
      if (this.grid.dist(e.cell, this.grid.start) <= 6) this.reverse(e);
    }
    this.status = "playing";
    events.push({ type: "respawn", lostItems });
  }
}

function lerpPos(a: Cell, b: Cell | null, t: number): { row: number; col: number } {
  if (!b) return { row: a.row, col: a.col };
  return { row: a.row + (b.row - a.row) * t, col: a.col + (b.col - a.col) * t };
}

/* ---------------- maze deck ---------------- */

/**
 * Shuffle-deck maze selection: draw an unused maze each run until all have
 * been played, then reshuffle — and never let the reshuffle hand back the
 * maze that was just played. `allowed` restricts the pick to mazes that suit
 * the current difficulty tier (skipped ones stay in the deck for later).
 */
export function drawFromDeck(
  deck: string[],
  allIds: string[],
  rand: () => number,
  lastPlayed?: string,
  allowed: (id: string) => boolean = () => true,
): { id: string; deck: string[] } {
  const remaining = deck.filter((id) => allIds.includes(id));
  const idx = remaining.findIndex((id) => allowed(id) && id !== lastPlayed);
  if (idx >= 0) {
    const id = remaining[idx];
    return { id, deck: remaining.filter((_, i) => i !== idx) };
  }
  const fresh = [...allIds];
  for (let i = fresh.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [fresh[i], fresh[j]] = [fresh[j], fresh[i]];
  }
  let pick = fresh.findIndex((id) => allowed(id) && id !== lastPlayed);
  if (pick < 0) pick = fresh.findIndex((id) => allowed(id));
  if (pick < 0) pick = 0;
  const id = fresh[pick];
  return { id, deck: fresh.filter((_, i) => i !== pick) };
}

/** Which maze complexity ratings suit each difficulty tier. */
export const RATINGS_FOR: Record<Difficulty, number[]> = {
  easy: [1, 2],
  medium: [1, 2, 3],
  hard: [2, 3],
};
