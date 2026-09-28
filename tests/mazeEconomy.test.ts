import { describe, expect, it } from "vitest";
import { MazeRunRewards } from "../src/core/MazeRunRewards";
import { generateMaze, MAZE_LEVELS } from "../src/data/maze";
import { mazeCoinTiles } from "../src/data/mazeCoins";
import { MAZE_ECONOMY } from "../src/data/economy";

describe("maze shared-currency receipts", () => {
  it("keeps physically collected coins on failure/abandon, without resource rewards or duplicate callbacks", () => {
    let balance = 0, resources = 0;
    const run = new MazeRunRewards(n => balance += n, () => resources++);
    expect(run.collect("a", 2)).toBe(true);
    expect(run.collect("a", 2)).toBe(false);
    run.finish(false); run.finish(true); run.collect("b", 2);
    expect(balance).toBe(2); expect(resources).toBe(0);
  });
  it("awards a successful run only once; retry requires fresh physical pickups", () => {
    let balance = 0, resources = 0;
    const create = () => new MazeRunRewards(n => balance += n, () => resources += 5);
    const first = create(); first.collect("a", 2); first.finish(true); first.finish(true);
    const retry = create(); expect(balance).toBe(2); retry.collect("a", 2); retry.finish(false);
    expect(balance).toBe(4); expect(resources).toBe(5);
  });
  for (const difficulty of ["easy", "medium", "hard"] as const) it(`${difficulty}: deterministic exploration coins on unique open unoccupied tiles`, () => {
    const grid = generateMaze(MAZE_LEVELS[difficulty]);
    const targets = grid.cellTiles.slice(5, 10);
    const occupied = new Set(targets.map(t => `${t.tx},${t.ty}`));
    const coins = mazeCoinTiles(grid, difficulty, occupied, targets);
    expect(coins).toEqual(mazeCoinTiles(grid, difficulty, occupied, targets));
    expect(coins.length).toBe(MAZE_ECONOMY[difficulty].count);
    expect(new Set(coins.map(t => `${t.tx},${t.ty}`)).size).toBe(coins.length);
    for (const t of coins) {
      expect(grid.walls[t.ty][t.tx]).toBe(false);
      expect(occupied.has(`${t.tx},${t.ty}`)).toBe(false);
      expect(t).not.toEqual(grid.cellTiles[0]);
    }
    expect(coins.some(t => t.ty > grid.tileRows / 2)).toBe(true);
  });
});
