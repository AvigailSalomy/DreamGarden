import { describe, expect, it } from "vitest";
import {
  NATIVE_FACING,
  PERSONALITIES,
  areaAt,
  isPathClear,
  isWalkable,
  pickActivity,
  pickWanderTarget,
  pickWaypoint,
  pointInPolygon,
  type Activity,
  type RoamArea,
} from "../src/world/animalBehavior";
import { FROSTED_ROAM } from "../src/data/frostedRoam";
import { FROSTED_CATALOG } from "../src/data/frostedValley";

/** Deterministic PRNG so the randomized pickers are testable. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const square: RoamArea = {
  poly: [
    { x: 0, y: 0 },
    { x: 1000, y: 0 },
    { x: 1000, y: 1000 },
    { x: 0, y: 1000 },
  ],
  noGo: [{ x0: 400, y0: 0, x1: 600, y1: 800 }], // a wall with a gap along the bottom
  pois: [],
  gazes: [],
};

describe("geometry", () => {
  it("pointInPolygon handles inside, outside and concave shapes", () => {
    const l = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 40 },
      { x: 40, y: 40 },
      { x: 40, y: 100 },
      { x: 0, y: 100 },
    ];
    expect(pointInPolygon({ x: 20, y: 20 }, l)).toBe(true);
    expect(pointInPolygon({ x: 80, y: 20 }, l)).toBe(true);
    expect(pointInPolygon({ x: 80, y: 80 }, l)).toBe(false); // the L's notch
    expect(pointInPolygon({ x: -5, y: 50 }, l)).toBe(false);
  });

  it("isWalkable excludes no-go holes and live obstacles", () => {
    expect(isWalkable({ x: 100, y: 100 }, square)).toBe(true);
    expect(isWalkable({ x: 500, y: 100 }, square)).toBe(false);
    expect(isWalkable({ x: 1100, y: 100 }, square)).toBe(false);
    expect(isWalkable({ x: 100, y: 100 }, square, (p) => p.x < 200)).toBe(false);
  });

  it("isPathClear rejects a straight line through a hole, allows going round it", () => {
    expect(isPathClear({ x: 100, y: 400 }, { x: 900, y: 400 }, square)).toBe(false);
    expect(isPathClear({ x: 100, y: 900 }, { x: 900, y: 900 }, square)).toBe(true);
  });

  it("an animal standing on a newly-blocked spot can still walk out of it", () => {
    const blocked = (p: { x: number; y: number }) => Math.hypot(p.x - 100, p.y - 100) < 10;
    expect(isPathClear({ x: 100, y: 100 }, { x: 200, y: 100 }, square, blocked)).toBe(true);
  });
});

describe("pickWanderTarget / pickWaypoint", () => {
  it("only ever returns reachable points inside the area, within range", () => {
    const rng = seeded(7);
    const from = { x: 150, y: 500 };
    for (let i = 0; i < 300; i++) {
      const t = pickWanderTarget(from, square, [60, 250], rng);
      if (!t) continue;
      expect(isWalkable(t, square)).toBe(true);
      expect(isPathClear(from, t, square)).toBe(true);
      expect(Math.hypot(t.x - from.x, (t.y - from.y) / 0.6)).toBeLessThanOrEqual(250.001);
    }
  });

  it("returns null instead of an unreachable point when boxed in", () => {
    const tiny: RoamArea = { ...square, noGo: [], poly: square.poly };
    const blockedAll = () => true;
    expect(pickWanderTarget({ x: 500, y: 500 }, tiny, [60, 200], seeded(1), blockedAll)).toBeNull();
  });

  it("finds a stepping-stone round a wall", () => {
    const from = { x: 100, y: 300 };
    const to = { x: 900, y: 300 };
    const via = pickWaypoint(from, to, square, seeded(3), undefined, 400);
    // the wall only has a gap below y=800, so no single stepping stone works
    // from these heights... but from low down one does
    const lowFrom = { x: 100, y: 900 };
    const lowVia = pickWaypoint(lowFrom, { x: 900, y: 700 }, square, seeded(3), undefined, 400);
    expect(via).toBeNull();
    expect(lowVia).not.toBeNull();
    expect(isPathClear(lowFrom, lowVia!, square)).toBe(true);
    expect(isPathClear(lowVia!, { x: 900, y: 700 }, square)).toBe(true);
  });
});

describe("pickActivity", () => {
  it("never picks a zero-weight or unavailable activity", () => {
    const rng = seeded(11);
    for (let i = 0; i < 500; i++) {
      const a = pickActivity({ idle: 1, wander: 3, visit: 2, sit: 0 }, undefined, rng, (x) => x !== "visit");
      expect(["idle", "wander"]).toContain(a);
    }
  });

  it("produces varied sequences rather than one fixed loop", () => {
    const w = PERSONALITIES.fv_rabbit.weights;
    const seq = (seed: number) => {
      const rng = seeded(seed);
      const out: Activity[] = [];
      let last: Activity | undefined;
      for (let i = 0; i < 12; i++) out.push((last = pickActivity(w, last, rng)));
      return out.join(",");
    };
    const runs = new Set([1, 2, 3, 4, 5].map(seq));
    expect(runs.size).toBeGreaterThan(3);
  });

  it("rarely repeats a special move back to back", () => {
    const rng = seeded(5);
    let repeats = 0;
    for (let i = 0; i < 2000; i++) if (pickActivity({ sniff: 1, look: 1, idle: 1 }, "sniff", rng) === "sniff") repeats++;
    // undiscounted it would be ~1/3 of picks
    expect(repeats / 2000).toBeLessThan(0.1);
  });
});

describe("personalities", () => {
  const animalKeys = FROSTED_CATALOG.map((a) => a.id);

  it("every Frosted Valley animal has a personality, a facing and a roam area", () => {
    for (const id of animalKeys) {
      expect(PERSONALITIES[id], id).toBeDefined();
      expect(NATIVE_FACING[id], id).toBeDefined();
      expect(FROSTED_ROAM[id], id).toBeDefined();
    }
  });

  it("each animal feels different — no two share the same gait + pace", () => {
    const sigs = animalKeys.map((id) => `${PERSONALITIES[id].gait}:${PERSONALITIES[id].speed}`);
    expect(new Set(sigs).size).toBe(sigs.length);
    expect(PERSONALITIES.fv_rabbit.speed).toBeGreaterThan(PERSONALITIES.fv_deer.speed);
    expect(PERSONALITIES.fv_squirrel.pause[1]).toBeLessThan(PERSONALITIES.fv_polarbear.pause[0]);
  });
});

describe("FROSTED_ROAM", () => {
  const home = { x: 5000, y: 3000 };
  for (const [id, rel] of Object.entries(FROSTED_ROAM)) {
    describe(id, () => {
      const area = areaAt(rel, home);

      it("spawns on walkable ground (its home spot)", () => {
        expect(isWalkable(home, area)).toBe(true);
      });

      it("every landmark stand spot is walkable and reachable from home", () => {
        for (const poi of area.pois) {
          expect(isWalkable(poi, area), `${id} poi ${poi.x - home.x},${poi.y - home.y}`).toBe(true);
          const direct = isPathClear(home, poi, area, undefined, 18, 30);
          const via = direct ? null : pickWaypoint(home, poi, area, seeded(9), undefined, 400, 30);
          expect(direct || via !== null, `${id} poi reachable`).toBe(true);
        }
      });

      it("has room to wander from home", () => {
        const rng = seeded(21);
        const p = PERSONALITIES[id];
        let found = 0;
        for (let i = 0; i < 20; i++) if (pickWanderTarget(home, area, p.wander, rng)) found++;
        expect(found).toBeGreaterThan(10);
      });

      it("a long random walk never leaves the area", () => {
        const rng = seeded(33);
        const p = PERSONALITIES[id];
        let at = home;
        for (let i = 0; i < 400; i++) {
          const t = pickWanderTarget(at, area, p.wander, rng);
          if (!t) continue;
          expect(isPathClear(at, t, area)).toBe(true);
          at = t;
        }
        expect(pointInPolygon(at, area.poly)).toBe(true);
      });
    });
  }
});
