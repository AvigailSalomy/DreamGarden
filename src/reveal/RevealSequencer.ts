import Phaser from "phaser";
import type { RevealHost } from "./types";
import type { GardenObjectDef } from "../data/types";
import { ENTRANCE_PRESETS } from "./entrancePresets";
import { gatherGlow, sparkleBurst } from "../fx/Particles";
import { Sfx } from "../fx/Sfx";

const wait = (scene: Phaser.Scene, ms: number) =>
  new Promise<void>((res) => scene.time.delayedCall(ms, res));

/**
 * The hero moment. Logical unlock + coins are ALREADY saved before this runs, so if
 * the app closes mid-animation the object is simply present on next launch.
 * A single `finally` force-sets the end state no matter where it was interrupted.
 */
export class RevealSequencer {
  private running = false;

  constructor(private host: RevealHost) {}

  get isRunning(): boolean {
    return this.running;
  }

  async play(def: GardenObjectDef): Promise<void> {
    if (this.running) return;
    this.running = true;
    const { host } = this;
    const scene = host.phaserScene;
    const dest = def.garden_position;
    let view: ReturnType<RevealHost["spawnObjectView"]> | null = null;

    host.camera.disable();

    try {
      // 1. magic gathers at the destination
      const glow = await gatherGlow(scene, dest.x, dest.y - 30, 650);

      // 2. camera eases in to frame the spot (settle to zoom 1 whatever the player left it at)
      await host.camera.focusOn(dest.x, dest.y - 60, 850, 1);
      await wait(scene, 120);

      // 3. the object arrives — into exactly the silhouette's footprint
      Sfx.fanfare();
      view = host.spawnObjectView(def, true);
      const preset = ENTRANCE_PRESETS[def.reveal_animation] ?? ENTRANCE_PRESETS.hop_in;
      await preset.run(host, view, dest);
      host.fadeTaskGhost(); // shadow -> exact object, same spot
      scene.tweens.add({ targets: glow, alpha: 0, scale: 0.4, duration: 500 });

      // 4. the garden reacts
      const region = host.getRegionOverlay(def.region);
      sparkleBurst(scene, dest.x, dest.y - 40, 14, 60);
      await (region?.restore() ?? wait(scene, 300));

      // 5. coins fly to the HUD
      await host.playCoinGain(dest.x, dest.y - 40, def.reward_coins);

      // 6. life begins
      host.attachIdle(view, def);
      if (def.unlock_toast) host.toast(def.unlock_toast);

      await wait(scene, 250);
    } catch (err) {
      console.error("[RevealSequencer] interrupted", err);
    } finally {
      // presentation-independent end state
      const region = host.getRegionOverlay(def.region);
      if (region && !region.restored) region.applyRestoredInstant();
      if (view) {
        view.setGroundPosition(dest.x, dest.y);
        view.setHopHeight(0);
        view.container.setScale(view.baseScaleValue).setAlpha(1).setVisible(true);
        view.setDepthFromY();
        host.attachIdle(view, def);
      }
      host.refreshTaskCard();
      host.camera.enable();
      this.running = false;
    }
  }
}
