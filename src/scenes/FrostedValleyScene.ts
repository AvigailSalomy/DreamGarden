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
 * and everything else is sized relative to that.
 *
 * COMPOSITION: six zones spaced well apart along a path (see ZONES/PATH/
 * RIVER), each with its own generous clearing.
 *
 * NEGLECT/RESCUE (see `revealZone`): every zone's animal starts as a solid
 * black silhouette (intentional locked state — see `buildZoneAnimal`) next
 * to its own 1-3 "neglected" landmarks, shown in their damaged state. Both
 * the animal and its landmarks are wired to crossfade to their restored
 * counterparts through one shared, reusable reveal sequence. The grove's
 * fountain keeps its original tap-to-trigger interaction (already reviewed);
 * every other zone is revealed through the `__dgFrostedValley.reveal(zone)`
 * dev hook — an honest stand-in until the real per-zone puzzle/unlock
 * mechanic exists to call it instead.
 */

type ZoneKey = "village" | "bridge" | "grove" | "waterfall" | "crystals" | "shore";

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
  // neglected-landmark pairs, one per animal request, user-verified damaged/restored
  fv_rabbit_carrots_damaged: 1147,
  fv_rabbit_carrots_restored: 1147,
  fv_rabbit_well_damaged: 1305,
  fv_rabbit_well_restored: 1305,
  fv_rabbit_chime_damaged: 1377,
  fv_rabbit_chime_restored: 1373,
  fv_fox_ice_damaged: 1051,
  fv_fox_ice_restored: 1142,
  fv_fox_signpost_damaged: 1263,
  fv_fox_signpost_restored: 1263,
  fv_deer_flower_damaged: 849,
  fv_deer_flower_restored: 844,
  fv_squirrel_waterfall_damaged: 1372,
  fv_squirrel_waterfall_restored: 1368,
  fv_squirrel_pool_damaged: 1147,
  fv_squirrel_pool_restored: 1144,
  fv_squirrel_nest_damaged: 1329,
  fv_squirrel_nest_restored: 1313,
  fv_bear_crystal_damaged: 1056,
  fv_bear_crystal_restored: 1056,
  fv_bear_hole_damaged: 1043,
  fv_bear_hole_restored: 1344,
  fv_bear_cave_damaged: 1330,
  fv_bear_cave_restored: 1330,
  fv_penguin_iceberg_damaged: 1003,
  fv_penguin_iceberg_restored: 1004,
  fv_penguin_igloo_damaged: 1065,
  fv_penguin_igloo_restored: 1103,
  fv_penguin_slide_damaged: 1122,
  fv_penguin_slide_restored: 1374,
};

const FV_KEYS = [...Object.keys(NATIVE_H), "fv_sparkle_trail", "fv_star_sparkle", "fv_glow_orb"];

/**
 * The world is a single painted background image (fv_world_bg, native
 * 2838x1472) stretched uniformly ×4 so its real terrain features — the
 * meandering stream, the loop bend, the icy cliff, the lake — land at a
 * scale that fits our existing prop-spacing conventions without warping
 * its aspect ratio. Zone anchors below are that same native-image pixel
 * position, sampled by eye from the reference, times BG_SCALE.
 */
const BG_NATIVE_W = 2838;
const BG_NATIVE_H = 1472;
const BG_SCALE = 4;
const WORLD_W = BG_NATIVE_W * BG_SCALE + 1000; // +margin so the crystal zone's spread clears the right edge
const WORLD_H = BG_NATIVE_H * BG_SCALE;
const HORIZON = 0; // the background image is terrain edge-to-edge, no separate sky band

/** Six distinct clearings, positioned on the real features of fv_world_bg. */
const ZONES: Record<ZoneKey, { x: number; y: number }> = {
  village: { x: 450 * BG_SCALE, y: 750 * BG_SCALE }, // open flat snow, left-center
  bridge: { x: 1150 * BG_SCALE, y: 420 * BG_SCALE }, // the river's narrow neck
  grove: { x: 1550 * BG_SCALE, y: 580 * BG_SCALE }, // the river's big loop bend
  waterfall: { x: 2400 * BG_SCALE, y: 150 * BG_SCALE }, // the icy cliff, upper-right
  crystals: { x: 2750 * BG_SCALE, y: 220 * BG_SCALE }, // rocks beside the cliff
  shore: { x: 2500 * BG_SCALE, y: 1200 * BG_SCALE }, // the lake, lower-right
};

const START_FOCUS = { x: ZONES.village.x, y: ZONES.village.y - 90 };
/** Settle zoom after the opening reveal: wide enough to read a whole clearing
 * (a cottage plus its neighbors), not so tight it crops against one building. */
const SETTLE_ZOOM = 0.58;
const OVERVIEW_CENTER = { x: (ZONES.village.x + ZONES.crystals.x) / 2, y: (ZONES.village.y + ZONES.crystals.y) / 2 };

const wait = (scene: Phaser.Scene, ms: number) => new Promise<void>((res) => scene.time.delayedCall(ms, res));

interface ZoneAnimalRec {
  sprite: Phaser.GameObjects.Image;
  badge: Phaser.GameObjects.Text;
  x: number;
  y: number;
  radius: number;
  hint: string;
  revealed: boolean;
  normalKey: string;
  flip: boolean;
}

