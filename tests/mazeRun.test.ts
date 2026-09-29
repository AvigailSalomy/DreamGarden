import { describe, expect, it } from "vitest";
import {
  MazeRun,
  MazeGrid,
  COLLIDE_DIST,
  DEATH_SEQUENCE_MS,
  RESPAWN_PROTECT_MS,
  START_LIVES,
  MAX_LIVES,
  POWER_MS,
  DIFFICULTY,
  ENEMY_CATCH_BONUS,
  drawFromDeck,
  RATINGS_FOR,
  difficultyForOrder,
  cellKey,
} from "../src/data/mazeRun";
import type { Cell, Dir, EnemyState, RunEvent } from "../src/data/mazeRun";
import { MAZE_LAYOUTS } from "../src/data/mazeLayouts";
import { mulberry32 } from "../src/core/rng";
import { playWithBot } from "./mazeBot";

// an open 5×7 room: every interior cell walkable, so collision tests are
// about geometry, not maze topology
const ROOM = ["#######", "#.....#", "#..S..#", "#.....#", "#######"];

const UP: Dir = { dr: -1, dc: 0 };
const DOWN: Dir = { dr: 1, dc: 0 };
const LEFT: Dir = { dr: 0, dc: -1 };
const RIGHT: Dir = { dr: 0, dc: 1 };

function bareRun(layout = ROOM): MazeRun {
  return new MazeRun({ layout, requiredItems: 5, difficulty: "easy", rand: mulberry32(1), enemyCount: 1, enemyKinds: ["flame"], enemySpawns: [{ row: 1, col: 1 }], bare: true });
}

/** Pin an enemy: awake, on `cell`, and too slow to move — so tests control exactly where it is. */
function pinEnemy(e: EnemyState, cell: Cell): void {
  e.mode = "active";
  e.cell = { ...cell };
  e.next = null;
  e.t = 0;
  e.msPerCell = 1e12;
}

function place(run: MazeRun, cell: Cell): void {
  run.player.cell = { ...cell };
  run.player.next = null;
  run.player.t = 0;
  run.player.dir = null;
  run.player.wantDir = null;
}

function tickFor(run: MazeRun, ms: number): RunEvent[] {
  const out: RunEvent[] = [];
  for (let t = 0; t < ms; t += 16) out.push(...run.tick(16));
  return out;
}

/** Step the player onto `target` from an open neighbour (the arrival is what collects things). */
function walkOnto(run: MazeRun, target: Cell): RunEvent[] {
  const from = run.grid.neighbours(target)[0];
  run.player.cell = { ...from };
  run.player.next = { ...target };
  run.player.dir = { dr: target.row - from.row, dc: target.col - from.col };
  run.player.wantDir = null;
  run.player.t = 0.999;
  return run.tick(16);
}

function killPlayer(run: MazeRun): RunEvent[] {
  const e = run.enemies[0];
  const pos = run.player.next && run.player.t > 0.5 ? run.player.next : run.player.cell;
  pinEnemy(e, pos);
  run.protectMs = 0;
  return run.tick(16);
}

