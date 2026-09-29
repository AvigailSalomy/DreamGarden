import Phaser from "phaser";
import { FONT_FAMILY } from "../ui/theme";
import { attachHit } from "../ui/hit";
import { safeInsets } from "../util/safeArea";
import { Sfx } from "../fx/Sfx";
import type { StoryNoteDef, StoryNoteKind } from "../data/frostedStory";

/** A screen-space rectangle (the thing the note must point at, and never cover). */
export interface NoteTarget {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type NoteResult = "confirm" | "dismiss" | "timeout";

export interface NoteLaunch {
  note: StoryNoteDef;
  /** What the note is about, in SCREEN coordinates; the note sits beside it with a little pointer. */
  target?: NoteTarget | null;
  /** Dim + swallow input underneath. Default: true when the note has a button. */
  blocking?: boolean;
  /** Arrive as a sealed envelope first. Default: story + objective notes. */
  envelope?: boolean;
  /** Where to sit when there's no target. */
  anchor?: "center" | "top-right";
  /** Wait before appearing — on this scene's own clock, so it works while the caller is paused. */
  delayMs?: number;
  onDone: (result: NoteResult) => void;
}

interface KindStyle {
  accent: number;
  accentDark: number;
  title: string;
  halo: number;
}

const KIND: Record<StoryNoteKind, KindStyle> = {
  story: { accent: 0x5aa9c9, accentDark: 0x3a7fa0, title: "#2f5f86", halo: 0xbfe8ff },
  objective: { accent: 0x4fa6cf, accentDark: 0x2f7aa3, title: "#1f5a7a", halo: 0xbfe8ff },
  tutorial: { accent: 0x9b82d6, accentDark: 0x6f58b0, title: "#5b3f8a", halo: 0xdcd0ff },
  celebration: { accent: 0xe8b24c, accentDark: 0xb9832a, title: "#8a5a00", halo: 0xffe6a3 },
};

const PAPER = 0xfffaf2;
const PAPER_EDGE = 0xdcebf5;
const INK = "#4f3f33";
const GAP = 26; // between the note and its target
const TAIL = 16;

/**
 * Frosted Valley's story note: a small magical envelope pops in beside
 * whatever it's about, the wax seal breaks, and a paper note unfolds out of
 * it — the same icy envelope language as FrostedLetterScene (see the
 * reference screenshot), just contextual instead of a full-screen letter.
 *
 * Runs as its own always-on-top scene in pure screen space (camera zoom 1),
 * so it stays crisp and readable no matter how far the world camera is
 * zoomed. Positioning picks whichever side of the target (left/right first,
 * then above/below) overlaps it least, clamps inside the safe screen area,
 * and grows a small pointer tail toward it.
 *
 * Launched only through story/StoryNotes.ts (which queues notes so two can
 * never stack); resolves `onDone` exactly once.
 */
export class FrostedNoteScene extends Phaser.Scene {
  static readonly KEY = "FrostedNote";

  private cfg!: NoteLaunch;
  private done = false;
  private opened = false;
  private blocking = false;
  private prevPointerOnUI: unknown = false;
  private root!: Phaser.GameObjects.Container;
  private noteBox!: Phaser.GameObjects.Container;
  private envelope?: Phaser.GameObjects.Container;
  private tapHint?: Phaser.GameObjects.Text;
  private autoTimer?: Phaser.Time.TimerEvent;
  private hovering = false;
  private notePos = { x: 0, y: 0 };
  private noteSize = { w: 0, h: 0 };

  constructor() {
    super(FrostedNoteScene.KEY);
  }

  init(data: NoteLaunch): void {
    this.cfg = data;
    this.done = false;
    this.opened = false;
    this.hovering = false;
    this.autoTimer = undefined;
    this.envelope = undefined;
    this.tapHint = undefined;
  }

  create(): void {
    this.scene.bringToTop();
    const note = this.cfg.note;
    this.blocking = this.cfg.blocking ?? !!note.button;
    this.root = this.add.container(0, 0);

    if (this.blocking) {
      this.prevPointerOnUI = this.registry.get("pointerOnUI");
      this.registry.set("pointerOnUI", true);
      this.buildScrim();
    }

    this.buildNote();
    this.place();

    const start = () => {
      const useEnvelope = this.cfg.envelope ?? (note.kind === "story" || note.kind === "objective");
      if (useEnvelope) this.showEnvelope();
      else this.reveal(false);
    };
    if (this.cfg.delayMs) this.time.delayedCall(this.cfg.delayMs, start);
    else start();
  }

