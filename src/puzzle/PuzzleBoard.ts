import Phaser from "phaser";
import { COLORS, RADIUS } from "../ui/theme";
import { mulberry32, hashStr } from "../core/rng";
import { nearestEmptyCell, shuffle, trayLayout } from "./slice";
import type { Cell, GridSize } from "./slice";
import { edgeGrid, piecePath } from "./jigsaw";
import type { PieceEdges } from "./jigsaw";
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
  /** Screen Y the scattered piece tray must stay above (e.g. the Hint button top). */
  trayBottomY?: number;
  snapRadiusFactor: number;
  /** Sfx method name to play during the finished-picture hold (rabbitChirp / birdSong / bloomChime). */
  completeSfx?: string;
  /** Called when the clean picture is on screen and the ~3 s hold begins. */
  onAssembled?: () => void;
  onSolved: () => void;
}

/** How long the completed picture is held before handing off to the garden reveal. */
const HOLD_MS = 3000;

/** Builds + runs one drag-and-snap picture puzzle with irregular jigsaw pieces. */
export class PuzzleBoard {
  private scene: Phaser.Scene;
  private o: PuzzleBoardOpts;
  private cells: Cell[] = [];
  private tiles: PuzzleTile[] = [];
  private placed = 0;
  private cellW: number;
  private cellH: number;
  private ghost!: Phaser.GameObjects.Image;
  private hintG!: Phaser.GameObjects.Graphics;
  private edges: PieceEdges[] = [];
  private done = false;

  private frameScale = 1;
  private frameW = 0;
  private frameH = 0;
  private tabBoard = 0;

  constructor(scene: Phaser.Scene, opts: PuzzleBoardOpts) {
    this.scene = scene;
    this.o = opts;
    const { grid, boardSize } = opts;
    // jigsaw pieces interlock — cells are adjacent (no gap)
    this.cellW = boardSize / grid.cols;
    this.cellH = boardSize / grid.rows;

    this.buildFrame();
    this.bakePieces();
    this.buildCells();
    this.buildTiles();
  }

  /* ---------------- build ---------------- */

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
      .setDisplaySize(boardSize, boardSize)
      .setAlpha(0.13)
      .setDepth(3);

