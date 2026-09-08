import { describe, expect, it } from "vitest";
import { edgeGrid, piecePath, pieceBounds } from "../src/puzzle/jigsaw";
import { hashStr } from "../src/core/rng";

const GRIDS: Array<[number, number]> = [
  [2, 2],
  [2, 3],
  [3, 2],
];

describe("edgeGrid — deterministic jigsaw cut", () => {
  it("produces cols*rows pieces", () => {
    for (const [c, r] of GRIDS) {
      expect(edgeGrid(c, r, 1)).toHaveLength(c * r);
    }
  });

  it("is deterministic for a seed", () => {
    expect(edgeGrid(2, 3, 42)).toEqual(edgeGrid(2, 3, 42));
    expect(edgeGrid(2, 3, 42)).not.toEqual(edgeGrid(2, 3, 43));
  });

  it("the outer border is always flat (0)", () => {
    for (const [cols, rows] of GRIDS) {
      const pieces = edgeGrid(cols, rows, 7);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const p = pieces[r * cols + c];
          if (r === 0) expect(p.top).toBe(0);
          if (r === rows - 1) expect(p.bottom).toBe(0);
          if (c === 0) expect(p.left).toBe(0);
          if (c === cols - 1) expect(p.right).toBe(0);
        }
      }
    }
  });

  it("every internal seam is a tab (+1) or socket (-1)", () => {
    const [cols, rows] = [3, 2];
    const pieces = edgeGrid(cols, rows, 9);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const p = pieces[r * cols + c];
        if (r < rows - 1) expect(Math.abs(p.bottom)).toBe(1);
        if (c < cols - 1) expect(Math.abs(p.right)).toBe(1);
      }
    }
  });

  it("adjacent pieces share INVERSE edges (they interlock)", () => {
    for (const [cols, rows] of GRIDS) {
      for (let seed = 0; seed < 20; seed++) {
        const pieces = edgeGrid(cols, rows, seed);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const me = pieces[r * cols + c];
            if (c < cols - 1) {
              const right = pieces[r * cols + c + 1];
              expect(me.right).toBe(-right.left);
            }
            if (r < rows - 1) {
              const below = pieces[(r + 1) * cols + c];
              expect(me.bottom).toBe(-below.top);
            }
          }
        }
      }
    }
  });

  it("matches the game's per-puzzle seed convention", () => {
    const a = edgeGrid(2, 2, hashStr("rabbit_portrait:0"));
    const b = edgeGrid(2, 2, hashStr("rabbit_portrait:0"));
    expect(a).toEqual(b);
  });
});

describe("piecePath / pieceBounds", () => {
  const edges = edgeGrid(2, 2, 3);

  it("produces a closed, non-trivial path for each piece", () => {
    for (const e of edges) {
      const d = piecePath(e, 100, 100, 22, 30, 30);
      expect(d.startsWith("M ")).toBe(true);
      expect(d.trim().endsWith("Z")).toBe(true);
      expect(d.length).toBeGreaterThan(40);
    }
  });

  it("knobs extend past the base cell on tab edges only", () => {
    for (const e of edges) {
      const b = pieceBounds(e, 100, 100, 20);
      expect(b.left).toBeLessThanOrEqual(-50);
      expect(b.right).toBeGreaterThanOrEqual(50);
      // a flat/border edge never pushes past the base half-extent
      if (e.left !== 1) expect(b.left).toBe(-50);
      if (e.right !== 1) expect(b.right).toBe(50);
      if (e.top !== 1) expect(b.top).toBe(-50);
      if (e.bottom !== 1) expect(b.bottom).toBe(50);
      // a tab edge pushes out by ~1.75 * tab
      if (e.left === 1) expect(b.left).toBeCloseTo(-50 - 20 * 1.75);
    }
  });
});
