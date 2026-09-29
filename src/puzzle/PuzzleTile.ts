import Phaser from "phaser";
import { COLORS } from "../ui/theme";
import { MIN_HIT } from "../ui/hit";
import { Sfx } from "../fx/Sfx";
import { pathToPoints } from "./jigsaw";
import { audio } from "../audio/AudioManager";

export interface PuzzleTileOpts {
  /** Baked canvas texture of this jigsaw piece (already clipped to its cut shape). */
  pieceKey: string;
  solutionIndex: number;
  /** Display size of the baked frame at board scale. */
  frameW: number;
  frameH: number;
  /** Base-cell size at board scale (for squash reference). */
  cellW: number;
  cellH: number;
  /** Board-scale path for the outline stroke, centred on (0,0). Empty = rounded rect. */
  pathStr: string;
  trayScale: number;
}

/**
 * One draggable jigsaw piece. The visible art is an irregular cut, but the HIT
 * AREA is a generous rectangle around the whole frame (+ margin), so it is easy
 * to grab anywhere over the piece and a little outside it too.
 */
export class PuzzleTile extends Phaser.GameObjects.Container {
  readonly solutionIndex: number;
  homeX = 0;
  homeY = 0;
  placed = false;

  private pic: Phaser.GameObjects.Image;
  private border: Phaser.GameObjects.Graphics;
  private shadow: Phaser.GameObjects.Image;
  private trayScale: number;
  private boardScale = 1;

  constructor(scene: Phaser.Scene, o: PuzzleTileOpts) {
    super(scene, 0, 0);
    this.solutionIndex = o.solutionIndex;
    this.trayScale = o.trayScale;

    this.shadow = scene.add
      .image(0, 12, "shadow")
      .setDisplaySize(o.frameW * 0.92, o.frameW * 0.34)
      .setAlpha(0);

    this.pic = scene.add.image(0, 0, o.pieceKey).setDisplaySize(o.frameW, o.frameH);

    this.border = scene.add.graphics();
    if (o.pathStr) {
      this.border.lineStyle(4, COLORS.panel, 0.9);
      this.border.strokePoints(pathToPoints(o.pathStr), true);
      this.border.lineStyle(2, COLORS.goldLight, 0.4);
      this.border.strokePoints(pathToPoints(o.pathStr), true);
    }

    this.add([this.shadow, this.pic, this.border]);

    // generous rectangular hit area around the whole frame + a tolerance margin.
    // NOTE: on a Container, pointWithinHitArea() offsets the local point by
    // displayOrigin (= size * 0.5), so the hit Rectangle must start at (0,0) — not
    // (-w/2,-h/2) — for it to sit centred on the piece.
    const pad = 14;
    const hw = Math.max(MIN_HIT, o.frameW + pad * 2);
    const hh = Math.max(MIN_HIT, o.frameH + pad * 2);
    this.setSize(hw, hh);
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, hw, hh),
      Phaser.Geom.Rectangle.Contains,
    );
    if (this.input) this.input.cursor = "grab";
    scene.input.setDraggable(this);
    scene.add.existing(this);
    this.setScale(o.trayScale);

    this.on("dragstart", this.onDragStart, this);
    this.on("drag", this.onDrag, this);
    this.on("dragend", this.onDragEnd, this);
  }

  setHome(x: number, y: number): void {
    this.homeX = x;
    this.homeY = y;
    this.setPosition(x, y);
  }

  private onDragStart(): void {
    if (this.placed) return;
    this.scene.registry.set("pointerOnUI", true);
    audio.unlock();
    Sfx.pickup();
    this.scene.children.bringToTop(this);
    this.setDepth(500);
    this.scene.tweens.add({
      targets: this,
      scaleX: this.boardScale * 1.08,
      scaleY: this.boardScale * 1.08,
      duration: 130,
      ease: "Back.easeOut",
    });
    this.scene.tweens.add({ targets: this.shadow, alpha: 0.34, duration: 130 });
  }

  private onDrag(_p: Phaser.Input.Pointer, dragX: number, dragY: number): void {
    if (this.placed) return;
    this.setPosition(dragX, dragY); // stays attached even if the pointer leaves the sprite
  }

  private onDragEnd(): void {
    this.scene.registry.set("pointerOnUI", false);
  }

  /** Wrong / short drop — glide home. */
  returnHome(): void {
    Sfx.returnTile();
    this.scene.tweens.add({ targets: this.shadow, alpha: 0, duration: 150 });
    this.scene.tweens.add({
      targets: this,
      x: this.homeX,
      y: this.homeY,
      scaleX: this.trayScale,
      scaleY: this.trayScale,
      duration: 420,
      ease: "Elastic.easeOut",
      onComplete: () => this.setDepth(10),
    });
  }

  /** Correct drop — settle into the cell and lock. */
  lockInto(cx: number, cy: number): void {
    this.placed = true;
    this.disableInteractive();
    audio.playSfx("puzzle_action");
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(12);
    this.scene.tweens.add({ targets: this.shadow, alpha: 0, duration: 120 });
    this.scene.tweens.add({
      targets: this,
      x: cx,
      y: cy,
      scaleX: this.boardScale,
      scaleY: this.boardScale,
      duration: 240,
      ease: "Back.easeOut",
      onComplete: () => {
        this.setDepth(20);
        this.scene.tweens.add({
          targets: this,
          scaleX: this.boardScale * 1.08,
          scaleY: this.boardScale * 1.08,
          duration: 100,
          yoyo: true,
          ease: "Sine.easeInOut",
        });
      },
    });
  }

  fadeBorder(): void {
    this.scene.tweens.add({ targets: this.border, alpha: 0, duration: 260 });
  }
}