describe("collision is same-tile only", () => {
  const dirs: Array<[string, Dir, Dir]> = [
    ["up", UP, DOWN],
    ["down", DOWN, UP],
    ["left", LEFT, RIGHT],
    ["right", RIGHT, LEFT],
  ];

  for (const [name, move, enemySide] of dirs) {
    it(`player moving ${name} with an enemy on the adjacent tile behind it never collides`, () => {
      const run = bareRun();
      const p = { row: 2, col: 3 };
      place(run, p);
      pinEnemy(run.enemies[0], { row: p.row + enemySide.dr, col: p.col + enemySide.dc });
      const stationary = tickFor(run, 300);
      expect(stationary.some((e) => e.type === "hit")).toBe(false);
      run.setWantDir(move);
      const moving = tickFor(run, 600);
      expect(moving.some((e) => e.type === "hit")).toBe(false);
      expect(run.lives).toBe(START_LIVES);
    });

    it(`player moving ${name} INTO an enemy's tile collides, and only once they overlap`, () => {
      const run = bareRun();
      const p = { row: 2, col: 3 };
      place(run, p);
      const target = { row: p.row + move.dr, col: p.col + move.dc };
      pinEnemy(run.enemies[0], target);
      run.setWantDir(move);
      let hitAt = -1;
      for (let i = 0; i < 40 && hitAt < 0; i++) {
        const before = run.playerPos();
        const ev = run.tick(16);
        if (ev.some((e) => e.type === "hit")) {
          hitAt = i;
          const d = Math.hypot(before.row - target.row, before.col - target.col);
          // the frame before contact they were still clearly apart-ish, and the
          // contact itself happened inside the overlap threshold
          expect(d).toBeGreaterThan(COLLIDE_DIST - 0.2);
        }
      }
      expect(hitAt).toBeGreaterThan(0);
      expect(run.lives).toBe(START_LIVES - 1);
    });
  }

  it("walking along a corridor past an enemy on the parallel tile is safe", () => {
    const run = bareRun();
    place(run, { row: 1, col: 1 });
    pinEnemy(run.enemies[0], { row: 2, col: 3 });
    run.setWantDir(RIGHT);
    const ev = tickFor(run, 1200);
    expect(run.player.cell.col).toBeGreaterThanOrEqual(4);
    expect(ev.some((e) => e.type === "hit")).toBe(false);
  });

  it("head-on crossing between tiles still collides (no tunnelling through each other)", () => {
    const run = bareRun();
    place(run, { row: 1, col: 2 });
    const e = run.enemies[0];
    e.mode = "active";
    e.cell = { row: 1, col: 4 };
    e.next = { row: 1, col: 3 };
    e.lastDir = LEFT;
    e.t = 0;
    run.setWantDir(RIGHT);
    const ev = tickFor(run, 800);
    expect(ev.filter((x) => x.type === "hit")).toHaveLength(1);
  });
});

