import Phaser from "phaser";
import type { RegionId } from "../data/types";

export interface RegionRect {
  id: RegionId;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The "neglect veil" over a garden region: a soft desaturating wash plus a hidden
 * lush-grass patch and dormant flowers that bloom in when the region is restored.
 */
export class RegionOverlay {
  private veil: Phaser.GameObjects.Rectangle;
  private lush: Phaser.GameObjects.Image;
  private flowers: Phaser.GameObjects.Image[] = [];
  restored = false;

  constructor(
    private scene: Phaser.Scene,
    rect: RegionRect,
    seed: number,
  ) {
    this.lush = scene.add
      .image(rect.x, rect.y, "meadow_lush")
      .setDepth(2)
      .setAlpha(0)
      .setDisplaySize(rect.w * 1.25, rect.h * 1.35);

    this.veil = scene.add
      .rectangle(rect.x, rect.y, rect.w * 1.6, rect.h * 1.8, 0x8b86a6, 0.4)
      .setDepth(120)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);

    const rng = new Phaser.Math.RandomDataGenerator([String(seed)]);
    for (let i = 0; i < 7; i++) {
      const f = scene.add
        .image(
          rect.x + rng.between(-rect.w / 2, rect.w / 2),
          rect.y + rng.between(-rect.h / 3, rect.h / 2),
          "flower",
        )
        .setDepth(3)
        .setScale(0)
        .setAlpha(0);
      f.setData("swayPhase", rng.realInRange(0, Math.PI * 2));
      this.flowers.push(f);
    }
  }

  /** Play the restoration: veil lifts, lush grass and flowers bloom in. */
  restore(): Promise<void> {
    if (this.restored) return Promise.resolve();
    this.restored = true;
    const scene = this.scene;

    scene.tweens.add({ targets: this.veil, alpha: 0, duration: 1100, ease: "Sine.easeOut" });
    scene.tweens.add({ targets: this.lush, alpha: 0.85, duration: 1100, ease: "Sine.easeOut" });

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
    this.veil.setAlpha(0);
    this.lush.setAlpha(0.85);
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
