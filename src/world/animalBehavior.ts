/**
 * The decision-making half of a rescued Frosted Valley animal's roaming life
 * (FrostedAnimalNpc does the actual motion): each animal's personality, the
 * walkable-area geometry, and the weighted activity / wander-target pickers.
 * Phaser-free so it can be unit-tested.
 *
 * No pathfinding — an animal only ever heads for a point it can reach in a
 * straight line through its own walkable area, which is enough for these
 * small clearings and never leaves it stuck (see pickWanderTarget).
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** How the animal travels: springy hops, a steady walk, or a side-to-side waddle. */
export type Gait = "hop" | "walk" | "waddle";

export type Activity =
  | "idle"
  | "wander"
  | "visit"
  | "look"
  | "nibble"
  | "sniff"
  | "graze"
  | "sit"
  | "play"
  | "slide"
  | "signature";

/** What an animal does once it arrives beside one of its restored landmarks. */
export type PoiAction = "nibble" | "sniff" | "graze" | "look" | "play";

/** A spot beside a restored landmark: stand here, face `face` (+1 right / -1 left), then `action`. */
export interface RoamPoi {
  x: number;
  y: number;
  face: 1 | -1;
  action: PoiAction;
}

export interface RoamArea {
  /** The walkable ground — the animal's feet never leave this polygon. */
  poly: Pt[];
  /** Holes inside `poly`: flat landmarks, water, anything the animal must not stand on or behind. */
  noGo: Rect[];
  /** Restored landmarks the animal walks over to and interacts with. */
  pois: RoamPoi[];
  /** Out-of-reach landmarks it turns to look at now and then. */
  gazes: Pt[];
}

export interface Personality {
  gait: Gait;
  /** World units per second while travelling. */
  speed: number;
  /** World units covered per gait cycle (one hop, or one step pair). */
  stride: number;
  /** Hop height / step bob, as a fraction of the sprite's height. */
  lift: number;
  /** Degrees of body rock per step. */
  sway: number;
  /** Min/max length of one wander leg. */
  wander: [number, number];
  /** Min/max ms of plain idling between activities — short for busy animals, long for calm ones. */
  pause: [number, number];
  weights: Partial<Record<Activity, number>>;
}

/**
 * Personality comes purely from timing, gait and which activities are
 * weighted up — every animal runs the same behavior loop.
 */
export const PERSONALITIES: Record<string, Personality> = {
  // energetic, curious: quick hop bursts, frequent short trips, carrots
  fv_rabbit: {
    gait: "hop",
    speed: 170,
    stride: 70,
    lift: 0.13,
    sway: 0,
    wander: [70, 200],
    pause: [500, 1600],
    weights: { idle: 2, wander: 6, visit: 3, look: 2, nibble: 1, sit: 1, signature: 1 },
  },
  // calm, curious: slow walks, lots of sniffing and looking around
  fv_fox: {
    gait: "walk",
    speed: 62,
    stride: 58,
    lift: 0.012,
    sway: 1.4,
    wander: [60, 180],
    pause: [1400, 3200],
    weights: { idle: 3, wander: 3, visit: 2, look: 3, sniff: 3, sit: 1, signature: 1 },
  },
  // peaceful: slow drifting walks, long grazing, gazing about
  fv_deer: {
    gait: "walk",
    speed: 42,
    stride: 64,
    lift: 0.01,
    sway: 1,
    wander: [90, 260],
    pause: [2200, 4600],
    weights: { idle: 3, wander: 3, visit: 2, look: 3, graze: 3, signature: 1 },
  },
  // energetic, playful: fast scampering hops, nibbling, spinning about
  fv_squirrel: {
    gait: "hop",
    speed: 210,
    stride: 52,
    lift: 0.09,
    sway: 0,
    wander: [70, 220],
    pause: [400, 1300],
    weights: { idle: 2, wander: 6, visit: 3, look: 2, nibble: 2, play: 2, signature: 1 },
  },
  // heavy, relaxed: slow rolling gait, long rests, the odd playful wiggle
  fv_polarbear: {
    gait: "walk",
    speed: 46,
    stride: 80,
    lift: 0.014,
    sway: 2.6,
    wander: [90, 260],
    pause: [2000, 4200],
    weights: { idle: 3, wander: 3, visit: 2, look: 2, sit: 3, play: 1, signature: 1 },
  },
  // playful: waddles, wing flaps, and the occasional belly slide
  fv_penguin: {
    gait: "waddle",
    speed: 58,
    stride: 34,
    lift: 0.02,
    sway: 7,
    wander: [70, 230],
    pause: [1100, 2800],
    weights: { idle: 2, wander: 4, visit: 2, look: 2, play: 2, slide: 1, signature: 1 },
  },
};

