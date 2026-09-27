import Phaser from "phaser";
import { CameraController } from "../world/CameraController";
import { sparkleBurst, gatherGlow, petalPuff } from "../fx/Particles";
import { Sfx } from "../fx/Sfx";
import { makeIconButton } from "../ui/hit";
import { makePanel } from "../ui/Panel";
import { titleStyle, bodyStyle } from "../ui/theme";
import { safeInsets } from "../util/safeArea";
import { progression } from "../game/services";

/**
 * Frosted Valley — a second, larger world built from the supplied production
 * art in public/assets/frosted/. Fully isolated: its own preload(), its own
 * world, no dependency on the main Garden catalog/economy/save systems.
 * Read-only dependency on `progression.isGardenComplete()` (already exists,
 * unmodified) gates entry behind the main Dream Garden's completion.
 *
 * SCALE SYSTEM: every prop's world size is driven by a target world-unit
 * HEIGHT (see NATIVE_H/target heights below), not by native PNG dimensions —
 * a rabbit is ~220 units tall (matching the main Garden's own rabbit scale),
 * and everything else is sized relative to that, per the hierarchy
 * animal < decor < small tree < cottage < large tree < major feature.
 *
 * COMPOSITION: six zones spaced well apart along a path (see ZONES/PATH/
 * RIVER), each with its own generous clearing — not one overlapping pile.
 *
 * NEGLECT/RESTORE: every zone's animal is tied to one "neglected" landmark —
 * shown in its damaged state until the animal's own puzzle is solved. The
 * fountain (grove) already has a full damaged→restored crossfade sequence
 * (see `triggerFountainRestore`); the other landmarks currently only render
 * their damaged sprite — restored counterparts are processed and sitting in
 * public/assets/frosted/ (fv_item_*_restored) ready for the reveal mechanic
 * once the per-animal puzzle/unlock system is built.
 */

// native pixel heights of every processed asset (see public/assets/frosted/)
const NATIVE_H: Record<string, number> = {
  fv_bridge: 545,
  fv_bridge_b: 545,
  fv_cottage_a: 719,
  fv_cottage_b: 582,
  fv_cottage_c: 582,
  fv_pine: 927,
  fv_pine_b: 633,
  fv_pine_c: 866,
  fv_pine_d: 795,
  fv_magic_treehouse: 822,
  fv_magic_tree_restored: 810,
  fv_blossom_tree: 556,
  fv_fence: 542,
  fv_barrel_flowers: 731,
  fv_barrel_b: 731,
  fv_birdhouse_post: 785,
  fv_ice_block: 647,
  fv_icicles: 536,
  fv_waterfall: 569,
  fv_waterfall_b: 569,
  fv_riverbank: 656,
  fv_crystal_a: 578,
  fv_crystal_b: 866,
  fv_crystal_c: 578,
  fv_crystal_d: 547,
  fv_crystal_e: 618,
  fv_crystal_flowers: 616,
  fv_flower_crystal_bouquet: 503,
  fv_flower_bush: 543,
  fv_flower_bush_b: 637,
  fv_flower_pot: 789,
  fv_flower_arch: 543,
  fv_flower_cluster_a: 405,
  fv_flower_cluster_b: 501,
  fv_flower_cluster_c: 524,
  fv_hedge: 590,
  fv_signpost: 805,
  fv_lamppost: 755,
  fv_wheelbarrow: 569,
  fv_bench: 576,
  fv_ice_gazebo: 631,
  fv_snowrock_a: 495,
  fv_snowrock_b: 582,
  fv_pond_frozen: 612,
  fv_pond_restored: 513,
  fv_rabbit: 529,
  fv_fox: 635,
  fv_squirrel: 555,
  fv_deer: 516,
  fv_polarbear: 620,
  fv_penguin: 562,
  fv_berry_branch: 873,
  fv_fountain_damaged: 615,
  fv_fountain_restored: 821,
  fv_dead_tree: 652,
  fv_item_well_damaged: 1305,
  fv_item_well_restored: 1147,
  fv_item_carrots_damaged: 1147,
  fv_item_carrots_restored: 1374,
  fv_item_signpost_damaged: 1263,
  fv_item_signpost_restored: 849,
  fv_item_lantern_damaged: 1464,
  fv_item_lantern_restored: 1142,
  fv_item_pool_damaged: 1056,
  fv_item_pool_restored: 1344,
  fv_item_nest_damaged: 1004,
  fv_item_nest_restored: 1313,
  fv_item_moonpetal_restored: 844,
  fv_item_crystal_damaged: 1003,
  fv_item_crystal_restored: 1056,
  fv_item_icecave_damaged: 1468,
  fv_item_icecave_restored: 1372,
  fv_item_fishhole_damaged: 1051,
  fv_item_fishhole_restored: 976,
  fv_item_igloo_damaged: 1065,
  fv_item_igloo_restored: 1330,
};