describe("death sequence, respawn and attempt reset", () => {
  function realRun(seed = 3): MazeRun {
    const run = new MazeRun({ layout: MAZE_LAYOUTS[0].rows, requiredItems: 5, difficulty: "easy", rand: mulberry32(seed), enemyCount: 2 });
    // make sure there's a heart to test with
    return run;
  }

  it("a hit removes exactly one life and freezes the board for the death sequence", () => {
    const run = realRun();
    const ev = killPlayer(run);
    expect(ev.filter((e) => e.type === "hit")).toHaveLength(1);
    expect(run.lives).toBe(START_LIVES - 1);
    expect(run.status).toBe("dying");
    const frozenAt = { ...run.player.cell };
    // more contact during the sequence can't cost another life
    const during = tickFor(run, DEATH_SEQUENCE_MS - 100);
    expect(during.some((e) => e.type === "hit")).toBe(false);
    expect(run.lives).toBe(START_LIVES - 1);
    expect(run.player.cell).toEqual(frozenAt); // no instant teleport
  });

  it("after ~2s the player respawns at THIS maze's start with spawn protection", () => {
    const run = realRun();
    killPlayer(run);
    const ev = tickFor(run, DEATH_SEQUENCE_MS + 50);
    expect(ev.some((e) => e.type === "respawn")).toBe(true);
    expect(run.status).toBe("playing");
    expect(run.player.cell).toEqual(run.grid.start);
    expect(run.protectMs).toBeGreaterThan(RESPAWN_PROTECT_MS - 200);
    // protected: an enemy right on top can't hurt
    pinEnemy(run.enemies[0], run.player.cell);
    const protectedTicks = tickFor(run, 400);
    expect(protectedTicks.some((e) => e.type === "hit")).toBe(false);
  });

  it("TEST 1: collect 1 item, die → lives 3→2 and progress 1/5 → 0/5", () => {
    const run = realRun();
    const first = [...run.items.values()][0];
    walkOnto(run, first);
    expect(run.collected).toBe(1);
    killPlayer(run);
    const ev = tickFor(run, DEATH_SEQUENCE_MS + 50);
    expect(run.lives).toBe(2);
    expect(run.collected).toBe(0);
    const respawn = ev.find((e) => e.type === "respawn");
    expect(respawn && respawn.type === "respawn" && respawn.lostItems).toBe(1);
    // the collected item is back in its original spot
    expect(run.items.has(cellKey(first))).toBe(true);
    expect([...run.items.values()]).toEqual(run.itemPlan.slice(0, 2));
  });

  it("TEST 2: 3 items + a Heart, then die → exactly one life lost, 0/5, Heart back, respawned", () => {
    let run = realRun();
    for (let seed = 4; !run.hearts.size; seed++) run = realRun(seed);
    const heart = [...run.hearts.values()][0];
    for (let i = 0; i < 3; i++) walkOnto(run, [...run.items.values()][0]);
    expect(run.collected).toBe(3);
    walkOnto(run, heart);
    expect(run.lives).toBe(4);
    expect(run.hearts.size).toBe(0);
    killPlayer(run);
    tickFor(run, DEATH_SEQUENCE_MS + 50);
    expect(run.lives).toBe(3);
    expect(run.collected).toBe(0);
    expect(run.hearts.has(cellKey(heart))).toBe(true);
    expect(run.player.cell).toEqual(run.grid.start);
  });

  it("TEST 3: all 5 in one life wins — and nothing resets after winning", () => {
    const run = realRun();
    const events: RunEvent[] = [];
    for (let i = 0; i < 5; i++) {
      expect(run.status).toBe("playing");
      events.push(...walkOnto(run, [...run.items.values()][0]));
    }
    expect(events.filter((e) => e.type === "won")).toHaveLength(1);
    expect(run.status).toBe("won");
    expect(run.collected).toBe(5);
    // the sim is frozen once won
    expect(run.tick(1000)).toEqual([]);
    expect(run.collected).toBe(5);
  });

  it("victory never triggers before N/N", () => {
    const run = realRun();
    for (let i = 0; i < 4; i++) {
      const ev = walkOnto(run, [...run.items.values()][0]);
      expect(ev.some((e) => e.type === "won")).toBe(false);
    }
    expect(run.status).toBe("playing");
  });

  it("TEST 4: a Heart at max lives isn't consumed and lives never exceed the cap", () => {
    let run = realRun();
    for (let seed = 4; !run.hearts.size; seed++) run = realRun(seed);
    run.lives = MAX_LIVES;
    const heart = [...run.hearts.values()][0];
    const ev = walkOnto(run, heart);
    expect(run.lives).toBe(MAX_LIVES);
    expect(ev.some((e) => e.type === "heartFull")).toBe(true);
    expect(run.hearts.has(cellKey(heart))).toBe(true);
  });

  it("TEST 5: game over after the last life; a retry is a completely fresh attempt", () => {
    const run = realRun();
    walkOnto(run, [...run.items.values()][0]);
    const coin = [...run.coins.values()][0];
    walkOnto(run, coin.cell);
    for (let i = 0; i < START_LIVES; i++) {
      killPlayer(run);
      tickFor(run, DEATH_SEQUENCE_MS + 50);
    }
    expect(run.status).toBe("lost");
    expect(run.lives).toBe(0);

    // TRY AGAIN = a new run on the same maze, carrying only the paid-out coin cells
    const retry = new MazeRun({ layout: MAZE_LAYOUTS[0].rows, requiredItems: 5, difficulty: "easy", rand: mulberry32(99), bankedCoinKeys: run.bankedCoinKeys });
    expect(retry.lives).toBe(START_LIVES);
    expect(retry.collected).toBe(0);
    expect(retry.status).toBe("playing");
    expect(retry.player.cell).toEqual(retry.grid.start);
    expect(retry.powerMs).toBe(0);
    // the coin already paid into the wallet does not respawn (no double-pay)
    expect(retry.coins.has(cellKey(coin.cell))).toBe(false);
  });

  it("dying never takes away coins already earned", () => {
    const run = realRun();
    const coin = [...run.coins.values()][0];
    walkOnto(run, coin.cell);
    const earned = run.coinsEarned;
    killPlayer(run);
    tickFor(run, DEATH_SEQUENCE_MS + 50);
    expect(run.coinsEarned).toBe(earned);
    // and a paid coin doesn't come back after the death reset either
    expect(run.coins.has(cellKey(coin.cell))).toBe(false);
  });
});

