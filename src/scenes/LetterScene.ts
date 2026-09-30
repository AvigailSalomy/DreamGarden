import Phaser from "phaser";
import { bodyStyle, titleStyle } from "../ui/theme";
import { Button } from "../ui/Button";
import { makeIconButton } from "../ui/hit";
import { safeInsets } from "../util/safeArea";
import { bus, progression, save } from "../game/services";
import { Sfx } from "../fx/Sfx";
import { sparkleBurst } from "../fx/Particles";
import { audio } from "../audio/AudioManager";
import { GARDEN_COMPLETE_LETTER, GARDEN_COMPLETE_LETTER_ID } from "../data/objects";
import type { LetterConfig } from "../data/types";

interface LetterInit {
  objectId: string;
}

/** The Letter scene currently on screen (there is only ever one). */
let activeLetter: LetterScene | null = null;

/** DEV/test: advance whatever letter is showing (open it, then finish it). */
export function advanceActiveLetter(): void {
  activeLetter?.advance();
}

/**
 * The one reusable task-letter presentation. Data-driven from `def.letter`, so
 * Wildflowers / Songbird / (later) Pond / Oak / Heart all reuse this exact flow:
 *   envelope appears → tap → seal breaks → envelope opens → paper slides up →
 *   note appears → button → `letter:done`.
 */
export class LetterScene extends Phaser.Scene {
  private objectId!: string;
  private bodyText = "";
  private buttonLabel = "Continue";
  private titleText?: string;
  private highlightText?: string;
  private opened = false;
  private done = false;
  private root!: Phaser.GameObjects.Container;
  private envelope!: Phaser.GameObjects.Image;
  private hintGlow!: Phaser.GameObjects.Image;
  private tapHint!: Phaser.GameObjects.Text;

  constructor() {
    super("Letter");
  }

  init(data: LetterInit): void {
    this.objectId = data.objectId;
    this.opened = false;
    this.done = false;
  }

