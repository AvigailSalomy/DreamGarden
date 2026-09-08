import type Phaser from "phaser";
import type { CameraController } from "../world/CameraController";
import type { GardenObjectView } from "../world/GardenObjectView";
import type { RegionOverlay } from "../world/RegionOverlay";
import type { GardenObjectDef } from "../data/types";

/** What a reveal sequence is allowed to ask of the garden. Implemented by GardenScene. */
export interface RevealHost {
  /** The garden scene, exposed under a non-colliding name (Scene already owns `.scene`). */
  phaserScene: Phaser.Scene;
  camera: CameraController;
  spawnObjectView(def: GardenObjectDef, startHidden: boolean): GardenObjectView;
  getRegionOverlay(region: string): RegionOverlay | undefined;
  attachIdle(view: GardenObjectView, def: GardenObjectDef): void;
  playCoinGain(worldX: number, worldY: number, amount: number): Promise<void>;
  refreshTaskCard(): void;
  toast(text: string): void;
}

export interface EntrancePreset {
  run(host: RevealHost, view: GardenObjectView, dest: { x: number; y: number }): Promise<void>;
}
