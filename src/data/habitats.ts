import type { RegionId } from "./types";

/**
 * The world-restoration layer: which garden-world RESOURCE SOURCES belong to
 * which animal's habitat, their real damaged/restored production-art pair,
 * what they produce, and what restores them.
 *
 * All 18 source images here are FINAL, externally-supplied production assets
 * (Game_Assets_Dream_Garden/{RABBIT,BIRD,HEDGEHOG,SQUIRREL,FOX,DEER}/) —
 * genuine structural damaged↔restored pairs, not tints. Filenames below are
 * exactly what was supplied; do not rename.
 *
 * State lives entirely in EXISTING save fields (SaveState.restoredSources,
 * SaveState.resources — both added alongside this file) — no parallel
 * progression system. A source's restored/damaged state is independent of
 * its owning animal's overall unlock state (see SaveState.restoredSources):
 * an animal can be rescued while its habitat is still mostly damaged, and
 * the habitat improves gradually as each source is individually restored.
 */

export interface RestorationResource {
  id: string;
  label: string;
  position: { x: number; y: number };
  scale: number;
  shadowW?: number;
  /** `dg_`-prefixed production texture key shown before restoration. */
  damagedAsset: string;
  /** `dg_`-prefixed production texture key shown once restored. */
  restoredAsset: string;
  /** Resource id (data/resources.ts) this source produces once restored. */
  produces: string;
  /**
   * Required inventory for an explicit post-rescue restoration. Acquisition
   * is routed independently through the Request screen's Get / Play action.
   */
  restoreCost: number;
}

export interface HabitatDef {
  id: string;
  animalId: string;
  name: string;
  region: RegionId;
  /** Where the animal itself lives/roams in this habitat. */
  homePosition: { x: number; y: number };
  resources: RestorationResource[];
}

export const RABBIT_HABITAT: HabitatDef = {
  id: "rabbitMeadow",
  animalId: "rabbit",
  name: "Rabbit's Meadow",
  region: "animalMeadow",
  homePosition: { x: 922, y: 1545 },
  resources: [
    {
      id: "rabbit_carrot_patch",
      label: "Carrot Patch",
      position: { x: 1095, y: 1595 },
      scale: 0.202,
      shadowW: 160,
      damagedAsset: "rabbit_carrot_patch_damaged",
      restoredAsset: "rabbit_carrot_patch_restored",
      produces: "carrot",
      restoreCost: 5,
    },
    {
      id: "rabbit_herb_patch",
      label: "Herb Patch",
      position: { x: 750, y: 1595 },
      scale: 0.182,
      shadowW: 140,
      damagedAsset: "rabbit_herb_patch_damaged",
      restoredAsset: "rabbit_herb_patch_restored",
      produces: "herb",
      restoreCost: 3,
    },
    {
      id: "rabbit_wildflower_patch",
      label: "Wildflower Patch",
      position: { x: 960, y: 1375 },
      scale: 0.163,
      shadowW: 120,
      damagedAsset: "rabbit_wildflower_patch_damaged",
      restoredAsset: "rabbit_wildflower_patch_restored",
      produces: "wildflower",
      restoreCost: 4,
    },
  ],
};

export const BIRD_HABITAT: HabitatDef = {
  id: "birdGarden",
  animalId: "bird",
  name: "Pip's Blossom Water Garden",
  region: "cottageYard",
  homePosition: { x: 1750, y: 1182 },
  resources: [
    {
      id: "bird_blossom_tree",
      label: "Blossom Tree",
      position: { x: 1710, y: 1085 },
      scale: 0.192,
      shadowW: 170,
      damagedAsset: "bird_blossom_tree_damaged",
      restoredAsset: "bird_blossom_tree_restored",
      produces: "blossom",
      restoreCost: 5,
    },
    {
      id: "bird_seed_feeder",
      label: "Seed Feeder",
      position: { x: 1600, y: 1280 },
      scale: 0.144,
      shadowW: 90,
      damagedAsset: "bird_seed_feeder_damaged",
      restoredAsset: "bird_seed_feeder_restored",
      produces: "seed",
      restoreCost: 5,
    },
    {
      id: "bird_water_lily_patch",
      label: "Water Lily Patch",
      position: { x: 1900, y: 1320 },
      scale: 0.192,
      shadowW: 150,
      damagedAsset: "bird_water_lily_patch_damaged",
      restoredAsset: "bird_water_lily_patch_restored",
      produces: "water_lily",
      restoreCost: 5,
    },
  ],
};

export const HEDGEHOG_HABITAT: HabitatDef = {
  id: "hedgehogNook",
  animalId: "hedgehog",
  name: "Hedgehog's Wild Herb & Mushroom Nook",
  region: "animalMeadow",
  // Moved well clear of Wildflowers' garden_position (470,1652) — its
  // taskGhost preview marker (a large, dim, tinted silhouette shown while
  // Wildflowers is the CURRENT task) has a bounding box wide enough to have
  // visually intruded on this habitat at its old, too-close position. That
  // ghost is pre-existing, correct behaviour; the fix is giving this habitat
  // its own clear footprint, not touching the marker itself.
  homePosition: { x: 572, y: 2110 },
  resources: [
    {
      id: "hedgehog_mossy_log",
      label: "Mossy Log",
      position: { x: 400, y: 2170 },
      scale: 0.163,
      shadowW: 150,
      damagedAsset: "hedgehog_mossy_log_damaged",
      restoredAsset: "hedgehog_mossy_log_restored",
      produces: "moss",
      restoreCost: 5,
    },
    {
      id: "hedgehog_mushroom_log",
      label: "Mushroom Log",
      position: { x: 740, y: 2170 },
      scale: 0.154,
      shadowW: 140,
      damagedAsset: "hedgehog_mushroom_log_damaged",
      restoredAsset: "hedgehog_mushroom_log_restored",
      produces: "mushroom",
      restoreCost: 5,
    },
    {
      id: "hedgehog_herb_patch",
      label: "Herb Patch",
      position: { x: 575, y: 1965 },
      scale: 0.154,
      shadowW: 130,
      damagedAsset: "hedgehog_herb_patch_damaged",
      restoredAsset: "hedgehog_herb_patch_restored",
      produces: "herb",
      restoreCost: 5,
    },
  ],
};

