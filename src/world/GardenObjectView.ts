import Phaser from "phaser";

/**
 * A living garden object: a body sprite with feet at the container origin, plus a
 * soft contact shadow that shrinks/fades while the object is airborne.
 */
export class GardenObjectView {
  readonly container: Phaser.GameObjects.Container;
  readonly body: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private hitZone?: Phaser.GameObjects.Zone;
  private baseScale: number;
  private hop = 0;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    opts: { texture: string; scale: number; shadowWidth?: number; hitSize?: number },
  ) {
    this.baseScale = opts.scale;
    this.shadow = scene.add
      .image(0, 4, "shadow")
      .setOrigin(0.5, 0.5)
      .setAlpha(0.5)
      .setDisplaySize(opts.shadowWidth ?? 140, (opts.shadowWidth ?? 140) * 0.34);
    this.body = scene.add.image(0, 0, opts.texture).setOrigin(0.5, 1);
    const children: Phaser.GameObjects.GameObject[] = [this.shadow, this.body];

    // A comfortable tap target independent of the visual sprite's size — a
    // small on-screen animal must still be easy to tap. Invisible; sized in
    // LOCAL (pre-container-scale) units so it ends up `hitSize` real screen
    // pixels square regardless of how small `opts.scale` renders the body.
    if (opts.hitSize) {
      const localSize = opts.hitSize / opts.scale;
      const zone = scene.add
        .zone(0, -this.body.height / 2, localSize, localSize)
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });
      this.hitZone = zone;
      children.push(zone);
      // Maintain at least a 48px tap target when the world camera zooms out.
      const resizeHit = () => {
        const size = Math.max(opts.hitSize!, 48 / scene.cameras.main.zoom) / this.baseScale;
        zone.setSize(size, size);
        (zone.input?.hitArea as Phaser.Geom.Rectangle)?.setSize(size, size);
      };
      scene.events.on(Phaser.Scenes.Events.PRE_UPDATE, resizeHit);
      zone.once(Phaser.GameObjects.Events.DESTROY, () => scene.events.off(Phaser.Scenes.Events.PRE_UPDATE, resizeHit));
    }

    this.container = scene.add.container(x, y, children);
    this.container.setScale(opts.scale);
  }

  /** Wire what happens when the player taps this object's (invisible,
   *  comfortably-sized) hit zone. No-op if no `hitSize` was given. */
  onTap(handler: () => void): void {
    this.hitZone?.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (pointer.getDistance() < 12) handler();
    });
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

  private accessories: Phaser.GameObjects.Image[] = [];
  private accessoryBaseX: number[] = [];
  private ghost?: Phaser.GameObjects.Image;

  /** The pre-rescue silhouette overlay (GardenScene.buildAnimalSilhouette) is
   *  a separate image, not the body itself, so it needs the same faceLeft()
   *  sync or an animal that idle-wanders while still locked can turn around
   *  while its silhouette doesn't — then revealAnimalSilhouette() crossfades
   *  into a body facing the opposite way from the shadow it grew out of. */
  registerGhost(img: Phaser.GameObjects.Image | undefined): void {
    this.ghost = img;
    if (img) img.setFlipX(this.body.flipX);
  }

  /** Accessory sprites are positioned assuming the body's un-flipped
   *  orientation; faceLeft() must mirror them too, or a hat/scarf visibly
   *  detaches to the wrong side whenever idle movement turns the animal
   *  around. Called once after refreshAccessories() rebuilds the sprites. */
  registerAccessories(imgs: Phaser.GameObjects.Image[]): void {
    this.accessories = imgs;
    this.accessoryBaseX = imgs.map((img) => img.x);
    this.applyFlipToAccessories();
  }

  faceLeft(v: boolean): void {
    this.body.setFlipX(v);
    this.ghost?.setFlipX(v);
    this.applyFlipToAccessories();
  }

  private applyFlipToAccessories(): void {
    const flip = this.body.flipX;
    this.accessories.forEach((img, i) => {
      img.setFlipX(flip);
      img.x = flip ? -this.accessoryBaseX[i] : this.accessoryBaseX[i];
    });
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
