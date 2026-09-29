import { describe, expect, it } from "vitest";
import { BLOCK_TILES, enemiesToYield, playerExits } from "../src/core/mazeFairness";
import { generateMaze, MAZE_LEVELS } from "../src/data/maze";

/**
 * Hand-built geometry (tile coords, x across, y down):
 *
 *   a RING corridor around the rectangle (1,1)-(9,7) — plenty of open maze —
 *   and a POCKET corridor leaving the ring's right side at (9,4), running
 *   right along row 4 to a DEAD END at (17,4):
 *
 *     y1  ring top ...............
 *     y4  ring (9,4) -> pocket (10..17,4) -> dead end
 *     y7  ring bottom ............
 */
function pocketMaze() {
  const W = 19, H = 9;
  const walls = Array.from({ length: H }, () => Array(W).fill(true));
  const open = (x: number, y: number) => (walls[y][x] = false);
  for (let x = 1; x <= 9; x++) { open(x, 1); open(x, 7); }
  for (let y = 1; y <= 7; y++) { open(1, y); open(9, y); }
  for (let x = 10; x <= 17; x++) open(x, 4);
  return { walls };
}
const t = (tx: number, ty: number) => ({ tx, ty });

describe("Dream Garden maze fairness — chokepoints and dead ends", () => {
  const g = pocketMaze();

  it("sees the pocket as ONE viable exit (the stub to the dead end doesn't count)", () => {
    const exits = playerExits(g, t(14, 4));
    expect(exits.length).toBe(2);
    expect(exits.filter((e) => e.viable).length).toBe(1);
  });

  it("long corridor, one exit, a single enemy at the corridor mouth → it must yield", () => {
    const y = enemiesToYield(g, t(14, 4), [t(9, 4)]);
    expect(y.enemies).toEqual([0]);
    // the yielding enemy must keep off the escape corridor and its mouth
    expect(y.avoid.has("10,4")).toBe(true);
    expect(y.avoid.has("9,4")).toBe(true);
  });

  it("…and the same holds for the active pursuer when it is the only blocker", () => {
    expect(enemiesToYield(g, t(14, 4), [t(9, 4)], 0).enemies).toEqual([0]);
  });

  it("an enemy far out on the ring does not block the pocket (no needless yielding)", () => {
    expect(enemiesToYield(g, t(14, 4), [t(9, 1)]).enemies).toEqual([]);
  });

  it("player in the dead end + enemy approaching inside the corridor → it must yield", () => {
    expect(enemiesToYield(g, t(17, 4), [t(14, 4)]).enemies).toEqual([0]);
  });

  it("T-junction with one enemy on one branch → the other branch is clear, nobody yields", () => {
    // (9,4): up and down lead around the ring (both viable), right is the pocket stub
    const exits = playerExits(g, t(9, 4));
    expect(exits.filter((e) => e.viable).length).toBe(2);
    expect(enemiesToYield(g, t(9, 4), [t(9, 2)]).enemies).toEqual([]);
  });

  it("two enemies sealing both viable exits → one yields, and it is not the pursuer", () => {
    const y = enemiesToYield(g, t(9, 4), [t(9, 2), t(9, 6)], 0);
    expect(y.enemies).toEqual([1]);
    const y2 = enemiesToYield(g, t(9, 4), [t(9, 2), t(9, 6)], 1);
    expect(y2.enemies).toEqual([0]);
  });

  it("once the player is back out with a clear exit, nobody has to yield", () => {
    // player on the ring top with the old blocker still at the pocket mouth
    expect(enemiesToYield(g, t(5, 1), [t(9, 4)]).enemies).toEqual([]);
  });

  it(`only enemies within ${BLOCK_TILES} tiles of corridor count as blocking`, () => {
    // (9,4) is 5 tiles from (14,4); (9,3) is 6; (9,2) is 7
    expect(enemiesToYield(g, t(14, 4), [t(9, 3)]).enemies).toEqual([0]);
    expect(enemiesToYield(g, t(14, 4), [t(9, 2)]).enemies).toEqual([]);
  });

  it("in every generated Dream Garden maze, yielding always leaves at least one viable exit clear", () => {
    for (const base of Object.values(MAZE_LEVELS)) {
      for (let s = 0; s < 15; s++) {
        const grid = generateMaze({ ...base, seed: 5000 + s * 17 });
        const cells = grid.cellTiles;
        for (let p = 0; p < cells.length; p += 7) {
          const player = cells[p];
          // put an enemy on every neighbouring cell two tiles away (worst case)
          const enemies = [[2, 0], [-2, 0], [0, 2], [0, -2]]
            .map(([dx, dy]) => t(player.tx + dx, player.ty + dy))
            .filter((e) => grid.walls[e.ty]?.[e.tx] === false);
          const y = enemiesToYield(grid, player, enemies);
          const remaining = enemies.filter((_, i) => !y.enemies.includes(i));
          const viable = playerExits(grid, player).filter((e) => e.viable);
          if (!viable.length) continue;
          const clearExists = viable.some((ex) => remaining.every((e) => (ex.branch.get(`${e.tx},${e.ty}`) ?? 99) > BLOCK_TILES));
          expect(clearExists).toBe(true);
        }
      }
    }
  });
});