describe("power crystals", () => {
  it("frighten awake enemies; catching one pays a bonus and sends it home, not a life", () => {
    const run = new MazeRun({ layout: MAZE_LAYOUTS[2].rows, requiredItems: 5, difficulty: "easy", rand: mulberry32(8), enemyCount: 2 });
    run.enemies.forEach((e) => (e.mode = "active"));
    const crystal = [...run.crystals.values()][0];
    const ev = walkOnto(run, crystal);
    expect(ev.some((e) => e.type === "power")).toBe(true);
    expect(run.powerMs).toBeGreaterThan(POWER_MS - 100);
    expect(run.enemies.every((e) => e.mode === "frightened")).toBe(true);
    expect(run.enemies.every((e) => run.behaviour(e) === "frightened")).toBe(true);

    const e = run.enemies[0];
    e.cell = { ...run.player.cell };
    e.next = null;
    e.t = 0;
    const livesBefore = run.lives;
    const caught = run.tick(16);
    expect(caught.some((x) => x.type === "enemyCaught")).toBe(true);
    expect(run.lives).toBe(livesBefore);
    expect(run.coinsEarned).toBe(ENEMY_CATCH_BONUS);
    expect(e.mode).toBe("returning");

    // it walks home through the maze, waits, then re-enters
    const back = tickFor(run, 8000);
    expect(back.some((x) => x.type === "enemyHome")).toBe(true);
    expect(["respawning", "active"]).toContain(e.mode);
  });

  it("the power wears off and enemies return to normal", () => {
    const run = new MazeRun({ layout: MAZE_LAYOUTS[2].rows, requiredItems: 5, difficulty: "easy", rand: mulberry32(8), enemyCount: 2 });
    run.enemies.forEach((e) => (e.mode = "active"));
    walkOnto(run, [...run.crystals.values()][0]);
    run.protectMs = 1e9; // don't let a stray contact end the test early
    const ev = tickFor(run, POWER_MS + 200);
    expect(ev.some((e) => e.type === "powerEnding")).toBe(true);
    expect(ev.some((e) => e.type === "powerEnd")).toBe(true);
    expect(run.enemies.some((e) => e.mode === "frightened")).toBe(false);
  });

  it("a death clears an active power-up and puts the crystals back", () => {
    const run = new MazeRun({ layout: MAZE_LAYOUTS[2].rows, requiredItems: 5, difficulty: "easy", rand: mulberry32(8), enemyCount: 2 });
    const crystal = [...run.crystals.values()][0];
    walkOnto(run, crystal);
    // an ACTIVE enemy (e.g. one that woke later) catches the player mid-power
    const e = run.enemies[1];
    pinEnemy(e, run.player.cell);
    run.tick(16);
    expect(run.status).toBe("dying");
    tickFor(run, DEATH_SEQUENCE_MS + 50);
    expect(run.powerMs).toBe(0);
    expect(run.enemies.some((x) => x.mode === "frightened")).toBe(false);
    expect(run.crystals.has(cellKey(crystal))).toBe(true);
  });
});

