import Phaser from "phaser";
import { COLORS, labelStyle } from "./theme";
import { progression, requests } from "../game/services";
import { habitatFor } from "../data/habitats";
import { silhouetteTextureKey } from "../world/silhouette";
import { audio } from "../audio/AudioManager";

const SEGMENTS = 3;
const SEG_W = 42;
const SEG_H = 14;
const SEG_GAP = 6;
const PAD_X = 10;
const SEG_AREA = SEGMENTS * SEG_W + (SEGMENTS - 1) * SEG_GAP;
const LABEL_GAP = 10;
const BAR_H = SEG_H + 16;
const PORTRAIT_R = 23;

const SAGE = 0x8fb86a;
const SAGE_LIGHT = 0xc3dea0;
const TROUGH = 0xeadcc0;

/**
 * HUD strip for the CURRENT active animal's habitat restoration: a small
 * portrait medallion + a three-segment bar + "x/3" (or "Nibs is ready!").
 * Holds no progress of its own — every refresh re-derives the count from the
 * saved restoration state (requests.isSourceRestored over the active animal's
 * habitat), so it survives reloads/Continue and doesn't care about order.
 */
export class HabitatProgressBar extends Phaser.GameObjects.Container {
  private portraitRing: Phaser.GameObjects.Graphics;
  private portrait?: Phaser.GameObjects.Image;
  private frame: Phaser.GameObjects.Graphics;
  private segs: Phaser.GameObjects.Graphics[] = [];
  private label: Phaser.GameObjects.Text;
  private animalId: string | null = null;
  private shown = -1;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
    this.portraitRing = scene.add.graphics();
    this.frame = scene.add.graphics();
    this.label = scene.add.text(0, 0, "", { ...labelStyle(18), color: "#5b4636" }).setOrigin(0, 0.5);
    this.label.setShadow(0, 1, "rgba(255,255,255,0.8)", 2);
    this.add([this.frame, this.portraitRing, this.label]);
    for (let i = 0; i < SEGMENTS; i++) {
      const g = scene.add.graphics();
      this.segs.push(g);
      this.add(g);
    }
    scene.add.existing(this);
    this.refresh(false);
  }

  /** Widest the strip gets (the "<name> is ready!" state) — used by the HUD
   *  layout to decide top-row vs second-row placement. */
  static readonly WIDTH = PORTRAIT_R * 2 + 8 + PAD_X * 2 + SEG_AREA + LABEL_GAP + 140;

  private barLeft = 0;
  private portraitX = 0;

  /** One cream/gold frame holds segments AND label (never text loose over the
   *  world art); the whole strip re-centres on the container as the label changes. */
  private layoutStrip(): void {
    const barW = PAD_X * 2 + SEG_AREA + LABEL_GAP + this.label.width;
    const total = PORTRAIT_R * 2 + 8 + barW;
    const left = -total / 2;
    this.portraitX = left + PORTRAIT_R;
    this.barLeft = left + PORTRAIT_R * 2 + 8;
    this.segs.forEach((g, i) => (g.x = this.barLeft + PAD_X + i * (SEG_W + SEG_GAP) + SEG_W / 2));
    this.label.setPosition(this.barLeft + PAD_X + SEG_AREA + LABEL_GAP, 0);
    this.portrait?.setX(this.portraitX);
    this.drawChrome(barW);
  }

  private drawChrome(BAR_W: number): void {
    const x = this.barLeft;
    const f = this.frame;
    f.clear();
    // soft drop shadow, gold edge, cream body, a thin top highlight
    f.fillStyle(COLORS.shadow, 0.18).fillRoundedRect(x, -BAR_H / 2 + 3, BAR_W, BAR_H, BAR_H / 2);
    f.fillStyle(COLORS.goldEdge, 1).fillRoundedRect(x, -BAR_H / 2, BAR_W, BAR_H, BAR_H / 2);
    f.fillStyle(COLORS.panel, 1).fillRoundedRect(x + 2, -BAR_H / 2 + 2, BAR_W - 4, BAR_H - 4, (BAR_H - 4) / 2);
    f.fillStyle(0xffffff, 0.55).fillRoundedRect(x + 8, -BAR_H / 2 + 3, BAR_W - 16, 3, 1.5);

    const cx = this.portraitX;
    const r = this.portraitRing;
    r.clear();
    r.fillStyle(COLORS.shadow, 0.18).fillCircle(cx, 3, PORTRAIT_R);
    r.fillStyle(COLORS.goldEdge, 1).fillCircle(cx, 0, PORTRAIT_R);
    r.fillStyle(COLORS.panel, 1).fillCircle(cx, 0, PORTRAIT_R - 2.5);
    r.fillStyle(0xffffff, 0.5).fillCircle(cx - 6, -9, 6);
  }

  private drawSegment(g: Phaser.GameObjects.Graphics, filled: boolean): void {
    g.clear();
    const x = -SEG_W / 2;
    const y = -SEG_H / 2;
    const rad = SEG_H / 2;
    if (!filled) {
      g.fillStyle(TROUGH, 1).fillRoundedRect(x, y, SEG_W, SEG_H, rad);
      g.fillStyle(COLORS.shadow, 0.1).fillRoundedRect(x, y, SEG_W, 4, { tl: rad, tr: rad, bl: 0, br: 0 });
      return;
    }
    g.fillStyle(0x6f9a4f, 1).fillRoundedRect(x, y, SEG_W, SEG_H, rad);
    g.fillStyle(SAGE, 1).fillRoundedRect(x, y, SEG_W, SEG_H - 2, rad);
    g.fillStyle(SAGE_LIGHT, 0.85).fillRoundedRect(x + 5, y + 2, SEG_W - 10, 4, 2);
  }

  private setPortrait(animalId: string): void {
    const def = progression.def(animalId);
    if (!def) return;
    this.portrait?.destroy();
    // the active animal isn't home yet — same dark silhouette the world shows
    const key = silhouetteTextureKey(this.scene, def.garden_sprite);
    const img = this.scene.add.image(this.portraitX, 2, key);
    img.setScale((PORTRAIT_R * 1.55) / Math.max(img.width, img.height));
    this.portrait = img;
    this.addAt(img, this.getIndex(this.portraitRing) + 1);
  }

  /** Re-derive from saved state. `animate`: pop any newly filled segment(s). */
  refresh(animate = true): void {
    const active = progression.activeAnimalId();
    const habitat = active ? habitatFor(active) : undefined;
    if (!active || !habitat) {
      this.setVisible(false);
      this.animalId = null;
      return;
    }
    this.setVisible(true);
    const switched = active !== this.animalId;
    if (switched) {
      this.animalId = active;
      this.shown = -1;
      this.setPortrait(active);
    }
    const count = habitat.resources.filter((r) => requests.isSourceRestored(r.id)).length;
    const prev = this.shown;
    this.segs.forEach((g, i) => this.drawSegment(g, i < count));
    const name = (progression.def(active)?.name ?? "").split(" ")[0];
    this.label.setText(count >= SEGMENTS ? `${name} is ready!` : `${count}/${SEGMENTS}`);
    this.label.setColor(count >= SEGMENTS ? "#4f7a35" : "#5b4636");
    this.layoutStrip();
    if (animate && !switched && prev >= 0 && count > prev) {
      audio.playSfx(count >= SEGMENTS ? "habitat_complete" : "progress_fill");
      for (let i = prev; i < count; i++) this.pop(this.segs[i], (i - prev) * 120);
      this.scene.tweens.add({ targets: this.label, scale: { from: 1.25, to: 1 }, duration: 320, ease: "Back.easeOut" });
    }
    this.shown = count;
  }

  private pop(g: Phaser.GameObjects.Graphics, delay: number): void {
    // fill "grows" in from the left, then a soft glow flash over it
    g.setScale(0.2, 1);
    this.scene.tweens.add({ targets: g, scaleX: 1, duration: 360, delay, ease: "Back.easeOut" });
    const glow = this.scene.add.graphics();
    glow.x = g.x;
    glow.fillStyle(COLORS.goldLight, 1).fillRoundedRect(-SEG_W / 2 - 3, -SEG_H / 2 - 3, SEG_W + 6, SEG_H + 6, SEG_H / 2 + 3);
    glow.setAlpha(0).setBlendMode(Phaser.BlendModes.ADD);
    this.addAt(glow, this.getIndex(g));
    this.scene.tweens.add({
      targets: glow,
      alpha: { from: 0.9, to: 0 },
      scale: { from: 1, to: 1.25 },
      duration: 650,
      delay: delay + 200,
      onComplete: () => glow.destroy(),
    });
  }
}