    this.hintG = this.scene.add.graphics().setDepth(60);
  }

  private jkey(i: number): string {
    return `jig_${this.o.texKey}_${this.o.grid.cols}x${this.o.grid.rows}_${this.o.puzzleIndex}_${i}`;
  }

  /** Deterministic cut + one baked canvas texture per piece (clipped to its shape). */
  private bakePieces(): void {
    const { grid, texKey } = this.o;
    const total = grid.cols * grid.rows;
    this.edges = edgeGrid(grid.cols, grid.rows, hashStr(`${texKey}:${this.o.puzzleIndex}`));

    const src = this.scene.textures.get(texKey).getSourceImage() as CanvasImageSource & {
      width: number;
      height: number;
    };
    const sw = src.width;
    const sh = src.height;
    const scw = sw / grid.cols;
    const sch = sh / grid.rows;
    // knob size (source px). Kept modest so the baked frame stays close to the cell
    // size — the frame's transparent margin is only what a tab actually needs.
    const tabS = Math.min(scw, sch) * 0.15;
    const margin = Math.ceil(tabS * 1.75 + 4);
    const fw = Math.round(scw + margin * 2);
    const fh = Math.round(sch + margin * 2);

    for (let i = 0; i < total; i++) {
      const row = Math.floor(i / grid.cols);
      const col = i % grid.cols;
      const key = this.jkey(i);
      if (this.scene.textures.exists(key)) continue;
      try {
        const canvas = this.scene.textures.createCanvas(key, fw, fh);
        if (!canvas) continue;
        const ctx = canvas.getContext();
        ctx.clearRect(0, 0, fw, fh);
        ctx.save();
        const p = new Path2D(piecePath(this.edges[i], scw, sch, tabS, margin, margin));
        ctx.clip(p);
        ctx.drawImage(src, col * scw - margin, row * sch - margin, fw, fh, 0, 0, fw, fh);
        ctx.restore();
        canvas.refresh();
      } catch {
        /* leaves the piece un-baked; buildTiles will fall back to the base texture */
      }
    }

    // board-scale sizing shared with buildTiles
    this.frameScale = this.cellW / scw;
    this.frameW = fw * this.frameScale;
    this.frameH = fh * this.frameScale;
    this.tabBoard = tabS * this.frameScale;
  }

  private buildCells(): void {
    const { grid, centerX, centerY, boardSize } = this.o;
    const left = centerX - boardSize / 2 + this.cellW / 2;
    const top = centerY - boardSize / 2 + this.cellH / 2;
    const slot = this.scene.add.graphics().setDepth(3);
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const index = row * grid.cols + col;
        const x = left + col * this.cellW;
        const y = top + row * this.cellH;
        this.cells.push({ index, x, y, filled: false });
        slot.lineStyle(2, 0x7c5a3f, 0.35);
        slot.strokeRoundedRect(
          x - this.cellW / 2 + 3,
          y - this.cellH / 2 + 3,
          this.cellW - 6,
          this.cellH - 6,
          RADIUS.tile,
        );
      }
    }
  }

  private buildTiles(): void {
    const { grid, centerX, centerY, boardSize } = this.o;
    const total = grid.cols * grid.rows;
    const shuffleSeed = hashStr(`${this.o.texKey}:${this.o.puzzleIndex}:${Date.now() >> 13}`);
    const order = shuffle(
      Array.from({ length: total }, (_, i) => i),
      mulberry32(shuffleSeed),
    );

    // Adaptive tray: scale the scattered pieces so the WHOLE grid of them fits both
    // the width and the height available below the board (above the Hint button) —
    // no piece is ever off-screen, on 360x640 up to desktop.
    const perRow = total <= 4 ? 2 : 3;
    const rows = Math.ceil(total / perRow);
    const trayTop0 = centerY + boardSize / 2 + 48; // clears the wood frame + drop shadow
    const trayBottom = this.o.trayBottomY ?? this.scene.scale.height - 96;
    const gap = 8;
    const availW = this.scene.scale.width - 24;
    const availH = Math.max(84, trayBottom - trayTop0);
    // solve for the scale where the pieces + their (un-scaled) gaps exactly fill the
    // band — so the bottom row never slips under the Hint button.
    const sByW = (availW - (perRow + 1) * gap) / (perRow * this.frameW);
    const sByH = (availH - (rows + 1) * gap) / (rows * this.frameH);
    const trayScale = Phaser.Math.Clamp(Math.min(sByW, sByH), 0.22, 0.54);

    const itemW = this.frameW * trayScale + gap;
    const itemH = this.frameH * trayScale + gap;
    const slots = trayLayout(total, itemW, itemH, gap, perRow * (itemW + gap));
    // trayLayout's y already includes the first row's half-height, so trayTop is the
    // grid's TOP edge. Anchor that so the last row's bottom lands on trayBottom — the
    // tray then never slides under the Hint button, whatever size the board took.
    const gridH = (rows - 1) * (itemH + gap) + itemH;
    const trayTop = Math.max(trayTop0, trayBottom - gridH);

    const pathStr = (i: number) =>
      this.scene.textures.exists(this.jkey(i))
        ? piecePath(this.edges[i], this.cellW, this.cellH, this.tabBoard, -this.cellW / 2, -this.cellH / 2)
        : "";

    for (let k = 0; k < order.length; k++) {
      const sol = order[k];
      const key = this.scene.textures.exists(this.jkey(sol)) ? this.jkey(sol) : this.o.texKey;
      const tile = new PuzzleTile(this.scene, {
        pieceKey: key,
        solutionIndex: sol,
        frameW: this.frameW,
        frameH: this.frameH,
        cellW: this.cellW,
        cellH: this.cellH,
        pathStr: pathStr(sol),
        trayScale,
      });
      tile.setHome(centerX + slots[k].x, trayTop + slots[k].y);
      tile.setDepth(10);
      tile.on("dragend", () => this.onDrop(tile));
      this.tiles.push(tile);
    }
  }

  /* ---------------- interaction ---------------- */

  private onDrop(tile: PuzzleTile): void {
    if (tile.placed || this.done) return;
    const near = nearestEmptyCell(tile.x, tile.y, this.cells);
    const snapRadius = Math.max(46, this.cellW * this.o.snapRadiusFactor);
    if (near && near.cell.index === tile.solutionIndex && near.dist <= snapRadius) {
      near.cell.filled = true;
      tile.lockInto(near.cell.x, near.cell.y);
      sparkleBurst(this.scene, near.cell.x, near.cell.y, 6, 22);
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
      cell.x - this.cellW / 2 + 3,
      cell.y - this.cellH / 2 + 3,
      this.cellW - 6,
      this.cellH - 6,
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

  /* ---------------- completion: assemble → hold ~3 s → hand off ---------------- */

  private solve(): void {
    this.done = true;
    const { centerX, centerY, boardSize } = this.o;

    this.tiles.forEach((t) => {
      t.disableInteractive();
      t.fadeBorder();
    });
    this.scene.tweens.add({ targets: this.ghost, alpha: 0, duration: 200 });

    // the CLEAN finished picture, centred, no gaps or borders
    const finished = this.scene.add
      .image(centerX, centerY, this.o.texKey)
      .setDisplaySize(boardSize, boardSize)
      .setDepth(40)
      .setAlpha(0);
    this.scene.tweens.add({ targets: finished, alpha: 1, duration: 260 });

    // subtle magical glow
    const glow = this.scene.add
      .image(centerX, centerY, "glow")
      .setDepth(39)
      .setScale(1.7)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.scene.tweens.add({
      targets: glow,
      alpha: 0.8,
      scale: 2.3,
      duration: 420,
      yoyo: true,
      repeat: 1,
    });

    Sfx.complete();
    sparkleBurst(this.scene, centerX, centerY, 24, boardSize / 2);
    petalPuff(this.scene, centerX, centerY - 30, 14);
    this.scene.cameras.main.flash(200, 255, 253, 245);

    // object-specific sound, once, a beat into the hold
    if (this.o.completeSfx) {
      const sfx = Sfx as unknown as Record<string, undefined | (() => void)>;
      const fn = sfx[this.o.completeSfx];
      if (typeof fn === "function") this.scene.time.delayedCall(260, () => fn.call(Sfx));
    }

    // calm breathing while the player takes it in
    this.scene.tweens.add({
      targets: finished,
      scaleY: finished.scaleY * 1.02,
      scaleX: finished.scaleX * 1.02,
      duration: 1500,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });

    // nothing covers the picture during the hold
    this.o.onAssembled?.();

    this.scene.time.delayedCall(HOLD_MS, () => this.o.onSolved());
  }

  /* ---------------- dev/test helpers ---------------- */

  state(): { done: boolean; placed: number; cells: number } {
    return { done: this.done, placed: this.placed, cells: this.cells.length };
  }

  tilesDebug(): Array<{
    sol: number;
    x: number;
    y: number;
    placed: boolean;
    interactive: boolean;
    cellX: number;
    cellY: number;
    snapR: number;
  }> {
    const snapR = Math.max(46, this.cellW * this.o.snapRadiusFactor);
    return this.tiles.map((t) => {
      const cell = this.cells.find((c) => c.index === t.solutionIndex)!;
      return {
        sol: t.solutionIndex,
        x: Math.round(t.x),
        y: Math.round(t.y),
        placed: t.placed,
        interactive: !!(t.input && t.input.enabled),
        cellX: Math.round(cell.x),
        cellY: Math.round(cell.y),
        snapR: Math.round(snapR),
      };
    });
  }

  dragTargets(): Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> {
    const out: Array<{ from: { x: number; y: number }; to: { x: number; y: number } }> = [];
    for (const tile of this.tiles) {
      if (tile.placed) continue;
      const cell = this.cells.find((c) => c.index === tile.solutionIndex);
      if (!cell) continue;
      out.push({ from: { x: tile.x, y: tile.y }, to: { x: cell.x, y: cell.y } });
    }
    return out;
  }

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
