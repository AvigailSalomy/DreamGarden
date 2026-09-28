import { SHOP_ECONOMY } from "./economy";
/**
 * The Dream Garden Shop's data-driven catalog: personalization only (world
 * decorations + animal accessories + the Mystery Gift). Strictly separate
 * from the restoration system in data/habitats.ts / data/resources.ts — the
 * Shop never sells anything needed to rescue an animal (see Part Q).
 */

export type AccessorySlot = "head" | "eyes" | "neck" | "back" | "special";
export type Rarity = "common" | "rare" | "magical";

/** A placeable world decoration sold in the Daily rotation. Reuses an
 *  existing, already-preloaded `dg_*` texture — never a new asset. */
export interface DecorCatalogItem {
  id: string;
  label: string;
  icon: string; // texture key, shop card art AND world sprite
  cost: number;
  scale: number; // world display scale once placed
  category: "structure" | "tree" | "vegetation" | "decor" | "nature";
}

/* ================= Accessory fitting system =================
 * Replaces the old one-size-per-slot anchor table: accessories now fit
 * actual anatomy. Every animal exposes semantic body anchors (head, eyes,
 * neck, chest, back, a floating "special" point) as fractions of its OWN
 * full texture (top-left origin, 0..1) plus a target WIDTH fraction per
 * region — an accessory scales against the width of the body part it
 * belongs to (a scarf against neck width, a hat against head width), never
 * against the whole-body bounding box. calculateAccessoryTransform() is the
 * single function both the Shop's Try-It-On preview and the real Garden
 * animal read through, so the two can never independently drift apart.
 */

export interface BodyAnchors {
  headCenter: { x: number; y: number }; headWidth: number;
  eyeCenter: { x: number; y: number }; eyeWidth: number;
  neckCenter: { x: number; y: number }; neckWidth: number;
  chestCenter: { x: number; y: number }; chestWidth: number;
  backCenter: { x: number; y: number }; backWidth: number;
  specialAnchor: { x: number; y: number };
}

/** Tuned by eye against the actual sprites (public/assets/dg/animals) —
 *  every animal has a distinct pose (front-facing rabbit, perched bird,
 *  spike-backed hedgehog, seated squirrel, side-on fox/deer), so there is no
 *  single default to fall back on; each gets its own full set. */
