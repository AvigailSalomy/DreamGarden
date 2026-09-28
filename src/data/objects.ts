import type { GardenObjectDef } from "./types";

/**
 * The unlockable catalog, ordered by `unlock_order`. Everything about an object —
 * its puzzle, where it lives, how it enters, how it idles, its letter, its reward —
 * is data here. Adding the next restoration = adding a row + one or two pictures.
 *
 * Progression is exactly the six animals, in this order:
 *   Rabbit → Bird → Hedgehog → Squirrel → Fox → Deer
 * (see ProgressionService.animalOrder/isAnimalLocked). There is no
 * intermediate non-animal task — a "resource" like the Wildflower Patch is
 * one of an ANIMAL's 3 habitat resources (data/habitats.ts), never its own
 * progression stage.
 */
export const RABBIT: GardenObjectDef = {
  id: "rabbit",
  name: "Nibs the Rabbit",
  category: "animal",
  requestPropsTransient: true,
  tier: "common",

  garden_sprite: "dg_rabbit",
  garden_position: { x: 900, y: 1500 },
  // production PNG is native ~671x1100 — scale
  // down to roughly the same on-screen footprint the garden layout was tuned for.
  garden_scale: 0.10,
  region: "animalMeadow",
  layer: "actors",

  puzzles_required: 1,
  // 2x3 = 6 pieces — the first rescue puzzle, meaningfully more than a 2x2
  puzzle: { image: "rabbit_portrait", grids: [{ cols: 2, rows: 3 }], snapRadiusFactor: 0.66 },

  reward_coins: 15,
  unlock_order: 0,

  reveal_animation: "hop_in",
  idle_behavior: "rabbit_hop",
  movement_bounds: { shape: "rect", x: 900, y: 1500, w: 60, h: 34 },
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

  requests: [
    {
      id: "carrot_basket",
      label: "Carrot Basket",
      icon: "carrot",
      cost: 50,
      order: 0,
      worldSprite: "carrot_basket_prop",
      worldOffset: { x: -150, y: 30 },
    },
    {
      id: "soft_hay",
      label: "Soft Hay",
      icon: "hay",
      cost: 70,
      order: 1,
      worldSprite: "soft_hay_prop",
      worldOffset: { x: 140, y: 20 },
    },
    {
      id: "clover_patch",
      label: "Clover Patch",
      icon: "clover",
      cost: 90,
      order: 2,
      worldSprite: "clover_patch_prop",
      worldOffset: { x: 0, y: -70 },
    },
  ],
  miniGamePool: [
    { id: "carrot", icon: "carrot", label: "Carrot" },
    { id: "clover", icon: "clover", label: "Clover" },
    { id: "apple", icon: "apple", label: "Apple" },
    { id: "hay", icon: "hay", label: "Hay" },
  ],
};

export const BIRD: GardenObjectDef = {
  id: "bird",
  name: "Pip the Songbird",
  category: "animal",
  requestPropsTransient: true,
  tier: "common",

  garden_sprite: "dg_bluebird",
  garden_position: { x: 1750, y: 1182 }, // perched on the cottage-yard fence rail
  // production PNG is native ~1049x1057 — scale
  // down to roughly the same on-screen footprint the garden layout was tuned for.
  garden_scale: 0.065,
  region: "cottageYard",
  layer: "actors",

  puzzles_required: 1,
  // 2x3 = 6 pieces (reuses the same drag-and-snap engine, just a bigger grid).
  // 2x4 = 8 pieces
  puzzle: { image: "bird_portrait", grids: [{ cols: 2, rows: 4 }], snapRadiusFactor: 0.62 },

  reward_coins: 15,
  unlock_order: 1,

  reveal_animation: "fly_in_perch",
  idle_behavior: "bird_perch",
  // aerial box for the occasional short takeoff-and-return flight
  movement_bounds: { shape: "rect", x: 1750, y: 1110, w: 60, h: 34 },
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

  requests: [
    {
      id: "bird_seeds",
      label: "Bird Seeds",
      icon: "bird_seeds_prop",
      cost: 45,
      order: 0,
      worldSprite: "bird_seeds_prop",
      worldOffset: { x: -90, y: 90 },
    },
    {
      id: "water_dish",
      label: "Water Dish",
      icon: "water_dish_prop",
      cost: 60,
      order: 1,
      worldSprite: "water_dish_prop",
      worldOffset: { x: 70, y: 100 },
    },
    {
      id: "cozy_perch",
      label: "Cozy Perch",
      icon: "cozy_perch_prop",
      cost: 75,
      order: 2,
      worldSprite: "cozy_perch_prop",
      worldOffset: { x: -10, y: -40 },
    },
  ],
  miniGamePool: [
    { id: "seed", icon: "seed", label: "Seed" },
    { id: "berry", icon: "berry", label: "Berry" },
    { id: "feather", icon: "feather", label: "Feather" },
    { id: "leaf", icon: "leaf", label: "Leaf" },
  ],
};

