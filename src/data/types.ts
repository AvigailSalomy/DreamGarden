import type { GridSize } from "../puzzle/slice";

export type RegionId =
  | "animalMeadow"
  | "flowerBed"
  | "farmCorner"
  | "pondside"
  | "treeGrove"
  | "cottageYard"
  | "path";

export type IdleBehaviorId =
  | "static_decor"
  | "plant_sway"
  | "tree_breathe"
  | "water_shimmer"
  | "rabbit_hop"
  | "bird_ground"
  | "bird_perch"
  | "butterfly_flit";

export type RevealAnimationId =
  | "hop_in"
  | "fly_in_perch"
  | "bloom_wave"
  | "scale_bloom"
  | "drop_settle"
  | "ripple_in"
  | "grow_up";

export interface MovementBounds {
  shape: "rect" | "circle";
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
}

export interface PuzzleConfig {
  /** Texture key of the picture that gets sliced. */
  image: string;
  /** One grid per required puzzle. `grids.length` must equal `puzzles_required`. */
  grids: GridSize[];
  /** Fraction of a cell used as the snap radius. Default 0.55. */
  snapRadiusFactor?: number;
}

/** A task letter — one reusable envelope/letter presentation, driven entirely by data. */
export interface LetterConfig {
  body: string;
  button?: string;
}

/**
 * One purchasable item in an object's Requests screen. Buying it advances the
 * object's request-progress bar by one segment and places `worldSprite` in the
 * garden at `garden_position + worldOffset` (see RequestsService/GardenScene).
 */
export interface RequestDef {
  id: string;
  label: string;
  /** Texture key for the request-card icon. */
  icon: string;
  cost: number;
  /** Display order within the object's Requests screen. */
  order: number;
  /** Texture key of the prop that appears in the garden once purchased. */
  worldSprite: string;
  worldOffset: { x: number; y: number };
  worldScale?: number;
}

/** One catchable item in a Catch & Collect mini-game item pool. */
export interface MiniGameItemDef {
  id: string;
  icon: string;
  label: string;
}

export interface GardenObjectDef {
  id: string;
  name: string;
  category: "animal" | "plant" | "decor" | "water" | "structure";
  tier: "common" | "medium" | "special";

  garden_sprite: string;
  /** Which way the character in `garden_sprite` natively faces (default
   *  "right"). Used wherever the sprite is flipped to face its movement. */
  sprite_facing?: "left" | "right";
  garden_position: { x: number; y: number };
  garden_scale: number;
  region: RegionId;
  layer: "back" | "actors";

  puzzles_required: 1 | 2 | 3;
  puzzle: PuzzleConfig;

  reward_coins: number;
  unlock_order: number;

  reveal_animation: RevealAnimationId;
  idle_behavior: IdleBehaviorId;
  movement_bounds?: MovementBounds;

  /** Sfx method to play during the finished-picture hold, e.g. "rabbitChirp". */
  complete_sfx?: string;

  /** Envelope text shown when this restoration becomes the active task. */
  letter: LetterConfig;
  /** One short line shown right after the reveal, before the camera guides onward. */
  overview_text?: string;

  story_text: string;
  unlock_toast?: string;

  /** Purchasable requests that must ALL be bought before the puzzle unlocks. */
  requests: RequestDef[];
  /**
   * When true, a request's `worldSprite` represents a *consumed* material (soil,
   * seeds, water) rather than a lasting decoration — so it is never left sitting
   * in the garden. Default (false/undefined): props persist, like Nibs's cozy
   * carrot basket / hay / clover.
   */
  requestPropsTransient?: boolean;
  /** Catch & Collect item pool used while this object is the active task. */
  miniGamePool: MiniGameItemDef[];
}

/* ---------- persisted save ---------- */

export interface ObjectProgress {
  puzzles_completed: number;
  is_unlocked: boolean;
}

