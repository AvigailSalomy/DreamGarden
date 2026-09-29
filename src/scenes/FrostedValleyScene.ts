import Phaser from "phaser";
import { CameraController } from "../world/CameraController";
import { sparkleBurst, gatherGlow, petalPuff, dustRing } from "../fx/Particles";
import { Sfx } from "../fx/Sfx";
import { makeIconButton } from "../ui/hit";
import { makePanel, makePill } from "../ui/Panel";
import { titleStyle, bodyStyle, labelStyle } from "../ui/theme";
import { safeInsets } from "../util/safeArea";
import { economy, progression, frostedProgression, frostedShop } from "../game/services";
import { FROSTED_CATALOG } from "../data/frostedValley";
import { FROSTED_SHOP_CATALOG } from "../data/frostedShop";
import type { FrostedShopPlacement } from "../data/types";
import { FrostedPlacementController } from "../world/FrostedPlacementController";
import { FrostedAnimalNpc } from "../world/FrostedAnimalNpc";
import { NATIVE_FACING, PERSONALITIES, areaAt, type Pt } from "../world/animalBehavior";
import { FROSTED_ROAM } from "../data/frostedRoam";
import { FrostedStoryDirector } from "../story/FrostedStoryDirector";
import { SHOP_LOCKED_HINT, storyFor } from "../data/frostedStory";

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
 * NEGLECT/RESCUE: every zone's animal starts as a solid black silhouette
 * (intentional locked state — see `buildZoneAnimal`) next to its own
 * "neglected" landmarks, shown in their damaged state. Each landmark is
 * restored one at a time from the Request screen (maze → Restore); once ALL of
 * them are, the silhouette's badge turns into 🧩 and the animal's reward
 * jigsaw (FrostedPuzzleScene) unlocks. Solving it plays the living artwork,
 * then `playUnlockCinematic` transforms the silhouette into a living NPC
 * (FrostedAnimalNpc) and commits the rescue — after which the animal is
 * rebuilt as that NPC on every load, never as a silhouette again.
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
  fv_rabbit_yard: 607,
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
/**
 * A fixed margin added on every side of the actual painted content. The
 * camera's bounds are a hard rect starting at (0,0) — any tall landmark
 * anchored close to that edge gets its top permanently chopped (this is what
 * was clipping the waterfall). Instead of hand-tuning every tall prop's
 * offset, the whole content block (background image + every zone) is shifted
 * inward by EDGE_PADDING and the world is sized to include that padding, so
 * there's always breathing room on all four sides no matter how tall a prop
 * is placed near an edge.
 */
const EDGE_PADDING = 500;
const WORLD_W = BG_NATIVE_W * BG_SCALE + EDGE_PADDING * 2 + 500; // +extra so the crystal zone's spread clears the right edge
/** The painted fv_world_bg image's own height — the canvas below adds a new area beyond this, not more of the painted art. */
const MAIN_H = BG_NATIVE_H * BG_SCALE + EDGE_PADDING * 2;
/**
 * A new hand-built area appended below the painted map: there's no painted
 * terrain here (fv_world_bg only covers MAIN_H), so this whole strip is
 * built from props + a procedural river, the same technique already used
 * for the small inter-cottage stream. Growing the canvas downward (not the
 * existing zoom/camera settings) is exactly what keeps this from cutting
 * into the existing composition above it.
 */
const GLADE_H = 3400;
const WORLD_H = MAIN_H + GLADE_H;
const HORIZON = 0; // the background image is terrain edge-to-edge, no separate sky band

/** Six distinct clearings, positioned on the real features of fv_world_bg (plus the shared edge padding). */
const ZONES: Record<ZoneKey, { x: number; y: number }> = {
  village: { x: 450 * BG_SCALE + EDGE_PADDING, y: 750 * BG_SCALE + EDGE_PADDING }, // open flat snow, left-center
  bridge: { x: 1150 * BG_SCALE + EDGE_PADDING, y: 420 * BG_SCALE + EDGE_PADDING }, // the river's narrow neck
  grove: { x: 1550 * BG_SCALE + EDGE_PADDING, y: 580 * BG_SCALE + EDGE_PADDING }, // the river's big loop bend
  waterfall: { x: 2400 * BG_SCALE + EDGE_PADDING, y: 260 * BG_SCALE + EDGE_PADDING }, // the icy cliff, upper-right
  crystals: { x: 2750 * BG_SCALE + EDGE_PADDING, y: 330 * BG_SCALE + EDGE_PADDING }, // rocks beside the cliff
  shore: { x: 2500 * BG_SCALE + EDGE_PADDING, y: 1200 * BG_SCALE + EDGE_PADDING }, // the lake, lower-right
};

/** The new hidden glade, in the appended strip below the painted map — not one of the 6 puzzle zones. */
const GLADE = { x: 6000, y: MAIN_H + GLADE_H / 2 };

/** FROSTED_CATALOG animal id -> the ZoneKey its silhouette/items live in. */
const ANIMAL_TO_ZONE: Record<string, ZoneKey> = {
  fv_rabbit: "village",
  fv_fox: "bridge",
  fv_deer: "grove",
  fv_squirrel: "waterfall",
  fv_polarbear: "crystals",
  fv_penguin: "shore",
};

// settles directly on the rabbit — its exact spot in the fenced yard (see buildAnimals)
const START_FOCUS = { x: ZONES.village.x - 556, y: ZONES.village.y + 739 };
/** Settle zoom after the opening reveal: wide enough to read a whole clearing
 * (a cottage plus its neighbors), not so tight it crops against one building. */
const SETTLE_ZOOM = 0.58;
const OVERVIEW_CENTER = { x: (ZONES.village.x + ZONES.crystals.x) / 2, y: (ZONES.village.y + ZONES.crystals.y) / 2 };

const wait = (scene: Phaser.Scene, ms: number) => new Promise<void>((res) => scene.time.delayedCall(ms, res));

/**
 * What KIND of magic a restore cinematic plays, keyed by FrostedResourceDef.id
 * (stable across every animal — "well"/"pool"/"waterfall" are all water, etc).
 * Drives color + the specific motion in `playRestoreTransform` below, so the
 * world visibly repairs in a way that fits the object instead of one generic
 * effect reused everywhere. Unlisted ids (future resources) fall back to
 * "ice" — the most common Frosted Valley material.
 */
type RestoreFlavor = "water" | "plant" | "wind" | "ice" | "sign";
const RESOURCE_FLAVOR: Record<string, RestoreFlavor> = {
  well: "water",
  pool: "water",
  waterfall: "water",
  carrots: "plant",
  flowerbed: "plant",
  nest: "plant",
  chime: "wind",
  signpost: "sign",
};
const FLAVOR_TINT: Record<RestoreFlavor, number> = {
  water: 0x6fd0ff,
  plant: 0x8fe08a,
  wind: 0xffe08a,
  ice: 0xbfe8ff,
  sign: 0xffcf8a,
};
function restoreFlavor(resourceId: string): RestoreFlavor {
  return RESOURCE_FLAVOR[resourceId] ?? "ice";
}

interface ZoneAnimalRec {
  animalId: string;
  sprite: Phaser.GameObjects.Image;
  badge: Phaser.GameObjects.Text;
  height: number;
  /** Set once the animal is unlocked — the living NPC that replaced the silhouette. */
  npc?: FrostedAnimalNpc;
  x: number;
  y: number;
  radius: number;
  hint: string;
  revealed: boolean;
  normalKey: string;
  flip: boolean;
}

/** ZoneKey -> the FROSTED_CATALOG animal that lives there. */
const ZONE_TO_ANIMAL = Object.fromEntries(Object.entries(ANIMAL_TO_ZONE).map(([a, z]) => [z, a])) as Record<ZoneKey, string>;

/** A standing prop's ground footprint, where a roaming animal must not walk. */
interface FootRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The bottom slice of an image's bounds (its base on the ground), a little narrower than the art. */
function footprintOf(o: Phaser.GameObjects.Image): FootRect {
  const b = o.getBounds();
  const depth = Math.min(b.height * 0.4, 160);
  return { x0: b.x + b.width * 0.08, x1: b.right - b.width * 0.08, y0: b.bottom - depth, y1: b.bottom + 15 };
}

function inFootprint(p: Pt, r: FootRect): boolean {
  return p.x >= r.x0 && p.x <= r.x1 && p.y >= r.y0 && p.y <= r.y1;
}

/** The screen-pinned coin counter — a pure view of `economy.coins`, never a second balance. */
interface CoinHud {
  /** Pinned to the top-right corner; its origin is the pill's right edge so it grows leftward. */
  root: Phaser.GameObjects.Container;
  /** Everything visible — scaled by the change "pop" without fighting root's 1/zoom scale. */
  body: Phaser.GameObjects.Container;
  pill?: Phaser.GameObjects.Container;
  pillW: number;
  icon: Phaser.GameObjects.Image;
  text: Phaser.GameObjects.Text;
  /** The number currently drawn — only lags economy.coins while a count-up tween runs. */
  shown: number;
  counting: boolean;
}

const COIN_HUD_H = 46;

interface ItemPairRec {
  damaged: Phaser.GameObjects.Image;
  restored: Phaser.GameObjects.Image;
  animalId?: string;
  resourceId?: string;
}

export class FrostedValleyScene extends Phaser.Scene {
  private camera!: CameraController;
  private flowBusy = false;
  private skipBtn?: Phaser.GameObjects.Container;
  private skipBtnCleanup?: () => void;
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
  private shopPos = { x: 0, y: 0, radius: 0 };
  private placementController?: FrostedPlacementController;
  private shopPlacementSprites = new Map<string, Phaser.GameObjects.Image>();
  private placementMenu?: Phaser.GameObjects.Container;
  /** Story / envelope notes for the guided Rabbit + Fox chapters (see story/FrostedStoryDirector). */
  private story!: FrostedStoryDirector;
  private coinHud?: CoinHud;
  /** The rabbit's fenced-yard art: the roaming rabbit always draws above it (see startAnimalRoaming). */
  private rabbitYard?: Phaser.GameObjects.Image;
  /** False until the opening reveal settles, so the counter never blips in before the intro letter pauses the scene. */
  private coinHudArmed = false;

  constructor() {
    super("FrostedValley");
  }

  preload(): void {
    for (const key of FV_KEYS) this.load.image(key, `assets/frosted/${key}.png`);
    this.load.image("fv_glade_ground", "assets/frosted/fv_glade_ground.jpg");
    this.load.image("fv_glade_ground_water", "assets/frosted/fv_glade_ground_water.jpg");
    this.load.image("fv_ground_waterfall", "assets/frosted/fv_ground_waterfall.jpg");
    this.load.image("fv_ground_river_bend", "assets/frosted/fv_ground_river_bend.jpg");
    // Winter Market (Shop) — its own building art plus the full purchasable
    // catalog; loaded here (not through NATIVE_H/FV_KEYS) since their scale
    // is computed at runtime from the loaded texture instead of a
    // hand-measured native-height table
    this.load.image("fv_shop_world", "assets/frosted/shop/fv_shop_world.png");
    for (const item of FROSTED_SHOP_CATALOG) {
      this.load.image(item.textureKey, `assets/frosted/shop/${item.textureKey}.png`);
    }
  }