export const ANIMAL_BODY_ANCHORS: Record<string, BodyAnchors> = {
  // Every fraction below was re-measured directly against the actual PNG
  // pixels (grid overlay at public/assets/dg/animals/<name>.png) after the
  // original eyeballed-from-a-160px-preview values proved badly wrong (e.g.
  // rabbit's neck sat at the mouth, squirrel/deer had head and tail mirrored
  // to the wrong side entirely) — see the accessory-fitting bug writeup.
  rabbit: {
    headCenter: { x: 0.49, y: 0.22 }, headWidth: 0.42,
    eyeCenter: { x: 0.5, y: 0.43 }, eyeWidth: 0.34,
    neckCenter: { x: 0.47, y: 0.615 }, neckWidth: 0.38,
    chestCenter: { x: 0.5, y: 0.74 }, chestWidth: 0.58,
    backCenter: { x: 0.78, y: 0.55 }, backWidth: 0.32,
    specialAnchor: { x: 0.8, y: 0.06 },
  },
  bird: {
    headCenter: { x: 0.65, y: 0.2 }, headWidth: 0.55,
    eyeCenter: { x: 0.85, y: 0.24 }, eyeWidth: 0.22,
    neckCenter: { x: 0.6, y: 0.4 }, neckWidth: 0.45,
    chestCenter: { x: 0.62, y: 0.62 }, chestWidth: 0.6,
    backCenter: { x: 0.25, y: 0.52 }, backWidth: 0.4,
    specialAnchor: { x: 0.9, y: 0.08 },
  },
  hedgehog: {
    headCenter: { x: 0.78, y: 0.4 }, headWidth: 0.42,
    eyeCenter: { x: 0.78, y: 0.42 }, eyeWidth: 0.26,
    neckCenter: { x: 0.75, y: 0.57 }, neckWidth: 0.34,
    chestCenter: { x: 0.78, y: 0.7 }, chestWidth: 0.4,
    backCenter: { x: 0.35, y: 0.25 }, backWidth: 0.5,
    specialAnchor: { x: 0.55, y: 0.03 },
  },
  squirrel: {
    headCenter: { x: 0.72, y: 0.38 }, headWidth: 0.4,
    eyeCenter: { x: 0.74, y: 0.5 }, eyeWidth: 0.28,
    neckCenter: { x: 0.68, y: 0.63 }, neckWidth: 0.34,
    chestCenter: { x: 0.68, y: 0.76 }, chestWidth: 0.42,
    backCenter: { x: 0.5, y: 0.42 }, backWidth: 0.35,
    specialAnchor: { x: 0.85, y: 0.15 },
  },
  fox: {
    headCenter: { x: 0.82, y: 0.3 }, headWidth: 0.36,
    eyeCenter: { x: 0.8, y: 0.42 }, eyeWidth: 0.24,
    neckCenter: { x: 0.72, y: 0.6 }, neckWidth: 0.3,
    chestCenter: { x: 0.72, y: 0.68 }, chestWidth: 0.36,
    backCenter: { x: 0.5, y: 0.5 }, backWidth: 0.4,
    specialAnchor: { x: 0.88, y: 0.06 },
  },
  deer: {
    headCenter: { x: 0.25, y: 0.28 }, headWidth: 0.5,
    eyeCenter: { x: 0.2, y: 0.32 }, eyeWidth: 0.3,
    neckCenter: { x: 0.32, y: 0.5 }, neckWidth: 0.34,
    chestCenter: { x: 0.32, y: 0.62 }, chestWidth: 0.4,
    backCenter: { x: 0.55, y: 0.45 }, backWidth: 0.36,
    specialAnchor: { x: 0.15, y: 0.06 },
  },
};

/** Precomputed visible (non-transparent) content bounds for each accessory
 *  texture, as fractions of its own full PNG — see Part D: fit against the
 *  actual artwork, not blindly against source texture dimensions (which
 *  carry a few px of trim padding from the asset pipeline). Regenerate via
 *  scripts/process_dg_assets.py's trim step if these PNGs are reprocessed. */
export const ACCESSORY_VISIBLE_BOUNDS: Record<string, { cx: number; cy: number; w: number; h: number }> = {
  garden_hat: { cx: 0.5, cy: 0.5, w: 0.9927, h: 0.9896 },
  flower_crown: { cx: 0.5, cy: 0.5007, w: 0.9927, h: 0.9907 },
  round_glasses: { cx: 0.5, cy: 0.499, w: 0.9945, h: 0.986 },
  flower_bow: { cx: 0.5, cy: 0.5, w: 0.9891, h: 0.9837 },
  // Same values as flower_bow, deliberately — see ACCESSORY_FITS's blue_bow
  // entries: blue_bow is a strict geometric/color twin of flower_bow and
  // must scale identically for the "reuse the same fit" goal to hold.
  blue_bow: { cx: 0.5, cy: 0.5, w: 0.9891, h: 0.9837 },
  magic_butterfly: { cx: 0.4995, cy: 0.4993, w: 0.9936, h: 0.9905 },
  magic_crown_rare: { cx: 0.5, cy: 0.5, w: 0.9927, h: 0.987 },
};