export const HEDGEHOG: GardenObjectDef = {
  id: "hedgehog",
  name: "Pebble the Hedgehog",
  category: "animal",
  requestPropsTransient: true,
  tier: "common",

  garden_sprite: "dg_hedgehog",
  garden_position: { x: 560, y: 2080 },
  garden_scale: 0.075,
  region: "animalMeadow",
  layer: "actors",

  puzzles_required: 1,
  // 2x5 = 10 pieces
  puzzle: { image: "dg_hedgehog_puzzle", grids: [{ cols: 2, rows: 5 }], snapRadiusFactor: 0.66 },

  reward_coins: 20,
  unlock_order: 2,

  reveal_animation: "scale_bloom",
  idle_behavior: "rabbit_hop",
  movement_bounds: { shape: "rect", x: 560, y: 2080, w: 60, h: 34 },
  complete_sfx: "bloomChime",

  letter: {
    body:
      "Something small is curled up beneath the mossy rocks.\n" +
      "The herbs nearby have gone quiet and wild.\n" +
      "Could you coax this little one out?",
    button: "Let's Help",
  },
  overview_text: "The nook rustles — Pebble is home.",
  story_text: "A shy shape sleeps under the moss, waiting for its wild little garden to feel safe again.",
  unlock_toast: "Pebble uncurls and sniffs at the herbs, at home again.",

  // Simple coin-cost requests — same PRE-rescue puzzle-unlock gate Rabbit/
  // Bird use (buy all 3, then the puzzle unlocks). The 3 REAL habitat
  // resources (mossy log / mushroom log / herb patch) are a separate,
  // POST-rescue mechanic (data/habitats.ts + the Request Page) — never
  // gating the puzzle itself, since their resources don't exist yet.
  requests: [
    {
      id: "cozy_bedding",
      label: "Cozy Bedding",
      icon: "leaf",
      cost: 40,
      order: 0,
      worldSprite: "leaf",
      worldOffset: { x: -80, y: 20 },
      worldScale: 2,
    },
    {
      id: "warm_blanket",
      label: "Warm Blanket",
      icon: "clover",
      cost: 55,
      order: 1,
      worldSprite: "clover",
      worldOffset: { x: 70, y: 10 },
      worldScale: 2,
    },
    {
      id: "welcome_snack",
      label: "Welcome Snack",
      icon: "berry",
      cost: 70,
      order: 2,
      worldSprite: "berry",
      worldOffset: { x: 0, y: -50 },
      worldScale: 2,
    },
  ],
  miniGamePool: [
    { id: "seed", icon: "seed", label: "Seed" },
    { id: "leaf", icon: "leaf", label: "Leaf" },
    { id: "berry", icon: "berry", label: "Berry" },
    { id: "clover", icon: "clover", label: "Clover" },
  ],
};

