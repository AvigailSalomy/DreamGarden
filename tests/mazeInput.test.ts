import { describe, expect, it } from "vitest";
import { MazeRun, TURN_BUFFER_TILES, LATE_TURN_T } from "../src/data/mazeRun";
import type { Dir } from "../src/data/mazeRun";
import { MAZE_LAYOUTS } from "../src/data/mazeLayouts";
import { mulberry32 } from "../src/core/rng";

/**
 * Player steering rules (the arrow-key behaviour). Uses Frozen Garden:
 * row 3 is one corridor, cols 1-17, with openings UP at cols 1,4,8,10,14,17;
 * row 1 cols 10-17 has DOWN openings at cols 10, 14, 17 (none at 11-13).
 */
const GARDEN = MAZE_LAYOUTS.find((m) => m.id === "frozen-garden")!.rows;
const RIGHT: Dir = { dr: 0, dc: 1 };
const LEFT: Dir = { dr: 0, dc: -1 };
const UP: Dir = { dr: -1, dc: 0 };
const DOWN: Dir = { dr: 1, dc: 0 };

function calmRun(row: number, col: number): MazeRun {
  const run = new MazeRun({ layout: GARDEN, requiredItems: 5, difficulty: "easy", rand: mulberry32(1), bare: true, enemyCount: 1, enemyKinds: ["flame"], enemySpawns: [{ row: 11, col: 1 }] });
  run.enemies[0].modeTimerMs = Number.MAX_SAFE_INTEGER; // stays asleep
  const p = run.player;
  p.cell = { row, col };
  p.next = null;
  p.t = 0;
  p.dir = null;
  p.wantDir = null;
  return run;
}

function runUntil(run: MazeRun, pred: () => boolean, maxMs = 5000): number {
  let t = 0;
  while (!pred() && t < maxMs) {
    run.tick(16);
    t += 16;
  }
  return t;
}

describe("buffered turns (measured in tiles travelled, not time)", () => {
  // row 3: UP openings at cols 4 and 8 — four tiles apart, nothing in between
  for (const early of [1, 2, 2.9]) {
    it(`a turn tapped ${early} tiles before a narrow opening is remembered and taken there`, () => {
      const run = calmRun(3, 4);
      run.setWantDir(RIGHT);
      runUntil(run, () => run.playerPos().col >= 8 - early);
      run.setWantDir(UP);
      runUntil(run, () => run.playerPos().row < 2.5, 3000);
      expect(run.playerPos().row).toBeLessThan(2.5);
      expect(Math.round(run.playerPos().col)).toBe(8);
    });
  }

  it(`a tapped turn with no opening within ${TURN_BUFFER_TILES} tiles is dropped — no surprise turn further on`, () => {
    const run = calmRun(3, 4);
    run.setWantDir(RIGHT);
    runUntil(run, () => run.playerPos().col > 4.6); // past col 4's late-turn window; col 8 is 3.4 tiles on
    run.setWantDir(UP);
    runUntil(run, () => run.playerPos().col > 10.5 || run.playerPos().row < 2.9, 4000);
    expect(run.playerPos().row).toBeCloseTo(3);
    expect(run.player.wantDir).toBeNull();
  });

  it("standing still never uses the buffer up", () => {
    const run = calmRun(1, 1); // corner: Up is a wall
    run.setWantDir(UP);
    runUntil(run, () => false, 3000);
    expect(run.player.next).toBeNull();
    expect(run.player.wantDir).toEqual(UP);
  });

  it("a HELD turn is kept until an opening comes, however far", () => {
    const run = calmRun(3, 4);
    run.setWantDir(RIGHT);
    runUntil(run, () => run.playerPos().col > 4.6);
    run.setWantDir(UP, true);
    runUntil(run, () => run.playerPos().row < 2.5, 4000);
    expect(Math.round(run.playerPos().col)).toBe(8);
  });

  it(`releasing a held turn gives it ${TURN_BUFFER_TILES} more tiles, then drops it`, () => {
    const run = calmRun(3, 4);
    run.setWantDir(RIGHT);
    runUntil(run, () => run.playerPos().col > 4.6);
    run.setWantDir(UP, true);
    run.tick(16);
    run.releaseWantDir(UP);
    runUntil(run, () => run.playerPos().col > 10.5 || run.playerPos().row < 2.9, 4000);
    expect(run.playerPos().row).toBeCloseTo(3);
  });

  it("releasing a DIFFERENT key doesn't cancel the held turn", () => {
    const run = calmRun(3, 4);
    run.setWantDir(RIGHT);
    runUntil(run, () => run.playerPos().col > 4.6);
    run.setWantDir(UP, true);
    run.releaseWantDir(LEFT);
    runUntil(run, () => run.playerPos().row < 2.5, 4000);
    expect(Math.round(run.playerPos().col)).toBe(8);
  });

  it("turn, then straight-ahead again, cancels the turn (no stale turn); asking again re-arms it", () => {
    const run = calmRun(3, 4);
    run.setWantDir(RIGHT);
    runUntil(run, () => run.playerPos().col >= 5.2);
    run.setWantDir(UP);
    run.tick(16);
    run.setWantDir(RIGHT);
    runUntil(run, () => run.playerPos().col > 8.6 || run.playerPos().row < 2.9, 2000);
    expect(run.playerPos().row).toBeCloseTo(3); // ran straight past col 8

    const again = calmRun(3, 4);
    again.setWantDir(RIGHT);
    runUntil(again, () => again.playerPos().col >= 5.2);
    again.setWantDir(UP);
    again.tick(16);
    again.setWantDir(RIGHT);
    runUntil(again, () => again.playerPos().col >= 6.8);
    again.setWantDir(UP);
    runUntil(again, () => again.playerPos().row < 2.5, 2000);
    expect(Math.round(again.playerPos().col)).toBe(8);
  });
});

