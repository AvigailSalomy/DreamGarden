import type { GardenItemDef } from "../types";

/** Personalize the restored world — visual/experiential, never gameplay power. */
export const GARDEN_DECORATIONS: GardenItemDef[] = [
  { id: "bench", label: "Garden Bench", icon: "shop_bench", rarity: "common", price: 60, category: "decoration" },
  { id: "garden_lamp", label: "Garden Lamp", icon: "shop_garden_lamp", rarity: "common", price: 45, category: "decoration" },
  { id: "birdhouse", label: "Birdhouse", icon: "shop_birdhouse", rarity: "common", price: 55, category: "decoration" },
  { id: "flower_arrangement", label: "Flower Arrangement", icon: "flower", rarity: "common", price: 35, category: "decoration" },
  { id: "swing", label: "Garden Swing", icon: "shop_swing", rarity: "rare", price: 110, category: "decoration" },
  { id: "magic_mushroom", label: "Magical Mushroom", icon: "shop_magic_mushroom", rarity: "rare", price: 90, category: "decoration" },
  { id: "cherry_blossom", label: "Cherry Blossom Sapling", icon: "sapling", rarity: "rare", price: 120, category: "decoration" },
  { id: "fountain", label: "Fountain", icon: "shop_fountain", rarity: "epic", price: 140, category: "decoration" },
  { id: "statue", label: "Garden Statue", icon: "shop_statue", rarity: "epic", price: 150, category: "decoration" },
  { id: "small_pond", label: "Small Pond", icon: "shop_small_pond", rarity: "epic", price: 160, category: "decoration" },
];

/** Places animals can eventually walk to / sit beside / sleep near — behavior deferred. */
export const ANIMAL_HOMES: GardenItemDef[] = [
  { id: "tent", label: "Tiny Tent", icon: "shop_tent", rarity: "common", price: 70, category: "home" },
  { id: "tiny_house", label: "Small Animal House", icon: "shop_tiny_house", rarity: "rare", price: 130, category: "home" },
  { id: "mushroom_house", label: "Mushroom House", icon: "shop_mushroom_house", rarity: "epic", price: 170, category: "home" },
  { id: "treehouse", label: "Treehouse", icon: "shop_treehouse", rarity: "epic", price: 180, category: "home" },
];

/** Aspirational, expensive, magical — the "I really want that in my garden" tier. */
export const SPECIAL_ITEMS: GardenItemDef[] = [
  { id: "golden_statue", label: "Golden Animal Statue", icon: "shop_golden_statue", rarity: "epic", price: 320, category: "special" },
  { id: "moon_tree", label: "Moon Tree", icon: "shop_moon_tree", rarity: "legendary", price: 380, category: "special" },
  { id: "rainbow_fountain", label: "Rainbow Fountain", icon: "shop_rainbow_fountain", rarity: "legendary", price: 400, category: "special" },
  { id: "magic_portal", label: "Magic Portal", icon: "shop_magic_portal", rarity: "legendary", price: 450, category: "special" },
];

/**
 * A single purchasable mystery item. Planting/growing is out of scope for
 * this pass (it would touch the shared Garden scene) — v1 sells it as a
 * collectible; `mystery_seed_sprout`/`mystery_seed_bloom` are loaded now so
 * the preview can illustrate the eventual growth arc without wiring it up.
 */
export const MYSTERY_SEED: GardenItemDef = {
  id: "mystery_seed",
  label: "Mystery Seed",
  icon: "shop_mystery_seed_unplanted",
  rarity: "epic",
  price: 120,
  category: "seed",
};

export const ALL_GARDEN_ITEMS: GardenItemDef[] = [
  ...GARDEN_DECORATIONS,
  ...ANIMAL_HOMES,
  ...SPECIAL_ITEMS,
  MYSTERY_SEED,
];
