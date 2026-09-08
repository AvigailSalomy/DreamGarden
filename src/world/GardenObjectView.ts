import Phaser from "phaser";

/**
 * A living garden object: a body sprite with feet at the container origin, plus a
 * soft contact shadow that shrinks/fades while the object is airborne.
 */
export class GardenObjectView {
  readonly container: Phaser.GameObjects.Container;
  readonly body: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private baseScale: number;
  private hop = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    opts: { texture: string; scale: number; shadowWidth?: number },
  ) {
    this.baseScale = opts.scale;
    this.shadow = scene.add
      .image(0, 4, "shadow")
      .setOrigin(0.5, 0.5)
      .setAlpha(0.5)
      .setDisplaySize(opts.shadowWidth ?? 140, (opts.shadowWidth ?? 140) * 0.34);
    this.body = scene.add.image(0, 0, opts.texture).setOrigin(0.5, 1);
    this.container = scene.add.container(x, y, [this.shadow, this.body]);
    this.container.setScale(opts.scale);
  }

  get x(): number {
    return this.container.x;
  }
  get y(): number {
    return this.container.y;
  }

  setGroundPosition(x: number, y: number): void {
    this.container.setPosition(x, y);
  }

  /** Lift the body above its feet; shadow reacts. */
  setHopHeight(h: number): void {
    this.hop = Math.max(0, h);
    this.body.y = -this.hop;
    const k = Phaser.Math.Clamp(this.hop / 90, 0, 1);
    this.shadow.setScale(Phaser.Math.Linear(1, 0.55, k));
    this.shadow.setAlpha(Phaser.Math.Linear(0.5, 0.18, k));
  }

  faceLeft(v: boolean): void {
    this.body.setFlipX(v);
  }

  /** Squash & stretch around the base scale (1 = neutral). */
  setSquash(sx: number, sy: number): void {
    this.container.setScale(this.baseScale * sx, this.baseScale * sy);
  }

  get baseScaleValue(): number {
    return this.baseScale;
  }

  setDepthFromY(): void {
    this.container.setDepth(1000 + this.container.y);
  }

  destroy(): void {
    this.container.destroy();
  }
}