  /* ------------------------------------------------------------ layout */

  private get kindStyle(): KindStyle {
    return KIND[this.cfg.note.kind];
  }

  /** A soft dim with a spotlight hole on the target, so the thing being talked about stays bright. */
  private buildScrim(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const scrim = this.add.rectangle(0, 0, W, H, 0x0d2333, 0.34).setOrigin(0, 0).setAlpha(0).setInteractive();
    this.root.add(scrim);
    this.tweens.add({ targets: scrim, alpha: 1, duration: 260 });
    scrim.on("pointerup", () => {
      if (!this.opened) this.open();
      else this.finish("dismiss");
    });

    const t = this.cfg.target;
    if (!t) return;
    const rx = Math.max(90, t.w * 0.62);
    const ry = Math.max(80, t.h * 0.62);
    if (this.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      const hole = this.make.graphics({}, false);
      hole.fillStyle(0xffffff);
      hole.fillEllipse(t.x + t.w / 2, t.y + t.h / 2, rx * 2, ry * 2);
      const mask = hole.createGeometryMask();
      mask.setInvertAlpha(true);
      scrim.setMask(mask);
    }
    // a gently breathing magic ring around the target
    const ring = this.add
      .image(t.x + t.w / 2, t.y + t.h / 2, "glow")
      .setDisplaySize(rx * 2.4, ry * 2.4)
      .setTint(this.kindStyle.halo)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    this.root.add(ring);
    this.tweens.add({ targets: ring, alpha: 0.2, duration: 500, ease: "Sine.easeOut" });
    this.tweens.add({ targets: ring, scale: ring.scale * 1.08, duration: 1100, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }

  /** Greedy word-wrap measured with the real font, one centred Text per line (keeps paragraph gaps exact). */
  private textLines(
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    maxW: number,
    lineGap: number,
    paraGap: number,
  ): { items: Phaser.GameObjects.Text[]; height: number } {
    const items: Phaser.GameObjects.Text[] = [];
    let y = 0;
    const probe = this.add.text(0, 0, "", style).setVisible(false);
    const paragraphs = text.split("\n");
    paragraphs.forEach((para) => {
      if (!para.trim()) {
        y += paraGap;
        return;
      }
      const words = para.split(" ");
      const lines: string[] = [];
      let cur = "";
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w;
        if (cur && probe.setText(next).width > maxW) {
          lines.push(cur);
          cur = w;
        } else cur = next;
      }
      if (cur) lines.push(cur);
      for (const line of lines) {
        const t = this.add.text(0, y, line, style).setOrigin(0.5, 0);
        items.push(t);
        y += t.height + lineGap;
      }
    });
    probe.destroy();
    return { items, height: Math.max(0, y - lineGap) };
  }

  private buildNote(): void {
    const note = this.cfg.note;
    const k = this.kindStyle;
    const W = this.scale.width;
    const small = note.kind === "tutorial" && !note.button;
    const titleOnly = !note.body;
    // a one-line celebration gets room to stay on one line
    const maxW = Math.min(small ? 340 : titleOnly ? 560 : 440, W - 32);
    const padX = 34;
    const padTop = titleOnly ? 26 : 38;
    const padBottom = 28;

    const box = this.add.container(0, 0);
    this.noteBox = box;

    const titleSize = titleOnly ? 28 : small ? 21 : 25;
    const title = this.textLines(
      note.title,
      { fontFamily: FONT_FAMILY, fontSize: `${titleSize}px`, fontStyle: "700", color: k.title },
      maxW - padX * 2,
      2,
      6,
    );
    const body = note.body
      ? this.textLines(
          note.body,
          { fontFamily: FONT_FAMILY, fontSize: `${small ? 16 : 18}px`, fontStyle: "500", color: INK },
          maxW - padX * 2,
          4,
          10,
        )
      : { items: [], height: 0 };

    const btnH = 52;
    const gapTitleBody = note.body ? 14 : 0;
    const gapBodyBtn = note.button ? 24 : 0;
    const h = padTop + title.height + gapTitleBody + body.height + gapBodyBtn + (note.button ? btnH : 0) + padBottom;
    const contentW = Math.max(...title.items.map((t) => t.width), ...body.items.map((t) => t.width), note.button ? 220 : 0);
    const w = Math.min(maxW, Math.max(small ? 260 : 300, contentW + padX * 2));
    this.noteSize = { w, h };

    // soft magic halo + drop shadow + the paper itself
    const halo = this.add.image(0, 0, "glow").setDisplaySize(w * 1.7, h * 1.9).setTint(k.halo).setAlpha(0.35);
    const g = this.add.graphics();
    g.fillStyle(0x1d3550, 0.22);
    g.fillRoundedRect(-w / 2 - 2, -h / 2 + 9, w + 4, h + 6, 28);
    g.fillStyle(PAPER_EDGE, 1);
    g.fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 27);
    g.fillStyle(PAPER, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 24);
    g.fillStyle(0xffffff, 0.55);
    g.fillRoundedRect(-w / 2 + 8, -h / 2 + 7, w - 16, Math.min(46, h * 0.22), 18);
    // frosted inner border
    g.lineStyle(2, k.accent, 0.28);
    g.strokeRoundedRect(-w / 2 + 9, -h / 2 + 9, w - 18, h - 18, 18);
    box.add([halo, g]);
    this.tweens.add({ targets: halo, alpha: 0.18, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    // tiny snowflakes in the corners
    const flake = (x: number, y: number, s: number, a: number) =>
      this.add.text(x, y, "❄", { fontFamily: FONT_FAMILY, fontSize: `${s}px`, color: "#8cc3e0" }).setOrigin(0.5).setAlpha(a);
    box.add([flake(-w / 2 + 24, -h / 2 + 24, 16, 0.55), flake(w / 2 - 24, -h / 2 + 24, 13, 0.45), flake(-w / 2 + 22, h / 2 - 22, 12, 0.35), flake(w / 2 - 22, h / 2 - 22, 16, 0.5)]);

    // a little icy seal medallion riding the top edge (not on title-only celebrations)
    if (!titleOnly) {
      const seal = this.add.container(0, -h / 2);
      const sg = this.add.graphics();
      sg.fillStyle(k.accentDark, 1);
      sg.fillCircle(0, 1.5, 15);
      sg.fillStyle(k.accent, 1);
      sg.fillCircle(0, 0, 15);
      sg.lineStyle(2, 0xffffff, 0.7);
      sg.strokeCircle(0, 0, 10.5);
      const glyph = this.add.text(0, 0, note.kind === "celebration" ? "★" : "❄", { fontFamily: FONT_FAMILY, fontSize: "14px", color: "#ffffff" }).setOrigin(0.5);
      seal.add([sg, glyph]);
      box.add(seal);
    }

    let y = -h / 2 + padTop;
    for (const t of title.items) {
      t.y += y;
      box.add(t);
    }
    y += title.height + gapTitleBody;
    for (const t of body.items) {
      t.y += y;
      box.add(t);
    }
    y += body.height + gapBodyBtn;

    if (note.button) box.add(this.makeButton(0, y + btnH / 2, note.button, btnH));

    // a paper-sized hit area: hovering pauses auto-dismiss; a tap dismisses a button-less note
    const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0.001);
    box.addAt(hit, 2);
    hit.setInteractive();
    hit.on("pointerover", () => (this.hovering = true));
    hit.on("pointerout", () => (this.hovering = false));
    if (!note.button) hit.on("pointerup", () => this.finish("dismiss"));

    box.setVisible(false);
    this.root.add(box);
  }

  private makeButton(x: number, y: number, label: string, h: number): Phaser.GameObjects.Container {
    const k = this.kindStyle;
    const c = this.add.container(x, y);
    const t = this.add
      .text(0, 1, label, { fontFamily: FONT_FAMILY, fontSize: "20px", fontStyle: "700", color: "#ffffff" })
      .setOrigin(0.5)
      .setShadow(0, 2, "rgba(20,50,80,0.35)", 3);
    const w = Math.max(190, t.width + 64);
    const g = this.add.graphics();
    g.fillStyle(k.accentDark, 1);
    g.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, h / 2);
    g.fillStyle(k.accent, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    g.fillStyle(0xffffff, 0.3);
    g.fillRoundedRect(-w / 2 + 12, -h / 2 + 5, w - 24, h * 0.36, h * 0.18);
    const sparkL = this.add.text(-w / 2 + 22, 0, "✦", { fontFamily: FONT_FAMILY, fontSize: "14px", color: "#ffffff" }).setOrigin(0.5).setAlpha(0.8);
    const sparkR = this.add.text(w / 2 - 22, 0, "✦", { fontFamily: FONT_FAMILY, fontSize: "14px", color: "#ffffff" }).setOrigin(0.5).setAlpha(0.8);
    c.add([g, sparkL, sparkR, t]);
    this.tweens.add({ targets: [sparkL, sparkR], alpha: 0.25, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    c.setSize(w, h);
    attachHit(this, c as unknown as Parameters<typeof attachHit>[1], w, h, {
      pad: 6,
      feedbackTarget: c,
      onTap: () => this.finish("confirm"),
    });
    return c;
  }

  /**
   * Beside the target, never on it: try left/right (preferring the side
   * away from the target, i.e. "object on the right → note on the left"),
   * then above/below; keep the candidate that overlaps it least once
   * clamped on-screen, and give it a pointer tail toward the target.
   */
  private place(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const inset = safeInsets();
    const { w, h } = this.noteSize;
    const minX = inset.left + 16 + w / 2;
    const maxX = W - inset.right - 16 - w / 2;
    const minY = inset.top + 84 + h / 2; // clear of the top HUD row (back / coins / hearts)
    const maxY = H - inset.bottom - 16 - h / 2;
    const clampX = (x: number) => (minX > maxX ? W / 2 : Phaser.Math.Clamp(x, minX, maxX));
    const clampY = (y: number) => (minY > maxY ? H / 2 : Phaser.Math.Clamp(y, minY, maxY));

    const t = this.cfg.target;
    if (!t) {
      if (this.cfg.anchor === "top-right") this.notePos = { x: clampX(W - inset.right - 16 - w / 2), y: clampY(0) };
      else this.notePos = { x: W / 2, y: clampY(H * 0.46) };
      return;
    }

    const tcx = t.x + t.w / 2;
    const tcy = t.y + t.h / 2;
    type Side = "left" | "right" | "above" | "below";
    const sides: Side[] = tcx > W / 2 ? ["left", "right", "above", "below"] : ["right", "left", "above", "below"];
    const overlap = (x: number, y: number) => {
      const ox = Math.max(0, Math.min(x + w / 2, t.x + t.w) - Math.max(x - w / 2, t.x));
      const oy = Math.max(0, Math.min(y + h / 2, t.y + t.h) - Math.max(y - h / 2, t.y));
      return ox * oy;
    };
    let best: { side: Side; x: number; y: number; score: number } | null = null;
    sides.forEach((side, i) => {
      let x = tcx;
      let y = tcy;
      if (side === "left") x = t.x - GAP - TAIL - w / 2;
      if (side === "right") x = t.x + t.w + GAP + TAIL + w / 2;
      if (side === "above") y = t.y - GAP - TAIL - h / 2;
      if (side === "below") y = t.y + t.h + GAP + TAIL + h / 2;
      x = clampX(x);
      y = clampY(y);
      const score = overlap(x, y) + i * 0.001; // earlier preference wins ties
      if (!best || score < best.score) best = { side, x, y, score };
    });
    const b = best as unknown as { side: Side; x: number; y: number };
    this.notePos = { x: b.x, y: b.y };
    this.addTail(b.side, tcx - b.x, tcy - b.y);
  }

  private addTail(side: "left" | "right" | "above" | "below", dx: number, dy: number): void {
    const { w, h } = this.noteSize;
    const g = this.add.graphics();
    g.fillStyle(PAPER_EDGE, 1);
    const tri = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number, grow: number) => {
      g.fillTriangle(ax, ay - grow, bx + grow, by, cx, cy + grow);
    };
    if (side === "left" || side === "right") {
      const s = side === "left" ? 1 : -1; // note is left of target → tail on its right edge
      const ex = (s * w) / 2;
      const ty = Phaser.Math.Clamp(dy, -h / 2 + 34, h / 2 - 34);
      tri(ex - s * 2, ty - 14, ex + s * TAIL, ty, ex - s * 2, ty + 14, 2);
      g.fillStyle(PAPER, 1);
      g.fillTriangle(ex - s * 4, ty - 12, ex + s * (TAIL - 3), ty, ex - s * 4, ty + 12);
    } else {
      const s = side === "above" ? 1 : -1; // note above target → tail on its bottom edge
      const ey = (s * h) / 2;
      const tx = Phaser.Math.Clamp(dx, -w / 2 + 34, w / 2 - 34);
      g.fillTriangle(tx - 15, ey - s * 2, tx, ey + s * (TAIL + 2), tx + 15, ey - s * 2);
      g.fillStyle(PAPER, 1);
      g.fillTriangle(tx - 12, ey - s * 4, tx, ey + s * (TAIL - 2), tx + 12, ey - s * 4);
    }
    this.noteBox.addAt(g, 2);
  }

  /* ------------------------------------------------------------ envelope */

  /** The icy wax-sealed envelope from the reference, popping in where the note will open. */
  private showEnvelope(): void {
    const envW = Phaser.Math.Clamp(this.scale.width * 0.11, 150, 210);
    const envH = envW * 0.68;
    const { x, y } = this.notePos;
    const env = this.add.container(x, y + 16).setScale(0).setAlpha(0);
    this.envelope = env;

    const shadow = this.add.ellipse(0, envH / 2 + 12, envW * 0.9, 18, 0x0d2333, 0.22);
    const halo = this.add.image(0, 0, "glow").setDisplaySize(envW * 2.2, envW * 2.2).setTint(0xbfe8ff).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.35);
    const body = this.add.graphics();
    body.fillStyle(0xeaf3fb, 1);
    body.fillRoundedRect(-envW / 2, -envH / 2, envW, envH, 12);
    // lower pocket folds
    body.fillStyle(0xdcebf6, 1);
    body.fillTriangle(-envW / 2 + 4, envH / 2 - 4, 0, 4, envW / 2 - 4, envH / 2 - 4);
    body.lineStyle(3, 0xbcd9ec, 1);
    body.strokeRoundedRect(-envW / 2, -envH / 2, envW, envH, 12);

    // the flap hinges on the top edge so it can flip open upward
    const flap = this.add.container(0, -envH / 2);
    const fg = this.add.graphics();
    fg.fillStyle(0xf3f9fe, 1);
    fg.fillTriangle(-envW / 2 + 3, 2, envW / 2 - 3, 2, 0, envH * 0.56);
    fg.lineStyle(2, 0xbcd9ec, 0.95);
    fg.beginPath();
    fg.moveTo(-envW / 2 + 3, 2);
    fg.lineTo(0, envH * 0.56);
    fg.lineTo(envW / 2 - 3, 2);
    fg.strokePath();
    flap.add(fg);

    const seal = this.add.container(0, -envH / 2 + envH * 0.56);
    const sealG = this.add.graphics();
    sealG.fillStyle(0x3f8fb3, 1);
    sealG.fillCircle(0, 2, envW * 0.1);
    sealG.fillStyle(0x5aa9c9, 1);
    sealG.fillCircle(0, 0, envW * 0.1);
    sealG.lineStyle(2, 0xdff3fb, 0.8);
    sealG.strokeCircle(0, 0, envW * 0.072);
    const sealGlyph = this.add.text(0, 0, "❄", { fontFamily: FONT_FAMILY, fontSize: `${Math.round(envW * 0.1)}px`, color: "#ffffff" }).setOrigin(0.5);
    seal.add([sealG, sealGlyph]);

    env.add([shadow, halo, body, flap, seal]);
    env.setData("flap", flap).setData("seal", seal).setData("halo", halo);
    // under the paper, so the unfolding note is never covered by its own envelope
    this.root.addAt(env, this.root.getIndex(this.noteBox));

    this.tapHint = this.add
      .text(x, y + envH / 2 + 44, "tap to open", { fontFamily: FONT_FAMILY, fontSize: "16px", fontStyle: "600", color: "#eaf6fb" })
      .setOrigin(0.5)
      .setShadow(0, 2, "rgba(10,30,50,0.55)", 4)
      .setAlpha(0);
    this.root.add(this.tapHint);

    Sfx.sparkle();
    this.tweens.add({
      targets: env,
      scale: 1,
      alpha: 1,
      y,
      duration: 420,
      ease: "Back.easeOut",
      onComplete: () => {
        if (this.opened) return;
        this.tweens.add({ targets: env, y: y - 7, duration: 1300, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
        this.tweens.add({ targets: env, angle: { from: -2, to: 2 }, duration: 1700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      },
    });
    this.tweens.add({ targets: this.tapHint, alpha: 0.95, delay: 300, duration: 300 });
    this.twinkleAround(x, y, envW * 0.75, 8);

    env.setSize(envW, envH);
    env.setInteractive(new Phaser.Geom.Rectangle(0, 0, envW, envH), Phaser.Geom.Rectangle.Contains);
    env.on("pointerup", () => this.open());
    // don't make anyone wait: it opens by itself after a beat
    this.time.delayedCall(1150, () => this.open());
  }

  private open(): void {
    if (this.opened || this.done) return;
    this.opened = true;
    const env = this.envelope;
    if (!env) {
      this.reveal(false);
      return;
    }
    Sfx.unlock();
    Sfx.sparkle();
    this.tweens.killTweensOf(env);
    env.setAngle(0);
    this.tapHint?.destroy();
    const flap = env.getData("flap") as Phaser.GameObjects.Container;
    const seal = env.getData("seal") as Phaser.GameObjects.Container;

    // seal pops, flap flips up, then the note unfolds out of the envelope
    this.tweens.add({ targets: seal, scale: 1.35, alpha: 0, duration: 200, ease: "Quad.easeOut" });
    this.burstSparks(env.x, env.y - 4, 10);
    this.tweens.add({ targets: flap, scaleY: -1, duration: 260, delay: 90, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: env, y: env.y + 30, scale: 0.8, alpha: 0, delay: 420, duration: 300, ease: "Quad.easeIn", onComplete: () => env.destroy() });
    this.time.delayedCall(300, () => this.reveal(true));
  }

  /** The paper arrives: from the envelope's mouth (or a gentle pop) to its final spot. */
  private reveal(fromEnvelope: boolean): void {
    this.opened = true;
    const box = this.noteBox;
    const { x, y } = this.notePos;
    box.setVisible(true).setPosition(x, fromEnvelope ? y + 20 : y + 10).setScale(fromEnvelope ? 0.3 : 0.7).setAlpha(0);
    this.tweens.add({ targets: box, x, y, scale: 1, alpha: 1, duration: fromEnvelope ? 460 : 340, ease: "Back.easeOut" });
    if (!fromEnvelope) Sfx.sparkle();
    if (this.cfg.note.kind === "celebration") {
      this.burstSparks(x, y, 22);
      Sfx.fanfare();
    }
    this.twinkleAround(x, y, Math.max(this.noteSize.w, this.noteSize.h) * 0.6, 10);

    const ms = this.cfg.note.durationMs;
    if (ms) {
      // pauses while the pointer rests on the note, so a slow reader isn't rushed
      let left = ms;
      this.autoTimer = this.time.addEvent({
        delay: 100,
        loop: true,
        callback: () => {
          if (!this.hovering) left -= 100;
          if (left <= 0) this.finish("timeout");
        },
      });
    }
  }

  /* ------------------------------------------------------------ sparkle */

  private burstSparks(x: number, y: number, n: number): void {
    if (!this.textures.exists("spark")) return;
    const p = this.add.particles(x, y, "spark", {
      lifespan: { min: 450, max: 900 },
      speed: { min: 40, max: 150 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0xffffff, 0xbfe8ff, 0xfff2c4],
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
    this.root.add(p);
    p.explode(n);
    this.time.delayedCall(1000, () => p.destroy());
  }

  /** Little snowflakes and glints drifting around the note for a few seconds. */
  private twinkleAround(x: number, y: number, r: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5;
      const rr = r * (0.85 + Math.random() * 0.35);
      const flake = this.add
        .text(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.75, i % 3 === 0 ? "✦" : "❄", {
          fontFamily: FONT_FAMILY,
          fontSize: `${10 + Math.round(Math.random() * 8)}px`,
          color: i % 3 === 0 ? "#fff2c4" : "#dff3ff",
        })
        .setOrigin(0.5)
        .setAlpha(0);
      this.root.add(flake);
      this.tweens.add({
        targets: flake,
        alpha: { from: 0, to: 0.9 },
        y: flake.y - 18 - Math.random() * 16,
        angle: Math.random() * 120 - 60,
        delay: i * 90,
        duration: 900,
        yoyo: true,
        hold: 500,
        ease: "Sine.easeInOut",
        onComplete: () => flake.destroy(),
      });
    }
  }

  /* ------------------------------------------------------------ done */

  private finish(result: NoteResult): void {
    if (this.done) return;
    // tapping the dim while the envelope is still sealed just opens it
    if (!this.opened && result === "dismiss") {
      this.open();
      return;
    }
    this.done = true;
    this.autoTimer?.remove();
    if (result === "confirm") Sfx.tap();
    const box = this.noteBox;
    this.tweens.add({ targets: box, scale: 0.9, alpha: 0, y: box.y - 10, duration: 220, ease: "Sine.easeIn" });
    const rest = this.root.list.filter((o) => o !== box);
    if (rest.length) this.tweens.add({ targets: rest, alpha: 0, duration: 240 });
    this.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 250,
      onComplete: () => {
        if (this.blocking) this.registry.set("pointerOnUI", this.prevPointerOnUI === true);
        const cb = this.cfg.onDone;
        this.scene.stop();
        cb(result);
      },
    });
  }
}