export const SQUIRREL: GardenObjectDef = {
  id: "squirrel",
  name: "Hazel the Squirrel",
  category: "animal",
  requestPropsTransient: true,
  tier: "common",

  garden_sprite: "dg_squirrel",
  garden_position: { x: 2380, y: 1420 },
  garden_scale: 0.09,
  region: "treeGrove",
  layer: "actors",

  puzzles_required: 1,
  // 3x4 = 12 pieces
  puzzle: { image: "dg_squirrel_puzzle", grids: [{ cols: 3, rows: 4 }], snapRadiusFactor: 0.66 },

  reward_coins: 20,
  unlock_order: 3,

  reveal_animation: "scale_bloom",
  idle_behavior: "rabbit_hop",
  movement_bounds: { shape: "rect", x: 2380, y: 1420, w: 60, h: 34 },
  complete_sfx: "bloomChime",

  letter: {
    body:
      "The old oak has forgotten its acorns.\n" +
      "I keep seeing a little tail dart between the bare branches.\n" +
      "Let's give the grove something to come home to.",
    button: "Let's Help",
  },
  overview_text: "The grove chatters again — Hazel is home.",
  story_text: "A quick little shape circles the empty oak, looking for a grove worth staying in.",
  unlock_toast: "Hazel scampers up the oak and claims it as home.",

  // Simple coin-cost puzzle-unlock gate (see HEDGEHOG's comment above) — the
  // 3 real resources (acorn oak / nut cache / apple tree) are a separate
  // POST-rescue mechanic.
  requests: [
    {
      id: "acorn_snack",
      label: "Acorn Snack",
      icon: "apple",
      cost: 40,
      order: 0,
      worldSprite: "apple",
      worldOffset: { x: -80, y: 20 },
      worldScale: 2,
    },
    {
      id: "cozy_hollow",
      label: "Cozy Hollow",
      icon: "leaf",
      cost: 55,
      order: 1,
      worldSprite: "leaf",
      worldOffset: { x: 70, y: 10 },
      worldScale: 2,
    },
    {
      id: "welcome_nuts",
      label: "Welcome Nuts",
      icon: "hay",
      cost: 70,
      order: 2,
      worldSprite: "hay",
      worldOffset: { x: 0, y: -50 },
      worldScale: 2,
    },
  ],
  miniGamePool: [
    { id: "apple", icon: "apple", label: "Apple" },
    { id: "leaf", icon: "leaf", label: "Leaf" },
    { id: "seed", icon: "seed", label: "Seed" },
    { id: "hay", icon: "hay", label: "Hay" },
  ],
};

export const FOX: GardenObjectDef = {
  id: "fox",
  name: "Ember the Fox",
  category: "animal",
  requestPropsTransient: true,
  tier: "common",

  garden_sprite: "dg_fox",
  garden_position: { x: 2820, y: 1620 },
  garden_scale: 0.115,
  region: "treeGrove",
  layer: "actors",

  puzzles_required: 1,
  // 2x7 = 14 pieces
  puzzle: { image: "dg_fox_puzzle", grids: [{ cols: 2, rows: 7 }], snapRadiusFactor: 0.66 },

  reward_coins: 20,
  unlock_order: 4,

  reveal_animation: "scale_bloom",
  idle_behavior: "rabbit_hop",
  movement_bounds: { shape: "rect", x: 2820, y: 1620, w: 60, h: 34 },
  complete_sfx: "bloomChime",

  letter: {
    body:
      "The ferns at the woodland's edge have gone bare.\n" +
      "Something bright and quick keeps watching from the shadows.\n" +
      "This woodland could use a friend.",
    button: "Let's Help",
  },
  overview_text: "The woodland warms — Ember is home.",
  story_text: "A watchful shape waits at the tree line, hoping the woodland grows wild and green again.",
  unlock_toast: "Ember steps into the ferns and settles in.",

  // Simple coin-cost puzzle-unlock gate (see HEDGEHOG's comment above) — the
  // 3 real resources (berry vine / fern cluster / grape vine) are a separate
  // POST-rescue mechanic.
  requests: [
    {
      id: "warm_bedding",
      label: "Warm Bedding",
      icon: "leaf",
      cost: 40,
      order: 0,
      worldSprite: "leaf",
      worldOffset: { x: -80, y: 20 },
      worldScale: 2,
    },
    {
      id: "welcome_berries",
      label: "Welcome Berries",
      icon: "berry",
      cost: 55,
      order: 1,
      worldSprite: "berry",
      worldOffset: { x: 70, y: 10 },
      worldScale: 2,
    },
    {
      id: "cozy_den_lining",
      label: "Cozy Den Lining",
      icon: "feather",
      cost: 70,
      order: 2,
      worldSprite: "feather",
      worldOffset: { x: 0, y: -50 },
      worldScale: 2,
    },
  ],
  miniGamePool: [
    { id: "berry", icon: "berry", label: "Berry" },
    { id: "leaf", icon: "leaf", label: "Leaf" },
    { id: "feather", icon: "feather", label: "Feather" },
    { id: "clover", icon: "clover", label: "Clover" },
  ],
};

