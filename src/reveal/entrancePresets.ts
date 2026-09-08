import Phaser from "phaser";
import type { EntrancePreset, RevealHost } from "./types";
import type { GardenObjectView } from "../world/GardenObjectView";
import { Sfx } from "../fx/Sfx";
import { dustRing, sparkleBurst } from "../fx/Particles";

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

/** Plant: pops up from nothing with a bloom. (Ready for later objects.) */
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
  scale_bloom: scaleBloom,
  drop_settle: scaleBloom,
  ripple_in: scaleBloom,
  grow_up: scaleBloom,
};