describe("enemies", () => {
  it("never step into a wall, never jump more than one tile, across every maze", () => {
    for (const m of MAZE_LAYOUTS) {
      const run = new MazeRun({ layout: m.rows, requiredItems: 5, difficulty: "hard", rand: mulberry32(m.name.length) });
      run.protectMs = 1e9;
      const prev = run.enemies.map((e) => ({ ...e.cell }));
      for (let i = 0; i < 1500; i++) {
        run.tick(16);
        if (run.status !== "playing") break;
        run.enemies.forEach((e, j) => {
          expect(run.grid.isOpen(e.cell.row, e.cell.col)).toBe(true);
          if (e.next) {
            expect(run.grid.isOpen(e.next.row, e.next.col)).toBe(true);
            expect(Math.abs(e.next.row - e.cell.row) + Math.abs(e.next.col - e.cell.col)).toBe(1);
          }
          const moved = Math.abs(e.cell.row - prev[j].row) + Math.abs(e.cell.col - prev[j].col);
          // a turn-around swaps cell/next, so 0-1 tiles per frame is all that's allowed
          expect(moved).toBeLessThanOrEqual(1);
          prev[j] = { ...e.cell };
        });
      }
    }
  });

  it("spawn far from the player, asleep, and wake one after another", () => {
    for (const m of MAZE_LAYOUTS) {
      const run = new MazeRun({ layout: m.rows, requiredItems: 5, difficulty: "hard", rand: mulberry32(5) });
      for (const e of run.enemies) {
        expect(run.grid.dist(e.cell, run.grid.start)).toBeGreaterThanOrEqual(9);
        expect(e.mode).toBe("sleeping");
      }
      const wakes = run.enemies.map((e) => e.modeTimerMs);
      expect(new Set(wakes).size).toBe(wakes.length);
    }
  });

  it("the number of enemies varies between runs, within each tier's fair range", () => {
    for (const diff of ["easy", "medium", "hard"] as const) {
      const [lo, hi] = DIFFICULTY[diff].enemyRange;
      const counts = new Set<number>();
      for (let s = 0; s < 40; s++) {
        const run = new MazeRun({ layout: MAZE_LAYOUTS[0].rows, requiredItems: 5, difficulty: diff, rand: mulberry32(s) });
        expect(run.enemies.length).toBeGreaterThanOrEqual(lo);
        expect(run.enemies.length).toBeLessThanOrEqual(hi);
        counts.add(run.enemies.length);
      }
      expect(counts.size).toBeGreaterThan(1);
    }
  });

  it("spawn positions differ between runs", () => {
    const spots = new Set<string>();
    for (let s = 0; s < 10; s++) {
      const run = new MazeRun({ layout: MAZE_LAYOUTS[3].rows, requiredItems: 5, difficulty: "medium", rand: mulberry32(s) });
      spots.add(run.enemies.map((e) => cellKey(e.cell)).join("|"));
    }
    expect(spots.size).toBeGreaterThan(5);
  });

  it("every run has at least one hunter (chaser or ambusher)", () => {
    for (let s = 0; s < 40; s++) {
      const run = new MazeRun({ layout: MAZE_LAYOUTS[1].rows, requiredItems: 5, difficulty: "easy", rand: mulberry32(s) });
      expect(run.enemies.some((e) => e.personality === "chaser" || e.personality === "ambusher")).toBe(true);
    }
  });

  it("alternate SCATTER and CHASE, and personalities chase differently", () => {
    const run = new MazeRun({ layout: MAZE_LAYOUTS[0].rows, requiredItems: 5, difficulty: "hard", rand: mulberry32(2), enemyCount: 4, enemyKinds: ["flame", "thorn", "mushroom", "snowball"] });
    run.enemies.forEach((e) => (e.mode = "active"));
    run.protectMs = 1e9;
    const phases: string[] = [];
    for (let i = 0; i < 2000; i++) for (const e of run.tick(16)) if (e.type === "phase") phases.push(e.phase);
    expect(phases.slice(0, 3)).toEqual(["chase", "scatter", "chase"]);
    const behaviours = new Set(run.enemies.map((e) => (run.phase === "chase" ? run.behaviour(e) : "")));
    if (run.phase === "chase") expect(behaviours.size).toBeGreaterThan(2);
  });
});

