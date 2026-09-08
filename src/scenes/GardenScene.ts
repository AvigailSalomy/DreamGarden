import Phaser from "phaser";
import { HORIZON, START_FOCUS, WORLD_HEIGHT, WORLD_WIDTH } from "../game/config";
import { COLORS } from "../ui/theme";
import { makeIconButton } from "../ui/hit";
import { bus, progression, requests, save } from "../game/services";
import { CATALOG } from "../data/objects";
import { CameraController } from "../world/CameraController";
import { GardenObjectView } from "../world/GardenObjectView";
import { RegionOverlay, addDormantVeil } from "../world/RegionOverlay";
import type { RegionRect } from "../world/RegionOverlay";
import { IdleBehavior } from "../behavior/IdleBehavior";
import { RevealSequencer } from "../reveal/RevealSequencer";
import type { RevealHost } from "../reveal/types";
import { ambientFireflies, sparkleBurst } from "../fx/Particles";
import { Sfx } from "../fx/Sfx";
import type { GardenObjectDef } from "../data/types";
import type { UIScene } from "./UIScene";

/** Region rectangles (centre x/y + w/h) laid across the expanded world. */
const REGIONS: Record<string, RegionRect> = {
  animalMeadow: { id: "animalMeadow", x: 900, y: 1500, w: 760, h: 440 },
  cottageYard: { id: "cottageYard", x: 1600, y: 1300, w: 720, h: 420 },
  flowerBed: { id: "flowerBed", x: 350, y: 1620, w: 600, h: 440 },
  treeGrove: { id: "treeGrove", x: 2440, y: 1440, w: 720, h: 620 },
  farmCorner: { id: "farmCorner", x: 2660, y: 1000, w: 600, h: 420 },
  pondside: { id: "pondside", x: 1540, y: 1980, w: 760, h: 380 },
};

/** Regions with real bloomable content wired up in Milestone 3. */
const BLOOMABLE = new Set(["animalMeadow", "cottageYard", "flowerBed"]);
const WILDFLOWER_TINTS = [0xf3a9cf, 0xf5c24b, 0xb98be0];

/** Roughly the middle of all the playable garden — the wide opening frames on this. */
const GARDEN_CENTER = { x: 1500, y: 1520 };

/**
 * The one-time opening tour: begins on a WIDE view of the whole neglected garden,
 * then moves between the broken landmarks, and finally settles at the rabbit meadow.
 */
const TOUR: Array<{ x: number; y: number; zoom: number | "wide"; hold: number }> = [
  { x: GARDEN_CENTER.x, y: GARDEN_CENTER.y, zoom: "wide", hold: 1400 }, // whole garden
  { x: 1560, y: 940, zoom: 0.95, hold: 520 }, // dormant Garden Heart
  { x: 2500, y: 1240, zoom: 0.9, hold: 520 }, // dead Great Oak
  { x: 1540, y: 1960, zoom: 0.9, hold: 520 }, // broken / dry Pond
  { x: 470, y: 1600, zoom: 0.95, hold: 520 }, // collapsed Wildflowers
  { x: 1760, y: 1150, zoom: 1.0, hold: 520 }, // empty Songbird perch
  { x: START_FOCUS.x, y: START_FOCUS.y, zoom: 1.0, hold: 300 }, // Rabbit meadow
];

const wait = (scene: Phaser.Scene, ms: number) =>
  new Promise<void>((res) => scene.time.delayedCall(ms, res));

export class GardenScene extends Phaser.Scene implements RevealHost {
  camera!: CameraController;
  private reveal!: RevealSequencer;

  private views = new Map<string, GardenObjectView>();
  private idles = new Map<string, IdleBehavior>();
  private regions = new Map<string, RegionOverlay>();

  private screenObjects: Phaser.GameObjects.Image[] = [];
  private taskGlow?: Phaser.GameObjects.Image;
  private taskGhost?: Phaser.GameObjects.Image;
  private taskFootprint?: Phaser.GameObjects.Graphics;
  private pendingUnlockId: string | null = null;
  private pendingWorldEffects: Array<{ objectId: string; requestId: string }> = [];
  private offFns: Array<() => void> = [];
  private flowBusy = false;
  private letterUp = false;
  private tourSkipped = false;
  private skipBtn?: Phaser.GameObjects.Container;

