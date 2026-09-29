import Phaser from "phaser";

/** One-shot and ambient particle helpers, all in the soft DreamGarden style. */

export function sparkleBurst(
  scene: Phaser.Scene,
  x: number,
  y: number,
  count = 10,
  spread = 60,
  tint = 0xffffff,
): void {
  const p = scene.add.particles(x, y, "spark", {
    lifespan: { min: 400, max: 900 },
    speed: { min: 30, max: 130 },
    angle: { min: 0, max: 360 },
    scale: { start: 0.7, end: 0 },
    alpha: { start: 1, end: 0 },
    rotate: { min: 0, max: 360 },
    gravityY: -20,
    tint,
    blendMode: Phaser.BlendModes.ADD,
    emitting: false,
  });
  p.setDepth(9000);
  p.explode(count, Phaser.Math.Between(-spread, spread), Phaser.Math.Between(-spread, spread));
  scene.time.delayedCall(1000, () => p.destroy());
}

export function petalPuff(scene: Phaser.Scene, x: number, y: number, count = 12): void {
  const p = scene.add.particles(x, y, "petal", {
    lifespan: { min: 900, max: 1600 },
    speedX: { min: -60, max: 60 },
    speedY: { min: -150, max: -40 },
    gravityY: 90,
    scale: { start: 0.9, end: 0.5 },
    alpha: { start: 1, end: 0 },
    rotate: { min: -180, max: 180 },
    emitting: false,
  });
  p.setDepth(9000);
  p.explode(count);
  scene.time.delayedCall(1800, () => p.destroy());
}

export function dustRing(scene: Phaser.Scene, x: number, y: number, tint = 0xffffff): void {
  const d = scene.add.image(x, y, "dust").setDepth(50).setScale(0.3).setAlpha(0.9).setTint(tint);
  scene.tweens.add({
    targets: d,
    scale: 1.5,
    alpha: 0,
    duration: 480,
    ease: "Cubic.easeOut",
    onComplete: () => d.destroy(),
  });
}

export function gatherGlow(
  scene: Phaser.Scene,
  x: number,
  y: number,
  duration = 700,
  tint = 0xffffff,
): Promise<Phaser.GameObjects.Image> {
  const g = scene.add
    .image(x, y, "glow")
    .setDepth(40)
    .setScale(0.2)
    .setAlpha(0)
    .setTint(tint)
    .setBlendMode(Phaser.BlendModes.ADD);
  const ring = scene.add.particles(x, y, "spark", {
    lifespan: 700,
    speed: { min: -120, max: -40 },
    radial: true,
    scale: { start: 0, end: 0.6 },
    alpha: { start: 0, end: 0.9 },
    tint,
    blendMode: Phaser.BlendModes.ADD,
    frequency: 40,
    emitZone: {
      type: "edge",
      source: new Phaser.Geom.Circle(0, 0, 90),
      quantity: 16,
      total: -1,
    },
  });
  ring.setDepth(41);

  return new Promise((resolve) => {
    scene.tweens.add({
      targets: g,
      scale: 1.1,
      alpha: 0.95,
      duration,
      ease: "Sine.easeOut",
      onComplete: () => {
        ring.stop();
        scene.time.delayedCall(400, () => ring.destroy());
        resolve(g);
      },
    });
  });
}

/** Low, slow ambient fireflies across a world rectangle. */
export function ambientFireflies(
  scene: Phaser.Scene,
  rect: Phaser.Geom.Rectangle,
  count: number,
): Phaser.GameObjects.Particles.ParticleEmitter {
  const e = scene.add.particles(0, 0, "firefly", {
    x: { min: rect.x, max: rect.right },
    y: { min: rect.y, max: rect.bottom },
    lifespan: { min: 3400, max: 6200 },
    speedX: { min: -12, max: 12 },
    speedY: { min: -10, max: 6 },
    scale: { min: 0.35, max: 0.6 },
    alpha: { values: [0, 0.9, 0.9, 0], interpolation: "linear" },
    frequency: Math.max(140, 1500 / Math.max(1, count)),
    blendMode: Phaser.BlendModes.ADD,
    tint: [0xfff2c4, 0xffe6a3],
  });
  e.setDepth(600);
  return e;
}
