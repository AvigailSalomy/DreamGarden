import type Phaser from "phaser";
import type { FrostedShopItemDef } from "../data/types";
import { ACCESSORY_ART, ANCHOR_FRACTION, WEARABLE_TILT, accessoryOriginY } from "../data/frostedAccessories";

/**
 * How a worn pet accessory sits on a Frosted Valley animal — one fitting
 * shared by the Shop's TRY IT OUT preview and the living animals in the
 * world, so an item looks the same on the rabbit in both places. The
 * measured tables live in data/frostedAccessories.ts.
 */

export interface WornPose {
  x: number;
  y: number;
  rotation: number;
  scale: number;
  originX: number;
  originY: number;
  flipX: boolean;
  /** The accessory's own visible height at rest, in the sprite's parent space. */
  visibleH: number;
}

/**
 * Where `item` sits on `sprite` RIGHT NOW, in the sprite's parent space.
 * The anchor is carried through the sprite's live transform (position,
 * rotation, per-axis scale, flip), so the accessory rides every breath, hop,
 * gait squash and turn instead of hanging where the head was when it was put
 * on. Its SIZE comes from `baseScale` — the sprite's un-animated scale — so
 * breathing never resizes it and a rigid crown never stretches.
 */
export function wornAccessoryPose(
  sprite: Phaser.GameObjects.Image,
  animalId: string,
  item: FrostedShopItemDef,
  baseScale: number,
): WornPose | null {
  if (!item.anchor) return null;
  const frac = (ANCHOR_FRACTION[animalId] ?? ANCHOR_FRACTION.fv_rabbit)[item.anchor];
  const flip = sprite.flipX;
  const fx = flip ? 1 - frac.x : frac.x;
  const lx = (fx - sprite.originX) * sprite.width * sprite.scaleX;
  const ly = (frac.y - sprite.originY) * sprite.height * sprite.scaleY;
  const cos = Math.cos(sprite.rotation);
  const sin = Math.sin(sprite.rotation);

  const art = ACCESSORY_ART[item.id];
  const texH = sprite.scene.textures.getFrame(item.textureKey)?.height || 1;
  // previewScale is the accessory's own VISIBLE height as a fraction of the
  // animal's height — "about a quarter of the animal tall", not "68% of a
  // mostly-empty PNG"
  const visibleH = sprite.height * baseScale * (item.previewScale ?? 0.25);
  const scale = visibleH / ((art?.contentH ?? 0.5) * texH);
  const originX = art ? art.cx : 0.5;
  const originY = art ? accessoryOriginY(item.anchor, art) : item.anchor === "head" ? 1 : item.anchor === "neck" ? 0 : 0.5;
  const tilt = ((WEARABLE_TILT[item.id] ?? 0) * Math.PI) / 180;

  return {
    x: sprite.x + lx * cos - ly * sin,
    y: sprite.y + lx * sin + ly * cos,
    rotation: sprite.rotation + (flip ? -tilt : tilt),
    scale,
    originX: flip ? 1 - originX : originX,
    originY,
    flipX: flip,
    visibleH,
  };
}
