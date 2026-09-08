import Phaser from "phaser";
import { DESIGN_HEIGHT, DESIGN_WIDTH } from "../game/config";
import { COLORS, FONT_FAMILY, bodyStyle, titleStyle } from "../ui/theme";
import { Button } from "../ui/Button";
import { PuzzleBoard } from "../puzzle/PuzzleBoard";
import { bus, progression } from "../game/services";
import { Sfx } from "../fx/Sfx";
import type { UIScene } from "./UIScene";

interface PuzzleInit {
  objectId: string;
}

export class PuzzleScene extends Phaser.Scene {
  private objectId!: string;
  private board?: PuzzleBoard;
  private root!: Phaser.GameObjects.Container;
  private closing = false;
  private backArmed = false;

  constructor() {
    super("Puzzle");
  }

  init(data: PuzzleInit): void {
    this.objectId = data.objectId;
    this.closing = false;
    this.backArmed = false;
  }

  create(): void {
    const def = progression.def(this.objectId);
    const vm = progression.taskVM();
    if (!def || !vm) {
      this.closeBack();
      return;
    }

    this.root = this.add.container(0, 0);

    // dim veil over the paused garden
    const veil = this.add
      .rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT, 0x241a2e, 0.55)
      .setOrigin(0, 0);
    const wash = this.add.graphics();
    wash.fillGradientStyle(COLORS.skyTop, COLORS.skyTop, COLORS.skyLow, COLORS.skyLow, 0.16);
    wash.fillRect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);
    this.root.add([veil, wash]);

    const puzzleIndex = vm.completed;
    const grid = def.puzzle.grids[puzzleIndex];

    const title = this.add
      .text(DESIGN_WIDTH / 2, 78, `Bring back ${def.name.split(" ")[0]}`, titleStyle(30))
      .setOrigin(0.5);
    const sub = this.add
      .text(
        DESIGN_WIDTH / 2,
        116,
        def.puzzles_required > 1
          ? `Puzzle ${puzzleIndex + 1} of ${def.puzzles_required}  ·  ${grid.cols}×${grid.rows}`
          : `Piece the picture together  ·  ${grid.cols}×${grid.rows}`,
        bodyStyle(18),
      )
      .setOrigin(0.5);
    this.root.add([title, sub]);

    const boardSize = Phaser.Math.Clamp(
      Math.min(DESIGN_WIDTH - 96, DESIGN_HEIGHT * 0.44),
      300,
      540,
    );

    this.board = new PuzzleBoard(this, {
      texKey: def.puzzle.image,
      grid,
      puzzleIndex,
      centerX: DESIGN_WIDTH / 2,
      centerY: 200 + boardSize / 2,
      boardSize,
      snapRadiusFactor: def.puzzle.snapRadiusFactor ?? 0.55,
      onSolved: () => this.onSolved(def.id, vm.completed, vm.required),
    });

    // hint + back
    const hint = new Button(this, DESIGN_WIDTH / 2, DESIGN_HEIGHT - 70, {
      width: 200,
      height: 78,
      label: "Hint",
      variant: "cream",
      fontSize: 26,
      onClick: () => this.board?.hint(),
    });
    const back = this.add
      .text(DESIGN_WIDTH - 30, 40, "‹ Back", {
        fontFamily: FONT_FAMILY,
        fontStyle: "600",
        fontSize: "22px",
        color: "#fef6e8",
      })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });
    back.on("pointerover", () => this.registry.set("pointerOnUI", true));
    back.on("pointerout", () => this.registry.set("pointerOnUI", false));
    back.on("pointerdown", () => this.onBack(back));
    this.root.add([hint, back]);

    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 220 });
    this.cameras.main.fadeIn(220, 36, 26, 46);
  }

  private onBack(label: Phaser.GameObjects.Text): void {
    Sfx.tap();
    if (!this.backArmed) {
      this.backArmed = true;
      label.setText("‹ Tap again to leave");
      this.time.delayedCall(2200, () => {
        this.backArmed = false;
        label.setText("‹ Back");
      });
      return;
    }
    this.closeBack();
  }

  private onSolved(objectId: string, completed: number, required: number): void {
    if (this.closing) return;
    this.closing = true;

    bus.emit("puzzle:solved", {
      objectId,
      puzzleIndex: completed,
      grid: progression.def(objectId)!.puzzle.grids[completed],
    });

    const willUnlock = completed + 1 >= required;
    const ui = this.scene.get("UI") as UIScene;
    if (willUnlock) ui.setRevealing(true); // defer coin animation to the reveal

    const { unlockedNow } = progression.recordPuzzleCompletion(objectId);

    const finish = () => {
      this.tweens.add({
        targets: this.root,
        alpha: 0,
        duration: 260,
        onComplete: () => {
          this.scene.resume("Garden");
          bus.emit("puzzle:closed", { objectId, solved: true, unlockedNow });
          this.scene.stop();
        },
      });
    };

    if (!unlockedNow) {
      ui.showToast(`Piece ${completed + 1} of ${required} complete!`);
      this.time.delayedCall(900, finish);
    } else {
      this.time.delayedCall(350, finish);
    }
  }

  private closeBack(): void {
    if (this.closing) return;
    this.closing = true;
    this.tweens.add({
      targets: this.root,
      alpha: 0,
      duration: 200,
      onComplete: () => {
        this.scene.resume("Garden");
        bus.emit("puzzle:closed", { objectId: this.objectId, solved: false, unlockedNow: false });
        this.scene.stop();
      },
    });
  }

  shutdown(): void {
    this.board?.destroy();
    this.board = undefined;
  }
}
