import Phaser from "phaser";
import { COLORS, RADIUS } from "../ui/theme";
import { Sfx } from "../fx/Sfx";

/** One draggable picture tile. Rectangular underneath, dressed to read as a real piece. */
export class PuzzleTile extends Phaser.GameObjects.Container {
  readonly solutionIndex: number;
  homeX = 0;
  homeY = 0;
  placed = false;

  private pic: Phaser.GameObjects.Image;
  private border: Phaser.GameObjects.Graphics;
  private shadow: Phaser.GameObjects.Image;
  private trayScale: number;
  private boardScale: number;

  constructor(
    scene: Phaser.Scene,
    texKey: string,
    frame: string,
    solutionIndex: number,
    cellW: number,
    cellH: number,
    trayScale: number,
  ) {
    super(scene, 0, 0);
    this.solutionIndex = solutionIndex;
    this.trayScale = trayScale;
    this.boardScale = 1;

    this.shadow = scene.add
      .image(0, 10, "shadow")
      .setDisplaySize(cellW * 1.05, cellW * 0.4)
      .setAlpha(0);
    this.pic = scene.add.image(0, 0, texKey, frame).setDisplaySize(cellW, cellH);
    this.border = scene.add.graphics();
    this.border.lineStyle(4, COLORS.panel, 0.95);
    this.border.strokeRoundedRect(-cellW / 2, -cellH / 2, cellW, cellH, RADIUS.tile);
    this.border.lineStyle(2, COLORS.goldLight, 0.5);
    this.border.strokeRoundedRect(-cellW / 2 + 4, -cellH / 2 + 4, cellW - 8, cellH - 8, RADIUS.tile - 3);

    this.add([this.shadow, this.pic, this.border]);
    this.setSize(cellW, cellH);
    this.setScale(trayScale);
    this.setInteractive(
      new Phaser.Geom.Rectangle(-cellW / 2, -cellH / 2, cellW, cellH),
      Phaser.Geom.Rectangle.Contains,
    );
    scene.input.setDraggable(this);
    scene.add.existing(this);

    this.on("dragstart", this.onDragStart, this);
    this.on("drag", this.onDrag, this);
  }

  setHome(x: number, y: number): void {
    this.homeX = x;
    this.homeY = y;
    this.setPosition(x, y);
  }

  private onDragStart(): void {
    if (this.placed) return;
    Sfx.unlock();
    Sfx.pickup();
    this.scene.children.bringToTop(this);
    this.setDepth(500);
    this.scene.tweens.add({
      targets: this,
      scaleX: this.boardScale * 1.06,
      scaleY: this.boardScale * 1.06,
      duration: 130,
      ease: "Back.easeOut",
    });
    this.scene.tweens.add({ targets: this.shadow, alpha: 0.35, duration: 130 });
  }

  private onDrag(_p: Phaser.Input.Pointer, dragX: number, dragY: number): void {
    if (this.placed) return;
    this.setPosition(dragX, dragY);
  }

  /** Called by the board on a wrong / short drop. */
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

  /** Called by the board on a correct drop. */
  lockInto(cx: number, cy: number): void {
    this.placed = true;
    this.disableInteractive();
    Sfx.snap();
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
