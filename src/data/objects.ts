import type { GardenObjectDef } from "./types";

/**
 * The unlockable catalog, ordered by `unlock_order`. Everything about an object —
 * its puzzle, where it lives, how it enters, how it idles, its reward — is data here.
 * Adding the next object = adding a row + one or two pictures. No new code paths.
 */
export const RABBIT: GardenObjectDef = {
  id: "rabbit",
  name: "Nibs the Rabbit",
  category: "animal",
  tier: "common",

  garden_sprite: "rabbit",
  garden_position: { x: 900, y: 1500 },
  garden_scale: 0.92,
  region: "animalMeadow",
  layer: "actors",

  puzzles_required: 1,
  // Tutorial puzzle: 4 pieces (2x2). Calm first win — generous snap radius.
  puzzle: { image: "rabbit_portrait", grids: [{ cols: 2, rows: 2 }], snapRadiusFactor: 0.62 },

  reward_coins: 15,
  unlock_order: 0,

  reveal_animation: "hop_in",
  idle_behavior: "rabbit_hop",
  movement_bounds: { shape: "rect", x: 900, y: 1500, w: 460, h: 260 },

  story_text:
    "Something small and gentle waits at the meadow's edge, hoping this garden could feel like home.",
  unlock_toast: "Nibs hops into the meadow and settles in.",
};

export const BIRD: GardenObjectDef = {
  id: "bird",
  name: "Pip the Songbird",
  category: "animal",
  tier: "common",

  garden_sprite: "bird",
  garden_position: { x: 1560, y: 1360 },
  garden_scale: 1.0,
  region: "cottageYard",
  layer: "actors",

  puzzles_required: 1,
  puzzle: { image: "bird_portrait", grids: [{ cols: 2, rows: 2 }], snapRadiusFactor: 0.6 },

  reward_coins: 15,
  unlock_order: 1,

  reveal_animation: "hop_in",
  idle_behavior: "bird_ground",
  movement_bounds: { shape: "rect", x: 1560, y: 1360, w: 360, h: 190 },

  story_text:
    "The old fence has been silent for years. A little song is trying to find its way back to it.",
  unlock_toast: "Pip lands on the fence and tries a first note.",
};

export const CATALOG: GardenObjectDef[] = [RABBIT, BIRD];
