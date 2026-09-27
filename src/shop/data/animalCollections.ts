import type { AnimalCollectionDef } from "../types";

/**
 * The Shop's own animal roster — a superset of the main game's `CATALOG`.
 * `animalId` is cross-referenced at runtime (see `ShopService.collections()`)
 * against real unlock state; an id with no matching `GardenObjectDef` (the
 * `comingSoon` rows below) can never resolve as unlocked, no matter what.
 * Adding a real future animal to the main game automatically wires up its
 * collection here — no Shop code changes needed, only a new row.
 */
export const ANIMAL_COLLECTIONS: AnimalCollectionDef[] = [
  {
    animalId: "rabbit",
    displayName: "Rabbit",
    icon: "rabbit",
    accessoryIds: ["bow", "crown", "glasses", "fairy_wings", "magic_hat", "carrot_backpack"],
  },
  {
    animalId: "bird",
    displayName: "Songbird",
    icon: "bird",
    accessoryIds: ["bow", "crown", "glasses", "scarf", "headphones"],
  },

  // ---- future collections: ids only, no matching CATALOG entry yet ----
  // These stay permanently locked until an animal with this id is actually
  // added to src/data/objects.ts — the whole point of the data-driven design.
  {
    animalId: "squirrel",
    displayName: "Squirrel",
    comingSoon: true,
    accessoryIds: ["tiny_cap", "leaf_hat", "acorn_bag", "autumn_scarf", "acorn_crown"],
  },
  {
    animalId: "hedgehog",
    displayName: "Hedgehog",
    comingSoon: true,
    accessoryIds: ["mushroom_hat", "flower_crown", "tiny_scarf", "butterfly_friend", "forest_accessories"],
  },
  {
    animalId: "bear",
    displayName: "Bear",
    comingSoon: true,
    accessoryIds: ["bear_hat", "honey_backpack", "bear_glasses", "bear_crown", "cozy_scarf"],
  },
];