  create(): void {
    activeLetter = this;
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (activeLetter === this) activeLetter = null;
    });

    // a task's own letter, or the one-time "Garden restored" letter
    const letter: LetterConfig | undefined =
      this.objectId === GARDEN_COMPLETE_LETTER_ID ? GARDEN_COMPLETE_LETTER : progression.def(this.objectId)?.letter;
    if (!letter) {
      this.finish();
      return;
    }
    this.bodyText = letter.body;
    this.buttonLabel = letter.button ?? "Continue";
    this.titleText = letter.title;
    this.highlightText = letter.highlight;

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const cy = H * 0.46;

    this.root = this.add.container(0, 0).setDepth(50);
    const scrim = this.add
      .rectangle(0, 0, W, H, 0x241a2e, 0.42)
      .setOrigin(0, 0)
      .setInteractive();
    this.root.add(scrim);

    for (const s of [-1, 1]) {
      this.root.add(
        this.add
          .image(cx + s * Math.min(W * 0.34, 220), cy + 20, "flower")
          .setScale(1.1)
          .setAlpha(0.5)
          .setAngle(s * 12),
      );
    }

    this.hintGlow = this.add
      .image(cx, cy, "glow")
      .setDepth(1)
      .setScale(1.1)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.root.add(this.hintGlow);

    const envScale = Math.min(1, (W - 60) / 380) * 0.95;
    this.envelope = this.add
      .image(cx, cy - 20, "envelope")
      .setScale(envScale * 0.7)
      .setAlpha(0);
    this.root.add(this.envelope);

    this.tweens.add({
      targets: this.envelope,
      scale: envScale,
      alpha: 1,
      y: cy,
      duration: 380,
      ease: "Back.easeOut",
      onComplete: () => {
        if (this.opened) return;
        this.tweens.add({
          targets: this.envelope,
          y: cy - 8,
          duration: 1600,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
        this.tweens.add({
          targets: this.hintGlow,
          alpha: 0.35,
          scale: 1.3,
          duration: 900,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      },
    });

    this.tapHint = this.add
      .text(cx, cy + 150, "tap to open", { ...bodyStyle(16, "#fef6e8") })
      .setOrigin(0.5)
      .setAlpha(0.9);
    this.root.add(this.tapHint);

    scrim.on("pointerdown", () => this.open());
    this.envelope.setInteractive({ useHandCursor: true });
    this.envelope.on("pointerdown", () => this.open());

    const inset = safeInsets();
    makeIconButton(this, W - inset.right - 42, inset.top + 26, "Skip ›", 19, () => this.finish(true), {
      color: "#fef6e8",
      hitW: 108,
      hitH: 52,
    }).setDepth(60);

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__dgLetter = () => advanceActiveLetter();
    }
  }

  /** DEV/test hook: one step (open, then finish). */
  advance(): void {
    if (!this.opened) this.open();
    else this.finish(false);
  }

  private open(): void {
    if (this.opened || this.done) return;
    this.opened = true;
    audio.unlock();
    Sfx.sparkle();

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const cy = H * 0.46;

    this.tweens.killTweensOf(this.envelope);
    this.tweens.killTweensOf(this.hintGlow);
    this.tapHint.setVisible(false);

    sparkleBurst(this, this.envelope.x, this.envelope.y - 6, 14, 40);
    this.cameras.main.shake(120, 0.003);
    this.tweens.add({
      targets: this.envelope,
      angle: { from: -3, to: 3 },
      duration: 60,
      yoyo: true,
      repeat: 3,
    });
    this.tweens.add({
      targets: this.envelope,
      scale: this.envelope.scale * 0.55,
      alpha: 0,
      y: this.envelope.y + 26,
      delay: 220,
      duration: 260,
      ease: "Quad.easeIn",
    });
    this.tweens.add({ targets: this.hintGlow, alpha: 0, duration: 260 });

    const paperScale = Math.min(1, Math.min(W - 40, 460) / 460);
    const paperH = 560 * paperScale;
    const paper = this.add
      .image(cx, cy + 60, "letter_paper")
      .setScale(paperScale * 0.7)
      .setAlpha(0)
      .setDepth(2);
    this.root.add(paper);
    this.tweens.add({
      targets: paper,
      scale: paperScale,
      alpha: 1,
      y: cy - 6,
      delay: 240,
      duration: 380,
      ease: "Back.easeOut",
    });

    const wrap = Math.min(W - 116, 372);
    const texts: Phaser.GameObjects.Text[] = [];
    const extras = !!(this.titleText || this.highlightText);
    if (this.titleText) {
      texts.push(
        this.add
          .text(cx, 0, this.titleText, { ...titleStyle(Math.min(28, W * 0.062)), color: "#7a4d12", align: "center", wordWrap: { width: wrap } })
          .setOrigin(0.5, 0),
      );
    }
    texts.push(
      this.add
        .text(cx, 0, this.bodyText, {
          ...bodyStyle(extras ? Math.min(18, W * 0.04) : Math.min(20, W * 0.043), "#5b4636"),
          align: "center",
          lineSpacing: extras ? 5 : 8,
          wordWrap: { width: wrap },
        })
        .setOrigin(0.5, 0),
    );
    if (this.highlightText) {
      texts.push(
        this.add
          .text(cx, 0, this.highlightText, { ...titleStyle(Math.min(21, W * 0.048)), color: "#3d6f99", align: "center", wordWrap: { width: wrap } })
          .setOrigin(0.5, 0),
      );
    }
    // stack them, centred on the same spot the single note always used
    const gap = 14;
    const total = texts.reduce((h, t) => h + t.height, 0) + gap * (texts.length - 1);
    let y = cy - 26 - total / 2;
    for (const t of texts) {
      t.setY(y).setDepth(3).setAlpha(0);
      y += t.height + gap;
      this.root.add(t);
    }
    this.tweens.add({ targets: texts, alpha: 1, delay: 520, duration: 320 });

    const btn = new Button(this, cx, cy + paperH / 2 - 64, {
      width: Math.min(this.buttonLabel.length > 16 ? 360 : 300, W - 100),
      height: 74,
      label: this.buttonLabel,
      fontSize: 24,
      onClick: () => this.finish(false),
    });
    btn.setAlpha(0).setDepth(4);
    this.root.add(btn);
    this.tweens.add({ targets: btn, alpha: 1, delay: 620, duration: 300 });
  }

  private finish(skipped = false): void {
    if (this.done) return;
    this.done = true;
    audio.playSfx("ui_click");
    save.state.lettersSeen[this.objectId] = true;
    save.saveNow();

    const emit = () => {
      bus.emit("letter:done", { objectId: this.objectId, skipped });
      this.scene.stop();
    };
    if (this.root) {
      this.tweens.add({ targets: this.root, alpha: 0, duration: 220, onComplete: emit });
    } else {
      emit();
    }
  }
}