/**
 * Explicit per-animal/per-accessory fit — the AUTHORITATIVE transform when
 * present. The generic ANIMAL_BODY_ANCHORS system above proved unreliable in
 * practice (a hat sharing "headWidth" with a crown and a bow, on an animal
 * whose head has nothing to do with any other animal's, drifted wrong in
 * both directions — massively oversized on one animal, pinned to one eye on
 * another). This table is deliberately dumb and explicit instead: one hand-
 * tuned entry per combination, calibrated by eye against that ONE animal's
 * actual sprite. No combination here still falls through to the generic
 * anchor system (see calculateAccessoryTransform) until it's tuned.
 *
 * xOffset/yOffset: center of the accessory art, as a fraction (0..1,
 * top-left origin) of the ANIMAL's own full texture — "where on the animal,
 * as a fraction of its own image, does this go."
 * scale: target width of the accessory's VISIBLE (trimmed) art, as a
 * fraction of the animal's texture width — resolution-independent: scaling
 * the whole preview up or down never changes this proportion.
 * rotation: degrees.
 * layer: "behind" the body (e.g. a backpack peeking past the silhouette) or
 * "front" (sits on top, e.g. a hat/glasses/scarf).
 */
export interface AccessoryFit {
  xOffset: number;
  yOffset: number;
  scale: number;
  rotation: number;
  layer: "behind" | "front";
}

/**
 * "Companion" accessories (Balloon, Sparkles, Basket) float/sit BESIDE the
 * animal rather than needing precise anatomical placement — so, unlike every
 * other accessory above, one generic fit is reused across all six animals
 * (xOffset > 1 or < 0 deliberately sits just past the animal's own body
 * edge). Still the same ACCESSORY_FITS entries the fitting function already
 * reads — just spread into each animal instead of hand-tuned per animal.
 * Override an individual animal below only if this generic placement is
 * visibly wrong for it.
 */
const COMPANION_FITS: Record<string, AccessoryFit> = {
  magic_balloon: { xOffset: 1.05, yOffset: 0.1, scale: 0.5, rotation: 0, layer: "front" },
  flower_basket: { xOffset: -0.08, yOffset: 0.92, scale: 0.4, rotation: 0, layer: "front" },
  // Diagonal wand (art itself runs handle-lower-left to star-upper-right,
  // so the star tip already points up without any rotation) placed beside
  // the animal at roughly mid-height, same generic-across-animals approach.
  magic_wand: { xOffset: 1.15, yOffset: 0.5, scale: 0.6, rotation: 0, layer: "front" },
};

// blue_bow is a strict geometric/color twin of flower_bow (see shop
// integration notes) — these values are COPIED verbatim from each animal's
// flower_bow entry below, never independently tuned, so the two occupy the
// same position/scale/rotation/layer on every animal.
const BLUE_BOW_FITS: Record<string, AccessoryFit> = {
  bird: { xOffset: 0.58, yOffset: 0.1, scale: 0.18, rotation: 0, layer: "front" },
  hedgehog: { xOffset: 0.6, yOffset: 0.2, scale: 0.2, rotation: -8, layer: "front" },
  squirrel: { xOffset: 0.78, yOffset: 0.3, scale: 0.18, rotation: 0, layer: "front" },
  // rabbit/fox/deer intentionally absent: flower_bow has no explicit entry
  // for them either, so both fall through to the same generic headCenter
  // anchor — leaving blue_bow absent here preserves that identical fallback.
};