export const DEER: GardenObjectDef = {
  id: "deer",
  name: "Willow the Deer",
  category: "animal",
  requestPropsTransient: true,
  tier: "special",

  garden_sprite: "dg_deer",
  garden_position: { x: 2680, y: 1020 },
  garden_scale: 0.16,
  region: "farmCorner",
  layer: "actors",

  puzzles_required: 1,
  // 4x4 = 16 pieces — the hardest rescue puzzle
  puzzle: { image: "dg_deer_puzzle", grids: [{ cols: 4, rows: 4 }], snapRadiusFactor: 0.66 },

  reward_coins: 25,
  unlock_order: 5,

  reveal_animation: "scale_bloom",
  idle_behavior: "rabbit_hop",
  movement_bounds: { shape: "rect", x: 2680, y: 1020, w: 60, h: 34 },
  complete_sfx: "bloomChime",

  letter: {
    body:
      "The old clearing has lost its glow.\n" +
      "Moonflowers used to bloom there, before it fell quiet.\n" +
      "I think something gentle is still waiting to return.",
    button: "Let's Help",
  },
  overview_text: "The clearing shimmers — Willow is home.",
  story_text: "A gentle shape lingers at the edge of a clearing that used to glow with moonflowers.",
  unlock_toast: "Willow steps into the clearing, and it glows a little brighter.",

  // Simple coin-cost puzzle-unlock gate (see HEDGEHOG's comment above) — the
  // 3 real resources (moonflower meadow / enchanted berry shrine / enchanted
  // mushroom ring) are a separate POST-rescue mechanic.
  requests: [
    {
      id: "silver_ribbon",
      label: "Silver Ribbon",
      icon: "flower_petals",
      cost: 45,
      order: 0,
      worldSprite: "flower_petals",
      worldOffset: { x: -80, y: 20 },
      worldScale: 2,
    },
    {
      id: "clearing_lantern",
      label: "Clearing Lantern",
      icon: "water_drop",
      cost: 60,
      order: 1,
      worldSprite: "water_drop",
      worldOffset: { x: 70, y: 10 },
      worldScale: 2,
    },
    {
      id: "welcome_blossoms",
      label: "Welcome Blossoms",
      icon: "leaf",
      cost: 75,
      order: 2,
      worldSprite: "leaf",
      worldOffset: { x: 0, y: -50 },
      worldScale: 2,
    },
  ],
  miniGamePool: [
    { id: "flower_petals", icon: "flower_petals", label: "Flower Petals" },
    { id: "leaf", icon: "leaf", label: "Leaf" },
    { id: "berry", icon: "berry", label: "Berry" },
    { id: "water_drop", icon: "water_drop", label: "Water Drop" },
  ],
};

export const CATALOG: GardenObjectDef[] = [RABBIT, BIRD, HEDGEHOG, SQUIRREL, FOX, DEER];
