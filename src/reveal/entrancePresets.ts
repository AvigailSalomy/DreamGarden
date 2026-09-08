import Phaser from "phaser";
import type { EntrancePreset, RevealHost } from "./types";
import type { GardenObjectView } from "../world/GardenObjectView";
import { Sfx } from "../fx/Sfx";
import { dustRing, petalPuff, sparkleBurst } from "../fx/Particles";

function arcHop(
  host: RevealHost,
  view: GardenObjectView,
  from: { x: number; y: number },
  to: { x: number; y: number },
  height: number,
  duration: number,
): Promise<void> {
  view.faceLeft(to.x < from.x);
  const proxy = { t: 0 };
  return new Promise((resolve) => {
    host.phaserScene.tweens.add({
      targets: view.body,
      scaleY: 0.8,
      scaleX: 1.18,
      duration: 120,
      yoyo: true,
      ease: "Quad.easeOut",
    });
    host.phaserScene.tweens.add({
      targets: proxy,
      t: 1,
      delay: 90,
      duration,
      ease: "Sine.easeInOut",
      onUpdate: () => {
        view.setGroundPosition(
          Phaser.Math.Linear(from.x, to.x, proxy.t),
          Phaser.Math.Linear(from.y, to.y, proxy.t),
        );
        view.setHopHeight(Math.sin(Math.PI * proxy.t) * height);
        view.setDepthFromY();
      },
      onComplete: () => {
        view.setHopHeight(0);
        resolve();
      },
    });
  });
}

/** Animal: swoops in from the nearest screen edge in a few big arcs, squash-lands. */
const hopIn: EntrancePreset = {
  async run(host, view, dest) {
    const cam = host.phaserScene.cameras.main;
    const fromLeft = dest.x - cam.scrollX < cam.width / 2;
    const startX = fromLeft ? cam.scrollX - 90 : cam.scrollX + cam.width + 90;
    const startY = dest.y + 10;

    view.setGroundPosition(startX, startY);
    view.setDepthFromY();
    view.container.setAlpha(1);
    view.container.setVisible(true);

    Sfx.whoosh();
    const mid = { x: (startX + dest.x) / 2, y: dest.y - 30 };
    await arcHop(host, view, { x: startX, y: startY }, mid, 150, 460);
    await arcHop(host, view, mid, { x: (mid.x + dest.x) / 2, y: dest.y }, 120, 380);
    await arcHop(host, view, { x: (mid.x + dest.x) / 2, y: dest.y }, dest, 90, 340);

    Sfx.land();
    dustRing(host.phaserScene, dest.x, dest.y + 6);
    sparkleBurst(host.phaserScene, dest.x, dest.y - 40, 12, 44);
    host.phaserScene.cameras.main.shake(140, 0.004);
    await new Promise<void>((res) => {
      host.phaserScene.tweens.add({
        targets: view.body,
        scaleY: 0.7,
        scaleX: 1.24,
        duration: 110,
        yoyo: true,
        ease: "Quad.easeOut",
        onComplete: () => res(),
      });
    });
  },
};

/**
 * Songbird: flies in from above/outside the view along a smooth aerial path,
 * decelerates on approach, and lands on the perch with a chirp + feather sparkle.
 */
