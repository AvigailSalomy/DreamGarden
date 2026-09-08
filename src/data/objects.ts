import type { GardenObjectDef } from "./types";

/**
 * The unlockable catalog, ordered by `unlock_order`. The architecture supports the
 * full 8-10 object garden; the vertical slice ships ONLY the rabbit. Adding the next
 * object later = adding a row here + one picture.
 */
export const RABBIT: GardenObjectDef = {
  id: "rabbit",
  name: "Nibs the Rabbit",
  category: "animal",
  tier: "common",

  garden_sprite: "rabbit",
  garden_position: { x: 505, y: 1010 },
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
  movement_bounds: { shape: "rect", x: 505, y: 1010, w: 420, h: 240 },

  story_text:
    "Something small and gentle waits at the meadow's edge, hoping this garden could feel like home.",
  unlock_toast: "Nibs hops into the meadow and settles in.",
};

export const CATALOG: GardenObjectDef[] = [RABBIT];
