import { describe, expect, it } from "vitest";
import { clampScroll, decayVelocity, isDragGesture } from "../src/world/cameraMath";

const view = { width: 720, height: 1280, zoom: 1 };
const world = { w: 2160, h: 1680 };

describe("clampScroll", () => {
  it("keeps the view inside the world", () => {
    expect(clampScroll(-500, -500, view, world)).toEqual({ x: 0, y: 0 });
    expect(clampScroll(9999, 9999, view, world)).toEqual({
      x: world.w - view.width,
      y: world.h - view.height,
    });
  });

  it("passes through valid positions", () => {
    expect(clampScroll(300, 200, view, world)).toEqual({ x: 300, y: 200 });
  });

  it("centres an axis when the world is smaller than the view", () => {
    const small = { w: 400, h: 1680 };
    const r = clampScroll(100, 100, view, small);
    expect(r.x).toBeCloseTo((400 - 720) / 2);
  });

  it("accounts for zoom", () => {
    const r = clampScroll(9999, 0, { ...view, zoom: 2 }, world);
    expect(r.x).toBeCloseTo(world.w - view.width / 2);
  });
});

describe("decayVelocity", () => {
  it("shrinks magnitude over time", () => {
    expect(Math.abs(decayVelocity(10, 16))).toBeLessThan(10);
  });

  it("snaps to zero once tiny", () => {
    expect(decayVelocity(0.005, 16)).toBe(0);
  });

  it("settles to exactly zero once the glide is spent", () => {
    let v = 20;
    for (let i = 0; i < 130; i++) v = decayVelocity(v, 16.67);
    expect(v).toBe(0);
  });
});

describe("isDragGesture", () => {
  it("is a tap when small and quick", () => {
    expect(isDragGesture(3, 4, 120)).toBe(false);
  });
  it("is a drag when moved far", () => {
    expect(isDragGesture(40, 0, 50)).toBe(true);
  });
  it("is a drag when held long", () => {
    expect(isDragGesture(1, 1, 500)).toBe(true);
  });
});
