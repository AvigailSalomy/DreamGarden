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
  { id: "cottage_snow", label: "Snowy Log Cottage", textureKey: "fv_shop_cottage_snow", category: "building", price: 300, targetHeight: 520, visibleHeightFraction: 0.825 },
  { id: "cottage_stone", label: "Stone-Base Cabin", textureKey: "fv_shop_cottage_stone", category: "building", price: 320, targetHeight: 520, visibleHeightFraction: 0.867 },
  { id: "gazebo", label: "Frosted Gazebo", textureKey: "fv_shop_gazebo", category: "building", price: 380, targetHeight: 480, visibleHeightFraction: 0.9 },
  { id: "cabin_small", label: "Snowbound Hut", textureKey: "fv_shop_cabin_small", category: "building", price: 260, targetHeight: 440, visibleHeightFraction: 0.787 },

  // ---- Pet Accessories ---- (anchor drives WHERE on the animal it attaches
  // in the Shop's live try-on preview; previewScale is the accessory's own
  // VISIBLE artwork height as a fraction of the animal's displayed height —
  // see ACCESSORY_ART/applyAccessoryToPreview in FrostedShopScene.ts, which
  // measures each PNG's real (non-transparent) content so a hat is sized and
  // anchored by its own artwork, not by the mostly-empty 2048×2048 canvas)
  { id: "pet_hat_beanie", label: "Cozy Winter Beanie", textureKey: "fv_shop_pet_hat_beanie", category: "pet", price: 40, targetHeight: 110, anchor: "head", previewScale: 0.26 },
  { id: "pet_scarf_pink", label: "Pink Knit Scarf", textureKey: "fv_shop_pet_scarf_pink", category: "pet", price: 30, targetHeight: 100, anchor: "neck", previewScale: 0.2 },
  { id: "pet_hat_trapper", label: "Frosty Fur Trapper Hat", textureKey: "fv_shop_pet_hat_trapper", category: "pet", price: 55, targetHeight: 110, anchor: "head", previewScale: 0.26 },
  { id: "pet_bow_pink", label: "Sugar Pink Bow", textureKey: "fv_shop_pet_bow_pink", category: "pet", price: 25, targetHeight: 80, anchor: "head", previewScale: 0.15 },
  { id: "pet_tiara", label: "Frozen Princess Tiara", textureKey: "fv_shop_pet_tiara", category: "pet", price: 90, targetHeight: 100, anchor: "head", previewScale: 0.14 },
  { id: "pet_goggles", label: "Crystal Snow Goggles", textureKey: "fv_shop_pet_goggles", category: "pet", price: 60, targetHeight: 90, anchor: "face", previewScale: 0.15 },
  { id: "pet_clip_snowflake", label: "Diamond Snowflake Clip", textureKey: "fv_shop_pet_clip_snowflake", category: "pet", price: 55, targetHeight: 80, anchor: "head", previewScale: 0.13 },

  // ---- Plants ----
  { id: "plant_thicket", label: "Glowing Snow Thicket", textureKey: "fv_shop_plant_thicket", category: "plant", price: 140, targetHeight: 260, visibleHeightFraction: 0.773 },
  { id: "plant_lily", label: "Frosted Lily Bouquet", textureKey: "fv_shop_plant_lily", category: "plant", price: 70, targetHeight: 160, visibleHeightFraction: 0.666 },
  { id: "plant_berrybush", label: "Snowdrift Berry Bush", textureKey: "fv_shop_plant_berrybush", category: "plant", price: 45, targetHeight: 150, visibleHeightFraction: 0.637 },
  { id: "plant_crystalbloom", label: "Crystal Bloom Bush", textureKey: "fv_shop_plant_crystalbloom", category: "plant", price: 130, targetHeight: 200, visibleHeightFraction: 0.566 },
  { id: "plant_hedge", label: "Snowy Flower Hedge", textureKey: "fv_shop_plant_hedge", category: "plant", price: 75, targetHeight: 170, visibleHeightFraction: 0.711 },
  { id: "plant_petalbush", label: "Frosted Petal Bush", textureKey: "fv_shop_plant_petalbush", category: "plant", price: 50, targetHeight: 160, visibleHeightFraction: 0.748 },
  { id: "plant_powderbush", label: "Powder Blossom Bush", textureKey: "fv_shop_plant_powderbush", category: "plant", price: 65, targetHeight: 180, visibleHeightFraction: 0.709 },

  // ---- Decorations ----
  { id: "decor_fence", label: "Snowy Fence Rail", textureKey: "fv_shop_decor_fence", category: "decoration", price: 35, targetHeight: 140, visibleHeightFraction: 0.868 },
  { id: "decor_barrel_bloom", label: "Winter Bloom Barrel", textureKey: "fv_shop_decor_barrel_bloom", category: "decoration", price: 100, targetHeight: 200, visibleHeightFraction: 0.827 },
  { id: "decor_barrel", label: "Frosted Cider Barrel", textureKey: "fv_shop_decor_barrel", category: "decoration", price: 45, targetHeight: 150, visibleHeightFraction: 0.763 },
  { id: "decor_birdhouse", label: "Snowcap Birdhouse", textureKey: "fv_shop_decor_birdhouse", category: "decoration", price: 120, targetHeight: 240, visibleHeightFraction: 0.826 },
  { id: "decor_signpost", label: "Frosted Trail Signpost", textureKey: "fv_shop_decor_signpost", category: "decoration", price: 60, targetHeight: 200, visibleHeightFraction: 0.846 },
  { id: "decor_lamppost", label: "Glowing Snow Lamppost", textureKey: "fv_shop_decor_lamppost", category: "decoration", price: 110, targetHeight: 300, visibleHeightFraction: 0.783 },
  { id: "decor_wheelbarrow", label: "Blossom Wheelbarrow", textureKey: "fv_shop_decor_wheelbarrow", category: "decoration", price: 85, targetHeight: 170, visibleHeightFraction: 0.815 },
  { id: "decor_bench", label: "Snowy Park Bench", textureKey: "fv_shop_decor_bench", category: "decoration", price: 70, targetHeight: 160, visibleHeightFraction: 0.817 },
  { id: "decor_arch", label: "Blossom Garden Arch", textureKey: "fv_shop_decor_arch", category: "decoration", price: 150, targetHeight: 380, visibleHeightFraction: 0.825 },
];

export const FROSTED_SHOP_CATEGORIES: Array<{ id: FrostedShopItemDef["category"]; label: string; icon: string }> = [
  { id: "building", label: "Buildings", icon: "🏠" },
  { id: "pet", label: "Pet Accessories", icon: "🐾" },
  { id: "plant", label: "Plants", icon: "🌱" },
  { id: "decoration", label: "Decorations", icon: "✨" },
];
