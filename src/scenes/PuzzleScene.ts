import Phaser from "phaser";
import { COLORS, bodyStyle, titleStyle } from "../ui/theme";
import { Button } from "../ui/Button";
import { PuzzleBoard } from "../puzzle/PuzzleBoard";
import { safeInsets } from "../util/safeArea";
import { bus, progression, shop } from "../game/services";
import { labelStyle } from "../ui/theme";
import { makePill } from "../ui/Panel";
import type { GardenObjectDef } from "../data/types";
import type { UIScene } from "./UIScene";
import { audio } from "../audio/AudioManager";

interface PuzzleInit {
  objectId: string;
}

/** Which "picture comes alive" style fits what is being restored. Add cases as
 *  new categories arrive (e.g. a bird → "flit"). */
function livingStyleFor(def: GardenObjectDef): "hop" | "bloom" {
  return def.category === "plant" ? "bloom" : "hop";
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
      // only the puzzle that actually creates the object gets the "picture comes alive" beat
      livingMove: vm.completed + 1 >= vm.required ? livingStyleFor(def) : undefined,
      onAssembled: () => this.hideChrome(),
      onSolved: () => this.onSolved(def.id, vm.completed, vm.required),
    });

    // "My Hints: X" + "Use Hint" — purchased hints (Shop), at most ONE per
    // puzzle. Same row/height the old free Hint button used, so the board and
    // loose-piece tray layout above it is unchanged.
    const pillW = 148;
    const btnW = 150;
    const rowW = pillW + 10 + btnW;
    const hintsPill = makePill(this, pillW, hintH - 8).setPosition(W / 2 - rowW / 2 + pillW / 2, hintCenterY);
    const hintsLabel = this.add.text(0, 0, "", { ...labelStyle(19), color: "#5e3f73" }).setOrigin(0.5);
    hintsPill.add(hintsLabel);
    const refreshHints = () => hintsLabel.setText(`My Hints: ${shop.hintsOwned}`);
    refreshHints();
    const offHints = bus.on("hints:changed", refreshHints);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, offHints);
    const hint = new Button(this, W / 2 + rowW / 2 - btnW / 2, hintCenterY, {
      width: btnW,
      height: hintH,
      label: "Use Hint",
      variant: "cream",
      fontSize: 21,
      onClick: () => {
        const board = this.board;
        if (!board) return;
        if (!board.hintAvailable) {
          this.flash("You've already used a hint on this puzzle.");
          return;
        }
        if (shop.hintsOwned <= 0) {
          this.flash("No hints left — get more in the Shop!");
          return;
        }
        // run the existing hint first; only spend a purchased hint if it helped
        if (board.hint()) {
          shop.useHint();
          hint.setEnabled(false).setLabel("Hint used");
        }
      },
    });
    this.backBtn = new Button(this, W - inset.right - 62, inset.top + 32, {
      width: 112,
      height: 48,
      label: "Back",
      variant: "cream",
      fontSize: 18,
      onClick: () => this.onBack(),
    });
    this.chrome = [hintsPill, hint, this.backBtn];
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
      w.__dgHintAvailable = () => this.board?.hintAvailable ?? null;
    }
  }

  /** Short message at the top of the puzzle screen (the HUD toast sits under
   *  this scene while a puzzle is up). Above the board — never over pieces. */
  private flash(text: string): void {
    audio.playSfx("ui_click");
    const inset = safeInsets();
    const t = this.add.container(this.scale.width / 2, inset.top + 92).setDepth(9000).setAlpha(0);
    const label = this.add.text(0, 0, text, { ...labelStyle(18), align: "center", wordWrap: { width: Math.min(460, this.scale.width - 60) } }).setOrigin(0.5);
    t.add([makePill(this, Math.min(this.scale.width - 32, label.width + 44), label.height + 22), label]);
    this.tweens.add({ targets: t, alpha: 1, duration: 200, hold: 1800, yoyo: true, onComplete: () => t.destroy() });
  }

  private onBack(): void {
    audio.playSfx("ui_click");
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
   * and held it. This just commits progression and hands off to the garden
   * reveal — a short fade, nothing that covers the picture during the hold.
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
