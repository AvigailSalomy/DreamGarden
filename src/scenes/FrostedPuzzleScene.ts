import Phaser from "phaser";
import { makeIconButton } from "../ui/hit";
import { titleStyle, bodyStyle, FONT_FAMILY } from "../ui/theme";
import { safeInsets } from "../util/safeArea";
import { sparkleBurst } from "../fx/Particles";
import { Sfx } from "../fx/Sfx";
import { hashStr } from "../core/rng";
import { economy, frostedProgression } from "../game/services";
import { cutOrganicJigsaw, scatterAround } from "../puzzle/organicJigsaw";
import type { OrganicCut, OrganicPiece } from "../puzzle/organicJigsaw";
import { LIVING_DURATION, LIVING_RIGS, livingFrame } from "../puzzle/livingArt";
import { LivingArtPipeline } from "../puzzle/LivingArtPipeline";
import { IMAGE_HINT_SECONDS, PuzzleHintSession, chooseHintPiece } from "../puzzle/puzzleHints";
import type { HintKind } from "../puzzle/puzzleHints";
import type { FrostedAnimalDef } from "../data/types";
import type { FrostedValleyScene } from "./FrostedValleyScene";

interface PuzzleLaunch {
  animalId: string;
}

interface PieceView {
  piece: OrganicPiece;
  box: Phaser.GameObjects.Container;
  pic: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Image;
  /** Where the piece's centre sits when solved (screen px). */
  target: { x: number; y: number };
  placed: boolean;
  dragging: boolean;
  /** Pointed out by a Piece Hint earlier in this attempt. */
  hinted: boolean;
}

/** One live Piece Hint's visuals, torn down together. */
interface ActivePieceHint {
  view: PieceView;
  objects: Phaser.GameObjects.GameObject[];
  timers: Phaser.Time.TimerEvent[];
}

const TRAY_Z = 100;

/**
 * The Frosted Valley reward jigsaw — unlocked only once every requirement of
 * the current animal is restored. Irregular organic pieces cut from the
 * animal's existing final artwork, scattered randomly around the board each
 * time, dragged into place with a satisfying snap. Pieces keep their correct
 * rotation (no rotation step: a cosy puzzle, not a frustrating one).
 *
 * Completing it: ripple + sparkle + "PUZZLE COMPLETE!", then ~7 seconds of the
 * picture coming alive (LivingArtPipeline warps the real art: breathing, head
 * turns, ears/tail/wings, blinks, swaying plants, plus light, shimmer and snow),
 * then back to the world where FrostedValleyScene plays the unlock cinematic.
 */
export class FrostedPuzzleScene extends Phaser.Scene {
  private def!: FrostedAnimalDef;
  private cut!: OrganicCut;
  private views: PieceView[] = [];
  private placedCount = 0;
  private boardRect = { x: 0, y: 0, w: 0, h: 0 };
  private boardScale = 1;
  private trayScale = 1;
  private snapR = 40;
  private topZ = TRAY_Z;
  private done = false;
  private closing = false;
  private backArmed = false;
  private title!: Phaser.GameObjects.Text;
  private subtitle!: Phaser.GameObjects.Text;
  private progressText!: Phaser.GameObjects.Text;
  private chrome: Phaser.GameObjects.GameObject[] = [];
  private backBtn?: Phaser.GameObjects.Container;
  private finished?: Phaser.GameObjects.Image;
  /** DEV: pin the living-artwork clock to a moment (seconds) for inspection. */
  private debugLivingT?: number;
  /** Hint usage for THIS attempt only — never saved (see PuzzleHintSession). */
  private hints!: PuzzleHintSession;
  private hintBtn?: Phaser.GameObjects.Container;
  private hintMenu?: Phaser.GameObjects.Container;
  private imagePreview?: { objects: Phaser.GameObjects.GameObject[]; timer: Phaser.Time.TimerEvent };
  private pieceHint?: ActivePieceHint;
  private headerH = 0;

  constructor() {
    super("FrostedPuzzle");
  }

  init(data: PuzzleLaunch): void {
    const def = frostedProgression.def(data.animalId);
    if (def) this.def = def;
    this.views = [];
    this.placedCount = 0;
    this.topZ = TRAY_Z;
    this.done = false;
    this.closing = false;
    this.backArmed = false;
    this.chrome = [];
    this.finished = undefined;
    this.hints = new PuzzleHintSession(economy);
    this.hintMenu = undefined;
    this.imagePreview = undefined;
    this.pieceHint = undefined;
  }

  preload(): void {
    if (!this.def) return;
    const key = this.def.puzzle.image;
    if (!this.textures.exists(key)) this.load.image(key, `assets/frosted/puzzle/${key}.jpg`);
  }

