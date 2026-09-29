import Phaser from "phaser";
import {
  isPathClear,
  isWalkable,
  pickActivity,
  pickWanderTarget,
  pickWaypoint,
  type Activity,
  type Personality,
  type PoiAction,
  type Pt,
  type RoamArea,
  type RoamPoi,
} from "./animalBehavior";

/**
 * A rescued Frosted Valley animal living in the world: soft breathing, real
 * blinks (a lid painted in the fur colour sampled right above each eye, on the
 * same art the silhouette used), an occasional cute idle move, and its own
 * signature move for the unlock reveal and when tapped.
 *
 * Once `startRoaming` is called it also lives a life of its own inside its
 * zone: a small weighted behavior loop (see animalBehavior.ts) that walks /
 * hops / waddles between reachable spots, visits its restored landmarks,
 * looks around, nibbles, sniffs, grazes, sits, plays — each animal's
 * personality coming from its timing, gait and activity weights.
 *
 * All motion is layered through one per-frame pose (breath × action × gait)
 * applied to the sprite, so moves never fight each other's tweens. Travel is
 * a plain per-frame step toward one target (no tween), so it pauses cleanly
 * whenever a gesture — e.g. a tap greeting — takes over.
 */

interface NpcEye {
  /** Eye centre / radii / lid-colour sample, as fractions of the sprite texture. */
  u: number;
  v: number;
  ru: number;
  rv: number;
  lid: [number, number];
}

/** Hand-measured on public/assets/frosted/fv_<animal>.png (unflipped). */
const NPC_EYES: Record<string, NpcEye[]> = {
  fv_rabbit: [
    { u: 0.54, v: 0.47, ru: 0.09, rv: 0.052, lid: [0.54, 0.405] },
    { u: 0.845, v: 0.44, ru: 0.055, rv: 0.047, lid: [0.84, 0.385] },
  ],
  fv_fox: [
    { u: 0.71, v: 0.42, ru: 0.062, rv: 0.066, lid: [0.7, 0.335] },
    { u: 0.895, v: 0.385, ru: 0.036, rv: 0.056, lid: [0.89, 0.31] },
  ],
  fv_deer: [
    { u: 0.625, v: 0.375, ru: 0.078, rv: 0.058, lid: [0.62, 0.3] },
    { u: 0.865, v: 0.355, ru: 0.047, rv: 0.052, lid: [0.86, 0.29] },
  ],
  fv_squirrel: [
    { u: 0.695, v: 0.415, ru: 0.058, rv: 0.057, lid: [0.69, 0.34] },
    { u: 0.905, v: 0.405, ru: 0.028, rv: 0.047, lid: [0.905, 0.34] },
  ],
  fv_polarbear: [
    { u: 0.61, v: 0.305, ru: 0.062, rv: 0.062, lid: [0.61, 0.225] },
    { u: 0.855, v: 0.29, ru: 0.052, rv: 0.057, lid: [0.85, 0.21] },
  ],
  fv_penguin: [
    { u: 0.2, v: 0.31, ru: 0.042, rv: 0.062, lid: [0.2, 0.23] },
    { u: 0.465, v: 0.36, ru: 0.057, rv: 0.052, lid: [0.465, 0.29] },
  ],
};

interface Pose {
  ty: number; // world units, negative = up
  angle: number; // degrees
  sx: number;
  sy: number;
}

export interface RoamSetup {
  /** Walkable area in WORLD space. */
  area: RoamArea;
  personality: Personality;
  /** Live obstacles (tall props, Shop decorations placed later) — re-checked on every target pick. */
  blocked: (p: Pt) => boolean;
  /** Which way the unflipped art faces: +1 right, -1 left. */
  nativeFacing: 1 | -1;
  /** Never sort below this depth (the rabbit lives on top of its yard art). */
  depthFloor?: number;
}

interface Travel {
  tx: number;
  ty: number;
  speed: number;
  /** Plain glide (the penguin's belly slide): no gait bob/rock. */
  glide: boolean;
  deadline: number;
  resolve: () => void;
}