export const ACCESSORY_FITS: Partial<Record<string, Partial<Record<string, AccessoryFit>>>> = {
  bird: {
    garden_hat: { xOffset: 0.67, yOffset: 0.1, scale: 0.32, rotation: -6, layer: "front" },
    flower_bow: { xOffset: 0.58, yOffset: 0.1, scale: 0.18, rotation: 0, layer: "front" },
    blue_bow: BLUE_BOW_FITS.bird,
    magic_crown: { xOffset: 0.65, yOffset: 0.08, scale: 0.55, rotation: 0, layer: "front" },
    ...COMPANION_FITS,
  },
  hedgehog: {
    garden_hat: { xOffset: 0.76, yOffset: 0.26, scale: 0.3, rotation: 0, layer: "front" },
    flower_bow: { xOffset: 0.6, yOffset: 0.2, scale: 0.2, rotation: -8, layer: "front" },
    blue_bow: BLUE_BOW_FITS.hedgehog,
    magic_crown: { xOffset: 0.72, yOffset: 0.18, scale: 0.42, rotation: 0, layer: "front" },
    ...COMPANION_FITS,
  },
  squirrel: {
    magic_crown: { xOffset: 0.72, yOffset: 0.23, scale: 0.4, rotation: 0, layer: "front" },
    flower_bow: { xOffset: 0.78, yOffset: 0.3, scale: 0.18, rotation: 0, layer: "front" },
    blue_bow: BLUE_BOW_FITS.squirrel,
    ...COMPANION_FITS,
    // Override the shared wand fit (sat at the mouth): handle through the
    // front paws, star out past the cheek. Must stay AFTER the spread.
    magic_wand: { xOffset: 0.93, yOffset: 0.73, scale: 0.45, rotation: 0, layer: "front" },
  },
  fox: {
    magic_crown: { xOffset: 0.82, yOffset: 0.1, scale: 0.36, rotation: 0, layer: "front" },
    ...COMPANION_FITS,
  },
  deer: {
    magic_crown: { xOffset: 0.25, yOffset: 0.06, scale: 0.5, rotation: 0, layer: "front" },
    ...COMPANION_FITS,
  },
  rabbit: {
    // Uses the Nibs-specific art (ANIMAL_ACCESSORY_ART below), calibrated
    // directly against that asset's own lens positions and Nibs's own eye
    // positions — not the generic bounding-box/anchor math (see
    // accessoryIconFor()'s docstring). Kept even though Round Glasses is no
    // longer sold — harmless, not worth the risk of ripping out.
    round_glasses: { xOffset: 0.565, yOffset: 0.445, scale: 0.6, rotation: -4, layer: "front" },
    magic_butterfly: { xOffset: 0.8, yOffset: 0.12, scale: 0.22, rotation: 0, layer: "front" },
    ...COMPANION_FITS,
    // Override the shared wand fit (sat at the mouth): handle between the
    // front paws, star out past the cheek. Must stay AFTER the spread.
    magic_wand: { xOffset: 0.8, yOffset: 0.72, scale: 0.5, rotation: 0, layer: "front" },
  },
};

/**
 * Per-animal art overrides — a specific accessory combination gets its OWN
 * custom-drawn asset (already in the animal's exact perspective) instead of
 * the shared generic accessory texture. Keyed the same way as ACCESSORY_FITS
 * (`[animalId][accessoryId] -> texture key`). accessoryIconFor() is the
 * single place both ShopScene and GardenScene must go through to pick the
 * right texture, so preview and world can never diverge on which art shows.
 */
export const ANIMAL_ACCESSORY_ART: Partial<Record<string, Partial<Record<string, string>>>> = {
  rabbit: {
    round_glasses: "dg_accessory_glasses_nibs",
  },
};

/** THE single place to resolve which texture key an accessory renders with
 *  for a given animal — checks ANIMAL_ACCESSORY_ART first, falls back to the
 *  accessory's own generic icon. Both ShopScene's preview and GardenScene's
 *  world MUST call this rather than reading `item.icon` directly. */
export function accessoryIconFor(animalId: string, accessoryId: string): string | undefined {
  return ANIMAL_ACCESSORY_ART[animalId]?.[accessoryId] ?? accessoryItem(accessoryId)?.icon;
}

function regionAnchorAndWidth(anchors: BodyAnchors, slot: AccessorySlot): { center: { x: number; y: number }; width: number } {
  switch (slot) {
    case "head": return { center: anchors.headCenter, width: anchors.headWidth };
    case "eyes": return { center: anchors.eyeCenter, width: anchors.eyeWidth };
    case "neck": return { center: anchors.neckCenter, width: anchors.neckWidth };
    case "back": return { center: anchors.backCenter, width: anchors.backWidth };
    case "special": return { center: anchors.specialAnchor, width: anchors.headWidth * 0.55 };
  }
}

export interface AccessoryTransform {
  /** Local position relative to the animal body image's own origin (0.5,1 —
   *  bottom-centre of its FULL texture), i.e. directly usable as
   *  `img.setPosition(x, y)` on a child of the same container as the body. */
  x: number;
  y: number;
  scale: number;
  rotation: number;
  depthOffset: number;
}