describe("item, coin, heart and crystal placement", () => {
  it("mission items are spread out — never all near the start", () => {
    for (const m of MAZE_LAYOUTS) {
      const run = new MazeRun({ layout: m.rows, requiredItems: 5, difficulty: "easy", rand: mulberry32(11) });
      expect(run.itemPlan).toHaveLength(5);
      const dists = run.itemPlan.map((c) => run.grid.dist(c, run.grid.start));
      expect(Math.min(...dists)).toBeGreaterThanOrEqual(5);
      expect(Math.max(...dists)).toBeGreaterThanOrEqual(12);
      expect(new Set(run.itemPlan.map(cellKey)).size).toBe(5);
    }
  });

  it("only two mission items are out at once; the next sprouts as one is picked up", () => {
    const run = new MazeRun({ layout: MAZE_LAYOUTS[0].rows, requiredItems: 5, difficulty: "easy", rand: mulberry32(1) });
    expect(run.items.size).toBe(2);
    const ev = walkOnto(run, [...run.items.values()][0]);
    expect(ev.some((e) => e.type === "itemSpawn")).toBe(true);
    expect(run.items.size).toBe(2);
  });

  it("everything sits on a walkable tile, nothing overlaps, and nothing is on the start", () => {
    for (const m of MAZE_LAYOUTS) {
      for (let s = 0; s < 5; s++) {
        const run = new MazeRun({ layout: m.rows, requiredItems: 6, difficulty: "hard", rand: mulberry32(s) });
        const all = [...run.itemPlan, ...run.crystals.values(), ...run.hearts.values(), ...[...run.coins.values()].map((c) => c.cell)];
        for (const c of all) expect(run.grid.isOpen(c.row, c.col)).toBe(true);
        expect(new Set(all.map(cellKey)).size).toBe(all.length);
        expect(all.some((c) => cellKey(c) === cellKey(run.grid.start))).toBe(false);
      }
    }
  });

  it("coins favour dead ends and junctions, and dead-end coins are worth more", () => {
    let treasures = 0;
    for (const m of MAZE_LAYOUTS) {
      const run = new MazeRun({ layout: m.rows, requiredItems: 5, difficulty: "easy", rand: mulberry32(4) });
      const coins = [...run.coins.values()];
      expect(coins.length).toBeGreaterThan(15);
      for (const c of coins) expect(c.treasure).toBe(run.grid.degree(c.cell) === 1);
      treasures += coins.filter((c) => c.treasure).length;
      // most coins are off the plain straight corridors
      const interesting = coins.filter((c) => run.grid.degree(c.cell) !== 2 || run.grid.neighbours(c.cell).some((n, _, a) => n.row !== a[0].row && n.col !== a[0].col));
      expect(interesting.length / coins.length).toBeGreaterThan(0.5);
    }
    expect(treasures).toBeGreaterThan(5);
  });

  it("hearts don't appear in every single run, and sit far from the start", () => {
    let with1 = 0;
    for (let s = 0; s < 40; s++) {
      const run = new MazeRun({ layout: MAZE_LAYOUTS[4].rows, requiredItems: 5, difficulty: "easy", rand: mulberry32(s) });
      if (run.hearts.size) {
        with1++;
        const h = [...run.hearts.values()][0];
        expect(run.grid.dist(h, run.grid.start)).toBeGreaterThanOrEqual(6);
      }
    }
    expect(with1).toBeGreaterThan(10);
    expect(with1).toBeLessThan(40);
  });
});