type AddStep = (p: Partial<Pose>, duration: number, ease?: string) => void;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class FrostedAnimalNpc {
  readonly sprite: Phaser.GameObjects.Image;
  private scene: Phaser.Scene;
  private key: string;
  private flip: boolean;
  private baseX: number;
  private baseY: number;
  private baseScale: number;
  private lids: Phaser.GameObjects.Graphics;
  private eyes: Array<NpcEye & { color: number }>;
  private act: Pose = { ty: 0, angle: 0, sx: 1, sy: 1 };
  private blink = { v: 0 };
  private breathPhase = Math.random() * Math.PI * 2;
  private breathPeriod = 1500 + Math.random() * 400;
  private alive = false;
  private busy = false;
  private timers: Phaser.Time.TimerEvent[] = [];

  private roam?: RoamSetup;
  private travel?: Travel;
  private gait: Pose = { ty: 0, angle: 0, sx: 1, sy: 1 };
  private gaitPhase = 0;
  /** 0→1 while turning around (a quick squash through the flip); undefined when not turning. */
  private turnT?: number;
  private turnFlipped = false;
  /** The baseY its depth was last sorted at — -Infinity so the first roaming frame always sorts. */
  private sortedY = Number.NEGATIVE_INFINITY;
  private lastActivity?: Activity;
  private lastPoi?: RoamPoi;
  private pendingGreet = false;

  constructor(scene: Phaser.Scene, key: string, x: number, y: number, scale: number, flip: boolean) {
    this.scene = scene;
    this.key = key;
    this.flip = flip;
    this.baseX = x;
    this.baseY = y;
    this.baseScale = scale;
    this.sprite = scene.add.image(x, y, key).setOrigin(0.5, 1).setScale(scale).setDepth(y).setFlipX(flip);
    this.lids = scene.add.graphics().setDepth(y + 0.05);

    const src = scene.textures.get(key).getSourceImage() as { width: number; height: number };
    this.eyes = (NPC_EYES[key] ?? []).map((e) => {
      const c = scene.textures.getPixel(Math.round(e.lid[0] * src.width), Math.round(e.lid[1] * src.height), key);
      return { ...e, color: c && c.alpha > 0 ? c.color : 0xf4f0f8 };
    });

    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /** Current feet position in world space (it moves once roaming). */
  get x(): number {
    return this.baseX;
  }

  get y(): number {
    return this.baseY;
  }

  /** Begin the endless idle life: breathing, blinks, and a cute move now and then. */
  startLife(): void {
    if (this.alive) return;
    this.alive = true;
    this.scheduleBlink();
    this.scheduleIdleMove();
  }

  setVisible(v: boolean): this {
    this.sprite.setVisible(v);
    this.lids.setVisible(v);
    return this;
  }

  private scheduleBlink(): void {
    const t = this.scene.time.delayedCall(1800 + Math.random() * 3200, () => {
      this.doBlink(Math.random() < 0.25);
      this.scheduleBlink();
    });
    this.timers.push(t);
  }

  private doBlink(double: boolean): void {
    this.scene.tweens.add({
      targets: this.blink,
      v: 1,
      duration: 70,
      yoyo: true,
      hold: 40,
      ease: "Sine.easeInOut",
      repeat: double ? 1 : 0,
      repeatDelay: 90,
    });
  }

  private scheduleIdleMove(): void {
    const t = this.scene.time.delayedCall(5000 + Math.random() * 5000, () => {
      // once roaming, the behavior loop owns the idle moves
      if (this.roam) return;
      if (!this.busy) this.playSignature(false);
      this.scheduleIdleMove();
    });
    this.timers.push(t);
  }

  /**
   * The animal's own little move — full size for the unlock reveal / a tap,
   * a softer version as an idle beat. Resolves once it has settled.
   */
  playSignature(big: boolean): Promise<void> {
    if (this.busy) return Promise.resolve();
    this.busy = true;
    const k = big ? 1 : 0.55;
    const h = this.sprite.displayHeight;
    const tw = this.scene.tweens;
    const a = this.act;
    const steps: Phaser.Types.Tweens.TweenBuilderConfig[] = [];
    const add = (p: Partial<Pose>, duration: number, ease = "Sine.easeInOut") =>
      steps.push({ targets: a, ...p, duration, ease } as Phaser.Types.Tweens.TweenBuilderConfig);
    const hop = (lift: number, n = 1) => {
      for (let i = 0; i < n; i++) {
        add({ sy: 0.9, sx: 1.07, ty: 0 }, 110, "Quad.easeOut");
        add({ sy: 1.08, sx: 0.95, ty: -h * lift * k }, 200, "Quad.easeOut");
        add({ sy: 0.92, sx: 1.06, ty: 0 }, 170, "Quad.easeIn");
        add({ sy: 1, sx: 1 }, 140);
      }
    };
    const tilt = (deg: number, dur: number) => add({ angle: deg * k * (this.flip ? -1 : 1) }, dur);

    switch (this.key) {
      case "fv_rabbit": // little hop + ear wiggle
        hop(0.14);
        tilt(-5, 110);
        tilt(5, 110);
        tilt(-4, 100);
        tilt(0, 120);
        break;
      case "fv_fox": // tail swish + head tilt
        tilt(-6, 160);
        tilt(6, 180);
        tilt(-5, 170);
        tilt(0, 150);
        tilt(9, 260);
        add({ sy: 1.02 }, 420);
        tilt(0, 280);
        add({ sy: 1 }, 100);
        break;
      case "fv_deer": // gentle head raise + ear movement
        add({ sy: 1 + 0.07 * k, sx: 1 - 0.02 * k }, 520, "Sine.easeOut");
        tilt(3, 160);
        tilt(-3, 160);
        tilt(0, 140);
        add({ sy: 1, sx: 1 }, 480);
        break;
      case "fv_squirrel": // quick little bounce + tail movement
        hop(0.1, 2);
        tilt(-7, 90);
        tilt(7, 90);
        tilt(-5, 90);
        tilt(0, 90);
        break;
      case "fv_polarbear": // small happy body movement + blink
        add({ sx: 1.05 * k + (1 - k), sy: 0.96 * k + (1 - k) }, 260);
        tilt(-4, 300);
        tilt(4, 360);
        tilt(0, 300);
        add({ sx: 1, sy: 1 }, 240);
        break;
      case "fv_penguin": // tiny wing flap + happy bounce
        tilt(-8, 120);
        tilt(8, 140);
        tilt(-8, 140);
        tilt(0, 120);
        hop(0.08, 2);
        break;
      default:
        hop(0.1);
    }

    return new Promise((resolve) => {
      if (this.key === "fv_polarbear") this.scene.time.delayedCall(500, () => this.doBlink(true));
      else this.scene.time.delayedCall(300, () => this.doBlink(false));
      tw.chain({
        targets: a,
        tweens: steps,
        onComplete: () => {
          Object.assign(a, { ty: 0, angle: 0, sx: 1, sy: 1 });
          this.busy = false;
          resolve();
        },
      });
    });
  }

  /* ================= roaming life ================= */

  /**
   * Hand the animal over to its autonomous life inside `setup.area`. Safe to
   * call more than once (later calls do nothing); it keeps running until the
   * scene shuts down, pausing with the scene while an overlay is open, like
   * every other timer/tween here.
   */
  startRoaming(setup: RoamSetup): void {
    if (this.roam) return;
    this.roam = setup;
    this.startLife();
    void this.runLife();
  }

  /**
   * A tap: turn toward `towardX` (where the player is looking from), do the
   * big signature move, then carry on with whatever it was doing. If it's
   * mid-gesture, the greeting plays as soon as that gesture ends.
   */
  greet(towardX?: number): void {
    if (this.roam && towardX !== undefined && Math.abs(towardX - this.baseX) > 20) this.face(towardX > this.baseX ? 1 : -1);
    if (this.busy) {
      this.pendingGreet = true;
      return;
    }
    void this.playSignature(true);
  }

  private get live(): boolean {
    return this.alive && !!this.roam && this.sprite.active;
  }

  /** +1 when facing right, -1 when facing left — counting a turn already in progress. */
  private get facing(): 1 | -1 {
    const native = this.roam?.nativeFacing ?? 1;
    const flip = this.turnT !== undefined && !this.turnFlipped ? !this.flip : this.flip;
    return (flip ? -native : native) as 1 | -1;
  }

  /** Turn to face `dir`, with a quick squash through the flip rather than a hard snap. */
  private face(dir: 1 | -1): void {
    if (dir === this.facing) return;
    if (this.turnT !== undefined && !this.turnFlipped) {
      // turning the other way already, before the flip: just cancel it
      this.turnT = undefined;
      return;
    }
    this.turnT = 0;
    this.turnFlipped = false;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.timers = this.timers.filter((t) => t.getOverallProgress() < 1);
      this.timers.push(this.scene.time.delayedCall(ms, resolve));
    });
  }

  private async runLife(): Promise<void> {
    // stagger so animals loaded together never start in lockstep
    await this.wait(rand(300, 2200));
    while (this.live) {
      const p = this.roam!.personality;
      const act = pickActivity(p.weights, this.lastActivity, Math.random, (a) => this.canDo(a));
      this.lastActivity = act;
      await this.perform(act);
      if (!this.live) return;
      await this.wait(rand(p.pause[0], p.pause[1]));
    }
  }

  private canDo(a: Activity): boolean {
    if (a === "visit") return this.roam!.area.pois.length > 0;
    return true;
  }

  private perform(a: Activity): Promise<void> {
    switch (a) {
      case "wander":
        return this.wander();
      case "visit":
        return this.visit();
      case "look":
        return this.lookAround();
      case "nibble":
      case "sniff":
      case "graze":
      case "play":
        return this.doAction(a);
      case "sit":
        return this.sit();
      case "slide":
        return this.slide();
      case "signature":
        return this.playSignature(false);
      default:
        return this.wait(rand(600, 1400));
    }
  }

  private async wander(): Promise<void> {
    const { area, personality, blocked } = this.roam!;
    const here = { x: this.baseX, y: this.baseY };
    const target = pickWanderTarget(here, area, personality.wander, Math.random, blocked);
    if (target) return this.goTo(target);
    // nowhere reachable (e.g. a decoration was just placed right on top of
    // it): never stay stuck — walk back out to the nearest clear spot
    if (!isWalkable(here, area, blocked)) {
      const clear = this.findClearSpot();
      if (clear) await this.goTo(clear);
    }
  }

  /** The nearest walkable point in the area — the unstick fallback. */
  private findClearSpot(): Pt | null {
    const { area, blocked } = this.roam!;
    const xs = area.poly.map((p) => p.x);
    const ys = area.poly.map((p) => p.y);
    let best: Pt | null = null;
    let bestD = Infinity;
    for (let i = 0; i < 40; i++) {
      const p = { x: rand(Math.min(...xs), Math.max(...xs)), y: rand(Math.min(...ys), Math.max(...ys)) };
      if (!isWalkable(p, area, blocked)) continue;
      const d = Math.hypot(p.x - this.baseX, p.y - this.baseY);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  /** Walk over to one of its restored landmarks (via a stepping-stone if needed), then interact with it. */
  private async visit(): Promise<void> {
    const { area, blocked } = this.roam!;
    const choices = area.pois.length > 1 ? area.pois.filter((p) => p !== this.lastPoi) : area.pois;
    const poi = choices[Math.floor(Math.random() * choices.length)];
    this.lastPoi = poi;
    const here = { x: this.baseX, y: this.baseY };
    const SLACK = 30;
    if (!isPathClear(here, poi, area, blocked, 18, SLACK)) {
      const via = pickWaypoint(here, poi, area, Math.random, blocked, 24, SLACK);
      if (!via) return this.wander();
      await this.goTo(via);
      if (!this.live) return;
      await this.wait(rand(150, 500));
    }
    await this.goTo(poi);
    if (!this.live) return;
    this.face(poi.face);
    await this.wait(rand(250, 600));
    await this.doAction(poi.action);
  }

  /** Stop and look about: glance one way, then the other, sometimes toward a landmark it can see. */
  private async lookAround(): Promise<void> {
    const { area } = this.roam!;
    const gaze =
      area.gazes.length && Math.random() < 0.5 ? area.gazes[Math.floor(Math.random() * area.gazes.length)] : undefined;
    const first: 1 | -1 = gaze ? (gaze.x > this.baseX ? 1 : -1) : this.facing === 1 ? -1 : 1;
    this.face(first);
    await this.wait(rand(250, 450));
    await this.gesture((add, dir, h) => {
      // lift the head a touch and tilt, as if taking it all in
      add({ sy: 1.035, ty: -h * 0.005, angle: -3 * dir }, 360);
      add({ angle: -1 * dir }, 420);
      add({ angle: 2 * dir }, 380);
      add({ sy: 1, ty: 0, angle: 0 }, 320);
    });
    await this.wait(rand(700, 1500));
    if (Math.random() < 0.6) {
      this.face(first === 1 ? -1 : 1);
      await this.wait(rand(700, 1400));
    }
  }

  /** Settle down for a while — the rest itself is a plain wait, so a tap greeting still gets it up. */
  private async sit(): Promise<void> {
    await this.gesture((add) => add({ sy: 0.93, sx: 1.04 }, 420, "Sine.easeOut"));
    await this.wait(rand(2600, 5200));
    await this.gesture((add) => {
      add({ sy: 1.03, sx: 0.98 }, 240, "Sine.easeOut");
      add({ sy: 1, sx: 1 }, 180);
    });
  }

  /** The penguin's belly slide: flop forward, glide a stretch of open snow, pop back up. */
  private async slide(): Promise<void> {
    const { area, blocked } = this.roam!;
    const here = { x: this.baseX, y: this.baseY };
    let target: Pt | null = null;
    for (let i = 0; i < 10 && !target; i++) {
      const p = { x: here.x + (Math.random() < 0.5 ? 1 : -1) * rand(150, 260), y: here.y + rand(-40, 40) };
      if (isPathClear(here, p, area, blocked)) target = p;
    }
    if (!target) return this.playSignature(false);
    this.face(target.x > here.x ? 1 : -1);
    await this.wait(260);
    await this.gesture((add, dir, h) => {
      add({ sy: 0.9, sx: 1.06 }, 140, "Quad.easeOut");
      add({ angle: 62 * dir, ty: -h * 0.04, sy: 1, sx: 1 }, 260, "Quad.easeIn");
    });
    await this.goTo(target, 230, true);
    await this.gesture((add, dir, h) => {
      add({ angle: 8 * dir, ty: -h * 0.06 }, 240, "Quad.easeOut");
      add({ angle: 0, ty: 0, sy: 0.93 }, 160, "Quad.easeIn");
      add({ sy: 1 }, 140);
    });
  }

  /** Nibble / sniff / graze / play — on the spot, or beside a landmark. */
  private doAction(a: PoiAction): Promise<void> {
    switch (a) {
      case "nibble":
        // lean in, a run of quick little bites
        return this.gesture((add, dir) => {
          add({ angle: 7 * dir, sy: 0.95 }, 200, "Sine.easeOut");
          const n = 4 + Math.floor(Math.random() * 4);
          for (let i = 0; i < n; i++) {
            add({ angle: 10 * dir, sy: 0.94 }, 100);
            add({ angle: 6 * dir, sy: 0.96 }, 110);
          }
          add({ angle: 0, sy: 1 }, 220);
        });
      case "sniff":
        // nose to the ground, short twitchy sniffs
        return this.gesture((add, dir, h) => {
          add({ angle: 8 * dir, ty: h * 0.01, sy: 0.97 }, 320, "Sine.easeOut");
          for (let i = 0; i < 5; i++) {
            add({ angle: 9.5 * dir }, 75);
            add({ angle: 7.5 * dir }, 85);
          }
          add({ angle: 8 * dir }, 260);
          add({ angle: 0, ty: 0, sy: 1 }, 300);
        });
      case "graze": {
        // a slow dip down to the snow, a few unhurried chews, then back up
        const chews = 2 + Math.floor(Math.random() * 3);
        return this.gesture((add, dir, h) => {
          add({ angle: 11 * dir, ty: h * 0.015, sy: 0.96 }, 700, "Sine.easeInOut");
          for (let i = 0; i < chews; i++) {
            add({ angle: 12.5 * dir }, 320);
            add({ angle: 10.5 * dir }, 380);
          }
          add({ angle: 11 * dir }, 500);
          add({ angle: 0, ty: 0, sy: 1 }, 700, "Sine.easeInOut");
        });
      }
      case "play":
        return this.play();
      default: // "look"
        return this.lookAround();
    }
  }

  private play(): Promise<void> {
    if (this.key === "fv_squirrel") return this.spinHops();
    if (this.key === "fv_polarbear") {
      // a happy heavy wiggle and a little bounce
      return this.gesture((add, dir, h) => {
        for (let i = 0; i < 3; i++) {
          add({ angle: -9 * dir, sx: 1.05, sy: 0.96 }, 260);
          add({ angle: 9 * dir, sx: 0.97, sy: 1.03 }, 280);
        }
        add({ angle: 0, sx: 1, sy: 1 }, 220);
        this.hopSteps(add, h, 0.06);
      });
    }
    // penguin (and anyone else): a flurry of wing flaps with a hop
    return this.gesture((add, dir, h) => {
      for (let i = 0; i < 4; i++) {
        add({ angle: -9 * dir, sx: 1.04 }, 110);
        add({ angle: 9 * dir, sx: 0.98 }, 120);
      }
      add({ angle: 0, sx: 1 }, 110);
      this.hopSteps(add, h, 0.1);
    });
  }

  private hopSteps(add: AddStep, h: number, lift: number): void {
    add({ sy: 0.9, sx: 1.07 }, 110, "Quad.easeOut");
    add({ ty: -h * lift, sy: 1.08, sx: 0.95 }, 200, "Quad.easeOut");
    add({ ty: 0, sy: 0.92, sx: 1.06 }, 170, "Quad.easeIn");
    add({ sy: 1, sx: 1 }, 140);
  }

  /** The squirrel's play: a few quick hops in place, spinning round each time. */
  private async spinHops(): Promise<void> {
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n && this.live; i++) {
      await this.gesture((add, _dir, h) => this.hopSteps(add, h, 0.12));
      this.face(this.facing === 1 ? -1 : 1);
      await this.wait(rand(160, 340));
    }
  }

  /**
   * Run a chain of `act` tweens as one gesture (sets `busy`, which also
   * pauses travel). `dir` is +1 facing right / -1 facing left, so a positive
   * angle × dir always tips the head forward. A greeting that arrived
   * meanwhile plays right after.
   */
  private gesture(build: (add: AddStep, dir: 1 | -1, h: number) => void): Promise<void> {
    if (this.busy || !this.sprite.active) return Promise.resolve();
    const steps: Phaser.Types.Tweens.TweenBuilderConfig[] = [];
    const add: AddStep = (p, duration, ease = "Sine.easeInOut") =>
      steps.push({ targets: this.act, ...p, duration, ease } as Phaser.Types.Tweens.TweenBuilderConfig);
    build(add, this.facing, this.sprite.displayHeight);
    if (!steps.length) return Promise.resolve();
    this.busy = true;
    return new Promise((resolve) => {
      this.scene.tweens.chain({
        targets: this.act,
        tweens: steps,
        onComplete: () => {
          this.busy = false;
          if (this.pendingGreet) {
            this.pendingGreet = false;
            void this.playSignature(true).then(resolve);
          } else resolve();
        },
      });
    });
  }

  /** Travel to `p` in a straight line at the personality's pace (or `speed`). Resolves on arrival. */
  private goTo(p: Pt, speed?: number, glide = false): Promise<void> {
    const v = speed ?? this.roam!.personality.speed;
    const dist = Math.hypot(p.x - this.baseX, p.y - this.baseY);
    if (dist < 4) return Promise.resolve();
    if (!glide && Math.abs(p.x - this.baseX) > 10) this.face(p.x > this.baseX ? 1 : -1);
    return new Promise((resolve) => {
      this.travel?.resolve();
      this.travel = {
        tx: p.x,
        ty: p.y,
        speed: v,
        glide,
        // a hard cap so a stalled trip (a long greeting…) can never hang the loop
        deadline: this.scene.time.now + (dist / v) * 1000 * 1.6 + 8000,
        resolve,
      };
    });
  }

  /** One frame of travel, plus the gait pose that goes with it. */
  private stepTravel(dt: number): void {
    const t = this.travel!;
    const pers = this.roam!.personality;
    const dx = t.tx - this.baseX;
    const dy = t.ty - this.baseY;
    const dist = Math.hypot(dx, dy);
    const step = t.speed * dt;
    if (dist <= step || this.scene.time.now > t.deadline) {
      this.baseX = t.tx;
      this.baseY = t.ty;
      this.travel = undefined;
      t.resolve();
      return;
    }
    this.baseX += (dx / dist) * step;
    this.baseY += (dy / dist) * step;
    if (t.glide) return;

    this.gaitPhase += step / pers.stride;
    const h = this.sprite.displayHeight;
    const g = this.gait;
    if (pers.gait === "hop") {
      const f = this.gaitPhase % 1;
      const s = Math.sin(Math.PI * f);
      g.ty = -s * pers.lift * h;
      // squash on take-off / landing, stretch in the air, nose up then down
      const squash = f < 0.12 ? 1 - f / 0.12 : f > 0.9 ? (f - 0.9) / 0.1 : 0;
      g.sy = 1 + 0.06 * s - 0.08 * squash;
      g.sx = 1 - 0.035 * s + 0.06 * squash;
      g.angle = this.facing * (f - 0.5) * 7;
    } else {
      const ph = this.gaitPhase * Math.PI * 2;
      g.ty = -Math.abs(Math.sin(ph)) * pers.lift * h;
      g.angle = Math.sin(ph) * pers.sway;
      g.sx = 1;
      g.sy = pers.gait === "waddle" ? 1 + 0.02 * Math.abs(Math.sin(ph)) : 1;
    }
  }

  private update(time: number, delta: number): void {
    if (!this.sprite.active) return;

    const moving = !!this.travel && !this.busy;
    if (moving) this.stepTravel(Math.min(delta, 50) / 1000);
    if (!moving || !this.travel) {
      // ease the gait pose back to neutral (landing out of a hop, etc.)
      const g = this.gait;
      g.ty *= 0.7;
      g.angle *= 0.7;
      g.sx += (1 - g.sx) * 0.3;
      g.sy += (1 - g.sy) * 0.3;
    }

    // turning around: squash to a sliver, flip at the midpoint, spring back
    let turnSx = 1;
    if (this.turnT !== undefined) {
      this.turnT += delta / 200;
      if (this.turnT >= 0.5 && !this.turnFlipped) {
        this.turnFlipped = true;
        this.flip = !this.flip;
        this.sprite.setFlipX(this.flip);
      }
      if (this.turnT >= 1) this.turnT = undefined;
      else turnSx = Math.max(0.2, Math.abs(Math.cos(Math.PI * this.turnT)));
    }

    const breath = this.alive ? Math.sin(this.breathPhase + (time / this.breathPeriod) * Math.PI) : 0;
    const sy = (1 + 0.022 * breath) * this.act.sy * this.gait.sy;
    const sx = (1 - 0.008 * breath) * this.act.sx * this.gait.sx * turnSx;
    this.sprite
      .setPosition(this.baseX, this.baseY + this.act.ty + this.gait.ty)
      .setScale(this.baseScale * sx, this.baseScale * sy)
      .setAngle(this.act.angle + this.gait.angle);

    // re-sort only once it has actually moved: setDepth queues a full
    // display-list sort, not worth paying every frame for nothing
    if (this.roam && Math.abs(this.baseY - this.sortedY) >= 2) {
      this.sortedY = this.baseY;
      const d = Math.max(this.baseY, this.roam.depthFloor ?? -Infinity);
      this.sprite.setDepth(d);
      this.lids.setDepth(d + 0.05);
    }
    this.drawLids();
  }

  private drawLids(): void {
    const g = this.lids;
    g.clear();
    const b = this.blink.v;
    if (b <= 0.01 || !this.sprite.visible) return;
    const s = this.sprite;
    const fw = s.frame.realWidth;
    const fh = s.frame.realHeight;
    const cos = Math.cos(s.rotation);
    const sin = Math.sin(s.rotation);
    const toWorld = (lx: number, ly: number) => ({ x: s.x + lx * cos - ly * sin, y: s.y + lx * sin + ly * cos });

    for (const e of this.eyes) {
      const u = this.flip ? 1 - e.u : e.u;
      const cx = (u - 0.5) * fw * s.scaleX;
      const cy = (e.v - 1) * fh * s.scaleY;
      const rx = e.ru * fw * s.scaleX;
      const ry = e.rv * fh * s.scaleY;
      const edge = -ry + 2.05 * ry * b;
      const pts: Phaser.Math.Vector2[] = [];
      for (let i = 0; i < 28; i++) {
        const th = (i / 28) * Math.PI * 2;
        const w = toWorld(cx + rx * Math.cos(th), cy + Math.min(ry * Math.sin(th), edge));
        pts.push(new Phaser.Math.Vector2(w.x, w.y));
      }
      g.fillStyle(e.color, 1);
      g.fillPoints(pts, true);
      if (b > 0.25 && edge < ry) {
        const half = rx * Math.sqrt(Math.max(0, 1 - (edge / ry) ** 2));
        const l = toWorld(cx - half, cy + edge);
        const r = toWorld(cx + half, cy + edge);
        g.lineStyle(Math.max(1.5, ry * 0.16), 0x3a2a3a, 0.75);
        g.lineBetween(l.x, l.y, r.x, r.y);
      }
    }
  }

  destroy(): void {
    this.alive = false;
    this.travel = undefined;
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.timers.forEach((t) => t.remove(false));
    this.timers = [];
    this.lids.destroy();
    this.sprite.destroy();
  }
}