const FV_KEYS = [...Object.keys(NATIVE_H), "fv_sparkle_trail"];

const WORLD_W = 6000;
const WORLD_H = 5500;
const HORIZON = 350;

/** Six distinct clearings, spaced well apart — the world's real structure. */
const ZONES = {
  village: { x: 900, y: 4300 },
  bridge: { x: 2150, y: 3500 },
  grove: { x: 2950, y: 2600 },
  waterfall: { x: 4150, y: 1500 },
  crystals: { x: 4950, y: 850 },
  shore: { x: 2750, y: 5250 },
};

const START_FOCUS = { x: ZONES.village.x, y: ZONES.village.y - 90 };
/** Settle zoom after the opening reveal: wide enough to read a whole clearing
 * (a cottage plus its neighbors), not so tight it crops against one building. */
const SETTLE_ZOOM = 0.58;
const OVERVIEW_CENTER = { x: (ZONES.village.x + ZONES.crystals.x) / 2, y: (ZONES.village.y + ZONES.crystals.y) / 2 };

const wait = (scene: Phaser.Scene, ms: number) => new Promise<void>((res) => scene.time.delayedCall(ms, res));

export class FrostedValleyScene extends Phaser.Scene {
  private camera!: CameraController;
  private fountainDamaged!: Phaser.GameObjects.Image;
  private fountainRestored!: Phaser.GameObjects.Image;
  private restored = false;
  private restoring = false;
  private flowBusy = false;
  private skipBtn?: Phaser.GameObjects.Container;
  private tourSkipped = false;
  private idleTargets: Phaser.GameObjects.Image[] = [];
  private locked = false;

  constructor() {
    super("FrostedValley");
  }

  preload(): void {
    for (const key of FV_KEYS) this.load.image(key, `assets/frosted/${key}.png`);
  }

