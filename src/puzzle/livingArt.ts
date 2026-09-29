/**
 * "The picture comes alive" — per-animal rigs + choreography for the 7-second
 * living-artwork beat after a Frosted Valley puzzle is completed. Phaser-free.
 *
 * Every coordinate is a fraction of the puzzle image (u across, v down), hand-
 * measured on the final artwork in public/assets/frosted/puzzle/. A RIG names
 * soft deformation regions (body, head, ears, tail, wings, swaying plants...),
 * each with the pivot it bends around. LivingArtPipeline warps the real image
 * through them — a smooth, seamless deformation with no cut-out layers, so
 * nothing ever ghosts or doubles. Eyes are closed by painting a lid in the fur
 * colour sampled just above each eye.
 *
 * Regions are applied in array order as a hierarchy: body first, then head,
 * then parts on the head — so ears and eyelids ride along with the head turn.
 */

export interface LivingPart {
  id: string;
  /** Point the part rotates/scales around. */
  pivot: [number, number];
  /** Ellipse of influence: centre u, centre v, radius u, radius v. */
  region: [number, number, number, number];
  /** Fraction of the ellipse moving at full strength before it fades out (0..1). */
  core: number;
}

export interface LivingEye {
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** Where the lid colour is sampled — plain fur just above the eye. */
  lid: [number, number];
}

export interface LivingGlow {
  x: number;
  y: number;
  /** Radius as a fraction of the image width. */
  r: number;
  color: number;
}

export interface LivingRig {
  /** Where the slow cinematic push-in drifts toward (the animal). */
  focus: [number, number];
  parts: LivingPart[];
  eyes: LivingEye[];
  glows: LivingGlow[];
  /** Rectangles (u0, v0, u1, v1) where light glints on water/ice. */
  shimmer: Array<[number, number, number, number]>;
  /** Optional falling-sparkle column (the squirrel's waterfall). */
  cascade?: [number, number, number, number];
}

