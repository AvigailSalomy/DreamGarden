import { describe, expect, it } from "vitest";
import { cutOrganicJigsaw, scatterAround } from "../src/puzzle/organicJigsaw";
import type { Pt } from "../src/puzzle/organicJigsaw";
import { mulberry32 } from "../src/core/rng";
import { FROSTED_CATALOG } from "../src/data/frostedValley";

const same = (a: Pt, b: Pt) => Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;

describe("organic jigsaw cut", () => {
  it("neighbouring pieces share the exact same seam, traced in opposite directions (they interlock)", () => {
    const cut = cutOrganicJigsaw(6, 4, 1200, 650, 1234, 0.6);
    const at = (c: number, r: number) => cut.pieces[r * cut.cols + c];
    for (let r = 0; r < cut.rows; r++) {
      for (let c = 0; c < cut.cols; c++) {
        const p = at(c, r);
        if (c < cut.cols - 1) {
          const q = at(c + 1, r);
          const rev = q.edgePoints.left.slice().reverse();
          expect(p.edgePoints.right.length).toBe(rev.length);
          p.edgePoints.right.forEach((pt, i) => expect(same(pt, rev[i])).toBe(true));
          expect(p.edges.right).toBe(-q.edges.left); // tab on one side = socket on the other
        }
        if (r < cut.rows - 1) {
          const q = at(c, r + 1);
          const rev = q.edgePoints.top.slice().reverse();
          p.edgePoints.bottom.forEach((pt, i) => expect(same(pt, rev[i])).toBe(true));
          expect(p.edges.bottom).toBe(-q.edges.top);
        }
      }
    }
  });

  it("the outer border is flat and straight; every interior edge has a real knob", () => {
    const cut = cutOrganicJigsaw(5, 3, 1000, 545, 99, 0.3);
    for (const p of cut.pieces) {
      for (const side of ["top", "right", "bottom", "left"] as const) {
        const onBorder =
          (side === "top" && p.row === 0) ||
          (side === "bottom" && p.row === cut.rows - 1) ||
          (side === "left" && p.col === 0) ||
          (side === "right" && p.col === cut.cols - 1);
        expect(p.edgePoints[side].length).toBe(onBorder ? 2 : 10);
        expect(p.edges[side] === 0).toBe(onBorder);
      }
    }
    // border edges lie exactly on the board rectangle
    const tl = cut.pieces[0];
    expect(tl.edgePoints.top[0]).toEqual({ x: 0, y: 0 });
    expect(tl.edgePoints.left[0].x).toBe(0);
  });

  it("pieces are not one repeated shape: mixed tab/socket layouts and individually varied knobs", () => {
    const cut = cutOrganicJigsaw(8, 4, 1600, 872, 7, 0.85);
    const layouts = new Set(cut.pieces.map((p) => `${p.edges.top}${p.edges.right}${p.edges.bottom}${p.edges.left}`));
    expect(layouts.size).toBeGreaterThan(8);

    // the knob apex (5th control point) sits at a different spot along each seam
    const apexOffsets = cut.pieces
      .filter((p) => p.edgePoints.right.length === 10)
      .map((p) => Math.round((p.edgePoints.right[4].y - p.edgePoints.right[0].y) * 10));
    expect(new Set(apexOffsets).size).toBeGreaterThan(apexOffsets.length * 0.8);

    // and the knobs are not mirror-symmetric about their own centre
    const knob = cut.pieces[0].edgePoints.right;
    const leftHalf = Math.abs(knob[4].y - knob[3].y);
    const rightHalf = Math.abs(knob[6].y - knob[5].y);
    expect(Math.abs(leftHalf - rightHalf)).toBeGreaterThan(0.01);
  });

  it("higher irregularity wanders further from the plain grid", () => {
    const wander = (irr: number) => {
      const cut = cutOrganicJigsaw(6, 4, 1200, 800, 42, irr);
      let total = 0;
      for (const p of cut.pieces) {
        const c0 = p.edgePoints.top[0];
        total += Math.hypot(c0.x - p.col * 200, c0.y - p.row * 200);
      }
      return total;
    };
    expect(wander(0.9)).toBeGreaterThan(wander(0.1));
  });

  it("is deterministic per seed, and the bounds contain every outline point", () => {
    const a = cutOrganicJigsaw(4, 3, 800, 436, 5, 0.2);
    const b = cutOrganicJigsaw(4, 3, 800, 436, 5, 0.2);
    const c = cutOrganicJigsaw(4, 3, 800, 436, 6, 0.2);
    expect(a.pieces.map((p) => p.path)).toEqual(b.pieces.map((p) => p.path));
    expect(a.pieces.map((p) => p.path)).not.toEqual(c.pieces.map((p) => p.path));
    for (const p of a.pieces) {
      for (const pt of p.outline) {
        expect(pt.x).toBeGreaterThanOrEqual(p.bounds.x - 1e-6);
        expect(pt.y).toBeGreaterThanOrEqual(p.bounds.y - 1e-6);
        expect(pt.x).toBeLessThanOrEqual(p.bounds.x + p.bounds.w + 1e-6);
        expect(pt.y).toBeLessThanOrEqual(p.bounds.y + p.bounds.h + 1e-6);
      }
    }
  });

  it("every catalog puzzle cuts into its configured piece count", () => {
    for (const a of FROSTED_CATALOG) {
      const cut = cutOrganicJigsaw(a.puzzle.cols, a.puzzle.rows, 1920, 1047, 1, a.puzzle.irregularity);
      expect(cut.pieces).toHaveLength(a.puzzle.cols * a.puzzle.rows);
    }
  });
});

describe("scatterAround", () => {
  const area = { x: 0, y: 0, w: 1920, h: 1080 };
  const board = { x: 460, y: 180, w: 1000, h: 545 };

  it("never places a piece on the board or off the table", () => {
    const pts = scatterAround(32, 150, 160, area, board, mulberry32(3));
    expect(pts).toHaveLength(32);
    for (const p of pts) {
      const overlapsBoard = p.x + 75 > board.x && p.x - 75 < board.x + board.w && p.y + 80 > board.y && p.y - 80 < board.y + board.h;
      expect(overlapsBoard).toBe(false);
      expect(p.x - 75).toBeGreaterThanOrEqual(0);
      expect(p.x + 75).toBeLessThanOrEqual(1920);
      expect(p.y - 80).toBeGreaterThanOrEqual(0);
      expect(p.y + 80).toBeLessThanOrEqual(1080);
    }
  });

  it("gives a different table layout on each run (starting positions are randomised)", () => {
    const a = scatterAround(12, 150, 160, area, board, mulberry32(1));
    const b = scatterAround(12, 150, 160, area, board, mulberry32(2));
    expect(a).not.toEqual(b);
  });
});