/**
 * THE shared fitting function — Shop preview and the real Garden animal both
 * call this and nothing else for accessory placement. `animalTexW/H` are the
 * animal body image's native texture size; `accessoryTexW/H` its own native
 * (untrimmed) texture size. Returns null if the animal or accessory isn't
 * recognized (caller should skip rendering).
 */
export function calculateAccessoryTransform(
  animalId: string,
  accessoryId: string,
  animalTexW: number,
  animalTexH: number,
  accessoryTexW: number,
  accessoryTexH: number,
): AccessoryTransform | null {
  const item = accessoryItem(accessoryId);
  if (!item) return null;
  // ACCESSORY_VISIBLE_BOUNDS is measured against the GENERIC texture's own
  // trim padding — an animal-specific override art (ANIMAL_ACCESSORY_ART)
  // has different padding, so it must never reuse those numbers. It falls
  // through to the {0.5,0.5,1,1} default (no drift correction, plain
  // bbox-width scaling), matching how it was freshly trimmed.
  const isOverrideArt = !!ANIMAL_ACCESSORY_ART[animalId]?.[accessoryId];
  const bounds = isOverrideArt ? { cx: 0.5, cy: 0.5, w: 1, h: 1 } : ACCESSORY_VISIBLE_BOUNDS[accessoryId] ?? { cx: 0.5, cy: 0.5, w: 1, h: 1 };

  const fit = ACCESSORY_FITS[animalId]?.[accessoryId];
  if (fit) {
    const targetWidthPx = fit.scale * animalTexW;
    const visibleWidthPx = bounds.w * accessoryTexW;
    const scale = targetWidthPx / visibleWidthPx;
    const localX = fit.xOffset * animalTexW - animalTexW / 2;
    const localY = fit.yOffset * animalTexH - animalTexH;
    const accessoryCenterDriftX = (bounds.cx - 0.5) * accessoryTexW * scale;
    const accessoryCenterDriftY = (bounds.cy - 0.5) * accessoryTexH * scale;
    return {
      x: localX - accessoryCenterDriftX,
      y: localY - accessoryCenterDriftY,
      scale,
      rotation: fit.rotation,
      depthOffset: fit.layer === "behind" ? -1 : 1,
    };
  }

  // Fallback for combinations not yet in ACCESSORY_FITS: the generic
  // anatomical-anchor system. Known unreliable (see ACCESSORY_FITS docstring)
  // — every combination should eventually get its own explicit entry above.
  const anchors = ANIMAL_BODY_ANCHORS[animalId];
  if (!anchors) return null;
  const { center, width: targetWidthFrac } = regionAnchorAndWidth(anchors, item.slot);

  const targetWidthPx = targetWidthFrac * animalTexW;
  const visibleWidthPx = bounds.w * accessoryTexW;
  const scale = targetWidthPx / visibleWidthPx;

  const localX = center.x * animalTexW - animalTexW / 2;
  const localY = center.y * animalTexH - animalTexH;
  const accessoryCenterDriftX = (bounds.cx - 0.5) * accessoryTexW * scale;
  const accessoryCenterDriftY = (bounds.cy - 0.5) * accessoryTexH * scale;

  const slotDepth = item.slot === "back" ? -1 : item.slot === "special" ? 2 : 1;

  return {
    x: localX - accessoryCenterDriftX,
    y: localY - accessoryCenterDriftY,
    scale,
    rotation: 0,
    depthOffset: slotDepth,
  };
}

export interface AccessoryCatalogItem {
  id: string;
  label: string;
  icon: string; // dg_accessory_* texture key
  cost: number;
  slot: AccessorySlot;
  rarity: Rarity;
}

export interface MysteryGiftReward {
  id: string;
  kind: "decor" | "accessory";
  refId: string; // id into DECOR_CATALOG or ACCESSORY_CATALOG
  rarity: Rarity;
  weight: number; // relative probability within openMysteryGift()
}