interface ItemPairRec {
  damaged: Phaser.GameObjects.Image;
  restored: Phaser.GameObjects.Image;
}

export class FrostedValleyScene extends Phaser.Scene {
  private camera!: CameraController;
  private flowBusy = false;
  private skipBtn?: Phaser.GameObjects.Container;
  private tourSkipped = false;
  private idleTargets: Phaser.GameObjects.Image[] = [];
  private swayTargets: Phaser.GameObjects.Image[] = [];
  private treeSwayTargets: Phaser.GameObjects.Image[] = [];
  private crystalTargets: Phaser.GameObjects.Image[] = [];
  private lanternSpots: Array<{ x: number; y: number }> = [];
  private chimneySpots: Array<{ x: number; y: number }> = [];
  private locked = false;
  private zoneAnimals: Partial<Record<ZoneKey, ZoneAnimalRec>> = {};
  private zoneItems: Partial<Record<ZoneKey, ItemPairRec[]>> = {};
  private hintBusy = false;
  private groveFountainPos = { x: 0, y: 0 };

  constructor() {
    super("FrostedValley");
  }

  preload(): void {
    for (const key of FV_KEYS) this.load.image(key, `assets/frosted/${key}.png`);
    this.load.image("fv_world_bg", "assets/frosted/fv_world_bg.png");
  }