export const SQUIRREL_HABITAT: HabitatDef = {
  id: "squirrelGrove",
  animalId: "squirrel",
  name: "Squirrel's Acorn Woodland Grove",
  region: "treeGrove",
  homePosition: { x: 2440, y: 1645 },
  resources: [
    {
      id: "squirrel_acorn_oak",
      label: "Acorn Oak",
      position: { x: 2260, y: 1580 },
      scale: 0.192,
      shadowW: 170,
      damagedAsset: "squirrel_acorn_tree_damaged",
      restoredAsset: "squirrel_acorn_tree_restored",
      produces: "acorn",
      restoreCost: 5,
    },
    {
      id: "squirrel_nut_cache",
      label: "Nut Cache",
      position: { x: 2610, y: 1600 },
      scale: 0.144,
      shadowW: 120,
      damagedAsset: "squirrel_nut_cache_damaged",
      restoredAsset: "squirrel_nut_cache_restored",
      produces: "nut",
      restoreCost: 5,
    },
    {
      id: "squirrel_apple_tree",
      label: "Apple Tree",
      position: { x: 2440, y: 1880 },
      scale: 0.182,
      shadowW: 160,
      damagedAsset: "squirrel_apple_tree_damaged",
      restoredAsset: "squirrel_apple_tree_restored",
      produces: "apple",
      restoreCost: 5,
    },
  ],
};

export const FOX_HABITAT: HabitatDef = {
  id: "foxWoodland",
  animalId: "fox",
  name: "Fox's Fern & Berry Woodland",
  region: "treeGrove",
  homePosition: { x: 2915, y: 1750 },
  resources: [
    {
      id: "fox_berry_vine",
      label: "Berry Vine",
      position: { x: 3060, y: 1610 },
      scale: 0.173,
      shadowW: 140,
      damagedAsset: "fox_berry_vine_damaged",
      restoredAsset: "fox_berry_vine_restored",
      produces: "berry",
      restoreCost: 5,
    },
    {
      id: "fox_fern_cluster",
      label: "Fern Cluster",
      position: { x: 2760, y: 1760 },
      scale: 0.163,
      shadowW: 130,
      damagedAsset: "fox_fern_cluster_damaged",
      restoredAsset: "fox_fern_cluster_restored",
      produces: "fern",
      restoreCost: 5,
    },
    {
      id: "fox_grape_vine",
      label: "Grape Vine",
      position: { x: 2960, y: 1900 },
      scale: 0.144,
      shadowW: 110,
      damagedAsset: "fox_grape_vine_damaged",
      restoredAsset: "fox_grape_vine_restored",
      produces: "grape",
      restoreCost: 5,
    },
  ],
};

export const DEER_HABITAT: HabitatDef = {
  id: "deerClearing",
  animalId: "deer",
  name: "Deer's Enchanted Clearing",
  region: "farmCorner",
  homePosition: { x: 2720, y: 2215 },
  resources: [
    {
      id: "deer_moonflower_meadow",
      label: "Moonflower Meadow",
      position: { x: 2500, y: 2160 },
      scale: 0.192,
      shadowW: 160,
      damagedAsset: "deer_moonflower_meadow_damaged",
      restoredAsset: "deer_moonflower_meadow_restored",
      produces: "moonflower",
      restoreCost: 5,
    },
    {
      id: "deer_enchanted_berry_shrine",
      label: "Enchanted Berry Shrine",
      position: { x: 2950, y: 2120 },
      scale: 0.173,
      shadowW: 150,
      damagedAsset: "deer_enchanted_berry_shrine_damaged",
      restoredAsset: "deer_enchanted_berry_shrine_restored",
      produces: "enchanted_berry",
      restoreCost: 5,
    },
    {
      id: "deer_enchanted_mushroom_ring",
      label: "Enchanted Mushroom Ring",
      position: { x: 2720, y: 2370 },
      scale: 0.154,
      shadowW: 130,
      damagedAsset: "deer_enchanted_mushroom_ring_damaged",
      restoredAsset: "deer_enchanted_mushroom_ring_restored",
      produces: "enchanted_mushroom",
      restoreCost: 5,
    },
  ],
};

export const HABITATS: HabitatDef[] = [
  RABBIT_HABITAT,
  BIRD_HABITAT,
  HEDGEHOG_HABITAT,
  SQUIRREL_HABITAT,
  FOX_HABITAT,
  DEER_HABITAT,
];

export function habitatFor(animalId: string): HabitatDef | undefined {
  return HABITATS.find((h) => h.animalId === animalId);
}

export function sourceById(sourceId: string): RestorationResource | undefined {
  for (const h of HABITATS) {
    const r = h.resources.find((res) => res.id === sourceId);
    if (r) return r;
  }
  return undefined;
}
