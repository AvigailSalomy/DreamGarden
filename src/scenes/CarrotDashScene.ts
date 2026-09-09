import Phaser from "phaser";
import { COLORS, labelStyle, titleStyle } from "../ui/theme";
import { makePanel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { safeInsets } from "../util/safeArea";
import { bus, requests as requestsService } from "../game/services";
import { Sfx } from "../fx/Sfx";
import { dustRing, petalPuff } from "../fx/Particles";
import type { LevelDef } from "../data/types";

interface CarrotDashInit {
  objectId: string;
  level: LevelDef;
}

type PickupKind = "carrot" | "star" | "golden";
type ObstacleKind = "rock" | "puddle" | "bush";
type EntKind = PickupKind | ObstacleKind;

interface Ent {
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image | null;
  kind: EntKind;
  lane: number;
  /** 0 = far horizon, 1 = the player line, > ~1.14 = off the bottom (recycle). */
  t: number;
  active: boolean;
  consumed: boolean;
  spin: number;
}

interface Deco {
  img: Phaser.GameObjects.Image;
  side: number;
  t: number;
  jitter: number;
  active: boolean;
}

interface Floater {
  txt: Phaser.GameObjects.Text;
  vy: number;
  life: number;
  active: boolean;
}

const RUN_SECONDS = 28;
const LANES = 3;

const ENT_POOL = 40;
const GLOW_POOL = 6;
const DECO_POOL = 12;
const FLOATER_POOL = 10;
const ROW_GAP = 0.16;

/** Base (scale-1) footprint per entity kind, multiplied by the perspective scale. */
const ENT_SIZE: Record<EntKind, [number, number]> = {
  carrot: [44, 44],
  star: [46, 46],
  golden: [52, 52],
  rock: [82, 62],
  puddle: [104, 52],
  bush: [70, 78],
};

const PICKUP_VALUE: Record<PickupKind, number> = { carrot: 10, star: 25, golden: 120 };

const COMBO_MILESTONES: Record<number, string> = {
  5: "NICE!",
  10: "GREAT!",
  15: "AMAZING!",
  20: "GARDEN RUSH!",
};

/**
 * CARROT DASH — a short (~28s) auto-runner over a scrolling garden path.
 *
 * Replaces the old falling-item / basket minigame. The player auto-runs forward in
 * one of three lanes, hopping between lanes to grab carrots / stars / golden
 * carrots and to dodge rocks, puddles and bushes. Hitting an obstacle briefly
 * slows the runner and breaks the combo — it never ends the run. After the timer
 * the results card awards coins through `RequestsService.recordMinigameRound`,
 * exactly like the game it replaced, so the Requests / economy / progression
 * wiring is untouched.
 *
 * Performance shape:
 *  - one `update()` game loop; no per-object timers, no setInterval/setTimeout
 *  - fixed-size object pools — entities/decor/floaters are recycled, never
 *    created or destroyed mid-run
 *  - a single reusable particle emitter for every pickup burst
 *  - an accumulator spawn scheduler
 *  - HUD Text is only re-rendered when an integer actually changes
 */
export class CarrotDashScene extends Phaser.Scene {
  private objectId!: string;
  private levelDef!: LevelDef;

  // layout (recomputed on resize)
  private W = 0;
  private H = 0;
  private cx = 0;
  private horizonY = 0;
  private playerY = 0;
  private topHalfW = 0;
  private botHalfW = 0;

  private root!: Phaser.GameObjects.Container;
  private skyG!: Phaser.GameObjects.Graphics;
  private hills!: Phaser.GameObjects.Image;
  private pathG!: Phaser.GameObjects.Graphics;
  private decoC!: Phaser.GameObjects.Container;
  private entsC!: Phaser.GameObjects.Container;
  private player!: Phaser.GameObjects.Image;
  private playerShadow!: Phaser.GameObjects.Image;
  private fx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private flash!: Phaser.GameObjects.Rectangle;
  private inputZone!: Phaser.GameObjects.Rectangle;
  private legendC?: Phaser.GameObjects.Container;

  private hudC!: Phaser.GameObjects.Container;
  private hudPanel!: Phaser.GameObjects.Container;
  private carrotIcon!: Phaser.GameObjects.Image;
  private timeText!: Phaser.GameObjects.Text;
  private carrotText!: Phaser.GameObjects.Text;
  private comboText!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;
  private bannerTween?: Phaser.Tweens.Tween;

  private ents: Ent[] = [];
  private glowPool: Phaser.GameObjects.Image[] = [];
  private deco: Deco[] = [];
  private floaters: Floater[] = [];

  // reused each frame by drawPath so it allocates nothing
  private quad: Phaser.Geom.Point[] = [];
  private verge: Phaser.Geom.Point[] = [];

  // run state
  private elapsed = 0;
  private scroll = 0;
  private spawnAccum = 0;
  private decoAccum = 0;
  private playerLane = 1;
  private hop = { v: 0 };
  private pScaleX = 1;
  private pScaleY = 1;
  private slowUntil = 0;
  private laneLockUntil = 0;
  /** Short post-hit i-frames so one obstacle cluster can't multi-hit through a slowdown. */
  private hitGraceUntil = 0;

  private carrots = 0;
  private stars = 0;
  private golden = 0;
  private combo = 0;
  private bestCombo = 0;
  private lastMilestone = 0;
  private score = 0;

  private finished = false;
  private completed = false;

  // cached HUD integers so we only touch Text objects on a real change
  private hud = { time: -1, carrots: -1, combo: -1 };

  // pointer gesture tracking
  private pDownX = 0;
  private pDownY = 0;
  private pDownT = 0;

  private keyHandler?: (e: KeyboardEvent) => void;
  private onResizeBound?: () => void;

  constructor() {
    super("CarrotDash");
  }

  init(data: CarrotDashInit): void {
    this.objectId = data.objectId;
    this.levelDef = data.level;
    this.ents = [];
    this.glowPool = [];
    this.deco = [];
    this.floaters = [];
    this.quad = [
      new Phaser.Geom.Point(),
      new Phaser.Geom.Point(),
      new Phaser.Geom.Point(),
      new Phaser.Geom.Point(),
    ];
    this.verge = [
      new Phaser.Geom.Point(),
      new Phaser.Geom.Point(),
      new Phaser.Geom.Point(),
      new Phaser.Geom.Point(),
    ];
    this.elapsed = 0;
    this.scroll = 0;
    this.spawnAccum = 0;
    this.decoAccum = 0;
    this.playerLane = 1;
    this.hop = { v: 0 };
    this.slowUntil = 0;
    this.laneLockUntil = 0;
    this.hitGraceUntil = 0;
    this.carrots = 0;
    this.stars = 0;
    this.golden = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.lastMilestone = 0;
    this.score = 0;
    this.finished = false;
    this.completed = false;
    this.hud = { time: -1, carrots: -1, combo: -1 };
  }

  create(): void {
    const def = requestsService.def(this.objectId);
    if (!def) {
      this.finishAbort();
      return;
    }

    this.computeLayout();

    this.root = this.add.container(0, 0);

    this.skyG = this.add.graphics();
    this.root.add(this.skyG);
    this.drawSky();

    this.hills = this.add
      .image(this.cx, this.horizonY, "hills_near")
      .setOrigin(0.5, 1)
      .setAlpha(0.55)
      .setTint(0x9ec98b);
    this.root.add(this.hills);
    this.sizeHills();
    this.tweens.add({
      targets: this.hills,
      x: this.cx + 22,
      duration: 9000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.pathG = this.add.graphics();
    this.root.add(this.pathG);

    this.decoC = this.add.container(0, 0);
    this.root.add(this.decoC);

    this.entsC = this.add.container(0, 0);
    this.root.add(this.entsC);

    this.playerShadow = this.add
      .image(this.laneX(this.playerLane, 1), this.playerY + 34, "shadow")
      .setDisplaySize(86, 30)
      .setAlpha(0.28);
    this.root.add(this.playerShadow);

    this.player = this.add
      .image(this.laneX(this.playerLane, 1), this.playerY, "rabbit")
      .setDisplaySize(84, 96);
    this.root.add(this.player);
    this.pScaleX = this.player.scaleX;
    this.pScaleY = this.player.scaleY;

    // one reusable burst emitter — never allocated per pickup
    this.fx = this.add
      .particles(0, 0, "spark", {
        lifespan: { min: 260, max: 560 },
        speed: { min: 40, max: 180 },
        scale: { start: 0.55, end: 0 },
        alpha: { start: 1, end: 0 },
        rotate: { min: 0, max: 360 },
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(9000);

    this.flash = this.add.rectangle(0, 0, this.W, this.H, 0xffffff, 0).setOrigin(0, 0);
    this.root.add(this.flash);

    this.buildPools();
    this.buildHud();

    this.banner = this.add
      .text(this.cx, this.H * 0.34, "", { ...titleStyle(44), color: "#fff3d8" })
      .setOrigin(0.5)
      .setStroke("#7a4d12", 6)
      .setAlpha(0);
    this.root.add(this.banner);

    this.bindInput();

    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 180 });
    this.showBanner("GO!", 34, 520);
    this.buildLegend();
    Sfx.whoosh();

    // seed the field so something is already approaching on the first frame
    this.spawnPattern(0);

    this.onResizeBound = () => this.computeLayout(true);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResizeBound);

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__dgCarrotDash = {
        finish: () => (this.elapsed = RUN_SECONDS),
        combo: (n = 12) => {
          for (let i = 0; i < n; i++) this.collect("carrot");
        },
      };
    }
  }

  /* ------------------------------------------------------------------ layout */

  private computeLayout(reposition = false): void {
    this.W = this.scale.width;
    this.H = this.scale.height;
    this.cx = this.W / 2;
    const stageW = Phaser.Math.Clamp(Math.min(this.W * 0.92, this.H * 0.62), 320, 700);
    this.horizonY = Phaser.Math.Clamp(this.H * 0.16, 70, 220);
    this.playerY = this.H - Phaser.Math.Clamp(this.H * 0.16, 96, 190);
    this.topHalfW = stageW * 0.17;
    this.botHalfW = stageW * 0.5;

    if (!reposition) return;

    this.drawSky();
    this.hills.setPosition(this.cx, this.horizonY);
    this.sizeHills();
    this.flash.setSize(this.W, this.H);
    this.inputZone.setSize(this.W, this.H);
    const hit = this.inputZone.input?.hitArea as Phaser.Geom.Rectangle | undefined;
    if (hit) {
      hit.width = this.W;
      hit.height = this.H;
    }
    this.player.setPosition(this.laneX(this.playerLane, 1), this.playerY);
    this.playerShadow.setPosition(this.laneX(this.playerLane, 1), this.playerY + 34);
    this.layoutHud();
    this.banner.setPosition(this.cx, this.H * 0.34);
  }

  private sizeHills(): void {
    this.hills.setDisplaySize(Math.max(this.W * 1.25, 900), 190);
  }

  /** Compresses the far half of the track so distant things bunch near the horizon. */
  private curve(t: number): number {
    const c = Phaser.Math.Clamp(t, 0, 1.14);
    return c * (0.34 + 0.66 * c);
  }

  private halfWAt(t: number): number {
    return Phaser.Math.Linear(this.topHalfW, this.botHalfW, this.curve(t));
  }

  private pyAt(t: number): number {
    return Phaser.Math.Linear(this.horizonY, this.playerY, this.curve(t));
  }

  private scaleAt(t: number): number {
    return 0.32 + 0.92 * Phaser.Math.Clamp(t, 0, 1.14);
  }

  private laneX(lane: number, t: number): number {
    return this.cx + (lane - 1) * this.halfWAt(t) * 0.62;
  }

  /* ------------------------------------------------------------------- pools */

  private buildPools(): void {
    for (let i = 0; i < GLOW_POOL; i++) {
      const g = this.add
        .image(-999, -999, "glow")
        .setBlendMode(Phaser.BlendModes.ADD)
        .setActive(false)
        .setVisible(false);
      this.entsC.add(g);
      this.glowPool.push(g);
    }
    for (let i = 0; i < ENT_POOL; i++) {
      const img = this.add.image(-999, -999, "carrot").setActive(false).setVisible(false);
      this.entsC.add(img);
      this.ents.push({
        img,
        glow: null,
        kind: "carrot",
        lane: 1,
        t: 0,
        active: false,
        consumed: false,
        spin: 0,
      });
    }
    for (let i = 0; i < DECO_POOL; i++) {
      const img = this.add.image(-999, -999, "flower").setActive(false).setVisible(false);
      this.decoC.add(img);
      this.deco.push({ img, side: 1, t: 0, jitter: 1, active: false });
    }
    for (let i = 0; i < FLOATER_POOL; i++) {
      const txt = this.add
        .text(-999, -999, "", { ...titleStyle(22), color: "#fff3d8" })
        .setOrigin(0.5)
        .setStroke("#7a4d12", 4)
        .setActive(false)
        .setVisible(false);
      this.root.add(txt);
      this.floaters.push({ txt, vy: 0, life: 0, active: false });
    }
  }

  /* --------------------------------------------------------------------- HUD */

  private buildHud(): void {
    this.hudC = this.add.container(0, 0);
    this.root.add(this.hudC);

    this.hudPanel = this.add.container(0, 0);
    this.timeText = this.add.text(0, 0, "", titleStyle(24)).setOrigin(0.5);
    this.carrotIcon = this.add.image(0, 0, "carrot").setDisplaySize(26, 26);
    this.carrotText = this.add.text(0, 0, "", titleStyle(22)).setOrigin(0, 0.5);
    this.comboText = this.add.text(0, 0, "", labelStyle(18, "#7a6350")).setOrigin(1, 0.5);
    this.hudC.add([this.hudPanel, this.timeText, this.carrotIcon, this.carrotText, this.comboText]);

    this.layoutHud();
    this.refreshHud(true);
  }

  private layoutHud(): void {
    const inset = safeInsets();
    const w = Math.min(this.W - 40, 440);
    const h = 54;
    this.hudC.setPosition(this.cx, inset.top + 12 + h / 2);

    this.hudPanel.removeAll(true);
    this.hudPanel.add(makePanel(this, w, h, { radius: 22 }));

    this.timeText.setPosition(-w / 2 + 44, 0);
    this.carrotIcon.setPosition(-16, 0);
    this.carrotText.setPosition(4, 0);
    this.comboText.setPosition(w / 2 - 16, 0);
  }

  private refreshHud(force = false): void {
    const timeLeft = Math.max(0, Math.ceil(RUN_SECONDS - this.elapsed));
    if (force || timeLeft !== this.hud.time) {
      this.hud.time = timeLeft;
      this.timeText.setText(`${timeLeft}s`);
      if (timeLeft <= 5 && timeLeft > 0) {
        this.timeText.setColor("#c8542f");
        this.tweens.add({ targets: this.timeText, scale: 1.16, duration: 90, yoyo: true });
      }
    }
    if (force || this.carrots !== this.hud.carrots) {
      this.hud.carrots = this.carrots;
      this.carrotText.setText(`${this.carrots}`);
    }
    if (force || this.combo !== this.hud.combo) {
      this.hud.combo = this.combo;
      this.comboText.setText(this.combo >= 2 ? `COMBO x${this.combo}` : "COMBO —");
      this.comboText.setColor(this.combo >= 10 ? "#d9a43c" : "#7a6350");
    }
  }

  /**
   * A compact "what does what" strip just under the HUD, shown for the first
   * ~2.6 s while play is already running, then it fades itself out. Static objects,
   * created once, removed on a single timer — no per-frame cost.
   */
  private buildLegend(): void {
    const items: Array<[string, string, number | undefined]> = [
      ["carrot", "Collect", undefined],
      ["star_special", "Bonus", undefined],
      ["carrot", "Golden", 0xffcf3f],
      ["rock", "Hit", undefined],
      ["water_drop", "Slide", undefined],
      ["weeds", "Slow", 0x6fae5c],
    ];
    const inset = safeInsets();
    const cellW = Math.min((this.W - 32) / items.length, 92);
    const w = cellW * items.length;
    const y = inset.top + 12 + 54 + 22;

    const c = this.add.container(this.cx, y).setDepth(9700);
    c.add(this.add.rectangle(0, 0, w + 16, 34, 0x2a2036, 0.32).setOrigin(0.5).setStrokeStyle(1, 0xffffff, 0.12));
    items.forEach(([tex, label, tint], i) => {
      const gx = -w / 2 + cellW / 2 + i * cellW;
      const im = this.add.image(gx - 24, 0, tex).setDisplaySize(18, 18);
      if (tint !== undefined) im.setTint(tint);
      c.add(im);
      c.add(this.add.text(gx - 12, 0, label, labelStyle(11, "#fef6e8")).setOrigin(0, 0.5));
    });
    this.root.add(c);
    this.legendC = c;

    this.time.delayedCall(2600, () => {
      if (!this.legendC) return;
      this.tweens.add({
        targets: this.legendC,
        alpha: 0,
        y: y - 10,
        duration: 320,
        onComplete: () => {
          this.legendC?.destroy();
          this.legendC = undefined;
        },
      });
    });
  }

  /* ------------------------------------------------------------------- input */

  private bindInput(): void {
    this.inputZone = this.add
      .rectangle(0, 0, this.W, this.H, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setInteractive();
    this.root.add(this.inputZone);

    this.inputZone.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.pDownX = p.x;
      this.pDownY = p.y;
      this.pDownT = this.time.now;
    });
    this.inputZone.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (this.finished) return;
      const dx = p.x - this.pDownX;
      const dy = p.y - this.pDownY;
      if (Math.abs(dx) > 34 && Math.abs(dx) > Math.abs(dy)) {
        this.moveLane(dx > 0 ? 1 : -1);
      } else if (this.time.now - this.pDownT < 260) {
        this.moveLane(p.x < this.cx ? -1 : 1);
      }
    });

    const kb = this.input.keyboard;
    if (kb) {
      kb.addCapture("LEFT,RIGHT,A,D");
      this.keyHandler = (e: KeyboardEvent) => {
        if (this.finished) return;
        const k = e.key.toLowerCase();
        if (k === "arrowleft" || k === "a") this.moveLane(-1);
        else if (k === "arrowright" || k === "d") this.moveLane(1);
      };
      kb.on("keydown", this.keyHandler);
    }
  }

  private moveLane(dir: number): void {
    if (this.finished || this.time.now < this.laneLockUntil) return;
    const next = Phaser.Math.Clamp(this.playerLane + Math.sign(dir), 0, LANES - 1);
    if (next === this.playerLane) return;
    this.playerLane = next;
    Sfx.tap();

    this.tweens.add({
      targets: this.player,
      x: this.laneX(next, 1),
      duration: 110,
      ease: "Sine.easeOut",
    });
    this.tweens.add({ targets: this.player, angle: dir > 0 ? 10 : -10, duration: 80, yoyo: true });
    this.tweens.killTweensOf(this.hop);
    this.hop.v = 0;
    this.tweens.add({ targets: this.hop, v: -16, duration: 105, yoyo: true, ease: "Sine.easeOut" });
  }

  /* ---------------------------------------------------------------- spawning */

  private difficulty(): number {
    return Phaser.Math.Clamp(this.elapsed / RUN_SECONDS, 0, 1);
  }

  private freeEnt(): Ent | null {
    for (let i = 0; i < this.ents.length; i++) if (!this.ents[i].active) return this.ents[i];
    return null;
  }

  private countActive(): number {
    let n = 0;
    for (let i = 0; i < this.ents.length; i++) if (this.ents[i].active) n++;
    return n;
  }

  private spawnEnt(kind: EntKind, lane: number, t: number): void {
    const e = this.freeEnt();
    if (!e) return;
    e.active = true;
    e.consumed = false;
    e.kind = kind;
    e.lane = lane;
    e.t = t;
    e.spin = Math.random() * 360;

    const img = e.img;
    img.setActive(true).setVisible(true).setAlpha(1).clearTint().setAngle(0);
    switch (kind) {
      case "carrot":
        img.setTexture("carrot");
        break;
      case "star":
        img.setTexture("star_special");
        break;
      case "golden": {
        img.setTexture("carrot").setTint(0xffcf3f);
        for (let i = 0; i < this.glowPool.length; i++) {
          const g = this.glowPool[i];
          if (!g.active) {
            g.setActive(true).setVisible(true).setAlpha(0.5);
            e.glow = g;
            break;
          }
        }
        break;
      }
      case "rock":
        img.setTexture("rock");
        break;
      case "puddle":
        img.setTexture("pond_dry").setTint(0x8fbfe6);
        break;
      case "bush":
        img.setTexture("weeds").setTint(0x6fae5c);
        break;
    }
  }

  private recycle(e: Ent): void {
    e.active = false;
    e.consumed = false;
    e.img
      .setActive(false)
      .setVisible(false)
      .setPosition(-999, -999)
      .clearTint()
      .setAngle(0)
      .setAlpha(1);
    if (e.glow) {
      e.glow.setActive(false).setVisible(false).setPosition(-999, -999);
      e.glow = null;
    }
  }

  private randObstacle(): ObstacleKind {
    return (["rock", "puddle", "bush"] as ObstacleKind[])[Phaser.Math.Between(0, 2)];
  }

  /** Emit one small, readable cluster. Difficulty widens the pattern menu. */
  private spawnPattern(diff: number): void {
    const menu = [0, 1, 2];
    if (diff > 0.22) menu.push(3, 4);
    if (diff > 0.45) menu.push(5);
    if (diff > 0.62) menu.push(4, 5);
    switch (menu[Phaser.Math.Between(0, menu.length - 1)]) {
      case 0: {
        // full row of carrots across all three lanes
        for (let l = 0; l < LANES; l++) this.spawnEnt("carrot", l, -0.04);
        break;
      }
      case 1: {
        // lane-switch trail: carrots that step sideways, one row apart
        let lane = Phaser.Math.Between(0, LANES - 1);
        let dir = lane === 0 ? 1 : lane === LANES - 1 ? -1 : Phaser.Math.Between(0, 1) ? 1 : -1;
        for (let r = 0; r < 4; r++) {
          this.spawnEnt("carrot", lane, -0.04 - r * ROW_GAP);
          if (lane + dir < 0 || lane + dir > LANES - 1) dir = -dir;
          lane += dir;
        }
        break;
      }
      case 2: {
        // star sandwich: carrots on the outer rows, a star in the middle lane
        for (const l of [0, 2]) {
          this.spawnEnt("carrot", l, -0.04);
          this.spawnEnt("carrot", l, -0.04 - 2 * ROW_GAP);
        }
        this.spawnEnt("star", 1, -0.04 - ROW_GAP);
        break;
      }
      case 3: {
        // obstacle gate: two lanes blocked, a carrot trail through the open lane
        const open = Phaser.Math.Between(0, LANES - 1);
        for (let l = 0; l < LANES; l++) {
          if (l === open) {
            this.spawnEnt("carrot", l, -0.04);
            this.spawnEnt("carrot", l, -0.04 - ROW_GAP);
          } else {
            this.spawnEnt(this.randObstacle(), l, -0.04 - ROW_GAP * 0.4);
          }
        }
        break;
      }
      case 4: {
        // risk / reward: safe carrot lane, a blocked lane, a prize behind a gap
        const prize = Phaser.Math.Between(0, LANES - 1);
        const safe = (prize + 1) % LANES;
        const block = (prize + 2) % LANES;
        this.spawnEnt("carrot", safe, -0.04);
        this.spawnEnt("carrot", safe, -0.04 - ROW_GAP);
        this.spawnEnt(this.randObstacle(), block, -0.04);
        this.spawnEnt(diff > 0.4 && Math.random() < 0.4 ? "golden" : "star", prize, -0.04 - ROW_GAP * 1.5);
        break;
      }
      case 5: {
        // golden solo — tempting, guarded by one obstacle a beat earlier
        const lane = Phaser.Math.Between(0, LANES - 1);
        const guard = Phaser.Math.Clamp(lane + (lane === 0 ? 1 : -1), 0, LANES - 1);
        this.spawnEnt(this.randObstacle(), guard, -0.04);
        this.spawnEnt("golden", lane, -0.04 - ROW_GAP * 1.4);
        for (let l = 0; l < LANES; l++) {
          if (l !== lane && l !== guard) this.spawnEnt("carrot", l, -0.04 - ROW_GAP);
        }
        break;
      }
    }
  }

  private spawnDeco(): void {
    let d: Deco | null = null;
    for (let i = 0; i < this.deco.length; i++)
      if (!this.deco[i].active) {
        d = this.deco[i];
        break;
      }
    if (!d) return;
    d.active = true;
    d.side = Math.random() < 0.5 ? -1 : 1;
    d.t = -0.05;
    d.jitter = Phaser.Math.FloatBetween(0.4, 1.5);
    const tex = (["flower", "weeds", "tree", "flower"] as const)[Phaser.Math.Between(0, 3)];
    d.img
      .setTexture(tex)
      .setActive(true)
      .setVisible(true)
      .setAlpha(1)
      .setTint(tex === "weeds" ? 0x7fb46a : 0xffffff);
  }

  /* ---------------------------------------------------------- pickups / hits */

  private collect(kind: PickupKind): void {
    if (kind === "carrot") this.carrots++;
    else if (kind === "star") this.stars++;
    else this.golden++;

    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.score += PICKUP_VALUE[kind] * Math.min(5, 1 + Math.floor(this.combo / 5));

    Sfx.pickup();
    if (kind !== "carrot") Sfx.sparkle();

    this.tweens.add({
      targets: this.player,
      scaleX: this.pScaleX * 1.12,
      scaleY: this.pScaleY * 0.9,
      duration: 70,
      yoyo: true,
    });

    const ms = COMBO_MILESTONES[this.combo];
    if (ms && this.combo !== this.lastMilestone) {
      this.lastMilestone = this.combo;
      this.showBanner(ms, this.combo >= 20 ? 46 : 40, 780);
      Sfx.fanfare();
      this.fx.emitParticleAt(this.player.x, this.player.y - 30, 18);
    } else if (this.combo > 20 && this.combo % 10 === 0) {
      this.showBanner("GARDEN RUSH!", 46, 780);
      Sfx.fanfare();
    }
  }

  /** Full-screen colour wash — one shared rectangle, retinted per hit. */
  private doFlash(color: number, alpha: number): void {
    this.tweens.killTweensOf(this.flash);
    this.flash.setFillStyle(color).setAlpha(0.001);
    this.tweens.add({ targets: this.flash, alpha, duration: 80, yoyo: true });
  }

  /**
   * Obstacles are mechanically distinct — the player should learn to read them:
   *   rock  = hard impact (stay in lane, brief hard slow)
   *   puddle = slip (forced slide one lane over, control briefly reduced)
   *   bush  = tangle (stay in lane, longer soft slow)
   * All three break the combo. A short i-frame window follows every hit.
   */
  private hitObstacle(kind: ObstacleKind): void {
    this.combo = 0;
    this.hitGraceUntil = this.time.now + 260;

    // normalise the player before layering the hit reaction so nothing sticks
    this.tweens.killTweensOf(this.player);
    this.tweens.killTweensOf(this.hop);
    this.hop.v = 0;
    this.player.setAngle(0).setScale(this.pScaleX, this.pScaleY);
    this.player.x = this.laneX(this.playerLane, 1);

    if (kind === "rock") this.hitRock();
    else if (kind === "puddle") this.hitPuddle();
    else this.hitBush();
  }

  private hitRock(): void {
    this.slowUntil = this.time.now + 460;
    this.laneLockUntil = this.time.now + 220;

    this.player.setTint(0xff9c9c);
    this.time.delayedCall(380, () => this.player.clearTint());
    this.tweens.add({ targets: this.player, angle: 17, duration: 60, yoyo: true, repeat: 1, ease: "Quad.easeOut" });
    this.tweens.add({
      targets: this.player,
      scaleX: this.pScaleX * 1.2,
      scaleY: this.pScaleY * 0.72,
      duration: 80,
      yoyo: true,
    });
    this.tweens.add({ targets: this.hop, v: 10, duration: 90, yoyo: true }); // a jolt down, not a hop
    this.cameras.main.shake(230, 0.012);
    dustRing(this, this.player.x, this.player.y + 18);
    this.fx.emitParticleAt(this.player.x, this.player.y - 6, 10);
    Sfx.land();
    this.doFlash(0xd9534f, 0.2);
    this.spawnFloater(this.player.x, this.player.y - 42, "OOF!", "#ffd0c4");
  }

  private hitPuddle(): void {
    // slip one lane over — toward the only valid side, or a fair coin-flip if both
    const canLeft = this.playerLane > 0;
    const canRight = this.playerLane < LANES - 1;
    const dir = canLeft && canRight ? (Math.random() < 0.5 ? -1 : 1) : canLeft ? -1 : 1;

    this.playerLane = Phaser.Math.Clamp(this.playerLane + dir, 0, LANES - 1);
    this.slowUntil = this.time.now + 300; // the slide itself is the penalty
    this.laneLockUntil = this.time.now + 420; // control reduced through the slide + a beat

    this.tweens.add({
      targets: this.player,
      x: this.laneX(this.playerLane, 1),
      duration: 280,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({ targets: this.player, angle: dir * 22, duration: 130, yoyo: true, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: this.hop, v: -8, duration: 140, yoyo: true });

    dustRing(this, this.player.x, this.player.y + 16);
    this.fx.emitParticleAt(this.player.x, this.player.y + 8, 14);
    Sfx.whoosh();
    this.doFlash(0x6fb7e6, 0.16);
    this.spawnFloater(this.player.x, this.player.y - 42, "SLIP!", "#cfeeff");
  }

  private hitBush(): void {
    this.slowUntil = this.time.now + 820; // noticeably longer drag than the rock
    this.laneLockUntil = this.time.now + 180; // you can still steer, you're just slow

    this.player.setTint(0x9fd08a);
    this.time.delayedCall(560, () => this.player.clearTint());
    this.tweens.add({ targets: this.player, angle: 6, duration: 110, yoyo: true, repeat: 3, ease: "Sine.easeInOut" });
    this.cameras.main.shake(90, 0.003);
    petalPuff(this, this.player.x, this.player.y - 10, 12); // leaves shaken loose
    Sfx.returnTile();
    this.doFlash(0x8fce7a, 0.14);
    this.spawnFloater(this.player.x, this.player.y - 42, "TANGLED!", "#dff4cf");
  }

  private spawnFloater(x: number, y: number, str: string, color: string): void {
    let f: Floater | null = null;
    for (let i = 0; i < this.floaters.length; i++)
      if (!this.floaters[i].active) {
        f = this.floaters[i];
        break;
      }
    if (!f) return;
    f.active = true;
    f.vy = -70;
    f.life = 0.8;
    f.txt
      .setText(str)
      .setColor(color)
      .setPosition(x, y)
      .setScale(0.7)
      .setAlpha(1)
      .setActive(true)
      .setVisible(true);
    this.tweens.add({ targets: f.txt, scale: 1, duration: 140, ease: "Back.easeOut" });
  }

  private showBanner(str: string, size: number, hold: number): void {
    this.bannerTween?.stop();
    this.banner.setText(str).setFontSize(size).setScale(0.4).setAlpha(0).setY(this.H * 0.34);
    this.bannerTween = this.tweens.add({
      targets: this.banner,
      scale: 1,
      alpha: 1,
      duration: 160,
      ease: "Back.easeOut",
      onComplete: () => {
        this.bannerTween = this.tweens.add({
          targets: this.banner,
          alpha: 0,
          y: this.H * 0.34 - 40,
          delay: hold,
          duration: 260,
        });
      },
    });
  }

  /* ----------------------------------------------------------- the game loop */

  update(_time: number, delta: number): void {
    if (!this.root) return;
    const dt = Math.min(delta, 45) / 1000;

    this.drawPath();

    if (this.finished) {
      this.updateFloaters(dt);
      return;
    }

    this.elapsed += dt;
    const diff = this.difficulty();
    const baseSpeed = 0.4 + 0.56 * diff;
    const eff = baseSpeed * (this.time.now < this.slowUntil ? 0.45 : 1);
    this.scroll = (this.scroll + eff * dt) % 1;

    // --- spawn scheduling: a single accumulator, no timers ----------------
    const interval = 1.0 - 0.5 * diff;
    this.spawnAccum += dt;
    let guard = 0;
    while (this.spawnAccum >= interval && guard++ < 3) {
      this.spawnAccum -= interval;
      if (this.countActive() < ENT_POOL - 8) this.spawnPattern(diff);
    }
    this.decoAccum += dt;
    if (this.decoAccum >= 0.42) {
      this.decoAccum = 0;
      this.spawnDeco();
    }

    // --- entities -------------------------------------------------------
    for (let i = 0; i < this.ents.length; i++) {
      const e = this.ents[i];
      if (!e.active) continue;
      e.t += eff * dt;

      if (!e.consumed && e.t >= 0.92 && e.t <= 1.06 && e.lane === this.playerLane) {
        if (e.kind === "carrot" || e.kind === "star" || e.kind === "golden") {
          e.consumed = true;
          this.fx.emitParticleAt(e.img.x, e.img.y, e.kind === "golden" ? 16 : 6);
          this.spawnFloater(
            e.img.x,
            e.img.y - 18,
            e.kind === "golden" ? "+GOLD" : e.kind === "star" ? "+STAR" : "+1",
            e.kind === "carrot" ? "#ffe8b0" : "#fff3d8",
          );
          this.collect(e.kind);
          this.recycle(e);
          continue;
        }
        if (this.time.now >= this.hitGraceUntil) {
          e.consumed = true;
          this.hitObstacle(e.kind);
          this.recycle(e);
          continue;
        }
        // else: i-frames right after a hit — this obstacle harmlessly slides past
      }

      if (e.t > 1.14) {
        this.recycle(e);
        continue;
      }
      this.drawEnt(e, dt);
    }
    this.entsC.sort("depth");

    // --- side decoration ---------------------------------------------
    for (let i = 0; i < this.deco.length; i++) {
      const d = this.deco[i];
      if (!d.active) continue;
      d.t += eff * dt * 0.92;
      if (d.t > 1.2) {
        d.active = false;
        d.img.setActive(false).setVisible(false).setPosition(-999, -999);
        continue;
      }
      const ct = Math.max(d.t, 0);
      const s = this.scaleAt(ct);
      const edge = this.halfWAt(ct) + (26 + d.jitter * 32) * s;
      d.img
        .setPosition(this.cx + d.side * edge, this.pyAt(ct))
        .setDisplaySize(46 * s * d.jitter, 52 * s * d.jitter)
        .setDepth(ct * 1000)
        .setAlpha(ct < 0.1 ? ct / 0.1 : 1);
    }
    this.decoC.sort("depth");

    // --- player bob + shadow ---------------------------------------
    this.player.y = this.playerY + this.hop.v + Math.sin(this.elapsed * 12) * 2.5;
    this.playerShadow.x = this.player.x;
    this.playerShadow.setAlpha(this.hop.v < -3 ? 0.16 : 0.28);

    this.updateFloaters(dt);
    this.refreshHud();

    if (this.elapsed >= RUN_SECONDS) this.endRun();
  }

  private drawEnt(e: Ent, dt: number): void {
    const ct = Math.max(e.t, 0);
    const s = this.scaleAt(ct);
    const x = this.laneX(e.lane, ct);
    const y = this.pyAt(ct);
    const [bw, bh] = ENT_SIZE[e.kind];
    e.img.setPosition(x, y).setDisplaySize(bw * s, bh * s).setDepth(1000 + ct * 1000);
    e.img.setAlpha(ct < 0.12 ? ct / 0.12 : 1);

    if (e.kind === "star") {
      e.spin += dt * 120;
      e.img.setAngle(e.spin);
    } else if (e.kind === "golden") {
      e.spin += dt * 70;
      e.img.setAngle(Math.sin(e.spin * 0.05) * 14);
      if (e.glow) {
        e.glow
          .setPosition(x, y)
          .setDisplaySize(bw * s * 2.6, bh * s * 2.6)
          .setDepth(999 + ct * 1000)
          .setAlpha(0.3 + 0.2 * Math.sin(this.elapsed * 8));
      }
    }
  }

  private updateFloaters(dt: number): void {
    for (let i = 0; i < this.floaters.length; i++) {
      const f = this.floaters[i];
      if (!f.active) continue;
      f.life -= dt;
      f.txt.y += f.vy * dt;
      f.txt.setAlpha(Phaser.Math.Clamp(f.life / 0.5, 0, 1));
      if (f.life <= 0) {
        f.active = false;
        f.txt.setActive(false).setVisible(false).setPosition(-999, -999);
      }
    }
  }

  /* ------------------------------------------------------------- background */

  private drawSky(): void {
    const g = this.skyG;
    g.clear();
    g.fillGradientStyle(COLORS.skyMid, COLORS.skyMid, COLORS.skyLow, COLORS.skyLow, 1);
    g.fillRect(0, 0, this.W, this.horizonY + 60);
    g.fillGradientStyle(0x9fd08a, 0x9fd08a, COLORS.grassLush, COLORS.grassLush, 1);
    g.fillRect(0, this.horizonY + 40, this.W, this.H - this.horizonY - 40);
  }

  private drawPath(): void {
    const g = this.pathG;
    g.clear();
    const topL = this.cx - this.topHalfW;
    const topR = this.cx + this.topHalfW;
    const botL = this.cx - this.botHalfW;
    const botR = this.cx + this.botHalfW;
    const y0 = this.horizonY;
    const y1 = this.H;

    this.verge[0].setTo(topL - 10, y0);
    this.verge[1].setTo(topR + 10, y0);
    this.verge[2].setTo(botR + 42, y1);
    this.verge[3].setTo(botL - 42, y1);
    g.fillStyle(0xe7cfa6, 1);
    g.fillPoints(this.verge, true);

    this.quad[0].setTo(topL, y0);
    this.quad[1].setTo(topR, y0);
    this.quad[2].setTo(botR, y1);
    this.quad[3].setTo(botL, y1);
    g.fillStyle(0xd9b892, 1);
    g.fillPoints(this.quad, true);

    // scrolling rungs sell the forward motion
    const N = 8;
    for (let k = 0; k < N; k++) {
      const t = (this.scroll + k / N) % 1;
      const ct = this.curve(t);
      const y = Phaser.Math.Linear(y0, y1, ct);
      const hw = Phaser.Math.Linear(this.topHalfW, this.botHalfW, ct);
      g.fillStyle(0xc7a279, Phaser.Math.Clamp((t - 0.05) * 2, 0, 0.5));
      g.fillRect(this.cx - hw, y - 2 - ct * 5, hw * 2, 4 + ct * 8);
    }

    // lane dividers (dashed, converging toward the horizon)
    g.lineStyle(3, 0xf3e4c6, 0.5);
    for (const b of [-0.31, 0.31]) {
      const dashN = 7;
      for (let k = 0; k < dashN; k++) {
        const t1 = (this.scroll + k / dashN) % 1;
        const t2 = Math.min(1, t1 + 0.5 / dashN);
        const c1 = this.curve(t1);
        const c2 = this.curve(t2);
        g.lineBetween(
          this.cx + b * Phaser.Math.Linear(this.topHalfW, this.botHalfW, c1) * 2,
          Phaser.Math.Linear(y0, y1, c1),
          this.cx + b * Phaser.Math.Linear(this.topHalfW, this.botHalfW, c2) * 2,
          Phaser.Math.Linear(y0, y1, c2),
        );
      }
    }
  }

  /* --------------------------------------------------------------- end / exit */

  private endRun(): void {
    if (this.finished) return;
    this.finished = true;

    for (let i = 0; i < this.ents.length; i++) {
      const e = this.ents[i];
      if (!e.active) continue;
      this.tweens.add({
        targets: e.glow ? [e.img, e.glow] : e.img,
        alpha: 0,
        duration: 220,
        onComplete: () => this.recycle(e),
      });
    }
    this.showBanner("RUN COMPLETE!", 40, 400);
    Sfx.fanfare();
    this.time.delayedCall(420, () => this.showResults());
  }

  private reward(): { base: number; bonus: number; total: number } {
    const base = this.levelDef.reward;
    const raw =
      this.carrots * 1 + this.stars * 3 + this.golden * 12 + Math.floor(this.bestCombo / 5) * 3;
    const bonus = Phaser.Math.Clamp(raw, 0, Math.round(base * 0.6));
    return { base, bonus, total: base + bonus };
  }

  private showResults(): void {
    const { base, bonus, total } = this.reward();
    const panelW = Math.min(this.W - 48, 380);
    const panelH = 404;
    const card = this.add
      .container(this.W / 2, this.H / 2)
      .setAlpha(0)
      .setScale(0.9);
    this.root.add(card);
    card.add(makePanel(this, panelW, panelH));

    let y = -panelH / 2 + 42;
    card.add(this.add.text(0, y, "RUN COMPLETE!", titleStyle(28)).setOrigin(0.5));
    y += 52;

    const row = (icon: string, label: string, value: number, tint?: number) => {
      const c = this.add.container(0, y);
      const im = this.add.image(-panelW / 2 + 44, 0, icon).setDisplaySize(30, 30);
      if (tint !== undefined) im.setTint(tint);
      c.add(im);
      c.add(this.add.text(-panelW / 2 + 68, 0, label, labelStyle(17)).setOrigin(0, 0.5));
      c.add(this.add.text(panelW / 2 - 34, 0, `${value}`, titleStyle(22)).setOrigin(1, 0.5));
      card.add(c);
      y += 40;
    };
    row("carrot", "Carrots collected", this.carrots);
    row("star_special", "Stars", this.stars);
    row("coin", "Best combo", this.bestCombo);
    row("carrot", "Golden carrots", this.golden, 0xffcf3f);

    y += 10;
    card.add(this.add.rectangle(0, y - 4, panelW - 60, 2, 0xe7d3af).setOrigin(0.5));
    y += 22;
    card.add(this.add.image(-58, y, "coin").setDisplaySize(30, 30));
    card.add(
      this.add
        .text(-38, y, `Reward: +${total}`, { ...titleStyle(26), color: "#d9a43c" })
        .setOrigin(0, 0.5),
    );
    y += 30;
    card.add(
      this.add
        .text(0, y, `+${base} base   ·   +${bonus} performance bonus`, labelStyle(13, "#7a6350"))
        .setOrigin(0.5),
    );
    y += 42;

    const btn = new Button(this, 0, y, {
      width: Math.min(panelW - 40, 220),
      height: 58,
      label: "Continue",
      fontSize: 22,
      onClick: () => this.complete(total),
    });
    btn.startPulse();
    card.add(btn);

    this.tweens.add({ targets: card, alpha: 1, scale: 1, duration: 260, ease: "Back.easeOut" });
  }

  private complete(total: number): void {
    if (this.completed) return;
    this.completed = true;
    // exact same reward / progression hook the old minigame used
    requestsService.recordMinigameRound(this.objectId, total);
    this.scene.resume("Requests");
    this.scene.stop();
  }

  /** Invalid init data — never leave Requests / Garden paused forever. */
  private finishAbort(): void {
    bus.emit("requests:closed", { objectId: this.objectId });
    if (this.scene.isPaused("Requests")) this.scene.resume("Requests");
    else if (this.scene.isPaused("Garden")) this.scene.resume("Garden");
    this.scene.stop();
  }

  shutdown(): void {
    this.finished = true;
    this.tweens.killAll();

    if (this.keyHandler) {
      this.input.keyboard?.off("keydown", this.keyHandler);
      this.keyHandler = undefined;
    }
    if (this.onResizeBound) {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResizeBound);
      this.onResizeBound = undefined;
    }

    this.fx?.destroy();
    this.legendC?.destroy();
    this.legendC = undefined;
    for (let i = 0; i < this.ents.length; i++) this.ents[i].img.destroy();
    for (let i = 0; i < this.glowPool.length; i++) this.glowPool[i].destroy();
    for (let i = 0; i < this.deco.length; i++) this.deco[i].img.destroy();
    for (let i = 0; i < this.floaters.length; i++) this.floaters[i].txt.destroy();
    this.ents = [];
    this.glowPool = [];
    this.deco = [];
    this.floaters = [];

    if (import.meta.env.DEV) {
      delete (window as unknown as Record<string, unknown>).__dgCarrotDash;
    }
  }
}