export interface SaveState {
  saveVersion: number;
  coins: number;
  currentTaskIndex: number;
  introSeen: boolean;
  /** The one-time cinematic tour of the neglected garden (fresh game only). */
  openingGardenTourSeen: boolean;
  /** Per-object: has the player opened its task letter yet. */
  lettersSeen: Record<string, boolean>;
  objects: Record<string, ObjectProgress>;
  /** Per-object: ids of purchased requests. */
  requests: Record<string, string[]>;
  /** Per-object: Catch & Collect progress. */
  minigame: Record<string, MiniGameProgress>;
  /**
   * World-collected habitat resources (carrots, herbs, acorns, ...) — see
   * data/resources.ts. A real accumulating inventory, not a fake UI number.
   * Absent in saves from before this existed; migrate() defaults it to {}.
   */
  resources: Record<string, number>;
  /**
   * Per-resource-source restoration state (see data/habitats.ts) — keyed by
   * RestorationResource.id. True once that specific world resource has been
   * restored; independent of the owning animal's overall unlock state, so a
   * habitat can improve gradually rather than flipping all-or-nothing.
   * Absent in older saves; migrate() defaults it to {}.
   */
  restoredSources: Record<string, boolean>;
  /** Frosted Valley (World 2) progression — fully separate from every Garden field above. */
  frostedValley: FrostedValleySaveState;
  /** Frosted Valley's Winter Market (Shop) — fully separate from every field above. */
  frostedShop: FrostedShopSaveState;
  stats: {
    puzzlesSolved: number;
    startedAt: number;
    lastPlayed: number;
  };
  /** Personalization/customization layer — separate from the restoration
   *  system above. See data/shop.ts + core/ShopService.ts. */
  shop: ShopSaveState;
}

/** One decoration the player has placed in the world (Part N). */
export interface PlacedDecor {
  placementId: string;
  itemId: string;
  x: number;
  y: number;
}

export interface ShopSaveState {
  /** True once the Shop building is interactive — set after Nibs's first rescue. */
  unlocked: boolean;
  /** Calendar date ("YYYY-MM-DD", local) the current Daily selection was rolled
   *  for — reopening the Shop the same day must show the same six items. */
  dailyDate: string;
  dailyItemIds: string[];
  /** Decor bought but not yet placed, itemId -> count. */
  decorInventory: Record<string, number>;
  placedDecor: PlacedDecor[];
  ownedAccessories: string[];
  /** animalId -> slot -> accessoryId currently worn in that slot. */
  equippedAccessories: Record<string, Record<string, string>>;
  mysteryGiftsOpened: number;
  /** Purchased Puzzle Hints not yet used (spent one per rescue puzzle, max). */
  hintsOwned: number;
}

export interface MiniGameProgress {
  level: number;
  roundsCompleted: number;
}

/* ---------- Frosted Valley (World 2) — isolated progression slice ---------- */

/** One damaged→restored restoration target belonging to a Frosted Valley animal's habitat. */
export interface FrostedResourceDef {
  id: string;
  label: string;
  /** Texture key of the neglected/damaged sprite already standing in the world. */
  damagedAsset: string;
  /** Texture key it crossfades to once restored. */
  restoredAsset: string;
  /** How many mission items the Garden Maze run for this resource asks for. */
  requiredAmount: number;
  /** What the player actually collects in the maze for this resource — a clearly recognisable object. */
  mazeItem: FrostedMazeItemDef;
}

/** The mission collectible of one resource's Garden Maze run (e.g. Carrots for the Carrot Patch). */
export interface FrostedMazeItemDef {
  /** Texture key; `mz_*` keys are SVGs FrostedMazeScene loads at high resolution, `fv_*` are Frosted Valley art. */
  texture: string;
  /** Plural, as shown in "COLLECT 5 CARROTS". */
  label: string;
  /** Singular, for "+1 Carrot" style feedback. */
  singular: string;
}

/** One of the six Frosted Valley animals and its habitat. */
export interface FrostedAnimalDef {
  id: string;
  name: string;
  habitatName: string;
  /** Position in the fixed rescue order (0 = first). */
  order: number;
  /** Exactly one resource per restoration target — normally 3; see data file for any short of that. */
  resources: FrostedResourceDef[];
  coinReward: number;
  letterBody: string;
  /** The animal's final reward puzzle, unlocked only once every resource is restored. */
  puzzle: FrostedPuzzleDef;
}

/**
 * One animal's irregular jigsaw. Difficulty rises along the rescue order through
 * more pieces AND through the knobs: `irregularity` (0..1) drives how far knob
 * size/placement/skew and the lattice corners wander from a clean grid.
 */
export interface FrostedPuzzleDef {
  /** Texture key; the file is public/assets/frosted/puzzle/<image>.jpg (existing final art, never regenerated). */
  image: string;
  cols: number;
  rows: number;
  irregularity: number;
  /** Strength of the faint cut-line guide etched on the empty board (lower = harder). The board never shows the picture itself. */
  guideAlpha: number;
  /** Snap tolerance as a fraction of the smaller cell side. */
  snapFactor: number;
}