const flyInPerch: EntrancePreset = {
  async run(host, view, dest) {
    const scene = host.phaserScene;
    const cam = scene.cameras.main;

    // start high and off to one side of the perch
    const side = dest.x - cam.scrollX < cam.width / 2 ? -1 : 1;
    const start = { x: dest.x + side * 260, y: cam.scrollY - 140 };
    // a control point that pulls the path into a graceful swoop
    const ctrl = { x: dest.x - side * 120, y: dest.y - 220 };

    view.setGroundPosition(start.x, start.y);
    view.setHopHeight(0);
    view.faceLeft(side > 0);
    view.container.setVisible(true).setAlpha(1);
    view.setDepthFromY();

    Sfx.whoosh();

    // draw the aerial path once so the flight reads as a deliberate route
    const trail = scene.add.graphics().setDepth(4);
    const quad = (a: number, b: number, c: number, t: number) =>
      (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;

    await new Promise<void>((resolve) => {
      const p = { t: 0 };
      scene.tweens.add({
        targets: p,
        t: 1,
        duration: 1250,
        ease: "Sine.easeInOut",
        onUpdate: () => {
          const u = p.t;
          const x = quad(start.x, ctrl.x, dest.x, u);
          const y = quad(start.y, ctrl.y, dest.y, u);
          view.setGroundPosition(x, y);
          // subtle wingbeat
          view.body.setScale(1 + Math.sin(u * Math.PI * 9) * 0.04, 1 - Math.sin(u * Math.PI * 9) * 0.04);
          view.setDepthFromY();
          if (u > 0.05) {
            trail.lineStyle(3, 0xfff2c4, 0.35 * (1 - u));
            const px = quad(start.x, ctrl.x, dest.x, Math.max(0, u - 0.02));
            const py = quad(start.y, ctrl.y, dest.y, Math.max(0, u - 0.02));
            trail.lineBetween(px, py, x, y);
          }
        },
        onComplete: () => resolve(),
      });
    });

    // land
    Sfx.land();
    view.body.setScale(1);
    dustRing(scene, dest.x, dest.y + 4);
    sparkleBurst(scene, dest.x, dest.y - 30, 10, 34);
    petalPuff(scene, dest.x, dest.y - 24, 6); // stray feathers
    await new Promise<void>((res) => {
      scene.tweens.add({
        targets: view.body,
        scaleY: 0.82,
        scaleX: 1.16,
        duration: 100,
        yoyo: true,
        ease: "Quad.easeOut",
        onComplete: () => res(),
      });
    });
    Sfx.sparkle();
    scene.tweens.add({ targets: trail, alpha: 0, duration: 500, onComplete: () => trail.destroy() });
  },
};

/** Plant: grows up from the dry soil with an outward wave of blooming sparkles. */
const bloomWave: EntrancePreset = {
  async run(host, view, dest) {
    const scene = host.phaserScene;
    view.setGroundPosition(dest.x, dest.y);
    view.setDepthFromY();
    view.container.setScale(0.02).setAlpha(1).setVisible(true);
    Sfx.sparkle();

    // the growth
    const grow = new Promise<void>((res) => {
      scene.tweens.add({
        targets: view.container,
        scale: view.baseScaleValue,
        duration: 760,
        ease: "Back.easeOut",
        onComplete: () => res(),
      });
    });

    // the wave — rings of sparkle + petal expanding from the bed
    for (let ring = 0; ring < 3; ring++) {
      scene.time.delayedCall(ring * 170, () => {
        sparkleBurst(scene, dest.x, dest.y - 20, 10, 40 + ring * 46);
      });
    }
    scene.time.delayedCall(260, () => petalPuff(scene, dest.x, dest.y - 30, 14));

    await grow;
    // settle bob
    await new Promise<void>((res) => {
      scene.tweens.add({
        targets: view.container,
        scaleY: view.baseScaleValue * 1.05,
        duration: 140,
        yoyo: true,
        ease: "Sine.easeInOut",
        onComplete: () => res(),
      });
    });
  },
};

/** Generic pop-in for objects that don't have a bespoke entrance yet. */
const scaleBloom: EntrancePreset = {
  async run(host, view, dest) {
    view.setGroundPosition(dest.x, dest.y);
    view.setDepthFromY();
    view.container.setScale(0.01);
    view.container.setVisible(true).setAlpha(1);
    Sfx.sparkle();
    await new Promise<void>((res) => {
      host.phaserScene.tweens.add({
        targets: view.container,
        scale: view.baseScaleValue,
        duration: 620,
        ease: "Back.easeOut",
        onComplete: () => res(),
      });
    });
    sparkleBurst(host.phaserScene, dest.x, dest.y - 30, 10, 40);
  },
};

export const ENTRANCE_PRESETS: Record<string, EntrancePreset> = {
  hop_in: hopIn,
  fly_in_perch: flyInPerch,
  bloom_wave: bloomWave,
  scale_bloom: scaleBloom,
  drop_settle: scaleBloom,
  ripple_in: scaleBloom,
  grow_up: scaleBloom,
};
