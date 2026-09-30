import type { FrostedShopAnchor } from "./types";

/**
 * Where worn Winter Market accessories attach to each animal, shared by the
 * Shop's TRY IT OUT preview and the animals in the valley itself so an
 * accessory sits in exactly the same place in both.
 */

/**
 * Where each anchor sits, as a fraction of the animal portrait's own
 * displayed (width, height-from-top) box — see buildPreview/
 * applyAccessoryToPreview. Measured per animal (not one universal guess)
 * by overlaying a measurement grid on each real portrait: every animal's
 * proportions differ enough that one shared fraction put goggles well above
 * the eyes on some animals, and animals with a large side tail (fox,
 * squirrel) have their actual face well off the horizontal center of their
 * bounding box. Falls back to `fv_rabbit`'s numbers for any animal id this
 * table doesn't (yet) cover.
 */
export const ANCHOR_FRACTION: Record<string, Record<FrostedShopAnchor, { x: number; y: number }>> = {
  fv_rabbit: { head: { x: 0.5, y: 0.26 }, face: { x: 0.57, y: 0.46 }, neck: { x: 0.5, y: 0.62 }, collar: { x: 0.5, y: 0.62 } },
  fv_fox: { head: { x: 0.65, y: 0.18 }, face: { x: 0.68, y: 0.36 }, neck: { x: 0.62, y: 0.58 }, collar: { x: 0.62, y: 0.58 } },
  fv_deer: { head: { x: 0.62, y: 0.16 }, face: { x: 0.62, y: 0.38 }, neck: { x: 0.55, y: 0.58 }, collar: { x: 0.55, y: 0.58 } },
  fv_squirrel: { head: { x: 0.72, y: 0.22 }, face: { x: 0.74, y: 0.38 }, neck: { x: 0.68, y: 0.56 }, collar: { x: 0.56, y: 0.66 } },
  fv_polarbear: { head: { x: 0.55, y: 0.12 }, face: { x: 0.53, y: 0.32 }, neck: { x: 0.5, y: 0.58 }, collar: { x: 0.5, y: 0.58 } },
  fv_penguin: { head: { x: 0.42, y: 0.12 }, face: { x: 0.38, y: 0.28 }, neck: { x: 0.4, y: 0.45 }, collar: { x: 0.55, y: 0.6 } },
};

/**
 * Every accessory PNG is painted on a huge (2048×2048) canvas with a lot of
 * transparent padding around the actual hat/scarf/etc — so anchoring on the
 * raw image's geometric center (the old `setOrigin(0.5, 0.5)`) does NOT put
 * the visible artwork's own attachment point at the target anchor: half the
 * VISIBLE hat ends up floating above the head with a gap beneath it, which
 * is exactly the "hat hovering over the rabbit" bug. Measured (via Pillow
 * alpha-bbox on each real PNG) where the real, non-transparent artwork sits
 * inside its canvas: `top`/`bottom`/`cx` are that artwork's own edges as a
 * fraction of the full 2048×2048 canvas, and `contentH` is its height as a
 * fraction of the canvas height (used to size the accessory by its OWN
 * visible height rather than the mostly-empty raw canvas height).
 */
export const ACCESSORY_ART: Record<string, { top: number; bottom: number; cx: number; contentH: number }> = {
  pet_bow_pink: { top: 0.248, bottom: 0.786, cx: 0.492, contentH: 0.538 },
  pet_tiara: { top: 0.271, bottom: 0.682, cx: 0.49, contentH: 0.411 },
  pet_clip_snowflake: { top: 0.228, bottom: 0.784, cx: 0.497, contentH: 0.556 },
  pet_tiara_blossom: { top: 0.271, bottom: 0.681, cx: 0.491, contentH: 0.409 },
  pet_tiara_aqua: { top: 0.271, bottom: 0.681, cx: 0.493, contentH: 0.41 },
  // these three carry a soft glow halo — measured at alpha > 50% so the
  // faint halo doesn't count as artwork (it would sink them onto the face)
  pet_tiara_violet: { top: 0.29, bottom: 0.663, cx: 0.501, contentH: 0.373 },
  pet_wreath_violet: { top: 0.271, bottom: 0.729, cx: 0.5, contentH: 0.458 },
  pet_bow_starlight: { top: 0.255, bottom: 0.777, cx: 0.489, contentH: 0.522 },
};

/**
 * A small per-item worn angle (degrees) — a real accessory rarely sits
 * perfectly level/centered, and a slight tilt is what reads as "worn" rather
 * than "stamped on". Items with an off-center silhouette get a gentle tilt
 * matching which side their own art leans toward; the crown-style pieces
 * share the tiara's -2° so they all sit on the head the same way.
 */
export const WEARABLE_TILT: Record<string, number> = {
  pet_bow_pink: 8,
  pet_tiara: -2,
  pet_tiara_blossom: -2,
  pet_tiara_aqua: -2,
  pet_tiara_violet: -2,
  pet_wreath_violet: -2,
  pet_bow_starlight: 6,
  pet_clip_snowflake: 10,
};

/**
 * Which edge of an accessory's own artwork should land on the animal's
 * anchor point, by category: a hat/tiara/bow/clip RESTS on the head, so its
 * own bottom edge belongs at the head anchor; a scarf wraps the neck from
 * above, so its top edge belongs at the neck anchor; goggles sit centered
 * over the eyes, so their own vertical center belongs at the face anchor.
 */
export function accessoryOriginY(anchor: FrostedShopAnchor, art: { top: number; bottom: number }): number {
  if (anchor === "head") return art.bottom;
  if (anchor === "neck") return art.top;
  // "face" (goggles) and "collar" (bow / snowflake at the neck) are centred on their anchor
  return (art.top + art.bottom) / 2;
}
