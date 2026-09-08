import Phaser from "phaser";
import { COLORS, RADIUS } from "../ui/theme";
import { mulberry32, hashStr } from "../core/rng";
import { nearestEmptyCell, shuffle, sliceGrid, trayLayout } from "./slice";
import type { Cell, GridSize } from "./slice";
import { PuzzleTile } from "./PuzzleTile";
import { petalPuff, sparkleBurst } from "../fx/Particles";
import { Sfx } from "../fx/Sfx";

export interface PuzzleBoardOpts {
  texKey: string;
  grid: GridSize;
  puzzleIndex: number;
  centerX: number;
  centerY: number;
  boardSize: number;
  snapRadiusFactor: number;
  onSolved: () => void;
}

/** Builds + runs one drag-and-snap picture puzzle. */
export class PuzzleBoard {
  private scene: Phaser.Scene;
  private o: PuzzleBoardOpts;
  private cells: Cell[] = [];
  private tiles: PuzzleTile[] = [];
  private placed = 0;
  private cellW: number;
  private cellH: number;
  private ghost!: Phaser.GameObjects.Image;
  private solvedImg!: Phaser.GameObjects.Image;
  private hintG!: Phaser.GameObjects.Graphics;
  private done = false;

  constructor(scene: Phaser.Scene, opts: PuzzleBoardOpts) {
    this.scene = scene;
    this.o = opts;
    const { grid, boardSize } = opts;
    const gap = 8;
    this.cellW = (boardSize - gap * (grid.cols - 1)) / grid.cols;
    this.cellH = (boardSize - gap * (grid.rows - 1)) / grid.rows;

    this.buildFrame();
    this.registerFrames();
    this.buildCells(gap);
    this.buildTiles();
  }

  private buildFrame(): void {
    const { centerX, centerY, boardSize } = this.o;
    const pad = 24;
    const w = boardSize + pad * 2;
    const h = boardSize + pad * 2;
    const g = this.scene.add.graphics().setDepth(2);
    g.fillStyle(COLORS.shadow, 0.28);
    g.fillRoundedRect(centerX - w / 2 - 4, centerY - h / 2 + 10, w + 8, h + 12, RADIUS.panel + 6);
    g.fillStyle(COLORS.woodDark, 1);
    g.fillRoundedRect(centerX - w / 2 - 6, centerY - h / 2 - 6, w + 12, h + 12, RADIUS.panel + 8);
    g.fillStyle(COLORS.wood, 1);
    g.fillRoundedRect(centerX - w / 2, centerY - h / 2, w, h, RADIUS.panel + 4);
    g.fillStyle(0x9a7048, 1);
    g.fillRoundedRect(centerX - boardSize / 2 - 6, centerY - boardSize / 2 - 6, boardSize + 12, boardSize + 12, RADIUS.panel);

    this.ghost = this.scene.add
      .image(centerX, centerY, this.o.texKey)
      .setDisplaySize(this.o.boardSize, this.o.boardSize)
      .setAlpha(0.14)
      .setDepth(3);

    this.hintG = this.scene.add.graphics().setDepth(60);
  }

  private frameName(i: number): string {
    return `p_${this.o.grid.cols}x${this.o.grid.rows}_${i}`;
  }

  private registerFrames(): void {
    const tex = this.scene.textures.get(this.o.texKey);
    const src = tex.getSourceImage() as { width: number; height: number };
    const rects = sliceGrid(src.width, src.height, this.o.grid);
    for (const r of rects) {
      const name = this.frameName(r.index);
      if (!tex.has(name)) tex.add(name, 0, r.x, r.y, r.w, r.h);
    }
  }

