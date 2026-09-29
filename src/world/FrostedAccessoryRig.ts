import Phaser from "phaser";
import type { FrostedShopItemDef } from "../data/types";
import { ACCESSORY_ART, ANCHOR_FRACTION, WEARABLE_TILT, accessoryOriginY } from "../data/frostedAccessories";

/**
 * A bought pet accessory worn by an animal in the VALLEY. It reads the
 * animal's own sprite every frame — position, scale (breathing / turn squash),
 * rotation and horizontal flip — and keeps the accessory glued to the same
 * spot of the body, using exactly the anchor + sizing tables the Shop's
 * TRY IT OUT preview uses, so what you tried on is what you see in the world.
 *
 * Owns nothing but the accessory image: it never touches ownership, coins or
 * progression (FrostedShopService does), and destroys itself with the sprite.
 */
export class FrostedAccessoryRig {
  readonly itemId: string;
  private img: Phaser.GameObjects.Image;
  private readonly baseRatio: number;

  constructor(
    private scene: Phaser.Scene,
    private sprite: Phaser.GameObjects.Image,
    private animalId: string,
    item: FrostedShopItemDef,
  ) {
    this.itemId = item.id;
    const art = ACCESSORY_ART[item.id];
    this.item = item;
    this.img = scene.add.image(sprite.x, sprite.y, item.textureKey);
    if (art && item.anchor) this.img.setOrigin(art.cx, accessoryOriginY(item.anchor, art));
    else this.img.setOrigin(0.5, 0.5);
    // sprite's own x/y scale ratio at rest (1 for these NPCs); only DEVIATIONS from it (turn squash) are mirrored
    this.baseRatio = Math.abs(sprite.scaleX) / (Math.abs(sprite.scaleY) || 1) || 1;
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.follow, this);
    sprite.once(Phaser.GameObjects.Events.DESTROY, () => this.destroy());
    this.follow();
  }

  private item: FrostedShopItemDef;

  private follow(): void {
    const s = this.sprite;
    if (!s.active) return;
    const item = this.item;
    const anchor = item.anchor;
    if (!anchor) return;
    const frac = (ANCHOR_FRACTION[this.animalId] ?? ANCHOR_FRACTION.fv_rabbit)[anchor];
    const art = ACCESSORY_ART[item.id];

    const sx = Math.abs(s.scaleX);
    const sy = Math.abs(s.scaleY);
    const W = s.frame.realWidth * sx;
    const H = s.frame.realHeight * sy;
    const u = s.flipX ? 1 - frac.x : frac.x;
    const lx = (u - 0.5) * W;
    const ly = (frac.y - 1) * H;
    const cos = Math.cos(s.rotation);
    const sin = Math.sin(s.rotation);
    this.img.setPosition(s.x + lx * cos - ly * sin, s.y + lx * sin + ly * cos);

    // sized by the accessory's own VISIBLE height as a fraction of the animal's height (aspect ratio preserved)
    const targetVisibleH = H * (item.previewScale ?? 0.25);
    const uni = targetVisibleH / ((art?.contentH ?? 0.5) * (this.img.height || 1));
    const squash = sx / (sy || 1) / this.baseRatio; // 1 at rest, →0.2 mid-turn
    this.img.setScale(uni * squash, uni);
    const tilt = WEARABLE_TILT[item.id] ?? 0;
    this.img.setFlipX(s.flipX);
    this.img.setAngle(Phaser.Math.RadToDeg(s.rotation) + (s.flipX ? -tilt : tilt));
    this.img.setVisible(s.visible);
    this.img.setDepth(s.depth + 0.1);
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.follow, this);
    this.img.destroy();
  }
}
