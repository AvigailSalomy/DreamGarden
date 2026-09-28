/**
 * The collectible habitat resources — what a restored resource SOURCE
 * produces (see data/habitats.ts) and what icon represents it in the world
 * pickup / Request-card UI. Icon is the source's own RESTORED production
 * image (already premium art) rather than a separate hand-drawn icon — no
 * extra asset generation needed, and it reads clearly at small card size.
 */
export interface ResourceDef {
  id: string;
  label: string;
  /** Texture key (see PreloadScene "resources/" registration). */
  icon: string;
}

export const RESOURCES: Record<string, ResourceDef> = {
  carrot: { id: "carrot", label: "Carrot", icon: "dg_rabbit_carrot_patch_restored" },
  herb: { id: "herb", label: "Herb", icon: "dg_rabbit_herb_patch_restored" },
  wildflower: { id: "wildflower", label: "Wildflower", icon: "dg_rabbit_wildflower_patch_restored" },
  blossom: { id: "blossom", label: "Blossom", icon: "dg_bird_blossom_tree_restored" },
  seed: { id: "seed", label: "Seed", icon: "dg_bird_seed_feeder_restored" },
  water_lily: { id: "water_lily", label: "Water Lily", icon: "dg_bird_water_lily_patch_restored" },
  moss: { id: "moss", label: "Moss", icon: "dg_hedgehog_mossy_log_restored" },
  mushroom: { id: "mushroom", label: "Mushroom", icon: "dg_hedgehog_mushroom_log_restored" },
  acorn: { id: "acorn", label: "Acorn", icon: "dg_squirrel_acorn_oak_restored" },
  nut: { id: "nut", label: "Nut", icon: "dg_squirrel_nut_cache_restored" },
  apple: { id: "apple", label: "Apple", icon: "dg_squirrel_apple_tree_restored" },
  fern: { id: "fern", label: "Fern", icon: "dg_fox_fern_cluster_restored" },
  berry: { id: "berry", label: "Berry", icon: "dg_fox_berry_vine_restored" },
  grape: { id: "grape", label: "Grape", icon: "dg_fox_grape_vine_restored" },
  enchanted_berry: { id: "enchanted_berry", label: "Enchanted Berry", icon: "dg_deer_enchanted_berry_shrine_restored" },
  enchanted_mushroom: {
    id: "enchanted_mushroom",
    label: "Enchanted Mushroom",
    icon: "dg_deer_enchanted_mushroom_ring_restored",
  },
  moonflower: { id: "moonflower", label: "Moonflower", icon: "dg_deer_moonflower_meadow_restored" },
};

export function resourceCount(resources: Record<string, number>, id: string): number {
  return resources[id] ?? 0;
}
