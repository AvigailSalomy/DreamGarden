import Phaser from 'phaser';
import { BootScene } from '../scenes/BootScene';
import { PreloadScene } from '../scenes/PreloadScene';
import { MenuScene } from '../scenes/MenuScene';
import { IntroScene } from '../scenes/IntroScene';
import { GardenScene } from '../scenes/GardenScene';
import { PuzzleScene } from '../scenes/PuzzleScene';
import { LetterScene } from '../scenes/LetterScene';
import { UIScene } from '../scenes/UIScene';
import { RequestsScene } from '../scenes/RequestsScene';
import { LevelGoalsScene } from '../scenes/LevelGoalsScene';
import { CarrotDashScene } from '../scenes/CarrotDashScene';
import { FrostedValleyScene } from '../scenes/FrostedValleyScene';
import { GardenMazeScene } from '../scenes/GardenMazeScene';
import { FrostedRequestScene } from '../scenes/FrostedRequestScene';
import { FrostedLetterScene } from '../scenes/FrostedLetterScene';
import { FrostedShopScene } from '../scenes/FrostedShopScene';
import { FrostedPuzzleScene } from '../scenes/FrostedPuzzleScene';

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
    parent: 'app',
    backgroundColor: '#c9b8e8',
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
      LevelGoalsScene,
      CarrotDashScene,
      FrostedValleyScene,
      GardenMazeScene,
      FrostedRequestScene,
      FrostedLetterScene,
      FrostedShopScene,
      FrostedPuzzleScene,
    ],
  });
}
