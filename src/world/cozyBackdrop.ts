import Phaser from "phaser";
import { COLORS } from "../ui/theme";
import { ambientFireflies } from "../fx/Particles";

/**
 * A static, screen-filling cozy garden scene used behind the Menu and Intro.
 * Not the real world — just atmosphere. Rebuild it on resize.
 */
export function buildCozyBackdrop(scene: Phaser.Scene): Phaser.GameObjects.GameObject[] {
  const W = scene.scale.width || window.innerWidth;
  const H = scene.scale.height || window.innerHeight;
  const made: Phaser.GameObjects.GameObject[] = [];
  const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
    made.push(o);
    return o;
  };

  add(scene.add.image(0, 0, "sky").setOrigin(0, 0).setDisplaySize(W, H).setDepth(-100));
  add(
    scene.add
      .image(W * 0.5, H * 0.52, "clouds")
      .setDisplaySize(W * 1.4, W * 0.36)
      .setAlpha(0.7)
      .setDepth(-95),
  );

  const groundY = H * 0.62;
  add(
    scene.add
      .image(-40, groundY + 60, "hills_near")
      .setOrigin(0, 1)
      .setDisplaySize(W + 80, H * 0.34)
      .setDepth(-90),
  );

  const g = scene.add.graphics().setDepth(-80);
  g.fillStyle(COLORS.grassDull, 1);
  g.fillRect(0, groundY, W, H - groundY);
  g.fillGradientStyle(COLORS.grassDull, COLORS.grassDull, COLORS.grassDull, COLORS.grassDull, 0, 0, 1, 1);
  g.fillRect(0, groundY - 60, W, 80);
  add(g);

  add(
    scene.add
      .image(W * 0.5, groundY + 40, "arch")
      .setOrigin(0.5, 1)
      .setScale(Math.min(1.1, (H * 0.5) / 560))
      .setDepth(-60)
      .setAlpha(0.96),
  );
  add(scene.add.image(W * 0.16, groundY + 70, "dead_shrub").setOrigin(0.5, 1).setScale(0.9).setDepth(-55));
  add(scene.add.image(W * 0.84, groundY + 78, "stump").setOrigin(0.5, 1).setScale(1).setDepth(-55));
  add(scene.add.image(W * 0.28, groundY + 96, "weeds").setOrigin(0.5, 1).setScale(1).setDepth(-52));
  add(scene.add.image(W * 0.72, groundY + 90, "weeds").setOrigin(0.5, 1).setScale(0.85).setDepth(-52));
  add(scene.add.image(W * 0.63, groundY + 110, "flower").setOrigin(0.5, 1).setScale(1.1).setDepth(-50));
  add(scene.add.image(W * 0.4, groundY + 120, "flower").setOrigin(0.5, 1).setScale(0.9).setDepth(-50));

  const ff = ambientFireflies(
    scene,
    new Phaser.Geom.Rectangle(W * 0.1, groundY - H * 0.18, W * 0.8, H * 0.34),
    18,
  );
  ff.setDepth(-40);
  made.push(ff);

  const petals = scene.add.particles(0, -20, "petal", {
    x: { min: 0, max: W },
    y: -20,
    lifespan: 9000,
    speedX: { min: -22, max: 12 },
    speedY: { min: 20, max: 46 },
    scale: { min: 0.5, max: 0.9 },
    alpha: { values: [0, 0.9, 0.9, 0] },
    rotate: { min: -180, max: 180 },
    frequency: 900,
    quantity: 1,
  });
  petals.setDepth(-30);
  made.push(petals);

  add(
    scene.add
      .image(0, 0, "vignette")
      .setOrigin(0, 0)
      .setDisplaySize(W, H)
      .setDepth(-20)
      .setAlpha(0.9),
  );

  return made;
}
