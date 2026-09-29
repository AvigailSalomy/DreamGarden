import { describe, expect, it } from "vitest";
import { MAZE_LAYOUTS, MAZE_COLS, MAZE_ROWS } from "../src/data/mazeLayouts";
import { MazeGrid } from "../src/data/mazeRun";

describe("the ten handcrafted mazes", () => {
  it("there are exactly 10, with unique ids and names", () => {
    expect(MAZE_LAYOUTS).toHaveLength(10);
    expect(new Set(MAZE_LAYOUTS.map((m) => m.id)).size).toBe(10);
    expect(new Set(MAZE_LAYOUTS.map((m) => m.name)).size).toBe(10);
  });

  for (const m of MAZE_LAYOUTS) {
    describe(m.name, () => {
      const g = new MazeGrid(m.rows);

      it("is a full 19×13 grid with a solid border and exactly one start", () => {
        expect(m.rows).toHaveLength(MAZE_ROWS);
        for (const row of m.rows) expect(row).toHaveLength(MAZE_COLS);
        expect(m.rows[0]).toMatch(/^#+$/);
        expect(m.rows[MAZE_ROWS - 1]).toMatch(/^#+$/);
        for (const row of m.rows) {
          expect(row[0]).toBe("#");
          expect(row[MAZE_COLS - 1]).toBe("#");
        }
        expect(m.rows.join("").split("S")).toHaveLength(2);
      });

      it("has no unreachable areas", () => {
        expect(g.distances(g.start).size).toBe(g.pathCells.length);
      });

      it("has loops (alternate routes), junctions and dead ends", () => {
        expect(g.loopCount()).toBeGreaterThanOrEqual(5);
        expect(g.pathCells.filter((c) => g.degree(c) >= 3).length).toBeGreaterThanOrEqual(10);
        expect(g.pathCells.filter((c) => g.degree(c) === 1).length).toBeGreaterThanOrEqual(2);
      });

      it("is corridors, not open plazas (no 2×2 open blocks)", () => {
        for (let r = 0; r < MAZE_ROWS - 1; r++) {
          for (let c = 0; c < MAZE_COLS - 1; c++) {
            const open = [g.isOpen(r, c), g.isOpen(r + 1, c), g.isOpen(r, c + 1), g.isOpen(r + 1, c + 1)];
            expect(open.every(Boolean), `${m.id} open block at ${r},${c}`).toBe(false);
          }
        }
      });
    });
  }

  it("are structurally different from each other, not near-copies", () => {
    for (let i = 0; i < MAZE_LAYOUTS.length; i++) {
      for (let j = i + 1; j < MAZE_LAYOUTS.length; j++) {
        const a = MAZE_LAYOUTS[i].rows.join("");
        const b = MAZE_LAYOUTS[j].rows.join("");
        let diff = 0;
        for (let k = 0; k < a.length; k++) if ((a[k] === "#") !== (b[k] === "#")) diff++;
        expect(diff, `${MAZE_LAYOUTS[i].id} vs ${MAZE_LAYOUTS[j].id}`).toBeGreaterThan(30);
      }
    }
  });
});