/** Which way each animal's unflipped art faces: +1 right, -1 left. */
export const NATIVE_FACING: Record<string, 1 | -1> = {
  fv_rabbit: 1,
  fv_fox: 1,
  fv_deer: 1,
  fv_squirrel: 1,
  fv_polarbear: 1,
  fv_penguin: -1,
};

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export function inRect(p: Pt, r: Rect): boolean {
  return p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
}

/** Inside the area's polygon, outside every no-go hole, and not on a live obstacle. */
export function isWalkable(p: Pt, area: RoamArea, blocked?: (p: Pt) => boolean): boolean {
  return pointInPolygon(p, area.poly) && !area.noGo.some((r) => inRect(p, r)) && !(blocked?.(p) ?? false);
}

/**
 * Every point along a→b (after the start, so an animal can always walk OUT of
 * a spot that became blocked, e.g. by a decoration placed on top of it) is
 * walkable. `endSlack` skips the last few units, letting a landmark's stand
 * spot sit right up against that landmark.
 */
export function isPathClear(
  a: Pt,
  b: Pt,
  area: RoamArea,
  blocked?: (p: Pt) => boolean,
  step = 18,
  endSlack = 0,
): boolean {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1) return isWalkable(b, area, blocked);
  const end = Math.max(0, len - endSlack);
  for (let d = step; d < end; d += step) {
    const t = d / len;
    if (!isWalkable({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, area, blocked)) return false;
  }
  return endSlack > 0 ? true : isWalkable(b, area, blocked);
}

/**
 * A random reachable point `range` away. Vertical distance is squashed a
 * little (this is a ¾ top-down world, so up/down trips read as longer than
 * sideways ones). Null when nothing nearby is reachable this time.
 */
export function pickWanderTarget(
  from: Pt,
  area: RoamArea,
  range: [number, number],
  rng: () => number = Math.random,
  blocked?: (p: Pt) => boolean,
  tries = 16,
): Pt | null {
  for (let i = 0; i < tries; i++) {
    const ang = rng() * Math.PI * 2;
    const dist = range[0] + rng() * (range[1] - range[0]);
    const p = { x: from.x + Math.cos(ang) * dist, y: from.y + Math.sin(ang) * dist * 0.6 };
    if (isPathClear(from, p, area, blocked)) return p;
  }
  return null;
}

/**
 * A stepping-stone for reaching `to` when the straight line from `from` is
 * blocked: a point reachable from both. Null if there isn't one.
 */
export function pickWaypoint(
  from: Pt,
  to: Pt,
  area: RoamArea,
  rng: () => number = Math.random,
  blocked?: (p: Pt) => boolean,
  tries = 24,
  endSlack = 0,
): Pt | null {
  const xs = area.poly.map((p) => p.x);
  const ys = area.poly.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0;
  const h = Math.max(...ys) - y0;
  for (let i = 0; i < tries; i++) {
    const p = { x: x0 + rng() * w, y: y0 + rng() * h };
    if (isPathClear(from, p, area, blocked) && isPathClear(p, to, area, blocked, 18, endSlack)) return p;
  }
  return null;
}

/**
 * Weighted pick of the next activity. The one just done is heavily
 * discounted (idle/wander only halved), so sequences vary instead of looping
 * the same move; `available` drops ones that can't run right now (no
 * landmarks to visit, no room for a slide…).
 */
export function pickActivity(
  weights: Partial<Record<Activity, number>>,
  last: Activity | undefined,
  rng: () => number = Math.random,
  available: (a: Activity) => boolean = () => true,
): Activity {
  const entries = (Object.entries(weights) as Array<[Activity, number]>)
    .filter(([a, w]) => w > 0 && available(a))
    .map(([a, w]) => [a, a === last ? w * (a === "idle" || a === "wander" ? 0.5 : 0.15) : w] as [Activity, number]);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return "idle";
  let r = rng() * total;
  for (const [a, w] of entries) {
    r -= w;
    if (r <= 0) return a;
  }
  return entries[entries.length - 1][0];
}

/** Offsets an area authored relative to an animal's home spot into world space. */
export function areaAt(rel: RoamArea, home: Pt): RoamArea {
  const pt = (p: Pt) => ({ x: p.x + home.x, y: p.y + home.y });
  return {
    poly: rel.poly.map(pt),
    noGo: rel.noGo.map((r) => ({ x0: r.x0 + home.x, y0: r.y0 + home.y, x1: r.x1 + home.x, y1: r.y1 + home.y })),
    pois: rel.pois.map((p) => ({ ...p, ...pt(p) })),
    gazes: rel.gazes.map(pt),
  };
}