  create(): void {
    this.locked = !progression.isGardenComplete();
    if (this.locked) {
      this.buildLockedPreview();
      return;
    }

    this.flowBusy = false;
    this.tourSkipped = false;
    this.idleTargets = [];
    this.swayTargets = [];
    this.treeSwayTargets = [];
    this.crystalTargets = [];
    this.lanternSpots = [];
    this.chimneySpots = [];
    this.zoneAnimals = {};
    this.zoneItems = {};
    this.hintBusy = false;

    this.buildSky();
    this.buildGround();
    this.buildPath();
    this.buildWaterSparkle();
    this.buildAtmosphere();
    this.buildForestFringe();
    this.buildDenseForest();
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
    this.startAmbientAnimation();

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
        reveal: (zone: ZoneKey) => void this.revealZone(zone),
        revealAll: () => {
          (Object.keys(this.zoneAnimals) as ZoneKey[]).forEach((z, i) =>
            this.time.delayedCall(i * 900, () => void this.revealZone(z)),
          );
        },
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
    // the background image is terrain edge-to-edge — just a plain fallback
    // color behind it (visible only if the image hasn't painted a pixel) and
    // a couple of very faint drifting clouds for the tiniest touch of life.
    const fallback = this.add.rectangle(0, 0, WORLD_W, WORLD_H, 0xe7eff8, 1).setOrigin(0, 0).setDepth(-1000);
    void fallback;

    const cloudDefs = [
      { x: 300, y: 40, scroll: 0.05, scale: 1, alpha: 0.35 },
      { x: 1900, y: 20, scroll: 0.07, scale: 0.85, alpha: 0.25 },
      { x: 4200, y: 0, scroll: 0.06, scale: 0.8, alpha: 0.2 },
    ];
    for (const c of cloudDefs) {
      const cloud = this.add
        .image(c.x, c.y, "clouds")
        .setOrigin(0, 0)
        .setScrollFactor(c.scroll)
        .setDepth(-900)
        .setScale(c.scale)
        .setAlpha(c.alpha)
        .setTint(0xffffff);
      this.tweens.add({
        targets: cloud,
        x: c.x + 60,
        duration: 22000 + Math.random() * 8000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }

  /**
   * The world's ground/terrain/water is the painted fv_world_bg image itself
   * — see the class doc for why: it replaces what used to be procedurally
   * drawn Graphics (flat gradient + drift ellipses + the whole river/lake).
   */
  private buildGround(): void {
    const bg = this.add.image(0, 0, "fv_world_bg").setOrigin(0, 0).setDepth(-200);
    bg.setDisplaySize(WORLD_W, WORLD_H);
  }

  /** A continuous winding trail linking every zone in order — the world's spine. */
  private buildPath(): void {
    const outline = this.add.graphics().setDepth(-151);
    const path = this.add.graphics().setDepth(-150);
    const edge = this.add.graphics().setDepth(-149);
    path.fillStyle(0xf4ecda, 0.95);
    outline.fillStyle(0xbfd0e2, 0.4);
    edge.fillStyle(0xffffff, 0.55);
    const pts = this.chain([ZONES.village, ZONES.bridge, ZONES.grove, ZONES.waterfall, ZONES.crystals], 9);
    for (const p of pts) {
      outline.fillEllipse(p.x, p.y, 168, 90);
      path.fillEllipse(p.x, p.y, 150, 78);
      edge.fillEllipse(p.x, p.y - 6, 120, 50);
    }

    const spur = this.add.graphics().setDepth(-150);
    const spurOutline = this.add.graphics().setDepth(-151);
    spur.fillStyle(0xf4ecda, 0.92);
    spurOutline.fillStyle(0xbfd0e2, 0.4);
    const spurPts = this.chain([ZONES.village, ZONES.shore], 7);
    for (const p of spurPts) {
      spurOutline.fillEllipse(p.x, p.y, 148, 78);
      spur.fillEllipse(p.x, p.y, 130, 68);
    }
  }

  /**
   * The river, its banks, and the lake are all painted into fv_world_bg now —
   * see `buildGround`. A few drifting sparkle motes along the water's actual
   * path (still estimated from the background image) are the only thing left
   * to add procedurally, as a light touch of life on top of the painted water.
   */
  private buildWaterSparkle(): void {
    const spots = [
      { x: 1150 * BG_SCALE, y: 300 * BG_SCALE },
      { x: 1400 * BG_SCALE, y: 480 * BG_SCALE },
      { x: 1000 * BG_SCALE, y: 650 * BG_SCALE },
      { x: 2350 * BG_SCALE, y: 1150 * BG_SCALE },
    ];
    spots.forEach((p, i) => {
      this.time.delayedCall(i * 500, () => {
        this.time.addEvent({
          delay: 1800 + Math.random() * 1200,
          loop: true,
          callback: () => {
            const dot = this.add
              .image(p.x + Phaser.Math.Between(-60, 60), p.y + Phaser.Math.Between(-30, 30), "fv_star_sparkle")
              .setScale(0.05)
              .setAlpha(0)
              .setDepth(-137);
            this.tweens.add({
              targets: dot,
              alpha: 0.7,
              duration: 900,
              yoyo: true,
              onComplete: () => dot.destroy(),
            });
          },
        });
      });
    });
  }

  /**
   * Atmospheric ground detail: small paw-print trails leading toward each
   * zone's hidden animal — cheap procedural Graphics, no new art needed. The
   * frost-crack detail from the earlier procedural-ground pass is gone now
   * that the painted background supplies its own ground texture.
   */
  private buildAtmosphere(): void {
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

  /* ================= scale-calibrated prop helpers ================= */

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

  /**
   * A neglected landmark: places the damaged sprite (visible) and its restored
   * counterpart (same spot, invisible) and registers the pair against `zone`
   * so `revealZone` can crossfade them the moment that zone's animal is found.
   */
  private itemPair(
    zone: ZoneKey,
    damagedKey: string,
    restoredKey: string,
    x: number,
    y: number,
    targetHeight: number,
    opts: { flip?: boolean } = {},
  ): void {
    const damaged = this.propH(damagedKey, x, y, targetHeight, { flip: opts.flip });
    const restored = this.propH(restoredKey, x, y, targetHeight, { flip: opts.flip, depth: damaged.depth + 0.1 });
    restored.setAlpha(0);
    (this.zoneItems[zone] ??= []).push({ damaged, restored });
  }

  /** A soft contact shadow so a prop reads as standing IN the snow, not floating on it. */
  private groundShadow(x: number, y: number, width: number, depthBelow: number): void {
    const shadow = this.add.ellipse(x, y + 4, width, width * 0.26, 0x36486a, 0.16);
    shadow.setDepth(depthBelow - 0.5);
  }

  /** Distant hazy treeline along the world's back edge, for depth — mixed pine variants for texture. */
  private buildForestFringe(): void {
    const variants = ["fv_pine", "fv_pine_b", "fv_pine_c", "fv_pine_d"];
    const count = 26;
    const step = WORLD_W / count;
    for (let i = 0; i < count; i++) {
      const x = step * 0.3 + i * step + (i % 2) * (step * 0.25);
      this.propH(variants[i % variants.length], x, HORIZON + 60 + (i % 3) * 20, 340 + (i % 2) * 60, {
        depth: -160,
        tint: 0xb9cfe8,
        alpha: 0.85,
        scroll: 0.94,
      });
    }
  }

  /**
   * Fills the open ground between zones with trees and rocks so the world
   * reads as one continuous forest rather than clearings on an empty field —
   * skips each zone's own clearing and a corridor around the path/river so
   * the route through the valley stays clean and walkable.
   */
  private buildDenseForest(): void {
    const zoneList = Object.values(ZONES);
    const clearingRadius: Record<ZoneKey, number> = {
      village: 1150,
      bridge: 820,
      grove: 1050,
      waterfall: 1050,
      crystals: 1050,
      shore: 850,
    };
    const corridor = this.chain(
      [ZONES.village, ZONES.bridge, ZONES.grove, ZONES.waterfall, ZONES.crystals],
      14,
    ).concat(this.chain([ZONES.village, ZONES.shore], 10));
    const corridorWidth = 210;

    // small deterministic PRNG so the forest layout is stable across reloads
    let seed = 1337;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };

    const variants = ["fv_pine", "fv_pine_b", "fv_pine_c", "fv_pine_d"];
    const cell = 300;
    for (let gy = HORIZON + 200; gy < WORLD_H - 120; gy += cell) {
      for (let gx = 0; gx < WORLD_W; gx += cell) {
        const x = gx + rand() * cell;
        const y = gy + rand() * cell;

        const inZone = (Object.keys(ZONES) as ZoneKey[]).some((key, i) => {
          const z = zoneList[i];
          return Phaser.Math.Distance.Between(x, y, z.x, z.y) < clearingRadius[key];
        });
        if (inZone) continue;

        let distToCorridor = Infinity;
        for (const p of corridor) {
          const d = Phaser.Math.Distance.Between(x, y, p.x, p.y);
          if (d < distToCorridor) distToCorridor = d;
        }
        if (distToCorridor < corridorWidth) continue;

        // a wayside micro-detail just off the path, instead of a tree
        if (distToCorridor < corridorWidth + 180 && rand() < 0.14) {
          const pick = rand();
          if (pick < 0.4) this.propH("fv_bench", x, y, 190);
          else if (pick < 0.7) this.propH("fv_signpost", x, y, 300);
          else this.propH("fv_wheelbarrow", x, y, 210);
          continue;
        }

        if (rand() < 0.32) continue; // keep some genuine open snow, not wall-to-wall trees

        const roll = rand();
        if (roll < 0.08) {
          this.propH(rand() < 0.5 ? "fv_snowrock_a" : "fv_snowrock_b", x, y, 200 + rand() * 90);
        } else if (roll < 0.14) {
          this.propH("fv_blossom_tree", x, y, 420 + rand() * 140);
        } else if (roll < 0.2) {
          this.propH("fv_dead_tree", x, y, 380 + rand() * 160, { alpha: 0.92 });
        } else {
          const h = 420 + rand() * 340;
          const tree = this.propH(variants[Math.floor(rand() * variants.length)], x, y, h);
          this.treeSwayTargets.push(tree);
        }
      }
    }
  }

  /* ================= ZONE A: Snowy Village ================= */

  private buildVillageZone(): void {
    const z = ZONES.village;
    // framing pines well outside the clearing radius (~900+), not crowding the cottages
    this.treeSwayTargets.push(this.propH("fv_pine", z.x - 780, z.y - 420, 560));
    this.treeSwayTargets.push(this.propH("fv_pine_c", z.x - 950, z.y + 60, 620));
    this.treeSwayTargets.push(this.propH("fv_pine_b", z.x + 820, z.y - 520, 540));
    this.treeSwayTargets.push(this.propH("fv_pine_d", z.x - 1050, z.y - 580, 480));
    this.propH("fv_magic_treehouse", z.x - 560, z.y - 40, 780, { tint: 0xe8e2f5 });
    this.groundShadow(z.x - 560, z.y - 40, 520, z.y - 40);
    this.chimneySpots.push({ x: z.x - 510, y: z.y - 40 - 740 });

    // cottages get real breathing room between them (~800 apart, each ~500-650 wide)
    this.propH("fv_cottage_a", z.x - 120, z.y - 40, 600);
    this.groundShadow(z.x - 120, z.y - 40, 420, z.y - 40);
    this.chimneySpots.push({ x: z.x - 40, y: z.y - 40 - 560 });
    this.propH("fv_cottage_b", z.x + 680, z.y + 20, 520);
    this.groundShadow(z.x + 680, z.y + 20, 360, z.y + 20);
    this.chimneySpots.push({ x: z.x + 760, y: z.y + 20 - 480 });
    this.propH("fv_cottage_c", z.x + 1320, z.y + 140, 470);
    this.groundShadow(z.x + 1320, z.y + 140, 320, z.y + 140);
    this.chimneySpots.push({ x: z.x + 1390, y: z.y + 140 - 430 });
    this.lanternSpots.push({ x: z.x - 210, y: z.y - 260 }, { x: z.x + 560, y: z.y - 220 }, { x: z.x + 1200, y: z.y - 90 });

    this.propH("fv_fence", z.x - 420, z.y + 90, 240);
    this.propH("fv_fence", z.x + 140, z.y + 110, 240, { flip: true });
    this.propH("fv_birdhouse_post", z.x + 980, z.y - 10, 300);
    this.swayTargets.push(this.propH("fv_flower_bush", z.x + 300, z.y + 130, 210));
    this.swayTargets.push(this.propH("fv_barrel_flowers", z.x - 620, z.y + 150, 230));
    this.swayTargets.push(this.propH("fv_barrel_b", z.x - 980, z.y + 280, 220));
    this.propH("fv_bench", z.x + 60, z.y + 230, 190);
    this.propH("fv_lamppost", z.x - 260, z.y + 220, 260);
    this.lanternSpots.push({ x: z.x - 260, y: z.y + 24 });
    this.propH("fv_flower_arch", z.x - 1400, z.y + 120, 320);
    this.propH("fv_hedge", z.x + 1000, z.y + 320, 200);
    this.propH("fv_snowrock_a", z.x + 1500, z.y - 100, 220);

    // the rabbit's three neglected requests, grouped around its hidden spot
    this.itemPair("village", "fv_rabbit_well_damaged", "fv_rabbit_well_restored", z.x + 50, z.y + 260, 380);
    this.itemPair("village", "fv_rabbit_carrots_damaged", "fv_rabbit_carrots_restored", z.x + 520, z.y + 320, 260);
    this.itemPair("village", "fv_rabbit_chime_damaged", "fv_rabbit_chime_restored", z.x + 380, z.y - 20, 300);
  }

  /* ================= ZONE B: Bridge / River crossing ================= */

  private buildBridgeZone(): void {
    const z = ZONES.bridge;
    this.propH("fv_bridge", z.x, z.y, 340);
    this.propH("fv_icicles", z.x - 460, z.y + 60, 240);
    this.swayTargets.push(this.propH("fv_flower_bush", z.x + 420, z.y + 90, 200));
    this.treeSwayTargets.push(this.propH("fv_pine", z.x + 600, z.y - 340, 520));
    this.treeSwayTargets.push(this.propH("fv_pine_c", z.x - 640, z.y - 260, 560));
    this.propH("fv_wheelbarrow", z.x - 780, z.y + 180, 210);
    this.swayTargets.push(this.propH("fv_flower_cluster_a", z.x - 260, z.y + 280, 170));
    this.propH("fv_snowrock_b", z.x + 300, z.y + 340, 210);
    this.lanternSpots.push({ x: z.x - 260, y: z.y - 60 }, { x: z.x + 260, y: z.y - 60 });
    this.groundShadow(z.x, z.y, 480, z.y);

    // the fox's two neglected requests, grouped around its hidden spot
    this.itemPair("bridge", "fv_fox_ice_damaged", "fv_fox_ice_restored", z.x - 260, z.y + 280, 240);
    this.itemPair("bridge", "fv_fox_signpost_damaged", "fv_fox_signpost_restored", z.x + 260, z.y + 240, 300);
  }

  /* ================= ZONE C: Restoration Grove ================= */

  private buildRestorationGrove(): void {
    const z = ZONES.grove;
    this.groveFountainPos = { x: z.x, y: z.y };
    // the fountain and the dead tree are the grove's two "neglected" landmarks —
    // both crossfade together the moment the deer is found (see revealZone)
    this.itemPair("grove", "fv_fountain_damaged", "fv_fountain_restored", z.x, z.y, 480);
    this.itemPair("grove", "fv_dead_tree", "fv_magic_tree_restored", z.x - 620, z.y + 80, 480);
    this.groundShadow(z.x, z.y, 440, z.y);

    // sparse accents only — this zone stays deliberately open until restored
    this.crystalTargets.push(this.propH("fv_crystal_b", z.x + 560, z.y + 40, 260, { flip: true }));
    this.treeSwayTargets.push(this.propH("fv_pine", z.x - 760, z.y - 380, 540));
    this.treeSwayTargets.push(this.propH("fv_pine_b", z.x + 780, z.y - 440, 520));
    this.propH("fv_blossom_tree", z.x + 1180, z.y - 140, 460);
    this.swayTargets.push(this.propH("fv_flower_pot", z.x - 280, z.y + 300, 230));
    this.swayTargets.push(this.propH("fv_crystal_flowers", z.x + 300, z.y + 320, 260));
    this.propH("fv_hedge", z.x - 1000, z.y + 220, 200);

    // the deer's neglected request, right next to its hidden spot
    this.itemPair("grove", "fv_deer_flower_damaged", "fv_deer_flower_restored", z.x - 460, z.y + 340, 200);
  }

  /* ================= ZONE D: Frozen Waterfall ================= */

  private buildWaterfallZone(): void {
    const z = ZONES.waterfall;
    this.propH("fv_waterfall", z.x, z.y, 740);
    this.propH("fv_waterfall_b", z.x + 680, z.y + 260, 360);
    this.propH("fv_ice_block", z.x - 480, z.y + 120, 260);
    this.propH("fv_riverbank", z.x - 120, z.y + 220, 380);
    this.treeSwayTargets.push(this.propH("fv_pine", z.x + 540, z.y - 200, 520));
    this.treeSwayTargets.push(this.propH("fv_pine_d", z.x - 620, z.y - 100, 560));
    // grouped around the smaller cascade's base, not floating loose in open snow
    this.swayTargets.push(this.propH("fv_flower_bush", z.x + 560, z.y + 300, 190));
    this.propH("fv_snowrock_a", z.x + 840, z.y + 330, 230);
    this.groundShadow(z.x, z.y, 520, z.y);

    // the squirrel's three neglected requests, grouped around its hidden spot
    this.itemPair("waterfall", "fv_squirrel_nest_damaged", "fv_squirrel_nest_restored", z.x - 700, z.y + 460, 460);
    this.itemPair("waterfall", "fv_squirrel_pool_damaged", "fv_squirrel_pool_restored", z.x - 340, z.y + 560, 230);
    this.itemPair("waterfall", "fv_squirrel_waterfall_damaged", "fv_squirrel_waterfall_restored", z.x - 620, z.y + 60, 420);
  }

  /* ================= ZONE E: Crystal Area ================= */

  private buildCrystalZone(): void {
    const z = ZONES.crystals;
    this.crystalTargets.push(this.propH("fv_crystal_a", z.x, z.y, 380));
    this.crystalTargets.push(this.propH("fv_crystal_b", z.x + 320, z.y + 60, 240));
    this.crystalTargets.push(this.propH("fv_crystal_c", z.x - 380, z.y + 180, 230));
    this.crystalTargets.push(this.propH("fv_crystal_d", z.x + 620, z.y + 240, 210));
    this.crystalTargets.push(this.propH("fv_crystal_e", z.x - 620, z.y - 60, 220));
    this.propH("fv_icicles", z.x - 280, z.y + 40, 220);
    this.treeSwayTargets.push(this.propH("fv_pine", z.x - 460, z.y - 240, 460, { tint: 0xd7e6f2 }));
    this.propH("fv_ice_gazebo", z.x + 880, z.y - 60, 480);
    this.lanternSpots.push({ x: z.x + 880, y: z.y - 300 });
    this.propH("fv_snowrock_b", z.x + 180, z.y + 380, 220);
    this.groundShadow(z.x, z.y, 340, z.y);

    // the polar bear's three neglected requests, grouped around its hidden spot
    this.itemPair("crystals", "fv_bear_crystal_damaged", "fv_bear_crystal_restored", z.x - 640, z.y + 60, 340);
    this.itemPair("crystals", "fv_bear_hole_damaged", "fv_bear_hole_restored", z.x - 340, z.y + 380, 200);
    this.itemPair("crystals", "fv_bear_cave_damaged", "fv_bear_cave_restored", z.x - 780, z.y + 420, 460);
  }

  /* ================= ZONE F: Frozen Shore ================= */

  private buildFrozenShore(): void {
    const z = ZONES.shore;
    this.treeSwayTargets.push(this.propH("fv_pine_b", z.x - 620, z.y - 180, 500));
    this.treeSwayTargets.push(this.propH("fv_pine_c", z.x + 640, z.y - 220, 540));
    this.propH("fv_bridge_b", z.x + 120, z.y - 80, 300);
    this.lanternSpots.push({ x: z.x + 120, y: z.y - 90 });
    this.swayTargets.push(this.propH("fv_flower_crystal_bouquet", z.x - 280, z.y + 220, 220));
    this.propH("fv_snowrock_a", z.x + 380, z.y + 260, 220);
    this.propH("fv_snowrock_b", z.x - 460, z.y + 300, 210);

    // the penguin's three neglected requests, grouped around its hidden spot
    this.itemPair("shore", "fv_penguin_igloo_damaged", "fv_penguin_igloo_restored", z.x + 340, z.y + 200, 360);
    this.itemPair("shore", "fv_penguin_iceberg_damaged", "fv_penguin_iceberg_restored", z.x - 320, z.y + 60, 280);
    this.itemPair("shore", "fv_penguin_slide_damaged", "fv_penguin_slide_restored", z.x + 20, z.y - 220, 460);
  }

  /* ================= animals — hidden as silhouettes until rescued ================= */

  private buildAnimals(): void {
    this.buildZoneAnimal("village", "fv_rabbit", ZONES.village.x + 260, ZONES.village.y + 190, 220, "Solve the Village puzzle to meet me!");
    this.buildZoneAnimal("bridge", "fv_fox", ZONES.bridge.x - 80, ZONES.bridge.y + 180, 210, "Solve the Bridge puzzle to meet me!");
    this.buildZoneAnimal("waterfall", "fv_squirrel", ZONES.waterfall.x - 320, ZONES.waterfall.y + 280, 190, "Solve the Waterfall puzzle to meet me!", { flip: true });
    this.buildZoneAnimal("grove", "fv_deer", ZONES.grove.x - 200, ZONES.grove.y + 280, 230, "Solve the Grove puzzle to meet me!");
    this.buildZoneAnimal("crystals", "fv_polarbear", ZONES.crystals.x - 350, ZONES.crystals.y + 230, 210, "Solve the Crystal puzzle to meet me!", { flip: true });
    this.buildZoneAnimal("shore", "fv_penguin", ZONES.shore.x, ZONES.shore.y + 180, 210, "Solve the Shore puzzle to meet me!");
  }

  /**
   * A not-yet-rescued animal: rendered as a solid black silhouette with a "?"
   * badge, matching the main Garden's own locked-animal presentation. This is
   * an INTENTIONAL gameplay state, not a placeholder for missing art — tapping
   * it shows a short hint, and `revealZone` plays the full rescue transition
   * (glow → particles → true-color reveal) once that zone's puzzle exists to
   * call it.
   */
  private buildZoneAnimal(
    zone: ZoneKey,
    key: string,
    x: number,
    y: number,
    targetHeight: number,
    hint: string,
    opts: { flip?: boolean } = {},
  ): void {
    const sprite = this.propH(key, x, y, targetHeight, { flip: opts.flip });
    sprite.setTintFill(0x0c0c14);
    this.idleTargets.push(sprite);

    const badge = this.add
      .text(x, y - targetHeight - 18, "?", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "20px",
        fontStyle: "700",
        color: "#fef6e8",
        backgroundColor: "#1c1a2e",
        padding: { x: 8, y: 4 },
      })
      .setOrigin(0.5)
      .setDepth(sprite.depth + 1);

    this.zoneAnimals[zone] = {
      sprite,
      badge,
      x,
      y,
      radius: Math.max(160, targetHeight),
      hint,
      revealed: false,
      normalKey: key,
      flip: !!opts.flip,
    };
  }

  /** A brief floating hint bubble above a tapped-but-locked animal. */
  private showHint(x: number, y: number, message: string): void {
    if (this.hintBusy) return;
    this.hintBusy = true;
    const bubble = this.add
      .text(x, y - 40, `🔒 ${message}`, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "17px",
        color: "#2a2038",
        backgroundColor: "#fef6e8",
        padding: { x: 14, y: 8 },
        align: "center",
        wordWrap: { width: 260 },
      })
      .setOrigin(0.5, 1)
      .setDepth(9800)
      .setAlpha(0);
    this.tweens.add({
      targets: bubble,
      alpha: 1,
      y: y - 60,
      duration: 220,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.time.delayedCall(1300, () => {
          this.tweens.add({
            targets: bubble,
            alpha: 0,
            duration: 260,
            onComplete: () => {
              bubble.destroy();
              this.hintBusy = false;
            },
          });
        });
      },
    });
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

    // occasional larger snowflake for subtle depth variation
    const bigEmitter = this.add.particles(0, 0, key, {
      x: { min: 0, max: this.scale.width },
      y: -10,
      lifespan: { min: 7000, max: 9000 },
      speedY: { min: 14, max: 26 },
      speedX: { min: -6, max: 6 },
      scale: { min: 1.6, max: 2.2 },
      alpha: { start: 0.5, end: 0.1 },
      frequency: 1400,
    });
    bigEmitter.setScrollFactor(0).setDepth(8000);
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
  }

