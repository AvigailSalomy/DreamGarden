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
  stats: {
    puzzlesSolved: number;
    startedAt: number;
    lastPlayed: number;
  };
}

export interface MiniGameProgress {
  level: number;
  roundsCompleted: number;
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
