import Phaser from "phaser";
import { HORIZON, START_FOCUS, WORLD_HEIGHT, WORLD_WIDTH } from "../game/config";
import { COLORS } from "../ui/theme";
import { makeIconButton } from "../ui/hit";
import { bus, progression, requests, save, shop } from "../game/services";
import { CATALOG } from "../data/objects";
import { CameraController } from "../world/CameraController";
import { GardenObjectView } from "../world/GardenObjectView";
import { silhouetteTextureKey } from "../world/silhouette";
import { RegionOverlay } from "../world/RegionOverlay";
import type { RegionRect } from "../world/RegionOverlay";
import { IdleBehavior } from "../behavior/IdleBehavior";
import { RevealSequencer } from "../reveal/RevealSequencer";
import type { RevealHost } from "../reveal/types";
import { ambientFireflies, sparkleBurst } from "../fx/Particles";
import { Sfx } from "../fx/Sfx";
import type { GardenObjectDef } from "../data/types";
import { HABITATS, habitatFor, sourceById } from "../data/habitats";
import type { RestorationResource } from "../data/habitats";
import { RESOURCES } from "../data/resources";
import { calculateAccessoryTransform, accessoryIconFor, accessoryItem, decorItem } from "../data/shop";
import type { UIScene } from "./UIScene";
import { audio } from "../audio/AudioManager";

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

/** How far the purely-decorative scenery extends past the playable garden,
 *  so a wide zoomed-out view never shows the canvas behind the world. */
const EDGE_MARGIN_X = 1650;
const EDGE_MARGIN_Y = 1100;

/** Roughly the middle of all the playable garden — the wide opening frames on this. */
const GARDEN_CENTER = { x: 1500, y: 1520 };

/**
 * New Game only: a short cinematic sweep over every animal's DAMAGED habitat
 * (derived from data/habitats.ts, so it follows the real layout), ending on
 * the first animal's meadow. ~7–8s total: wide hold, then 5 eased pans.
 */
const TOUR_ORDER = ["deer", "fox", "squirrel", "bird", "hedgehog"];
const TOUR_PAN_MS = 950;
const TOUR_HOLD_MS = 380;

/** Visual centre of a habitat: its animal plus its three resource sources. */
function habitatCentre(animalId: string): { x: number; y: number } | null {
  const h = habitatFor(animalId);
  if (!h) return null;
  const pts = [h.homePosition, ...h.resources.map((r) => r.position)];
  return {
    x: pts.reduce((a, p) => a + p.x, 0) / pts.length,
    y: pts.reduce((a, p) => a + p.y, 0) / pts.length - 50,
  };
}

const wait = (scene: Phaser.Scene, ms: number) =>
  new Promise<void>((res) => scene.time.delayedCall(ms, res));

export class GardenScene extends Phaser.Scene implements RevealHost {
  camera!: CameraController;
  private reveal!: RevealSequencer;

  private views = new Map<string, GardenObjectView>();
  private idles = new Map<string, IdleBehavior>();
  private regions = new Map<string, RegionOverlay>();

