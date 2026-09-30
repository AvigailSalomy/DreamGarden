import { describe, expect, it } from "vitest";
import type Phaser from "phaser";
import { wornAccessoryPose } from "../src/world/petAccessoryFit";
import { ANCHOR_FRACTION, ACCESSORY_ART } from "../src/data/frostedAccessories";
import { FROSTED_SHOP_CATALOG } from "../src/data/frostedShop";

const ACC_TEX_H = 2048;

/** Just the parts of a Phaser Image that the fitting reads. */
function fakeSprite(opts: { w?: number; h?: number; scaleX?: number; scaleY?: number; rotation?: number; flipX?: boolean; x?: number; y?: number } = {}) {
  return {
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    width: opts.w ?? 1000,
    height: opts.h ?? 1000,
    originX: 0.5,
    originY: 1,
    scaleX: opts.scaleX ?? 0.2,
    scaleY: opts.scaleY ?? 0.2,
    rotation: opts.rotation ?? 0,
    flipX: opts.flipX ?? false,
    scene: { textures: { getFrame: () => ({ height: ACC_TEX_H }) } },
  } as unknown as Phaser.GameObjects.Image;
}

const item = (id: string) => FROSTED_SHOP_CATALOG.find((i) => i.id === id)!;
const pets = FROSTED_SHOP_CATALOG.filter((i) => i.category === "pet");

describe("wornAccessoryPose", () => {
  it("at rest matches the crown's original placement: head anchor, own visible height, bottom-edge origin", () => {
    const s = fakeSprite();
    const p = wornAccessoryPose(s, "fv_rabbit", item("pet_tiara"), 0.2)!;
    const H = 1000 * 0.2;
    const frac = ANCHOR_FRACTION.fv_rabbit.head;
    expect(p.x).toBeCloseTo(-H / 2 + frac.x * H); // sprite is square here, so W = H
    expect(p.y).toBeCloseTo(-H + frac.y * H);
    expect(p.visibleH).toBeCloseTo(H * 0.14);
    expect(p.scale).toBeCloseTo((H * 0.14) / (ACCESSORY_ART.pet_tiara.contentH * ACC_TEX_H));
    expect(p.originY).toBe(ACCESSORY_ART.pet_tiara.bottom);
    expect(p.rotation).toBeCloseTo((-2 * Math.PI) / 180);
  });

  it("follows the head through a breath but never changes size", () => {
    const rest = wornAccessoryPose(fakeSprite(), "fv_fox", item("pet_wreath_violet"), 0.2)!;
    const breath = wornAccessoryPose(fakeSprite({ scaleY: 0.2 * 1.045 }), "fv_fox", item("pet_wreath_violet"), 0.2)!;
    // the head rises with the sprite's vertical stretch...
    expect(breath.y).toBeCloseTo(rest.y * 1.045);
    expect(breath.x).toBeCloseTo(rest.x);
    // ...while the rigid accessory keeps its size and aspect
    expect(breath.scale).toBe(rest.scale);
  });

  it("rides the sprite's rotation and position (hop / sway / walk)", () => {
    const rest = wornAccessoryPose(fakeSprite(), "fv_deer", item("pet_tiara_aqua"), 0.2)!;
    const rot = Math.PI / 12;
    const moved = wornAccessoryPose(fakeSprite({ x: 50, y: -30, rotation: rot }), "fv_deer", item("pet_tiara_aqua"), 0.2)!;
    expect(moved.x).toBeCloseTo(50 + rest.x * Math.cos(rot) - rest.y * Math.sin(rot));
    expect(moved.y).toBeCloseTo(-30 + rest.x * Math.sin(rot) + rest.y * Math.cos(rot));
    expect(moved.rotation).toBeCloseTo(rest.rotation + rot);
  });

  it("mirrors onto the other side of the head for a flipped animal", () => {
    const normal = wornAccessoryPose(fakeSprite(), "fv_squirrel", item("pet_bow_starlight"), 0.2)!;
    const flipped = wornAccessoryPose(fakeSprite({ flipX: true }), "fv_squirrel", item("pet_bow_starlight"), 0.2)!;
    expect(flipped.x).toBeCloseTo(-normal.x);
    expect(flipped.y).toBeCloseTo(normal.y);
    expect(flipped.flipX).toBe(true);
    expect(flipped.originX).toBeCloseTo(1 - normal.originX);
    expect(flipped.rotation).toBeCloseTo(-normal.rotation);
  });

  it("every pet accessory has measured art bounds and fits every animal", () => {
    for (const pet of pets) {
      expect(ACCESSORY_ART[pet.id], pet.id).toBeDefined();
      for (const animal of Object.keys(ANCHOR_FRACTION)) {
        const p = wornAccessoryPose(fakeSprite(), animal, pet, 0.2);
        expect(p, `${pet.id} on ${animal}`).not.toBeNull();
        expect(Number.isFinite(p!.x) && Number.isFinite(p!.y) && p!.scale > 0).toBe(true);
      }
    }
  });
});