/**
 * The full pool the Daily shop draws six items from (Part M) — existing,
 * already-preloaded world decorations only. Never habitat/resource/UI/FX art.
 */
export const DECOR_CATALOG: DecorCatalogItem[] = [
  { id: "animal_house", label: "Animal House", icon: "dg_animal_house_01", cost: 420, scale: 0.32, category: "structure" },
  { id: "bridge_wood", label: "Wooden Bridge", icon: "dg_bridge_wood_01", cost: 380, scale: 0.3, category: "structure" },
  { id: "picnic_table", label: "Picnic Table", icon: "dg_picnic_table_01", cost: 260, scale: 0.26, category: "structure" },
  { id: "tree_medium", label: "Garden Tree", icon: "dg_tree_medium_01", cost: 300, scale: 0.34, category: "tree" },
  { id: "tree_pink", label: "Blossom Tree", icon: "dg_tree_pink_01", cost: 340, scale: 0.34, category: "tree" },
  { id: "bush_green", label: "Garden Bush", icon: "dg_bush_green_01", cost: SHOP_ECONOMY.basicMinimum, scale: 0.26, category: "vegetation" },
  { id: "fern", label: "Fern Cluster", icon: "dg_fern_01", cost: SHOP_ECONOMY.basicMinimum, scale: 0.22, category: "vegetation" },
  { id: "vegetation_01", label: "Wildflower Patch", icon: "dg_vegetation_01", cost: SHOP_ECONOMY.basicMinimum, scale: 0.24, category: "vegetation" },
  { id: "bench", label: "Garden Bench", icon: "dg_bench_01", cost: 200, scale: 0.26, category: "decor" },
  { id: "birdhouse", label: "Birdhouse", icon: "dg_birdhouse_01", cost: 180, scale: 0.22, category: "decor" },
  { id: "fence", label: "Fence Section", icon: "dg_fence_01", cost: SHOP_ECONOMY.basicMinimum, scale: 0.24, category: "decor" },
  { id: "flower_cart", label: "Flower Cart", icon: "dg_flower_cart_01", cost: 260, scale: 0.28, category: "decor" },
  { id: "planter", label: "Flower Planter", icon: "dg_planter_01", cost: SHOP_ECONOMY.basicMinimum, scale: 0.22, category: "decor" },
  { id: "sign", label: "Wooden Sign", icon: "dg_sign_01", cost: SHOP_ECONOMY.basicMinimum, scale: 0.2, category: "decor" },
  { id: "lantern", label: "Garden Lantern", icon: "dg_lantern_01", cost: 160, scale: 0.24, category: "decor" },
  { id: "rock_large", label: "Large Rock", icon: "dg_rock_large_01", cost: SHOP_ECONOMY.basicMinimum, scale: 0.3, category: "nature" },
  { id: "rock_medium", label: "Garden Rock", icon: "dg_rock_medium_01", cost: SHOP_ECONOMY.basicMinimum, scale: 0.24, category: "nature" },
  { id: "mushrooms", label: "Mushroom Patch", icon: "dg_mushrooms_01", cost: SHOP_ECONOMY.basicMinimum, scale: 0.2, category: "nature" },
];