  /** Per-animal pre-rescue silhouette overlay + ambient glow (see spawnObjectView /
   *  revealAnimalSilhouette). Children of the animal's own GardenObjectView.container,
   *  so they inherit its exact position/scale/idle-roam for free. */
  private animalGhosts = new Map<string, Phaser.GameObjects.Image>();
  private animalGlows = new Map<string, Phaser.GameObjects.Image>();

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
    this.renderPlacedDecor();
    this.refreshAllAccessories();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.wireEvents();
    this.events.on(Phaser.Scenes.Events.RESUME, () => this.flushWorldEffects());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());

    // the looping theme lives in AudioManager, outside every scene — this is
    // idempotent, so re-entering the Garden never restarts or doubles it
    audio.startMusic();
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
      // drives the REAL completion path (progression.recordPuzzleCompletion,
      // which commits the save, then the same "puzzle:closed" bus event the
      // actual PuzzleScene emits) — for testing the full loop incl. persistence
      // without needing to solve the tile-drag jigsaw headlessly.
      (window as unknown as Record<string, unknown>).__dgCompletePuzzle = (objectId: string) => {
        const { unlockedNow } = progression.recordPuzzleCompletion(objectId);
        bus.emit("puzzle:closed", { objectId, solved: true, unlockedNow });
        return unlockedNow;
      };
      // dumps every display-list object whose world bounds intersect the
      // given world-space rect — for tracking down a stray rectangle/overlay
      // by direct inspection instead of guessing which asset it's baked into
      (window as unknown as Record<string, unknown>).__dgDumpArea = (x: number, y: number, w: number, h: number) => {
        const hits: unknown[] = [];
        const rect = new Phaser.Geom.Rectangle(x, y, w, h);
        this.children.list.forEach((obj) => {
          const o = obj as Phaser.GameObjects.Image & { displayWidth?: number; displayHeight?: number };
          if (typeof o.x !== "number" || typeof o.y !== "number") return;
          const b = o.getBounds ? o.getBounds() : null;
          const intersects = b
            ? Phaser.Geom.Rectangle.Overlaps(rect, b)
            : rect.contains(o.x, o.y);
          if (!intersects) return;
          hits.push({
            type: o.type,
            texture: (o as { texture?: { key?: string } }).texture?.key,
            x: o.x,
            y: o.y,
            depth: o.depth,
            alpha: o.alpha,
            w: o.displayWidth,
            h: o.displayHeight,
            visible: o.visible,
          });
        });
        return hits;
      };
    }
  }

  update(): void {
    for (const v of this.views.values()) v.setDepthFromY();
    this.layoutScreen();
  }

  private onResize(): void {
    this.layoutScreen();
    this.camera?.onResize();
  }

  /** Screen-space overlays (sky, vignette) use scrollFactor 0, but Phaser
   *  still scales them by camera zoom around the viewport centre — so at any
   *  zoom other than 1 the vignette's dark rim shrank into a visible
   *  rectangle over the world. Counter-scale by zoom, centred, every frame
   *  (zoom changes continuously while pinching/tweening). */
  private layoutScreen(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const zoom = this.cameras.main.zoom || 1;
    for (const o of this.screenObjects) {
      o.setOrigin(0.5, 0.5).setPosition(w / 2, h / 2).setDisplaySize(w / zoom, h / zoom);
    }
  }

  /* ---------------- entry flow ---------------- */

  /** Where a returning session should land: the habitat of the animal the
   *  saved progression says is currently active (first not-yet-rescued in
   *  unlock order). Once every animal is home, the whole-garden centre. */
  private continueFocus(): { x: number; y: number } {
    const active = progression.activeAnimalId();
    return (active && habitatCentre(active)) || GARDEN_CENTER;
  }

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

    // Continue resumes where the player actually is — the active animal's
    // habitat from the save — not the hardcoded first-animal meadow.
    await wait(this, 400);
    const focus = this.continueFocus();
    await this.camera.focusOn(focus.x, focus.y, 1100, 1);

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
    if (!this.tourSkipped) await this.ui.showCaption("Bring the garden back to life!", 1500);
    // After the whole-garden establishing pan, focus specifically on the
    // first animal's habitat and its three damaged sources — the player's
    // very first close look at the garden should be "here is what's broken
    // and here is who needs help", not the full six-habitat open world.
    const firstAnimal = progression.animalOrder()[0];
    if (firstAnimal) await this.introduceHabitat(firstAnimal.id);
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
    // create() already framed the whole garden wide — hold it for a beat
    await wait(this, this.tourSkipped ? 0 : 900);
    for (const id of TOUR_ORDER) {
      if (this.tourSkipped) break;
      const c = habitatCentre(id);
      if (!c) continue;
      await this.camera.focusOn(c.x, c.y, TOUR_PAN_MS, 0.85);
      await wait(this, TOUR_HOLD_MS);
    }
    // always settle on the first animal's meadow at a comfortable inspect zoom
    const first = habitatCentre(progression.animalOrder()[0]?.id ?? "") ?? START_FOCUS;
    await this.camera.focusOn(first.x, first.y, this.tourSkipped ? 500 : TOUR_PAN_MS, 1);
  }

  /**
   * Shared close-up camera tour of one animal's habitat: settle on its
   * silhouette, step through its three damaged resource sources in turn (the
   * REAL damaged production assets already in the world — nothing faked up
   * for this sequence), then return to the silhouette/habitat overview.
   * Used both for the opening (Part C/D) and to hand off to the next animal
   * right after a rescue (Part H). Respects the same skip flag as playTour.
   */
  private async introduceHabitat(objectId: string): Promise<void> {
    const def = progression.def(objectId);
    const habitat = habitatFor(objectId);
    if (!def || !habitat) return;
    const dur = this.tourSkipped ? 260 : 760;
    const hold = this.tourSkipped ? 0 : 700;
    await this.camera.focusOn(def.garden_position.x, def.garden_position.y - 60, dur, 1.05);
    await wait(this, hold);
    for (const res of habitat.resources) {
      if (this.tourSkipped) break;
      await this.camera.focusOn(res.position.x, res.position.y, dur, 1.15);
      await wait(this, hold);
    }
    await this.camera.focusOn(def.garden_position.x, def.garden_position.y - 60, dur, 1);
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

    // Silhouette -> letter -> the puzzle is immediately playable (tap Play on
    // the task card, or the silhouette itself). No coin-purchase gate sits
    // between the letter and the rescue puzzle — see data/types.ts RequestDef
    // for the still-available, unrelated decorative-prop economy some objects
    // may offer post-rescue, which this flow does not touch.
    this.updateTaskMarker();
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

    // Part I: the FIRST time Nibs is rescued, open the Shop before moving on
    // to the next animal — a short, one-time beat, not a tutorial.
    if (revealed.id === "rabbit" && !shop.isUnlocked) {
      shop.unlock();
      this.refreshShopLockVisual();
      if (this.shopBuilding) {
        await this.camera.focusOn(this.shopBuilding.x, this.shopBuilding.y - 60, 800, 1.05);
        this.toast("The Garden Shop is now open!");
        await wait(this, 1100);
      }
    }

    // The sequential hand-off (Part H): wake the next animal's silhouette,
    // tour its habitat + damaged sources, then hand control back. CATALOG is
    // exactly the six animals now (no intermediate non-animal task), so this
    // is the only progression path — the old currentTask/Letter hand-off
    // below only still fires once every animal is rescued (nextAnimalId null).
    const nextAnimalId = progression.activeAnimalId();
    if (nextAnimalId) {
      this.activateAnimalSilhouette(nextAnimalId);
      audio.playSfx("animal_discovery");
      this.ui.refreshHabitatBar(); // HUD bar switches to the newly active animal
      await this.introduceHabitat(nextAnimalId);
      this.camera.enable();
      this.ui.setRevealing(false);
      this.ui.setTaskFromProgression();
      this.ui.showCard();
      return;
    }

    // garden complete — a slow look around, then stop (no further gameplay)
    this.ui.refreshHabitatBar(); // no active animal left — the bar hides
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
        audio.playSfx("ui_click");
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

    // Distant hills: fixed in the world (they used to be parallax layers,
    // which at wide zoom drifted apart into flat bands with straight edges),
    // tiled past both garden edges, hazed toward the sky colour. They sit
    // BEHIND the grass, so their irregular crests form the skyline.
    for (const x of [-EDGE_MARGIN_X, -EDGE_MARGIN_X + 3600, -EDGE_MARGIN_X + 7200]) {
      this.add.image(x, HORIZON + 170, "hills_far").setOrigin(0, 1).setScale(1.5).setDepth(-830).setAlpha(0.9);
      this.add.image(x - 300, HORIZON + 230, "hills_near").setOrigin(0, 1).setScale(1.5).setDepth(-800);
    }
  }

  private buildGround(): void {
    const g = this.add.graphics().setDepth(-200);
    g.fillStyle(COLORS.grassDull, 1);
    g.fillRect(-EDGE_MARGIN_X, HORIZON - 4, WORLD_WIDTH + EDGE_MARGIN_X * 2, WORLD_HEIGHT - HORIZON + 4 + EDGE_MARGIN_Y);

    // The supplied painted ground reference as the actual terrain, not a flat
    // fill or a re-drawn SVG. It doesn't tile perfectly seamlessly on its own
    // (checked: ~20/255 edge mismatch), so it's laid as a small grid of large
    // panels with alternating mirror flips — the standard trick for hiding a
    // texture's seams (a flipped repeat reads as a continuation, not a jump-cut)
    // — and every seam additionally falls under a prop cluster from buildProps().
    const tileW = 1650;
    const tileH = 1100;
    // The same mirrored tiling continues PAST the playable garden (one extra
    // column each side, extra rows below) purely as scenery, so a wide
    // zoomed-out view never exposes canvas. The in-garden tiles keep exactly
    // their old positions and flips (parity is computed from the same col/row).
    const firstCol = -Math.ceil(EDGE_MARGIN_X / tileW);
    const lastCol = Math.ceil((WORLD_WIDTH + EDGE_MARGIN_X) / tileW) - 1;
    for (let row = 0; row * tileH < WORLD_HEIGHT - HORIZON + EDGE_MARGIN_Y; row++) {
      for (let col = firstCol; col <= lastCol; col++) {
        this.add
          .image(col * tileW, HORIZON + row * tileH, "dg_grass_ground")
          .setOrigin(0, 0)
          .setDisplaySize(tileW, tileH)
          .setFlipX(((col % 2) + 2) % 2 === 1)
          .setFlipY(row % 2 === 1)
          .setDepth(-195);
      }
    }

    // Horizon-softening blend. NOTE: this used to be a single `Graphics` call
    // to `fillGradientStyle` — that API is WebGL-only in Phaser and silently
    // no-ops under the Canvas2D fallback renderer (confirmed earlier tracking
    // down a real seam bug this exact way in VisualSliceScene). It sat at
    // full WORLD_WIDTH right across the visible horizon, i.e. exactly the
    // shape of a "large rectangular overlay" if it ever rendered as a flat
    // fill instead of a fade. Baked into a texture instead — renders
    // identically on both renderer paths.
    // Soft atmospheric transition at the top of the grass: a tall haze that
    // melts the painted ground's straight top edge into the distant hills
    // (was a 150px fill-coloured fade that left a hard line across the top).
    this.bakeHorizonHaze();
    this.add
      .image(-EDGE_MARGIN_X, HORIZON - 140, "dg_horizon_haze")
      .setOrigin(0, 0)
      .setDisplaySize(WORLD_WIDTH + EDGE_MARGIN_X * 2, 420)
      .setDepth(-185);
    this.buildWorldSurround();
    // NOTE: a single huge "path" instance used to sit here (scale 1.6, alpha
    // 0.95, spanning nearly the whole world height) — at that scale its soft
    // organic curve was imperceptible and it read as a big flat translucent
    // tan rectangle behind the production art. Removed: buildPaths() below
    // already threads the meadow/cottage/grove/fountain with properly-scaled,
    // low-alpha path segments that actually read as a worn trail.
  }

  /** Vertical haze: transparent above, soft hill-green haze over the grass's
   *  top edge, fading back to transparent into the painted grass. */
  private bakeHorizonHaze(): void {
    const key = "dg_horizon_haze";
    if (this.textures.exists(key)) return;
    const tex = this.textures.createCanvas(key, 4, 420)!;
    const ctx = tex.getContext();
    const grad = ctx.createLinearGradient(0, 0, 0, 420);
    grad.addColorStop(0, "rgba(170,205,150,0)");
    grad.addColorStop(0.2, "rgba(165,203,146,0.75)");
    grad.addColorStop(0.36, "rgba(160,198,138,0.95)");
    grad.addColorStop(0.62, "rgba(156,191,122,0.55)");
    grad.addColorStop(1, "rgba(156,191,122,0)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, 420);
    tex.refresh();
  }

  /**
   * Scenery OUTSIDE the playable garden (never interactive, no gameplay
   * coordinates): a hazy distant tree line along the horizon, and soft trees /
   * bushes just past the left, right and bottom edges — so a wide zoom-out
   * reads garden → vegetation → distant landscape instead of a hard cutoff.
   */
  private buildWorldSurround(): void {
    const haze = 0xc7d6c0;
    const kinds = ["tree_far", "tree", "tree_pink", "tree_tall"];
    // distant tree line on the horizon, across the full extended width
    for (let i = 0, x = -EDGE_MARGIN_X + 60; x < WORLD_WIDTH + EDGE_MARGIN_X; i++, x += 190 + ((i * 97) % 140)) {
      this.treeOfKind(kinds[i % kinds.length], x, HORIZON + 40 + ((i * 53) % 50), 0.45 + ((i * 31) % 20) / 100, {
        depth: -186,
        tint: haze,
        alpha: 0.85,
      });
    }
    // edge vegetation just outside the garden (y-sorted like any prop, but
    // only ever placed where nothing playable exists)
    const bush = (x: number, y: number, s: number) =>
      this.add.image(x, y, "dg_bush_mixed_01").setOrigin(0.5, 1).setScale(s).setDepth(y).setTint(0xdfe8d6);
    for (let y = 900; y < WORLD_HEIGHT + 500; y += 260) {
      const k = (y / 260) | 0;
      this.treeOfKind(kinds[k % kinds.length], -170 - (k % 3) * 60, y, 0.9, { depth: y, tint: 0xd8e2d0 });
      this.treeOfKind(kinds[(k + 2) % kinds.length], WORLD_WIDTH + 170 + (k % 3) * 60, y + 120, 0.9, { depth: y + 120, tint: 0xd8e2d0 });
      bush(-60, y + 150, 0.22);
      bush(WORLD_WIDTH + 60, y + 40, 0.22);
    }
    for (let x = 80; x < WORLD_WIDTH; x += 330) {
      const k = (x / 330) | 0;
      this.treeOfKind(kinds[k % kinds.length], x + (k % 2) * 120, WORLD_HEIGHT + 260 + (k % 3) * 40, 0.85, { depth: WORLD_HEIGHT + 260, tint: 0xd8e2d0 });
      bush(x + 170, WORLD_HEIGHT + 150, 0.2);
    }
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
    this.buildHabitatResources();

    // small ambient grounding decoration (the "Garden Heart" placeholder
    // landmark that used to sit here — a future feature that was never
    // built — was removed; it had no gameplay purpose)
    this.dprop("nature/rock_small_01", 1440, 1010, 0.15, 110);
    this.dprop("vegetation/fern_01", 1660, 1000, 0.14);

    // ---- cottage garden (the songbird's cottage yard) ----
    // One destination, one purpose each: arch marks the entrance, a short
    // gapped fence marks the yard boundary (not a wall), the cottage is given
    // its own clearing, and each small object sits at the spot that gives it
    // a reason to be there.
    // Entrance gate: the arch IS the opening — the fence stubs sit tight
    // against its own left/right edges (same y as its base) rather than
    // floating below/beside it, so the whole thing reads as one continuous
    // boundary line with a deliberate gap for the path, not two independent
    // props. Each stub's outer post is grounded into a flower/fern clump
    // (its "reason to end there") instead of stopping bare in open grass.
    this.dprop("vegetation/flower_arch_01", 1400, 1135, 0.42); // the gate itself
    this.dprop("decor/fence_01", 1100, 1135, 0.2); // left stub, tight against the arch's edge
    this.dprop("decor/fence_01", 2090, 1170, 0.2); // right stub, tight against the arch's edge
    this.dprop("vegetation/fern_01", 940, 1210, 0.13); // grounds the left post's outer end
    this.dprop("vegetation/flowers_pink_01", 2150, 1210, 0.14); // grounds the right post's outer end
    this.dprop("structures/cottage_small_01", 2150, 1130, 0.36, 220); // its own clearing, not buried in trees
    // cottageLantern + cottageDoorstepFlowers (BIRD_HABITAT resources) are
    // built by buildHabitatResources() below — damaged/restored on Pip's unlock
    this.dprop("decor/flower_cart_01", 2080, 1310, 0.2, 150); // cart belongs to the cottage garden
    this.dprop("decor/birdhouse_01", 1260, 1180, 0.18); // near the perch/arch, where a bird would actually nest
    // bench faces the cottage clearing, not wedged against the fence
    this.dprop("decor/bench_01", 2110, 1420, 0.2, 140);

    // ---- animal meadow: Rabbit's clearing + Hedgehog's nook ----
    // generous open ground between the two small animals' own areas. Each
    // resource-source image already carries its own grounding (grass edge,
    // rocks, dirt baked into the art), so this only needs a LIGHT supporting
    // touch, not a second layer of clutter. (A flat bare-twig SVG used to sit
    // here as a damage cue; it read as unfinished next to the production art,
    // so a small production flower clump takes its place.)
    this.dprop("vegetation/flowers_mixed_01", 640, 1420, 0.12);
    this.dprop("vegetation/bush_mixed_01", 1220, 1500, 0.19);
    this.dprop("decor/sign_01", 200, 1520, 0.16); // marks the meadow/flowerbed path junction
    // Hedgehog's Wild Herb & Mushroom Nook — its 3 resources are built by
    // buildHabitatResources() below (see data/habitats.ts HEDGEHOG_HABITAT)
    this.dprop("vegetation/fern_01", 420, 2020, 0.15);
    this.dprop("decor/sign_01", 340, 2040, 0.16); // marks the meadow/nook path junction

    // ---- flower bed — Wildflowers' own dormant/damaged planter (untouched:
    // its own sprite bloom-in is the hero moment here) ----
    this.dprop("vegetation/flowers_pink_01", 300, 1520, 0.18);
    this.dprop("nature/rock_small_01", 690, 1660, 0.16, 120);

    // ---- magic tree grove: Squirrel's grove + Fox's woodland ----
    // Squirrel's and Fox's 3 resources each are built by buildHabitatResources()
    // below (see data/habitats.ts SQUIRREL_HABITAT / FOX_HABITAT). The old flat
    // bare-oak/sapling SVGs that stood here read as unfinished next to the
    // production art; a lush lantern blossom tree from the same pack now frames
    // the grove's lower-left edge instead, beside Hazel's apple tree.
    this.dprop("vegetation/vegetation_03", 2200, 1900, 0.25, 170);
    this.dprop("decor/sign_01", 2140, 1400, 0.16); // marks the cottage/grove path junction
    // Fox's grape vine (FOX_HABITAT, anchor 2960,1900) grows out of a small
    // soft-edged soil patch instead of its bare lower branches sitting on grass.
    // Ground decal: above the lawn, below every prop (same layer as path tufts).
    this.add.image(2960, 1892, "dg_soil_patch_01").setOrigin(0.5, 0.5).setScale(0.42).setDepth(-100);
    // grove / clearing boundary — moved off Fox's fern cluster, which it used to
    // sit exactly on top of
    this.dprop("vegetation/hedge_straight_01", 2200, 2150, 0.24);

    // ---- Deer's Enchanted Clearing ----
    // Deer's 3 resources are built by buildHabitatResources() below (see
    // data/habitats.ts DEER_HABITAT). The clearing now sits in the open
    // south-east meadow — its old spot around (2680,1000) became the Shop's
    // clearing, which left the deer standing on the Shop's porch.
    this.dprop("decor/sign_01", 2440, 1140, 0.16); // marks the grove/clearing path junction

    // ---- pondside clearing — ordinary scenery only. (A damaged/restored
    // fountain landmark used to anchor this clearing; it was removed — see
    // the Part-4 pass — for implying a seventh restoration objective the
    // player could never act on. This decoration is not tied to any quest.)
    // A purely decorative stone well (always intact, not interactive) fills
    // the fountain's old spot at the end of the meadow's south path spur.
    this.dprop("vegetation/vegetation_05", 1600, 1720, 0.28, 220);
    this.dprop("nature/rock_medium_01", 1120, 1900, 0.18, 140);
    this.dprop("vegetation/bush_mixed_01", 1960, 1880, 0.19);
    this.dprop("decor/sign_01", 1060, 1800, 0.16); // marks the meadow/pond path junction
    this.dprop("decor/picnic_table_01", 1980, 2220, 0.2, 160);
    this.dprop("structures/bridge_wood_01", 1790, 1690, 0.34).setAngle(40);

    this.buildShop();
  }

  /**
   * The Dream Garden Shop building (Part K): its own clearing in the
   * previously-empty farmCorner area, north-east of the grove — clear of
   * every habitat/animal/resource and the cottage. Grounded the same way as
   * every other structure (dprop's soft elliptical shadow, no platform),
   * with its own small flower/path accents so it reads as belonging to the
   * garden rather than dropped in on bare grass. Locked (visible, dimmed,
   * non-interactive) until shop.isUnlocked — see runPostStage's Part I hook.
   */
  private shopBuilding?: Phaser.GameObjects.Image;
  private buildShop(): void {
    const x = 2680;
    const y = 980;
    this.dprop("vegetation/flowers_pink_01", 2540, 1060, 0.14);
    this.dprop("vegetation/flowers_yellow_01", 2830, 1050, 0.14);
    this.dprop("decor/sign_01", 2440, 1080, 0.16); // marks the grove/shop path junction
    const shopImg = this.dprop("accessories/shop_building", x, y, 0.42, 300);
    this.shopBuilding = shopImg;
    shopImg.setInteractive({ useHandCursor: true });
    shopImg.on("pointerup", () => this.handleShopTap());
    this.refreshShopLockVisual();
  }

  private refreshShopLockVisual(): void {
    if (!this.shopBuilding) return;
    this.shopBuilding.setAlpha(shop.isUnlocked ? 1 : 0.55);
    this.shopBuilding.setTint(shop.isUnlocked ? 0xffffff : 0x9aa08c);
  }

  private handleShopTap(): void {
    if (!shop.isUnlocked) {
      this.toast("Rescue Nibs to open the Garden Shop!");
      return;
    }
    if (this.flowBusy || this.reveal.isRunning || this.letterUp) return;
    bus.emit("shop:open", {});
  }

  /**
   * One winding path asset (a hand-drawn organic S-curve, not a repeatable
   * straight tile), placed a few times at different rotations/scales to
   * thread the meadow (entrance) to the cottage garden, the grove, and the
   * fountain clearing — a route to follow, not disconnected dirt patches.
   */
  private buildPaths(): void {
    // A narrow, worn dirt trail — not a road. Lower alpha and a warm-grass tint
    // let it recede into the lawn instead of reading as a solid beige plaza;
    // small flower/grass tufts along it (below) break its edge into the grass
    // rather than leaving a clean geometric boundary. Segments are spaced with
    // real gaps rather than overlapping — the gaps read as "path continues
    // under the grass/a cluster", which is how a real trail behaves, and it's
    // what stops multiple segments stacking into a wide "junction plaza".
    const seg = (x: number, y: number, scale: number, angle: number) =>
      this.add
        .image(x, y, "path")
        .setOrigin(0.5, 0.5)
        .setScale(scale)
        .setAngle(angle)
        .setDepth(-110)
        .setAlpha(0.62)
        .setTint(0xcfa876);

    // meadow (entrance) -> cottage garden, threaded straight through the
    // gate's own centre (x1560) rather than past the fence beside it
    seg(1160, 1440, 0.3, 102);
    seg(1560, 1300, 0.28, 90);
    // cottage garden -> magic tree grove
    seg(1980, 1350, 0.3, 94);
    seg(2260, 1410, 0.26, 80);
    // meadow -> fountain clearing (south spur)
    seg(1180, 1720, 0.3, 150);
    seg(1360, 1900, 0.26, 166);

    // small tufts breaking the path's edge into the surrounding grass —
    // a few per stretch, alternating sides, not a clean border
    const tuft = (x: number, y: number, key: string, scale: number) =>
      this.add.image(x, y, `dg_${key}`).setOrigin(0.5, 1).setScale(scale).setDepth(-105);
    tuft(1250, 1400, "flowers_yellow_01", 0.06);
    tuft(1560, 1290, "flowers_pink_01", 0.06);
    tuft(2060, 1310, "flowers_blue_01", 0.06);
    tuft(1260, 1660, "flowers_pink_01", 0.06);
  }

  /* ---------------- habitat restoration resources (data/habitats.ts) ---------------- */

  private resourceViews = new Map<string, Phaser.GameObjects.Image>();
  private lastCollectedAt = new Map<string, number>();

  /**
   * Every habitat's 3 damaged/restored sources are part of the world from the
   * very start, next to that animal's silhouette — restoring them is how the
   * player earns the animal's rescue puzzle (see habitatReady()). Each
   * source's own damaged/restored state is independent, persisted save truth.
   */
  private buildHabitatResources(): void {
    for (const habitat of HABITATS) {
      for (const res of habitat.resources) this.buildResource(res);
    }
  }

  /** All 3 of this animal's habitat sources are restored — the gate for its rescue puzzle. */
  habitatReady(objectId: string): boolean {
    const habitat = habitatFor(objectId);
    return !habitat || habitat.resources.every((r) => requests.isSourceRestored(r.id));
  }

  private resourceTexture(res: RestorationResource, restored: boolean): string {
    const key = restored ? res.restoredAsset : res.damagedAsset;
    return res.id.startsWith("bird_") ? `${key}_grounded` : key;
  }

  private buildResource(res: RestorationResource): Phaser.GameObjects.Image {
    const restored = requests.isSourceRestored(res.id);
    const { x, y } = res.position;
    const img = this.dprop(this.resourceTexture(res, restored), x, y, res.scale, 0);
    if (restored) this.makeCollectible(img, res);
    else this.makeRestorable(img, res);
    this.resourceViews.set(res.id, img);
    return img;
  }

  /**
   * A damaged source is environmental storytelling, not a shortcut — tapping
   * it points the player at the animal, who is the real entry point for its
   * Request screen (see openHabitatRequest). It never restores anything by
   * itself.
   */
  private makeRestorable(img: Phaser.GameObjects.Image, res: RestorationResource): void {
    img.setInteractive({ useHandCursor: true });
    img.on("pointerup", () => {
      const habitat = HABITATS.find((h) => h.resources.some((r) => r.id === res.id));
      const def = habitat ? progression.def(habitat.animalId) : undefined;
      this.toast(def ? `${def.name} can tell you what ${res.label} needs.` : `${res.label} needs help.`);
      this.tweens.add({ targets: img, angle: { from: -2, to: 2 }, duration: 90, yoyo: true, repeat: 3 });
    });
  }

  /** A restored source is tappable — a real, persisted +N to that resource's
   *  inventory (data/resources.ts), with a short per-source cooldown so it
   *  isn't spammable, and a small sparkle/popup instead of a silent number
   *  change. Session-only cooldown (not persisted) is an acceptable, low-risk
   *  simplification given scope. */
  private makeCollectible(img: Phaser.GameObjects.Image, res: RestorationResource): void {
    img.setInteractive({ useHandCursor: true });
    img.on("pointerup", () => {
      const last = this.lastCollectedAt.get(res.id) ?? 0;
      const now = this.time.now;
      if (now - last < 1500) return;
      this.lastCollectedAt.set(res.id, now);
      const total = requests.collectResource(res.produces, 1);
      audio.playSfx("resource_collect");
      sparkleBurst(this, img.x, img.y - img.displayHeight * 0.6, 8, 30);
      this.toast(`+1 ${RESOURCES[res.produces]?.label ?? res.produces} (${total})`);
      this.tweens.add({ targets: img, scaleX: img.scaleX * 1.08, scaleY: img.scaleY * 1.08, duration: 120, yoyo: true });
    });
  }

  /** Live-swap ONE specific resource source from damaged to restored — called
   *  the instant its funding request completes (see wireEvents' request:purchased
   *  handler), so the habitat visibly improves during the SAME session, not
   *  only after a reload. */
  private pendingRestoreReveal: string | null = null;

  /**
   * Post-Restore payoff (~1.8s): focus the camera on the source, play the
   * existing damaged → restored reveal (restoreResourceSource), fill the HUD
   * segment as the restored sprite grows in, hold briefly, then reopen the
   * SAME animal's Request screen so the player picks the next item without
   * tapping the animal again. Never auto-starts the rescue puzzle — after the
   * third restore the reopened screen offers "Bring X Home".
   */
  private async presentRestoreThenReturn(sourceId: string, objectId: string): Promise<void> {
    const res = sourceById(sourceId);
    if (!res) {
      this.camera.enable();
      return;
    }
    this.flowBusy = true;
    this.camera.disable();
    await this.camera.focusOn(res.position.x, res.position.y - 60, 450, Math.max(this.camera.zoom, 1));
    this.restoreResourceSource(sourceId);
    await wait(this, 420); // restored sprite is mostly grown in (200ms delay + Back ease)
    this.ui.refreshHabitatBar(true);
    await wait(this, 750); // hold on the restored resource
    this.flowBusy = false;
    bus.emit("habitatRequest:open", { objectId });
  }

  private restoreResourceSource(sourceId: string): void {
    const res = sourceById(sourceId);
    const existing = this.resourceViews.get(sourceId);
    if (!res || !existing) return;

    const { x, y } = res.position;
    const bird = res.id.startsWith("bird_");
    this.tweens.add({ targets: existing, alpha: 0, scale: existing.scale * (bird ? 1 : 0.9), duration: 350, onComplete: () => existing.destroy() });
    const img = this.dprop(this.resourceTexture(res, true), x, y, res.scale, 0);
    img.setScale(bird ? res.scale : 0).setAlpha(0);
    this.tweens.add({ targets: img, scale: res.scale, alpha: 1, duration: 550, delay: bird ? 0 : 200, ease: bird ? "Sine.easeOut" : "Back.easeOut" });
    this.makeCollectible(img, res);
    this.resourceViews.set(sourceId, img);
    sparkleBurst(this, x, y - res.scale * 300, 18, 60);
    audio.playSfx("resource_restore"); // main restoration sound, in sync with the visible growth
  }

  private buildRegions(): void {
    const unlockedRegions = new Set(progression.unlockedObjects().map((o) => o.region));

    for (const key of Object.keys(REGIONS)) {
      const rect = REGIONS[key];
      if (BLOOMABLE.has(key)) {
        // the flower bed's bloom lives in its planter sprite, not scattered on the lawn
        const opts =
          (key === "flowerBed" || key === "cottageYard")
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

  private buildForeground(): void {
    const v = this.add.image(0, 0, "vignette").setOrigin(0, 0).setScrollFactor(0).setDepth(8000);
    this.screenObjects.push(v);
  }

  /* ---------------- objects ---------------- */

  /** Animals are residents before rescue; only non-animal restorations wait for unlock. */
  private spawnSavedObjects(): void {
    for (const def of CATALOG.filter(d => d.category === "animal" || progression.isUnlocked(d.id))) {
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
        // a soft contact shadow, not a second silhouette of the animal — sized
        // well below the production art's own footprint (was 140/200/160,
        // tuned for the old, smaller flat-SVG bodies)
        shadowWidth: def.category === "plant" ? 130 : def.category === "animal" ? 80 : 110,
        // a comfortable tap target independent of the (now much smaller)
        // visual sprite — see GardenObjectView.onTap
        hitSize: def.category === "animal" ? 110 : undefined,
      });
      if (def.category === "animal") {
        view.onTap(() => this.handleAnimalTap(def.id));
        if (!progression.isUnlocked(def.id)) this.buildAnimalSilhouette(view, def);
      }
      this.views.set(def.id, view);
    }
    view.container.setVisible(!startHidden);
    view.setDepthFromY();
    return view;
  }

  /** Breathing/glow tweens currently running per animal silhouette — tracked so
   *  activateAnimalSilhouette() can tell a still-locked ghost from an active one. */
  private silhouetteAwake = new Set<string>();

  /**
   * A locked animal is a recognisable dark silhouette of its OWN final sprite —
   * same footprint/position/scale/origin — not a placeholder shape. The real
   * body (GardenObjectView.body) is hidden underneath (alpha 0) until rescue,
   * when revealAnimalSilhouette() crossfades the two: exact spot, no relocation.
   *
   * Only the ONE currently-active animal (progression.activeAnimalId()) gets
   * the inviting breathing glow; every animal further down the rescue order
   * sits still and dim — visibly "not yet" rather than "come tap me too".
   */
  private buildAnimalSilhouette(view: GardenObjectView, def: GardenObjectDef): void {
    view.body.setAlpha(0);
    const locked = progression.isAnimalLocked(def.id);
    const ghost = this.add
      .image(0, 0, silhouetteTextureKey(this, def.garden_sprite))
      .setOrigin(0.5, 1)
      .setAlpha(locked ? 0.16 : 0.4);
    view.container.add(ghost);
    this.animalGhosts.set(def.id, ghost);
    view.registerGhost(ghost);

    const glow = this.add
      .image(0, -ghost.displayHeight * 0.55, "glow")
      .setScale(Phaser.Math.Clamp(ghost.displayWidth / 220, 0.4, 1.1))
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    view.container.add(glow);
    view.container.sendToBack(glow); // glow behind the silhouette, silhouette behind nothing (body is invisible anyway)
    this.animalGlows.set(def.id, glow);

    if (!locked) this.activateAnimalSilhouette(def.id);
  }

  /** Wake a silhouette into the "this is the active rescue" breathing/glow
   *  look — used both for the animal that's active from the start, and to
   *  visually promote the next animal in sequence once the previous one is
   *  rescued (see runPostStage). Safe to call more than once (no-ops if
   *  already awake, or if there's no silhouette left because it's rescued). */
  private activateAnimalSilhouette(objectId: string): void {
    if (this.silhouetteAwake.has(objectId)) return;
    const ghost = this.animalGhosts.get(objectId);
    const glow = this.animalGlows.get(objectId);
    if (!ghost) return;
    this.silhouetteAwake.add(objectId);
    ghost.setAlpha(0.4);
    this.tweens.add({ targets: ghost, alpha: 0.54, duration: 1700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    if (glow) {
      glow.setAlpha(0.14);
      this.tweens.add({ targets: glow, alpha: 0.26, duration: 1500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
  }

  /** Rescue moment: crossfade the silhouette away as the real body fades in, in place. */
  revealAnimalSilhouette(objectId: string): Promise<void> {
    const ghost = this.animalGhosts.get(objectId);
    const view = this.views.get(objectId);
    this.animalGhosts.delete(objectId);
    const glow = this.animalGlows.get(objectId);
    this.animalGlows.delete(objectId);
    this.silhouetteAwake.delete(objectId);
    if (!ghost || !view) return Promise.resolve();
    view.registerGhost(undefined);
    return new Promise((resolve) => {
      this.tweens.add({ targets: view.body, alpha: 1, duration: 450, ease: "Sine.easeOut" });
      // settle exactly once, even if the tween is stopped/killed instead of
      // completing — a hung promise here would freeze the whole rescue reveal
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        view.body.setAlpha(1);
        ghost.destroy();
        glow?.destroy();
        resolve();
      };
      this.tweens.add({
        targets: [ghost, glow].filter(Boolean),
        alpha: 0,
        duration: 450,
        ease: "Sine.easeIn",
        onComplete: finish,
        onStop: finish,
      });
    });
  }

  /**
   * The silhouette (and the real animal, once rescued) is the entry point for
   * its habitat's Request screen — restore all 3 of its damaged sources there
   * to earn the rescue puzzle. Animals unlock in sequence (rabbit → bird →
   * hedgehog → squirrel → fox → deer, see ProgressionService.animalOrder) —
   * a future animal's silhouette does nothing but hint at what's next.
   */
  private handleAnimalTap(objectId: string): void {
    const habitat = habitatFor(objectId);
    if (!habitat) return;
    if (this.flowBusy || this.reveal.isRunning || this.letterUp) return;
    if (progression.isUnlocked(objectId)) {
      this.toast(`${progression.def(objectId)?.name ?? "This friend"} is home safe. ✓`);
      return;
    }
    if (progression.isAnimalLocked(objectId)) {
      const activeName = progression.def(progression.activeAnimalId() ?? "")?.name ?? "your current friend";
      this.toast(`Help ${activeName} first — this friend is waiting their turn.`);
      return;
    }
    bus.emit("habitatRequest:open", { objectId });
  }

  pauseIdle(objectId: string): void {
    this.idles.get(objectId)?.stop();
    this.idles.delete(objectId);
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

  /**
   * Historically built a dim "next task" ghost silhouette for whatever
   * non-animal object was up next (previously: the standalone Wildflowers
   * task). Progression is now exactly the six animals (data/objects.ts
   * CATALOG), and every animal already gets its own, richer silhouette via
   * buildAnimalSilhouette/activateAnimalSilhouette — so there is no longer
   * any "next task" that needs this separate marker. Kept as pure cleanup
   * (clearing anything a stale/old save might have left) rather than deleted
   * outright, since taskGhost/taskGlow/taskFootprint are still read defensively
   * elsewhere (e.g. fadeTaskMarker's target list).
   */
  private updateTaskMarker(): void {
    this.taskGlow?.destroy();
    this.taskGhost?.destroy();
    this.taskFootprint?.destroy();
    this.taskGlow = undefined;
    this.taskGhost = undefined;
    this.taskFootprint = undefined;
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
    audio.unlock();
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
        // hard gate: the rescue puzzle stays locked until all 3 habitat
        // sources are restored, regardless of which UI path tried to start it.
        if (!progression.isUnlocked(objectId) && !this.habitatReady(objectId)) return;
        if (progression.isAnimalLocked(objectId)) return;
        this.flowBusy = false;
        this.camera.disable();
        // HUD must not sit over the puzzle (UIScene is registered after
        // PuzzleScene): hide the task card + top HUD and draw the puzzle on top
        this.ui.hideCard();
        this.ui.setHudVisible(false);
        this.scene.launch("Puzzle", { objectId });
        this.scene.bringToTop("Puzzle");
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
      bus.on("habitatRequest:open", ({ objectId }) => {
        if (this.reveal.isRunning || this.flowBusy) return;
        // hard gate, mirroring puzzle:start below — a locked animal's Request
        // screen must not open no matter which path tried to open it.
        if (progression.isAnimalLocked(objectId)) return;
        // restore the fixed HUD in case we're returning from the Garden Maze,
        // which hides it in favour of its own in-run HUD (see resourceAcquisition:open below)
        this.scene.setVisible(true, "UI");
        this.camera.disable();
        this.scene.launch("HabitatRequest", { objectId });
        this.scene.pause();
      }),
    );
    this.offFns.push(
      bus.on("resourceAcquisition:open", ({ objectId, sourceId, resourceId, amount }) => {
        if (this.reveal.isRunning) return;
        // the maze has its own complete HUD (title/target/leaves/hearts) —
        // hide the fixed Garden HUD so its coin pill/task card don't show
        // through un-dimmed behind the maze's own camera-scrolled world.
        this.scene.setVisible(false, "UI");
        this.camera.disable();
        this.scene.launch("MazeIntro", { objectId, sourceId, resourceId, amount });
        if (this.scene.isActive()) this.scene.pause();
      }),
    );
    this.offFns.push(
      bus.on("habitatRequest:closed", ({ objectId }) => {
        const pending = this.pendingRestoreReveal;
        this.pendingRestoreReveal = null;
        if (pending) {
          void this.presentRestoreThenReturn(pending, objectId);
          return;
        }
        this.camera.enable();
      }),
    );
    this.offFns.push(
      bus.on("shop:open", () => {
        if (this.reveal.isRunning || this.flowBusy) return;
        this.camera.disable();
        this.scene.launch("Shop");
        this.scene.pause();
      }),
    );
    this.offFns.push(
      bus.on("shop:closed", () => {
        this.camera.enable();
      }),
    );
    this.offFns.push(
      bus.on("decor:placeStart", ({ itemId }) => {
        this.beginDecorPlacement(itemId);
      }),
    );
    this.offFns.push(
      bus.on("accessory:changed", ({ animalId }) => {
        this.refreshAccessories(animalId);
      }),
    );
    this.offFns.push(
      bus.on("resourceSource:restored", ({ sourceId }) => {
        // The save is already committed; the world swap is HELD until the
        // Request panel closes so the player actually watches it (see
        // presentRestoreThenReturn), instead of it playing hidden underneath.
        this.pendingRestoreReveal = sourceId;
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
        this.ui.setHudVisible(true);
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

  /* ---------------- Shop: accessories on animals ---------------- */

  private accessorySprites = new Map<string, Phaser.GameObjects.Image[]>();

  /** Rebuild the composed accessory images on one animal from its currently
   *  equipped slots, via the SHARED calculateAccessoryTransform() (data/shop.ts)
   *  — the exact same fitting the Shop's Try-It-On preview reads. Never
   *  touches the original animal PNG, purely additional child images. */
  private refreshAccessories(animalId: string): void {
    const view = this.views.get(animalId);
    if (!view) return;
    this.accessorySprites.get(animalId)?.forEach((img) => img.destroy());
    const sprites: Phaser.GameObjects.Image[] = [];
    const equipped = shop.equippedFor(animalId);
    for (const accessoryId of Object.values(equipped)) {
      const item = accessoryItem(accessoryId);
      if (!item) continue;
      const img = this.add.image(0, 0, accessoryIconFor(animalId, accessoryId) ?? item.icon).setOrigin(0.5, 0.5);
      const t = calculateAccessoryTransform(animalId, accessoryId, view.body.width, view.body.height, img.width, img.height);
      if (!t) { img.destroy(); continue; }
      img.setPosition(t.x, t.y);
      img.setScale(t.scale);
      img.setAngle(t.rotation);
      // A Container renders children in LIST order, not by .depth — so a
      // "behind the body" accessory (the backpack) must be INSERTED before
      // view.body in the list, not just given a lower .depth (which a
      // Container ignores for its own children).
      if (t.depthOffset < 0) {
        view.container.addAt(img, view.container.getIndex(view.body));
      } else {
        view.container.add(img);
      }
      sprites.push(img);
    }
    this.accessorySprites.set(animalId, sprites);
    view.registerAccessories(sprites);
  }

  private refreshAllAccessories(): void {
    for (const def of CATALOG) {
      if (def.category === "animal" && progression.isUnlocked(def.id)) this.refreshAccessories(def.id);
    }
  }

  /* ---------------- Shop: world decor placement (Part N) ---------------- */

  private placedDecorViews = new Map<string, Phaser.GameObjects.Image>();

  private renderPlacedDecor(): void {
    for (const p of shop.placedDecor()) this.spawnPlacedDecor(p.placementId, p.itemId, p.x, p.y);
  }

  private spawnPlacedDecor(placementId: string, itemId: string, x: number, y: number): void {
    const item = decorItem(itemId);
    if (!item) return;
    const img = this.prop(item.icon, x, y, item.scale, 90);
    this.placedDecorViews.set(placementId, img);
  }

  private placement?: {
    itemId: string;
    preview: Phaser.GameObjects.Image;
    cancelBtn: Phaser.GameObjects.Container;
    capture: Phaser.GameObjects.Rectangle;
  };

  private beginDecorPlacement(itemId: string): void {
    const item = decorItem(itemId);
    if (!item || shop.decorOwnedCount(itemId) <= 0) return;
    this.cancelDecorPlacement();
    this.scene.setVisible(true, "UI");
    const start = this.cameras.main.getWorldPoint(this.scale.width / 2, this.scale.height / 2);
    const preview = this.add
      .image(start.x, start.y, item.icon)
      .setOrigin(0.5, 1)
      .setScale(item.scale)
      .setAlpha(0.6)
      .setDepth(999999);

    // A single world-space (default scrollFactor — see GardenMazeScene's
    // camera/scrollFactor postmortem for why NOT scrollFactor(0) here) capture
    // rectangle spanning the whole world, at the highest depth, so it's always
    // the topOnly hit — this is what stops a placement tap from ALSO landing
    // on whatever animal/resource happens to be underneath it (previously: a
    // placement click could simultaneously open a Request screen).
    const capture = this.add
      .rectangle(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH, WORLD_HEIGHT, 0x000000, 0.001)
      .setDepth(999998)
      .setInteractive({ useHandCursor: true });
    capture.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      preview.setPosition(wp.x, wp.y);
    });
    capture.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (this.registry.get("pointerOnUI")) return;
      const wp = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.confirmDecorPlacement(itemId, wp.x, wp.y);
    });

    const cancelBtn = makeIconButton(this, this.scale.width - 56, 56, "✕", 24, () => this.cancelDecorPlacement(), {
      color: "#7a4d12",
    })
      .setScrollFactor(0)
      .setDepth(1000000);
    this.toast(`Tap a clear spot to place ${item.label}.`);
    this.placement = { itemId, preview, cancelBtn, capture };
  }

  private cancelDecorPlacement(): void {
    if (!this.placement) return;
    this.placement.capture.destroy();
    this.placement.preview.destroy();
    this.placement.cancelBtn.destroy();
    bus.emit("decor:placeCancelled", { itemId: this.placement.itemId });
    this.placement = undefined;
  }

  /** Simple, approximate collision guard (Part N): reject a spot too close to
   *  any animal, habitat resource, the Shop building, or another placed item —
   *  not full bounding-box geometry, but enough to stop obviously-bad drops. */
  private decorSpotIsClear(x: number, y: number): boolean {
    const minDist = 90;
    const tooClose = (px: number, py: number) => Math.hypot(px - x, py - y) < minDist;
    if (x < 60 || y < 60 || x > WORLD_WIDTH - 60 || y > WORLD_HEIGHT - 60) return false;
    for (const def of CATALOG) if (tooClose(def.garden_position.x, def.garden_position.y)) return false;
    for (const h of HABITATS) for (const r of h.resources) if (tooClose(r.position.x, r.position.y)) return false;
    if (this.shopBuilding && tooClose(this.shopBuilding.x, this.shopBuilding.y)) return false;
    for (const p of shop.placedDecor()) if (tooClose(p.x, p.y)) return false;
    return true;
  }

  private confirmDecorPlacement(itemId: string, x: number, y: number): void {
    if (!this.decorSpotIsClear(x, y)) {
      this.toast("Too close to something else — try another spot.");
      return;
    }
    const placementId = shop.placeDecor(itemId, x, y);
    if (!placementId) {
      this.cancelDecorPlacement();
      return;
    }
    this.spawnPlacedDecor(placementId, itemId, x, y);
    audio.playSfx("ui_click");
    sparkleBurst(this, x, y, 12, 40);
    this.placement?.preview.destroy();
    this.placement?.cancelBtn.destroy();
    this.placement?.capture.destroy();
    this.placement = undefined;
    bus.emit("decor:placed", { placementId, itemId, x, y });
  }

  private teardown(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.offFns.forEach((fn) => fn());
    this.offFns = [];
    this.idles.forEach((i) => i.stop());
    this.idles.clear();
    this.views.clear();
    this.resourceViews.clear();
    this.lastCollectedAt.clear();
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
