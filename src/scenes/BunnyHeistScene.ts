import Phaser from "phaser";
import { COLORS, labelStyle, titleStyle, bodyStyle } from "../ui/theme";
import { makePanel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { safeInsets } from "../util/safeArea";
import { bus, requests as requestsService } from "../game/services";
import { Sfx } from "../fx/Sfx";
import { dustRing, petalPuff, sparkleBurst } from "../fx/Particles";
import type { LevelDef } from "../data/types";

interface BunnyHeistInit {
  objectId: string;
  level: LevelDef;
}

type LootKind = "common" | "rare" | "golden";
type FoxState = "patrol" | "alert" | "chase" | "returning";

interface Obstacle {
  x: number;
  y: number;
  r: number;
  img: Phaser.GameObjects.Image;
}

interface Loot {
  kind: LootKind;
  x: number;
  y: number;
  img: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image | null;
  taken: boolean;
}

interface Fox {
  container: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Image;
  cone: Phaser.GameObjects.Graphics;
  alertText: Phaser.GameObjects.Text;
  x: number;
  y: number;
  facing: number; // radians
  waypoints: { x: number; y: number }[];
  wpIndex: number;
  wpDir: 1 | -1;
  state: FoxState;
  noticeT: number; // ms of continuous sight while still in "patrol" (pre-alert)
  alertT: number; // ms remaining in "alert" before confirming chase
  loseSightT: number; // ms the rabbit has been out of sight while chasing
}

/** Fractional (0..1 of the arena) — one compact, hand-designed heist layout. */
const EXIT_F = { x: 0.5, y: 0.94 };
const RESPAWN_F = { x: 0.5, y: 0.84 };

const OBSTACLE_SLOTS: Array<{ x: number; y: number; r: number; tex: string; w: number; h: number }> = [
  { x: 0.5, y: 0.46, r: 0.075, tex: "rock", w: 74, h: 58 },
  { x: 0.2, y: 0.6, r: 0.06, tex: "weeds", w: 56, h: 62 },
  { x: 0.8, y: 0.6, r: 0.06, tex: "weeds", w: 56, h: 62 },
  { x: 0.5, y: 0.3, r: 0.06, tex: "stump", w: 54, h: 46 },
  { x: 0.24, y: 0.19, r: 0.065, tex: "dead_shrub", w: 60, h: 56 },
  { x: 0.76, y: 0.19, r: 0.065, tex: "dead_shrub", w: 60, h: 56 },
];

const COMMON_SLOTS = [
  { x: 0.16, y: 0.6 },
  { x: 0.84, y: 0.6 },
  { x: 0.12, y: 0.78 },
  { x: 0.88, y: 0.78 },
  { x: 0.3, y: 0.86 },
  { x: 0.7, y: 0.86 },
];
const RARE_SLOTS = [
  { x: 0.2, y: 0.4 },
  { x: 0.8, y: 0.4 },
  { x: 0.5, y: 0.38 },
  { x: 0.5, y: 0.55 },
];
const GOLDEN_SLOTS = [
  { x: 0.5, y: 0.11 },
  { x: 0.3, y: 0.22 },
  { x: 0.7, y: 0.22 },
];

/** Fox A: a readable straight back-and-forth beat across the middle. */
const PATROL_A = [
  { x: 0.22, y: 0.46 },
  { x: 0.78, y: 0.46 },
];
/** Fox B: a small loop guarding the golden-carrot area up top. */
const PATROL_B = [
  { x: 0.34, y: 0.16 },
  { x: 0.66, y: 0.16 },
  { x: 0.66, y: 0.3 },
  { x: 0.34, y: 0.3 },
];

const LOOT_VALUE: Record<LootKind, number> = { common: 1, rare: 4, golden: 24 };
const LOOT_ICON: Record<LootKind, string> = { common: "carrot", rare: "star_special", golden: "carrot" };

function pickN<T>(arr: T[], n: number): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Phaser.Math.Between(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

/** Closest-point-on-segment test: does the obstacle circle block the fox → rabbit sightline? */
function segmentBlockedByCircle(x1: number, y1: number, x2: number, y2: number, cx: number, cy: number, r: number): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy || 1;
  let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
  t = Phaser.Math.Clamp(t, 0, 1);
  const px = x1 + dx * t;
  const py = y1 + dy * t;
  return Math.hypot(px - cx, py - cy) < r;
}

/**
 * BUNNY HEIST — a short top-down stealth/risk-reward minigame.
 *
 * Replaces Carrot Dash as the active "earn coins" minigame launched from the
 * Requests screen (via LevelGoalsScene). The rabbit sneaks into a guarded patch,
 * grabs carrots / stars / one Golden Carrot while reading fox patrol vision cones,
 * and decides each moment whether to bank the loot at the exit or push deeper for
 * more. Coins are awarded through the SAME `RequestsService.recordMinigameRound`
 * contract Carrot Dash used, so progression/economy are untouched.
 *
 * Performance: one `update()` loop, a small fixed set of entities created once per
 * run (no pooling needed at this scale — a couple of foxes, ~10 pickups), no
 * per-frame allocation, everything torn down in `shutdown()`.
 */
export class BunnyHeistScene extends Phaser.Scene {
  private objectId!: string;
  private levelDef!: LevelDef;

  private W = 0;
  private H = 0;
  private arenaX = 0;
  private arenaY = 0;
  private arenaW = 0;
  private arenaH = 0;
  private unit = 0;

  private root!: Phaser.GameObjects.Container;
  private groundG!: Phaser.GameObjects.Graphics;
  private exitZone!: Phaser.GameObjects.Container;
  private flash!: Phaser.GameObjects.Rectangle;
  private fx!: Phaser.GameObjects.Particles.ParticleEmitter;

  private rabbit!: Phaser.GameObjects.Image;
  private rabbitShadow!: Phaser.GameObjects.Image;
  private rabbitR = 0;
  private rabbitInvulnUntil = 0;

  private obstacles: Obstacle[] = [];
  private loot: Loot[] = [];
  private foxes: Fox[] = [];

  private hudC!: Phaser.GameObjects.Container;
  private lootTexts: Record<LootKind, Phaser.GameObjects.Text> = {} as never;
  private banner!: Phaser.GameObjects.Text;
  private bannerTween?: Phaser.Tweens.Tween;

  // input: hold-and-drag — no permanent joystick graphic
  private pressing = false;
  private targetX = 0;
  private targetY = 0;
  private inputZone!: Phaser.GameObjects.Rectangle;

  private carried: Record<LootKind, number> = { common: 0, rare: 0, golden: 0 };
  private hasLeftExit = false;
  private elapsed = 0;
  private finished = false;
  private completed = false;

  private onResizeBound?: () => void;

  constructor() {
    super("BunnyHeist");
  }

  init(data: BunnyHeistInit): void {
    this.objectId = data.objectId;
    this.levelDef = data.level;
    this.obstacles = [];
    this.loot = [];
    this.foxes = [];
    this.carried = { common: 0, rare: 0, golden: 0 };
    this.hasLeftExit = false;
    this.elapsed = 0;
    this.finished = false;
    this.completed = false;
    this.pressing = false;
    this.rabbitInvulnUntil = 0;
  }

  create(): void {
    const def = requestsService.def(this.objectId);
    if (!def) {
      this.finishAbort();
      return;
    }

    this.computeLayout();
    this.root = this.add.container(0, 0);

    this.groundG = this.add.graphics();
    this.root.add(this.groundG);
    this.drawGround();

    this.buildExit();
    this.buildObstacles();
    this.buildLoot();
    this.buildFoxes();
    this.buildRabbit();

    this.fx = this.add
      .particles(0, 0, "spark", {
        lifespan: { min: 240, max: 520 },
        speed: { min: 40, max: 160 },
        scale: { start: 0.55, end: 0 },
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(9000);

    this.flash = this.add.rectangle(0, 0, this.W, this.H, 0xffffff, 0).setOrigin(0, 0).setDepth(8500);

    this.buildHud();
    this.bindInput();

    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 220 });
    this.showBanner("SNEAK IN!", 34, 700, "#fff3d8");
    Sfx.whoosh();

    this.onResizeBound = () => this.computeLayout(true);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResizeBound);

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__dgHeist = {
        state: () => ({
          carried: { ...this.carried },
          foxes: this.foxes.map((f) => ({ state: f.state, x: Math.round(f.x), y: Math.round(f.y) })),
          rabbit: { x: Math.round(this.rabbit.x), y: Math.round(this.rabbit.y) },
        }),
        teleportToExit: () => {
          this.rabbit.setPosition(this.exitZone.x, this.exitZone.y - this.unit * 0.03);
          this.hasLeftExit = true;
        },
        grabAll: () => {
          for (const l of this.loot) if (!l.taken) this.collect(l);
        },
        forceCatch: () => {
          const f = this.foxes[0];
          if (f) this.triggerCaught(f);
        },
        endRun: () => this.attemptEscape(true),
      };
    }
  }

  /* ------------------------------------------------------------------ layout */

  private computeLayout(reposition = false): void {
    this.W = this.scale.width;
    this.H = this.scale.height;
    const inset = safeInsets();
    const topPad = inset.top + 96;
    const botPad = inset.bottom + 24;
    this.arenaW = Phaser.Math.Clamp(this.W - 32, 280, 520);
    this.arenaH = Math.max(360, this.H - topPad - botPad);
    this.arenaX = (this.W - this.arenaW) / 2;
    this.arenaY = topPad;
    this.unit = Math.min(this.arenaW, this.arenaH);

    if (!reposition) return;
    this.drawGround();
    this.flash.setSize(this.W, this.H);
    this.inputZone?.setSize(this.W, this.H);
    this.layoutHud();
    this.reflowEntities(); // re-derive every entity's px position from its stored fraction
  }

  private toX(fx: number): number {
    return this.arenaX + fx * this.arenaW;
  }
  private toY(fy: number): number {
    return this.arenaY + fy * this.arenaH;
  }

  /** Re-derive every world position from its stored fraction after a resize. */
  private reflowEntities(): void {
    for (let i = 0; i < this.obstacles.length; i++) {
      const o = this.obstacles[i];
      const slot = this.obstacleFractions[i];
      o.x = this.toX(slot.x);
      o.y = this.toY(slot.y);
      o.r = this.unit * slot.r;
      o.img.setPosition(o.x, o.y);
    }
    for (let i = 0; i < this.loot.length; i++) {
      const l = this.loot[i];
      const frac = this.lootFractions[i];
      l.x = this.toX(frac.x);
      l.y = this.toY(frac.y);
      if (!l.taken) {
        l.img.setPosition(l.x, l.y);
        l.glow?.setPosition(l.x, l.y);
      }
    }
    for (let i = 0; i < this.foxes.length; i++) {
      const fox = this.foxes[i];
      fox.waypoints = this.foxWaypointFractions[i].map((p) => ({ x: this.toX(p.x), y: this.toY(p.y) }));
    }
    this.exitZone.setPosition(this.toX(EXIT_F.x), this.toY(EXIT_F.y));
    this.exitZone.setScale(this.unit / 420);
  }

  // fractions kept alongside the live entities so resize can re-derive px positions
  private obstacleFractions: Array<{ x: number; y: number; r: number }> = [];
  private lootFractions: Array<{ x: number; y: number }> = [];
  private foxWaypointFractions: Array<Array<{ x: number; y: number }>> = [];

  /* --------------------------------------------------------------- building */

  private drawGround(): void {
    const g = this.groundG;
    g.clear();
    const x = this.arenaX;
    const y = this.arenaY;
    const w = this.arenaW;
    const h = this.arenaH;
    g.fillStyle(COLORS.shadow, 0.18);
    g.fillRoundedRect(x - 4, y + 6, w + 8, h + 10, 28);
    g.fillStyle(0x6fae5c, 1);
    g.fillRoundedRect(x - 6, y - 6, w + 12, h + 12, 30);
    g.fillGradientStyle(0x9ed08a, 0x9ed08a, 0x7fc06d, 0x7fc06d, 1);
    g.fillRoundedRect(x, y, w, h, 26);
    // faint path from exit toward the middle — invites the player inward
    g.fillStyle(0xb9dd9e, 0.5);
    g.fillEllipse(this.toX(0.5), this.toY(0.86), w * 0.22, h * 0.1);
  }

  private buildExit(): void {
    this.exitZone = this.add.container(this.toX(EXIT_F.x), this.toY(EXIT_F.y));
    const glow = this.add.image(0, 0, "glow").setScale(1.1).setAlpha(0.35).setBlendMode(Phaser.BlendModes.ADD).setTint(0xffe6a3);
    this.tweens.add({ targets: glow, alpha: 0.55, scale: 1.3, duration: 1100, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    const ring = this.add.image(0, 0, "shadow").setDisplaySize(96, 40).setAlpha(0.4);
    const label = this.add
      .text(0, 34, "EXIT", { ...labelStyle(15, "#5b4636") })
      .setOrigin(0.5)
      .setStroke("#fef6e8", 4);
    this.exitZone.add([glow, ring, label]);
    this.exitZone.setScale(this.unit / 420);
    this.root.add(this.exitZone);
  }

  private buildObstacles(): void {
    for (const slot of OBSTACLE_SLOTS) {
      const x = this.toX(slot.x);
      const y = this.toY(slot.y);
      const img = this.add.image(x, y, slot.tex).setDisplaySize(slot.w, slot.h).setDepth(300 + y);
      if (slot.tex === "weeds") img.setTint(0x6fae5c);
      else if (slot.tex === "dead_shrub") img.setTint(0x8fae6c);
      this.root.add(img);
      this.obstacles.push({ x, y, r: this.unit * slot.r, img });
      this.obstacleFractions.push({ x: slot.x, y: slot.y, r: slot.r });
    }
  }

  private buildLoot(): void {
    const commons = pickN(COMMON_SLOTS, 5);
    const rares = pickN(RARE_SLOTS, 3);
    const golds = pickN(GOLDEN_SLOTS, 1);
    const spawn = (kind: LootKind, frac: { x: number; y: number }) => {
      const x = this.toX(frac.x);
      const y = this.toY(frac.y);
      const size = kind === "golden" ? 40 : kind === "rare" ? 34 : 30;
      const img = this.add.image(x, y, LOOT_ICON[kind]).setDisplaySize(size, size).setDepth(400 + y);
      let glow: Phaser.GameObjects.Image | null = null;
      if (kind === "golden") {
        img.setTint(0xffcf3f);
        glow = this.add.image(x, y, "glow").setDisplaySize(size * 2.6, size * 2.6).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD).setDepth(399 + y);
        this.tweens.add({ targets: img, angle: 360, duration: 3200, repeat: -1 });
        this.tweens.add({ targets: glow, alpha: 0.65, duration: 900, yoyo: true, repeat: -1 });
        this.root.add(glow);
      }
      this.tweens.add({ targets: img, y: y - 6, duration: 760 + Phaser.Math.Between(-80, 80), yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.root.add(img);
      this.loot.push({ kind, x, y, img, glow, taken: false });
      this.lootFractions.push(frac);
    };
    for (const f of commons) spawn("common", f);
    for (const f of rares) spawn("rare", f);
    for (const f of golds) spawn("golden", f);
  }

  private foxCountForLevel(): number {
    const lvl = this.levelDef.level;
    return lvl <= 2 ? 1 : 2;
  }

  private buildFoxes(): void {
    const routes: Array<Array<{ x: number; y: number }>> = [PATROL_A, PATROL_B].slice(0, this.foxCountForLevel());
    for (const route of routes) {
      const reversed = Math.random() < 0.5;
      const waypointsFrac = reversed ? [...route].reverse() : route;
      const waypoints = waypointsFrac.map((p) => ({ x: this.toX(p.x), y: this.toY(p.y) }));
      const startIndex = Phaser.Math.Between(0, waypoints.length - 1);

      const container = this.add.container(waypoints[startIndex].x, waypoints[startIndex].y).setDepth(700);
      const shadow = this.add.image(0, this.unit * 0.02, "shadow").setDisplaySize(this.unit * 0.13, this.unit * 0.05).setAlpha(0.4);
      const body = this.add.image(0, 0, "fox").setDisplaySize(this.unit * 0.15, this.unit * 0.13);
      const cone = this.add.graphics();
      const alertText = this.add
        .text(0, -this.unit * 0.13, "!", { ...titleStyle(22), color: "#fff3d8" })
        .setOrigin(0.5)
        .setStroke("#c0392b", 4)
        .setAlpha(0);
      container.add([cone, shadow, body, alertText]);
      this.root.add(container);

      this.foxes.push({
        container,
        body,
        cone,
        alertText,
        x: waypoints[startIndex].x,
        y: waypoints[startIndex].y,
        facing: 0,
        waypoints,
        wpIndex: startIndex,
        wpDir: 1,
        state: "patrol",
        noticeT: 0,
        alertT: 0,
        loseSightT: 0,
      });
      this.foxWaypointFractions.push(waypointsFrac);
    }
  }

  private buildRabbit(): void {
    const startX = this.toX(RESPAWN_F.x);
    const startY = this.toY(RESPAWN_F.y);
    this.rabbitShadow = this.add.image(startX, startY + 4, "shadow").setDisplaySize(this.unit * 0.12, this.unit * 0.045).setAlpha(0.4);
    this.rabbit = this.add.image(startX, startY, "rabbit").setDisplaySize(this.unit * 0.14, this.unit * 0.16).setDepth(600);
    this.rabbitR = this.unit * 0.045;
    this.targetX = startX;
    this.targetY = startY;
    this.root.add([this.rabbitShadow, this.rabbit]);
  }

  /* --------------------------------------------------------------------- HUD */

  private buildHud(): void {
    const inset = safeInsets();
    const w = Math.min(this.W - 32, 420);
    const h = 64;
    this.hudC = this.add.container(this.W / 2, inset.top + 12 + h / 2).setDepth(9800);
    this.root.add(this.hudC);
    const panel = makePanel(this, w, h, { radius: 20 });
    this.hudC.add(panel);

    const items: LootKind[] = ["common", "rare", "golden"];
    const cellW = w / items.length;
    items.forEach((kind, i) => {
      const cx = -w / 2 + cellW * (i + 0.5);
      const icon = this.add.image(cx - 20, 0, LOOT_ICON[kind]).setDisplaySize(26, 26);
      if (kind === "golden") icon.setTint(0xffcf3f);
      this.hudC.add(icon);
      const t = this.add.text(cx + 2, 0, "0", titleStyle(22)).setOrigin(0, 0.5);
      this.hudC.add(t);
      this.lootTexts[kind] = t;
    });

    this.banner = this.add
      .text(this.W / 2, this.H * 0.34, "", { ...titleStyle(36), color: "#fff3d8" })
      .setOrigin(0.5)
      .setStroke("#7a4d12", 6)
      .setAlpha(0)
      .setDepth(9600);
    this.root.add(this.banner);
  }

  private layoutHud(): void {
    if (!this.hudC) return;
    const inset = safeInsets();
    this.hudC.setPosition(this.W / 2, inset.top + 12 + 32);
    if (this.banner) this.banner.setPosition(this.W / 2, this.H * 0.34);
  }

  private refreshHud(): void {
    (["common", "rare", "golden"] as LootKind[]).forEach((k) => {
      this.lootTexts[k]?.setText(`${this.carried[k]}`);
    });
  }

  private showBanner(str: string, size: number, hold: number, color = "#fff3d8"): void {
    if (!this.banner) return;
    this.bannerTween?.stop();
    this.banner.setText(str).setFontSize(size).setColor(color).setScale(0.4).setAlpha(0);
    this.bannerTween = this.tweens.add({
      targets: this.banner,
      scale: 1,
      alpha: 1,
      duration: 160,
      ease: "Back.easeOut",
      onComplete: () => {
        this.bannerTween = this.tweens.add({ targets: this.banner, alpha: 0, delay: hold, duration: 260 });
      },
    });
  }

  /* ------------------------------------------------------------------- input */

  private bindInput(): void {
    this.inputZone = this.add.rectangle(0, 0, this.W, this.H, 0xffffff, 0.001).setOrigin(0, 0).setInteractive();
    this.root.add(this.inputZone);
    const grab = (p: Phaser.Input.Pointer) => {
      this.pressing = true;
      this.targetX = p.x;
      this.targetY = p.y;
    };
    this.inputZone.on("pointerdown", grab);
    this.inputZone.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.pressing) {
        this.targetX = p.x;
        this.targetY = p.y;
      }
    });
    this.inputZone.on("pointerup", () => (this.pressing = false));
    this.inputZone.on("pointerupoutside", () => (this.pressing = false));
  }

  /* ----------------------------------------------------------- the game loop */

  update(_time: number, delta: number): void {
    if (!this.root || this.finished) return;
    const dt = Math.min(delta, 45) / 1000;
    this.elapsed += dt;
    const heat = Phaser.Math.Clamp(this.elapsed / 42, 0, 1);

    this.updateRabbit(dt);
    for (const fox of this.foxes) this.updateFox(fox, dt, heat);
    this.checkPickups();
    this.checkExit();
    this.checkCaught();
  }

  private updateRabbit(dt: number): void {
    if (!this.pressing) return;
    const speed = this.unit * 0.62;
    let dx = this.targetX - this.rabbit.x;
    let dy = this.targetY - this.rabbit.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 2) return;
    const step = Math.min(dist, speed * dt);
    dx = (dx / dist) * step;
    dy = (dy / dist) * step;
    let nx = this.rabbit.x + dx;
    let ny = this.rabbit.y + dy;

    // soft-push out of obstacle solids so the rabbit navigates around them
    for (const o of this.obstacles) {
      const ddx = nx - o.x;
      const ddy = ny - o.y;
      const minDist = o.r * 0.72 + this.rabbitR;
      const d = Math.hypot(ddx, ddy) || 0.001;
      if (d < minDist) {
        nx = o.x + (ddx / d) * minDist;
        ny = o.y + (ddy / d) * minDist;
      }
    }
    nx = Phaser.Math.Clamp(nx, this.arenaX + this.rabbitR, this.arenaX + this.arenaW - this.rabbitR);
    ny = Phaser.Math.Clamp(ny, this.arenaY + this.rabbitR, this.arenaY + this.arenaH - this.rabbitR);

    if (Math.abs(dx) > 0.4) this.rabbit.setFlipX(dx < 0);
    this.rabbit.setPosition(nx, ny);
    this.rabbitShadow.setPosition(nx, ny + 4);
    this.rabbit.setDepth(600 + ny);
    if (!this.hasLeftExit && Math.hypot(nx - this.exitZone.x, ny - this.exitZone.y) > this.unit * 0.12) {
      this.hasLeftExit = true;
    }
  }

  /* --------------------------------------------------------------- fox AI */

  private canFoxSeeRabbit(fox: Fox, range: number, coneHalf: number): boolean {
    const dx = this.rabbit.x - fox.x;
    const dy = this.rabbit.y - fox.y;
    const dist = Math.hypot(dx, dy);
    if (dist > range) return false;
    const ang = Math.atan2(dy, dx);
    const diff = Math.abs(Phaser.Math.Angle.Wrap(ang - fox.facing));
    if (diff > coneHalf) return false;
    for (const o of this.obstacles) {
      if (segmentBlockedByCircle(fox.x, fox.y, this.rabbit.x, this.rabbit.y, o.x, o.y, o.r)) return false;
    }
    return true;
  }

  private updateFox(fox: Fox, dt: number, heat: number): void {
    const baseSpeed = this.unit * 0.3 * (1 + heat * 0.35);
    const range = this.unit * 0.36;
    const coneHalf = Phaser.Math.DegToRad(36);
    const noticeNeeded = Phaser.Math.Linear(420, 240, heat);
    const alertWindow = Phaser.Math.Linear(650, 400, heat);
    const invuln = this.time.now < this.rabbitInvulnUntil;

    if (fox.state === "patrol") {
      this.moveAlongPatrol(fox, baseSpeed, dt);
      if (!invuln && this.canFoxSeeRabbit(fox, range, coneHalf)) {
        fox.noticeT += dt * 1000;
        if (fox.noticeT === dt * 1000) {
          fox.alertText.setAlpha(1).setScale(0.4);
          this.tweens.add({ targets: fox.alertText, scale: 1, duration: 140, ease: "Back.easeOut" });
          Sfx.alertPing();
        }
        if (fox.noticeT >= noticeNeeded) {
          fox.state = "alert";
          fox.alertT = alertWindow;
        }
      } else if (fox.noticeT > 0) {
        fox.noticeT = 0;
        this.tweens.add({ targets: fox.alertText, alpha: 0, duration: 160 });
      }
    } else if (fox.state === "alert") {
      // hold position, face the rabbit, keep confirming
      fox.facing = Phaser.Math.Angle.Between(fox.x, fox.y, this.rabbit.x, this.rabbit.y);
      if (!invuln && this.canFoxSeeRabbit(fox, range, coneHalf)) {
        fox.alertT -= dt * 1000;
        if (fox.alertT <= 0) {
          fox.state = "chase";
          fox.loseSightT = 0;
          this.tweens.add({ targets: fox.alertText, alpha: 0, duration: 120 });
        }
      } else {
        fox.state = "patrol";
        fox.noticeT = 0;
        this.tweens.add({ targets: fox.alertText, alpha: 0, duration: 160 });
      }
    } else if (fox.state === "chase") {
      const chaseSpeed = baseSpeed * 1.75;
      fox.facing = Phaser.Math.Angle.Between(fox.x, fox.y, this.rabbit.x, this.rabbit.y);
      const d = Math.hypot(this.rabbit.x - fox.x, this.rabbit.y - fox.y);
      const step = Math.min(d, chaseSpeed * dt);
      fox.x += Math.cos(fox.facing) * step;
      fox.y += Math.sin(fox.facing) * step;
      if (!this.canFoxSeeRabbit(fox, range * 1.15, Math.PI)) {
        fox.loseSightT += dt * 1000;
        if (fox.loseSightT > 1100) fox.state = "returning";
      } else {
        fox.loseSightT = 0;
      }
    } else {
      // returning: head back to the nearest patrol waypoint, then resume
      const wp = fox.waypoints[fox.wpIndex];
      const d = Math.hypot(wp.x - fox.x, wp.y - fox.y);
      const step = Math.min(d, baseSpeed * 1.15 * dt);
      if (d > 1) {
        fox.facing = Math.atan2(wp.y - fox.y, wp.x - fox.x);
        fox.x += Math.cos(fox.facing) * step;
        fox.y += Math.sin(fox.facing) * step;
      } else {
        fox.state = "patrol";
        fox.noticeT = 0;
      }
    }

    fox.container.setPosition(fox.x, fox.y);
    fox.container.setDepth(700 + fox.y);
    fox.body.setFlipX(Math.cos(fox.facing) < 0);
    this.drawVisionCone(fox, range, coneHalf);
  }

  private moveAlongPatrol(fox: Fox, speed: number, dt: number): void {
    if (fox.waypoints.length < 2) return;
    const target = fox.waypoints[fox.wpIndex];
    const d = Math.hypot(target.x - fox.x, target.y - fox.y);
    if (d < 2) {
      fox.wpIndex += fox.wpDir;
      if (fox.wpIndex >= fox.waypoints.length) {
        fox.wpIndex = fox.waypoints.length - 2;
        fox.wpDir = -1;
      } else if (fox.wpIndex < 0) {
        fox.wpIndex = 1;
        fox.wpDir = 1;
      }
      return;
    }
    const step = Math.min(d, speed * dt);
    const ang = Math.atan2(target.y - fox.y, target.x - fox.x);
    fox.x += Math.cos(ang) * step;
    fox.y += Math.sin(ang) * step;
    fox.facing = ang;
  }

  private drawVisionCone(fox: Fox, range: number, coneHalf: number): void {
    const g = fox.cone;
    g.clear();
    const color = fox.state === "chase" ? 0xe8483a : fox.state === "alert" ? 0xf5a13c : 0xffe27a;
    const alpha = fox.state === "chase" ? 0.22 : fox.state === "alert" ? 0.24 : 0.16;
    const steps = 10;
    g.fillStyle(color, alpha);
    g.beginPath();
    g.moveTo(0, 0);
    for (let i = 0; i <= steps; i++) {
      const a = fox.facing - coneHalf + (coneHalf * 2 * i) / steps;
      g.lineTo(Math.cos(a) * range, Math.sin(a) * range);
    }
    g.closePath();
    g.fillPath();
    g.lineStyle(2, color, alpha + 0.25);
    g.strokePath();
  }

  /* ------------------------------------------------------------ interactions */

  private checkPickups(): void {
    for (const l of this.loot) {
      if (l.taken) continue;
      if (Math.hypot(this.rabbit.x - l.x, this.rabbit.y - l.y) < this.unit * 0.05) this.collect(l);
    }
  }

  private collect(l: Loot): void {
    l.taken = true;
    this.carried[l.kind]++;
    this.refreshHud();
    this.fx.emitParticleAt(l.x, l.y, l.kind === "golden" ? 20 : 8);
    if (l.kind === "golden") {
      Sfx.fanfare();
      this.showBanner("GOLDEN CARROT!", 30, 650, "#ffcf3f");
      sparkleBurst(this, l.x, l.y, 24, 60);
    } else {
      Sfx.pickup();
    }
    this.tweens.add({
      targets: [l.img, l.glow].filter(Boolean),
      scale: 0,
      alpha: 0,
      duration: 200,
      ease: "Back.easeIn",
      onComplete: () => {
        l.img.destroy();
        l.glow?.destroy();
      },
    });
  }

  private checkExit(): void {
    if (!this.hasLeftExit || this.finished) return;
    const d = Math.hypot(this.rabbit.x - this.exitZone.x, this.rabbit.y - this.exitZone.y);
    if (d < this.unit * 0.09) this.attemptEscape(false);
  }

  private checkCaught(): void {
    if (this.time.now < this.rabbitInvulnUntil) return;
    for (const fox of this.foxes) {
      if (fox.state !== "chase") continue;
      if (Math.hypot(this.rabbit.x - fox.x, this.rabbit.y - fox.y) < this.unit * 0.055) {
        this.triggerCaught(fox);
        return;
      }
    }
  }

  /** A fox has caught the rabbit — every fox (not just this one) stands down. */
  private triggerCaught(_fox: Fox): void {
    Sfx.caughtThud();
    this.cameras.main.shake(160, 0.008);
    dustRing(this, this.rabbit.x, this.rabbit.y);
    this.flash.setFillStyle(0xd9534f).setAlpha(0.001);
    this.tweens.add({ targets: this.flash, alpha: 0.22, duration: 90, yoyo: true });
    this.tweens.add({ targets: this.rabbit, angle: 12, duration: 70, yoyo: true, repeat: 2 });
    this.showBanner("CAUGHT!", 32, 550, "#ffd0c4");

    // lose some (not all) of the common/rare loot; a secured Golden Carrot is kept
    this.carried.common = Math.floor(this.carried.common * 0.5);
    this.carried.rare = Math.floor(this.carried.rare * 0.5);
    this.refreshHud();

    // send every fox back to patrol and reset detection so it isn't an instant re-catch
    for (const f of this.foxes) {
      f.state = "returning";
      f.noticeT = 0;
      f.alertT = 0;
      f.loseSightT = 0;
      f.alertText.setAlpha(0);
    }

    const rx = this.toX(RESPAWN_F.x);
    const ry = this.toY(RESPAWN_F.y);
    this.rabbit.setPosition(rx, ry);
    this.rabbitShadow.setPosition(rx, ry + 4);
    this.rabbitInvulnUntil = this.time.now + 1000;
    this.tweens.add({ targets: this.rabbit, alpha: 0.4, duration: 90, yoyo: true, repeat: 4 });
  }

  /* --------------------------------------------------------------- ending */

  private reward(): { base: number; bonus: number; total: number } {
    const base = this.levelDef.reward;
    const raw = this.carried.common * LOOT_VALUE.common + this.carried.rare * LOOT_VALUE.rare + this.carried.golden * LOOT_VALUE.golden;
    const bonus = Phaser.Math.Clamp(raw, 0, Math.round(base * 0.7));
    return { base, bonus, total: base + bonus };
  }

  private attemptEscape(forced: boolean): void {
    void forced;
    if (this.finished) return;
    this.finished = true;
    Sfx.escapeChime();
    this.showBanner("SAFE!", 34, 500, "#c8f0b0");
    this.time.delayedCall(420, () => this.showResults());
  }

  private showResults(): void {
    const { base, bonus, total } = this.reward();
    const panelW = Math.min(this.W - 48, 380);
    const panelH = 430;
    const card = this.add.container(this.W / 2, this.H / 2).setAlpha(0).setScale(0.9).setDepth(9900);
    this.root.add(card);
    card.add(makePanel(this, panelW, panelH));

    let y = -panelH / 2 + 40;
    card.add(this.add.text(0, y, "HEIST COMPLETE!", titleStyle(27)).setOrigin(0.5));
    y += 50;

    const row = (icon: string, label: string, value: number, tint?: number) => {
      const c = this.add.container(0, y);
      const im = this.add.image(-panelW / 2 + 44, 0, icon).setDisplaySize(28, 28);
      if (tint !== undefined) im.setTint(tint);
      c.add(im);
      c.add(this.add.text(-panelW / 2 + 68, 0, label, labelStyle(16)).setOrigin(0, 0.5));
      c.add(this.add.text(panelW / 2 - 34, 0, `${value}`, titleStyle(21)).setOrigin(1, 0.5));
      card.add(c);
      y += 38;
    };
    row("carrot", "Common resources", this.carried.common);
    row("star_special", "Rare resources", this.carried.rare);
    row("carrot", "Golden Carrot", this.carried.golden, 0xffcf3f);

    y += 8;
    card.add(this.add.rectangle(0, y - 4, panelW - 60, 2, 0xe7d3af).setOrigin(0.5));
    y += 22;
    card.add(this.add.image(-56, y, "coin").setDisplaySize(28, 28));
    card.add(this.add.text(-36, y, `Reward: +${total}`, { ...titleStyle(25), color: "#d9a43c" }).setOrigin(0, 0.5));
    y += 28;
    card.add(this.add.text(0, y, `+${base} base   ·   +${bonus} loot bonus`, bodyStyle(13, "#7a6350")).setOrigin(0.5));
    y += 40;

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
    petalPuff(this, this.W / 2, this.H / 2 - panelH / 2, 10);
  }

  private complete(total: number): void {
    if (this.completed) return;
    this.completed = true;
    requestsService.recordMinigameRound(this.objectId, total);
    this.clearDevHook();
    this.scene.resume("Requests");
    this.scene.stop();
  }

  private finishAbort(): void {
    bus.emit("requests:closed", { objectId: this.objectId });
    this.clearDevHook();
    if (this.scene.isPaused("Requests")) this.scene.resume("Requests");
    else if (this.scene.isPaused("Garden")) this.scene.resume("Garden");
    this.scene.stop();
  }

  /** Explicit at the point of leaving, not just in `shutdown()` — this is DEV-only
   *  console tooling and must not linger once the run is over. */
  private clearDevHook(): void {
    if (import.meta.env.DEV) delete (window as unknown as Record<string, unknown>).__dgHeist;
  }

  shutdown(): void {
    this.finished = true;
    this.tweens.killAll();
    if (this.onResizeBound) {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResizeBound);
      this.onResizeBound = undefined;
    }
    this.fx?.destroy();
    for (const o of this.obstacles) o.img.destroy();
    for (const l of this.loot) {
      if (!l.taken) {
        l.img.destroy();
        l.glow?.destroy();
      }
    }
    for (const f of this.foxes) f.container.destroy();
    this.obstacles = [];
    this.loot = [];
    this.foxes = [];

    this.clearDevHook();
  }
}
