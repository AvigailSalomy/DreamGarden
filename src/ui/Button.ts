import Phaser from "phaser";
import { COLORS, FONT_FAMILY, RADIUS } from "./theme";
import { MIN_HIT } from "./hit";
import { Sfx } from "../fx/Sfx";

export interface ButtonOpts {
  width: number;
  height: number;
  label: string;
  variant?: "gold" | "cream";
  fontSize?: number;
  onClick: () => void;
}

/**
 * A chunky diegetic button (gold gradient by default) with press feedback and an
 * optional idle breathing pulse. The ENTIRE button — plus a comfortable margin —
 * is the hit area, never just the text. Sets the shared `pointerOnUI` registry flag
 * so the garden camera never pans when a press starts on UI.
 */
export class Button extends Phaser.GameObjects.Container {
  private bg: Phaser.GameObjects.Graphics;
  private txt: Phaser.GameObjects.Text;
  private pulseTween?: Phaser.Tweens.Tween;
  private bw: number;
  private bh: number;
  private enabledState = true;

  constructor(scene: Phaser.Scene, x: number, y: number, opts: ButtonOpts) {
    super(scene, x, y);
    this.bw = opts.width;
    this.bh = opts.height;
    const gold = opts.variant !== "cream";

    this.bg = scene.add.graphics();
    this.draw(gold);

    this.txt = scene.add
      .text(0, 0, opts.label, {
        fontFamily: FONT_FAMILY,
        fontStyle: "700",
        fontSize: `${opts.fontSize ?? 30}px`,
        color: gold ? "#7a4d12" : "#5b4636",
      })
      .setOrigin(0.5);

    this.add([this.bg, this.txt]);
    this.applyHitArea();

    this.on("pointerover", () => scene.registry.set("pointerOnUI", true));
    this.on("pointerout", () => scene.registry.set("pointerOnUI", false));
    this.on("pointerdown", () => {
      scene.registry.set("pointerOnUI", true);
      if (!this.enabledState) return;
      Sfx.unlock();
      Sfx.tap();
      scene.tweens.add({ targets: this, scaleX: 0.95, scaleY: 0.95, duration: 90 });
    });
    this.on("pointerup", () => {
      scene.registry.set("pointerOnUI", false);
      if (!this.enabledState) return;
      scene.tweens.add({
        targets: this,
        scaleX: 1,
        scaleY: 1,
        duration: 160,
        ease: "Back.easeOut",
        onComplete: () => opts.onClick(),
      });
    });
    this.on("pointerupoutside", () => {
      scene.registry.set("pointerOnUI", false);
      scene.tweens.add({ targets: this, scaleX: 1, scaleY: 1, duration: 160 });
    });

    scene.add.existing(this);
  }

  /** Hit rect = visible button + a comfortable margin, at least MIN_HIT on a side. */
  private applyHitArea(): void {
    const pad = 10;
    const w = Math.max(MIN_HIT, this.bw + pad * 2);
    const h = Math.max(MIN_HIT, this.bh + pad * 2);
    // Container.pointWithinHitArea() offsets the local point by displayOrigin
    // (= size * 0.5), so size the container to the hit rect and anchor the
    // Rectangle at (0,0) — that lands it centred on the button.
    this.setSize(w, h);
    this.setInteractive(
      new Phaser.Geom.Rectangle(0, 0, w, h),
      Phaser.Geom.Rectangle.Contains,
    );
    if (this.input) this.input.cursor = "pointer";
  }

  private draw(gold: boolean): void {
    const g = this.bg;
    const r = RADIUS.button;
    const w = this.bw;
    const h = this.bh;
    g.clear();
    g.fillStyle(COLORS.shadow, 0.28);
    g.fillRoundedRect(-w / 2, -h / 2 + 6, w, h + 4, r);
    g.fillStyle(gold ? COLORS.goldEdge : COLORS.panelEdge, 1);
    g.fillRoundedRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, r + 2);
    g.fillStyle(gold ? COLORS.gold : COLORS.panel, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(gold ? COLORS.goldLight : 0xffffff, gold ? 0.9 : 0.4);
    g.fillRoundedRect(-w / 2 + 5, -h / 2 + 5, w - 10, h * 0.4, r - 5);
  }

  startPulse(): this {
    this.pulseTween?.stop();
    this.setScale(1);
    this.pulseTween = this.scene.tweens.add({
      targets: this,
      scaleX: 1.04,
      scaleY: 1.04,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    return this;
  }

  stopPulse(): this {
    this.pulseTween?.stop();
    this.pulseTween = undefined;
    this.setScale(1);
    return this;
  }

  setEnabled(v: boolean): this {
    this.enabledState = v;
    this.setAlpha(v ? 1 : 0.5);
    // keep the padded hit rect either way; just gate the callbacks via enabledState
    if (this.input) this.input.enabled = true;
    return this;
  }

  setLabel(text: string): this {
    this.txt.setText(text);
    return this;
  }
}
