import { describe, expect, it } from "vitest";
import { mulberry32 } from "../src/core/rng";
import {
  nearestEmptyCell,
  shuffle,
  sliceGrid,
  trayLayout,
  type Cell,
} from "../src/puzzle/slice";

describe("sliceGrid", () => {
  it("creates cols*rows tiles with covering rects", () => {
    const tiles = sliceGrid(300, 300, { cols: 3, rows: 3 });
    expect(tiles).toHaveLength(9);
    expect(tiles[0]).toMatchObject({ index: 0, col: 0, row: 0, x: 0, y: 0, w: 100, h: 100 });
    expect(tiles[8]).toMatchObject({ index: 8, col: 2, row: 2, x: 200, y: 200 });
    const area = tiles.reduce((s, t) => s + t.w * t.h, 0);
    expect(area).toBeCloseTo(300 * 300);
  });

  it("handles non-square grids and sizes", () => {
    const tiles = sliceGrid(400, 200, { cols: 4, rows: 2 });
    expect(tiles).toHaveLength(8);
    expect(tiles[0].w).toBe(100);
    expect(tiles[0].h).toBe(100);
    expect(tiles[7]).toMatchObject({ col: 3, row: 1, x: 300, y: 100 });
  });
});

describe("shuffle", () => {
  it("is a permutation and does not mutate input", () => {
    const src = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffle(src, mulberry32(3));
    expect(out).toHaveLength(src.length);
    expect([...out].sort((a, b) => a - b)).toEqual(src);
    expect(src).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("is deterministic for a seeded rng", () => {
    expect(shuffle([1, 2, 3, 4, 5], mulberry32(42))).toEqual(
      shuffle([1, 2, 3, 4, 5], mulberry32(42)),
    );
  });
});

describe("nearestEmptyCell", () => {
  const cells: Cell[] = [
    { index: 0, x: 0, y: 0, filled: false },
    { index: 1, x: 100, y: 0, filled: false },
    { index: 2, x: 0, y: 100, filled: false },
  ];

  it("finds the closest empty cell", () => {
    const r = nearestEmptyCell(10, 8, cells);
    expect(r?.cell.index).toBe(0);
    expect(r?.dist).toBeCloseTo(Math.hypot(10, 8));
  });

  it("skips filled cells", () => {
    const r = nearestEmptyCell(5, 2, [{ ...cells[0], filled: true }, cells[1], cells[2]]);
    expect(r?.cell.index).toBe(1);
  });

  it("returns null when everything is filled", () => {
    expect(nearestEmptyCell(0, 0, cells.map((c) => ({ ...c, filled: true })))).toBeNull();
  });
});

describe("trayLayout", () => {
  it("packs items into rows within maxWidth", () => {
    const slots = trayLayout(9, 80, 80, 10, 300);
    expect(slots).toHaveLength(9);
    // 3 per row -> item 3 starts a new row (larger y)
    expect(slots[3].y).toBeGreaterThan(slots[0].y);
    // rows are horizontally centred around 0
    expect(slots[0].x).toBeCloseTo(-(3 * 80 + 2 * 10) / 2 + 40);
  });
});
