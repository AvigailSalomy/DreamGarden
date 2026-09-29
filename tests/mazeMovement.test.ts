import { describe, expect, it } from "vitest";
import { circleHitsWall, facingFlipX, moveWithCollision, type CollisionGrid } from "../src/core/mazeMovement";

const C = 64;
const R = 20;

/** '#' wall, '.' open. */
function grid(rows: string[]): CollisionGrid {
  return { walls: rows.map((r) => [...r].map((c) => c === "#")), tileCols: rows[0].length, tileRows: rows.length };
}
const centre = (t: number) => t * C + C / 2;

// A vertical corridor (column 1) with a junction at row 1 that opens RIGHT
// into a horizontal corridor, and continues DOWN to row 3.
const JUNCTION = grid([
  "#####",
  "#...#",
  "#.###",
  "#.###",
  "#####",
]);

describe("maze movement — the 'cannot move right' failure mode", () => {
  it("reproduces the geometry: a player slightly below the junction line is blocked by the diagonal wall", () => {
    const x = centre(1) + 30; // at the column edge, as found by the in-game sweep
    const y = centre(1) + 14; // came down the corridor a little past the junction
    expect(circleHitsWall(JUNCTION, C, x, y, R)).toBe(false); // a legal place to stand
    expect(circleHitsWall(JUNCTION, C, x + 3, y, R)).toBe(true); // plain right move hits the corner block
  });

  it("holding Right from that spot eases the player onto the corridor line and then moves right", () => {
    let p = { x: centre(1) + 30, y: centre(1) + 14 };
    for (let i = 0; i < 40; i++) p = moveWithCollision(JUNCTION, C, p.x, p.y, 3, 0, R);
    // eased up only as far as needed to clear the corner block (not a snap to centre)...
    expect(p.y).toBeLessThan(centre(1) + 14);
    expect(p.y).toBeGreaterThanOrEqual(centre(1));
    // ...and actually travelled right along the corridor
    expect(p.x).toBeGreaterThan(centre(2));
  });

  it("never moves the player into a wall while cornering", () => {
    for (let oy = -30; oy <= 30; oy++) {
      for (let ox = -12; ox <= 12; ox += 3) {
        let p = { x: centre(1) + ox, y: centre(1) + oy };
        if (circleHitsWall(JUNCTION, C, p.x, p.y, R)) continue;
        for (let i = 0; i < 60; i++) {
          p = moveWithCollision(JUNCTION, C, p.x, p.y, 3, 0, R);
          expect(circleHitsWall(JUNCTION, C, p.x, p.y, R)).toBe(false);
        }
      }
    }
  });

  it("cornering is gradual: never shifts the other axis by more than the step", () => {
    const p0 = { x: centre(1) + 30, y: centre(1) + 14 };
    const p1 = moveWithCollision(JUNCTION, C, p0.x, p0.y, 3, 0, R);
    expect(Math.abs(p1.y - p0.y)).toBeLessThanOrEqual(3);
  });

  it("a real wall still stops the player (no corner assist toward a wall)", () => {
    // at the right end of the horizontal corridor, facing the outer wall
    let p = { x: centre(3), y: centre(1) };
    for (let i = 0; i < 30; i++) p = moveWithCollision(JUNCTION, C, p.x, p.y, 3, 0, R);
    expect(p.x).toBeLessThanOrEqual(centre(3) + C / 2 - R + 0.001);
    expect(p.y).toBe(centre(1));
  });

  it("the same assist works for the other three directions", () => {
    const g = grid([
      "#####",
      "###.#",
      "#...#",
      "###.#",
      "#####",
    ]);
    // left into the horizontal corridor from a spot slightly off the row line
    let p = { x: centre(3) - 10, y: centre(2) + 14 };
    expect(circleHitsWall(g, C, p.x, p.y, R)).toBe(false);
    for (let i = 0; i < 40; i++) p = moveWithCollision(g, C, p.x, p.y, -3, 0, R);
    expect(p.x).toBeLessThan(centre(2));
    // up / down from a spot slightly off the column line
    let u = { x: centre(3) - 14, y: centre(2) };
    for (let i = 0; i < 40; i++) u = moveWithCollision(g, C, u.x, u.y, 0, -3, R);
    expect(u.y).toBeLessThan(centre(2) - C / 2);
    let d = { x: centre(3) - 14, y: centre(2) };
    for (let i = 0; i < 40; i++) d = moveWithCollision(g, C, d.x, d.y, 0, 3, R);
    expect(d.y).toBeGreaterThan(centre(2) + C / 2);
  });
});

describe("maze facing direction (relative to each sprite's native facing)", () => {
  it("right-facing art: right = unflipped, left = flipped", () => {
    expect(facingFlipX("right", 1, true)).toBe(false);
    expect(facingFlipX("right", -1, false)).toBe(true);
  });
  it("left-facing art (the deer): right = flipped, left = unflipped", () => {
    expect(facingFlipX("left", 1, false)).toBe(true);
    expect(facingFlipX("left", -1, true)).toBe(false);
  });
  it("vertical-only input or standing still keeps the current facing", () => {
    for (const native of ["left", "right"] as const) {
      expect(facingFlipX(native, 0, true)).toBe(true);
      expect(facingFlipX(native, 0, false)).toBe(false);
    }
  });
  it("diagonals follow the horizontal component (normalised diagonal input)", () => {
    const d = Math.SQRT1_2;
    expect(facingFlipX("right", d, true)).toBe(false);
    expect(facingFlipX("right", -d, false)).toBe(true);
    expect(facingFlipX("left", d, false)).toBe(true);
    expect(facingFlipX("left", -d, true)).toBe(false);
  });
});