export const ACCESSORY_CATALOG: AccessoryCatalogItem[] = [
  { id: "garden_hat", label: "Garden Hat", icon: "dg_accessory_garden_hat", cost: 300, slot: "head", rarity: "common" },
  { id: "flower_crown", label: "Flower Crown", icon: "dg_accessory_flower_crown", cost: 300, slot: "head", rarity: "common" },
  { id: "flower_bow", label: "Flower Bow", icon: "dg_accessory_flower_bow", cost: 200, slot: "head", rarity: "common" },
  { id: "magic_butterfly", label: "Magic Butterfly", icon: "dg_accessory_magic_butterfly", cost: 450, slot: "special", rarity: "rare" },
  { id: "magic_crown", label: "Magic Crown", icon: "dg_accessory_magic_crown_rare", cost: 600, slot: "head", rarity: "magical" },
  // "Companion" accessories — float/sit beside the animal, no anatomical
  // wrapping needed. Replaced Heart Glasses, Garden Scarf, Garden Backpack.
  { id: "magic_balloon", label: "Magic Balloon", icon: "dg_accessory_magic_balloon", cost: 300, slot: "special", rarity: "common" },
  { id: "flower_basket", label: "Flower Basket", icon: "dg_accessory_flower_basket", cost: 250, slot: "back", rarity: "common" },
  // Blue Bow replaced Round Glasses (kept its price) — geometric twin of
  // Flower Bow, slot must stay "head" so animals without an explicit
  // ACCESSORY_FITS entry fall through to the SAME generic anchor as Flower
  // Bow. Magic Wand replaced Fairy Sparkles (kept its price/slot).
  { id: "blue_bow", label: "Blue Bow", icon: "dg_accessory_blue_bow", cost: 250, slot: "head", rarity: "common" },
  { id: "magic_wand", label: "Magic Wand", icon: "dg_accessory_magic_wand", cost: 350, slot: "special", rarity: "rare" },
];

export function decorItem(id: string): DecorCatalogItem | undefined {
  return DECOR_CATALOG.find((d) => d.id === id);
}

export function accessoryItem(id: string): AccessoryCatalogItem | undefined {
  return ACCESSORY_CATALOG.find((a) => a.id === id);
}

/** Mystery Gift reward pool — existing catalog items only, weighted by rarity. */
export const MYSTERY_GIFT_POOL: MysteryGiftReward[] = [
  ...DECOR_CATALOG.map((d) => ({ id: `decor_${d.id}`, kind: "decor" as const, refId: d.id, rarity: "common" as const, weight: 6 })),
  ...ACCESSORY_CATALOG.filter((a) => a.rarity === "common").map((a) => ({ id: `acc_${a.id}`, kind: "accessory" as const, refId: a.id, rarity: "common" as const, weight: 4 })),
  ...ACCESSORY_CATALOG.filter((a) => a.rarity === "rare").map((a) => ({ id: `acc_${a.id}`, kind: "accessory" as const, refId: a.id, rarity: "rare" as const, weight: 2 })),
  ...ACCESSORY_CATALOG.filter((a) => a.rarity === "magical").map((a) => ({ id: `acc_${a.id}`, kind: "accessory" as const, refId: a.id, rarity: "magical" as const, weight: 1 })),
];

export const DAILY_ITEM_COUNT = 6;

/** Deterministic date-based rotation — same day always yields the same six
 *  items (until persisted state overrides it, see ShopService), no RNG state
 *  to store. mulberry32 mirrors data/maze.ts's PRNG for consistency. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dateSeed(dateStr: string): number {
  let h = 0;
  for (let i = 0; i < dateStr.length; i++) h = (Math.imul(h, 31) + dateStr.charCodeAt(i)) | 0;
  return h >>> 0;
}

/** Pick DAILY_ITEM_COUNT ids from DECOR_CATALOG for `dateStr` ("YYYY-MM-DD"),
 *  favouring variety: at least one structure and one tree when available. */
export function rollDailyItems(dateStr: string): string[] {
  const rng = mulberry32(dateSeed(dateStr));
  const shuffled = [...DECOR_CATALOG].sort(() => rng() - 0.5);
  const byCat = (cat: DecorCatalogItem["category"]) => shuffled.find((d) => d.category === cat);
  const picks: DecorCatalogItem[] = [];
  const structure = byCat("structure");
  const tree = byCat("tree");
  if (structure) picks.push(structure);
  if (tree) picks.push(tree);
  for (const item of shuffled) {
    if (picks.length >= DAILY_ITEM_COUNT) break;
    if (picks.includes(item)) continue;
    picks.push(item);
  }
  return picks.slice(0, DAILY_ITEM_COUNT).map((d) => d.id);
}