  create(): void {
    this.locked = !progression.isGardenComplete();
    // TEMP TESTING ONLY — forces the world open regardless of Garden completion,
    // so it can be inspected without a fake save. Revert before committing.
    this.locked = false;
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
    this.shopPlacementSprites.clear();
    this.placementMenu = undefined;
    this.placementController = new FrostedPlacementController(this);

    this.buildSky();
    this.buildGround();
    this.buildPath();
    this.buildWaterSparkle();
    this.buildAtmosphere();
    this.buildForestFringe();
    this.buildDenseForest();
    this.buildVillageZone();
    this.buildShop();
    this.buildBridgeZone();
    this.buildRestorationGrove();
    this.buildWaterfallZone();
    this.buildCrystalZone();
    this.buildFrozenShore();
    this.buildGlade();
    this.buildAnimals();
    this.renderShopPlacements();
    this.buildForeground();
    this.buildSnowfall();

    this.camera = new CameraController(this, { w: WORLD_W, h: WORLD_H });
    this.camera.onTap = (x, y) => this.handleTap(x, y);
    this.story = new FrostedStoryDirector({
      scene: this,
      requirementSprite: (animalId, resourceId) => this.findItemPair(animalId, resourceId)?.damaged,
      animalSprite: (animalId) => this.zoneAnimals[ANIMAL_TO_ZONE[animalId]]?.sprite,
      lock: () => {
        const prev = this.flowBusy;
        this.flowBusy = true;
        this.camera.disable();
        return () => {
          this.flowBusy = prev;
          if (!prev) this.camera.enable();
        };
      },
      triggerRestore: (animalId, resourceId) => this.triggerRestore(animalId, resourceId),
      openPuzzle: (animalId) => this.openPuzzle(animalId),
      showHint: (x, y, message) => this.showHint(x, y, message),
      guideToShop: () => this.guideToShop(),
    });
    // NOT widened yet here — the opening reveal's frameWide() establishing
    // shot uses this same minZoom, so widening it before the reveal plays
    // makes the intro zoom out to fit the ENTIRE map (comically distant).
    // applyWideZoomOut() runs once the reveal finishes instead.

    this.startIdleBreathing();
    this.startAmbientAnimation();

    const backBtn = makeIconButton(this, 0, 0, "‹", 26, () => this.close(), {
      hitW: 56,
      hitH: 56,
      color: "#fef6e8",
    });
    backBtn.setDepth(9500);
    this.pinToScreen(backBtn, 56, safeInsets().top + 34);

    this.coinHudArmed = false;
    this.buildCoinHud();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    });

    this.time.delayedCall(60, () => this.maybeShowIntroLetter());

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__dgFrostedValley = {
        // fill + restore every requirement of the current animal, so its puzzle unlocks
        completeRequirements: (animalId?: string) =>
          this.devCompleteRequirements(animalId ?? frostedProgression.currentAnimal?.id ?? ""),
        puzzle: (animalId?: string) => this.openPuzzle(animalId ?? frostedProgression.currentAnimal?.id ?? ""),
        // replay the unlock cinematic for a solved-but-not-yet-unlocked animal
        unlock: (animalId?: string) => void this.playUnlockCinematic(animalId ?? frostedProgression.currentAnimal?.id ?? ""),
        skipTour: () => (this.tourSkipped = true),
        // draws every animal's roam area (green), no-go holes (red), prop
        // footprints (orange), landmark stand spots (blue) and home (white)
        debugRoam: () => this.devDrawRoamAreas(),
        // forget every story/tutorial note's seen-flag (then reload)
        resetStoryNotes: () => {
          frostedProgression["save"].state.frostedValley.storyNotesSeen = {};
          frostedProgression["save"].saveNow();
        },
        // TEMP: launches the Garden Maze directly, before the real Request
        // screen exists, so the maze engine itself can be tested end-to-end
        playMaze: (animalId: string, resourceId: string) => {
          this.scene.pause();
          this.scene.launch("GardenMaze", { animalId, resourceId });
        },
      };
    }
  }

  private onResize(): void {
    this.camera?.onResize();
    this.applyWideZoomOut();
  }

  /**
   * Frosted Valley's world is far larger than the shared CameraController's
   * default overview reference, so its viewport-based min-zoom leaves the
   * player unable to pull back far enough to see the whole valley at once.
   * CameraController itself is shared with the Garden and must not change,
   * so this reaches into the instance directly to lower just this scene's
   * floor — computed from the actual viewport against the FULL world size
   * (not a fixed guess), so zooming all the way out always fits everything.
   */
  private applyWideZoomOut(): void {
    const cam = this.camera as unknown as { minZoom: number };
    const view = this.cameras.main;
    const fitWholeWorld = Math.min(view.width / WORLD_W, view.height / WORLD_H) * 0.97;
    cam.minZoom = Math.min(cam.minZoom, fitWholeWorld);
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

  /**
   * The current animal's own letter, shown before the world reveal — the
   * rabbit's doubles as the whole game's intro letter. Only ever shown once
   * per animal (see FrostedValleyProgressionService.isLetterSeen).
   */
  private maybeShowIntroLetter(): void {
    const animal = frostedProgression.currentAnimal;
    // story-driven animals get their envelope note beside them once the
    // camera arrives (FrostedStoryDirector.onSettled), not a full-screen letter first
    if (animal && !frostedProgression.isLetterSeen(animal.id) && !storyFor(animal.id)) {
      this.scene.pause();
      this.scene.launch("FrostedLetter", { animalId: animal.id });
      this.events.once(Phaser.Scenes.Events.RESUME, () => void this.playOpeningReveal());
    } else {
      void this.playOpeningReveal();
    }
  }

  /**
   * Where the camera should settle: the CURRENT animal's own real position,
   * not a hardcoded spot. A real bug lived here before — the opening/return
   * camera always settled on the rabbit's yard (a fixed constant) even for
   * a player already progressed past the rabbit, so re-entering the world
   * visually showed the wrong animal while the auto-opening Request screen
   * (which already correctly used frostedProgression.currentAnimal) talked
   * about a different one. zoneAnimals is fully populated by buildAnimals()
   * before this can ever be called.
   */
  private currentAnimalFocus(): { x: number; y: number } {
    const animalId = frostedProgression.currentAnimal?.id;
    const zone = animalId ? ANIMAL_TO_ZONE[animalId as keyof typeof ANIMAL_TO_ZONE] : undefined;
    const rec = zone ? this.zoneAnimals[zone] : undefined;
    if (rec) return { x: rec.x, y: rec.y };
    return START_FOCUS;
  }

  private async playOpeningReveal(): Promise<void> {
    this.flowBusy = true;
    this.camera.disable();
    this.camera.frameWide(OVERVIEW_CENTER.x, OVERVIEW_CENTER.y);
    this.showSkip();
    if (!this.tourSkipped) await wait(this, 1600);
    this.hideSkip();
    const focus = this.currentAnimalFocus();
    await this.camera.focusOn(focus.x, focus.y, this.tourSkipped ? 500 : 950, SETTLE_ZOOM);
    this.camera.enable();
    // widen the zoom-out floor only now that the establishing shot is done,
    // so the player can pull back further than frameWide's own overview —
    // see the comment where this.camera is constructed
    this.applyWideZoomOut();
    this.flowBusy = false;
    this.coinHudArmed = true;
    const current = frostedProgression.currentAnimal?.id;
    // the puzzle was solved but the page closed before the unlock finished:
    // play the cinematic once now instead of losing (or skipping) it
    if (current && frostedProgression.isUnlockPending(current)) {
      await wait(this, 400);
      await this.playUnlockCinematic(current);
      return;
    }
    await this.story.shopIntro();
    if (await this.story.onSettled(current)) return;
    this.scheduleAutoRequest(current);
  }

  /**
   * 3 seconds after settling on the current animal — whether that's the
   * opening reveal or a later camera hand-off after a rescue — its Request
   * screen opens on its own, so the player immediately understands "this is
   * what I need to do to help this friend." Only for an animal that still
   * needs help; does nothing once it's rescued.
   */
  private scheduleAutoRequest(animalId: string | undefined): void {
    if (!animalId) return;
    this.time.delayedCall(3000, () => {
      if (this.flowBusy || frostedProgression.isRescued(animalId) || !frostedProgression.isCurrentAnimal(animalId)) return;
      this.openRequest(animalId);
    });
  }

  private showSkip(): void {
    const btn = makeIconButton(
      this,
      0,
      0,
      "Skip ›",
      18,
      () => {
        Sfx.tap();
        this.tourSkipped = true;
      },
      { color: "#fef6e8", hitW: 112, hitH: 50 },
    );
    btn.setDepth(9500);
    this.skipBtnCleanup = this.pinToScreen(btn, this.scale.width - 74, safeInsets().top + 34);
    this.skipBtn = btn;
  }

  private hideSkip(): void {
    this.registry.set("pointerOnUI", false);
    this.skipBtnCleanup?.();
    this.skipBtnCleanup = undefined;
    this.skipBtn?.destroy();
    this.skipBtn = undefined;
  }

  /**
   * Keeps `obj` pinned to a fixed SCREEN point regardless of the world
   * camera's current pan or zoom. `scrollFactor(0)` alone is not enough:
   * Phaser still applies the camera's ZOOM to scrollFactor-0 objects (only
   * pan is cancelled), and this world is pinch/wheel-zoomable — so at any
   * zoom other than 1 a scrollFactor(0)-only element renders shrunk and
   * dragged toward the zoom focal point, nowhere near where a player would
   * actually tap. Returns a cleanup function to stop tracking.
   */
  private pinToScreen(obj: Phaser.GameObjects.Container, screenX: number, screenY: number): () => void {
    return this.pinToScreenAt(obj, () => ({ x: screenX, y: screenY, scale: 1 }));
  }

  /** pinToScreen with a position re-read every frame, for elements anchored to a viewport edge that must follow resizes. */
  private pinToScreenAt(
    obj: Phaser.GameObjects.Container,
    at: () => { x: number; y: number; scale: number },
  ): () => void {
    const reposition = () => {
      const cam = this.cameras.main;
      const a = at();
      const pt = cam.getWorldPoint(a.x, a.y);
      obj.setPosition(pt.x, pt.y).setScale(a.scale / cam.zoom);
    };
    reposition();
    this.events.on(Phaser.Scenes.Events.UPDATE, reposition, this);
    return () => this.events.off(Phaser.Scenes.Events.UPDATE, reposition, this);
  }

  /* ================= coin counter ================= */

  /**
   * Top-right, mirroring the back button: nothing else lives there except
   * the opening tour's Skip button, and the counter is hidden for the whole
   * tour anyway. It is also hidden while any overlay (Request, Shop, Maze,
   * Puzzle, Letter) has this scene paused — each has its own focused UI, and
   * Shop/Maze already show the balance themselves — and during every
   * cinematic (`flowBusy`). When it comes back, it counts up/down to the
   * current `economy.coins`, so coins earned in the maze or spent in the
   * Shop land visibly on return. The value is read from `economy.coins`
   * every frame; `shown` is only the animated number on screen.
   */
  private buildCoinHud(): void {
    const root = this.add.container(0, 0).setDepth(9500).setAlpha(0);
    const body = this.add.container(0, 0);
    const icon = this.add.image(0, 0, "coin").setDisplaySize(30, 30);
    const text = this.add.text(0, 1, `${economy.coins}`, labelStyle(22)).setOrigin(0, 0.5);
    body.add([icon, text]);
    root.add(body);
    const hud: CoinHud = { root, body, pillW: 0, icon, text, shown: economy.coins, counting: false };
    this.coinHud = hud;
    this.layoutCoinHud();

    const stopPinning = this.pinToScreenAt(root, () => {
      const inset = safeInsets();
      // a touch smaller on narrow phones so it never crowds the back button
      const scale = this.scale.width < 380 ? 0.85 : 1;
      return { x: this.scale.width - inset.right - 16, y: inset.top + 34, scale };
    });

    const tick = () => {
      const visible = this.coinHudArmed && !this.flowBusy;
      root.alpha += ((visible ? 1 : 0) - root.alpha) * 0.2;
      if (Math.abs(root.alpha - (visible ? 1 : 0)) < 0.01) root.alpha = visible ? 1 : 0;
      // only animate once it's actually on screen, so the change is seen
      if (visible && root.alpha > 0.6 && !hud.counting && hud.shown !== economy.coins) this.animateCoinHudTo(economy.coins);
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, tick, this);
    // a paused scene still renders but gets no UPDATE, so hide it right away
    const hide = () => root.setAlpha(0);
    this.events.on(Phaser.Scenes.Events.PAUSE, hide, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      stopPinning();
      this.events.off(Phaser.Scenes.Events.UPDATE, tick, this);
      this.events.off(Phaser.Scenes.Events.PAUSE, hide, this);
      this.coinHud = undefined;
    });
  }

  /** Sizes the pill to the current number and lays the icon + number out inside it, right-aligned to root. */
  private layoutCoinHud(): void {
    const hud = this.coinHud;
    if (!hud) return;
    const w = Math.max(96, Math.ceil(hud.text.width) + 66);
    if (w !== hud.pillW) {
      hud.pill?.destroy();
      hud.pill = makePill(this, w, COIN_HUD_H);
      hud.body.addAt(hud.pill, 0);
      hud.pillW = w;
    }
    hud.body.setPosition(-w / 2, 0);
    hud.icon.setPosition(-w / 2 + 26, 0);
    hud.text.setX(-w / 2 + 48);
  }

  private setCoinHudText(n: number): void {
    const hud = this.coinHud;
    if (!hud) return;
    hud.shown = n;
    hud.text.setText(`${n}`);
    this.layoutCoinHud();
  }

  private animateCoinHudTo(total: number): void {
    const hud = this.coinHud;
    if (!hud) return;
    const from = hud.shown;
    const delta = total - from;
    hud.counting = true;
    const proxy = { v: from };
    this.tweens.add({
      targets: proxy,
      v: total,
      duration: Phaser.Math.Clamp(Math.abs(delta) * 40, 250, 700),
      ease: "Cubic.easeOut",
      onUpdate: () => this.setCoinHudText(Math.round(proxy.v)),
      onComplete: () => {
        this.setCoinHudText(total);
        hud.counting = false;
      },
    });

    // subtle feedback: a small pop, a glint on the coin, and a fading "+N"/"−N"
    this.tweens.killTweensOf(hud.body);
    hud.body.setScale(1);
    this.tweens.add({ targets: hud.body, scale: 1.1, duration: 120, yoyo: true, ease: "Sine.easeOut" });
    const glint = this.add
      .image(hud.icon.x, hud.icon.y, "glow")
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffe6a3)
      .setDisplaySize(52, 52)
      .setAlpha(0.8);
    hud.body.add(glint);
    this.tweens.add({ targets: glint, alpha: 0, scale: glint.scale * 1.4, duration: 420, ease: "Sine.easeOut", onComplete: () => glint.destroy() });

    const gain = delta > 0;
    const label = this.add
      .text(-hud.pillW + 48, COIN_HUD_H / 2 + 14, `${gain ? "+" : "−"}${Math.abs(delta)}`, {
        ...labelStyle(17, gain ? "#fff3cf" : "#ffd9d9"),
        stroke: gain ? "#8a5a12" : "#8a3434",
        strokeThickness: 4,
      })
      .setOrigin(0, 0.5);
    hud.root.add(label);
    this.tweens.add({ targets: label, y: label.y + 10, alpha: 0, duration: 900, delay: 350, ease: "Sine.easeIn", onComplete: () => label.destroy() });
  }

  /* ================= background / terrain ================= */

  private buildSky(): void {
    // the background image is terrain edge-to-edge — just a plain fallback
    // color behind it (visible only if the image hasn't painted a pixel) and
    // a couple of very faint drifting clouds for the tiniest touch of life.
    //
    // The shared CameraController pads its scroll bounds 400px past every
    // edge of the world (so tall props near an edge never feel cramped) —
    // that's in CameraController.ts, which is shared with the Garden and
    // must not change. Without this scene also painting that same padded
    // margin, scrolling into it at a high enough zoom shows nothing from
    // Frosted Valley at all, revealing whatever scene sits behind it
    // (Menu) through the gap. Matching the margin here, from this scene's
    // own side, closes that gap without touching the shared file.
    const CAM_BOUNDS_PADDING = 400;
    const fallback = this.add
      .rectangle(
        -CAM_BOUNDS_PADDING,
        -CAM_BOUNDS_PADDING,
        WORLD_W + CAM_BOUNDS_PADDING * 2,
        WORLD_H + CAM_BOUNDS_PADDING * 2,
        0xe7eff8,
        1,
      )
      .setOrigin(0, 0)
      .setDepth(-1000);
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
   * The world's ground is the same snow-drift floor used in the glade
   * (replacing the old single painted fv_world_bg image) so the whole world
   * reads as one consistent surface — plus richer icy/river-textured patches
   * over the zones that actually have water/ice landmarks. Every one of
   * these is a single stretched image, never a repeating tile: this source
   * art has no seamless edges, so tiling it always shows a hard grid no
   * matter how the edges are softened. One image = zero seams, by
   * construction, at the cost of some stretch (this image's aspect ratio is
   * close enough to the world's that it's barely noticeable).
   */
  private buildGround(): void {
    this.add.image(0, 0, "fv_glade_ground").setOrigin(0, 0).setDisplaySize(WORLD_W, MAIN_H).setDepth(-200);

    // one soft-edged texture patch per water/ice zone, each matched to the
    // landmark that actually lives there — kept tight around the actual
    // crossing/pool/cave mouth (not the whole zone), so it never sprawls out
    // under props that are supposed to be standing on plain snow
    this.buildSoftGroundPatch("fv_ground_river_bend", ZONES.bridge.x, ZONES.bridge.y, 1900, 1500);
    this.buildSoftGroundPatch("fv_ground_waterfall", ZONES.waterfall.x, ZONES.waterfall.y, 1900, 1600);
    this.buildSoftGroundPatch("fv_glade_ground_water", ZONES.crystals.x, ZONES.crystals.y, 2000, 1700);

    // the main ground image and the glade's own ground image (buildGlade)
    // are two independently-stretched copies of the same art, so the join
    // between them at y=MAIN_H is a hard seam — bridge it with a soft
    // vertically-faded strip of the same texture straddling that line
    this.buildLinearFadeStrip("fv_glade_ground", MAIN_H, WORLD_W, 1600);
  }

  /**
   * A single stretched image, faded top-and-bottom with a soft vertical
   * gradient, straddling `centerY` — used to bridge the seam between two
   * independently-stretched ground images that meet at that line.
   */
  private buildLinearFadeStrip(key: string, centerY: number, width: number, height: number): void {
    const maskKey = "fv_linear_fade_mask";
    if (!this.textures.exists(maskKey)) {
      const w = 8;
      const h = 512;
      const canvasTex = this.textures.createCanvas(maskKey, w, h);
      const ctx = canvasTex?.getContext();
      if (ctx) {
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        const steps = 24;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          // opaque through the middle third, easing out toward both ends
          const d = Math.abs(t - 0.5) * 2; // 0 at center, 1 at either edge
          const eased = d < 0.34 ? 1 : 1 - ((d - 0.34) / 0.66) ** 2;
          grad.addColorStop(t, `rgba(255,255,255,${Math.max(0, eased).toFixed(3)})`);
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        canvasTex?.refresh();
      }
    }

    const strip = this.add.image(0, centerY - height / 2, key).setOrigin(0, 0).setDisplaySize(width, height).setDepth(-198);
    const maskShape = this.add.image(width / 2, centerY, maskKey).setDisplaySize(width, height).setVisible(false);
    strip.setMask(maskShape.createBitmapMask());
  }

  /**
   * A single stretched (never tiled — see buildGround) ground image faded
   * out with a soft radial alpha mask, so the patch blends into the base
   * ground instead of reading as a separate rectangle.
   */
  private buildSoftGroundPatch(key: string, cx: number, cy: number, w: number, h: number): void {
    const maskKey = "fv_radial_fade_mask";
    if (!this.textures.exists(maskKey)) {
      const size = 512;
      const canvasTex = this.textures.createCanvas(maskKey, size, size);
      const ctx = canvasTex?.getContext();
      if (ctx) {
        // no flat opaque plateau at all — falls off from the very center,
        // and with an eased (squared) curve so the outer half fades much
        // more gradually than a plain linear gradient would
        const r = size / 2;
        const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
        const steps = 24;
        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const eased = 1 - t * t;
          grad.addColorStop(t, `rgba(255,255,255,${(eased * 0.85).toFixed(3)})`);
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        canvasTex?.refresh();
      }
    }

    // the patch is only modestly oversized relative to the actual water
    // feature (w,h) so the soft edge has room to fade, without ballooning
    // out into the open snow where zone props are meant to stand
    const padW = w * 1.3;
    const padH = h * 1.3;
    const patch = this.add.image(cx - padW / 2, cy - padH / 2, key).setOrigin(0, 0).setDisplaySize(padW, padH).setDepth(-195);

    const maskShape = this.add.image(cx, cy, maskKey).setDisplaySize(padW, padH).setVisible(false);
    patch.setMask(maskShape.createBitmapMask());
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
   * so each can crossfade to its restored state (see restoreWorldItem).
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
    // resolve which animal/resource this pair belongs to (by its damaged
    // asset key, which is unique per resource in FROSTED_CATALOG) so the
    // world can be built showing REAL persisted state, not always "damaged"
    let animalId: string | undefined;
    let resourceId: string | undefined;
    for (const a of FROSTED_CATALOG) {
      const r = a.resources.find((res) => res.damagedAsset === damagedKey);
      if (r) {
        animalId = a.id;
        resourceId = r.id;
        break;
      }
    }
    // a landmark that isn't anyone's request (the grove's fountain + sleeping
    // tree) is scenery: it wakes up with its zone's animal at the unlock
    const alreadyRestored =
      animalId && resourceId
        ? frostedProgression.resourceState(animalId, resourceId).restored
        : frostedProgression.isRescued(ZONE_TO_ANIMAL[zone]);

    const damaged = this.propH(damagedKey, x, y, targetHeight, { flip: opts.flip, alpha: alreadyRestored ? 0 : 1 });
    const restored = this.propH(restoredKey, x, y, targetHeight, {
      flip: opts.flip,
      depth: damaged.depth + 0.1,
      alpha: alreadyRestored ? 1 : 0,
    });
    (this.zoneItems[zone] ??= []).push({ damaged, restored, animalId, resourceId });
  }

  /** Every registered item pair across all zones, flattened — for Restore lookups by resource. */
  private findItemPair(animalId: string, resourceId: string): ItemPairRec | undefined {
    for (const items of Object.values(this.zoneItems)) {
      const found = items?.find((it) => it.animalId === animalId && it.resourceId === resourceId);
      if (found) return found;
    }
    return undefined;
  }

  /**
   * The full, ~6-second "the world is repairing itself" restore moment for
   * ONE resource — never an instant boolean-flip swap. Six beats, per the
   * spec: (A) camera travels in and centers the requirement, (B) a magical
   * glow gathers, (C) the actual transformation — its specific FLAVOR
   * (water/plant/wind/ice/sign, from the resource id — see RESOURCE_FLAVOR)
   * drives real differences in motion and color, not one generic effect
   * reused for everything, (D) a bigger emphasized reveal of the restored
   * object, (E) a finishing sparkle burst and a short hold. Borrows
   * `this.camera` via disable()/focusOn()/enable() the same way the opening
   * reveal and the next-animal hand-off already do — a dedicated, temporary
   * transition that never touches global zoom limits/config — and explicitly
   * PANS BACK to wherever the player's camera was before this ran, so the
   * world doesn't stay parked at the cinematic close-up. `flowBusy` (the
   * same flag `playOpeningReveal`/`playUnlockCinematic` use) blocks zone taps
   * for the duration, and the caller already closed the Request note before
   * calling this — so nothing else can be interacted with mid-cinematic.
   */
  private async restoreWorldItem(animalId: string, resourceId: string): Promise<void> {
    const rec = this.findItemPair(animalId, resourceId);
    if (!rec) return;

    this.flowBusy = true;
    const prevMid = { x: this.cameras.main.midPoint.x, y: this.cameras.main.midPoint.y };
    const prevZoom = this.camera.zoom;
    const flavor = restoreFlavor(resourceId);
    const tint = FLAVOR_TINT[flavor];

    this.camera.disable();

    // ---- A: 0.0-1.0s — travel to and center the requirement ----
    // a deliberate, close, "beautifully framed" shot — NOT just whatever
    // zoom the player happened to be browsing at (that was the old bug:
    // clamping the PRIOR zoom as a floor meant a wide-zoomed-out player saw
    // almost no camera move at all, leaving the requirement small and
    // off-center instead of the star of the moment).
    const closeZoom = 1.05;
    await this.camera.focusOn(rec.damaged.x, rec.damaged.y - 30, 950, closeZoom);
    await wait(this, 100);

    // ---- B: 1.0-2.0s — glow gathers, light builds ----
    Sfx.whoosh();
    const glow = await gatherGlow(this, rec.damaged.x, rec.damaged.y - 20, 650, tint);
    sparkleBurst(this, rec.damaged.x, rec.damaged.y - 10, 6, 36, tint);
    await wait(this, 350);

    // ---- C: 2.0-4.0s — the actual transformation, flavor-specific ----
    await this.playFlavorTransform(flavor, rec, tint);

    // ---- D: 4.0-5.3s — emphasized reveal of the restored object ----
    Sfx.sparkle();
    const revealGlow = await gatherGlow(this, rec.restored.x, rec.restored.y - 30, 420, tint);
    this.tweens.add({
      targets: rec.restored,
      scaleY: rec.restored.scaleY * 1.1,
      scaleX: rec.restored.scaleX * 1.04,
      duration: 260,
      yoyo: true,
      ease: "Sine.easeOut",
    });
    sparkleBurst(this, rec.restored.x, rec.restored.y - 50, 14, 55, tint);
    await wait(this, 480);
    this.tweens.add({ targets: revealGlow, alpha: 0, scale: 1.4, duration: 300, onComplete: () => revealGlow.destroy() });

    // ---- E: 5.3-6.0s — finishing burst, brief hold ----
    Sfx.fanfare();
    sparkleBurst(this, rec.restored.x, rec.restored.y - 40, 30, 75);
    this.tweens.add({ targets: glow, alpha: 0, scale: 1.5, duration: 380, onComplete: () => glow.destroy() });
    await wait(this, 420);

    // a subtle "it's alive" idle flourish that stays forever, per resource flavor
    this.startRestoredIdle(flavor, rec.restored);

    // camera returns to exactly where the player left it — never stays parked at the close-up
    await this.camera.focusOn(prevMid.x, prevMid.y, 650, prevZoom);
    this.camera.enable();
    this.flowBusy = false;
  }

  /**
   * The Phase-C beat (~2s): what actually happens to the object, differing
   * by flavor so the restoration reads as connected to the thing itself
   * rather than one interchangeable poof. All of these reuse existing FX
   * primitives (glow/sparkle/dust/tween) — no new art — just different
   * timing, motion, and tint per flavor.
   */
  private async playFlavorTransform(flavor: RestoreFlavor, rec: ItemPairRec, tint: number): Promise<void> {
    const { damaged, restored } = rec;

    if (flavor === "water") {
      // ice cracks and melts away in rippling rings
      dustRing(this, damaged.x, damaged.y - 6, tint);
      await wait(this, 220);
      dustRing(this, damaged.x, damaged.y - 6, tint);
      this.cameras.main.shake(220, 0.004);
      await wait(this, 260);
    } else if (flavor === "plant") {
      // snow shaken off, then growth
      petalPuff(this, damaged.x, damaged.y - 20, 12);
      this.tweens.add({ targets: damaged, y: damaged.y - 6, duration: 90, yoyo: true, repeat: 3 });
      await wait(this, 420);
    } else if (flavor === "wind") {
      // broken pieces reconnect and the chime begins to swing
      Sfx.bloomChime();
      this.tweens.add({
        targets: damaged,
        angle: { from: -7, to: 7 },
        duration: 130,
        yoyo: true,
        repeat: 3,
        ease: "Sine.easeInOut",
      });
      await wait(this, 300);
      Sfx.bloomChime();
      await wait(this, 180);
    } else if (flavor === "sign") {
      // pieces snap back together, snow falls off the base
      dustRing(this, damaged.x, damaged.y, tint);
      this.tweens.add({
        targets: damaged,
        x: { from: damaged.x - 5, to: damaged.x + 5 },
        duration: 55,
        yoyo: true,
        repeat: 4,
      });
      this.cameras.main.shake(240, 0.005);
      await wait(this, 340);
    } else {
      // ice (default): the cracks themselves glow before sealing shut
      const flash = await gatherGlow(this, damaged.x, damaged.y - 15, 260, tint);
      this.tweens.add({ targets: flash, alpha: 0, duration: 220, onComplete: () => flash.destroy() });
      await wait(this, 260);
    }

    // the shared crossfade + settle, every flavor ends here
    Sfx.sparkle();
    sparkleBurst(this, damaged.x, damaged.y - 40, 18, 50, tint);
    this.tweens.add({ targets: damaged, alpha: 0, duration: 480, ease: "Sine.easeIn" });
    if (flavor === "plant") {
      // sprouts up from a smaller scale rather than just fading in
      const fullScaleY = restored.scaleY;
      restored.setScale(restored.scaleX, fullScaleY * 0.55);
      this.tweens.add({ targets: restored, alpha: 1, scaleY: fullScaleY, duration: 560, ease: "Back.easeOut" });
    } else {
      this.tweens.add({ targets: restored, alpha: 1, duration: 560, ease: "Sine.easeOut" });
    }
    await wait(this, 600);
  }

  /** A small, permanent "it's alive" touch on a freshly-restored object — never the full cinematic again. */
  private startRestoredIdle(flavor: RestoreFlavor, restored: Phaser.GameObjects.Image): void {
    if (flavor === "wind") {
      this.tweens.add({ targets: restored, angle: { from: -2.5, to: 2.5 }, duration: 2200, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    } else if (flavor === "water") {
      this.tweens.add({ targets: restored, scaleY: restored.scaleY * 1.015, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
  }

  /**
   * Public entry point for the FrostedRequest scene's Restore button: performs
   * the actual world crossfade for one resource. If that was the animal's
   * LAST requirement, its reward puzzle unlocks: the silhouette's badge turns
   * to 🧩 and the Request screen reopens showing every item restored and the
   * "Complete the Puzzle" button — never before.
   */
  async triggerRestore(animalId: string, resourceId: string): Promise<void> {
    if (!frostedProgression.canRestore(animalId, resourceId)) return;
    // guided chapters: a short "all collected!" note first (the cinematic itself stays text-free)
    if (this.story.handles(animalId)) await this.story.celebrate(animalId, resourceId);
    if (!frostedProgression.restoreResource(animalId, resourceId)) return;
    await this.restoreWorldItem(animalId, resourceId);
    if (frostedProgression.isPuzzleAvailable(animalId)) this.refreshAnimalBadge(animalId);
    if (this.story.handles(animalId)) {
      // next requirement lights up, or the "all restored → puzzle" note
      await wait(this, 400);
      await this.story.afterRestore(animalId);
      return;
    }
    if (frostedProgression.isPuzzleAvailable(animalId)) {
      await wait(this, 700);
      if (!this.flowBusy) this.openRequest(animalId);
    }
  }

  /** Launch the animal's reward jigsaw (Request screen's "Complete the Puzzle"). */
  openPuzzle(animalId: string): void {
    if (!frostedProgression.isPuzzleAvailable(animalId)) return;
    Sfx.sparkle();
    this.scene.pause();
    this.scene.launch("FrostedPuzzle", { animalId });
  }

  /**
   * After a rescue, if a next animal just became current and hasn't seen its
   * own letter yet: pan the camera to its habitat, then show that letter —
   * "next animal unlocks -> letter -> camera moves to its habitat" per spec.
   */
  private async showNextAnimalLetterIfAny(): Promise<void> {
    const next = frostedProgression.currentAnimal;
    if (!next) return;
    const storyDriven = this.story.handles(next.id);
    if (storyDriven ? frostedProgression.isStoryNoteSeen(storyFor(next.id)!.intro.id) : frostedProgression.isLetterSeen(next.id)) {
      if (storyDriven) this.story.refreshHighlight();
      return;
    }
    const nextZoneKey = ANIMAL_TO_ZONE[next.id];
    const nextPos = nextZoneKey ? ZONES[nextZoneKey] : null;
    if (nextPos) {
      this.camera.disable();
      await this.camera.focusOn(nextPos.x, nextPos.y, 1400, SETTLE_ZOOM);
      this.camera.enable();
    }
    if (storyDriven) {
      await this.story.onSettled(next.id);
      return;
    }
    this.scene.pause();
    this.scene.launch("FrostedLetter", { animalId: next.id });
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
      village: 1300,
      bridge: 820,
      grove: 1050,
      waterfall: 1250,
      crystals: 1250,
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
    // cell was 300 — at this world's size that filled the background with
    // ~900+ individual sprites, and since they're texture-interleaved by
    // depth (not grouped), WebGL couldn't batch them: nearly one draw call
    // per tree, which measured at ~6fps once the forest finished building.
    // A bigger cell keeps the same "continuous forest" read with roughly a
    // quarter of the sprite count.
    const cell = 600;
    for (let gy = HORIZON + 200; gy < WORLD_H - 120; gy += cell) {
      for (let gx = 0; gx < WORLD_W; gx += cell) {
        const x = gx + rand() * cell;
        const y = gy + rand() * cell;

        const inZone = (Object.keys(ZONES) as ZoneKey[]).some((key, i) => {
          const z = zoneList[i];
          return Phaser.Math.Distance.Between(x, y, z.x, z.y) < clearingRadius[key];
        });
        if (inZone) continue;
        // the hidden glade (below the painted map) gets its own clearing too
        if (Phaser.Math.Distance.Between(x, y, GLADE.x, GLADE.y) < 1250) continue;

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
          // only a sparse sample of the background forest sways — with
          // hundreds of these trees, giving every single one its own
          // infinite repeating tween was the dominant per-frame cost in the
          // whole scene (measured: ~6fps once the forest was fully built).
          // A light scattering of movement reads the same to the eye.
          if (rand() < 0.08) this.treeSwayTargets.push(tree);
        }
      }
    }
  }

  /* ================= ZONE A: Snowy Village ================= */

  private buildVillageZone(): void {
    const z = ZONES.village;
    // framing pines pushed well clear of the treehouse/cottage footprint —
    // pine_c in particular used to sit close enough, with a large enough y,
    // to draw in front of and cover part of the treehouse
    this.treeSwayTargets.push(this.propH("fv_pine", z.x - 950, z.y - 550, 560));
    this.treeSwayTargets.push(this.propH("fv_pine_c", z.x - 1250, z.y + 250, 620));
    this.treeSwayTargets.push(this.propH("fv_pine_b", z.x + 900, z.y - 580, 540));
    this.treeSwayTargets.push(this.propH("fv_pine_d", z.x - 1150, z.y - 650, 480));
    // two more, kept safely behind the buildings (small y, drawn well
    // before them) purely for background density — never in front
    this.treeSwayTargets.push(this.propH("fv_pine_b", z.x - 450, z.y - 700, 500));
    this.treeSwayTargets.push(this.propH("fv_pine", z.x + 1150, z.y - 620, 500));
    // village buildings scaled up ~25% so they read as prominent focal points
    // next to the trees, not lost among them
    this.propH("fv_magic_treehouse", z.x - 620, z.y - 40, 980, { tint: 0xe8e2f5 });
    this.groundShadow(z.x - 620, z.y - 40, 620, z.y - 40);
    this.chimneySpots.push({ x: z.x - 560, y: z.y - 40 - 920 });

    // cottages get real breathing room between them, widened along with the scale-up
    this.propH("fv_cottage_a", z.x - 140, z.y - 40, 750);
    this.groundShadow(z.x - 140, z.y - 40, 500, z.y - 40);
    this.chimneySpots.push({ x: z.x - 50, y: z.y - 40 - 700 });
    this.propH("fv_cottage_b", z.x + 780, z.y + 20, 650);
    this.groundShadow(z.x + 780, z.y + 20, 440, z.y + 20);
    this.chimneySpots.push({ x: z.x + 870, y: z.y + 20 - 600 });
    this.propH("fv_cottage_c", z.x + 1520, z.y + 140, 590);
    this.groundShadow(z.x + 1520, z.y + 140, 390, z.y + 140);
    this.chimneySpots.push({ x: z.x + 1600, y: z.y + 140 - 540 });
    this.lanternSpots.push({ x: z.x - 240, y: z.y - 300 }, { x: z.x + 640, y: z.y - 260 }, { x: z.x + 1380, y: z.y - 100 });

    this.propH("fv_birdhouse_post", z.x + 980, z.y - 10, 300);
    this.swayTargets.push(this.propH("fv_flower_bush", z.x + 300, z.y + 130, 210));
    this.propH("fv_lamppost", z.x - 260, z.y + 220, 338);
    this.lanternSpots.push({ x: z.x - 260, y: z.y + 24 });
    this.propH("fv_flower_arch", z.x - 1400, z.y + 120, 320);
    this.propH("fv_hedge", z.x + 1000, z.y + 320, 200);
    this.propH("fv_snowrock_a", z.x + 1500, z.y - 100, 220);

    // a frozen, faintly-glowing stream threading between the treehouse and
    // the frosty cottage beside it, so the two buildings read as naturally
    // separated rather than pressed together
    this.buildBuildingDivideStream(
      [
        { x: z.x - 470, y: z.y - 560 },
        { x: z.x - 430, y: z.y - 360 },
        { x: z.x - 480, y: z.y - 160 },
        { x: z.x - 420, y: z.y + 20 },
        { x: z.x - 390, y: z.y + 120 },
      ],
    );

    // ---- the rabbit's fenced yard: one unified pre-built asset (fence +
    // barrels + gravel path stub), with the bed and rabbit kept as separate
    // live sprites layered exactly over the gap left open for them ----
    // shifted further left (with the carrots bed) and enlarged a bit
    const ry = { x: z.x - 500, y: z.y + 520 };

    // fv_rabbit_yard.png is 1024×607 native pixels. ry marks the shape's own
    // center, and propH's origin is bottom-center, so the anchor passed
    // below sits half the displayed height under ry.
    const YARD_TH = 980;
    const YARD_DISP_W = (1024 * YARD_TH) / NATIVE_H.fv_rabbit_yard;
    const YARD_DISP_H = YARD_TH;
    const yardAnchor = { x: ry.x, y: ry.y + YARD_DISP_H / 2 };
    const yardT = yardAnchor.y - YARD_DISP_H;

    // backdrop pines just behind the yard art, plus a denser inside-back
    // cluster at varying heights so it reads as rich and forested
    this.treeSwayTargets.push(this.propH("fv_pine_c", ry.x - 300, yardT - 100, 480));
    this.treeSwayTargets.push(this.propH("fv_pine_b", ry.x + 300, yardT - 100, 460));
    this.treeSwayTargets.push(this.propH("fv_pine_d", ry.x - 150, yardT + 90, 560));
    this.treeSwayTargets.push(this.propH("fv_pine", ry.x + 20, yardT + 60, 620));
    this.treeSwayTargets.push(this.propH("fv_pine_c", ry.x + 190, yardT + 100, 460));
    this.treeSwayTargets.push(this.propH("fv_pine_b", ry.x - 280, yardT + 150, 400));

    // the fence + barrels + path-stub, all one static image
    this.rabbitYard = this.propH("fv_rabbit_yard", yardAnchor.x, yardAnchor.y, YARD_TH);

    // the flower bed and the rabbit are cut out of the yard art (a rectangle
    // erased at asset-space x:[385,570] y:[275,380] of the 1024×607 source),
    // so they're placed here as live sprites at that same spot, converted to
    // world units: offset = (fx-0.5)*dispW, -(1-fy)*dispH around yardAnchor
    const bedHoleX = yardAnchor.x + (0.4663 - 0.5) * YARD_DISP_W; // ≈ ry.x - 39
    const bedHoleY = yardAnchor.y - (1 - 0.5395) * YARD_DISP_H; // ≈ ry.y + 27
    // the rabbit itself takes the exact center of the square (see
    // buildAnimals); the bed sits just beside that center, not on top of it
    this.itemPair("village", "fv_rabbit_carrots_damaged", "fv_rabbit_carrots_restored", bedHoleX - 90, bedHoleY + 15, 180);

    // just outside the yard's front-right corner, past the baked-in gravel
    // path stub: a single bench, with the glowing crystal right beside it
    this.propH("fv_bench", yardAnchor.x + 420, yardAnchor.y - 40, 247);
    // a pretty flower bush right beside the bench, not the chunky crystal
    // rock that used to crowd it — that crystal moved elsewhere in the yard
    this.swayTargets.push(this.propH("fv_flower_bush", yardAnchor.x + 500, yardAnchor.y - 10, 210));
    this.crystalTargets.push(this.propH("fv_crystal_d", yardAnchor.x - 480, yardAnchor.y - 260, 200));

    // the well sits well clear of the cottages now, out in the open snow
    // below and between them, and the wind chime stays near the buildings
    this.itemPair("village", "fv_rabbit_well_damaged", "fv_rabbit_well_restored", z.x + 600, z.y + 520, 494);
    this.itemPair("village", "fv_rabbit_chime_damaged", "fv_rabbit_chime_restored", z.x + 380, z.y - 20, 300);
  }

  /**
   * The Winter Market — placed above the village's houses (which are
   * themselves above the rabbit's yard), so the composition reads
   * SHOP -> HOUSES -> RABBIT top to bottom exactly as asked. Sits well clear
   * of the treehouse's own top edge (see buildVillageZone's treehouse at
   * z.x-620,z.y-40, height 980 -> its top is at z.y-1020).
   */
  private buildShop(): void {
    const z = ZONES.village;
    const SHOP_NATIVE_H = 1024; // fv_shop_world.png's real pixel height
    const SHOP_TH = 900;
    const shopX = z.x - 560;
    const shopY = z.y - 1140;

    this.treeSwayTargets.push(this.propH("fv_pine_c", shopX - 620, shopY - 460, 500));
    this.treeSwayTargets.push(this.propH("fv_pine_b", shopX + 640, shopY - 420, 480));

    const shopImg = this.add.image(shopX, shopY, "fv_shop_world").setOrigin(0.5, 1).setScale(SHOP_TH / SHOP_NATIVE_H);
    shopImg.setDepth(shopY);
    this.groundShadow(shopX, shopY, 560, shopY);

    // a soft, slow pulsing glow — the same "this is tappable" affordance
    // language as the rest of the valley's interactive landmarks
    const glow = this.add.ellipse(shopX, shopY - 260, 340, 140, 0xfff2c9, 0.2).setDepth(shopY - 0.2);
    this.tweens.add({ targets: glow, alpha: 0.4, duration: 1500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    this.shopPos = { x: shopX, y: shopY, radius: 320 };
  }

  /** Every previously-placed Shop decoration, rebuilt fresh on load — see FrostedShopService. */
  private renderShopPlacements(): void {
    for (const p of frostedShop.listPlacements()) this.spawnPlacementSprite(p);
  }

  private spawnPlacementSprite(placement: FrostedShopPlacement): void {
    const def = frostedShop.def(placement.itemId);
    if (!def) return;
    const img = this.add.image(placement.x, placement.y, def.textureKey).setOrigin(0.5, 1);
    const native = img.height || def.targetHeight;
    // divide out the PNG's own transparent padding so `targetHeight` is the
    // item's TRUE visible height, matching the world's other buildings —
    // without this a padded shop asset renders smaller than intended (see
    // FrostedShopItemDef.visibleHeightFraction)
    img.setScale(def.targetHeight / (native * (def.visibleHeightFraction ?? 1)));
    img.setAngle(placement.rotation);
    img.setDepth(placement.y);
    this.shopPlacementSprites.set(placement.id, img);
  }

  /**
   * A short, faintly-glowing frozen brook drawn as a soft ribbon of graphics
   * (no new art needed) — a small local accent to visually separate two
   * buildings, distinct from the main painted river in fv_world_bg.
   */
  private buildBuildingDivideStream(
    points: Array<{ x: number; y: number }>,
    widths: { core: number; highlight: number } = { core: 46, highlight: 18 },
  ): void {
    // a Catmull-Rom spline through the same anchor points turns the sharp
    // zigzag of straight segments into one smooth, naturally curving river
    const curve = new Phaser.Curves.Spline(points.map((p) => new Phaser.Math.Vector2(p.x, p.y)));
    const smooth = curve.getPoints(points.length * 12);

    const g = this.add.graphics().setDepth(-140);
    const draw = (width: number, color: number, alpha: number) => {
      g.lineStyle(width, color, alpha);
      g.beginPath();
      g.moveTo(smooth[0].x, smooth[0].y);
      for (let i = 1; i < smooth.length; i++) g.lineTo(smooth[i].x, smooth[i].y);
      g.strokePath();
    };
    draw(widths.core, 0xaee3f5, 0.5);
    draw(widths.highlight, 0xf3fbff, 0.65);

    points.forEach((p, i) => {
      this.time.delayedCall(i * 400, () => {
        this.time.addEvent({
          delay: 1600 + Math.random() * 1000,
          loop: true,
          callback: () => {
            const dot = this.add
              .image(p.x + Phaser.Math.Between(-20, 20), p.y + Phaser.Math.Between(-10, 10), "fv_star_sparkle")
              .setScale(0.045)
              .setAlpha(0)
              .setDepth(-139);
            this.tweens.add({ targets: dot, alpha: 0.8, duration: 800, yoyo: true, onComplete: () => dot.destroy() });
          },
        });
      });
    });
  }

  /* ================= ZONE B: Bridge / River crossing ================= */

  private buildBridgeZone(): void {
    const z = ZONES.bridge;
    this.propH("fv_bridge", z.x, z.y, 480);
    this.propH("fv_icicles", z.x - 460, z.y + 60, 240);
    this.swayTargets.push(this.propH("fv_flower_bush", z.x + 420, z.y + 90, 200));
    this.treeSwayTargets.push(this.propH("fv_pine", z.x + 600, z.y - 340, 520));
    this.treeSwayTargets.push(this.propH("fv_pine_c", z.x - 640, z.y - 260, 560));
    // a second cart on the far bank, echoing the two-cart composition near
    // the crossing in the reference
    this.propH("fv_wheelbarrow", z.x - 780, z.y + 180, 210);
    this.propH("fv_wheelbarrow", z.x + 740, z.y + 60, 200, { flip: true });
    this.swayTargets.push(this.propH("fv_flower_cluster_a", z.x - 260, z.y + 280, 170));
    this.propH("fv_snowrock_b", z.x + 300, z.y + 340, 210);
    // lantern posts flank the bridge itself, lighting the crossing
    this.propH("fv_lamppost", z.x - 220, z.y - 40, 260);
    this.propH("fv_lamppost", z.x + 220, z.y - 40, 260, { flip: true });
    this.lanternSpots.push({ x: z.x - 220, y: z.y - 40 - 240 }, { x: z.x + 220, y: z.y - 40 - 240 });
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
    // scenery that wakes up with the deer at its unlock (see wakeZoneScenery)
    this.itemPair("grove", "fv_fountain_damaged", "fv_fountain_restored", z.x, z.y, 480);
    this.itemPair("grove", "fv_dead_tree", "fv_magic_tree_restored", z.x - 720, z.y + 60, 480);
    this.groundShadow(z.x, z.y, 440, z.y);

    // a dense blossom-tree canopy clustered behind the fountain, echoing the
    // reference's tight tree mass instead of a single isolated tree
    this.propH("fv_blossom_tree", z.x - 340, z.y - 220, 480);
    this.propH("fv_blossom_tree", z.x - 60, z.y - 260, 440);
    this.propH("fv_blossom_tree", z.x + 1180, z.y - 140, 460);
    // crystal shards clustered right at the fountain's edge, not scattered
    this.crystalTargets.push(this.propH("fv_crystal_b", z.x + 300, z.y + 60, 260, { flip: true }));
    this.crystalTargets.push(this.propH("fv_crystal_flowers", z.x + 200, z.y + 160, 220));
    this.treeSwayTargets.push(this.propH("fv_pine", z.x - 760, z.y - 380, 540));
    this.treeSwayTargets.push(this.propH("fv_pine_b", z.x + 780, z.y - 440, 520));
    // two carts resting near the tree cluster, given more room between them
    this.propH("fv_wheelbarrow", z.x - 560, z.y - 70, 210);
    this.propH("fv_wheelbarrow", z.x - 160, z.y + 40, 200, { flip: true });
    // lanterns lighting the path as it curves past the fountain
    this.propH("fv_lamppost", z.x - 680, z.y + 200, 260);
    this.lanternSpots.push({ x: z.x - 680, y: z.y + 200 - 240 });
    this.swayTargets.push(this.propH("fv_flower_pot", z.x - 280, z.y + 300, 230));
    this.swayTargets.push(this.propH("fv_crystal_flowers", z.x + 300, z.y + 320, 260));
    this.propH("fv_hedge", z.x - 1000, z.y + 220, 200);

    // the deer's neglected request, given a bit more room from the deer itself
    this.itemPair("grove", "fv_deer_flower_damaged", "fv_deer_flower_restored", z.x - 380, z.y + 430, 200);
  }

  /* ================= ZONE D: Frozen Waterfall ================= */

  private buildWaterfallZone(): void {
    const z = ZONES.waterfall;
    // the main cliff cascade, scaled up ~31% as the zone's dominant landmark
    this.propH("fv_waterfall", z.x, z.y, 970);
    // the smaller cascade is a second step of the SAME cliff face (not a
    // stray duplicate on flat snow) — kept close and grouped with the
    // squirrel's props at its base, scaled up to match
    this.propH("fv_waterfall_b", z.x + 680, z.y + 260, 470);
    this.propH("fv_ice_block", z.x - 480, z.y + 120, 340);
    this.propH("fv_riverbank", z.x - 120, z.y + 220, 495);
    // pines pushed further out so they frame the cliff rather than crowd
    // the now-larger waterfall art
    this.treeSwayTargets.push(this.propH("fv_pine", z.x + 640, z.y - 260, 520));
    this.treeSwayTargets.push(this.propH("fv_pine_d", z.x - 720, z.y - 140, 560));
    // grouped around the smaller cascade's base, not floating loose in open snow
    this.swayTargets.push(this.propH("fv_flower_bush", z.x + 560, z.y + 300, 190));
    this.propH("fv_snowrock_a", z.x + 840, z.y + 330, 230);
    this.groundShadow(z.x, z.y, 640, z.y);

    // the squirrel's three neglected requests, pulled further into the
    // waterfall's own side of the valley — more breathing room from the
    // crystal zone next door
    this.itemPair("waterfall", "fv_squirrel_nest_damaged", "fv_squirrel_nest_restored", z.x - 850, z.y + 420, 460);
    this.itemPair("waterfall", "fv_squirrel_pool_damaged", "fv_squirrel_pool_restored", z.x - 480, z.y + 540, 230);
    this.itemPair("waterfall", "fv_squirrel_waterfall_damaged", "fv_squirrel_waterfall_restored", z.x - 780, z.y + 40, 420);

    // a small pine cluster bridging the gap toward the crystal zone, so the
    // squirrel and the polar bear read as two neighboring glades in one
    // continuous forest rather than two islands with empty space between
    this.treeSwayTargets.push(this.propH("fv_pine", z.x + 700, z.y + 460, 480));
    this.treeSwayTargets.push(this.propH("fv_pine_c", z.x + 900, z.y + 610, 520));
    this.treeSwayTargets.push(this.propH("fv_pine_d", z.x + 1100, z.y + 410, 460));
  }

  /* ================= ZONE E: Crystal Area ================= */

  private buildCrystalZone(): void {
    const z = ZONES.crystals;
    // main crystal cluster, out in the open basin
    this.crystalTargets.push(this.propH("fv_crystal_a", z.x, z.y, 380));
    this.crystalTargets.push(this.propH("fv_crystal_b", z.x + 320, z.y + 60, 240));
    this.crystalTargets.push(this.propH("fv_crystal_d", z.x + 620, z.y + 240, 210));
    this.propH("fv_icicles", z.x - 280, z.y + 40, 220);
    this.treeSwayTargets.push(this.propH("fv_pine", z.x - 460, z.y - 240, 460, { tint: 0xd7e6f2 }));
    this.propH("fv_ice_gazebo", z.x + 880, z.y - 60, 480);
    this.lanternSpots.push({ x: z.x + 880, y: z.y - 300 });
    this.propH("fv_snowrock_b", z.x + 180, z.y + 380, 220);
    this.groundShadow(z.x, z.y, 340, z.y);

    // ice cave dug into the cliff base, scaled up ~30% as a real landmark —
    // pulled further into the crystal zone's own side, more breathing room
    // from the waterfall/squirrel zone next door
    this.itemPair("crystals", "fv_bear_cave_damaged", "fv_bear_cave_restored", z.x - 560, z.y + 420, 600);
    // a second crystal cluster right at the cave mouth, with scale variation
    // so it reads as a natural formation rather than three identical copies
    this.crystalTargets.push(this.propH("fv_crystal_c", z.x - 380, z.y + 300, 230 * 0.8));
    this.crystalTargets.push(this.propH("fv_crystal_e", z.x - 240, z.y + 380, 220 * 1.2));
    // pines framing the cave's near side, adding depth toward the gap
    this.treeSwayTargets.push(this.propH("fv_pine_b", z.x - 950, z.y + 200, 480));
    this.treeSwayTargets.push(this.propH("fv_pine", z.x - 850, z.y + 480, 460));

    // the polar bear's three neglected requests, grouped around its hidden
    // spot — the pedestal sits on the clear ground directly in front of the
    // cave entrance, not off to the side
    this.itemPair("crystals", "fv_bear_crystal_damaged", "fv_bear_crystal_restored", z.x - 420, z.y + 60, 340);
    this.itemPair("crystals", "fv_bear_hole_damaged", "fv_bear_hole_restored", z.x - 140, z.y + 380, 200);
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
    this.itemPair("shore", "fv_penguin_slide_damaged", "fv_penguin_slide_restored", z.x + 20, z.y - 220, 600);
  }

  /* ================= Hidden Glade — new area appended below the painted map ================= */

  /**
   * A brand-new area appended below the painted map (see MAIN_H/GLADE_H) —
   * there's no painted terrain down here, so it's built entirely from props
   * plus a procedural river, the same technique already used for the small
   * inter-cottage stream in the village. Purely decorative: it isn't one of
   * the six ZoneKey puzzle zones, so it has no locked-silhouette animal or
   * neglected-item pairs of its own — a seventh animal would need real
   * character art and a new puzzle, which is a product decision, not
   * something to invent silently.
   */
  private buildGlade(): void {
    const g = GLADE;

    // a real snow-drift ground texture across the whole glade strip — this
    // area is below the painted fv_world_bg (see MAIN_H/GLADE_H), so without
    // this it's just the flat fallback color from buildSky. A single
    // stretched image, not a tile: this source art has no seamless edges,
    // so repeating it always shows a hard grid — one image guarantees zero
    // seams, at the cost of some horizontal stretch across this wide strip.
    this.add.image(0, MAIN_H, "fv_glade_ground").setOrigin(0, 0).setDisplaySize(WORLD_W, GLADE_H).setDepth(-200);

    // the river winding through the glade, wider than the inter-cottage
    // stream, with a stone bridge over the natural crossing point
    const river = [
      { x: g.x + 700, y: g.y - 1300 },
      { x: g.x + 550, y: g.y - 900 },
      { x: g.x + 650, y: g.y - 500 },
      { x: g.x + 450, y: g.y - 100 },
      { x: g.x + 500, y: g.y + 300 },
      { x: g.x + 350, y: g.y + 700 },
      { x: g.x + 450, y: g.y + 1100 },
      { x: g.x + 380, y: g.y + 1400 },
    ];
    this.buildBuildingDivideStream(river, { core: 100, highlight: 40 });
    this.propH("fv_bridge", g.x + 500, g.y + 300, 340);

    // the magical tree cluster — a treehouse ringed by blossom trees
    this.propH("fv_magic_treehouse", g.x - 520, g.y - 520, 900, { tint: 0xe8e2f5 });
    this.groundShadow(g.x - 520, g.y - 520, 560, g.y - 520);
    this.propH("fv_blossom_tree", g.x - 780, g.y - 300, 460);
    this.propH("fv_blossom_tree", g.x - 300, g.y - 380, 480);
    this.chimneySpots.push({ x: g.x - 460, y: g.y - 520 - 850 });

    // a cottage beside the tree cluster
    this.propH("fv_cottage_a", g.x + 40, g.y - 420, 620);
    this.groundShadow(g.x + 40, g.y - 420, 420, g.y - 420);
    this.chimneySpots.push({ x: g.x + 110, y: g.y - 420 - 580 });
    this.lanternSpots.push({ x: g.x - 460, y: g.y - 780 }, { x: g.x + 110, y: g.y - 680 });

    // the fountain and crystal cluster in front of the tree cluster
    this.propH("fv_fountain_restored", g.x - 380, g.y - 60, 420);
    this.groundShadow(g.x - 380, g.y - 60, 340, g.y - 60);
    this.crystalTargets.push(this.propH("fv_crystal_a", g.x - 160, g.y - 20, 280));
    this.crystalTargets.push(this.propH("fv_crystal_c", g.x - 60, g.y + 40, 220));
    this.crystalTargets.push(this.propH("fv_crystal_e", g.x - 220, g.y + 60, 210));
    this.swayTargets.push(this.propH("fv_crystal_flowers", g.x - 320, g.y + 120, 230));

    // two carts resting in the open snow between the tree cluster and the
    // fountain, matching the reference — clear of the canopy so they're
    // actually visible, not tucked behind foliage
    this.propH("fv_wheelbarrow", g.x - 560, g.y - 100, 220);
    this.propH("fv_wheelbarrow", g.x - 30, g.y - 240, 210, { flip: true });

    // path stones linking the tree cluster, fountain, and the bridge
    const path = this.chain(
      [
        { x: g.x - 460, y: g.y - 380 },
        { x: g.x - 300, y: g.y - 120 },
        { x: g.x - 80, y: g.y + 60 },
        { x: g.x + 200, y: g.y + 180 },
        { x: g.x + 500, y: g.y + 300 },
      ],
      6,
    );
    path.forEach((p, i) => {
      if (i % 2 !== 0) return;
      this.add.ellipse(p.x, p.y, 46, 24, 0xf4ecda, 0.9).setDepth(p.y - 210);
    });
    this.propH("fv_lamppost", g.x + 260, g.y + 160, 260);
    this.lanternSpots.push({ x: g.x + 260, y: g.y + 160 - 260 });

    // dense pine framing right at the clearing's edge, backing up the
    // auto-populated forest beyond it
    const frameTrees: Array<[string, number, number, number]> = [
      ["fv_pine", g.x - 1000, g.y - 700, 560],
      ["fv_pine_c", g.x - 950, g.y - 200, 600],
      ["fv_pine_b", g.x - 850, g.y + 400, 520],
      ["fv_pine_d", g.x - 600, g.y + 900, 480],
      ["fv_pine", g.x + 900, g.y - 900, 560],
      ["fv_pine_c", g.x + 950, g.y - 300, 540],
      ["fv_pine_b", g.x + 900, g.y + 500, 500],
      ["fv_pine_d", g.x + 700, g.y + 1000, 460],
    ];
    for (const [key, x, y, h] of frameTrees) this.treeSwayTargets.push(this.propH(key, x, y, h));

    this.propH("fv_snowrock_a", g.x - 700, g.y + 150, 220);
    this.propH("fv_snowrock_b", g.x + 250, g.y - 500, 210);
  }

  /* ================= animals — hidden as silhouettes until rescued ================= */

  private buildAnimals(): void {
    // stands right beside the carrots bed at the yard's center-left — the
    // bed sits at (village.x-212, village.y+542) — the gap cut out of
    // fv_rabbit_yard.png, see buildVillageZone — so this is just beside it
    // lower in the yard square so its head clears the top fence rail
    this.buildZoneAnimal("village", "fv_rabbit", ZONES.village.x - 556, ZONES.village.y + 739, 260, "Solve the Village puzzle to meet me!");
    this.buildZoneAnimal("bridge", "fv_fox", ZONES.bridge.x - 60, ZONES.bridge.y + 120, 210, "Solve the Bridge puzzle to meet me!");
    // pulled further into the waterfall's own side, more distance from the polar bear next door
    this.buildZoneAnimal("waterfall", "fv_squirrel", ZONES.waterfall.x - 520, ZONES.waterfall.y + 220, 190, "Solve the Waterfall puzzle to meet me!", { flip: true });
    this.buildZoneAnimal("grove", "fv_deer", ZONES.grove.x - 80, ZONES.grove.y + 140, 230, "Solve the Grove puzzle to meet me!");
    // pulled further into the crystal zone's own side, in front of the (also moved) cave
    this.buildZoneAnimal("crystals", "fv_polarbear", ZONES.crystals.x - 500, ZONES.crystals.y + 580, 210, "Solve the Crystal puzzle to meet me!", { flip: true });
    this.buildZoneAnimal("shore", "fv_penguin", ZONES.shore.x, ZONES.shore.y + 180, 210, "Solve the Shore puzzle to meet me!");
  }

  /**
   * A not-yet-rescued animal: rendered as a solid black silhouette with a "?"
   * badge, matching the main Garden's own locked-animal presentation. This is
   * an INTENTIONAL gameplay state, not a placeholder for missing art — tapping
   * it shows a short hint (or opens the current animal's Request screen), and
   * `playUnlockCinematic` transforms it once that animal's puzzle is solved.
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
    const animalId = ZONE_TO_ANIMAL[zone];

    // already unlocked on an earlier visit: straight back as the living NPC —
    // the unlock cinematic only ever plays once
    if (frostedProgression.isRescued(animalId)) {
      const npc = new FrostedAnimalNpc(this, key, x, y, targetHeight / (NATIVE_H[key] ?? targetHeight), !!opts.flip);
      npc.startLife();
      const rec: ZoneAnimalRec = (this.zoneAnimals[zone] = {
        animalId,
        sprite: npc.sprite,
        badge: this.add.text(0, 0, "").setVisible(false),
        height: targetHeight,
        npc,
        x,
        y,
        radius: Math.max(160, targetHeight),
        hint,
        revealed: true,
        normalKey: key,
        flip: !!opts.flip,
      });
      this.startAnimalRoaming(rec);
      return;
    }

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
      animalId,
      sprite,
      badge,
      height: targetHeight,
      x,
      y,
      radius: Math.max(160, targetHeight),
      hint,
      revealed: false,
      normalKey: key,
      flip: !!opts.flip,
    };
    this.refreshAnimalBadge(animalId);
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
    if (this.placementController?.active) return;
    Sfx.unlock();

    // an open Move/Remove menu swallows the next tap (dismiss), rather than
    // also acting on whatever happens to be underneath it
    if (this.placementMenu) {
      this.placementMenu.destroy();
      this.placementMenu = undefined;
      return;
    }

    if (Phaser.Math.Distance.Between(x, y, this.shopPos.x, this.shopPos.y - this.shopPos.radius / 2) < this.shopPos.radius) {
      Sfx.tap();
      if (!frostedProgression.isRescued("fv_rabbit")) {
        this.showHint(this.shopPos.x, this.shopPos.y - this.shopPos.radius, SHOP_LOCKED_HINT);
        return;
      }
      this.openShop();
      return;
    }

    for (const p of frostedShop.listPlacements()) {
      const def = frostedShop.def(p.itemId);
      const r = Math.max(60, (def?.targetHeight ?? 150) * 0.5);
      if (Phaser.Math.Distance.Between(x, y, p.x, p.y - r / 2) < r) {
        Sfx.tap();
        this.showPlacementMenu(p);
        return;
      }
    }

    // the guided chapters: requirement objects + the waiting silhouette
    if (this.story.handleTap(x, y)) return;

    for (const a of Object.values(this.zoneAnimals) as ZoneAnimalRec[]) {
      // a roaming friend is tapped where it IS now, not where it started
      const ax = a.npc?.x ?? a.x;
      const ay = a.npc?.y ?? a.y;
      if (Phaser.Math.Distance.Between(x, y, ax, ay - a.radius / 2) < a.radius) {
        if (a.revealed) {
          // an unlocked friend: a happy little hello
          if (a.npc) this.greetNpc(a);
          return;
        }
        Sfx.tap();
        const animalId = a.animalId;
        // only the CURRENT animal's Request screen can open — a locked
        // future animal just gets its existing "not yet" hint
        if (animalId && frostedProgression.isCurrentAnimal(animalId)) {
          this.openRequest(animalId);
        } else {
          this.showHint(a.x, a.y, a.hint);
        }
        return;
      }
    }

    // the grove's fountain keeps its original tap-to-trigger spot, now
    // opening the deer's Request screen instead of revealing it directly
    const d = Phaser.Math.Distance.Between(x, y, this.groveFountainPos.x, this.groveFountainPos.y - 40);
    if (d < 260 && !this.zoneAnimals.grove?.revealed && frostedProgression.isCurrentAnimal("fv_deer")) {
      this.openRequest("fv_deer");
    }
  }

  private openRequest(animalId: string): void {
    this.scene.pause();
    this.scene.launch("FrostedRequest", { animalId });
  }

  private openShop(): void {
    this.scene.pause();
    this.scene.launch("FrostedShop");
  }

  /**
   * The Shop introduction's "Take me there": pan to the Winter Market, open
   * it, and hand control back once the player closes it again.
   */
  async guideToShop(): Promise<void> {
    this.flowBusy = true;
    this.camera.disable();
    await this.camera.focusOn(this.shopPos.x, this.shopPos.y - this.shopPos.radius * 0.5, 1200, SETTLE_ZOOM);
    await wait(this, 350);
    const closed = new Promise<void>((resolve) => this.events.once(Phaser.Scenes.Events.RESUME, () => resolve()));
    this.openShop();
    await closed;
    this.camera.enable();
    this.flowBusy = false;
  }

  /**
   * Called by FrostedShopScene right after it closes on a BUY tap — never
   * spends a coin itself (see FrostedShopService.confirmPurchasePlacement,
   * called only from the placement controller's onConfirm below).
   */
  beginShopPlacement(itemId: string): void {
    const center = this.cameras.main.getWorldPoint(this.scale.width / 2, this.scale.height / 2);
    this.startShopItemPlacement(itemId, center.x, center.y, false);
  }

  /**
   * Called by FrostedShopScene the instant the player PRESSES DOWN on a
   * buildable/plantable/decoration card — the Shop scene closes and hands
   * off that same still-held pointer here, so the ghost picks up exactly
   * under the finger/cursor and the very next pointer-release places it (or
   * cancels for free over an invalid spot) — real drag-and-drop, no
   * separate confirm step. See FrostedPlacementController's `dragToPlace`.
   */
  beginShopDragPlacement(itemId: string, screenX: number, screenY: number): void {
    const world = this.cameras.main.getWorldPoint(screenX, screenY);
    this.startShopItemPlacement(itemId, world.x, world.y, true);
  }

  private startShopItemPlacement(itemId: string, startX: number, startY: number, dragToPlace: boolean): void {
    const def = frostedShop.def(itemId);
    if (!def) return;
    // the wallet decides, not the caller: an unaffordable item never enters placement
    if (!frostedShop.canAfford(itemId)) return;
    this.placementController?.start({
      textureKey: def.textureKey,
      targetHeight: def.targetHeight,
      contentHeightFraction: def.visibleHeightFraction,
      startX,
      startY,
      isValid: (x, y) => this.isPlacementValid(x, y),
      dragToPlace,
      onConfirm: (x, y, rotation) => {
        const placed = frostedShop.confirmPurchasePlacement(itemId, x, y, rotation);
        if (placed) this.spawnPlacementSprite(placed);
      },
      onCancel: () => {},
    });
  }

  private startMovePlacement(placement: FrostedShopPlacement): void {
    const def = frostedShop.def(placement.itemId);
    if (!def) return;
    const sprite = this.shopPlacementSprites.get(placement.id);
    sprite?.setVisible(false);
    this.placementController?.start({
      textureKey: def.textureKey,
      targetHeight: def.targetHeight,
      contentHeightFraction: def.visibleHeightFraction,
      startX: placement.x,
      startY: placement.y,
      startRotation: placement.rotation,
      isValid: (x, y) => this.isPlacementValid(x, y, placement.id),
      onConfirm: (x, y, rotation) => {
        frostedShop.movePlacement(placement.id, x, y, rotation);
        sprite?.setPosition(x, y).setAngle(rotation).setDepth(y).setVisible(true);
      },
      onCancel: () => sprite?.setVisible(true),
    });
  }

  /** A fixed-screen confirm dialog — see pinToScreen for why plain scrollFactor(0) isn't enough here. */
  private confirmRemovePlacement(placement: FrostedShopPlacement): void {
    const w = this.scale.width;
    const h = this.scale.height;
    const dialog = this.add.container(0, 0).setDepth(9900);

    // oversized so it fully covers the screen at any zoom level, since it's
    // scaled by 1/cam.zoom along with the rest of this dialog every frame
    const scrim = this.add.rectangle(0, 0, 6000, 6000, 0x0d1f2e, 0.6).setInteractive();
    const panel = makePanel(this, 360, 200, { radius: 24 });
    const title = this.add.text(0, -50, "Remove this decoration?", titleStyle(19)).setOrigin(0.5);
    dialog.add([scrim, panel, title]);

    const stopTracking = this.pinToScreen(dialog, w / 2, h / 2);
    const destroyAll = () => {
      stopTracking();
      dialog.destroy();
    };

    const keepBtn = makeIconButton(this, -90, 50, "Keep it", 15, () => destroyAll(), {
      hitW: 150,
      hitH: 48,
      color: "#5b4636",
    });
    const removeBtn = makeIconButton(
      this,
      90,
      50,
      "Remove",
      15,
      () => {
        destroyAll();
        frostedShop.removePlacement(placement.id);
        this.shopPlacementSprites.get(placement.id)?.destroy();
        this.shopPlacementSprites.delete(placement.id);
      },
      { hitW: 150, hitH: 48, color: "#8a3b3b" },
    );
    dialog.add([keepBtn, removeBtn]);
  }

  /** A small world-anchored popup on an already-placed decoration — Move re-enters placement mode, Remove asks first. */
  private showPlacementMenu(placement: FrostedShopPlacement): void {
    this.placementMenu?.destroy();
    const menu = this.add.container(placement.x, placement.y - 60).setDepth(9800);
    const bg = makePanel(this, 220, 76, { radius: 16 });
    menu.add(bg);
    const moveBtn = makeIconButton(
      this,
      -55,
      0,
      "Move",
      14,
      () => {
        this.placementMenu?.destroy();
        this.placementMenu = undefined;
        this.startMovePlacement(placement);
      },
      { hitW: 96, hitH: 52, color: "#5b4636" },
    );
    const removeBtn = makeIconButton(
      this,
      55,
      0,
      "Remove",
      14,
      () => {
        this.placementMenu?.destroy();
        this.placementMenu = undefined;
        this.confirmRemovePlacement(placement);
      },
      { hitW: 96, hitH: 52, color: "#8a3b3b" },
    );
    menu.add([moveBtn, removeBtn]);
    this.placementMenu = menu;
  }

  /**
   * Deliberately pragmatic (there is no real river/path collision geometry
   * in this painted-background world to check against): keeps new
   * decorations off the world's outer padding, away from every zone's
   * animal spot, the grove fountain, the bridge crossing, the Shop itself,
   * and other existing placements, so at minimum nothing can be dropped on
   * top of an NPC, a puzzle trigger, or another decoration.
   */
  private isPlacementValid(x: number, y: number, excludeId?: string): boolean {
    const pad = 260;
    if (x < pad || x > WORLD_W - pad || y < pad || y > MAIN_H - pad) return false;

    for (const a of Object.values(this.zoneAnimals) as ZoneAnimalRec[]) {
      if (Phaser.Math.Distance.Between(x, y, a.x, a.y) < a.radius * 1.4) return false;
    }
    if (Phaser.Math.Distance.Between(x, y, this.groveFountainPos.x, this.groveFountainPos.y) < 300) return false;
    if (Phaser.Math.Distance.Between(x, y, this.shopPos.x, this.shopPos.y) < this.shopPos.radius) return false;
    if (Phaser.Math.Distance.Between(x, y, ZONES.bridge.x, ZONES.bridge.y) < 420) return false;

    for (const p of frostedShop.listPlacements()) {
      if (p.id === excludeId) continue;
      if (Phaser.Math.Distance.Between(x, y, p.x, p.y) < 90) return false;
    }
    return true;
  }

  /** Swap a waiting silhouette's "?" for a gently pulsing 🧩 once its puzzle is ready. */
  private refreshAnimalBadge(animalId: string): void {
    const rec = this.zoneAnimals[ANIMAL_TO_ZONE[animalId]];
    if (!rec || rec.revealed || !rec.badge.active) return;
    if (!frostedProgression.isPuzzleAvailable(animalId) || rec.badge.getData("puzzle")) return;
    rec.badge.setData("puzzle", true);
    rec.badge.setText("🧩");
    this.tweens.add({ targets: rec.badge, scale: { from: 1.5, to: 1 }, duration: 420, ease: "Back.easeOut" });
    this.tweens.add({ targets: rec.badge, y: rec.badge.y - 8, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: 420 });
  }

  /**
   * The ~10s unlock reveal, played right after the living puzzle artwork:
   *   0–2s   camera arrives on the silhouette
   *   2–4s   the silhouette begins to glow from within
   *   4–6s   magical sparkles and snow swirl around it
   *   6–7s   it stirs — a shiver, a little stretch
   *   7–8s   a bright transformation flash
   *   8–10s  the real animal is there, doing its own signature move
   * Only at the END is the rescue committed (coins, next chapter), so it is
   * permanent from then on; a reload before that replays this once.
   */
  async playUnlockCinematic(animalId: string): Promise<void> {
    const zone = ANIMAL_TO_ZONE[animalId];
    const rec = zone ? this.zoneAnimals[zone] : undefined;
    if (!rec || rec.revealed || !frostedProgression.isUnlockPending(animalId)) return;
    rec.revealed = true;
    this.flowBusy = true;
    this.hideSkip();
    this.camera.disable();

    const cx = rec.x;
    const cy = rec.y - rec.height * 0.5;
    const h = rec.height;
    const sil = rec.sprite;
    const idleIdx = this.idleTargets.indexOf(sil);
    if (idleIdx >= 0) this.idleTargets.splice(idleIdx, 1);
    this.tweens.killTweensOf(sil);
    const baseSX = rec.height / (NATIVE_H[rec.normalKey] ?? rec.height);
    sil.setScale(baseSX);

    // 0–2s: arrive
    this.cameras.main.fadeIn(900, 236, 246, 255);
    const zoom = Math.min(1.15, Math.max(0.9, this.camera.zoom));
    await this.camera.focusOn(cx, cy, 1900, zoom);
    this.tweens.killTweensOf(rec.badge);
    this.tweens.add({ targets: rec.badge, alpha: 0, y: rec.badge.y - 30, duration: 400, onComplete: () => rec.badge.destroy() });

    // 2–4s: the silhouette starts to glow from within
    Sfx.whoosh();
    const halo = this.add
      .image(cx, cy, "glow")
      .setDepth(sil.depth - 0.2)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xffcf7a)
      .setScale(0.3)
      .setAlpha(0);
    const haloScale = (h / 256) * 2.4;
    this.tweens.add({ targets: halo, alpha: 0.85, scale: haloScale, duration: 2000, ease: "Sine.easeInOut" });
    const inner = this.add
      .image(sil.x, sil.y, rec.normalKey)
      .setOrigin(0.5, 1)
      .setScale(baseSX)
      .setFlipX(rec.flip)
      .setDepth(sil.depth + 0.1)
      .setTintFill(0xfff6dc)
      .setAlpha(0);
    this.tweens.add({ targets: inner, alpha: 0.55, duration: 650, yoyo: true, repeat: 1, ease: "Sine.easeInOut" });
    this.time.delayedCall(1300, () => this.tweens.add({ targets: inner, alpha: 0.7, duration: 700 }));
    this.tweens.add({ targets: sil, scaleY: baseSX * 1.03, duration: 500, yoyo: true, repeat: 1, ease: "Sine.easeInOut" });
    await wait(this, 2000);

    // 4–6s: sparkles + snow swirl around it, spiralling in
    const endSwirl = this.spawnSwirl(cx, cy, h);
    for (let i = 0; i < 5; i++) this.time.delayedCall(i * 380, () => Sfx.sparkle());
    this.tweens.add({ targets: inner, alpha: 0.95, duration: 1800 });
    this.tweens.add({ targets: halo, scale: haloScale * 1.15, duration: 900, yoyo: true, ease: "Sine.easeInOut" });
    await wait(this, 2000);

    // 6–7s: it stirs — a shiver, then a little stretch
    this.cameras.main.shake(700, 0.0025);
    this.tweens.add({
      targets: [sil, inner],
      angle: { from: -3, to: 3 },
      duration: 90,
      yoyo: true,
      repeat: 3,
      onComplete: () => [sil, inner].forEach((o) => o.setAngle(0)),
    });
    this.tweens.add({ targets: [sil, inner], scaleY: baseSX * 1.08, scaleX: baseSX * 0.95, duration: 260, delay: 480, yoyo: true, ease: "Sine.easeInOut" });
    Sfx.whoosh();
    await wait(this, 1000);

    // 7–8s: transformation flash — the real animal takes the silhouette's place
    this.cameras.main.flash(520, 255, 255, 250);
    Sfx.fanfare();
    endSwirl();
    const npc = new FrostedAnimalNpc(this, rec.normalKey, rec.x, rec.y, baseSX, rec.flip);
    npc.sprite.setScale(baseSX * 0.75);
    sil.destroy();
    inner.destroy();
    rec.sprite = npc.sprite;
    rec.npc = npc;
    this.tweens.add({ targets: halo, scale: haloScale * 1.6, alpha: 0, duration: 1100, ease: "Sine.easeOut", onComplete: () => halo.destroy() });
    const ring = this.add.circle(cx, cy, h * 0.3).setStrokeStyle(10, 0xffffff, 0.9).setDepth(9000);
    this.tweens.add({ targets: ring, radius: h * 1.5, alpha: 0, duration: 800, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
    sparkleBurst(this, cx, cy, 36, h * 0.8);
    petalPuff(this, cx, cy - h * 0.2, 18);
    this.wakeZoneScenery(zone);
    await wait(this, 520);

    // 8–10s: hello! its signature move, then it simply lives here now
    npc.startLife();
    const hello = npc.playSignature(true);
    this.floatHearts(cx, rec.y - h * 1.05);
    const def = frostedProgression.def(animalId);
    const inv = 1 / this.cameras.main.zoom;
    const banner = this.add
      .text(cx, rec.y - h - 80 * inv, `${def?.name ?? "A friend"} is back in the Valley!`, {
        ...titleStyle(30),
        color: "#fef6e8",
        stroke: "#34507a",
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(9900)
      .setScale(0.4 * inv)
      .setAlpha(0);
    this.tweens.add({ targets: banner, scale: inv, alpha: 1, duration: 420, ease: "Back.easeOut" });
    await hello;
    await wait(this, 500);

    // commit — permanent from here: coins, next chapter, saved
    const { rescuedNow } = frostedProgression.rescueAnimal(animalId);
    if (rescuedNow && def) {
      Sfx.coin();
      const coins = this.add
        .text(cx, rec.y - h - 20 * inv, `+${def.coinReward} 🪙`, { ...titleStyle(26), color: "#ffe6a3", stroke: "#5b4636", strokeThickness: 5 })
        .setOrigin(0.5)
        .setDepth(9900)
        .setScale(inv);
      this.tweens.add({ targets: coins, y: coins.y - 70 * inv, alpha: 0, duration: 1600, delay: 500, ease: "Sine.easeOut", onComplete: () => coins.destroy() });
    }
    this.tweens.add({ targets: banner, alpha: 0, duration: 500, delay: 900, onComplete: () => banner.destroy() });
    await wait(this, 1200);

    // rescued for good now: from here on it lives its own life in its zone
    if (frostedProgression.isRescued(animalId)) this.startAnimalRoaming(rec);

    this.camera.enable();
    this.flowBusy = false;
    await this.story.afterUnlock(animalId);
    // the Rabbit is now a real animal in the valley: introduce the Winter Market
    // (envelope -> shop tutorial) BEFORE moving on to the Fox's letter
    if (animalId === "fv_rabbit") await this.story.shopIntro();
    await this.showNextAnimalLetterIfAny();
  }

  /** Sparkles and snowflakes circling the silhouette, spiralling inward. Returns a burst-outward-and-clear function. */
  private spawnSwirl(cx: number, cy: number, h: number): () => void {
    const bits: Array<{ img: Phaser.GameObjects.Image; a: number; r: number; speed: number; lift: number }> = [];
    for (let i = 0; i < 34; i++) {
      const snow = i % 3 === 0;
      const img = this.add
        .image(cx, cy, snow ? "fv_snow_dot" : "spark")
        .setDepth(9000)
        // tinted, not additive: this all happens over white snow, where
        // additive white sparkles would simply vanish
        .setTint(snow ? 0x9ccbee : [0xffc861, 0x7fc8ff, 0xc9a2ff][i % 3])
        .setScale(snow ? 1.6 + Math.random() * 1.2 : 0.55 + Math.random() * 0.45)
        .setAlpha(0);
      bits.push({
        img,
        a: (i / 34) * Math.PI * 2,
        r: h * (0.9 + Math.random() * 0.5),
        speed: 2.2 + Math.random() * 1.6,
        lift: Math.random() * h * 0.6 - h * 0.3,
      });
      this.tweens.add({ targets: img, alpha: snow ? 0.9 : 1, duration: 400, delay: i * 20 });
    }
    const start = this.time.now;
    const tick = () => {
      const t = (this.time.now - start) / 1000;
      const shrink = Math.max(0.35, 1 - t * 0.2);
      for (const b of bits) {
        const a = b.a + t * b.speed;
        b.img.setPosition(cx + Math.cos(a) * b.r * shrink, cy + b.lift * shrink + Math.sin(a) * b.r * 0.35 * shrink);
      }
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, tick);
    return () => {
      this.events.off(Phaser.Scenes.Events.UPDATE, tick);
      for (const b of bits) {
        const ang = Math.atan2(b.img.y - cy, b.img.x - cx);
        this.tweens.add({
          targets: b.img,
          x: cx + Math.cos(ang) * h * 1.6,
          y: cy + Math.sin(ang) * h * 1.2,
          alpha: 0,
          duration: 700,
          ease: "Cubic.easeOut",
          onComplete: () => b.img.destroy(),
        });
      }
    };
  }

  /** A few little hearts floating up — "hello, friend". */
  private floatHearts(x: number, y: number): void {
    const inv = 1 / this.cameras.main.zoom;
    for (let i = 0; i < 5; i++) {
      const heart = this.add
        .text(x + Phaser.Math.Between(-60, 60), y, "💙", { fontSize: "34px" })
        .setOrigin(0.5)
        .setDepth(9800)
        .setAlpha(0)
        .setScale(0.5 * inv);
      this.tweens.add({
        targets: heart,
        y: y - (110 + Math.random() * 60) * inv,
        alpha: { from: 1, to: 0 },
        scale: inv,
        delay: i * 220,
        duration: 1500,
        ease: "Sine.easeOut",
        onComplete: () => heart.destroy(),
      });
    }
  }

  /** A rescued NPC was tapped: a small happy reaction. */
  private greetNpc(rec: ZoneAnimalRec): void {
    if (!rec.npc) return;
    Sfx.rabbitChirp();
    // it turns toward the player (the middle of the view), says hello, and
    // then simply carries on with its own life
    rec.npc.greet(this.cameras.main.midPoint.x);
    this.floatHearts(rec.npc.x, rec.npc.y - rec.height * 1.05);
  }

  /**
   * Hands a rescued animal over to its autonomous life: wandering its own
   * zone (FROSTED_ROAM, authored relative to its home spot), visiting the
   * landmarks the player restored for it, with its own personality
   * (PERSONALITIES). Only ever called for a RESCUED animal - on load, or at
   * the very end of its unlock cinematic - so nobody wakes up early.
   */
  private startAnimalRoaming(rec: ZoneAnimalRec): void {
    const rel = FROSTED_ROAM[rec.normalKey];
    const personality = PERSONALITIES[rec.normalKey];
    if (!rec.npc || !rel || !personality) return;
    const area = areaAt(rel, { x: rec.x, y: rec.y });
    const staticBlocks = this.propFootprints(area.poly, rec.npc.sprite);
    rec.npc.startRoaming({
      area,
      personality,
      nativeFacing: NATIVE_FACING[rec.normalKey] ?? 1,
      depthFloor: rec.normalKey === "fv_rabbit" && this.rabbitYard ? this.rabbitYard.depth + 1 : undefined,
      // tall props never move, but Shop decorations can be placed, moved or
      // removed at any time, so those are re-read on every check
      blocked: (p) =>
        staticBlocks.some((r) => inFootprint(p, r)) || this.decorationFootprints().some((r) => inFootprint(p, r)),
    });
  }

  /**
   * Ground footprints of the standing props (trees, lampposts, carts...)
   * around an area - the bottom slice of each, where an animal would be
   * walking INTO it. Ground layers, the rabbit's yard art (it lives inside
   * it) and the animals themselves are skipped.
   */
  private propFootprints(poly: Pt[], self: Phaser.GameObjects.Image): FootRect[] {
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    const bx0 = Math.min(...xs) - 200;
    const bx1 = Math.max(...xs) + 200;
    const by0 = Math.min(...ys) - 200;
    const by1 = Math.max(...ys) + 400;
    const animalKeys = new Set(Object.keys(PERSONALITIES));
    const out: FootRect[] = [];
    for (const o of this.children.list) {
      if (!(o instanceof Phaser.GameObjects.Image) || o === self || o === this.rabbitYard) continue;
      const key = o.texture.key;
      if (!key.startsWith("fv_") || key.startsWith("fv_ground") || key.startsWith("fv_glade_ground") || animalKeys.has(key)) continue;
      // the ground-blend fade masks are huge full-zone images, not props
      if (key.endsWith("_mask") || !o.visible) continue;
      if (o.depth < 0 || o.scrollFactorX !== 1 || o.displayHeight < 60) continue;
      const r = footprintOf(o);
      if (r.x1 < bx0 || r.x0 > bx1 || r.y1 < by0 || r.y0 > by1) continue;
      out.push(r);
    }
    return out;
  }

  private decorationFootprints(): FootRect[] {
    const out: FootRect[] = [];
    for (const img of this.shopPlacementSprites.values()) if (img.active) out.push(footprintOf(img));
    return out;
  }

  /** Crossfade any of this zone's landmarks still asleep (scenery, e.g. the grove fountain + tree). */
  private wakeZoneScenery(zone: ZoneKey): void {
    for (const item of this.zoneItems[zone] ?? []) {
      if (item.restored.alpha >= 1) continue;
      this.tweens.add({ targets: item.damaged, alpha: 0, duration: 700, ease: "Sine.easeIn" });
      this.tweens.add({ targets: item.restored, alpha: 1, duration: 900, ease: "Sine.easeOut" });
      sparkleBurst(this, item.restored.x, item.restored.y - 60, 14, 60);
    }
  }

  /* ================= DEV helpers ================= */

  private devDrawRoamAreas(): void {
    const g = this.add.graphics().setDepth(99990);
    for (const rec of Object.values(this.zoneAnimals) as ZoneAnimalRec[]) {
      const rel = FROSTED_ROAM[rec.normalKey];
      if (!rel) continue;
      const area = areaAt(rel, { x: rec.x, y: rec.y });
      g.lineStyle(6, 0x22cc55, 0.9);
      g.strokePoints(area.poly.map((p) => new Phaser.Math.Vector2(p.x, p.y)), true);
      g.fillStyle(0xff2244, 0.3);
      for (const r of area.noGo) g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
      g.fillStyle(0xff9900, 0.35);
      for (const r of this.propFootprints(area.poly, rec.sprite)) g.fillRect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0);
      g.fillStyle(0x2266ff, 0.9);
      for (const p of area.pois) g.fillCircle(p.x, p.y, 14);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(rec.x, rec.y, 10);
    }
  }

  /** DEV ONLY: fill + restore every requirement of the current animal (world swaps instantly). */
  private devCompleteRequirements(animalId: string): void {
    const def = frostedProgression.def(animalId);
    if (!def || !frostedProgression.isCurrentAnimal(animalId)) return;
    for (const r of def.resources) {
      frostedProgression.addResourceProgress(animalId, r.id, r.requiredAmount);
      if (frostedProgression.restoreResource(animalId, r.id)) {
        const rec = this.findItemPair(animalId, r.id);
        rec?.damaged.setAlpha(0);
        rec?.restored.setAlpha(1);
      }
    }
    this.refreshAnimalBadge(animalId);
  }
}
