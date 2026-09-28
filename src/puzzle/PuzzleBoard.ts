import Phaser from "phaser";
import { COLORS, RADIUS } from "../ui/theme";
import { mulberry32, hashStr } from "../core/rng";
import { nearestEmptyCell, shuffle, trayLayout } from "./slice";
import type { Cell, GridSize } from "./slice";
import { edgeGrid, piecePath, pathToPoints } from "./jigsaw";
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
  /** Sfx method name for the object sound (rabbitChirp / birdSong / bloomChime). */
  completeSfx?: string;
  /** Called when the clean picture is on screen and the hold begins. */
  onAssembled?: () => void;
  /**
   * The puzzle that creates the object: after a short still hold, the finished
   * picture "comes alive" in a style appropriate to what was restored, with the
   * object sound at the moment it starts, then hands off. `undefined` = no living
   * beat (intermediate puzzles): the picture is just held for {@link HOLD_MS}.
   *  - "hop"   → animal: tiny ear/head twitch + one small in-place hop
   *  - "bloom" → plant: individual flowers pop open one after another, then a soft sway
   * (add e.g. "flit" for a bird with its own method — see playLivingMove dispatch.)
   */
  livingMove?: "hop" | "bloom";
  onSolved: () => void;
}

/** How long the completed picture is held before handing off (no living move). */
const HOLD_MS = 3000;
/** Still hold before the tiny "the picture came alive" move. */
const SETTLE_MS = 900;

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
  private handedOff = false;
  private holdTimer?: Phaser.Time.TimerEvent;
  /** Cropped copies of the finished texture used by the "picture comes alive" beat
   *  (all destroyed when the beat ends or the board is torn down). */
  private livingOverlays: Phaser.GameObjects.Image[] = [];

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

  /**
   * The exact jigsaw outline for cell `index`, at world position (x,y) — the
   * SAME edges[] + piecePath() geometry the matching loose piece is cut from
   * (see bakePieces/buildTiles), turned into drawable points via the shared
   * pathToPoints(). This is the one source of truth buildCells() (the visual
   * recess) and hint() (the glow) both read from — never two approximations
   * that could drift apart.
   */
  private slotOutlinePoints(index: number, x: number, y: number): { x: number; y: number }[] {
    const pathStr = piecePath(this.edges[index], this.cellW, this.cellH, this.tabBoard, x - this.cellW / 2, y - this.cellH / 2);
    return pathToPoints(pathStr);
  }

  /**
   * Wooden inset-tray look: each slot is recessed to the EXACT jigsaw shape
   * of the piece that belongs there (soft inner shadow + thin warm-brown
   * contour + a faint ghost of the piece's own art) — no rectangular cell
   * ever shows, before or after pieces are placed.
   */
  private buildCells(): void {
    const { grid, centerX, centerY, boardSize } = this.o;
    const left = centerX - boardSize / 2 + this.cellW / 2;
    const top = centerY - boardSize / 2 + this.cellH / 2;
    const slot = this.scene.add.graphics().setDepth(2);
    for (let row = 0; row < grid.rows; row++) {
      for (let col = 0; col < grid.cols; col++) {
        const index = row * grid.cols + col;
        const x = left + col * this.cellW;
        const y = top + row * this.cellH;
        this.cells.push({ index, x, y, filled: false });

        const pts = this.slotOutlinePoints(index, x, y);
        slot.fillStyle(0x6b4a30, 0.22);
        slot.beginPath();
        slot.moveTo(pts[0].x, pts[0].y);
        for (let k = 1; k < pts.length; k++) slot.lineTo(pts[k].x, pts[k].y);
        slot.closePath();
        slot.fillPath();
        // wide, soft, low-alpha ring fakes an inner shadow (Graphics has no
        // native shadow blur); the thin crisp stroke on top is the contour.
        slot.lineStyle(7, 0x2a1c14, 0.14);
        slot.strokePoints(pts, true);
        slot.lineStyle(2, 0x7c5a3f, 0.5);
        slot.strokePoints(pts, true);

        // faint ghost of the actual artwork — reuses the SAME baked, already
        // shape-clipped piece texture the loose piece displays, just dimmed
        const ghostKey = this.jkey(index);
        if (this.scene.textures.exists(ghostKey)) {
          this.scene.add
            .image(x, y, ghostKey)
            .setDisplaySize(this.frameW, this.frameH)
            .setAlpha(0.1)
            .setDepth(2.5);
        }
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
    // no piece is ever off-screen, on 360x640 up to desktop. More columns as the
    // piece count climbs (6..16 across the six animals) keeps the tray a wide, shallow
    // band instead of a tall scroll of rows — trayScale below still adapts the actual
    // piece size to whatever space that leaves.
    const perRow = total <= 4 ? 2 : total <= 8 ? 3 : total <= 12 ? 4 : 5;
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

  /** Which piece the last Hint press targeted, and how many times in a row
   *  (pressing again for the SAME still-unplaced piece escalates to the
   *  stronger ghost-copy demonstration; a different piece resets to level 1). */
  private hintedPieceIndex: number | null = null;
  private hintLevel = 0;

  /**
   * Hint teaches, it doesn't solve: (1) the one loose piece it's talking
   * about glows while the rest dim, (2) its EXACT jigsaw-shaped destination
   * (same geometry as slotOutlinePoints/buildCells — never a rectangle)
   * glows in turn, (3) a short sparkle trail connects the two. The player
   * still drags the piece over themselves. Pressing Hint again for the same
   * piece adds a translucent ghost of it gliding to the slot and back.
   */
  hint(): void {
    const t = this.tiles.find((x) => !x.placed);
    if (!t) return;
    const cell = this.cells.find((c) => c.index === t.solutionIndex);
    if (!cell) return;

    this.hintLevel = this.hintedPieceIndex === t.solutionIndex ? this.hintLevel + 1 : 1;
    this.hintedPieceIndex = t.solutionIndex;

    Sfx.sparkle();
    this.hintG.clear();

    // 1) the specific piece glows; every other unplaced piece dims briefly
    this.tiles.forEach((tile) => {
      if (tile.placed) return;
      if (tile === t) {
        this.scene.tweens.add({
          targets: tile,
          scaleX: tile.scaleX * 1.16,
          scaleY: tile.scaleY * 1.16,
          duration: 200,
          yoyo: true,
          repeat: 2,
          ease: "Sine.easeInOut",
        });
      } else {
        this.scene.tweens.add({ targets: tile, alpha: 0.4, duration: 200, yoyo: true, hold: 500, ease: "Sine.easeInOut" });
      }
    });

    // 2) after a beat, its exact-shaped slot glows — same geometry as the
    // recess drawn in buildCells(), so the glow silhouette matches perfectly
    this.scene.time.delayedCall(520, () => {
      if (t.placed) return;
      const pts = this.slotOutlinePoints(t.solutionIndex, cell.x, cell.y);
      this.hintG.lineStyle(6, COLORS.gold, 1);
      this.hintG.strokePoints(pts, true);
      this.hintG.setAlpha(0);
      this.scene.tweens.add({
        targets: this.hintG,
        alpha: 1,
        duration: 220,
        yoyo: true,
        repeat: 2,
        onComplete: () => this.hintG.clear(),
      });
      this.drawHintTrail(t.x, t.y, cell.x, cell.y);
    });

    // Level 2+: a translucent ghost of the actual piece glides to its slot
    // and back — a stronger demonstration, but it never stays there itself.
    if (this.hintLevel >= 2) {
      this.scene.time.delayedCall(1000, () => this.playGhostHint(t, cell));
    }
  }

  /** A few sparkles staggered along the piece→slot line — a visual cue to
   *  follow, not a mechanical arrow. */
  private drawHintTrail(fromX: number, fromY: number, toX: number, toY: number): void {
    const steps = 5;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = fromX + (toX - fromX) * t;
      const y = fromY + (toY - fromY) * t;
      this.scene.time.delayedCall(i * 70, () => sparkleBurst(this.scene, x, y, 3, 10));
    }
  }

  /** Stronger hint: a dimmed copy of the piece's own (already shape-clipped)
   *  art eases from its current spot to the slot and eases back — demonstrating
   *  the move without ever actually placing the piece for the player. */
  private playGhostHint(tile: PuzzleTile, cell: Cell): void {
    if (tile.placed) return;
    const key = this.scene.textures.exists(this.jkey(tile.solutionIndex)) ? this.jkey(tile.solutionIndex) : this.o.texKey;
    const ghost = this.scene.add
      .image(tile.x, tile.y, key)
      .setDisplaySize(this.frameW, this.frameH)
      .setAlpha(0)
      .setDepth(400);
    this.scene.tweens.add({
      targets: ghost,
      alpha: 0.55,
      duration: 200,
      onComplete: () => {
        this.scene.tweens.add({
          targets: ghost,
          x: cell.x,
          y: cell.y,
          duration: 520,
          ease: "Sine.easeInOut",
          onComplete: () => {
            this.scene.tweens.add({
              targets: ghost,
              x: tile.x,
              y: tile.y,
              alpha: 0,
              duration: 420,
              delay: 200,
              ease: "Sine.easeInOut",
              onComplete: () => ghost.destroy(),
            });
          },
        });
      },
    });
  }

  /* ---------------- completion: assemble → hold → (tiny move) → hand off ---------------- */

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

    // nothing covers the picture during the hold
    this.o.onAssembled?.();

    if (this.o.livingMove) {
      // hold it perfectly still, then the object-appropriate "comes alive" beat.
      // `finished` itself is never animated — see playLivingMove() and its variants.
      this.holdTimer = this.scene.time.delayedCall(SETTLE_MS, () => this.playLivingMove());
    } else {
      // unchanged: object sound a beat in, calm breathing, standard hold
      if (this.o.completeSfx) {
        const fn = (Sfx as unknown as Record<string, undefined | (() => void)>)[this.o.completeSfx];
        if (typeof fn === "function") this.scene.time.delayedCall(260, () => fn.call(Sfx));
      }
      this.scene.tweens.add({
        targets: finished,
        scaleY: finished.scaleY * 1.02,
        scaleX: finished.scaleX * 1.02,
        duration: 1500,
        yoyo: true,
        repeat: 1,
        ease: "Sine.easeInOut",
      });
      this.holdTimer = this.scene.time.delayedCall(HOLD_MS, () => this.handOff());
    }
  }

  /** Resolve an Sfx method by name and play it once (used by every living beat). */
  private playObjectSfx(): void {
    if (!this.o.completeSfx) return;
    const fn = (Sfx as unknown as Record<string, undefined | (() => void)>)[this.o.completeSfx];
    if (typeof fn === "function") fn.call(Sfx);
  }

  /** A pixel-aligned crop of the finished texture, laid exactly over `finished`. */
  private livingCrop(cropX: number, cropY: number, cropW: number, cropH: number, depth = 41): Phaser.GameObjects.Image {
    const { centerX, centerY, boardSize, texKey } = this.o;
    const img = this.scene.add
      .image(centerX, centerY, texKey)
      .setDisplaySize(boardSize, boardSize)
      .setDepth(depth);
    img.setCrop(cropX, cropY, cropW, cropH);
    this.livingOverlays.push(img);
    return img;
  }

  private disposeLivingOverlays(): void {
    for (const o of this.livingOverlays) o.destroy();
    this.livingOverlays = [];
  }

  /**
   * "The finished picture was still — then the thing inside it came alive."
   * `finished` is NEVER touched (its composition / pose / baked shadow stay exact);
   * every variant works on cropped copies of the SAME texture laid on top, so the
   * artwork is identical (no seam, no duplicate) and the picture returns to the
   * exact final frame. Dispatches by the restored object's style.
   */
  private playLivingMove(): void {
    if (this.o.livingMove === "bloom") this.playLivingBloom();
    else this.playLivingHop();
  }

  /**
   * Animal: crop just the rabbit (head + body + ears, above the baked shadow/feet),
   * a couple of quick ear/head twitches, a breath, then ONE small in-place hop that
   * lifts it off its static shadow. Restores + destroys the overlay, then hands off.
   */
  private playLivingHop(): void {
    const { centerX, centerY, texKey } = this.o;
    const src = this.scene.textures.get(texKey).getSourceImage() as { width: number; height: number };
    const TW = src.width || 640;
    const TH = src.height || 640;

    const cropW = TW * 0.62;
    const rabbit = this.livingCrop(TW * 0.5 - cropW / 2, TH * 0.015, cropW, TH * 0.8);
    const sx = rabbit.scaleX;
    const sy = rabbit.scaleY;

    this.playObjectSfx(); // once, as the movement starts

    // 1) two quick ear/head twitches (tiny tilt about the picture centre)
    this.scene.tweens.add({
      targets: rabbit,
      angle: 2.4,
      duration: 85,
      yoyo: true,
      repeat: 2,
      ease: "Sine.easeInOut",
    });

    // 2) a breath, then ONE small hop that lifts the rabbit off the static shadow
    this.scene.tweens.add({
      targets: rabbit,
      scaleX: sx * 1.03,
      scaleY: sy * 0.96,
      delay: 110,
      duration: 130,
      ease: "Quad.easeOut",
      yoyo: true,
      onComplete: () => {
        const p = { t: 0 };
        this.scene.tweens.add({
          targets: p,
          t: 1,
          duration: 340,
          ease: "Sine.easeInOut",
          onUpdate: () => {
            const k = Math.sin(Math.PI * p.t); // 0 → 1 → 0
            rabbit.y = centerY - k * 12; // small in-place hop, no travel
            rabbit.setScale(sx * (1 - k * 0.03), sy * (1 + k * 0.05));
          },
          onComplete: () => {
            rabbit.setPosition(centerX, centerY).setScale(sx, sy).setAngle(0);
            this.disposeLivingOverlays();
            this.handOff();
          },
        });
      },
    });
  }

  /**
   * Plant: the individual flowers come alive. Three front blooms pop open one after
   * another (each a small crop of that flower head, scaled about its own centre with
   * a tiny unfurl-twist + sparkle), then the whole blooms band does one soft sway.
   * Petal-height crops keep the planter, soil and baked shadow perfectly still.
   */
  private playLivingBloom(): void {
    const { centerX, centerY, boardSize, texKey } = this.o;
    const src = this.scene.textures.get(texKey).getSourceImage() as { width: number; height: number };
    const TW = src.width || 640;
    const TH = src.height || 640;

    this.playObjectSfx(); // "bloomChime", once, as the first flower opens

    // front-bloom head centres, as fractions of the wildflowers_portrait frame
    const heads: Array<[number, number]> = [
      [0.362, 0.297],
      [0.5, 0.284],
      [0.641, 0.3],
    ];
    const half = TW * 0.115; // crop half-size around a head (petals + margin)

    heads.forEach(([fx, fy], i) => {
      const cx = Phaser.Math.Clamp(fx * TW - half, 0, TW);
      const cy = Phaser.Math.Clamp(fy * TH - half, 0, TH);
      const flower = this.livingCrop(cx, cy, half * 2, half * 2, 42);
      flower.setOrigin(fx, fy); // scale/twist about the flower's own centre
      flower.setPosition(centerX - boardSize / 2 + fx * boardSize, centerY - boardSize / 2 + fy * boardSize);
      const base = flower.scaleX; // = boardSize / TW

      flower.setScale(base * 0.94);
      this.scene.tweens.add({
        targets: flower,
        scale: base * 1.16,
        angle: i % 2 ? 5 : -5,
        delay: i * 150,
        duration: 190,
        ease: "Back.easeOut",
        onComplete: () => {
          sparkleBurst(this.scene, flower.x, flower.y - half * 0.4, 5, 22);
          this.scene.tweens.add({
            targets: flower,
            scale: base,
            angle: 0,
            duration: 220,
            ease: "Sine.easeInOut",
          });
        },
      });
    });

    // once the last flower has opened: one soft sway of the whole blooms band.
    // depth 43 → the band covers the (now settled) individual flower crops so the
    // heads + stems sway together; the planter / soil / shadow below stay still.
    this.scene.time.delayedCall(300 + 190 + 220 + 90, () => {
      const band = this.livingCrop(0, 0, TW, TH * 0.4, 43); // heads + upper stems, above the rim
      sparkleBurst(this.scene, centerX, centerY - boardSize * 0.18, 4, boardSize * 0.14);
      const p = { t: 0 };
      this.scene.tweens.add({
        targets: p,
        t: 1,
        duration: 520,
        ease: "Sine.easeInOut",
        onUpdate: () => {
          band.setAngle(Math.sin(p.t * Math.PI * 2) * 2); // 0 → 2 → 0 → -2 → 0
        },
        onComplete: () => {
          band.setAngle(0);
          this.disposeLivingOverlays();
          this.handOff();
        },
      });
    });
  }

  /** Commit to the garden hand-off exactly once, however we got here. */
  private handOff(): void {
    if (this.handedOff) return;
    this.handedOff = true;
    this.o.onSolved();
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
    this.holdTimer?.remove(false);
    this.holdTimer = undefined;
    this.disposeLivingOverlays();
    this.tiles.forEach((t) => t.destroy());
  }
}
