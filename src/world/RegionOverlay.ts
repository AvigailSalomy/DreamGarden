import Phaser from "phaser";
import type { RegionId } from "../data/types";

export interface RegionRect {
  id: RegionId;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RegionOverlayOpts {
  /** How many bloom-in flowers scatter across the region. */
  flowerCount?: number;
  /** Tints applied at random to the bloom-in flowers (e.g. pink / gold / violet). */
  flowerTints?: number[];
}

/**
 * The "not restored yet" signal for a garden region, and the "coming alive"
 * moment when it is.
 *
 * This used to be a large tinted image the size of the whole region rect (a
 * grey/purple "veil" while dormant, a green "lush" patch fading in on top) —
 * visually that reads as a rectangular filter laid over the artwork rather
 * than damage IN the world, and at the scale several regions render at, their
 * veils overlapped into one large grey/brown blob spanning most of the map.
 * Removed. Damage/dormancy now lives in the actual assets `buildProps()`
 * places per region (a dead tree, a cracked fountain, sparse/dry vegetation,
 * a dead shrub) — this class now only owns the flower-scatter bloom-in, a
 * small, localized effect, not a full-region wash. Same public contract
 * (`restore()` / `applyRestoredInstant()` / `.restored`) as before, so
 * RevealSequencer, GardenScene, and the progression/save system are
 * unaffected — this is a presentation-only change.
 */
export class RegionOverlay {
  private flowers: Phaser.GameObjects.Image[] = [];
  restored = false;

  constructor(
    private scene: Phaser.Scene,
    rect: RegionRect,
    seed: number,
    opts: RegionOverlayOpts = {},
  ) {
    const rng = new Phaser.Math.RandomDataGenerator([String(seed)]);
    const count = opts.flowerCount ?? 7;
    const tints = opts.flowerTints ?? [];
    for (let i = 0; i < count; i++) {
      const f = scene.add
        .image(
          rect.x + rng.between(-rect.w / 2, rect.w / 2),
          rect.y + rng.between(-rect.h / 3, rect.h / 2),
          "flower",
        )
        .setDepth(3)
        .setScale(0)
        .setAlpha(0);
      if (tints.length) f.setTint(tints[rng.between(0, tints.length - 1)]);
      f.setData("swayPhase", rng.realInRange(0, Math.PI * 2));
      this.flowers.push(f);
    }
  }

  /** Play the restoration: flowers bloom in across the region, one by one. */
  restore(): Promise<void> {
    if (this.restored) return Promise.resolve();
    this.restored = true;
    const scene = this.scene;

    return new Promise((resolve) => {
      this.flowers.forEach((f, i) => {
        scene.tweens.add({
          targets: f,
          scale: Phaser.Math.FloatBetween(0.7, 1),
          alpha: 1,
          delay: 250 + i * 90,
          duration: 420,
          ease: "Back.easeOut",
          onComplete: () => {
            scene.tweens.add({
              targets: f,
              angle: { from: -4, to: 4 },
              duration: 2000 + f.getData("swayPhase") * 200,
              yoyo: true,
              repeat: -1,
              ease: "Sine.easeInOut",
            });
          },
        });
      });
      scene.time.delayedCall(250 + this.flowers.length * 90 + 500, () => resolve());
    });
  }

  /** Apply saved state instantly (on reload) with no animation. */
  applyRestoredInstant(): void {
    this.restored = true;
    this.flowers.forEach((f) => {
      f.setScale(Phaser.Math.FloatBetween(0.7, 1)).setAlpha(1);
      this.scene.tweens.add({
        targets: f,
        angle: { from: -4, to: 4 },
        duration: 2200,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    });
  }
}