describe("whole runs", () => {
  it("a bot can finish runs on every maze (nothing is unwinnable)", () => {
    for (const m of MAZE_LAYOUTS) {
      let won = false;
      for (let s = 0; s < 12 && !won; s++) {
        const run = new MazeRun({ layout: m.rows, requiredItems: 5, difficulty: "easy", rand: mulberry32(s * 31 + 1) });
        won = playWithBot(run, { maxMs: 200_000 }).status === "won";
      }
      expect(won, `no bot win on ${m.id}`).toBe(true);
    }
  }, 120_000);
});

describe("maze deck", () => {
  const ids = MAZE_LAYOUTS.map((m) => m.id);

  it("plays all 10 before any repeats, then reshuffles", () => {
    const rand = mulberry32(7);
    let deck: string[] = [];
    let last: string | undefined;
    const firstTen: string[] = [];
    for (let i = 0; i < 10; i++) {
      const d = drawFromDeck(deck, ids, rand, last);
      firstTen.push(d.id);
      deck = d.deck;
      last = d.id;
    }
    expect(new Set(firstTen).size).toBe(10);
    const next = drawFromDeck(deck, ids, rand, last);
    expect(next.id).not.toBe(last);
    expect(next.deck).toHaveLength(9);
  });

  it("different sessions don't start with the same maze", () => {
    const firsts = new Set<string>();
    for (let s = 0; s < 20; s++) firsts.add(drawFromDeck([], ids, mulberry32(s)).id);
    expect(firsts.size).toBeGreaterThan(4);
  });

  it("respects the difficulty tier's allowed ratings without losing the skipped mazes", () => {
    const easy = (id: string) => RATINGS_FOR.easy.includes(MAZE_LAYOUTS.find((m) => m.id === id)!.rating);
    const hard = (id: string) => RATINGS_FOR.hard.includes(MAZE_LAYOUTS.find((m) => m.id === id)!.rating);
    const rand = mulberry32(3);
    let deck: string[] = [];
    let last: string | undefined;
    for (let i = 0; i < 30; i++) {
      const d = drawFromDeck(deck, ids, rand, last, easy);
      expect(easy(d.id)).toBe(true);
      expect(d.id).not.toBe(last);
      deck = d.deck;
      last = d.id;
    }
    for (let i = 0; i < 30; i++) {
      const d = drawFromDeck(deck, ids, rand, last, hard);
      expect(hard(d.id)).toBe(true);
      deck = d.deck;
      last = d.id;
    }
  });

  it("ignores stale ids from an old save", () => {
    const d = drawFromDeck(["gone-maze", ids[3]], ids, mulberry32(1));
    expect(d.id).toBe(ids[3]);
  });
});

describe("difficulty", () => {
  it("rescue order maps to easy / medium / hard", () => {
    expect([0, 1, 2, 3, 4, 5].map(difficultyForOrder)).toEqual(["easy", "easy", "medium", "medium", "hard", "hard"]);
  });

  it("harder tiers mean more enemies and only a small speed change", () => {
    expect(DIFFICULTY.hard.enemyRange[0]).toBeGreaterThan(DIFFICULTY.easy.enemyRange[0]);
    expect(DIFFICULTY.easy.enemyMsPerCell / DIFFICULTY.hard.enemyMsPerCell).toBeLessThan(1.2);
  });
});

describe("MazeGrid", () => {
  it("distance is symmetric and walls are never reachable", () => {
    const g = new MazeGrid(MAZE_LAYOUTS[5].rows);
    const a = g.pathCells[3];
    const b = g.pathCells[g.pathCells.length - 4];
    expect(g.dist(a, b)).toBe(g.dist(b, a));
    for (const k of g.distances(a).keys()) {
      const [r, c] = k.split(",").map(Number);
      expect(g.isOpen(r, c)).toBe(true);
    }
  });
});
