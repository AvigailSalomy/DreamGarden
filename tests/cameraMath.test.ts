import { describe, expect, it } from "vitest";
import {
  OVERVIEW_H,
  OVERVIEW_W,
  ZOOM_MAX,
  ZOOM_MIN,
  clampScroll,
  clampZoom,
  computeMinZoom,
  decayVelocity,
  isDragGesture,
  zoomAroundPoint,
} from "../src/world/cameraMath";

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

describe("clampZoom", () => {
  it("clamps to the given min / max", () => {
    expect(clampZoom(0.01)).toBe(ZOOM_MIN);
    expect(clampZoom(9)).toBe(ZOOM_MAX);
    expect(clampZoom(1.1)).toBe(1.1);
    expect(clampZoom(0.5, 0.7, 1.5)).toBe(0.7);
  });
  it("max stays at ~1.5, absolute floor is low enough for a wide view", () => {
    expect(ZOOM_MAX).toBeGreaterThanOrEqual(1.35);
    expect(ZOOM_MAX).toBeLessThanOrEqual(1.6);
    expect(ZOOM_MIN).toBeLessThan(0.5);
  });
});

describe("computeMinZoom (responsive wide-view minimum)", () => {
  it("a narrow phone gets a low minimum so much of the garden fits", () => {
    const z = computeMinZoom(390, 844);
    expect(z).toBeGreaterThanOrEqual(ZOOM_MIN);
    expect(z).toBeLessThan(0.6);
    // shows a good slice of the world width
    expect(390 / z).toBeGreaterThan(700);
  });

  it("a wide desktop gets a higher minimum (it already shows a lot)", () => {
    const phone = computeMinZoom(390, 844);
    const desktop = computeMinZoom(1366, 768);
    expect(desktop).toBeGreaterThan(phone);
    expect(desktop).toBeLessThanOrEqual(0.9);
  });

  it("never below the absolute floor or above the ceiling", () => {
    expect(computeMinZoom(100, 100)).toBe(ZOOM_MIN);
    expect(computeMinZoom(99999, 99999)).toBe(0.9);
  });

  it("uses the min of the two viewport/overview fits", () => {
    const z = computeMinZoom(1000, 1000);
    expect(z).toBeCloseTo(Math.min(1000 / OVERVIEW_W, 1000 / OVERVIEW_H));
  });
});

describe("zoomAroundPoint", () => {
  const v = { width: 400, height: 800, zoom: 1, scrollX: 100, scrollY: 200 };

  it("keeps the world point under the focal pixel fixed", () => {
    const focalX = 150;
    const focalY = 300;
    const worldBefore = { x: v.scrollX + focalX / v.zoom, y: v.scrollY + focalY / v.zoom };
    const next = zoomAroundPoint(v, focalX, focalY, 1.4);
    const worldAfter = { x: next.scrollX + focalX / 1.4, y: next.scrollY + focalY / 1.4 };
    expect(worldAfter.x).toBeCloseTo(worldBefore.x);
    expect(worldAfter.y).toBeCloseTo(worldBefore.y);
  });

  it("no zoom change means no scroll change", () => {
    const next = zoomAroundPoint(v, 200, 400, 1);
    expect(next.scrollX).toBeCloseTo(v.scrollX);
    expect(next.scrollY).toBeCloseTo(v.scrollY);
  });
});
