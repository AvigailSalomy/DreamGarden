import type { FrostedShopItemDef } from "./types";

/**
 * The Winter Market's full inventory — every item reuses a real, pre-painted
 * Frosted Valley asset (see public/assets/frosted/shop/); nothing here is a
 * placeholder or a generic icon. `targetHeight` is a world-unit display
 * height (native aspect preserved), matching FrostedValleyScene's own propH
 * convention so shop-bought decorations sit at a consistent scale next to
 * the zones' authored props.
 */
export const FROSTED_SHOP_CATALOG: FrostedShopItemDef[] = [
  // ---- Buildings ---- (visibleHeightFraction: measured real artwork bounds
  // inside each PNG's padded canvas — see FrostedShopItemDef.visibleHeightFraction)
  { id: "cottage_snow", label: "Snowy Log Cottage", textureKey: "fv_shop_cottage_snow", category: "building", price: 300, targetHeight: 706, visibleHeightFraction: 0.942 },
  { id: "cottage_stone", label: "Stone-Base Cabin", textureKey: "fv_shop_cottage_stone", category: "building", price: 320, targetHeight: 585, visibleHeightFraction: 0.900 },
  { id: "gazebo", label: "Frosted Gazebo", textureKey: "fv_shop_gazebo", category: "building", price: 380, targetHeight: 467, visibleHeightFraction: 0.973 },
  { id: "cabin_small", label: "Snowbound Hut", textureKey: "fv_shop_cabin_small", category: "building", price: 260, targetHeight: 531, visibleHeightFraction: 0.981 },

  // ---- Pet Accessories ---- (anchor drives WHERE on the animal it attaches ("collar" = worn at the neck / upper chest, centred on the neck line)
  // in the Shop's live try-on preview; previewScale is the accessory's own
  // VISIBLE artwork height as a fraction of the animal's displayed height —
  // see ACCESSORY_ART/applyAccessoryToPreview in FrostedShopScene.ts, which
  // measures each PNG's real (non-transparent) content so a hat is sized and
  // anchored by its own artwork, not by the mostly-empty 2048×2048 canvas).
  // The crown-style head pieces after pet_tiara reuse its head anchor and are
  // sized to the tiara's own worn WIDTH (≈0.225 × the animal's height), so
  // each one covers the same spot on the head whatever its aspect ratio
  // (the square starlight bow is trimmed a little so it doesn't tower).
  { id: "pet_tiara", label: "Frozen Princess Tiara", textureKey: "fv_shop_pet_tiara", category: "pet", price: 90, targetHeight: 100, anchor: "head", previewScale: 0.14 },
  { id: "pet_tiara_blossom", label: "Pink Blossom Tiara", textureKey: "fv_shop_pet_tiara_blossom", category: "pet", price: 85, targetHeight: 100, anchor: "head", previewScale: 0.14 },
  { id: "pet_tiara_aqua", label: "Aqua Frost Tiara", textureKey: "fv_shop_pet_tiara_aqua", category: "pet", price: 85, targetHeight: 100, anchor: "head", previewScale: 0.14 },
  { id: "pet_tiara_violet", label: "Violet Crystal Tiara", textureKey: "fv_shop_pet_tiara_violet", category: "pet", price: 95, targetHeight: 100, anchor: "head", previewScale: 0.125 },
  { id: "pet_wreath_violet", label: "Glowing Violet Wreath", textureKey: "fv_shop_pet_wreath_violet", category: "pet", price: 70, targetHeight: 100, anchor: "head", previewScale: 0.134 },
  { id: "pet_bow_starlight", label: "Starlight Velvet Bow", textureKey: "fv_shop_pet_bow_starlight", category: "pet", price: 45, targetHeight: 90, anchor: "head", previewScale: 0.16 },
  { id: "pet_bow_pink", label: "Sugar Pink Bow", textureKey: "fv_shop_pet_bow_pink", category: "pet", price: 25, targetHeight: 80, anchor: "collar", previewScale: 0.15 },
  { id: "pet_clip_snowflake", label: "Diamond Snowflake Clip", textureKey: "fv_shop_pet_clip_snowflake", category: "pet", price: 55, targetHeight: 80, anchor: "collar", previewScale: 0.13 },

  // ---- Plants ----
  { id: "plant_thicket", label: "Glowing Snow Thicket", textureKey: "fv_shop_plant_thicket", category: "plant", price: 140, targetHeight: 308, visibleHeightFraction: 0.963 },
  { id: "plant_lily", label: "Frosted Lily Bouquet", textureKey: "fv_shop_plant_lily", category: "plant", price: 70, targetHeight: 160, visibleHeightFraction: 0.964 },
  { id: "plant_berrybush", label: "Snowdrift Berry Bush", textureKey: "fv_shop_plant_berrybush", category: "plant", price: 45, targetHeight: 193, visibleHeightFraction: 0.963 },
  { id: "plant_crystalbloom", label: "Crystal Bloom Bush", textureKey: "fv_shop_plant_crystalbloom", category: "plant", price: 130, targetHeight: 162, visibleHeightFraction: 0.956 },
  { id: "plant_hedge", label: "Snowy Flower Hedge", textureKey: "fv_shop_plant_hedge", category: "plant", price: 75, targetHeight: 170, visibleHeightFraction: 0.964 },
  { id: "plant_petalbush", label: "Frosted Petal Bush", textureKey: "fv_shop_plant_petalbush", category: "plant", price: 50, targetHeight: 160, visibleHeightFraction: 0.966 },
  { id: "plant_powderbush", label: "Powder Blossom Bush", textureKey: "fv_shop_plant_powderbush", category: "plant", price: 65, targetHeight: 180, visibleHeightFraction: 0.981 },

  // ---- Decorations ----
  { id: "decor_fence", label: "Snowy Fence Rail", textureKey: "fv_shop_decor_fence", category: "decoration", price: 35, targetHeight: 140, visibleHeightFraction: 0.965 },
  { id: "decor_barrel_bloom", label: "Winter Bloom Barrel", textureKey: "fv_shop_decor_barrel_bloom", category: "decoration", price: 100, targetHeight: 200, visibleHeightFraction: 0.982 },
  { id: "decor_barrel", label: "Frosted Cider Barrel", textureKey: "fv_shop_decor_barrel", category: "decoration", price: 45, targetHeight: 150, visibleHeightFraction: 0.971 },
  { id: "decor_birdhouse", label: "Snowcap Birdhouse", textureKey: "fv_shop_decor_birdhouse", category: "decoration", price: 120, targetHeight: 292, visibleHeightFraction: 0.972 },
  { id: "decor_signpost", label: "Frosted Trail Signpost", textureKey: "fv_shop_decor_signpost", category: "decoration", price: 60, targetHeight: 291, visibleHeightFraction: 0.971 },
  { id: "decor_lamppost", label: "Glowing Snow Lamppost", textureKey: "fv_shop_decor_lamppost", category: "decoration", price: 110, targetHeight: 253, visibleHeightFraction: 0.974 },
  { id: "decor_wheelbarrow", label: "Blossom Wheelbarrow", textureKey: "fv_shop_decor_wheelbarrow", category: "decoration", price: 85, targetHeight: 203, visibleHeightFraction: 0.968 },
  { id: "decor_bench", label: "Snowy Park Bench", textureKey: "fv_shop_decor_bench", category: "decoration", price: 70, targetHeight: 184, visibleHeightFraction: 0.975 },
  { id: "decor_arch", label: "Blossom Garden Arch", textureKey: "fv_shop_decor_arch", category: "decoration", price: 150, targetHeight: 224, visibleHeightFraction: 0.972 },
];

export const FROSTED_SHOP_CATEGORIES: Array<{ id: FrostedShopItemDef["category"]; label: string; icon: string }> = [
  { id: "building", label: "Buildings", icon: "🏠" },
  { id: "pet", label: "Pet Accessories", icon: "🐾" },
  { id: "plant", label: "Plants", icon: "🌱" },
  { id: "decoration", label: "Decorations", icon: "✨" },
];