/** One part's pose at a moment: rotation (radians), scale, and shift (image fractions). */
export interface PartPose {
  angle: number;
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

export interface LivingFrame {
  poses: Record<string, PartPose>;
  /** 0 = open, 1 = shut, one per rig eye. */
  blink: number[];
}

export const LIVING_DURATION = 7;

/* ------------------------------------------------------------------ rigs */

const WARM = 0xffd58a;
const ICE = 0xbfeaff;
const LILAC = 0xd9b8ff;

export const LIVING_RIGS: Record<string, LivingRig> = {
  fv_rabbit: {
    focus: [0.5, 0.52],
    parts: [
      { id: "body", pivot: [0.505, 0.765], region: [0.505, 0.55, 0.14, 0.4], core: 0.7 },
      { id: "head", pivot: [0.51, 0.6], region: [0.515, 0.47, 0.105, 0.17], core: 0.7 },
      { id: "earL", pivot: [0.462, 0.445], region: [0.445, 0.385, 0.035, 0.075], core: 0.6 },
      { id: "earR", pivot: [0.492, 0.43], region: [0.49, 0.37, 0.025, 0.07], core: 0.6 },
      { id: "nose", pivot: [0.527, 0.53], region: [0.527, 0.524, 0.014, 0.02], core: 0.4 },
      { id: "chime", pivot: [0.61, 0.19], region: [0.61, 0.33, 0.05, 0.15], core: 0.75 },
      { id: "carrots", pivot: [0.8, 0.62], region: [0.8, 0.55, 0.15, 0.07], core: 0.6 },
    ],
    eyes: [
      { x: 0.482, y: 0.506, rx: 0.021, ry: 0.037, lid: [0.497, 0.474] },
      { x: 0.547, y: 0.487, rx: 0.014, ry: 0.031, lid: [0.54, 0.455] },
    ],
    glows: [
      { x: 0.235, y: 0.53, r: 0.09, color: WARM },
      { x: 0.29, y: 0.43, r: 0.035, color: WARM },
      { x: 0.61, y: 0.32, r: 0.05, color: 0xffffff },
    ],
    shimmer: [[0.05, 0.62, 0.95, 0.95]],
  },

  fv_fox: {
    focus: [0.47, 0.48],
    parts: [
      { id: "body", pivot: [0.48, 0.66], region: [0.475, 0.49, 0.13, 0.22], core: 0.7 },
      { id: "tail", pivot: [0.455, 0.525], region: [0.41, 0.46, 0.055, 0.1], core: 0.65 },
      { id: "head", pivot: [0.52, 0.535], region: [0.522, 0.44, 0.07, 0.13], core: 0.7 },
      { id: "earL", pivot: [0.488, 0.425], region: [0.48, 0.375, 0.026, 0.055], core: 0.55 },
      { id: "earR", pivot: [0.545, 0.4], region: [0.548, 0.35, 0.024, 0.05], core: 0.55 },
      { id: "lantern", pivot: [0.722, 0.215], region: [0.735, 0.3, 0.022, 0.07], core: 0.6 },
      { id: "flowersL", pivot: [0.14, 0.64], region: [0.14, 0.56, 0.11, 0.08], core: 0.55 },
      { id: "flowersR", pivot: [0.92, 0.39], region: [0.92, 0.33, 0.08, 0.07], core: 0.55 },
    ],
    eyes: [
      { x: 0.502, y: 0.467, rx: 0.015, ry: 0.034, lid: [0.5, 0.428] },
      { x: 0.555, y: 0.448, rx: 0.011, ry: 0.029, lid: [0.553, 0.412] },
    ],
    glows: [
      { x: 0.735, y: 0.3, r: 0.05, color: WARM },
      { x: 0.16, y: 0.55, r: 0.05, color: LILAC },
    ],
    shimmer: [[0.25, 0.6, 0.9, 0.97]],
  },

  fv_deer: {
    focus: [0.49, 0.47],
    parts: [
      { id: "body", pivot: [0.48, 0.72], region: [0.48, 0.5, 0.12, 0.3], core: 0.7 },
      { id: "tail", pivot: [0.418, 0.47], region: [0.41, 0.435, 0.022, 0.045], core: 0.5 },
      { id: "head", pivot: [0.51, 0.52], region: [0.505, 0.4, 0.085, 0.15], core: 0.7 },
      { id: "earL", pivot: [0.462, 0.405], region: [0.44, 0.385, 0.035, 0.045], core: 0.55 },
      { id: "earR", pivot: [0.552, 0.388], region: [0.563, 0.355, 0.02, 0.045], core: 0.55 },
      { id: "bed", pivot: [0.66, 0.78], region: [0.66, 0.68, 0.13, 0.1], core: 0.6 },
      { id: "bells", pivot: [0.62, 0.66], region: [0.625, 0.56, 0.06, 0.09], core: 0.6 },
    ],
    eyes: [
      { x: 0.474, y: 0.443, rx: 0.016, ry: 0.034, lid: [0.476, 0.404] },
      { x: 0.542, y: 0.428, rx: 0.011, ry: 0.029, lid: [0.543, 0.392] },
    ],
    glows: [
      { x: 0.5, y: 0.1, r: 0.14, color: WARM },
      { x: 0.64, y: 0.62, r: 0.07, color: LILAC },
    ],
    shimmer: [[0.25, 0.7, 0.75, 0.95]],
  },

  fv_squirrel: {
    focus: [0.32, 0.5],
    parts: [
      { id: "body", pivot: [0.33, 0.77], region: [0.3, 0.52, 0.16, 0.32], core: 0.7 },
      { id: "tail", pivot: [0.3, 0.67], region: [0.235, 0.47, 0.085, 0.24], core: 0.7 },
      { id: "head", pivot: [0.36, 0.52], region: [0.365, 0.4, 0.075, 0.15], core: 0.7 },
      { id: "earL", pivot: [0.322, 0.345], region: [0.318, 0.31, 0.02, 0.045], core: 0.5 },
      { id: "earR", pivot: [0.372, 0.33], region: [0.373, 0.3, 0.016, 0.04], core: 0.5 },
      { id: "branches", pivot: [0.78, 0.36], region: [0.8, 0.2, 0.13, 0.16], core: 0.55 },
    ],
    eyes: [
      { x: 0.338, y: 0.426, rx: 0.016, ry: 0.04, lid: [0.336, 0.384] },
      { x: 0.389, y: 0.409, rx: 0.009, ry: 0.03, lid: [0.39, 0.374] },
    ],
    glows: [
      { x: 0.745, y: 0.37, r: 0.08, color: WARM },
      { x: 0.42, y: 0.35, r: 0.1, color: ICE },
    ],
    shimmer: [[0.42, 0.68, 0.76, 0.86]],
    cascade: [0.33, 0.0, 0.5, 0.62],
  },

  fv_polarbear: {
    focus: [0.54, 0.44],
    parts: [
      { id: "body", pivot: [0.535, 0.6], region: [0.535, 0.44, 0.12, 0.22], core: 0.7 },
      { id: "head", pivot: [0.565, 0.46], region: [0.565, 0.37, 0.07, 0.12], core: 0.7 },
      { id: "earL", pivot: [0.53, 0.325], region: [0.525, 0.305, 0.02, 0.03], core: 0.5 },
      { id: "earR", pivot: [0.607, 0.318], region: [0.61, 0.297, 0.018, 0.03], core: 0.5 },
      { id: "paw", pivot: [0.575, 0.5], region: [0.575, 0.545, 0.028, 0.05], core: 0.55 },
      { id: "fish", pivot: [0.735, 0.655], region: [0.72, 0.655, 0.03, 0.03], core: 0.5 },
      { id: "fish2", pivot: [0.66, 0.72], region: [0.655, 0.72, 0.028, 0.028], core: 0.5 },
    ],
    eyes: [
      { x: 0.537, y: 0.372, rx: 0.013, ry: 0.031, lid: [0.537, 0.336] },
      { x: 0.588, y: 0.367, rx: 0.012, ry: 0.03, lid: [0.589, 0.33] },
    ],
    glows: [
      { x: 0.24, y: 0.38, r: 0.13, color: WARM },
      { x: 0.36, y: 0.63, r: 0.07, color: ICE },
      { x: 0.665, y: 0.72, r: 0.06, color: ICE },
    ],
    shimmer: [[0.58, 0.62, 0.76, 0.84], [0.3, 0.72, 0.55, 0.9]],
  },

  fv_penguin: {
    focus: [0.36, 0.58],
    parts: [
      { id: "body", pivot: [0.35, 0.8], region: [0.345, 0.61, 0.1, 0.24], core: 0.7 },
      { id: "head", pivot: [0.35, 0.62], region: [0.35, 0.52, 0.07, 0.1], core: 0.6 },
      { id: "wingR", pivot: [0.397, 0.59], region: [0.41, 0.54, 0.026, 0.065], core: 0.6 },
      { id: "wingL", pivot: [0.297, 0.61], region: [0.28, 0.655, 0.026, 0.06], core: 0.6 },
      { id: "flags", pivot: [0.6, 0.44], region: [0.6, 0.47, 0.08, 0.035], core: 0.5 },
    ],
    // the penguin's eyes are painted happily shut (^ ^) — there is nothing to
    // blink, so its "alive" beats come from the wave, bob and body sway instead
    eyes: [],
    glows: [
      { x: 0.26, y: 0.47, r: 0.06, color: WARM },
      { x: 0.8, y: 0.6, r: 0.1, color: ICE },
    ],
    shimmer: [[0.45, 0.6, 1.0, 0.97]],
  },
};

/* ------------------------------------------------------------ motion kit */

const TAU = Math.PI * 2;
const deg = (d: number) => (d * Math.PI) / 180;
const smooth = (x: number) => {
  const c = Math.max(0, Math.min(1, x));
  return c * c * (3 - 2 * c);
};

/** 0 → 1 → 0 bump across [start, start + dur]. */
function bump(t: number, start: number, dur: number): number {
  const x = (t - start) / dur;
  return x <= 0 || x >= 1 ? 0 : Math.sin(Math.PI * x);
}

/** A decaying wiggle inside [start, start + dur]. */
function wiggle(t: number, start: number, dur: number, hz: number): number {
  const x = (t - start) / dur;
  if (x <= 0 || x >= 1) return 0;
  return Math.sin(TAU * hz * (t - start)) * (1 - x) * Math.min(1, x * 6);
}

/** Smoothly interpolated keyframes [time, value][], held at both ends. */
function keys(t: number, k: Array<[number, number]>): number {
  if (t <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (t <= k[i][0]) {
      const [t0, v0] = k[i - 1];
      const [t1, v1] = k[i];
      return v0 + (v1 - v0) * smooth((t - t0) / (t1 - t0));
    }
  }
  return k[k.length - 1][1];
}

/** Lid closed amount for blinks starting at each of `times` (fast close, slightly slower open). */
function blinks(t: number, times: number[]): number {
  let b = 0;
  for (const s of times) {
    const x = t - s;
    if (x < 0 || x > 0.2) continue;
    b = Math.max(b, x < 0.075 ? x / 0.075 : 1 - (x - 0.075) / 0.125);
  }
  return b;
}

/** Soft, continuous breathing about the feet. */
function breathe(t: number, period: number, amt: number): PartPose {
  const s = Math.sin((TAU * t) / period);
  return { angle: 0, sx: 1 - amt * 0.35 * s, sy: 1 + amt * s, tx: 0, ty: 0 };
}

/** One small in-place hop: crouch, lift, land with a squash. `h` = lift as an image fraction. */
function hop(t: number, start: number, h: number): Partial<PartPose> {
  const crouch = bump(t, start, 0.18);
  const air = bump(t, start + 0.14, 0.4);
  const land = bump(t, start + 0.52, 0.2);
  return { sy: 1 - 0.035 * crouch + 0.04 * air - 0.03 * land, sx: 1 + 0.025 * crouch - 0.015 * air + 0.025 * land, ty: -h * air };
}

const REST: PartPose = { angle: 0, sx: 1, sy: 1, tx: 0, ty: 0 };
const pose = (p: Partial<PartPose>): PartPose => ({ ...REST, ...p });
const merge = (a: PartPose, b: Partial<PartPose>): PartPose => ({
  angle: a.angle + (b.angle ?? 0),
  sx: a.sx * (b.sx ?? 1),
  sy: a.sy * (b.sy ?? 1),
  tx: a.tx + (b.tx ?? 0),
  ty: a.ty + (b.ty ?? 0),
});

/** Plants / chimes / lanterns: a slow breeze, always on. */
const sway = (t: number, period: number, amp: number, phase = 0) =>
  pose({ angle: deg(amp) * Math.sin((TAU * t) / period + phase) });

/* ---------------------------------------------------------- choreography */

type Choreo = (t: number) => LivingFrame;

/**
 * Each animal's 7 seconds, written like a tiny animation dope-sheet. All
 * motion is subtle (a few degrees, a few percent) — cosy, never chaotic.
 */
export const LIVING_CHOREO: Record<string, Choreo> = {
  // ears move · blink · little hop · nose twitch · looks around
  fv_rabbit: (t) => {
    const body = merge(breathe(t, 2.2, 0.012), hop(t, 5.2, 0.018));
    return {
      poses: {
        body,
        head: pose({
          angle: deg(keys(t, [[0, 0], [1.9, 0], [2.4, -4.5], [3.2, -4.5], [3.7, 3.5], [4.5, 3.5], [5.0, 0]])),
          tx: 0.004 * keys(t, [[0, 0], [1.9, 0], [2.4, -1], [3.2, -1], [3.7, 1], [4.5, 1], [5.0, 0]]),
        }),
        earL: pose({ angle: deg(7 * wiggle(t, 0.5, 1.0, 2.2) + 5 * wiggle(t, 5.6, 0.9, 2.6)) }),
        earR: pose({ angle: deg(-6 * wiggle(t, 0.75, 0.9, 2.4) + 9 * wiggle(t, 3.9, 0.8, 2.8)) }),
        nose: pose({ sy: 1 + 0.12 * (bump(t, 2.9, 0.12) + bump(t, 3.1, 0.12) + bump(t, 6.3, 0.12) + bump(t, 6.5, 0.12)) }),
        chime: sway(t, 3.1, 3.2),
        carrots: sway(t, 2.6, 2.2, 1),
      },
      blink: [blinks(t, [1.3, 4.1, 4.38, 6.55]), blinks(t, [1.3, 4.1, 4.38, 6.55])],
    };
  },

  // tail movement · ear twitch · blink · looks around
  fv_fox: (t) => ({
    poses: {
      body: breathe(t, 2.4, 0.01),
      tail: pose({ angle: deg(7 * Math.sin((TAU * t) / 1.6) * keys(t, [[0, 0.4], [1, 1], [6, 1], [7, 0.6]]) + 6 * wiggle(t, 4.6, 1.2, 2.2)) }),
      head: pose({
        angle: deg(keys(t, [[0, 0], [2.2, 0], [2.8, -5], [3.9, -5], [4.5, 4], [5.5, 4], [6.2, 0]])),
      }),
      earL: pose({ angle: deg(-8 * wiggle(t, 1.2, 0.5, 4) - 8 * wiggle(t, 5.9, 0.5, 4)) }),
      earR: pose({ angle: deg(8 * wiggle(t, 3.2, 0.5, 4.2)) }),
      lantern: sway(t, 2.8, 4),
      flowersL: sway(t, 3.3, 2.5),
      flowersR: sway(t, 2.9, 2.5, 2),
    },
    blink: [blinks(t, [1.7, 4.2, 6.4]), blinks(t, [1.7, 4.2, 6.4])],
  }),

  // ear movement · head movement · gentle breathing · blink
  fv_deer: (t) => ({
    poses: {
      body: breathe(t, 2.6, 0.012),
      tail: pose({ angle: deg(14 * wiggle(t, 2.0, 0.6, 5) + 14 * wiggle(t, 5.4, 0.6, 5)) }),
      head: pose({
        angle: deg(keys(t, [[0, 0], [1.4, 0], [2.3, 3], [3.6, 3], [4.4, -3.5], [5.4, -3.5], [6.2, 0]])),
        sy: 1 + 0.03 * keys(t, [[0, 0], [1.4, 0], [2.3, 1], [3.6, 1], [4.4, 0]]), // raises its head
      }),
      earL: pose({ angle: deg(-9 * wiggle(t, 0.7, 0.7, 3) - 7 * wiggle(t, 4.6, 0.6, 3.4)) }),
      earR: pose({ angle: deg(9 * wiggle(t, 1.0, 0.7, 3) + 8 * wiggle(t, 6.0, 0.6, 3.2)) }),
      bed: sway(t, 3.4, 1.8),
      bells: sway(t, 2.7, 3.2, 1.3),
    },
    blink: [blinks(t, [1.1, 3.9, 6.3]), blinks(t, [1.1, 3.9, 6.3])],
  }),

  // tail movement · tiny head movement · blink · cute energetic motion
  fv_squirrel: (t) => ({
    poses: {
      body: merge(breathe(t, 1.6, 0.013), merge(pose(hop(t, 2.3, 0.012)), hop(t, 5.5, 0.014))),
      tail: pose({
        angle: deg(4 * Math.sin((TAU * t) / 1.3) + 5 * wiggle(t, 1.0, 1.0, 3) + 5 * wiggle(t, 4.3, 1.0, 3)),
        sy: 1 + 0.02 * Math.sin((TAU * t) / 1.3 + 1),
      }),
      head: pose({ angle: deg(keys(t, [[0, 0], [0.8, 0], [1.1, 4], [1.9, 4], [2.2, -2], [3.5, -2], [3.8, 5], [4.6, 5], [5.0, 0]])) }),
      earL: pose({ angle: deg(-10 * wiggle(t, 3.4, 0.45, 5)) }),
      earR: pose({ angle: deg(10 * wiggle(t, 3.45, 0.45, 5) + 8 * wiggle(t, 6.2, 0.45, 5)) }),
      branches: sway(t, 3.6, 1.2),
    },
    blink: [blinks(t, [0.6, 3.0, 5.0, 5.28]), blinks(t, [0.6, 3.0, 5.0, 5.28])],
  }),

  // breathing · head movement · blink · subtle paw/body movement
  fv_polarbear: (t) => ({
    poses: {
      body: merge(breathe(t, 3.0, 0.016), { angle: deg(1.1 * Math.sin((TAU * t) / 3.5)) }),
      head: pose({ angle: deg(keys(t, [[0, 0], [1.6, 0], [2.4, 4.5], [3.6, 4.5], [4.4, -3], [5.6, -3], [6.3, 0]])) }),
      earL: pose({ angle: deg(-8 * wiggle(t, 4.9, 0.5, 4)) }),
      earR: pose({ angle: deg(8 * wiggle(t, 1.2, 0.5, 4)) }),
      paw: pose({ ty: -0.012 * bump(t, 3.9, 0.7), angle: deg(-6 * bump(t, 3.9, 0.7)) }),
      fish: pose({ angle: deg(14 * Math.sin(TAU * t * 1.3)) }),
      fish2: pose({ angle: deg(-12 * Math.sin(TAU * t * 1.1 + 1)) }),
    },
    blink: [blinks(t, [1.2, 3.3, 5.9, 6.15]), blinks(t, [1.2, 3.3, 5.9, 6.15])],
  }),

  // little body sway · wing movement · tiny happy bounce
  fv_penguin: (t) => ({
    poses: {
      body: merge(
        merge(breathe(t, 2.0, 0.012), { angle: deg(3 * Math.sin((TAU * t) / 1.8)) }),
        merge(pose(hop(t, 2.6, 0.012)), hop(t, 5.4, 0.016)),
      ),
      head: pose({ angle: deg(3 * bump(t, 1.2, 1.0) - 3 * bump(t, 3.8, 1.0)) }),
      wingR: pose({ angle: deg(16 * Math.sin(TAU * t * 1.4) * keys(t, [[0, 0.2], [0.6, 1], [6.2, 1], [7, 0.3]])) }),
      wingL: pose({ angle: deg(-9 * bump(t, 2.5, 0.8) - 9 * bump(t, 5.3, 0.8)) }),
      flags: sway(t, 2.2, 3),
    },
    blink: [],
  }),
};

/** Frame for `animalId` at time `t` seconds (clamped to the beat). */
export function livingFrame(animalId: string, t: number): LivingFrame | null {
  const fn = LIVING_CHOREO[animalId];
  return fn ? fn(Math.max(0, Math.min(LIVING_DURATION, t))) : null;
}