  create(): void {
    // only ever reachable once every requirement is restored (the Request
    // screen hides the button otherwise) — and defended here too
    if (!this.def || !frostedProgression.isPuzzleAvailable(this.def.id) || !this.textures.exists(this.def.puzzle.image)) {
      this.leave();
      return;
    }
    this.registry.set("pointerOnUI", true);
    LivingArtPipeline.register(this.game);

    const W = this.scale.width;
    const H = this.scale.height;
    const inset = safeInsets();
    const p = this.def.puzzle;
    const src = this.textures.get(p.image).getSourceImage() as { width: number; height: number };
    const texW = src.width;
    const texH = src.height;

    this.buildBackdrop(W, H);

    // ---- header
    const headerTop = inset.top + 22;
    this.title = this.add
      .text(W / 2, headerTop + 18, `🧩 ${this.def.name.toUpperCase()}'S PUZZLE`, { ...titleStyle(30), color: "#fef6e8" })
      .setOrigin(0.5)
      .setShadow(0, 3, "#0d1830", 8, false, true)
      .setDepth(900);
    this.subtitle = this.add
      .text(W / 2, headerTop + 52, "Restore the picture to bring your new friend back to the Valley!", bodyStyle(17, "#d6e6f7"))
      .setOrigin(0.5)
      .setDepth(900);
    const headerH = headerTop + 78;
    this.headerH = headerH;

    // ---- board: the artwork is the focus — as large as fits while leaving a table for pieces
    const landscape = W >= H * 1.15;
    const aspect = texW / texH;
    let bw: number;
    if (landscape) bw = Math.min(W * 0.6, (H - headerH - 30) * 0.74 * aspect);
    else bw = Math.min(W - 32, (H - headerH) * 0.46 * aspect);
    const bh = bw / aspect;
    const bx = (W - bw) / 2;
    const by = landscape ? headerH + (H - headerH - 20 - bh) / 2 - 10 : headerH + 12;
    this.boardRect = { x: bx, y: by, w: bw, h: bh };
    this.boardScale = bw / texW;

    // the empty board never shows the artwork — only a frosted surface and the
    // faint cut lines; the picture is seen only through the 10s Image Hint,
    // piece by piece as it's assembled, and when it's complete
    this.buildFrame();
    this.buildFrostedBoard();

    // ---- cut + bake the pieces (fixed shapes per animal; positions random per run)
    this.cut = cutOrganicJigsaw(p.cols, p.rows, texW, texH, hashStr(`${this.def.id}:fv-puzzle`), p.irregularity);
    this.drawGuideOutlines();
    this.bakePieces();

    const cellMin = Math.min(texW / p.cols, texH / p.rows) * this.boardScale;
    this.snapR = Math.max(34, cellMin * p.snapFactor);

    // tray scale: all pieces should fit the free table area without piling up
    const maxW = Math.max(...this.cut.pieces.map((pc) => pc.bounds.w)) * this.boardScale;
    const maxH = Math.max(...this.cut.pieces.map((pc) => pc.bounds.h)) * this.boardScale;
    const avgArea =
      (this.cut.pieces.reduce((s, pc) => s + pc.bounds.w * pc.bounds.h, 0) / this.cut.pieces.length) * this.boardScale ** 2;
    const freeArea = W * (H - headerH) - (bw + 40) * (bh + 40);
    this.trayScale = Phaser.Math.Clamp(Math.sqrt((freeArea * 0.62) / (avgArea * this.cut.pieces.length)), 0.5, 0.92);

    this.buildPieces();
    this.scatter(maxW * this.trayScale, maxH * this.trayScale, headerH);

    // ---- chrome: subtle progress + back
    this.progressText = this.add
      .text(W / 2, Math.min(H - inset.bottom - 22, by + bh + 34), "", {
        fontFamily: FONT_FAMILY,
        fontSize: "18px",
        fontStyle: "600",
        color: "#eaf4ff",
        backgroundColor: "#1a2a4acc",
        padding: { x: 14, y: 5 },
      })
      .setOrigin(0.5)
      .setDepth(2)
      .setAlpha(0.9);
    this.updateProgress(false);

    this.backBtn = makeIconButton(this, inset.left + 64, headerTop + 18, "‹ Back", 18, () => this.onBack(), {
      color: "#fef6e8",
      hitW: 116,
      hitH: 50,
    });
    this.backBtn.setDepth(950);
    this.hintBtn = this.buildHintButton(W - inset.right - 86, headerTop + 18);
    this.chrome = [this.backBtn, this.subtitle, this.hintBtn];

    this.input.on("dragstart", this.onDragStart, this);
    this.input.on("drag", this.onDrag, this);
    this.input.on("dragend", this.onDragEnd, this);

    this.cameras.main.fadeIn(420, 12, 20, 40);

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__dgFvPuzzle = {
        solve: () => this.forceSolve(),
        placeAllBut: (n: number) => this.forceSolve(n),
        holdLivingAt: (t?: number) => (this.debugLivingT = t),
        openHints: () => this.toggleHintMenu(true),
        hint: (kind: HintKind) => this.useHint(kind),
        hintInfo: () => ({
          coins: economy.coins,
          pieceFree: this.hints.freeLeft("piece"),
          piecePrice: this.hints.priceOf("piece"),
          imageFree: this.hints.freeLeft("image"),
          imagePrice: this.hints.priceOf("image"),
          previewing: !!this.imagePreview,
          hintedPiece: this.pieceHint ? { index: this.pieceHint.view.piece.index, placed: this.pieceHint.view.placed, at: { x: this.pieceHint.view.box.x, y: this.pieceHint.view.box.y }, target: this.pieceHint.view.target } : null,
        }),
        state: () => ({
          animal: this.def.id,
          pieces: this.views.length,
          placed: this.placedCount,
          done: this.done,
          trayScale: this.trayScale,
          snapR: this.snapR,
          board: this.boardRect,
        }),
        drags: () =>
          this.views
            .filter((v) => !v.placed)
            .map((v) => ({ from: { x: v.box.x, y: v.box.y }, to: v.target })),
      };
    }
  }

  /* ------------------------------------------------------------ building */

  private buildBackdrop(W: number, H: number): void {
    const g = this.add.graphics().setDepth(-10);
    g.fillGradientStyle(0x1b2c52, 0x1b2c52, 0x0c1428, 0x0c1428, 1);
    g.fillRect(0, 0, W, H);
    // soft aurora wash
    const glow = this.add.image(W / 2, H * 0.35, "glow").setDisplaySize(W * 1.2, H * 0.9).setAlpha(0.16).setTint(0x9fd8ff).setDepth(-9);
    this.tweens.add({ targets: glow, alpha: 0.24, duration: 3800, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    // an invisible full-screen catcher: taps that miss a piece do nothing
    this.add.rectangle(0, 0, W, H, 0x000000, 0.001).setOrigin(0, 0).setDepth(-8).setInteractive();

    const key = "fv_snow_dot";
    if (!this.textures.exists(key)) {
      const dot = this.make.graphics({}, false);
      dot.fillStyle(0xffffff, 1);
      dot.fillCircle(4, 4, 4);
      dot.generateTexture(key, 8, 8);
      dot.destroy();
    }
    this.add
      .particles(0, 0, key, {
        x: { min: 0, max: W },
        y: -10,
        lifespan: { min: 7000, max: 12000 },
        speedY: { min: 16, max: 38 },
        speedX: { min: -8, max: 8 },
        scale: { min: 0.3, max: 0.9 },
        alpha: { start: 0.55, end: 0.1 },
        frequency: 180,
      })
      .setDepth(-7);
  }

  private buildFrame(): void {
    const { x, y, w, h } = this.boardRect;
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x050a18, 0.45);
    g.fillRoundedRect(x - 18, y - 10, w + 36, h + 36, 26);
    g.fillStyle(0xdff1ff, 1);
    g.fillRoundedRect(x - 16, y - 16, w + 32, h + 32, 24);
    g.fillStyle(0x9cc8e8, 1);
    g.fillRoundedRect(x - 10, y - 10, w + 20, h + 20, 18);
    g.fillStyle(0x16223d, 1);
    g.fillRect(x, y, w, h);
    // frosty highlight along the top rim
    g.fillStyle(0xffffff, 0.55);
    g.fillRoundedRect(x - 8, y - 14, w + 16, 5, 3);
  }

  /**
   * The assembly surface: deep frosted ice with soft rime, faint snow-crystal
   * etchings, a gentle central glow and a little snow drifting across it —
   * magical, clearly "the puzzle goes here", and carrying no trace of the
   * picture (no colours, shapes or silhouettes from the artwork).
   */
  private buildFrostedBoard(): void {
    const { x, y, w, h } = this.boardRect;
    const key = `fvpz_board_${Math.round(w)}x${Math.round(h)}`;
    if (!this.textures.exists(key)) {
      const tex = this.textures.createCanvas(key, Math.round(w), Math.round(h));
      if (tex) {
        const ctx = tex.getContext();
        const W = tex.width;
        const H = tex.height;
        const grad = ctx.createLinearGradient(0, 0, W * 0.3, H);
        grad.addColorStop(0, "#2d4a78");
        grad.addColorStop(0.55, "#223a63");
        grad.addColorStop(1, "#1a2c4f");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);
        // soft central glow
        const glow = ctx.createRadialGradient(W / 2, H * 0.45, 0, W / 2, H * 0.45, W * 0.55);
        glow.addColorStop(0, "rgba(170,215,255,0.20)");
        glow.addColorStop(1, "rgba(170,215,255,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);
        // rime speckle (a fixed seed, so the board looks the same every time)
        let seed = 1337;
        const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
        for (let i = 0; i < (W * H) / 90; i++) {
          ctx.fillStyle = `rgba(225,240,255,${(0.02 + rnd() * 0.07).toFixed(3)})`;
          const r = 0.5 + rnd() * 1.6;
          ctx.beginPath();
          ctx.arc(rnd() * W, rnd() * H, r, 0, Math.PI * 2);
          ctx.fill();
        }
        // faint six-armed frost crystals etched into the ice
        ctx.lineCap = "round";
        for (let i = 0; i < 9; i++) {
          const cx = rnd() * W;
          const cy = rnd() * H;
          const s = 26 + rnd() * 60;
          ctx.strokeStyle = `rgba(210,235,255,${(0.05 + rnd() * 0.05).toFixed(3)})`;
          ctx.lineWidth = 1.4;
          for (let a = 0; a < 6; a++) {
            const ang = (a / 6) * Math.PI * 2 + rnd() * 0.2;
            const ex = cx + Math.cos(ang) * s;
            const ey = cy + Math.sin(ang) * s;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(ex, ey);
            for (const f of [0.45, 0.72]) {
              const bx = cx + Math.cos(ang) * s * f;
              const by = cy + Math.sin(ang) * s * f;
              for (const side of [-1, 1]) {
                ctx.moveTo(bx, by);
                ctx.lineTo(bx + Math.cos(ang + side * 0.7) * s * 0.22, by + Math.sin(ang + side * 0.7) * s * 0.22);
              }
            }
            ctx.stroke();
          }
        }
        // frosted vignette at the rim
        const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
        vig.addColorStop(0, "rgba(10,18,40,0)");
        vig.addColorStop(1, "rgba(10,18,40,0.45)");
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, W, H);
        tex.refresh();
      }
    }
    this.add.image(x, y, key).setOrigin(0, 0).setDisplaySize(w, h).setDepth(2);

    // a slow breathing sheen and a little snow drifting over the ice
    const sheen = this.add
      .image(x + w / 2, y + h * 0.45, "glow")
      .setDisplaySize(w * 0.9, h * 0.9)
      .setTint(0xbfe4ff)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.06)
      .setDepth(3);
    this.tweens.add({ targets: sheen, alpha: 0.14, duration: 3200, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.add
      .particles(0, 0, "fv_snow_dot", {
        x: { min: x + 6, max: x + w - 6 },
        y: y + 4,
        lifespan: { min: (h / 38) * 1000, max: (h / 26) * 1000 },
        speedY: { min: 22, max: 34 },
        speedX: { min: -6, max: 6 },
        scale: { min: 0.25, max: 0.7 },
        alpha: { start: 0.45, end: 0 },
        frequency: 260,
      })
      .setDepth(4);
  }

  /** Faint piece outlines on the board — clearer on early puzzles, nearly gone on later ones. */
  private drawGuideOutlines(): void {
    const g = this.add.graphics().setDepth(4);
    const a = Math.min(0.3, this.def.puzzle.guideAlpha * 1.25);
    g.lineStyle(1.5, 0xe8f4ff, a);
    for (const pc of this.cut.pieces) {
      g.strokePoints(pc.outline.map((pt) => this.boardPoint(pt.x, pt.y)), true);
    }
  }

  private boardPoint(tx: number, ty: number): Phaser.Math.Vector2 {
    return new Phaser.Math.Vector2(this.boardRect.x + tx * this.boardScale, this.boardRect.y + ty * this.boardScale);
  }

  private pieceKey(i: number): string {
    return `fvpz_${this.def.id}_${this.def.puzzle.cols}x${this.def.puzzle.rows}_${i}`;
  }

  /** One canvas texture per piece, clipped to its organic outline, with a soft bevelled edge. */
  private bakePieces(): void {
    const src = this.textures.get(this.def.puzzle.image).getSourceImage() as CanvasImageSource;
    const pad = 4;
    for (const pc of this.cut.pieces) {
      const key = this.pieceKey(pc.index);
      if (this.textures.exists(key)) continue;
      const w = Math.ceil(pc.bounds.w + pad * 2);
      const h = Math.ceil(pc.bounds.h + pad * 2);
      const tex = this.textures.createCanvas(key, w, h);
      if (!tex) continue;
      const ctx = tex.getContext();
      ctx.save();
      ctx.translate(pad - pc.bounds.x, pad - pc.bounds.y);
      const path = new Path2D(pc.path);
      ctx.save();
      ctx.clip(path);
      ctx.drawImage(src, 0, 0);
      // bevel: bright inner rim + thin dark cut line, both kept inside the clip
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(255,255,255,0.38)";
      ctx.lineWidth = 7;
      ctx.stroke(path);
      ctx.strokeStyle = "rgba(18,28,58,0.55)";
      ctx.lineWidth = 2.5;
      ctx.stroke(path);
      ctx.restore();
      ctx.restore();
      tex.refresh();
    }
  }

  private buildPieces(): void {
    const s = this.boardScale;
    for (const pc of this.cut.pieces) {
      const key = this.pieceKey(pc.index);
      const shadow = this.add.image(0, 0, key).setScale(s).setTintFill(0x050a18).setAlpha(0.35);
      shadow.setPosition(3, 6);
      const pic = this.add.image(0, 0, key).setScale(s);
      const box = this.add.container(0, 0, [shadow, pic]);

      // generous rectangular hit area over the whole piece (+ margin): the art is
      // irregular, grabbing it should not be. Container hit areas start at (0,0).
      const hw = Math.max(64 / this.trayScale, pic.displayWidth + 24);
      const hh = Math.max(64 / this.trayScale, pic.displayHeight + 24);
      box.setSize(hw, hh);
      box.setInteractive(new Phaser.Geom.Rectangle(0, 0, hw, hh), Phaser.Geom.Rectangle.Contains);
      if (box.input) box.input.cursor = "grab";
      this.input.setDraggable(box);

      const target = {
        x: this.boardRect.x + (pc.bounds.x + pc.bounds.w / 2) * s,
        y: this.boardRect.y + (pc.bounds.y + pc.bounds.h / 2) * s,
      };
      const view: PieceView = { piece: pc, box, pic, shadow, target, placed: false, dragging: false, hinted: false };
      box.setData("view", view);
      this.views.push(view);
    }
  }

  /** Fresh random table layout every time the puzzle opens (destinations never change). */
  private scatter(itemW: number, itemH: number, headerH: number): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const b = this.boardRect;
    const area = { x: 8, y: headerH - 6, w: W - 16, h: H - headerH - 2 };
    const avoid = { x: b.x - 22, y: b.y - 22, w: b.w + 44, h: b.h + 70 };
    const spots = scatterAround(this.views.length, itemW * 0.8, itemH * 0.8, area, avoid, Math.random);
    const order = Phaser.Utils.Array.Shuffle(this.views.slice());
    order.forEach((v, i) => {
      v.box.setPosition(spots[i].x, spots[i].y).setScale(this.trayScale).setDepth(++this.topZ);
      v.box.setAlpha(0);
      // pieces tumble onto the table
      this.tweens.add({
        targets: v.box,
        alpha: 1,
        y: { from: spots[i].y - 40, to: spots[i].y },
        delay: 120 + i * 28,
        duration: 360,
        ease: "Back.easeOut",
      });
    });
  }

  /* --------------------------------------------------------- interaction */

  private viewOf(obj: Phaser.GameObjects.GameObject): PieceView | undefined {
    return obj.getData?.("view") as PieceView | undefined;
  }

  private onDragStart(_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject): void {
    const v = this.viewOf(obj);
    if (!v || v.placed || this.done) return;
    v.dragging = true;
    Sfx.unlock();
    Sfx.pickup();
    this.input.setDefaultCursor("grabbing");
    v.box.setDepth(++this.topZ + 1000);
    this.tweens.killTweensOf(v.box);
    this.tweens.add({ targets: v.box, scale: 1.05, duration: 140, ease: "Back.easeOut" });
    this.tweens.add({ targets: v.shadow, x: 8, y: 16, alpha: 0.45, duration: 140 });
    // a soft warm glow around the lifted piece (WebGL only — harmless no-op otherwise)
    v.pic.preFX?.clear();
    v.pic.preFX?.addGlow(0xfff2c0, 3, 0, false, 0.1, 10);
  }

  private onDrag(_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject, dragX: number, dragY: number): void {
    const v = this.viewOf(obj);
    if (!v || v.placed || this.done) return;
    v.box.setPosition(dragX, dragY);
  }

  private onDragEnd(_p: Phaser.Input.Pointer, obj: Phaser.GameObjects.GameObject): void {
    const v = this.viewOf(obj);
    this.input.setDefaultCursor("default");
    if (!v || v.placed || this.done) return;
    v.dragging = false;
    v.pic.preFX?.clear();
    const d = Phaser.Math.Distance.Between(v.box.x, v.box.y, v.target.x, v.target.y);
    if (d <= this.snapR) {
      this.snap(v);
      return;
    }
    // not its spot: simply set it back down where it was dropped, still draggable
    const W = this.scale.width;
    const H = this.scale.height;
    const hw = (v.pic.displayWidth * this.trayScale) / 2;
    const hh = (v.pic.displayHeight * this.trayScale) / 2;
    const x = Phaser.Math.Clamp(v.box.x, hw, W - hw);
    const y = Phaser.Math.Clamp(v.box.y, hh + 60, H - hh);
    v.box.setDepth(++this.topZ);
    this.tweens.add({ targets: v.box, x, y, scale: this.trayScale, duration: 200, ease: "Sine.easeOut" });
    this.tweens.add({ targets: v.shadow, x: 3, y: 6, alpha: 0.35, duration: 200 });
  }

  private snap(v: PieceView, quiet = false): void {
    v.placed = true;
    v.dragging = false;
    if (this.pieceHint?.view === v) this.endPieceHint();
    v.box.disableInteractive();
    this.input.setDraggable(v.box, false);
    v.box.setDepth(10 + v.piece.index * 0.01);
    this.placedCount++;
    this.tweens.killTweensOf(v.box);
    this.tweens.add({ targets: v.shadow, x: 0, y: 0, alpha: 0, duration: 160 });
    this.tweens.add({
      targets: v.box,
      x: v.target.x,
      y: v.target.y,
      scale: 1,
      duration: quiet ? 120 : 200,
      ease: "Back.easeOut",
      onComplete: () => {
        if (quiet) return;
        this.tweens.add({ targets: v.box, scale: 1.07, duration: 90, yoyo: true, ease: "Sine.easeOut" });
        this.flashOutline(v.piece);
        sparkleBurst(this, v.target.x, v.target.y, 9, Math.min(60, v.pic.displayWidth * 0.4));
      },
    });
    if (!quiet) {
      Sfx.snap();
      this.time.delayedCall(90, () => Sfx.sparkle());
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(12);
    }
    this.updateProgress(!quiet);
    if (this.placedCount >= this.views.length) this.time.delayedCall(quiet ? 150 : 320, () => this.complete());
  }

  /** A bright outline that traces the piece's real shape and fades — the "click" you can see. */
  private flashOutline(pc: OrganicPiece): void {
    const g = this.add.graphics().setDepth(60);
    const pts = pc.outline.map((pt) => this.boardPoint(pt.x, pt.y));
    g.lineStyle(6, 0xfff4c8, 0.55);
    g.strokePoints(pts, true);
    g.lineStyle(2.5, 0xffffff, 1);
    g.strokePoints(pts, true);
    this.tweens.add({ targets: g, alpha: 0, duration: 520, ease: "Sine.easeIn", onComplete: () => g.destroy() });
  }

  private updateProgress(pop: boolean): void {
    this.progressText.setText(`${this.placedCount} / ${this.views.length} pieces`);
    if (pop) this.tweens.add({ targets: this.progressText, scale: 1.12, duration: 110, yoyo: true, ease: "Sine.easeOut" });
  }

  private onBack(): void {
    Sfx.tap();
    if (this.closing || this.done) return;
    if (!this.backArmed) {
      this.backArmed = true;
      const label = this.backBtn?.list.find((o) => o instanceof Phaser.GameObjects.Text) as Phaser.GameObjects.Text | undefined;
      label?.setText("Leave?");
      this.time.delayedCall(2200, () => {
        this.backArmed = false;
        label?.setText("‹ Back");
      });
      return;
    }
    this.leave();
  }

  /** Leave without finishing — nothing is lost but this table's layout. */
  private leave(): void {
    if (this.closing) return;
    this.closing = true;
    this.registry.set("pointerOnUI", false);
    this.cameras.main.fadeOut(200, 12, 20, 40);
    this.time.delayedCall(210, () => {
      this.scene.stop();
      this.scene.resume("FrostedValley");
    });
  }

  /* --------------------------------------------------------------- hints */

  /** The small frosted "💡 HINT" pill in the header's top-right corner. */
  private buildHintButton(x: number, y: number): Phaser.GameObjects.Container {
    const w = 128;
    const h = 46;
    const c = this.add.container(x, y).setDepth(960);
    const glow = this.add.image(0, 0, "glow").setDisplaySize(w * 1.7, h * 2.6).setTint(0xffe6a3).setAlpha(0.28);
    const g = this.add.graphics();
    g.fillStyle(0x050a18, 0.35);
    g.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, h / 2);
    g.fillStyle(0xeaf6ff, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    g.lineStyle(2.5, 0x9cc8e8, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    g.fillStyle(0xffffff, 0.6);
    g.fillRoundedRect(-w / 2 + 12, -h / 2 + 5, w - 24, h * 0.28, h * 0.14);
    const t = this.add.text(0, 1, "💡 HINT", { ...titleStyle(19), color: "#24476e" }).setOrigin(0.5);
    c.add([glow, g, t]);
    this.tweens.add({ targets: glow, alpha: 0.1, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    c.setSize(w + 16, h + 12);
    c.setInteractive(new Phaser.Geom.Rectangle(0, 0, w + 16, h + 12), Phaser.Geom.Rectangle.Contains);
    if (c.input) c.input.cursor = "pointer";
    c.on("pointerdown", () => this.tweens.add({ targets: c, scale: 0.92, duration: 70 }));
    c.on("pointerup", () => {
      this.tweens.add({ targets: c, scale: 1, duration: 140, ease: "Back.easeOut" });
      Sfx.unlock();
      Sfx.tap();
      this.toggleHintMenu();
    });
    c.on("pointerout", () => this.tweens.add({ targets: c, scale: 1, duration: 100 }));
    return c;
  }

  /** Open/close the compact hint menu that drops down under the HINT button. */
  private toggleHintMenu(open = !this.hintMenu): void {
    if (!open || this.done) {
      const m = this.hintMenu;
      this.hintMenu = undefined;
      if (m) this.tweens.add({ targets: m, alpha: 0, scale: 0.94, duration: 140, onComplete: () => m.destroy() });
      return;
    }
    if (this.hintMenu) this.hintMenu.destroy();
    const W = this.scale.width;
    const H = this.scale.height;
    const btn = this.hintBtn!;
    const mw = 300;
    const rowH = 64;
    const mh = 56 + rowH * 2 + 16;
    const mx = Math.min(btn.x + 64 - mw, W - mw - 12);
    const my = btn.y + 34;

    const menu = this.add.container(0, 0).setDepth(20000);
    // tap anywhere else to close — also keeps pieces from being grabbed underneath
    const catcher = this.add.rectangle(0, 0, W, H, 0x000000, 0.001).setOrigin(0, 0).setInteractive();
    catcher.on("pointerup", () => this.toggleHintMenu(false));
    menu.add(catcher);

    const panel = this.add.container(mx, my);
    const g = this.add.graphics();
    g.fillStyle(0x050a18, 0.4);
    g.fillRoundedRect(2, 6, mw, mh, 20);
    g.fillStyle(0x1d3158, 0.97);
    g.fillRoundedRect(0, 0, mw, mh, 20);
    g.lineStyle(2, 0x9cc8e8, 0.9);
    g.strokeRoundedRect(0, 0, mw, mh, 20);
    g.fillStyle(0xffffff, 0.08);
    g.fillRoundedRect(8, 6, mw - 16, 14, 7);
    panel.add(g);
    // swallow taps on the panel body so they don't close the menu
    const body = this.add.rectangle(0, 0, mw, mh, 0x000000, 0.001).setOrigin(0, 0).setInteractive();
    panel.add(body);
    panel.add(this.add.text(18, 18, "💡 HINTS", { ...titleStyle(18), color: "#fef6e8" }));
    panel.add(
      this.add
        .text(mw - 18, 20, `🪙 ${economy.coins}`, { ...titleStyle(16), color: "#ffe6a3" })
        .setOrigin(1, 0),
    );

    const pieceFree = this.hints.freeLeft("piece");
    this.buildHintRow(panel, 10, 52, mw - 20, rowH, "image", "🔍 See Image", this.imagePreview ? "Showing now…" : "Frosted preview · 10 seconds");
    this.buildHintRow(
      panel,
      10,
      52 + rowH + 4,
      mw - 20,
      rowH,
      "piece",
      "✨ Find a Piece",
      pieceFree > 0 ? `${pieceFree} free hint${pieceFree > 1 ? "s" : ""} left` : "Shows where one piece goes",
    );
    menu.add(panel);

    panel.setAlpha(0).setScale(0.94);
    this.tweens.add({ targets: panel, alpha: 1, scale: 1, duration: 170, ease: "Back.easeOut" });
    this.hintMenu = menu;
  }

  private buildHintRow(
    panel: Phaser.GameObjects.Container,
    x: number,
    y: number,
    w: number,
    h: number,
    kind: HintKind,
    label: string,
    sub: string,
  ): void {
    const price = this.hints.priceOf(kind);
    const busy = kind === "image" && !!this.imagePreview;
    const affordable = this.hints.canUse(kind);
    const enabled = affordable && !busy;

    const row = this.add.container(x, y);
    const g = this.add.graphics();
    g.fillStyle(enabled ? 0x2b4777 : 0x25365a, 1);
    g.fillRoundedRect(0, 0, w, h, 14);
    g.lineStyle(1.5, enabled ? 0x7fb4dd : 0x3f5680, 1);
    g.strokeRoundedRect(0, 0, w, h, 14);
    row.add(g);
    row.add(this.add.text(14, 11, label, { ...titleStyle(17), color: enabled ? "#fef6e8" : "#9aa9c2" }));
    row.add(this.add.text(14, 36, sub, bodyStyle(12, enabled ? "#b9d3ee" : "#7f8ea8")));

    // the price tag: FREE, 20 🪙, or a clear "can't afford" state
    let tag: string;
    let tagFill: number;
    let tagColor: string;
    if (busy) {
      tag = "⏳";
      tagFill = 0x3a4f78;
      tagColor = "#cfe2f5";
    } else if (price === 0) {
      tag = "FREE";
      tagFill = 0x3f8a5c;
      tagColor = "#eafff0";
    } else if (affordable) {
      tag = `${price} 🪙`;
      tagFill = 0xe8b64c;
      tagColor = "#4a3000";
    } else {
      tag = `Need ${price} 🪙`;
      tagFill = 0x55607a;
      tagColor = "#d6dbe6";
    }
    const tt = this.add.text(0, 0, tag, { ...titleStyle(13), color: tagColor }).setOrigin(0.5);
    const tw = Math.max(52, tt.width + 20);
    const tg = this.add.graphics();
    tg.fillStyle(tagFill, 1);
    tg.fillRoundedRect(w - 12 - tw, h / 2 - 14, tw, 28, 14);
    tt.setPosition(w - 12 - tw / 2, h / 2);
    row.add([tg, tt]);

    // a Container's hit test adds its displayOrigin (size / 2) to the local point;
    // this row is drawn from (0,0), so the hit rect starts at (w/2, h/2)
    row.setSize(w, h);
    row.setInteractive(new Phaser.Geom.Rectangle(w / 2, h / 2, w, h), Phaser.Geom.Rectangle.Contains);
    if (row.input) row.input.cursor = enabled ? "pointer" : "not-allowed";
    row.on("pointerup", () => {
      if (busy) return;
      if (!affordable) {
        Sfx.returnTile();
        this.tweens.add({ targets: row, x: { from: x - 6, to: x }, duration: 260, ease: "Elastic.easeOut" });
        this.toast(`You need ${price} 🪙 for another hint`);
        return;
      }
      this.toggleHintMenu(false);
      this.useHint(kind);
    });
    panel.add(row);
  }

  /** Spend (if needed) and run a hint. Never charges for a hint that can't run. */
  private useHint(kind: HintKind): boolean {
    if (this.done) return false;
    if (kind === "image" && this.imagePreview) return false;
    if (kind === "piece" && !this.pickHintPiece()) return false;
    const { ok, paid } = this.hints.use(kind);
    if (!ok) {
      this.toast(`You need ${this.hints.priceOf(kind)} 🪙 for another hint`);
      return false;
    }
    if (paid > 0) {
      Sfx.coin();
      this.toast(`−${paid} 🪙`);
    }
    if (kind === "image") this.startImagePreview();
    else this.startPieceHint();
    return true;
  }

  /** A short message floating above the progress pill. */
  private toast(msg: string): void {
    const t = this.add
      .text(this.scale.width / 2, this.progressText.y - 40, msg, {
        ...titleStyle(16),
        color: "#fef6e8",
        backgroundColor: "#1d3158ee",
        padding: { x: 14, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(21000)
      .setAlpha(0);
    this.tweens.add({
      targets: t,
      alpha: 1,
      y: t.y - 10,
      duration: 180,
      onComplete: () => this.tweens.add({ targets: t, alpha: 0, delay: 1500, duration: 300, onComplete: () => t.destroy() }),
    });
  }

  /* ---- A. image preview: a dark, frosted glimpse of the whole picture for 10s */

  private startImagePreview(): void {
    const { x, y, w, h } = this.boardRect;
    Sfx.whoosh();
    // sits between the board and the placed pieces, so it fills only the gaps
    const img = this.add
      .image(x + w / 2, y + h / 2, this.def.puzzle.image)
      .setDisplaySize(w, h)
      .setTint(0x6b7fa6)
      .setAlpha(0)
      .setDepth(6);
    img.preFX?.addBlur(1, 1.2, 1.2, 1.1);
    const frost = this.add.rectangle(x, y, w, h, 0xd6ecff, 0).setOrigin(0, 0).setDepth(6.1);
    this.tweens.add({ targets: img, alpha: 0.6, duration: 450, ease: "Sine.easeOut" });
    this.tweens.add({ targets: frost, fillAlpha: 0.1, duration: 450 });

    // small unobtrusive indicator in the board's top-right corner + a draining bar
    const pill = this.add.container(x + w - 12, y + 12).setDepth(950);
    const bg = this.add.graphics();
    bg.fillStyle(0x0c1428, 0.78);
    bg.fillRoundedRect(-170, 0, 170, 40, 14);
    const label = this.add.text(-158, 7, "", { ...titleStyle(14), color: "#fef6e8" });
    const barBg = this.add.rectangle(-158, 30, 146, 4, 0xffffff, 0.18).setOrigin(0, 0.5);
    const bar = this.add.rectangle(-158, 30, 146, 4, 0xffe6a3, 1).setOrigin(0, 0.5);
    pill.add([bg, label, barBg, bar]);
    pill.setAlpha(0);
    this.tweens.add({ targets: pill, alpha: 1, duration: 300 });
    this.tweens.add({ targets: bar, scaleX: 0, duration: IMAGE_HINT_SECONDS * 1000, ease: "Linear" });

    let left = IMAGE_HINT_SECONDS;
    label.setText(`💡 IMAGE HINT   ${left}s`);
    const timer = this.time.addEvent({
      delay: 1000,
      repeat: IMAGE_HINT_SECONDS - 1,
      callback: () => {
        left--;
        label.setText(`💡 IMAGE HINT   ${left}s`);
        if (left <= 0) this.endImagePreview();
      },
    });
    this.imagePreview = { objects: [img, frost, pill], timer };
  }

  private endImagePreview(instant = false): void {
    const p = this.imagePreview;
    if (!p) return;
    this.imagePreview = undefined;
    p.timer.remove(false);
    for (const o of p.objects) {
      if (instant) o.destroy();
      else this.tweens.add({ targets: o, alpha: 0, duration: 500, ease: "Sine.easeIn", onComplete: () => o.destroy() });
    }
  }

  /* ---- B/C. piece location: "this piece goes HERE" — never places it */

  private pickHintPiece(): PieceView | undefined {
    const W = this.scale.width;
    const H = this.scale.height;
    const byIndex = new Map(this.views.map((v) => [v.piece.index, v]));
    const { cols, rows } = this.def.puzzle;
    const idx = chooseHintPiece(
      this.views.map((v) => {
        const { col, row } = v.piece;
        const n = [
          [col - 1, row],
          [col + 1, row],
          [col, row - 1],
          [col, row + 1],
        ].filter(([c, r]) => c >= 0 && r >= 0 && c < cols && r < rows && byIndex.get(r * cols + c)?.placed).length;
        const hw = (v.pic.displayWidth * v.box.scaleX) / 2;
        const hh = (v.pic.displayHeight * v.box.scaleY) / 2;
        return {
          index: v.piece.index,
          placed: v.placed,
          dragging: v.dragging,
          hinted: v.hinted,
          onScreen: v.box.x - hw >= 0 && v.box.x + hw <= W && v.box.y - hh >= this.headerH - 20 && v.box.y + hh <= H,
          border: Object.values(v.piece.edges).includes(0),
          placedNeighbours: n,
        };
      }),
      Math.random,
    );
    return idx === null ? undefined : byIndex.get(idx);
  }

  private startPieceHint(): void {
    const v = this.pickHintPiece();
    if (!v) return;
    this.endPieceHint();
    v.hinted = true;
    Sfx.bloomChime();

    const objects: Phaser.GameObjects.GameObject[] = [];
    const timers: Phaser.Time.TimerEvent[] = [];

    // 1) the piece: lifted to the top of the pile with a gentle bounce + glow
    v.box.setDepth(++this.topZ);
    this.tweens.add({ targets: v.box, scale: this.trayScale * 1.12, duration: 180, yoyo: true, repeat: 1, ease: "Sine.easeInOut" });
    const glow = v.pic.preFX?.addGlow(0x9fe4ff, 4, 0, false, 0.1, 12);
    if (glow) this.tweens.add({ targets: glow, outerStrength: 7, duration: 520, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    // 2) the destination: its own cut shape, outlined in pulsing ice-light (no picture)
    const pts = v.piece.outline.map((pt) => this.boardPoint(pt.x, pt.y));
    const slot = this.add.graphics().setDepth(9);
    slot.fillStyle(0xbfeaff, 0.16);
    slot.fillPoints(pts, true);
    slot.lineStyle(9, 0x7fd6ff, 0.45);
    slot.strokePoints(pts, true);
    slot.lineStyle(3, 0xffffff, 1);
    slot.strokePoints(pts, true);
    slot.setAlpha(0);
    this.tweens.add({ targets: slot, alpha: 1, duration: 260 });
    this.tweens.add({ targets: slot, alpha: 0.4, duration: 520, delay: 260, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    objects.push(slot);
    sparkleBurst(this, v.target.x, v.target.y, 10, 40, 0x9fe4ff);
    timers.push(this.time.addEvent({ delay: 700, repeat: 5, callback: () => sparkleBurst(this, v.target.x, v.target.y, 4, 30, 0xcff1ff) }));

    // 3) a magical trail of sparkles flowing piece → destination
    const shoot = () => {
      if (v.placed) return;
      const sx = v.box.x;
      const sy = v.box.y;
      const mx = (sx + v.target.x) / 2;
      const my = Math.min(sy, v.target.y) - 60;
      for (let i = 0; i < 7; i++) {
        const s = this.add.image(sx, sy, "spark").setTint(0xbfeaff).setBlendMode(Phaser.BlendModes.ADD).setScale(0.45).setDepth(9500);
        objects.push(s);
        const p = { t: 0 };
        this.tweens.add({
          targets: p,
          t: 1,
          delay: i * 70,
          duration: 700,
          ease: "Sine.easeInOut",
          onUpdate: () => {
            const k = p.t;
            const m = 1 - k;
            s.setPosition(m * m * sx + 2 * m * k * mx + k * k * v.target.x, m * m * sy + 2 * m * k * my + k * k * v.target.y);
            s.setAlpha(Math.sin(Math.PI * k));
          },
          onComplete: () => s.destroy(),
        });
      }
    };
    shoot();
    timers.push(this.time.addEvent({ delay: 1100, repeat: 2, callback: shoot }));

    // 4) everything fades after a few seconds; the player places the piece themselves
    timers.push(this.time.delayedCall(5200, () => this.endPieceHint()));
    this.pieceHint = { view: v, objects, timers };
  }

  private endPieceHint(): void {
    const h = this.pieceHint;
    if (!h) return;
    this.pieceHint = undefined;
    h.timers.forEach((t) => t.remove(false));
    // the piece keeps its drag glow if it's being held right now
    if (!h.view.dragging) h.view.pic.preFX?.clear();
    for (const o of h.objects) {
      if (!o.active) continue;
      this.tweens.killTweensOf(o);
      this.tweens.add({ targets: o, alpha: 0, duration: 450, onComplete: () => o.destroy() });
    }
  }

  /* ---------------------------------------------------------- completion */

  private complete(): void {
    if (this.done) return;
    this.done = true;
    this.toggleHintMenu(false);
    this.endImagePreview(true);
    this.endPieceHint();
    // commit first: a reload from here on resumes at the unlock cinematic
    frostedProgression.markPuzzleSolved(this.def.id);

    const { x, y, w, h } = this.boardRect;
    const cx = x + w / 2;
    const cy = y + h / 2;
    this.chrome.forEach((o) => this.tweens.add({ targets: o, alpha: 0, duration: 260 }));
    this.backBtn?.disableInteractive();
    this.tweens.add({ targets: this.progressText, alpha: 0, duration: 400, delay: 600 });

    // ripple outward from the centre: every piece gives one last happy bounce
    const maxD = Math.hypot(w / 2, h / 2);
    for (const v of this.views) {
      const dd = Phaser.Math.Distance.Between(cx, cy, v.target.x, v.target.y) / maxD;
      this.tweens.add({ targets: v.box, scale: 1.045, delay: dd * 380, duration: 140, yoyo: true, ease: "Sine.easeInOut" });
    }

    Sfx.complete();
    this.time.delayedCall(420, () => {
      // the clean, seamless picture replaces the pieces
      this.finished = this.add.image(cx, cy, this.def.puzzle.image).setDisplaySize(w, h).setDepth(40).setAlpha(0);
      this.tweens.add({
        targets: this.finished,
        alpha: 1,
        duration: 380,
        onComplete: () => this.views.forEach((v) => v.box.setVisible(false)),
      });
      const burst = this.add.image(cx, cy, "glow").setDepth(45).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(w * 0.6, w * 0.6).setAlpha(0);
      this.tweens.add({
        targets: burst,
        alpha: 0.75,
        displayWidth: w * 1.3,
        displayHeight: w * 1.3,
        duration: 420,
        yoyo: true,
        onComplete: () => burst.destroy(),
      });
      sparkleBurst(this, cx, cy, 30, w * 0.45);
      sparkleBurst(this, cx - w * 0.3, cy, 12, w * 0.2);
      sparkleBurst(this, cx + w * 0.3, cy, 12, w * 0.2);
      this.cameras.main.flash(260, 255, 250, 235);
      this.cameras.main.zoomTo(1.02, 500, "Sine.easeInOut", false, (_c: Phaser.Cameras.Scene2D.Camera, p: number) => {
        if (p >= 1) this.cameras.main.zoomTo(1, 600, "Sine.easeInOut");
      });
      Sfx.fanfare();

      this.title.setText("🧩✨ PUZZLE COMPLETE!");
      this.tweens.add({ targets: this.title, scale: { from: 0.6, to: 1 }, duration: 420, ease: "Back.easeOut" });
    });

    this.time.delayedCall(1700, () => this.playLiving());
  }

  /* ------------------------------------------------- the picture comes alive */

  private playLiving(): void {
    const img = this.finished;
    if (!img) return;
    const rig = LIVING_RIGS[this.def.id];
    const src = this.textures.get(this.def.puzzle.image).getSourceImage() as { width: number; height: number };
    const texW = src.width;
    const texH = src.height;
    const W = this.scale.width;
    const H = this.scale.height;
    const base = { ...this.boardRect };

    // overlays live in image-pixel space inside a container that follows the image
    const layer = this.add.container(base.x, base.y).setDepth(46).setScale(this.boardScale);
    // no caption swap here: "PUZZLE COMPLETE!" simply stays, softened, while the picture comes alive
    this.tweens.add({ targets: this.title, alpha: 0.85, duration: 800 });

    let pipe: LivingArtPipeline | null = null;
    if (this.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer && rig) {
      img.setPostPipeline(LivingArtPipeline.KEY);
      const got = img.getPostPipeline(LivingArtPipeline.KEY);
      pipe = (Array.isArray(got) ? got[0] : got) as LivingArtPipeline | null;
      pipe?.setRig(rig, texW / texH);
    }

    if (rig) this.buildLivingOverlays(layer, rig, texW, texH);

    Sfx.bloomChime();
    const focus = rig?.focus ?? [0.5, 0.5];
    const start = this.time.now;
    const tick = () => {
      const t = this.debugLivingT ?? (this.time.now - start) / 1000;
      // a slow, gentle push-in that drifts toward the animal — framed like a
      // camera INSIDE the picture frame: the art grows but is cropped to the board
      const k = Phaser.Math.Easing.Sine.InOut(Math.min(1, t / LIVING_DURATION));
      const z = 1 + 0.07 * k;
      const w = base.w * z;
      const h = base.h * z;
      const fx0 = base.x + focus[0] * base.w;
      const fy0 = base.y + focus[1] * base.h;
      const fx = fx0 + (W / 2 - fx0) * 0.35 * k;
      const fy = fy0 + (base.y + base.h / 2 - fy0) * 0.35 * k;
      // never uncover the board edge
      const x = Phaser.Math.Clamp(fx - focus[0] * w, base.x + base.w - w, base.x);
      const y = Phaser.Math.Clamp(fy - focus[1] * h, base.y + base.h - h, base.y);
      const s = w / texW;
      img.setDisplaySize(w, h).setPosition(x + w / 2, y + h / 2);
      img.setCrop((base.x - x) / s, (base.y - y) / s, base.w / s, base.h / s);
      layer.setPosition(x, y).setScale(s);
      if (pipe) {
        pipe.setImageRect(x, y, w, h, W, H);
        const frame = livingFrame(this.def.id, t);
        if (frame) pipe.applyFrame(frame);
      } else {
        // Canvas fallback (no post-FX): the push-in, lights and particles still play
      }
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, tick);
    tick();

    this.time.delayedCall(LIVING_DURATION * 1000, () => {
      this.events.off(Phaser.Scenes.Events.UPDATE, tick);
      this.returnToWorld();
    });
  }

  private buildLivingOverlays(layer: Phaser.GameObjects.Container, rig: (typeof LIVING_RIGS)[string], texW: number, texH: number): void {
    // glowing lights: lanterns, crystals, sun, cave — each breathing on its own rhythm
    for (const g of rig.glows) {
      const d = g.r * texW * 2;
      const img = this.add.image(g.x * texW, g.y * texH, "glow").setDisplaySize(d, d).setTint(g.color).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
      layer.add(img);
      this.tweens.add({ targets: img, alpha: { from: 0, to: 0.5 }, duration: 900, ease: "Sine.easeOut" });
      this.tweens.add({
        targets: img,
        scale: img.scale * 1.18,
        alpha: 0.28,
        duration: 1100 + Math.random() * 700,
        delay: 900,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    // glints dancing on water / ice / snow
    const twinkle = (u0: number, v0: number, u1: number, v1: number, size: number) => {
      const s = this.add
        .image(Phaser.Math.FloatBetween(u0, u1) * texW, Phaser.Math.FloatBetween(v0, v1) * texH, "spark")
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0)
        .setAngle(Math.random() * 90);
      layer.add(s);
      this.tweens.add({
        targets: s,
        scale: size * (0.6 + Math.random() * 0.8),
        angle: s.angle + 45,
        duration: 340,
        yoyo: true,
        ease: "Sine.easeInOut",
        onComplete: () => s.destroy(),
      });
    };
    this.time.addEvent({
      delay: 70,
      repeat: Math.floor((LIVING_DURATION * 1000) / 70),
      callback: () => {
        for (const r of rig.shimmer) twinkle(r[0], r[1], r[2], r[3], 0.9);
        if (Math.random() < 0.5) twinkle(0.03, 0.03, 0.97, 0.97, 0.7);
      },
    });

    // the frozen waterfall flows again — sparkles tumbling down the falls
    if (rig.cascade) {
      const [u0, v0, u1, v1] = rig.cascade;
      layer.add(
        this.add.particles(0, 0, "spark", {
          x: { min: u0 * texW, max: u1 * texW },
          y: v0 * texH,
          lifespan: { min: 900, max: 1500 },
          speedY: { min: ((v1 - v0) * texH) / 1.6, max: ((v1 - v0) * texH) / 1.0 },
          scale: { start: 0.55, end: 0.1 },
          alpha: { start: 0.9, end: 0 },
          blendMode: Phaser.BlendModes.ADD,
          frequency: 45,
        }),
      );
    }

    // gentle snowfall inside the picture + a few magic motes drifting up
    layer.add(
      this.add.particles(0, 0, "fv_snow_dot", {
        x: { min: 0, max: texW },
        y: -10,
        lifespan: { min: 5000, max: 8000 },
        speedY: { min: 90, max: 170 },
        speedX: { min: -25, max: 25 },
        scale: { min: 0.8, max: 2.2 },
        alpha: { start: 0.85, end: 0.2 },
        frequency: 55,
        advance: 3000,
      }),
    );
    layer.add(
      this.add.particles(0, 0, "spark", {
        x: { min: texW * 0.15, max: texW * 0.85 },
        y: texH * 0.95,
        lifespan: { min: 2600, max: 4200 },
        speedY: { min: -150, max: -80 },
        speedX: { min: -20, max: 20 },
        scale: { start: 0.45, end: 0 },
        alpha: { start: 0.9, end: 0 },
        tint: [0xfff2c4, 0xd9b8ff, 0xbfeaff],
        blendMode: Phaser.BlendModes.ADD,
        frequency: 160,
      }),
    );

    // mask everything to the picture so nothing spills onto the table
    const m = this.make.graphics({}, false);
    const update = () => {
      m.clear();
      m.fillStyle(0xffffff);
      m.fillRect(this.boardRect.x, this.boardRect.y, this.boardRect.w, this.boardRect.h);
    };
    update();
    layer.setMask(m.createGeometryMask());
    this.events.on(Phaser.Scenes.Events.UPDATE, update);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.events.off(Phaser.Scenes.Events.UPDATE, update));
  }

  private returnToWorld(): void {
    if (this.closing) return;
    this.closing = true;
    const animalId = this.def.id;
    this.cameras.main.fadeOut(700, 236, 246, 255);
    this.time.delayedCall(720, () => {
      this.registry.set("pointerOnUI", false);
      this.scene.stop();
      this.scene.resume("FrostedValley");
      const fv = this.scene.get("FrostedValley") as FrostedValleyScene;
      void fv.playUnlockCinematic(animalId);
    });
  }

  /** DEV: snap every remaining piece (or all but `leave` of them) into place. */
  private forceSolve(leave = 0): void {
    const rest = this.views.filter((v) => !v.placed);
    rest.slice(0, Math.max(0, rest.length - leave)).forEach((v) => this.snap(v, true));
  }
}