describe("late turns", () => {
  it(`a turn pressed just after passing a junction (within ${LATE_TURN_T} of a tile) steps back and takes it`, () => {
    const run = calmRun(3, 6);
    run.setWantDir(LEFT);
    runUntil(run, () => run.playerPos().col < 3.85);
    expect(run.playerPos().col).toBeGreaterThan(3.7);
    run.setWantDir(UP);
    runUntil(run, () => run.playerPos().row < 2.5, 2000);
    expect(Math.round(run.playerPos().col)).toBe(4);
  });

  it("a turn pressed well past a junction does NOT jump back (it waits for the next opening)", () => {
    const run = calmRun(3, 7);
    run.setWantDir(LEFT);
    runUntil(run, () => run.playerPos().col < 3.4); // 0.6 of a tile past col 4
    run.setWantDir(UP, true);
    runUntil(run, () => run.playerPos().row < 2.5, 3000);
    expect(Math.round(run.playerPos().col)).toBe(1);
  });

  it("the late-turn step-back never moves the player through a wall", () => {
    for (let startCol = 2; startCol <= 16; startCol++) {
      for (const d of [UP, DOWN]) {
        const run = calmRun(3, startCol);
        run.setWantDir(RIGHT);
        for (let i = 0; i < 60; i++) {
          run.tick(16);
          if (i % 7 === 0) run.setWantDir(d);
          const p = run.player;
          expect(run.grid.isOpen(p.cell.row, p.cell.col)).toBe(true);
          if (p.next) expect(run.grid.isOpen(p.next.row, p.next.col)).toBe(true);
        }
      }
    }
  });
});

describe("reversal and walls", () => {
  it("reversal is instant mid-tile", () => {
    const run = calmRun(3, 6);
    run.setWantDir(RIGHT);
    runUntil(run, () => run.playerPos().col > 6.5);
    const before = run.playerPos().col;
    run.setWantDir(LEFT);
    run.tick(16);
    expect(run.player.dir).toEqual(LEFT);
    expect(run.playerPos().col).toBeLessThan(before);
  });

  it("pressing into a wall then a valid direction moves the valid way at once", () => {
    const run = calmRun(1, 1);
    run.setWantDir(UP);
    run.tick(16);
    run.setWantDir(LEFT);
    run.tick(16);
    expect(run.player.next).toBeNull();
    run.setWantDir(RIGHT);
    run.tick(16);
    expect(run.player.dir).toEqual(RIGHT);
    expect(run.player.next).toEqual({ row: 1, col: 2 });
  });

  it("the last of a rapid burst of keys always wins", () => {
    const run = calmRun(3, 4);
    for (const d of [RIGHT, LEFT, UP, DOWN, RIGHT, UP, LEFT, DOWN, RIGHT]) {
      run.setWantDir(d);
      run.tick(40);
    }
    runUntil(run, () => false, 500);
    expect(run.player.dir).toEqual(RIGHT);
  });

  it("nothing moves once the run is over", () => {
    const run = calmRun(3, 6);
    run.status = "won";
    run.setWantDir(RIGHT);
    run.tick(500);
    expect(run.playerPos()).toEqual({ row: 3, col: 6 });
  });
});
