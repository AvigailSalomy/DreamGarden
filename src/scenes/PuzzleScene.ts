import Phaser from "phaser";
import { COLORS, bodyStyle, titleStyle } from "../ui/theme";
import { Button } from "../ui/Button";
import { PuzzleBoard } from "../puzzle/PuzzleBoard";
import { safeInsets } from "../util/safeArea";
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
  private chrome: Phaser.GameObjects.GameObject[] = []; // hint/back — hidden during the completion hold
  private closing = false;
  private backArmed = false;
  private backBtn?: Button;

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

    const W = this.scale.width;
    const H = this.scale.height;
    const inset = safeInsets();

    this.root = this.add.container(0, 0);

    const veil = this.add.rectangle(0, 0, W, H, 0x2a2036, 0.5).setOrigin(0, 0).setInteractive();
    const wash = this.add.graphics();
    wash.fillGradientStyle(COLORS.skyTop, COLORS.skyTop, COLORS.skyLow, COLORS.skyLow, 0.18);
    wash.fillRect(0, 0, W, H);
    this.root.add([veil, wash]);

    const puzzleIndex = vm.completed;
    const grid = def.puzzle.grids[puzzleIndex];
    // title clears the fixed HUD coin pill (top-left) and the Back button (top-right)
    const topY = inset.top + 82;

    const title = this.add
      .text(W / 2, topY, `Bring back ${def.name.split(" ")[0]}`, { ...titleStyle(22), color: "#fef6e8" })
      .setOrigin(0.5);
    const sub = this.add
      .text(
        W / 2,
        topY + 26,
        def.puzzles_required > 1
          ? `Puzzle ${puzzleIndex + 1} of ${def.puzzles_required}  ·  ${grid.cols}×${grid.rows}`
          : `Piece the picture together  ·  ${grid.cols}×${grid.rows}`,
        bodyStyle(15, "#e9dcc8"),
      )
      .setOrigin(0.5);
    this.root.add([title, sub]);

    const cells = grid.cols * grid.rows;
    // vertical budget between the header and the Hint button, split board / tray.
    // contentTop leaves room for the wood frame (~30px above the inner board) to
    // sit clear of the title + subtitle.
    const hintH = 58;
    const hintCenterY = H - inset.bottom - 30 - hintH / 2;
    const hintTopY = hintCenterY - hintH / 2;
    const contentTop = topY + 72;
    const vBudget = Math.max(220, hintTopY - 16 - contentTop);
    const boardSize = Phaser.Math.Clamp(
      Math.min(W - 60, vBudget * (cells > 4 ? 0.46 : 0.52)),
      210,
      cells > 4 ? 384 : 440,
    );
    const centerY = contentTop + boardSize / 2;

    this.board = new PuzzleBoard(this, {
      texKey: def.puzzle.image,
      grid,
      puzzleIndex,
      centerX: W / 2,
      centerY,
      boardSize,
      trayBottomY: hintTopY - 18,
      snapRadiusFactor: def.puzzle.snapRadiusFactor ?? 0.62,
      completeSfx: def.complete_sfx,
      onAssembled: () => this.hideChrome(),
      onSolved: () => this.onSolved(def.id, vm.completed, vm.required),
    });

    const hint = new Button(this, W / 2, hintCenterY, {
      width: 168,
      height: hintH,
      label: "Hint",
      variant: "cream",
      fontSize: 23,
      onClick: () => this.board?.hint(),
    });
    this.backBtn = new Button(this, W - inset.right - 62, inset.top + 32, {
      width: 112,
      height: 48,
      label: "Back",
      variant: "cream",
      fontSize: 18,
      onClick: () => this.onBack(),
    });
    this.chrome = [hint, this.backBtn];
    this.root.add(this.chrome);

    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 220 });
    this.cameras.main.fadeIn(220, 36, 26, 46);

    if (import.meta.env.DEV) {
      const w = window as unknown as Record<string, unknown>;
      w.__dgSolve = () => this.board?.forceSolve();
      w.__dgPuzzleDrag = () => this.board?.dragTargets() ?? [];
      w.__dgPuzzleGrid = () => `${grid.cols}x${grid.rows}`;
      w.__dgBoard = () => this.board?.state() ?? null;
      w.__dgTiles = () => this.board?.tilesDebug() ?? null;
    }
  }

  private onBack(): void {
    Sfx.tap();
    if (this.closing) return;
    if (!this.backArmed) {
      this.backArmed = true;
      this.backBtn?.setLabel("Leave?");
      this.time.delayedCall(2200, () => {
        this.backArmed = false;
        this.backBtn?.setLabel("Back");
      });
      return;
    }
    this.closeBack();
  }

  /**
   * The board has already: assembled the clean picture, played the object sound,
   * and held it for ~3 s. This just commits progression and hands off to the
   * garden reveal — a short fade, nothing that covers the picture during the hold.
   */
  private hideChrome(): void {
    this.chrome.forEach((o) =>
      this.tweens.add({ targets: o, alpha: 0, duration: 220, onComplete: () => {
        (o as unknown as { disableInteractive?: () => void }).disableInteractive?.();
      } }),
    );
  }

  private onSolved(objectId: string, completed: number, required: number): void {
    if (this.closing) return;
    this.closing = true;
    this.hideChrome();

    bus.emit("puzzle:solved", {
      objectId,
      puzzleIndex: completed,
      grid: progression.def(objectId)!.puzzle.grids[completed],
    });

    const willUnlock = completed + 1 >= required;
    const ui = this.scene.get("UI") as UIScene;
    if (willUnlock) ui.setRevealing(true);

    const { unlockedNow } = progression.recordPuzzleCompletion(objectId);

    const finish = () => {
      this.tweens.add({
        targets: this.root,
        alpha: 0,
        duration: 300,
        onComplete: () => {
          this.scene.resume("Garden");
          bus.emit("puzzle:closed", { objectId, solved: true, unlockedNow });
          this.scene.stop();
        },
      });
    };

    if (!unlockedNow) {
      ui.showToast(`Piece ${completed + 1} of ${required} complete!`);
      this.time.delayedCall(700, finish);
    } else {
      this.time.delayedCall(250, finish);
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
