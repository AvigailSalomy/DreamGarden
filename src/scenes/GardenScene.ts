import Phaser from "phaser";
import { HORIZON, START_FOCUS, WORLD_HEIGHT, WORLD_WIDTH } from "../game/config";
import { COLORS } from "../ui/theme";
import { makeIconButton } from "../ui/hit";
import { bus, progression, requests, save } from "../game/services";
import { CATALOG } from "../data/objects";
import { CameraController } from "../world/CameraController";
import { GardenObjectView } from "../world/GardenObjectView";
import { RegionOverlay } from "../world/RegionOverlay";
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
    // every entry starts on the WHOLE neglected garden — first impression of scale
    // and what's broken — then either the long first-time tour or the short
    // `playEntryZoomReveal()` below eases it into the normal gameplay framing.
    this.camera.frameWide(GARDEN_CENTER.x, GARDEN_CENTER.y);
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
      (window as unknown as Record<string, unknown>).__dgReveal = (objectId: string) => {
        const def = progression.def(objectId);
        return def ? this.reveal.play(def) : Promise.reject(new Error("unknown object"));
      };
    }
  }

  update(): void {
    for (const v of this.views.values()) v.setDepthFromY();
  }

  private onResize(): void {
    this.layoutScreen();
    this.camera?.onResize();
    this.positionForegroundFraming();
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

    // Every other real session start: a short "wow, look at all of this" wide
    // reveal, then ease into whatever this entry would normally do. This never
    // replays on returning from a paused minigame/modal — GardenScene.create()
    // (and therefore beginEntryFlow) only runs once per app session.
    void this.playEntryZoomReveal().then(() => {
      if (task && !progression.isUnlocked(task.id) && !save.state.lettersSeen[task.id]) {
        void this.presentLetterThenActivate(task.id);
        return;
      }
      // plain continue
      this.camera.enable();
      this.ui.setRevealing(false);
      this.ui.setTaskFromProgression();
      this.ui.showCard();
    });
  }

  /**
   * The compact entry cinematic for every session after the very first: hold the
   * wide "whole neglected garden" framing (already set in `create()`) for a beat,
   * then smoothly pull in to the normal gameplay position/zoom. HUD chrome fades
   * out for the hold and fades back in once we've arrived. No instant zoom snap —
   * the whole thing rides `CameraController.focusOn`'s eased pan+zoom tween, and
   * `frameWide`/`focusOn` already clamp to the world bounds so nothing empty shows.
   */
  private async playEntryZoomReveal(): Promise<void> {
    this.camera.disable();
    this.ui.setRevealing(true);
    this.ui.setHudVisible(false);

    await wait(this, 1200); // "wow — this whole place is damaged" (spec: ~1.0–1.5s)
    await this.camera.focusOn(START_FOCUS.x, START_FOCUS.y, 1600, 1); // "...let's start fixing it" (~1.2–1.8s)

    this.ui.setHudVisible(true);
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
    this.refreshPond(true);
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

    // The supplied painted ground reference as the actual terrain, not a flat
    // fill or a re-drawn SVG. It doesn't tile perfectly seamlessly on its own
    // (checked: ~20/255 edge mismatch), so it's laid as a small grid of large
    // panels with alternating mirror flips — the standard trick for hiding a
    // texture's seams (a flipped repeat reads as a continuation, not a jump-cut)
    // — and every seam additionally falls under a prop cluster from buildProps().
    const tileW = 1650;
    const tileH = 1100;
    for (let row = 0; row * tileH < WORLD_HEIGHT - HORIZON + tileH; row++) {
      for (let col = 0; col * tileW < WORLD_WIDTH; col++) {
        this.add
          .image(col * tileW, HORIZON + row * tileH, "dg_grass_ground")
          .setOrigin(0, 0)
          .setDisplaySize(tileW, tileH)
          .setFlipX(col % 2 === 1)
          .setFlipY(row % 2 === 1)
          .setDepth(-195);
      }
    }

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

  /**
   * Same contract as `prop()`, for the production PNGs (`dg_` prefix): these were
   * normalized to a max side of ~1100px by the asset pipeline, not hand-sized like
   * the old flat SVGs, so callers pass an absolute scale tuned per asset rather
   * than reusing the SVGs' native-size-relative scale numbers.
   */
  private dprop(key: string, x: number, y: number, scale: number, shadowW = 0): Phaser.GameObjects.Image {
    return this.prop(`dg_${key.split("/").pop()}`, x, y, scale, shadowW);
  }

  /** A small, purely decorative, non-interactive creature — atmosphere only, no
   *  progression/economy tie. A gentle idle bob is its only behaviour. */
  private critter(key: string, x: number, y: number, scale: number, flip = false): void {
    const img = this.add
      .image(x, y, `dg_${key.split("/").pop()}`)
      .setOrigin(0.5, 1)
      .setScale(scale)
      .setFlipX(flip)
      .setDepth(y);
    this.add
      .image(x, y + 3, "shadow")
      .setDisplaySize(scale * 340, scale * 110)
      .setAlpha(0.3)
      .setDepth(y - 1);
    this.tweens.add({
      targets: img,
      y: y - 6,
      duration: 1600 + Phaser.Math.Between(-200, 400),
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
      delay: Phaser.Math.Between(0, 800),
    });
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

  /**
   * Production-art tree kinds, each carrying its own base scale so the world's
   * hand-tuned x/y layout (and per-instance size *factor* below) survives the
   * swap from the old flat SVGs to the much larger production PNGs untouched.
   */
  private static readonly TREE_KIND: Record<string, { tex: string; base: number }> = {
    tree: { tex: "dg_tree_medium_01", base: 0.36 },
    tree_tall: { tex: "dg_tree_tall_01", base: 0.42 },
    tree_pine: { tex: "dg_tree_large_01", base: 0.38 },
    tree_pink: { tex: "dg_tree_pink_01", base: 0.4 },
    tree_far: { tex: "dg_tree_small_01", base: 0.3 },
  };

  private treeOfKind(
    kind: string,
    x: number,
    y: number,
    factor: number,
    o: { depth?: number; tint?: number; alpha?: number; scroll?: number } = {},
  ): void {
    const k = GardenScene.TREE_KIND[kind];
    this.tree(k.tex, x, y, k.base * factor, o);
  }

  /** A cozy woodland framing the clearing — layered for depth, never over gameplay. */
  private buildTrees(): void {
    const farKinds = ["tree_far", "tree", "tree_pink"];

    // 1. hazy far tree line across the back of the whole garden
    for (let i = 0; i < 10; i++) {
      const x = 120 + i * 330 + (i % 2) * 60;
      this.treeOfKind(farKinds[i % 3], x, 740 + (i % 3) * 24, 0.7 + (i % 2) * 0.12, {
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
      ["tree_pink", 110, 1560, 0.95],
      ["tree_tall", 40, 1740, 0.95],
      // tree grove around the dead oak
      ["tree", 2700, 1540, 1.0],
      ["tree_pine", 2880, 1440, 0.95],
      ["tree_tall", 2250, 1360, 0.85],
      // pondside framing
      ["tree", 1160, 1900, 0.95],
      ["tree_tall", 1940, 1880, 0.9],
      // far side of the meadow
      ["tree_pink", 560, 1340, 0.9],
    ];
    for (const [k, x, y, s] of mid) this.treeOfKind(k, x, y, s);

    // an always-lush hero tree — no damaged counterpart was supplied for this one,
    // so it isn't gated behind any restoration (that would be inventing a mechanic);
    // it's simply a magical highlight standing in the already-alive meadow.
    this.add
      .image(700, 1300, "dg_magic_tree_restored")
      .setOrigin(0.5, 1)
      .setScale(0.5)
      .setDepth(1300);

    // 3. dark foreground framing at the world edges (only seen when panned there)
    this.treeOfKind("tree_pine", -70, 1420, 2.4, { depth: 7200, scroll: 1 });
    this.treeOfKind("tree_pine", 3270, 1470, 2.4, { depth: 7200, scroll: 1 });
  }

  /**
   * World flow (see the world-composition pass): ENTRANCE (animalMeadow) →
   * DORMANT AREA (flowerBed) / COTTAGE GARDEN (cottageYard) → MAGIC TREE GROVE
   * (treeGrove) → FOUNTAIN + WATER/BRIDGE (pondside, one clearing) → LOCKED
   * AREA (farmCorner). One winding path asset, repeated at a few rotations,
   * threads the main destinations together rather than sitting disconnected.
   */
  private buildProps(): void {
    this.buildTrees();
    this.buildPaths();

    // ---- neglected landmark: Garden Heart (future) ----
    this.prop("heart_dormant", 1560, 980, 1.15, 150);
    this.dprop("nature/rock_small_01", 1440, 1010, 0.15, 110);
    this.dprop("vegetation/fern_01", 1660, 1000, 0.14);

    // ---- cottage garden (the songbird's cottage yard) ----
    // One destination, one purpose each: arch marks the entrance, a short
    // gapped fence marks the yard boundary (not a wall), the cottage is given
    // its own clearing, and each small object sits at the spot that gives it
    // a reason to be there.
    this.dprop("vegetation/flower_arch_01", 1560, 1170, 0.62); // entrance, on the path from the meadow
    for (const [x, y, s] of [
      [1420, 1300, 0.34],
      [1660, 1280, 0.3],
    ] as const)
      this.dprop("decor/fence_01", x, y, s); // yard boundary either side of the arch — not a wall
    this.dprop("structures/cottage_small_01", 1980, 1230, 0.44, 260); // its own clearing, not buried in trees
    // the cottage lantern is unlit/dim until Pip comes home — a localized
    // damage cue instead of a region-wide tint
    const cottageLit = progression.isUnlocked("bird");
    this.dprop("decor/lantern_01", 1860, 1280, 0.22)
      .setTint(cottageLit ? 0xffffff : 0x50505c)
      .setAlpha(cottageLit ? 1 : 0.8);
    this.dprop("decor/flower_cart_01", 2080, 1310, 0.2, 150); // cart belongs to the cottage garden
    this.dprop("decor/birdhouse_01", 1260, 1180, 0.18); // near the perch/arch, where a bird would actually nest
    // bench faces the cottage clearing, not wedged against the fence
    this.dprop("decor/bench_01", 1840, 1360, 0.2, 140);

    // ---- animal meadow (rabbit) — the entrance, and a hero clearing ----
    // one damage cue (the dead shrub), one rock+moss cluster the hedgehog
    // actually lives in, one flower patch, generous open ground between them
    this.prop("dead_shrub", 640, 1420, 1.0, 150);
    this.dprop("nature/rock_medium_01", 560, 1600, 0.2, 150);
    this.dprop("nature/mushrooms_01", 700, 1650, 0.13);
    this.critter("animals/hedgehog", 660, 1610, 0.13); // rocks + bushes, per its actual habitat
    this.dprop("vegetation/fern_01", 500, 1660, 0.15);
    this.dprop("vegetation/flowers_yellow_01", 1140, 1580, 0.19);
    this.dprop("vegetation/bush_green_01", 1220, 1500, 0.19);

    // ---- flower bed — the dormant/damaged area, right by the entrance ----
    // The Wildflowers object sprite (wildflower_bed) at (470,1652) IS the planter —
    // flowers grow from its own soil, so it stays untouched; this only dresses the
    // ground AROUND it. Restored/unrestored flower art frames the same spot the
    // planter already occupies, so its own bloom animation still reads as the hero
    // moment rather than being upstaged by a duplicate bed.
    const wildflowersDone = progression.isUnlocked("wildflowers");
    this.dprop(wildflowersDone ? "vegetation/vegetation_01" : "vegetation/vegetation_04", 260, 1560, 0.22);
    this.dprop("vegetation/flowers_pink_01", 300, 1520, 0.18);
    this.dprop("nature/rock_small_01", 690, 1660, 0.16, 120);
    this.dprop("decor/sign_01", 200, 1520, 0.16); // marks the meadow/flowerbed path junction

    // ---- magic tree grove — the dead Great Oak, a hero restoration with its
    // own restrained cluster and open ground kept clear around it ----
    this.prop("oak_dead", 2500, 1460, 1.2, 220);
    this.dprop("nature/rock_medium_01", 2680, 1560, 0.2, 150);
    this.prop("sapling", 2320, 1500, 0.9, 80);
    this.dprop("decor/sign_01", 2140, 1400, 0.16); // marks the cottage/grove path junction
    // supporting trees/vegetation sit farther back, framing rather than crowding
    this.dprop("vegetation/hedge_straight_01", 2760, 1640, 0.26);
    this.dprop("nature/log_01", 2820, 1500, 0.2, 150);
    // the grove's own woodland residents
    this.critter("animals/squirrel", 2260, 1560, 0.15);
    this.critter("animals/fox", 2780, 1420, 0.16, true);
    this.critter("animals/deer", 2560, 1620, 0.18);

    // ---- locked area (future) — visibly a destination, deliberately sparse ----
    this.dprop("structures/animal_house_01", 2860, 1000, 0.24, 140);
    this.dprop("decor/planter_01", 2660, 1080, 0.17);
    this.dprop("decor/sign_01", 2860, 1160, 0.16);

    // ---- fountain + water/bridge clearing (pondside) — one coherent water
    // area, not two: the cracked fountain, the waterfall feeding it, and the
    // bridge crossing the water it feeds, sharing one clearing ----
    this.buildPond();
    // rock/bush transition blending the fountain's edge into the lawn
    this.dprop("nature/rock_medium_01", 1220, 1920, 0.18, 140);
    this.dprop("vegetation/bush_mixed_01", 1860, 1900, 0.19);
    this.dprop("decor/sign_01", 1100, 1820, 0.16); // marks the meadow/pond path junction
    // the bench looks out over the water, the picnic spot sits by the bridge
    this.dprop("decor/bench_01", 1260, 2180, 0.2, 140);
    this.dprop("decor/picnic_table_01", 1980, 2200, 0.2, 160);
  }

  /**
   * One winding path asset (a hand-drawn organic S-curve, not a repeatable
   * straight tile), placed a few times at different rotations/scales to
   * thread the meadow (entrance) to the cottage garden, the grove, and the
   * fountain clearing — a route to follow, not disconnected dirt patches.
   */
  private buildPaths(): void {
    const seg = (x: number, y: number, scale: number, angle: number, alpha = 1) =>
      this.add.image(x, y, "path").setOrigin(0.5, 0.5).setScale(scale).setAngle(angle).setDepth(-110).setAlpha(alpha);

    // meadow (entrance) -> cottage garden
    seg(1180, 1420, 0.62, 100);
    seg(1440, 1330, 0.55, 78);
    // cottage garden -> magic tree grove
    seg(1940, 1340, 0.58, 96);
    seg(2220, 1400, 0.5, 82);
    // meadow -> fountain clearing (south spur)
    seg(1200, 1700, 0.6, 148);
    seg(1380, 1880, 0.55, 165);
  }

  /**
   * The pondside's only genuine damaged↔restored PRODUCTION ASSET PAIR (see the
   * asset-pack inventory — every other region reuses the existing flat-tint
   * RegionOverlay veil, since no other real damaged/restored pair was supplied).
   * Pondside itself isn't a wired restoration target yet (no catalog entry — see
   * the report), so rather than fabricate a new progression mechanic for it, its
   * reveal rides the honest signal already tracked: the whole visible garden
   * being fully restored. `refreshPond()` re-checks this live on every unlock.
   */
  private pondDamaged?: Phaser.GameObjects.Image;
  private pondRestored?: Phaser.GameObjects.Image;
  private pondLilies?: Phaser.GameObjects.Image;

  private buildPond(): void {
    const x = 1540;
    const y = 1980;
    // the clearing's hero landmark — sized to be unmistakably the destination,
    // not one prop among the surrounding decoration
    this.pondDamaged = this.dprop("water/pond_damaged_01", x, y, 0.62);
    this.pondRestored = this.add
      .image(x, y, "dg_pond_restored_01")
      .setOrigin(0.5, 1)
      .setScale(0.62)
      .setDepth(y + 0.1)
      .setAlpha(0);
    this.pondLilies = this.add
      .image(x - 40, y - 20, "dg_water_lilies_01")
      .setOrigin(0.5, 1)
      .setScale(0.16)
      .setDepth(y + 0.2)
      .setAlpha(0);
    this.add
      .image(x + 260, y - 340, "dg_waterfall_01")
      .setOrigin(0.5, 1)
      .setScale(0.42)
      .setDepth(y - 340);
    this.refreshPond(false);
  }

  /** Swap the pond to its restored state once every current restoration is done. */
  private refreshPond(animate: boolean): void {
    if (!this.pondDamaged || !this.pondRestored || !this.pondLilies) return;
    const allDone = progression.unlockedObjects().length >= CATALOG.length;
    const dAlpha = allDone ? 0 : 1;
    const rAlpha = allDone ? 1 : 0;
    if (!animate) {
      this.pondDamaged.setAlpha(dAlpha);
      this.pondRestored.setAlpha(rAlpha);
      this.pondLilies.setAlpha(rAlpha);
      return;
    }
    if (this.pondRestored.alpha === rAlpha) return; // no change
    this.tweens.add({ targets: this.pondDamaged, alpha: dAlpha, duration: 900, ease: "Sine.easeOut" });
    this.tweens.add({ targets: [this.pondRestored, this.pondLilies], alpha: rAlpha, duration: 900, ease: "Sine.easeOut" });
    if (allDone) sparkleBurst(this, this.pondRestored.x, this.pondRestored.y - 80, 20, 80);
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
      }
      // The three not-yet-wired regions (treeGrove/farmCorner/pondside) used to
      // get a flat grey/purple multiply-tint wash here (`addDormantVeil`) — at
      // the scale these regions render (1.7x/2.0x the rect), the three washes
      // overlapped into one large grey/brown blob across the right two-thirds
      // of the world. Their damage now reads through the actual assets placed
      // there (the dead oak, the cracked dry fountain, sparse dormant growth)
      // instead of an overlay — "beautifully rendered broken", not a grey box.
    }

    const alive = progression.unlockedObjects().length;
    ambientFireflies(
      this,
      new Phaser.Geom.Rectangle(REGIONS.animalMeadow.x - 420, REGIONS.animalMeadow.y - 320, 1600, 680),
      alive > 0 ? 18 : 7,
    );
  }

  private fgLeft?: Phaser.GameObjects.Image;
  private fgRight?: Phaser.GameObjects.Image;

  private buildForeground(): void {
    const v = this.add.image(0, 0, "vignette").setOrigin(0, 0).setScrollFactor(0).setDepth(8000);
    this.screenObjects.push(v);

    // Screen-space corner framing (locked light-weight production art, not the
    // interactive world) — sells "the camera is physically inside the garden"
    // without ever covering the HUD (top) or the task card (bottom-centre): kept
    // to the bottom corners only, small, and clear of the card's centred width.
    this.fgLeft = this.add
      .image(-10, 0, "dg_foreground_02")
      .setOrigin(0, 1)
      .setScale(0.22)
      .setAlpha(0.92)
      .setScrollFactor(0)
      .setDepth(7999);
    this.fgRight = this.add
      .image(0, 0, "dg_foreground_03")
      .setOrigin(1, 1)
      .setScale(0.2)
      .setFlipX(true)
      .setAlpha(0.92)
      .setScrollFactor(0)
      .setDepth(7999);
    this.positionForegroundFraming();
  }

  private positionForegroundFraming(): void {
    const h = this.scale.height;
    const w = this.scale.width;
    this.fgLeft?.setPosition(-10, h + 10);
    this.fgRight?.setPosition(w + 10, h + 10);
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
    // consumed materials (see GardenObjectDef.requestPropsTransient) never appear in the world
    if (def.requestPropsTransient) return;

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
      bus.on("puzzle:start", ({ objectId, force }) => {
        // never launch a puzzle over a running reveal; `force` (an explicit button)
        // bypasses a stale entry-flow flag and clears it so the flow can't stay stuck.
        if (this.reveal.isRunning) return;
        if (this.flowBusy && !force) return;
        this.flowBusy = false;
        this.camera.disable();
        this.scene.launch("Puzzle", { objectId });
        if (this.scene.isActive()) this.scene.pause();
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
