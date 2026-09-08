import Phaser from "phaser";
import { DESIGN_HEIGHT, DESIGN_WIDTH } from "./config";
import { BootScene } from "../scenes/BootScene";
import { PreloadScene } from "../scenes/PreloadScene";
import { GardenScene } from "../scenes/GardenScene";
import { PuzzleScene } from "../scenes/PuzzleScene";
import { UIScene } from "../scenes/UIScene";

export function startGame(): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: "app",
    backgroundColor: "#1c1526",
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    roundPixels: false,
    antialias: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    input: { activePointers: 3 },
    fps: { target: 60, min: 30 },
    scene: [BootScene, PreloadScene, GardenScene, PuzzleScene, UIScene],
  });
}
