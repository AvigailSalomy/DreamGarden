import { describe, expect, it } from "vitest";
import { hashStr, mulberry32 } from "../src/core/rng";

describe("mulberry32", () => {
  it("is deterministic for a seed", () => {
    const a = mulberry32(12345);
    const b = mulberry32(12345);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces values in [0, 1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 5000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("is roughly uniform", () => {
    const r = mulberry32(99);
    const buckets = new Array(10).fill(0);
    const n = 20000;
    for (let i = 0; i < n; i++) buckets[Math.floor(r() * 10)]++;
    for (const b of buckets) expect(Math.abs(b - n / 10)).toBeLessThan(n / 10 * 0.2);
  });

  it("different seeds diverge", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("hashStr", () => {
  it("is stable and unsigned", () => {
    expect(hashStr("rabbit")).toBe(hashStr("rabbit"));
    expect(hashStr("rabbit")).toBeGreaterThanOrEqual(0);
    expect(hashStr("rabbit")).not.toBe(hashStr("bird"));
  });
});