  constructor() {
    super("Garden");
  }

  get phaserScene(): Phaser.Scene {
    return this;
  }

  private get ui(): UIScene {
    return this.scene.get("UI") as UIScene;
  }

  create(): void {
    this.buildSky();
    this.buildGround();
    this.buildProps();
    this.buildRegions();
    this.buildForeground();
    this.layoutScreen();

    this.camera = new CameraController(this, { w: WORLD_WIDTH, h: WORLD_HEIGHT });
    if (!save.state.openingGardenTourSeen) {
      // fresh game: first impression is the WHOLE neglected garden
      this.camera.frameWide(GARDEN_CENTER.x, GARDEN_CENTER.y);
    } else {
      this.cameras.main.setZoom(1);
      this.cameras.main.centerOn(START_FOCUS.x, START_FOCUS.y);
    }
    this.camera.onTap = (x, y) => this.handleTap(x, y);

    this.reveal = new RevealSequencer(this);

    this.spawnSavedObjects();
    this.applyPurchasedWorldEffectsInstant();
    this.updateTaskMarker();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.wireEvents();
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.flushWorldEffects());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());

    this.time.delayedCall(80, () => this.beginEntryFlow());

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__dgCam = () => ({
        zoom: this.cameras.main.zoom,
        scrollX: this.cameras.main.scrollX,
        scrollY: this.cameras.main.scrollY,
      });
      (window as unknown as Record<string, unknown>).__dgFlow = () => ({
        busy: this.flowBusy,
        letterUp: this.letterUp,
        task: progression.currentTask?.id ?? null,
        tourSeen: save.state.openingGardenTourSeen,
        unlocked: progression.unlockedObjects().map((o) => o.id),
      });
      (window as unknown as Record<string, unknown>).__dgSkipTour = () => {
        this.tourSkipped = true;
      };
    }
  }

  update(): void {
    for (const v of this.views.values()) v.setDepthFromY();
  }

  private onResize(): void {
    this.layoutScreen();
    this.camera?.onResize();
  }

  private layoutScreen(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    for (const o of this.screenObjects) o.setDisplaySize(w, h);
  }

  /* ---------------- entry flow ---------------- */

  private beginEntryFlow(): void {
    const task = progression.currentTask;

    if (!save.state.openingGardenTourSeen) {
      void this.runOpeningCinematic();
      return;
    }
    if (task && !progression.isUnlocked(task.id) && !save.state.lettersSeen[task.id]) {
      void this.presentLetterThenActivate(task.id);
      return;
    }
    // plain continue
    this.camera.enable();
    this.ui.setRevealing(false);
    this.ui.setTaskFromProgression();
    this.ui.showCard();
  }

  private async runOpeningCinematic(): Promise<void> {
    this.flowBusy = true;
    this.camera.disable();
    this.ui.setRevealing(true);
    this.showSkip(() => {
      this.tourSkipped = true;
    });

    await this.playTour();
    this.hideSkip();

    save.state.openingGardenTourSeen = true;
    save.saveNow();

    const first = progression.currentTask;
    if (first) await this.presentLetterThenActivate(first.id);
    else {
      this.camera.enable();
      this.ui.setRevealing(false);
      this.ui.setTaskFromProgression();
      this.ui.showCard();
    }
    this.flowBusy = false;
  }

  private async playTour(): Promise<void> {
    for (const stop of TOUR) {
      if (this.tourSkipped) break;
      const z = stop.zoom === "wide" ? this.camera.minZoomValue : stop.zoom;
      await this.camera.focusOn(stop.x, stop.y, 760, z);
      await wait(this, stop.hold);
    }
    // always settle on the meadow at a comfortable inspect zoom
    await this.camera.focusOn(START_FOCUS.x, START_FOCUS.y, this.tourSkipped ? 500 : 760, 1);
  }

  /**
   * Launch the Requests screen for `objectId`, pausing Garden underneath — same
   * overlay contract as Puzzle/Letter. Unguarded (unlike the `requests:open` bus
   * handler) so it's safe to call from inside an already-`flowBusy` async chain.
   */
  private openRequestsScreen(objectId: string): void {
    this.camera.disable();
    this.scene.launch("Requests", { objectId });
    this.scene.pause();
  }

  /** Guide the camera to a restoration's area, present its letter, then hand back control. */
  private async presentLetterThenActivate(objectId: string): Promise<void> {
    const def = progression.def(objectId);
    if (!def || progression.isUnlocked(objectId)) {
      this.camera.enable();
      this.ui.setRevealing(false);
      this.ui.setTaskFromProgression();
      this.ui.showCard();
      return;
    }

    await this.camera.focusOn(def.garden_position.x, def.garden_position.y - 40, 720, 1);
    await wait(this, 140);

    // guarantee a fresh Letter instance every time
    if (this.scene.isActive("Letter") || this.scene.isSleeping("Letter")) {
      this.scene.stop("Letter");
      await wait(this, 40);
    }
    this.letterUp = true;
    this.scene.launch("Letter", { objectId });
    await new Promise<void>((res) => {
      const off = bus.on("letter:done", (p) => {
        if (p.objectId === objectId) {
          off();
          res();
        }
      });
    });
    this.letterUp = false;

    this.updateTaskMarker();
    if (!requests.isComplete(objectId)) {
      // the new core loop: letter -> Requests screen, before the puzzle is ever reachable
      this.openRequestsScreen(objectId);
      return;
    }
    this.camera.enable();
    this.ui.setRevealing(false);
    this.ui.setTaskFromProgression();
    this.ui.showCard();
  }

  /**
   * Reusable post-stage flow: (save already committed) → short overview line →
   * camera pulls back → guides to the next restoration → its letter → hand back.
   * After the final restoration it drifts across the whole garden, then stops.
   */
  private async runPostStage(revealed: GardenObjectDef): Promise<void> {
    await wait(this, 500);
    if (revealed.overview_text) this.toast(revealed.overview_text);
    await wait(this, 1100);

    const next = progression.currentTask;
    if (next && !progression.isUnlocked(next.id)) {
      const from = revealed.garden_position;
      const to = next.garden_position;
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 30 };
      await this.camera.focusOn(mid.x, mid.y, 900, 0.9);
      await wait(this, 420);
      await this.presentLetterThenActivate(next.id);
      return;
    }

    // garden complete — a slow look around, then stop (no further gameplay)
    await this.camera.focusOn(1500, 1560, 1500, 0.9);
    await wait(this, 300);
    this.camera.enable();
    this.ui.setRevealing(false);
    this.ui.setTaskFromProgression();
    this.ui.showCard();
  }

  private showSkip(onSkip: () => void): void {
    const btn = makeIconButton(
      this,
      this.scale.width - 62,
      44,
      "Skip ›",
      20,
      () => {
        Sfx.tap();
        onSkip();
      },
      { color: "#fef6e8", hitW: 112, hitH: 54 },
    );
    btn.setScrollFactor(0).setDepth(9000);
    this.skipBtn = btn;
  }

  private hideSkip(): void {
    this.registry.set("pointerOnUI", false);
    this.skipBtn?.destroy();
    this.skipBtn = undefined;
  }

  /* ---------------- world building ---------------- */

  private buildSky(): void {
    const sky = this.add.image(0, 0, "sky").setOrigin(0, 0).setScrollFactor(0).setDepth(-1000);
    this.screenObjects.push(sky);

    this.add.image(300, 180, "clouds").setOrigin(0, 0).setScrollFactor(0.1).setDepth(-900).setAlpha(0.9);
    this.add.image(1400, 90, "clouds").setOrigin(0, 0).setScrollFactor(0.16).setDepth(-900).setScale(0.85).setAlpha(0.65);
    this.add.image(2400, 220, "clouds").setOrigin(0, 0).setScrollFactor(0.13).setDepth(-900).setScale(0.7).setAlpha(0.6);

    this.add.image(-160, HORIZON + 70, "hills_far").setOrigin(0, 1).setScrollFactor(0.32).setDepth(-820).setScale(1.5);
    this.add.image(-220, HORIZON + 110, "hills_near").setOrigin(0, 1).setScrollFactor(0.5).setDepth(-780).setScale(1.5);
  }

  private buildGround(): void {
    const g = this.add.graphics().setDepth(-200);
    g.fillStyle(COLORS.grassDull, 1);
    g.fillRect(0, HORIZON - 4, WORLD_WIDTH, WORLD_HEIGHT - HORIZON + 4);

    this.add
      .tileSprite(0, HORIZON, WORLD_WIDTH, WORLD_HEIGHT - HORIZON, "grass_tile")
      .setOrigin(0, 0)
      .setDepth(-190);

    const blend = this.add.graphics().setDepth(-185);
    blend.fillGradientStyle(
      COLORS.grassDull,
      COLORS.grassDull,
      COLORS.grassDull,
      COLORS.grassDull,
      0,
      0,
      1,
      1,
    );
    blend.fillRect(0, HORIZON - 110, WORLD_WIDTH, 150);

    this.add
      .image(1560, WORLD_HEIGHT + 10, "path")
      .setOrigin(0.5, 1)
      .setScale(1.6)
      .setDepth(-120)
      .setAlpha(0.95);
  }

  private prop(key: string, x: number, y: number, scale = 1, shadowW = 0): Phaser.GameObjects.Image {
    if (shadowW > 0) {
      this.add
        .image(x, y + 2, "shadow")
        .setOrigin(0.5, 0.5)
        .setDisplaySize(shadowW, shadowW * 0.32)
        .setAlpha(0.4)
        .setDepth(y - 1);
    }
    return this.add.image(x, y, key).setOrigin(0.5, 1).setScale(scale).setDepth(y);
  }

  private sign(x: number, y: number): void {
    this.prop("signpost", x, y, 0.95, 90);
  }

  private tree(
    key: string,
    x: number,
    y: number,
    scale: number,
    o: { depth?: number; tint?: number; alpha?: number; scroll?: number } = {},
  ): void {
    const img = this.add.image(x, y, key).setOrigin(0.5, 1).setScale(scale);
    img.setDepth(o.depth ?? y);
    if (o.tint !== undefined) img.setTint(o.tint);
    if (o.alpha !== undefined) img.setAlpha(o.alpha);
    if (o.scroll !== undefined) img.setScrollFactor(o.scroll);
  }

  /** A cozy woodland framing the clearing — layered for depth, never over gameplay. */
  private buildTrees(): void {
    const kinds = ["tree", "tree_tall", "tree_pine"];

    // 1. hazy far tree line across the back of the whole garden
    for (let i = 0; i < 10; i++) {
      const x = 120 + i * 330 + (i % 2) * 60;
      this.tree(kinds[i % 3], x, 740 + (i % 3) * 24, 0.7 + (i % 2) * 0.12, {
        depth: -150,
        tint: 0xb7c6d2,
        alpha: 0.95,
        scroll: 0.92,
      });
    }

    // 2. mid trees in clusters (normal y-sorted depth, full colour)
    const mid: Array<[string, number, number, number]> = [
      // behind the cottage / heart (above the bird perch, clear of the arch)
      ["tree_tall", 1330, 1070, 0.95],
      ["tree", 1820, 1050, 0.9],
      ["tree_pine", 2010, 1120, 0.9],
      // flower-bed left frame (clear of the wildflower planter at x470)
      ["tree", 110, 1560, 0.9],
      ["tree_tall", 40, 1740, 0.95],
      // tree grove around the dead oak
      ["tree", 2700, 1540, 1.0],
      ["tree_pine", 2880, 1440, 0.95],
      ["tree_tall", 2250, 1360, 0.85],
      // pondside framing
      ["tree", 1160, 1900, 0.95],
      ["tree_tall", 1940, 1880, 0.9],
      // far side of the meadow
      ["tree", 560, 1340, 0.85],
    ];
    for (const [k, x, y, s] of mid) this.tree(k, x, y, s);

    // 3. dark foreground framing at the world edges (only seen when panned there)
    this.tree("tree_fg", -70, 1420, 1.35, { depth: 7200, scroll: 1 });
    this.tree("tree_fg", 3270, 1470, 1.35, { depth: 7200, scroll: 1 });
  }

  private buildProps(): void {
    this.buildTrees();

    // ---- neglected landmark: Garden Heart (future) ----
    this.prop("heart_dormant", 1560, 980, 1.15, 150);

    // ---- archway + cottage-yard fence (the songbird perch) ----
    this.prop("arch", 1560, 1170, 1.25);
    for (let i = 0; i < 6; i++) this.prop("fence", 1150 + i * 300, 1290 + (i % 2) * 6, 1.0);
    for (let i = 0; i < 3; i++) this.prop("fence", 2560 + i * 20, 1180 - i * 150, 0.8);

    // ---- animal meadow (rabbit) ----
    this.prop("dead_shrub", 640, 1440, 1.0, 150);
    this.prop("weeds", 820, 1560, 1.1);
    this.prop("weeds", 1000, 1440, 0.9);
    this.prop("weeds", 1120, 1560, 0.85);
    this.prop("rock", 560, 1620, 1.0, 150);

    // ---- flower bed (Wildflowers) ----
    // The Wildflowers object sprite (wildflower_bed) at (470,1652) IS the planter —
    // flowers grow from its own soil. No extra planter props here, so the bed never
    // looks duplicated or like loose flowers sitting outside a pot.
    this.prop("weeds", 300, 1520, 0.8);
    this.prop("rock", 690, 1660, 0.8, 120);
    this.sign(120, 1600);

    // ---- tree grove (future: the dead Great Oak) ----
    this.prop("oak_dead", 2500, 1460, 1.2, 220);
    this.prop("stump", 2140, 1420, 1.15, 160);
    this.prop("sapling", 2320, 1440, 1.0, 90);
    this.prop("sapling", 2260, 1600, 0.9, 80);
    this.prop("rock", 2660, 1620, 1.1, 170);
    this.sign(2060, 1520);

    // ---- farm corner (future) ----
    this.prop("crate", 2560, 980, 1.0, 180);
    this.prop("crate", 2740, 1040, 0.9, 160);
    this.prop("weeds", 2660, 1080, 0.85);
    this.sign(2860, 1020);

    // ---- pondside (future) ----
    this.prop("pond_dry", 1540, 1980, 1.4);
    this.prop("rock", 1240, 1980, 1.1, 180);
    this.prop("rock", 1860, 1960, 0.9, 150);
    this.prop("weeds", 1420, 2040, 0.8);
    this.sign(1120, 1900);
  }

  private buildRegions(): void {
    const unlockedRegions = new Set(progression.unlockedObjects().map((o) => o.region));

    for (const key of Object.keys(REGIONS)) {
      const rect = REGIONS[key];
      if (BLOOMABLE.has(key)) {
        // the flower bed's bloom lives in its planter sprite, not scattered on the lawn
        const opts =
          key === "flowerBed"
            ? { flowerCount: 0, flowerTints: WILDFLOWER_TINTS }
            : undefined;
        const ov = new RegionOverlay(this, rect, hashRegion(key), opts);
        this.regions.set(key, ov);
        if (unlockedRegions.has(rect.id)) ov.applyRestoredInstant();
      } else {
        addDormantVeil(this, rect);
      }
    }

    const alive = progression.unlockedObjects().length;
    ambientFireflies(
      this,
      new Phaser.Geom.Rectangle(REGIONS.animalMeadow.x - 420, REGIONS.animalMeadow.y - 320, 1600, 680),
      alive > 0 ? 18 : 7,
    );
  }

  private buildForeground(): void {
    const v = this.add.image(0, 0, "vignette").setOrigin(0, 0).setScrollFactor(0).setDepth(8000);
    this.screenObjects.push(v);
  }

  /* ---------------- objects ---------------- */

  private spawnSavedObjects(): void {
    for (const def of progression.unlockedObjects()) {
      const view = this.spawnObjectView(def, false);
      view.setGroundPosition(def.garden_position.x, def.garden_position.y);
      this.attachIdle(view, def);
    }
  }

  /* ---------------- requests world effects ---------------- */

  /** Reload correctness: place every already-purchased request's prop instantly, no animation. */
  private applyPurchasedWorldEffectsInstant(): void {
    for (const def of CATALOG) {
      for (const requestId of requests.purchasedIds(def.id)) {
        this.spawnWorldEffect(def.id, requestId, false);
      }
    }
  }

  private spawnWorldEffect(objectId: string, requestId: string, animate: boolean): void {
    const def = progression.def(objectId);
    const req = def?.requests.find((r) => r.id === requestId);
    if (!def || !req) return;

    const x = def.garden_position.x + req.worldOffset.x;
    const y = def.garden_position.y + req.worldOffset.y;
    const scale = req.worldScale ?? 1;
    const img = this.add
      .image(x, y, req.worldSprite)
      .setOrigin(0.5, 1)
      .setScale(scale)
      .setDepth(y);

    if (!animate) return;

    img.setScale(0).setAlpha(0);
    this.tweens.add({
      targets: img,
      scale,
      alpha: 1,
      duration: 420,
      ease: "Back.easeOut",
    });
    sparkleBurst(this, x, y - 20, 14, 44);
    Sfx.sparkle();
  }

  /** Queued while paused (Requests screen open); applied with animation once we regain control. */
  private flushWorldEffects(): void {
    if (!this.pendingWorldEffects.length) return;
    const queued = this.pendingWorldEffects;
    this.pendingWorldEffects = [];
    for (const { objectId, requestId } of queued) this.spawnWorldEffect(objectId, requestId, true);
  }

  spawnObjectView(def: GardenObjectDef, startHidden: boolean): GardenObjectView {
    let view = this.views.get(def.id);
    if (!view) {
      view = new GardenObjectView(this, def.garden_position.x, def.garden_position.y, {
        texture: def.garden_sprite,
        scale: def.garden_scale,
        shadowWidth: def.category === "plant" ? 200 : def.category === "animal" ? 140 : 160,
      });
      this.views.set(def.id, view);
    }
    view.container.setVisible(!startHidden);
    view.setDepthFromY();
    return view;
  }

  attachIdle(view: GardenObjectView, def: GardenObjectDef): void {
    if (this.idles.has(def.id)) return;
    const bounds =
      def.movement_bounds ?? {
        shape: "rect" as const,
        x: def.garden_position.x,
        y: def.garden_position.y,
        w: 320,
        h: 200,
      };
    const idle = new IdleBehavior(this, view, bounds, def.idle_behavior);
    idle.start();
    this.idles.set(def.id, idle);
  }

  getRegionOverlay(region: string): RegionOverlay | undefined {
    return this.regions.get(region);
  }

  /* ---------------- task marker (ghost / footprint) ---------------- */

  private updateTaskMarker(): void {
    const task = progression.currentTask;
    this.taskGlow?.destroy();
    this.taskGhost?.destroy();
    this.taskFootprint?.destroy();
    this.taskGlow = undefined;
    this.taskGhost = undefined;
    this.taskFootprint = undefined;
    if (!task || progression.isUnlocked(task.id)) return;

    const { x, y } = task.garden_position;

    // THE silhouette: the exact final sprite — same key, position, scale, origin,
    // orientation (no flip, no rotation) — rendered as a dark placeholder. When the
    // real object arrives it lands in precisely this footprint. Only a gentle alpha
    // breath animates; the transform never moves, so alignment is exact.
    // same depth rule the revealed GardenObjectView uses (1000 + groundY), so the
    // silhouette sits on the correct layer — in front of the fence for the perched
    // bird, etc. — and the real sprite lands in precisely this footprint.
    const depth = 1000 + y;
    const ghost = this.add
      .image(x, y, task.garden_sprite)
      .setOrigin(0.5, 1)
      .setScale(task.garden_scale)
      .setFlipX(false)
      .setAngle(0)
      .setDepth(depth - 0.5)
      .setTint(0x3f3550)
      .setAlpha(0.34);
    this.taskGhost = ghost;
    this.tweens.add({
      targets: ghost,
      alpha: 0.46,
      duration: 1700,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    const gw = ghost.displayWidth;
    const gh = ghost.displayHeight;

    // SECONDARY ambient feedback only — a soft glow behind the silhouette
    const glow = this.add
      .image(x, y - gh * 0.5, "glow")
      .setDepth(depth - 1)
      .setScale(Phaser.Math.Clamp(gw / 340, 0.5, 1.4))
      .setAlpha(0.16)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.taskGlow = glow;
    this.tweens.add({
      targets: glow,
      alpha: 0.28,
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  /** Fade the silhouette out beneath the arriving object (RevealHost). */
  fadeTaskGhost(): void {
    const targets = [this.taskGhost, this.taskGlow, this.taskFootprint].filter(Boolean);
    if (!targets.length) return;
    this.tweens.add({
      targets,
      alpha: 0,
      duration: 420,
      ease: "Sine.easeIn",
    });
  }

  private handleTap(x: number, y: number): void {
    Sfx.unlock();
    const task = progression.currentTask;
    if (task && !progression.isUnlocked(task.id) && !this.reveal.isRunning && !this.flowBusy) {
      const d = Phaser.Math.Distance.Between(x, y, task.garden_position.x, task.garden_position.y);
      if (d < 200) this.ui.nudgePlay();
    }
  }

  /* ---------------- RevealHost extras ---------------- */

  playCoinGain(worldX: number, worldY: number, amount: number): Promise<void> {
    return this.ui.playCoinGain(this.cameras.main, worldX, worldY, amount);
  }

  refreshTaskCard(): void {
    this.updateTaskMarker();
    this.ui.setTaskFromProgression();
  }

  toast(text: string): void {
    this.ui.showToast(text);
  }

  /* ---------------- flow wiring ---------------- */

  private wireEvents(): void {
    this.offFns.push(
      bus.on("puzzle:start", ({ objectId }) => {
        if (this.reveal.isRunning || this.flowBusy) return;
        this.camera.disable();
        this.scene.launch("Puzzle", { objectId });
        this.scene.pause();
      }),
    );

    this.offFns.push(
      bus.on("requests:open", ({ objectId }) => {
        if (this.reveal.isRunning || this.flowBusy) return;
        this.openRequestsScreen(objectId);
      }),
    );

    this.offFns.push(
      bus.on("requests:closed", () => {
        this.camera.enable();
        this.ui.setTaskFromProgression();
        this.ui.showCard();
      }),
    );

    this.offFns.push(
      bus.on("request:purchased", (p) => {
        // Garden may be paused (Requests screen open) — queue, apply+animate on resume.
        this.pendingWorldEffects.push(p);
      }),
    );

    this.offFns.push(
      bus.on("object:unlock", ({ objectId }) => {
        this.pendingUnlockId = objectId;
      }),
    );

    this.offFns.push(
      bus.on("puzzle:closed", ({ solved }) => {
        this.ui.setRevealing(!!this.pendingUnlockId);
        if (this.pendingUnlockId) {
          const def = progression.def(this.pendingUnlockId);
          this.pendingUnlockId = null;
          if (def) {
            this.flowBusy = true;
            void (async () => {
              await this.reveal.play(def);
              await this.runPostStage(def);
              this.flowBusy = false;
              bus.emit("reveal:done", { objectId: def.id });
            })();
            return;
          }
        }
        this.camera.enable();
        this.ui.setRevealing(false);
        if (solved) this.updateTaskMarker();
        this.ui.setTaskFromProgression();
        this.ui.showCard();
      }),
    );
  }

  private teardown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.offFns.forEach((fn) => fn());
    this.offFns = [];
    this.idles.forEach((i) => i.stop());
    this.idles.clear();
    this.views.clear();
    this.regions.clear();
    this.screenObjects = [];
  }
}

function hashRegion(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