/** Per-resource runtime progress, persisted. */
export interface FrostedResourceProgress {
  current: number;
  restored: boolean;
}

/** Per-animal runtime progress, persisted. */
export interface FrostedAnimalProgress {
  resources: Record<string, FrostedResourceProgress>;
  rescued: boolean;
  rewardClaimed: boolean;
  /** This animal's own introductory letter — shown once, the moment it becomes the active chapter. */
  letterSeen: boolean;
  /**
   * The reward puzzle is solved but the 10s unlock cinematic hasn't finished
   * yet — `rescued` is only committed at the END of that cinematic, so a reload
   * in between replays the cinematic once instead of skipping or losing it.
   */
  puzzleSolved?: boolean;
}

export interface FrostedValleySaveState {
  /** Index into the fixed FROSTED_CATALOG order — the only animal currently active/interactive. */
  currentAnimalIndex: number;
  animals: Record<string, FrostedAnimalProgress>;
  /** Garden Maze: has the one-time "How to play" card been dismissed? */
  mazeTutorialSeen: boolean;
  /** Garden Maze: maze ids still unplayed in the current shuffle deck (refilled + reshuffled once empty). */
  mazeDeck: string[];
  /** Garden Maze: the last maze played, so a reshuffle never hands it straight back. */
  lastMazeId?: string;
  /**
   * Story / envelope notes (see data/frostedStory.ts) and one-time tutorials
   * already shown — e.g. "rabbit_intro_seen", "pacman_hit_tutorial_seen".
   * Optional so older saves (and test fixtures) without it still type-check.
   */
  storyNotesSeen?: Record<string, true>;
}

/* ---------- Frosted Valley Winter Market (Shop) — isolated slice ---------- */

export type FrostedShopCategory = "building" | "pet" | "plant" | "decoration";

/** Where a "pet" category item attaches on an animal's portrait, as a fraction of its displayed width/height. */
export type FrostedShopAnchor = "head" | "face" | "neck" | "collar";

/** One purchasable Shop item — reuses a real, already-painted piece of Frosted Valley art. */
export interface FrostedShopItemDef {
  id: string;
  label: string;
  /** Texture key, loaded from public/assets/frosted/shop/. */
  textureKey: string;
  category: FrostedShopCategory;
  price: number;
  /** World-unit display height when placed (native aspect is preserved), matching propH's convention. Ignored for "pet" items — see previewScale. */
  targetHeight: number;
  /**
   * What fraction of the RAW source PNG's height is actually the visible
   * artwork (the rest is transparent padding around it) — measured from the
   * real file, not guessed. Placement code divides by this so `targetHeight`
   * means the item's true on-screen height, the same fix applied to pet
   * accessories: without it, a padded PNG renders smaller than intended and
   * looks "tiny" next to the world's own un-padded building art. Defaults to
   * 1 (no correction) for any item this hasn't been measured for yet.
   */
  visibleHeightFraction?: number;
  /** "pet" items only: which anchor on the animal portrait this attaches to. */
  anchor?: FrostedShopAnchor;
  /** "pet" items only: size relative to the animal's own displayed height. */
  previewScale?: number;
}

/** One decoration the player has purchased and placed in the world. */
export interface FrostedShopPlacement {
  id: string;
  itemId: string;
  x: number;
  y: number;
  rotation: number;
}

export interface FrostedShopSaveState {
  placements: FrostedShopPlacement[];
  /** "pet" category items the player owns — separate from placements, since accessories are worn, not placed in the world. */
  petOwned: Record<string, true>;
  /** Per-animal: the itemId currently worn, or null. Only ever set for owned "pet" items. */
  equipped: Record<string, string | null>;
}

/* ---------- runtime view-model ---------- */

export interface CurrentTaskVM {
  object: GardenObjectDef;
  completed: number;
  required: number;
  nextGrid: GridSize;
  segments: boolean[];
}

export interface RequestsVM {
  object: GardenObjectDef;
  purchased: Set<string>;
  completed: number;
  total: number;
  isComplete: boolean;
}

/** One goal within a Catch & Collect level: catch `target` of `itemId`. */
export interface LevelGoal {
  itemId: string;
  target: number;
}

export interface LevelDef {
  level: number;
  goals: LevelGoal[];
  reward: number;
}