  /** Soft, premium ambient life across the whole world — sway, glow, sparkle. */
  private startAmbientAnimation(): void {
    for (const t of this.swayTargets) {
      const baseRotation = t.rotation;
      this.tweens.add({
        targets: t,
        rotation: baseRotation + Phaser.Math.FloatBetween(0.03, 0.05) * (Math.random() < 0.5 ? -1 : 1),
        duration: 2200 + Math.random() * 900,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: Math.random() * 800,
      });
    }

    for (const t of this.treeSwayTargets) {
      const baseRotation = t.rotation;
      this.tweens.add({
        targets: t,
        rotation: baseRotation + Phaser.Math.FloatBetween(0.008, 0.015) * (Math.random() < 0.5 ? -1 : 1),
        duration: 3400 + Math.random() * 1400,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: Math.random() * 1200,
      });
    }

    for (const c of this.crystalTargets) {
      const baseScaleX = c.scaleX;
      const baseScaleY = c.scaleY;
      const baseY = c.y;
      this.tweens.add({
        targets: c,
        scaleX: baseScaleX * 1.035,
        scaleY: baseScaleY * 1.035,
        alpha: 0.88,
        duration: 1700 + Math.random() * 600,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: Math.random() * 900,
      });
      // a gentle floating bob, independent of the pulse above
      this.tweens.add({
        targets: c,
        y: baseY - 5,
        duration: 2000 + Math.random() * 400,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: Math.random() * 700,
      });
      this.time.addEvent({
        delay: 2600 + Math.random() * 2000,
        loop: true,
        callback: () => sparkleBurst(this, c.x, c.y - c.displayHeight * 0.55, 3, 26),
      });
    }

    for (const spot of this.lanternSpots) {
      const glow = this.add.image(spot.x, spot.y, "fv_glow_orb").setDepth(spot.y + 2).setScale(0.28).setAlpha(0.35).setTint(0xffd9a0);
      glow.setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({
        targets: glow,
        alpha: { from: 0.22, to: 0.5 },
        scale: { from: 0.24, to: 0.32 },
        duration: 1400 + Math.random() * 900,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: Math.random() * 900,
      });
    }

    // gentle chimney smoke — a lived-in, cozy touch on every roofline
    if (!this.textures.exists("fv_smoke_puff")) {
      const g = this.make.graphics({}, false);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(9, 9, 9);
      g.generateTexture("fv_smoke_puff", 18, 18);
      g.destroy();
    }
    for (const spot of this.chimneySpots) {
      this.time.addEvent({
        delay: 2200 + Math.random() * 1200,
        loop: true,
        callback: () => {
          const puff = this.add
            .image(spot.x + Phaser.Math.Between(-6, 6), spot.y, "fv_smoke_puff")
            .setDepth(spot.y + 3)
            .setScale(0.35)
            .setAlpha(0)
            .setTint(0xd8dee6);
          this.tweens.add({
            targets: puff,
            y: spot.y - 90,
            x: puff.x + Phaser.Math.Between(-20, 30),
            scale: 0.9,
            alpha: { from: 0, to: 0.45 },
            duration: 2600,
            ease: "Sine.easeOut",
            onComplete: () => this.tweens.add({ targets: puff, alpha: 0, duration: 500, onComplete: () => puff.destroy() }),
          });
        },
      });
    }

    // waterfall base mist/sparkle — a light touch of motion on the two cascades
    for (const wf of [ZONES.waterfall, { x: ZONES.waterfall.x + 680, y: ZONES.waterfall.y + 260 }]) {
      this.time.addEvent({
        delay: 900,
        loop: true,
        callback: () => {
          const mote = this.add.image(wf.x + Phaser.Math.Between(-40, 40), wf.y - 20, "fv_star_sparkle").setScale(0.05).setAlpha(0).setDepth(wf.y + 5);
          this.tweens.add({
            targets: mote,
            alpha: 0.7,
            y: mote.y - 30,
            duration: 900,
            ease: "Sine.easeOut",
            onComplete: () => this.tweens.add({ targets: mote, alpha: 0, duration: 400, onComplete: () => mote.destroy() }),
          });
        },
      });
    }

    // small expanding ripple rings where the waterfalls meet their pool
    if (!this.textures.exists("fv_ripple_ring")) {
      const g = this.make.graphics({}, false);
      g.lineStyle(3, 0xffffff, 1);
      g.strokeCircle(20, 20, 18);
      g.generateTexture("fv_ripple_ring", 40, 40);
      g.destroy();
    }
    for (const pool of [
      { x: ZONES.waterfall.x, y: ZONES.waterfall.y + 260 },
      { x: ZONES.waterfall.x + 680, y: ZONES.waterfall.y + 400 },
    ]) {
      this.time.addEvent({
        delay: 1300 + Math.random() * 500,
        loop: true,
        callback: () => {
          const ring = this.add
            .image(pool.x + Phaser.Math.Between(-30, 30), pool.y + Phaser.Math.Between(-16, 16), "fv_ripple_ring")
            .setDepth(pool.y + 4)
            .setScale(0.5)
            .setAlpha(0.8);
          this.tweens.add({
            targets: ring,
            scale: 1.3,
            alpha: 0,
            duration: 1400,
            ease: "Sine.easeOut",
            onComplete: () => ring.destroy(),
          });
        },
      });
    }

    // the recurring grove sparkle drift, kept from the original pass
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
    if (this.flowBusy) return;
    Sfx.unlock();

    for (const a of Object.values(this.zoneAnimals) as ZoneAnimalRec[]) {
      if (a.revealed) continue;
      if (Phaser.Math.Distance.Between(x, y, a.x, a.y - a.radius / 2) < a.radius) {
        Sfx.tap();
        this.showHint(a.x, a.y, a.hint);
        return;
      }
    }

    // the grove's fountain keeps its original tap-to-trigger interaction
    const d = Phaser.Math.Distance.Between(x, y, this.groveFountainPos.x, this.groveFountainPos.y - 40);
    if (d < 260 && !this.zoneAnimals.grove?.revealed) void this.revealZone("grove");
  }

