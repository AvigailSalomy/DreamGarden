import type { GardenObjectDef } from "./types";

/**
 * The unlockable catalog, ordered by `unlock_order`. Everything about an object —
 * its puzzle, where it lives, how it enters, how it idles, its letter, its reward —
 * is data here. Adding the next restoration = adding a row + one or two pictures.
 *
 * Milestone 3 progression:  Rabbit → Wildflowers → Songbird
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
  puzzle: { image: "rabbit_portrait", grids: [{ cols: 2, rows: 2 }], snapRadiusFactor: 0.66 },

  reward_coins: 15,
  unlock_order: 0,

  reveal_animation: "hop_in",
  idle_behavior: "rabbit_hop",
  movement_bounds: { shape: "rect", x: 900, y: 1500, w: 460, h: 260 },
  complete_sfx: "rabbitChirp",

  letter: {
    body:
      "A tiny visitor is hiding near the meadow.\n" +
      "I think he's waiting for the garden to feel safe again.\n" +
      "Can you bring Nibs home?",
    button: "Let's Help",
  },
  overview_text: "The meadow breathes again — Nibs is home.",
  story_text:
    "Something small and gentle waits at the meadow's edge, hoping this garden could feel like home.",
  unlock_toast: "Nibs hops into the meadow and settles in.",
};

export const WILDFLOWERS: GardenObjectDef = {
  id: "wildflowers",
  name: "Wildflower Bed",
  category: "plant",
  tier: "common",

  garden_sprite: "wildflower_bed",
  // sits ON the existing front planter — the flowers grow from its soil
  garden_position: { x: 470, y: 1652 },
  garden_scale: 0.98,
  region: "flowerBed",
  layer: "back",

  puzzles_required: 1,
  // 2x2 = 4 pieces; the picture reconstructs the restored bloom.
  puzzle: { image: "wildflowers_portrait", grids: [{ cols: 2, rows: 2 }], snapRadiusFactor: 0.66 },

  reward_coins: 30,
  unlock_order: 1,

  reveal_animation: "bloom_wave",
  idle_behavior: "plant_sway",
  complete_sfx: "bloomChime",

  letter: {
    body:
      "The old flower bed has forgotten its colors.\n" +
      "But beneath the dry soil, something is still waiting.\n" +
      "Let's help it bloom.",
    button: "Let's Help",
  },
  overview_text: "Colour spills back across the old bed.",
  story_text:
    "The flower bed is dry and grey, but the roots underneath still remember how to bloom.",
  unlock_toast: "The wildflower bed bursts into pink, gold and violet.",
};

export const BIRD: GardenObjectDef = {
  id: "bird",
  name: "Pip the Songbird",
  category: "animal",
  tier: "common",

  garden_sprite: "bird",
  garden_position: { x: 1750, y: 1182 }, // perched on the cottage-yard fence rail
  garden_scale: 1.0,
  region: "cottageYard",
  layer: "actors",

  puzzles_required: 1,
  // 2x3 = 6 pieces (reuses the same drag-and-snap engine, just a bigger grid).
  puzzle: { image: "bird_portrait", grids: [{ cols: 2, rows: 3 }], snapRadiusFactor: 0.62 },

  reward_coins: 15,
  unlock_order: 2,

  reveal_animation: "fly_in_perch",
  idle_behavior: "bird_perch",
  // aerial box for the occasional short takeoff-and-return flight
  movement_bounds: { shape: "rect", x: 1750, y: 1110, w: 460, h: 300 },
  complete_sfx: "birdSong",

  letter: {
    body:
      "The old perch has been silent for too long.\n" +
      "I found a feather beneath the arch this morning.\n" +
      "Perhaps Pip is ready to return.",
    button: "Begin",
  },
  overview_text: "A first bright note drifts over the garden.",
  story_text:
    "The fence rail by the archway has held no song for years. Something small still wants to sing there.",
  unlock_toast: "Pip glides down to the fence rail and tries a first note.",
};

export const CATALOG: GardenObjectDef[] = [RABBIT, WILDFLOWERS, BIRD];