  private buildCells(gap: number): void {
    const { grid, centerX, centerY, boardSize } = this.o;
    const left = centerX - boardSize / 2 + this.cellW / 2;
    const top = centerY - boardSize / 2 + this.cellH / 2;
    const slot = this.scene.add.graphics().setDepth(3);
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const index = row * grid.cols + col;
        const x = left + col * (this.cellW + gap);
        const y = top + row * (this.cellH + gap);
        this.cells.push({ index, x, y, filled: false });
        slot.fillStyle(0x87613f, 0.55);
        slot.fillRoundedRect(x - this.cellW / 2, y - this.cellH / 2, this.cellW, this.cellH, RADIUS.tile);
      }
    }
  }

  private buildTiles(): void {
    const { grid, centerX, centerY, boardSize } = this.o;
    const total = grid.cols * grid.rows;
    const seed = hashStr(`${this.o.texKey}:${this.o.puzzleIndex}:${Date.now() >> 13}`);
    const rng = mulberry32(seed);
    const order = shuffle(
      Array.from({ length: total }, (_, i) => i),
      rng,
    );

    const trayScale = Phaser.Math.Clamp(
      (this.scene.scale.width - 60) / (Math.min(total, 4) * (this.cellW + 12)),
      0.42,
      0.7,
    );
    const trayItemW = this.cellW * trayScale + 12;
    const trayItemH = this.cellH * trayScale + 12;
    // Small tutorial puzzles (<=4) read best as a tidy 2-wide tray, not 3+1.
    const trayMaxW =
      total <= 4 ? trayItemW * 2 + 24 : this.scene.scale.width - 56;
    const slots = trayLayout(total, trayItemW, trayItemH, 6, trayMaxW);
    const trayTop = centerY + boardSize / 2 + 78;

    for (let i = 0; i < order.length; i++) {
      const solutionIndex = order[i];
      const tile = new PuzzleTile(
        this.scene,
        this.o.texKey,
        this.frameName(solutionIndex),
        solutionIndex,
        this.cellW,
        this.cellH,
        trayScale,
      );
      tile.setHome(centerX + slots[i].x, trayTop + slots[i].y);
      tile.setDepth(10);
      tile.on("dragend", () => this.onDrop(tile));
      this.tiles.push(tile);
    }
  }

  private onDrop(tile: PuzzleTile): void {
    if (tile.placed || this.done) return;
    const near = nearestEmptyCell(tile.x, tile.y, this.cells);
    const snapRadius = this.cellW * this.o.snapRadiusFactor;
    if (near && near.cell.index === tile.solutionIndex && near.dist <= snapRadius) {
      near.cell.filled = true;
      tile.lockInto(near.cell.x, near.cell.y);
      sparkleBurst(this.scene, near.cell.x, near.cell.y, 5, 20);
      this.placed++;
      if (this.placed >= this.cells.length) this.solve();
    } else {
      tile.returnHome();
    }
  }

  hint(): void {
    const t = this.tiles.find((x) => !x.placed);
    if (!t) return;
    const cell = this.cells.find((c) => c.index === t.solutionIndex);
    if (!cell) return;
    Sfx.sparkle();
    this.hintG.clear();
    this.hintG.lineStyle(5, COLORS.gold, 1);
    this.hintG.strokeRoundedRect(
      cell.x - this.cellW / 2,
      cell.y - this.cellH / 2,
      this.cellW,
      this.cellH,
      RADIUS.tile,
    );
    this.hintG.setAlpha(0);
    this.scene.tweens.add({
      targets: this.hintG,
      alpha: 1,
      duration: 220,
      yoyo: true,
      repeat: 2,
      onComplete: () => this.hintG.clear(),
    });
  }

  private solve(): void {
    this.done = true;
    const { centerX, centerY, boardSize } = this.o;
    this.scene.tweens.add({ targets: this.ghost, alpha: 0, duration: 200 });
    this.tiles.forEach((t) => t.fadeBorder());

    this.solvedImg = this.scene.add
      .image(centerX, centerY, this.o.texKey)
      .setDisplaySize(boardSize, boardSize)
      .setDepth(30)
      .setAlpha(0);
    this.scene.tweens.add({ targets: this.solvedImg, alpha: 1, duration: 240 });

    const glow = this.scene.add
      .image(centerX, centerY, "glow")
      .setDepth(29)
      .setScale(1.6)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: glow,
      alpha: 0.9,
      scale: 2.2,
      duration: 300,
      yoyo: true,
      onComplete: () => glow.destroy(),
    });
    this.scene.tweens.add({
      targets: this.solvedImg,
      scaleX: this.solvedImg.scaleX * 1.04,
      scaleY: this.solvedImg.scaleY * 1.04,
      duration: 220,
      yoyo: true,
      ease: "Sine.easeInOut",
    });

    Sfx.complete();
    sparkleBurst(this.scene, centerX, centerY, 26, boardSize / 2);
    petalPuff(this.scene, centerX, centerY - 30, 16);
    this.scene.cameras.main.flash(220, 255, 253, 245);

    this.scene.time.delayedCall(950, () => this.o.onSolved());
  }

  /** Dev/demo helper: snap every remaining tile home and trigger the solve. */
  forceSolve(): void {
    if (this.done) return;
    for (const tile of this.tiles) {
      if (tile.placed) continue;
      const cell = this.cells.find((c) => c.index === tile.solutionIndex);
      if (!cell) continue;
      cell.filled = true;
      tile.lockInto(cell.x, cell.y);
      this.placed++;
    }
    if (this.placed >= this.cells.length) this.solve();
  }

  destroy(): void {
    this.tiles.forEach((t) => t.destroy());
  }
}
