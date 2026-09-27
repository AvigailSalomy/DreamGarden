/**
 * Shop data model — deliberately isolated from `src/data/types.ts`. The Shop
 * reads the main game's unlocked-animal/coin state through narrow read-only
 * interfaces (see `ShopService`); it never extends or depends on the shape
 * of `GardenObjectDef`/`SaveState` beyond an object's `id`.
 */

export type Rarity = "common" | "rare" | "epic" | "legendary";

/** A wearable customization item. */
export interface AccessoryDef {
  id: string;
  label: string;
  icon: string;
  rarity: Rarity;
  price: number;
  /** "universal" fits any animal; otherwise a list of compatible animal ids. */
  compatibleAnimalIds: string[] | "universal";
  /** Anchor for the illustrative preview overlay, relative to the animal sprite's center. */
  previewOffset: { x: number; y: number };
}

/**
 * One animal's Shop presence. `animalId` matches a real `GardenObjectDef.id`
 * when that animal already exists in the main game; `comingSoon: true` marks
 * a collection defined ahead of the animal actually being implemented there —
 * it will only ever render as locked until a matching catalog entry appears.
 */
export interface AnimalCollectionDef {
  animalId: string;
  displayName: string;
  /** Texture key for the collection tile; undefined (comingSoon) shows "???". */
  icon?: string;
  accessoryIds: string[];
  comingSoon?: boolean;
}

export type GardenItemCategory = "decoration" | "home" | "special" | "seed";

/** Garden decorations, animal homes, prestige items, and the Mystery Seed all share this shape. */
export interface GardenItemDef {
  id: string;
  label: string;
  icon: string;
  rarity: Rarity;
  price: number;
  category: GardenItemCategory;
}

export interface ShopSaveState {
  saveVersion: number;
  /** Every purchased item id (accessories + garden items), regardless of kind. */
  owned: Record<string, true>;
  /** One equipped accessory id per animal id (v1: a single slot). */
  equippedByAnimal: Record<string, string | null>;
}

/** Runtime view of one animal's collection, resolved against real unlock state. */
export interface AnimalCollectionVM {
  def: AnimalCollectionDef;
  unlocked: boolean;
  equippedAccessoryId: string | null;
}
