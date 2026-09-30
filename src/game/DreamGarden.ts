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
import { FrostedValleyScene } from "../scenes/FrostedValleyScene";
import { FrostedMenuScene } from "../scenes/FrostedMenuScene";
import { FrostedMazeScene } from "../scenes/FrostedMazeScene";
import { FrostedRequestScene } from "../scenes/FrostedRequestScene";
import { FrostedLetterScene } from "../scenes/FrostedLetterScene";
import { FrostedShopScene } from "../scenes/FrostedShopScene";
import { FrostedPuzzleScene } from "../scenes/FrostedPuzzleScene";

/**
 * Phaser Text recycles its canvases through a shared CanvasPool. A right-to-
 * left Text (the Hebrew story notes) sets `canvas.dir = 'rtl'` and attaches
 * the canvas to the DOM, and nothing resets that when the canvas is later
 * reused — `initRTL()` simply returns for left-to-right text. Any English Text
 * that then gets one of those canvases draws off its own edge (a missing
 * subtitle, "0" instead of "0 / 12 pieces"). Resetting the direction for LTR
 * text closes that leak for every scene at once; RTL text is untouched.
 */
function fixPooledRtlCanvases(): void {
  const proto = Phaser.GameObjects.Text.prototype as unknown as {
    initRTL: (this: Phaser.GameObjects.Text) => void;
    __ltrReset?: boolean;
  };
  if (proto.__ltrReset) return;
  proto.__ltrReset = true;
  const original = proto.initRTL;
  proto.initRTL = function (this: Phaser.GameObjects.Text) {
    if (!this.style.rtl && this.canvas) {
      this.canvas.dir = 'ltr';
      this.context.direction = 'ltr';
    }
    original.call(this);
  };
}

export function startGame(): Phaser.Game {
  fixPooledRtlCanvases();
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent: "app",
    // grass green, not the old lavender: wherever no layer is drawn (e.g. past
    // the garden's edge on a very wide screen) must never read as a flat panel
    backgroundColor: "#9cbf7a",
    roundPixels: false,
    antialias: true,
    width: 1920,
    height: 1080,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 1920,
      height: 1080,
      parent: 'app',
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
      LetterScene,
      RequestsScene,
      HabitatRequestScene, // the animal's post-rescue "A friend needs help!" screen
      ShopScene, // Dream Garden Shop: decor/accessories/Mystery Gift (personalization only)
      LevelGoalsScene,
      CarrotDashScene, // kept registered but no longer launched — see BunnyHeistScene
      BunnyHeistScene,
      MazeIntroScene, // "Carrot Hunt" style pre-maze card, launched from Get / Play
      GardenMazeScene, // the reusable Garden Maze resource-acquisition minigame
      VisualSliceScene, // isolated art-direction prototype, reached only via ?slice (see BootScene)
      // ---- Frosted Valley (World 2) ----
      FrostedValleyScene,
      FrostedMenuScene,
      FrostedMazeScene, // Frosted Valley's own maze (was a second "GardenMaze")
      FrostedRequestScene,
      FrostedLetterScene,
      FrostedShopScene,
      FrostedPuzzleScene,
    ],
  });
}