  create(): void {
    this.locked = !progression.isGardenComplete();
    if (this.locked) {
      this.buildLockedPreview();
      return;
    }

    this.restored = false;
    this.restoring = false;
    this.flowBusy = false;
    this.tourSkipped = false;
    this.idleTargets = [];

    this.buildSky();
    this.buildGround();
    this.buildPath();
    this.buildRiver();
    this.buildAtmosphere();
    this.buildForestFringe();
    this.buildVillageZone();
    this.buildBridgeZone();
    this.buildRestorationGrove();
    this.buildWaterfallZone();
    this.buildCrystalZone();
    this.buildFrozenShore();
    this.buildAnimals();
    this.buildForeground();
    this.buildSnowfall();

    this.camera = new CameraController(this, { w: WORLD_W, h: WORLD_H });
    this.camera.onTap = (x, y) => this.handleTap(x, y);

    this.startIdleBreathing();

    const backBtn = makeIconButton(this, 56, safeInsets().top + 34, "‹", 26, () => this.close(), {
      hitW: 56,
      hitH: 56,
      color: "#fef6e8",
    });
    backBtn.setScrollFactor(0).setDepth(9500);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    });

    this.time.delayedCall(60, () => void this.playOpeningReveal());

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__dgFrostedValley = {
        restore: () => this.triggerFountainRestore(),
        skipTour: () => (this.tourSkipped = true),
      };
    }
  }

  private onResize(): void {
    this.camera?.onResize();
  }

  private close(): void {
    Sfx.tap();
    this.cameras.main.fadeOut(180, 20, 16, 30);
    this.time.delayedCall(190, () => this.scene.stop());
  }

  /* ================= LOCKED PREVIEW (world-select presentation) ================= */

  private buildLockedPreview(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;

    const root = this.add.container(0, 0);

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x3a2f52, 0x2a2038, 0x1c2440, 0x14182c, 1);
    bg.fillRect(0, 0, W, H);
    root.add(bg);

    const sceneScale = Math.min(W / 900, H / 1000);
    const put = (key: string, x: number, y: number, scale: number, depth: number) =>
      root.add(
        this.add
          .image(cx + x * sceneScale, H * 0.6 + y * sceneScale, key)
          .setOrigin(0.5, 1)
          .setScale(scale * sceneScale)
          .setDepth(depth),
      );

    put("fv_pine", -280, -60, 0.55, 1);
    put("fv_pine", 300, -90, 0.6, 1);
    put("fv_magic_treehouse", -220, 40, 0.5, 2);
    put("fv_waterfall", 230, -20, 0.55, 2);
    put("fv_bridge", 40, 120, 0.5, 3);
    put("fv_fountain_restored", -30, 60, 0.5, 4);
    put("fv_crystal_a", 260, 100, 0.4, 3);
    put("fv_cottage_a", -300, 130, 0.55, 4);

    const dim = this.add.rectangle(0, 0, W, H, 0x0a0a18, 0.62).setOrigin(0, 0);
    root.add(dim);

    root.add(this.add.image(cx, H * 0.32, "fv_sparkle_trail").setScale(0.5).setAlpha(0.5));

    root.add(
      this.add
        .text(cx, H * 0.4, "❄️ FROSTED VALLEY", { ...titleStyle(30), color: "#fef6e8", align: "center" })
        .setOrigin(0.5),
    );

    const panelW = Math.min(W - 48, 380);
    const lockPanel = makePanel(this, panelW, 150, { fill: 0x1c1a2e, edge: 0x4a4468 }).setPosition(cx, H * 0.58);
    root.add(lockPanel);
    root.add(this.add.text(cx, H * 0.58 - 40, "🔒", { fontSize: "40px" }).setOrigin(0.5));
    root.add(
      this.add
        .text(cx, H * 0.58 + 18, "Complete the previous\nGarden to unlock this one!", {
          ...bodyStyle(17, "#fef6e8"),
          align: "center",
          lineSpacing: 6,
        })
        .setOrigin(0.5),
    );

    root.add(
      this.add.text(cx, H - safeInsets().bottom - 40, "TAP to Close", bodyStyle(15, "#c9c2d8")).setOrigin(0.5),
    );

    const scrim = this.add.rectangle(0, 0, W, H, 0xffffff, 0.001).setOrigin(0, 0).setInteractive();
    scrim.on("pointerup", () => this.close());
    root.add(scrim);

    root.setAlpha(0);
    this.tweens.add({ targets: root, alpha: 1, duration: 260 });
  }

  /* ================= opening camera reveal ================= */

  private async playOpeningReveal(): Promise<void> {
    this.flowBusy = true;
    this.camera.disable();
    this.camera.frameWide(OVERVIEW_CENTER.x, OVERVIEW_CENTER.y);
    this.showSkip();
    if (!this.tourSkipped) await wait(this, 1600);
    this.hideSkip();
    await this.camera.focusOn(START_FOCUS.x, START_FOCUS.y, this.tourSkipped ? 500 : 950, SETTLE_ZOOM);
    this.camera.enable();
    this.flowBusy = false;
  }

  private showSkip(): void {
    const btn = makeIconButton(
      this,
      this.scale.width - 74,
      safeInsets().top + 34,
      "Skip ›",
      18,
      () => {
        Sfx.tap();
        this.tourSkipped = true;
      },
      { color: "#fef6e8", hitW: 112, hitH: 50 },
    );
    btn.setScrollFactor(0).setDepth(9500);
    this.skipBtn = btn;
  }

  private hideSkip(): void {
    this.registry.set("pointerOnUI", false);
    this.skipBtn?.destroy();
    this.skipBtn = undefined;
  }

  /* ================= background / terrain ================= */

  private buildSky(): void {
    const sky = this.add.image(0, 0, "sky").setOrigin(0, 0).setScrollFactor(0).setDepth(-1000).setTint(0xcfe3f5);
    sky.setDisplaySize(this.scale.width, this.scale.height);

    this.add.image(300, 140, "clouds").setOrigin(0, 0).setScrollFactor(0.05).setDepth(-900).setAlpha(0.85).setTint(0xffffff);
    this.add.image(1500, 90, "clouds").setOrigin(0, 0).setScrollFactor(0.07).setDepth(-900).setScale(0.9).setAlpha(0.6).setTint(0xffffff);
    this.add.image(2900, 60, "clouds").setOrigin(0, 0).setScrollFactor(0.06).setDepth(-900).setScale(0.8).setAlpha(0.5).setTint(0xffffff);
    this.add.image(4300, 120, "clouds").setOrigin(0, 0).setScrollFactor(0.05).setDepth(-900).setScale(0.75).setAlpha(0.55).setTint(0xffffff);

    this.add.image(-300, HORIZON + 40, "hills_far").setOrigin(0, 1).setScrollFactor(0.15).setDepth(-820).setScale(3.6).setTintFill(0xc3d9ee);
    this.add.image(-380, HORIZON + 90, "hills_near").setOrigin(0, 1).setScrollFactor(0.25).setDepth(-780).setScale(3.6).setTintFill(0xe3edf7);
  }

  private buildGround(): void {
    const g = this.add.graphics().setDepth(-200);
    g.fillGradientStyle(0xe7eff8, 0xe7eff8, 0xf6fafd, 0xf6fafd, 1);
    g.fillRect(0, HORIZON - 4, WORLD_W, WORLD_H - HORIZON + 4);

    const blend = this.add.graphics().setDepth(-185);
    blend.fillGradientStyle(0xcfe3f5, 0xcfe3f5, 0xe7eff8, 0xe7eff8, 0.9, 0.9, 0, 0);
    blend.fillRect(0, HORIZON - 90, WORLD_W, 120);
  }

  /** A continuous winding trail linking every zone in order — the world's spine. */
  private buildPath(): void {
    const path = this.add.graphics().setDepth(-150);
    path.fillStyle(0xfdfaf3, 0.92);
    const pts = this.chain([ZONES.village, ZONES.bridge, ZONES.grove, ZONES.waterfall, ZONES.crystals], 9);
    for (const p of pts) path.fillEllipse(p.x, p.y, 150, 78);

    const spur = this.add.graphics().setDepth(-150);
    spur.fillStyle(0xfdfaf3, 0.9);
    const spurPts = this.chain([ZONES.village, ZONES.shore], 7);
    for (const p of spurPts) spur.fillEllipse(p.x, p.y, 130, 68);
  }

  /** Waterfall -> pool -> bridge crossing -> continued water, offset from the grove clearing. */
  private buildRiver(): void {
    const river = this.add.graphics().setDepth(-140);
    river.fillStyle(0x8fd0e8, 0.85);
    const src = { x: ZONES.waterfall.x - 60, y: ZONES.waterfall.y + 160 };
    const mid = { x: ZONES.grove.x + 620, y: ZONES.grove.y - 120 };
    const cross = { x: ZONES.bridge.x + 40, y: ZONES.bridge.y - 20 };
    const tail = { x: ZONES.bridge.x - 340, y: ZONES.bridge.y + 560 };
    const mouth = { x: ZONES.shore.x + 260, y: ZONES.shore.y - 180 };
    const pts = this.chain([src, mid, cross, tail, mouth], 7);
    for (const p of pts) river.fillEllipse(p.x, p.y, 230, 140);

    const shimmer = this.add.graphics().setDepth(-138);
    shimmer.fillStyle(0xcdeef7, 0.5);
    for (const p of pts) shimmer.fillEllipse(p.x, p.y, 80, 44);
  }

  /**
   * Atmospheric ground detail: frost cracks radiating across the open snow,
   * and small paw-print trails leading toward each zone's hidden animal —
   * cheap procedural Graphics, no new art needed.
   */
  private buildAtmosphere(): void {
    const cracks = this.add.graphics().setDepth(-145);
    cracks.lineStyle(4, 0x9fc2dc, 0.55);
    const crackOrigins = [
      { x: 1550, y: 3950 },
      { x: 2600, y: 3050 },
      { x: 3600, y: 2000 },
      { x: 4550, y: 1150 },
      { x: 1450, y: 4650 },
    ];
    for (const o of crackOrigins) this.drawCrack(cracks, o.x, o.y, 5, 110);

    if (!this.textures.exists("fv_pawprint")) {
      const g = this.make.graphics({}, false);
      g.fillStyle(0x9fc2dc, 1);
      g.fillEllipse(6, 10, 7, 9);
      g.fillEllipse(2, 2, 3, 4);
      g.fillEllipse(7, 0, 3, 4);
      g.fillEllipse(11, 2, 3, 4);
      g.generateTexture("fv_pawprint", 16, 16);
      g.destroy();
    }
    const trails: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> = [
      { from: { x: ZONES.village.x - 260, y: ZONES.village.y - 60 }, to: { x: ZONES.village.x + 220, y: ZONES.village.y + 170 } },
      { from: { x: ZONES.bridge.x - 420, y: ZONES.bridge.y + 60 }, to: { x: ZONES.bridge.x - 100, y: ZONES.bridge.y + 170 } },
      { from: { x: ZONES.waterfall.x - 700, y: ZONES.waterfall.y + 120 }, to: { x: ZONES.waterfall.x - 340, y: ZONES.waterfall.y + 270 } },
      { from: { x: ZONES.grove.x - 420, y: ZONES.grove.y + 340 }, to: { x: ZONES.grove.x - 210, y: ZONES.grove.y + 270 } },
      { from: { x: ZONES.crystals.x - 620, y: ZONES.crystals.y + 340 }, to: { x: ZONES.crystals.x - 360, y: ZONES.crystals.y + 240 } },
      { from: { x: ZONES.shore.x - 200, y: ZONES.shore.y + 260 }, to: { x: ZONES.shore.x, y: ZONES.shore.y + 190 } },
    ];
    for (const t of trails) this.drawPawTrail(t.from, t.to);
  }

  /** A jagged branching frost crack, drawn as short connected segments. */
  private drawCrack(g: Phaser.GameObjects.Graphics, x: number, y: number, branches: number, len: number): void {
    for (let b = 0; b < branches; b++) {
      const angle = (Math.PI * 2 * b) / branches + Phaser.Math.FloatBetween(-0.3, 0.3);
      let cx = x;
      let cy = y;
      let a = angle;
      const segs = 3 + Math.floor(Math.random() * 3);
      for (let s = 0; s < segs; s++) {
        a += Phaser.Math.FloatBetween(-0.5, 0.5);
        const nx = cx + Math.cos(a) * len;
        const ny = cy + Math.sin(a) * len * 0.6;
        g.lineBetween(cx, cy, nx, ny);
        cx = nx;
        cy = ny;
      }
    }
  }

  /** A short trail of alternating paw prints leading toward a hidden animal. */
  private drawPawTrail(from: { x: number; y: number }, to: { x: number; y: number }): void {
    const steps = 6;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      const x = Phaser.Math.Linear(from.x, to.x, t) + (i % 2 === 0 ? -14 : 14);
      const y = Phaser.Math.Linear(from.y, to.y, t);
      const angle = Phaser.Math.Angle.Between(from.x, from.y, to.x, to.y);
      this.add
        .image(x, y, "fv_pawprint")
        .setRotation(angle + Math.PI / 2)
        .setScale(1.4)
        .setAlpha(0.65)
        .setDepth(-144);
    }
  }

  /** Linear-interpolated waypoint chain through a list of anchor points, `perLeg` points per leg. */
  private chain(anchors: Array<{ x: number; y: number }>, perLeg: number): Array<{ x: number; y: number }> {
    const out: Array<{ x: number; y: number }> = [];
    for (let i = 0; i < anchors.length - 1; i++) {
      const a = anchors[i];
      const b = anchors[i + 1];
      for (let s = 0; s <= perLeg; s++) {
        const t = s / perLeg;
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
    }
    return out;
  }

  /* ================= scale-calibrated prop helper ================= */

  /** Place a prop at a target WORLD-UNIT height (not native pixels) — see NATIVE_H. */
  private propH(
    key: string,
    x: number,
    y: number,
    targetHeight: number,
    opts: { depth?: number; tint?: number; alpha?: number; flip?: boolean; scroll?: number } = {},
  ): Phaser.GameObjects.Image {
    const native = NATIVE_H[key] ?? targetHeight;
    const scale = targetHeight / native;
    const img = this.add.image(x, y, key).setOrigin(0.5, 1).setScale(scale);
    img.setDepth(opts.depth ?? y);
    if (opts.tint !== undefined) img.setTint(opts.tint);
    if (opts.alpha !== undefined) img.setAlpha(opts.alpha);
    if (opts.flip) img.setFlipX(true);
    if (opts.scroll !== undefined) img.setScrollFactor(opts.scroll);
    return img;
  }

  /** Distant hazy treeline along the world's back edge, for depth — mixed pine variants for texture. */
  private buildForestFringe(): void {
    const variants = ["fv_pine", "fv_pine_b", "fv_pine_c", "fv_pine_d"];
    for (let i = 0; i < 22; i++) {
      const x = 80 + i * 280 + (i % 2) * 70;
      this.propH(variants[i % variants.length], x, HORIZON + 60 + (i % 3) * 20, 340 + (i % 2) * 60, {
        depth: -160,
        tint: 0xb9cfe8,
        alpha: 0.85,
        scroll: 0.94,
      });
    }
  }

  /* ================= ZONE A: Snowy Village ================= */

  private buildVillageZone(): void {
    const z = ZONES.village;
    // framing pines well outside the clearing radius (~900+), not crowding the cottages
    this.propH("fv_pine", z.x - 780, z.y - 420, 560);
    this.propH("fv_pine_c", z.x - 950, z.y + 60, 620);
    this.propH("fv_pine_b", z.x + 820, z.y - 520, 540);
    this.propH("fv_pine_d", z.x - 1050, z.y - 580, 480);
    this.propH("fv_magic_treehouse", z.x - 560, z.y - 40, 780, { tint: 0xe8e2f5 });

    // cottages get real breathing room between them (~800 apart, each ~500-650 wide)
    this.propH("fv_cottage_a", z.x - 120, z.y - 40, 600);
    this.propH("fv_cottage_b", z.x + 680, z.y + 20, 520);
    this.propH("fv_cottage_c", z.x + 1320, z.y + 140, 470);
    this.propH("fv_fence", z.x - 420, z.y + 90, 240);
    this.propH("fv_fence", z.x + 140, z.y + 110, 240, { flip: true });
    this.propH("fv_birdhouse_post", z.x + 980, z.y - 10, 300);
    this.propH("fv_flower_bush", z.x + 300, z.y + 130, 210);
    this.propH("fv_barrel_flowers", z.x - 620, z.y + 150, 230);
    this.propH("fv_barrel_b", z.x - 980, z.y + 280, 220);
    this.propH("fv_bench", z.x + 60, z.y + 230, 190);
    this.propH("fv_lamppost", z.x - 260, z.y + 220, 260);
    this.propH("fv_flower_arch", z.x - 1400, z.y + 120, 320);
    this.propH("fv_hedge", z.x + 1000, z.y + 320, 200);
    this.propH("fv_snowrock_a", z.x + 1500, z.y - 100, 220);

    // the neglected village landmark — a frozen carrot patch, restored once the rabbit's puzzle is solved
    this.propH("fv_item_well_damaged", z.x - 780, z.y - 100, 400);
    this.propH("fv_item_carrots_damaged", z.x + 560, z.y + 300, 260);
  }

  /* ================= ZONE B: Bridge / River crossing ================= */

  private buildBridgeZone(): void {
    const z = ZONES.bridge;
    this.propH("fv_bridge", z.x, z.y, 340);
    this.propH("fv_icicles", z.x - 460, z.y + 60, 240);
    this.propH("fv_flower_bush", z.x + 420, z.y + 90, 200);
    this.propH("fv_pine", z.x + 600, z.y - 340, 520);
    this.propH("fv_pine_c", z.x - 640, z.y - 260, 560);
    this.propH("fv_wheelbarrow", z.x - 780, z.y + 180, 210);
    this.propH("fv_flower_cluster_a", z.x - 260, z.y + 280, 170);
    this.propH("fv_snowrock_b", z.x + 300, z.y + 340, 210);

    // the neglected bridge landmarks — a broken lantern and blank signpost
    this.propH("fv_item_lantern_damaged", z.x + 140, z.y - 120, 260);
    this.propH("fv_item_signpost_damaged", z.x + 700, z.y + 180, 300);
  }

  /* ================= ZONE C: Restoration Grove ================= */

  private buildRestorationGrove(): void {
    const z = ZONES.grove;
    // the damaged landmark stands with open snow around it — a clear point of interest
    this.fountainDamaged = this.propH("fv_fountain_damaged", z.x, z.y, 480);
    this.fountainRestored = this.propH("fv_fountain_restored", z.x, z.y, 480, { depth: z.y + 0.1 });
    this.fountainRestored.setAlpha(0);

    // a hint of neglect nearby, spaced apart, not overlapping
    this.propH("fv_dead_tree", z.x - 620, z.y + 80, 480);

    // sparse accents only — this zone stays deliberately open until restored
    this.propH("fv_crystal_b", z.x + 560, z.y + 40, 260, { flip: true });
    this.propH("fv_pine", z.x - 760, z.y - 380, 540);
    this.propH("fv_pine_b", z.x + 780, z.y - 440, 520);
    this.propH("fv_blossom_tree", z.x + 1180, z.y - 140, 460);
    this.propH("fv_flower_pot", z.x - 280, z.y + 300, 230);
    this.propH("fv_crystal_flowers", z.x + 300, z.y + 320, 260);
    this.propH("fv_hedge", z.x - 1000, z.y + 220, 200);

    // the deer's neglected landmark — a wilted moonpetal patch
    this.propH("fv_item_moonpetal_restored", z.x + 900, z.y + 280, 200, { tint: 0x8a90a0 });
  }

  /* ================= ZONE D: Frozen Waterfall ================= */

  private buildWaterfallZone(): void {
    const z = ZONES.waterfall;
    this.propH("fv_waterfall", z.x, z.y, 740);
    this.propH("fv_waterfall_b", z.x + 680, z.y + 260, 360);
    this.propH("fv_ice_block", z.x - 480, z.y + 120, 260);
    this.propH("fv_riverbank", z.x - 120, z.y + 220, 380);
    this.propH("fv_pine", z.x + 540, z.y - 200, 520);
    this.propH("fv_pine_d", z.x - 620, z.y - 100, 560);
    this.propH("fv_flower_bush", z.x + 400, z.y + 90, 190);
    this.propH("fv_snowrock_a", z.x + 1000, z.y + 80, 230);

    // the squirrel's neglected landmarks — an empty nest and a frozen rock pool
    this.propH("fv_item_nest_damaged", z.x - 960, z.y + 340, 420);
    this.propH("fv_pond_frozen", z.x - 780, z.y + 560, 220);
  }

  /* ================= ZONE E: Crystal Area ================= */

  private buildCrystalZone(): void {
    const z = ZONES.crystals;
    this.propH("fv_crystal_a", z.x, z.y, 380);
    this.propH("fv_crystal_b", z.x + 320, z.y + 60, 240);
    this.propH("fv_crystal_c", z.x - 380, z.y + 180, 230);
    this.propH("fv_crystal_d", z.x + 620, z.y + 240, 210);
    this.propH("fv_crystal_e", z.x - 620, z.y - 60, 220);
    this.propH("fv_icicles", z.x - 280, z.y + 40, 220);
    this.propH("fv_pine", z.x - 460, z.y - 240, 460, { tint: 0xd7e6f2 });
    this.propH("fv_ice_gazebo", z.x + 880, z.y - 60, 480);
    this.propH("fv_snowrock_b", z.x + 180, z.y + 380, 220);

    // the polar bear's neglected landmarks — a dull crystal and a dark cave mouth
    this.propH("fv_item_crystal_damaged", z.x - 900, z.y + 320, 350);
    this.propH("fv_item_icecave_damaged", z.x + 400, z.y + 460, 500);
    this.propH("fv_item_fishhole_damaged", z.x - 200, z.y + 420, 200);
  }

  /* ================= ZONE F: Frozen Shore ================= */

  private buildFrozenShore(): void {
    const z = ZONES.shore;
    this.propH("fv_pine_b", z.x - 620, z.y - 180, 500);
    this.propH("fv_pine_c", z.x + 640, z.y - 220, 540);
    this.propH("fv_bridge_b", z.x + 120, z.y - 80, 300);
    this.propH("fv_flower_crystal_bouquet", z.x - 280, z.y + 220, 220);
    this.propH("fv_snowrock_a", z.x + 380, z.y + 260, 220);
    this.propH("fv_snowrock_b", z.x - 460, z.y + 300, 210);

    // the penguin's neglected landmark — a collapsed igloo
    this.propH("fv_item_igloo_damaged", z.x + 560, z.y + 60, 420);
  }

  /* ================= animals — open, readable ground ================= */

  private buildAnimals(): void {
    const rabbit = this.propH("fv_rabbit", ZONES.village.x + 260, ZONES.village.y + 190, 220);
    const fox = this.propH("fv_fox", ZONES.bridge.x - 80, ZONES.bridge.y + 180, 210);
    const squirrel = this.propH("fv_squirrel", ZONES.waterfall.x - 320, ZONES.waterfall.y + 280, 190, { flip: true });
    const deer = this.propH("fv_deer", ZONES.grove.x - 200, ZONES.grove.y + 280, 230);
    const polarbear = this.propH("fv_polarbear", ZONES.crystals.x - 350, ZONES.crystals.y + 230, 210, { flip: true });
    const penguin = this.propH("fv_penguin", ZONES.shore.x, ZONES.shore.y + 180, 210);
    this.idleTargets.push(rabbit, fox, squirrel, deer, polarbear, penguin);
  }

  private buildForeground(): void {
    this.propH("fv_berry_branch", 140, 260, 420, { depth: 9000, scroll: 1.04 });
    this.propH("fv_berry_branch", WORLD_W - 100, 300, 420, { depth: 9000, scroll: 1.04, flip: true });
  }

  /** Restrained ambient snow — a generated dot texture drifting slowly downward. */
  private buildSnowfall(): void {
    const key = "fv_snow_dot";
    if (!this.textures.exists(key)) {
      const g = this.make.graphics({}, false);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(4, 4, 4);
      g.generateTexture(key, 8, 8);
      g.destroy();
    }
    const emitter = this.add.particles(0, 0, key, {
      x: { min: 0, max: this.scale.width },
      y: -10,
      lifespan: { min: 6000, max: 11000 },
      speedY: { min: 20, max: 46 },
      speedX: { min: -8, max: 8 },
      scale: { min: 0.4, max: 1.2 },
      alpha: { start: 0.85, end: 0.15 },
      frequency: 130,
    });
    emitter.setScrollFactor(0).setDepth(8000);
  }

  /* ================= idle life ================= */

  private startIdleBreathing(): void {
    for (const t of this.idleTargets) {
      this.tweens.add({
        targets: t,
        scaleY: t.scaleY * 1.04,
        duration: 1400 + Math.random() * 400,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: Math.random() * 600,
      });
    }
    this.time.addEvent({
      delay: 3600,
      loop: true,
      callback: () => {
        const gx = ZONES.grove.x - 500 + Phaser.Math.Between(-30, 30);
        const s = this.add.image(gx, ZONES.grove.y - 700, "fv_sparkle_trail").setScale(0.28).setAlpha(0).setDepth(560);
        this.tweens.add({
          targets: s,
          alpha: 0.75,
          y: s.y - 40,
          duration: 1600,
          ease: "Sine.easeOut",
          onComplete: () => this.tweens.add({ targets: s, alpha: 0, duration: 600, onComplete: () => s.destroy() }),
        });
      },
    });
  }

  /* ================= interaction ================= */

  private handleTap(x: number, y: number): void {
    if (this.flowBusy || this.restoring) return;
    Sfx.unlock();
    const d = Phaser.Math.Distance.Between(x, y, ZONES.grove.x, ZONES.grove.y - 40);
    if (d < 260 && !this.restored) this.triggerFountainRestore();
  }

  /**
   * Stand-in for the eventual puzzle hookup: in the finished game, this should
   * be called once the player solves this area's picture puzzle, not from a
   * direct tap. Left as a tap for this world-building pass so the restoration
   * beat can be seen and reviewed.
   */
  private async triggerFountainRestore(): Promise<void> {
    if (this.restoring || this.restored) return;
    this.restoring = true;

    this.cameras.main.shake(160, 0.002);
    Sfx.sparkle();
    await wait(this, 220);

    const glow = await gatherGlow(this, ZONES.grove.x, ZONES.grove.y - 30, 650);
    sparkleBurst(this, ZONES.grove.x, ZONES.grove.y - 30, 22, 70);

    this.tweens.add({ targets: this.fountainDamaged, alpha: 0, duration: 420, ease: "Sine.easeIn" });
    this.tweens.add({
      targets: this.fountainRestored,
      alpha: 1,
      duration: 520,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: this.fountainRestored,
          scaleY: this.fountainRestored.scaleY * 1.03,
          scaleX: this.fountainRestored.scaleX * 1.03,
          duration: 1400,
          yoyo: true,
          repeat: 1,
          ease: "Sine.easeInOut",
        });
      },
    });
    Sfx.fanfare();
    petalPuff(this, ZONES.grove.x, ZONES.grove.y - 60, 14);

    await wait(this, 500);
    this.tweens.add({ targets: glow, alpha: 0, duration: 500, onComplete: () => glow.destroy() });

    const fox = this.idleTargets[1];
    if (fox) {
      this.tweens.add({ targets: fox, y: fox.y - 22, duration: 200, yoyo: true, repeat: 2, ease: "Sine.easeOut" });
    }

    this.restored = true;
    this.restoring = false;
  }
}
