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
import { HabitatRequestScene } from "../scenes/HabitatRequestScene";
import { ShopScene } from "../scenes/ShopScene";
import { LevelGoalsScene } from "../scenes/LevelGoalsScene";
import { CarrotDashScene } from "../scenes/CarrotDashScene";
import { BunnyHeistScene } from "../scenes/BunnyHeistScene";
import { MazeIntroScene } from "../scenes/MazeIntroScene";
import { GardenMazeScene } from "../scenes/GardenMazeScene";
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
      HabitatRequestScene, // the animal's post-rescue "A friend needs help!" screen
      ShopScene, // Dream Garden Shop: decor/accessories/Mystery Gift (personalization only)
      LevelGoalsScene,
      CarrotDashScene, // kept registered but no longer launched — see BunnyHeistScene
      BunnyHeistScene,
      MazeIntroScene, // "Carrot Hunt" style pre-maze card, launched from Get / Play
      GardenMazeScene, // the reusable Garden Maze resource-acquisition minigame
      VisualSliceScene, // isolated art-direction prototype, reached only via ?slice (see BootScene)
    ],
  });
}
