import Phaser from "phaser";
import { BootScene } from "../scenes/BootScene";
import { PreloadScene } from "../scenes/PreloadScene";
import { MenuScene } from "../scenes/MenuScene";
import { IntroScene } from "../scenes/IntroScene";
import { GardenScene } from "../scenes/GardenScene";
import { PuzzleScene } from "../scenes/PuzzleScene";
import { LetterScene } from "../scenes/LetterScene";
import { UIScene } from "../scenes/UIScene";
import { RequestsScene } from "../scenes/RequestsScene";
import { LevelGoalsScene } from "../scenes/LevelGoalsScene";
import { CarrotDashScene } from "../scenes/CarrotDashScene";
import { BunnyHeistScene } from "../scenes/BunnyHeistScene";
import { VisualSliceScene } from "../scenes/VisualSliceScene";

export function startGame(): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: "app",
    backgroundColor: "#c9b8e8",
    roundPixels: false,
    antialias: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
      width: "100%",
      height: "100%",
    },
    input: { activePointers: 4 },
    fps: { target: 60, min: 30 },
    scene: [
      BootScene,
      PreloadScene,
      MenuScene,
      IntroScene,
      GardenScene,
      PuzzleScene,
      UIScene,
      LetterScene, // on top of the HUD — the letter is a modal storybook beat
      RequestsScene,
      LevelGoalsScene,
      CarrotDashScene, // kept registered but no longer launched — see BunnyHeistScene
      BunnyHeistScene,
      VisualSliceScene, // isolated art-direction prototype, reached only via ?slice (see BootScene)
    ],
  });
}
