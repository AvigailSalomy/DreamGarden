import type { FrostedAnimalDef } from "./types";

/**
 * The six Frosted Valley animals, in fixed rescue order. Every damaged/restored
 * asset key here is a real, already-loaded pair from FrostedValleyScene's prop
 * set — nothing here is invented.
 *
 * KNOWN GAP: the Fox habitat only has two real restoration targets (cracked ice,
 * signpost). A third — a "dormant bridge lantern" damaged/restored pair — has no
 * production asset yet, so it is intentionally left out rather than faked with
 * a placeholder. Add it here once that asset exists.
 *
 * PUZZLES: each animal's reward jigsaw uses its existing final artwork from
 * Game_Assets_frozen_world_Compressed/pazzel/pazzel_final_photos (copied by
 * scripts/prepare_frosted_puzzles.py). Piece counts climb 12 → 15 → 20 → 24 →
 * 28 → 32 (15, not 16, for the fox: 5×3 keeps its 16:9 cells near-square,
 * 4×4 would make long thin slivers), and irregularity / cut-line guide strength / snap
 * tolerance tighten alongside so later pictures ask for more observation.
 */
export const FROSTED_CATALOG: FrostedAnimalDef[] = [
  {
    id: "fv_rabbit",
    name: "Rabbit",
    habitatName: "Snowy Village",
    order: 0,
    coinReward: 100,
    letterBody:
      "Something has changed in Frosted Valley.\n\nThe snow still sparkles and the lanterns still glow, but parts of the valley have fallen silent. A little rabbit is waiting in the village, its well frozen and its garden buried.\n\nRestore its home, and help it find its way back.",
    puzzle: { image: "fv_rabbit_puzzle", cols: 4, rows: 3, irregularity: 0.15, guideAlpha: 0.24, snapFactor: 0.5 },
    resources: [
      { id: "well", label: "Frozen Village Well", damagedAsset: "fv_rabbit_well_damaged", restoredAsset: "fv_rabbit_well_restored", requiredAmount: 5, mazeItem: { texture: "mz_water_drop", label: "Water Drops", singular: "Water Drop" } },
      { id: "carrots", label: "Frosted Carrot Patch", damagedAsset: "fv_rabbit_carrots_damaged", restoredAsset: "fv_rabbit_carrots_restored", requiredAmount: 5, mazeItem: { texture: "mz_carrot", label: "Carrots", singular: "Carrot" } },
      { id: "chime", label: "Silent Winter Wind Chime", damagedAsset: "fv_rabbit_chime_damaged", restoredAsset: "fv_rabbit_chime_restored", requiredAmount: 4, mazeItem: { texture: "mz_star_special", label: "Chime Stars", singular: "Chime Star" } },
    ],
  },
  {
    id: "fv_fox",
    name: "Arctic Fox",
    habitatName: "Frozen Bridge",
    order: 1,
    coinReward: 125,
    letterBody:
      "The lights near the old bridge have gone quiet.\n\nSomeone is waiting beyond the snow — an arctic fox, watching the frozen crossing it once trotted over so easily.",
    puzzle: { image: "fv_fox_puzzle", cols: 5, rows: 3, irregularity: 0.28, guideAlpha: 0.19, snapFactor: 0.47 },
    resources: [
      { id: "ice", label: "Cracked Ice Crossing", damagedAsset: "fv_fox_ice_damaged", restoredAsset: "fv_fox_ice_restored", requiredAmount: 6, mazeItem: { texture: "fv_ice_block", label: "Ice Blocks", singular: "Ice Block" } },
      { id: "signpost", label: "Frozen Signpost", damagedAsset: "fv_fox_signpost_damaged", restoredAsset: "fv_fox_signpost_restored", requiredAmount: 4, mazeItem: { texture: "fv_lamppost", label: "Lanterns", singular: "Lantern" } },
    ],
  },
  {
    id: "fv_deer",
    name: "Deer",
    habitatName: "Winter Grove",
    order: 2,
    coinReward: 150,
    letterBody:
      "Deep in the grove, the magic has gone still.\n\nA deer waits beside a fountain that no longer flows and a tree that no longer glows — but the flowers remember how to bloom.",
    puzzle: { image: "fv_deer_puzzle", cols: 5, rows: 4, irregularity: 0.4, guideAlpha: 0.15, snapFactor: 0.45 },
    resources: [
      { id: "flowerbed", label: "Dormant Winter Flower Bed", damagedAsset: "fv_deer_flower_damaged", restoredAsset: "fv_deer_flower_restored", requiredAmount: 4, mazeItem: { texture: "mz_flower", label: "Winter Flowers", singular: "Winter Flower" } },
    ],
    // the grove's fountain + sleeping tree are scenery, not requests: they
    // wake up together with the deer at the end of its unlock cinematic
  },
  {
    id: "fv_squirrel",
    name: "Squirrel",
    habitatName: "Frozen Waterfall",
    order: 3,
    coinReward: 175,
    letterBody:
      "The waterfall has frozen mid-fall, and its little keeper has nowhere warm to sleep.\n\nA squirrel is waiting by its stump, hoping the water — and its home — will move again.",
    puzzle: { image: "fv_squirrel_puzzle", cols: 6, rows: 4, irregularity: 0.55, guideAlpha: 0.12, snapFactor: 0.42 },
    resources: [
      { id: "nest", label: "Snowy Tree-Stump Nest", damagedAsset: "fv_squirrel_nest_damaged", restoredAsset: "fv_squirrel_nest_restored", requiredAmount: 5, mazeItem: { texture: "mz_berry", label: "Berries", singular: "Berry" } },
      { id: "pool", label: "Frozen Rock Pool", damagedAsset: "fv_squirrel_pool_damaged", restoredAsset: "fv_squirrel_pool_restored", requiredAmount: 5, mazeItem: { texture: "fv_snowflake_icon", label: "Snowflakes", singular: "Snowflake" } },
      { id: "waterfall", label: "Frozen Waterfall", damagedAsset: "fv_squirrel_waterfall_damaged", restoredAsset: "fv_squirrel_waterfall_restored", requiredAmount: 6, mazeItem: { texture: "mz_water_drop", label: "Water Drops", singular: "Water Drop" } },
    ],
  },
  {
    id: "fv_polarbear",
    name: "Polar Bear",
    habitatName: "Crystal Area",
    order: 4,
    coinReward: 200,
    letterBody:
      "Among the crystals, an old cave sits dark and sealed.\n\nA polar bear waits nearby, watching over a hole in the ice and a cluster of crystals that have lost their glow.",
    puzzle: { image: "fv_polarbear_puzzle", cols: 7, rows: 4, irregularity: 0.7, guideAlpha: 0.09, snapFactor: 0.4 },
    resources: [
      { id: "crystal", label: "Dormant Crystal Cluster", damagedAsset: "fv_bear_crystal_damaged", restoredAsset: "fv_bear_crystal_restored", requiredAmount: 5, mazeItem: { texture: "fv_crystal_b", label: "Crystal Shards", singular: "Crystal Shard" } },
      { id: "hole", label: "Frozen Ice Hole", damagedAsset: "fv_bear_hole_damaged", restoredAsset: "fv_bear_hole_restored", requiredAmount: 5, mazeItem: { texture: "fv_icicles", label: "Icicles", singular: "Icicle" } },
      { id: "cave", label: "Frozen Ice Cave Entrance", damagedAsset: "fv_bear_cave_damaged", restoredAsset: "fv_bear_cave_restored", requiredAmount: 6, mazeItem: { texture: "fv_lamppost", label: "Lanterns", singular: "Lantern" } },
    ],
  },
  {
    id: "fv_penguin",
    name: "Penguin",
    habitatName: "Frozen Shore",
    order: 5,
    coinReward: 250,
    letterBody:
      "At the edge of the valley, the shore has grown quiet.\n\nA penguin waits beside a snowed-in igloo, hoping someone will help bring the shore back to life.",
    puzzle: { image: "fv_penguin_puzzle", cols: 8, rows: 4, irregularity: 0.85, guideAlpha: 0.07, snapFactor: 0.38 },
    resources: [
      { id: "igloo", label: "Snowed-In Igloo", damagedAsset: "fv_penguin_igloo_damaged", restoredAsset: "fv_penguin_igloo_restored", requiredAmount: 5, mazeItem: { texture: "fv_ice_block", label: "Ice Bricks", singular: "Ice Brick" } },
      { id: "iceberg", label: "Frozen Iceberg Landmark", damagedAsset: "fv_penguin_iceberg_damaged", restoredAsset: "fv_penguin_iceberg_restored", requiredAmount: 5, mazeItem: { texture: "fv_snowflake_icon", label: "Snowflakes", singular: "Snowflake" } },
      { id: "slide", label: "Icy Penguin Slide", damagedAsset: "fv_penguin_slide_damaged", restoredAsset: "fv_penguin_slide_restored", requiredAmount: 6, mazeItem: { texture: "fv_crystal_e", label: "Ice Gems", singular: "Ice Gem" } },
    ],
  },
];