  /**
   * The shared rescue/restoration sequence for any zone: the zone's hidden
   * animal crossfades from its black silhouette to its true colors, every
   * neglected landmark in that zone crossfades to its restored counterpart,
   * and a burst of glow/sparkle/petals sells the moment. Currently reachable
   * either by tapping the grove's fountain (the one reviewed interaction) or
   * via the `__dgFrostedValley.reveal(zone)` dev hook for every other zone —
   * both are stand-ins for the real per-zone puzzle/unlock call that doesn't
   * exist yet.
   */
  private async revealZone(zone: ZoneKey): Promise<void> {
    const rec = this.zoneAnimals[zone];
    if (!rec || rec.revealed) return;
    rec.revealed = true;

    this.cameras.main.shake(150, 0.0018);
    Sfx.sparkle();
    await wait(this, 200);

    const glow = await gatherGlow(this, rec.x, rec.y - rec.radius * 0.4, 620);
    sparkleBurst(this, rec.x, rec.y - rec.radius * 0.4, 22, 68);

    // crossfade the silhouette into a fresh true-color duplicate, then hand
    // idle-breathing off to it
    const reveal = this.add
      .image(rec.x, rec.y, rec.normalKey)
      .setOrigin(0.5, 1)
      .setScale(rec.sprite.scaleX, rec.sprite.scaleY)
      .setDepth(rec.sprite.depth)
      .setAlpha(0);
    if (rec.flip) reveal.setFlipX(true);

    this.tweens.add({ targets: rec.sprite, alpha: 0, duration: 420, ease: "Sine.easeIn" });
    this.tweens.add({
      targets: reveal,
      alpha: 1,
      duration: 520,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: reveal,
          scaleY: reveal.scaleY * 1.06,
          duration: 220,
          yoyo: true,
          repeat: 1,
          ease: "Sine.easeOut",
        });
      },
    });
    this.tweens.add({ targets: rec.badge, alpha: 0, duration: 260, onComplete: () => rec.badge.destroy() });

    const idleIdx = this.idleTargets.indexOf(rec.sprite);
    if (idleIdx >= 0) this.idleTargets[idleIdx] = reveal;
    this.tweens.add({
      targets: reveal,
      scaleY: reveal.scaleY * 1.04,
      duration: 1400 + Math.random() * 400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    Sfx.fanfare();
    petalPuff(this, rec.x, rec.y - rec.radius * 0.5, 14);

    // crossfade every neglected landmark that belongs to this zone
    for (const item of this.zoneItems[zone] ?? []) {
      this.tweens.add({ targets: item.damaged, alpha: 0, duration: 480, ease: "Sine.easeIn" });
      this.tweens.add({
        targets: item.restored,
        alpha: 1,
        duration: 620,
        ease: "Sine.easeOut",
        onComplete: () => {
          this.tweens.add({
            targets: item.restored,
            scaleY: item.restored.scaleY * 1.03,
            scaleX: item.restored.scaleX * 1.03,
            duration: 1400,
            yoyo: true,
            repeat: 1,
            ease: "Sine.easeInOut",
          });
        },
      });
    }

    await wait(this, 500);
    this.tweens.add({ targets: glow, alpha: 0, duration: 500, onComplete: () => glow.destroy() });
  }
}
