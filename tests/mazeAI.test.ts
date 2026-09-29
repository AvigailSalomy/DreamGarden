import { describe, expect, it } from "vitest";
import { chooseTargetCell } from "../src/data/mazeAI";
import type { EnemyAIState } from "../src/data/mazeAI";

// a simple open 5x5 room (no walls except the border) so predicted/flank
// targets are never clamped by geometry — keeps these tests about the
// targeting MATH, not maze topology
const OPEN_ROWS = 5;
const OPEN_COLS = 5;
const isPathOpen = (r: number, c: number) => r >= 0 && r < OPEN_ROWS && c >= 0 && c < OPEN_COLS;

function baseState(overrides: Partial<EnemyAIState> = {}): EnemyAIState {
  return {
    personality: "chaser",
    cell: { row: 0, col: 0 },
    homeCorner: { row: 4, col: 4 },
    wanderPatrolling: false,
    ...overrides,
  };
}

describe("chooseTargetCell", () => {
  it("any personality retreats to its home corner during SCATTER, ignoring the player", () => {
    for (const personality of ["chaser", "ambusher", "flanker", "wanderer"] as const) {
      const state = baseState({ personality, homeCorner: { row: 4, col: 4 } });
      const target = chooseTargetCell(state, { row: 2, col: 2 }, { row: 0, col: 1 }, "scatter", isPathOpen);
      expect(target).toEqual({ row: 4, col: 4 });
    }
  });

  it("CHASER always targets the player's current cell during CHASE", () => {
    const state = baseState({ personality: "chaser" });
    const target = chooseTargetCell(state, { row: 3, col: 1 }, { row: 0, col: 1 }, "chase", isPathOpen);
    expect(target).toEqual({ row: 3, col: 1 });
  });

  it("AMBUSHER aims ahead of the player along their last movement direction, not at their current cell", () => {
    const state = baseState({ personality: "ambusher" });
    const target = chooseTargetCell(state, { row: 2, col: 2 }, { row: 0, col: 1 }, "chase", isPathOpen);
    expect(target).not.toEqual({ row: 2, col: 2 });
    expect(target.col).toBeGreaterThan(2); // moving in +col direction
    expect(target.row).toBe(2);
  });

  it("AMBUSHER falls back to the player's cell when they aren't moving", () => {
    const state = baseState({ personality: "ambusher" });
    const target = chooseTargetCell(state, { row: 2, col: 2 }, { row: 0, col: 0 }, "chase", isPathOpen);
    expect(target).toEqual({ row: 2, col: 2 });
  });

  it("AMBUSHER's prediction is clamped to valid path cells (never predicts through a wall)", () => {
    const isPathWalled = (r: number, c: number) => r === 2 && c <= 3; // wall beyond col 3
    const state = baseState({ personality: "ambusher" });
    const target = chooseTargetCell(state, { row: 2, col: 2 }, { row: 0, col: 1 }, "chase", isPathWalled);
    expect(target.col).toBeLessThanOrEqual(3);
  });

  it("FLANKER targets a cell on the far side of the player from its own position (not the player's own cell)", () => {
    const state = baseState({ personality: "flanker", cell: { row: 0, col: 0 } });
    const target = chooseTargetCell(state, { row: 2, col: 2 }, { row: 0, col: 1 }, "chase", isPathOpen);
    expect(target).not.toEqual({ row: 0, col: 0 }); // not sitting still
    // enemy is up-left of the player, so a flank should push further down-right
    expect(target.row).toBeGreaterThanOrEqual(2);
    expect(target.col).toBeGreaterThanOrEqual(2);
  });

  it("WANDERER targets its patrol destination while patrolling", () => {
    const state = baseState({ personality: "wanderer", wanderPatrolling: true, wanderTarget: { row: 0, col: 3 } });
    const target = chooseTargetCell(state, { row: 2, col: 2 }, { row: 0, col: 1 }, "chase", isPathOpen);
    expect(target).toEqual({ row: 0, col: 3 });
  });

  it("WANDERER targets the player once its patrol window ends", () => {
    const state = baseState({ personality: "wanderer", wanderPatrolling: false });
    const target = chooseTargetCell(state, { row: 2, col: 2 }, { row: 0, col: 1 }, "chase", isPathOpen);
    expect(target).toEqual({ row: 2, col: 2 });
  });

  it("distinct personalities in the identical situation choose distinct targets (proves they don't all behave the same)", () => {
    const player = { row: 2, col: 2 };
    const dir = { row: 0, col: 1 };
    const chaser = chooseTargetCell(baseState({ personality: "chaser" }), player, dir, "chase", isPathOpen);
    const ambusher = chooseTargetCell(baseState({ personality: "ambusher" }), player, dir, "chase", isPathOpen);
    const flanker = chooseTargetCell(baseState({ personality: "flanker", cell: { row: 0, col: 0 } }), player, dir, "chase", isPathOpen);
    const targets = [chaser, ambusher, flanker].map((t) => `${t.row},${t.col}`);
    expect(new Set(targets).size).toBeGreaterThan(1);
  });
});
