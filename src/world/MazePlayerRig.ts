import Phaser from "phaser";
import { MZ_SOFT_GLOW } from "./mazeTextures";

/**
 * The Garden Maze player — the real Frosted Valley animal sprite, animated
 * procedurally so it never just slides around as a static PNG:
 *
 *  - a hop per tile travelled (bob + squash on landing / stretch mid-air),
 *  - facing + lean in the direction of travel (left/right flip, a slimmer
 *    "turned away" silhouette going up, a fuller one coming down),
 *  - idle breathing when standing still,
 *  - for animals with an `earFrac`, the top of the sprite (the ears) is a
 *    separate cropped copy of the same texture pivoting at the ear base, so
 *    the ears flop while hopping and sway when idle — same art, no distortion
 *    (native aspect ratio always kept),
 *  - hit / death / respawn / spawn-protection / power-aura / "danger!" states.
 */

export interface PlayerRigConfig {
  texture: string;
  /** Rendered height of the whole animal in px. */
  height: number;
  /** Fraction of the texture's height (from the top) that is ears — omit for no ear rig. */
  earFrac?: number;
  /** ms to travel one tile — one hop per tile. */
  msPerCell: number;
}

/** Per-animal ear line in their Frosted Valley sprites (top-of-image fraction). */
export const EAR_FRAC: Record<string, number> = {
  fv_rabbit: 0.31,
  fv_fox: 0.2,
};

export class MazePlayerRig {
  readonly root: Phaser.GameObjects.Container;
  private shadow: Phaser.GameObjects.Ellipse;
  private aura: Phaser.GameObjects.Image;
  private pivot: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Image;
  private ears?: Phaser.GameObjects.Image;
  private alert: Phaser.GameObjects.Text;
  private stars: Phaser.GameObjects.Container;
  private feetY: number;
  private h: number;
  private hopPhase = 0;
  private clock = 0;
  private dead = false;
  private facingLeft = false;
  private protectedBlink = false;
  private powered = false;

  constructor(
    private scene: Phaser.Scene,
    private cfg: PlayerRigConfig,
  ) {
    this.h = cfg.height;
    this.feetY = cfg.height * 0.42;
    this.root = scene.add.container(0, 0);

    this.shadow = scene.add.ellipse(0, this.feetY, cfg.height * 0.5, cfg.height * 0.14, 0x0b2236, 0.35);
    this.aura = scene.add.image(0, -cfg.height * 0.05, MZ_SOFT_GLOW).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    this.aura.setDisplaySize(cfg.height * 1.6, cfg.height * 1.6);
    this.pivot = scene.add.container(0, this.feetY);

    const src = scene.textures.get(cfg.texture).getSourceImage() as { width: number; height: number };
    const scale = cfg.height / src.height;
    this.body = scene.add.image(0, 0, cfg.texture).setOrigin(0.5, 1).setScale(scale);
    this.pivot.add(this.body);
    if (cfg.earFrac) {
      const cut = src.height * cfg.earFrac;
      this.body.setCrop(0, cut, src.width, src.height - cut);
      this.ears = scene.add
        .image(0, -(src.height - cut) * scale, cfg.texture)
        .setOrigin(0.5, cfg.earFrac)
        .setScale(scale)
        // a hair of overlap below the cut hides any seam while the ears rotate
        .setCrop(0, 0, src.width, cut + 3);
      this.pivot.add(this.ears);
    }

    this.alert = scene.add
      .text(0, -cfg.height * 0.95, "!", { fontFamily: "Baloo 2, sans-serif", fontSize: `${Math.round(cfg.height * 0.42)}px`, fontStyle: "800", color: "#ffdf5e", stroke: "#8a1a2b", strokeThickness: 6 })
      .setOrigin(0.5)
      .setAlpha(0);
    this.stars = scene.add.container(0, -cfg.height * 0.7).setAlpha(0);
    for (let i = 0; i < 3; i++) {
      const s = scene.add.text(0, 0, "✦", { fontSize: `${Math.round(cfg.height * 0.22)}px`, color: "#fff4b0", stroke: "#b58a00", strokeThickness: 3 }).setOrigin(0.5);
      this.stars.add(s);
    }
    this.root.add([this.shadow, this.aura, this.pivot, this.stars, this.alert]);
  }

  /**
   * Per-frame animation. `dx/dy` is the screen-space direction of travel
   * (unit, or 0,0 standing still).
   */
  update(dtMs: number, moving: boolean, dx: number, dy: number): void {
    this.clock += dtMs;
    this.updateStars(dtMs);
    if (this.dead) return;

    if (dx < -0.1) this.facingLeft = true;
    else if (dx > 0.1) this.facingLeft = false;
    this.body.setFlipX(this.facingLeft);
    this.ears?.setFlipX(this.facingLeft);

    if (moving) {
      this.hopPhase += (dtMs / this.cfg.msPerCell) * Math.PI;
      const s = Math.abs(Math.sin(this.hopPhase));
      const turnAway = dy < -0.1 ? 0.94 : dy > 0.1 ? 1.03 : 1;
      this.pivot.y = this.feetY - s * this.h * 0.13;
      this.pivot.setScale((1.07 - 0.11 * s) * turnAway, 0.92 + 0.14 * s);
      this.pivot.angle = dx * 7;
      this.shadow.setScale(1 - s * 0.25, 1 - s * 0.25);
      if (this.ears) this.ears.angle = -dx * 9 + Math.sin(this.hopPhase * 2) * 7 + (dy < -0.1 ? -4 : 0);
    } else {
      this.hopPhase = 0;
      const breath = Math.sin((this.clock / 1400) * Math.PI * 2);
      this.pivot.y = this.feetY;
      this.pivot.setScale(1 - breath * 0.012, 1 + breath * 0.03);
      this.pivot.angle = 0;
      this.shadow.setScale(1, 1);
      if (this.ears) this.ears.angle = Math.sin(this.clock / 700) * 4;
    }

    // spawn protection: a soft shimmer blink; power: a steady icy aura
    if (this.protectedBlink) {
      this.pivot.alpha = 0.55 + 0.45 * Math.abs(Math.sin(this.clock / 90));
      this.aura.setTint(0xe9f7ff).setAlpha(0.5 + 0.2 * Math.sin(this.clock / 120));
    } else if (this.powered) {
      this.pivot.alpha = 1;
      this.aura.setTint(0x6fe0ff).setAlpha(0.65 + 0.2 * Math.sin(this.clock / 90));
    } else {
      this.pivot.alpha = 1;
      this.aura.setAlpha(0);
    }
  }

  /** On the frame of each tile landing — the scene uses this for a snow-dust puff. */
  get justLanded(): boolean {
    return false;
  }

  setProtected(on: boolean): void {
    this.protectedBlink = on;
  }

  setPowered(on: boolean): void {
    this.powered = on;
  }

  /** "Danger!" — an enemy is very close. */
  setAlert(on: boolean): void {
    const target = on && !this.dead ? 1 : 0;
    if (this.alert.alpha === target) return;
    this.scene.tweens.killTweensOf(this.alert);
    if (on) this.alert.setScale(0.4);
    this.scene.tweens.add({ targets: this.alert, alpha: target, scale: on ? 1 : 0.6, duration: 140, ease: on ? "Back.easeOut" : "Sine.easeIn" });
  }

  /**
   * The ~2s death sequence (the simulation is frozen for exactly as long):
   * red flash + squash → a little tumble → lies there dizzy with circling
   * stars → fades out.
   */
  playDeath(): void {
    this.dead = true;
    this.setAlert(false);
    this.aura.setAlpha(0);
    this.pivot.alpha = 1;
    this.body.setTintFill(0xffffff);
    this.ears?.setTintFill(0xffffff);
    this.scene.time.delayedCall(90, () => {
      this.body.clearTint().setTint(0xff6b7a);
      this.ears?.clearTint().setTint(0xff6b7a);
    });
    this.scene.tweens.chain({
      targets: this.pivot,
      tweens: [
        { scaleX: 1.3, scaleY: 0.7, duration: 150, ease: "Quad.easeOut" },
        { scaleX: 0.9, scaleY: 1.12, duration: 200, ease: "Sine.easeInOut" },
        { angle: this.facingLeft ? -380 : 380, y: this.feetY - this.h * 0.35, duration: 320, ease: "Quad.easeOut" },
        { angle: this.facingLeft ? -450 : 450, y: this.feetY, scaleX: 1, scaleY: 1, duration: 260, ease: "Bounce.easeOut" },
      ],
    });
    this.scene.time.delayedCall(900, () => {
      this.stars.setAlpha(1).setScale(0.2);
      this.scene.tweens.add({ targets: this.stars, scale: 1, duration: 220, ease: "Back.easeOut" });
    });
    this.scene.time.delayedCall(1500, () => {
      this.scene.tweens.add({ targets: [this.pivot, this.shadow, this.stars], alpha: 0, duration: 450, ease: "Sine.easeIn" });
    });
  }

  /** Back at the start: pop in with a sparkle, then blink while protected. */
  playRespawn(): void {
    this.dead = false;
    this.scene.tweens.killTweensOf([this.pivot, this.shadow, this.stars]);
    this.body.clearTint();
    this.ears?.clearTint();
    this.stars.setAlpha(0);
    this.pivot.setAngle(0).setAlpha(1).setScale(0.1);
    this.pivot.y = this.feetY;
    this.shadow.setAlpha(0.35);
    this.scene.tweens.add({ targets: this.pivot, scaleX: 1, scaleY: 1, duration: 380, ease: "Back.easeOut" });
  }

  /** Quick celebratory hop for victory. */
  playCheer(): void {
    this.dead = true;
    this.scene.tweens.add({ targets: this.pivot, y: this.feetY - this.h * 0.3, duration: 220, yoyo: true, repeat: 3, ease: "Sine.easeOut" });
    this.scene.tweens.add({ targets: this.pivot, angle: 360, duration: 900, ease: "Cubic.easeInOut" });
  }

  private updateStars(dtMs: number): void {
    if (this.stars.alpha <= 0) return;
    const t = this.clock / 380;
    this.stars.list.forEach((s, i) => {
      const a = t + (i * Math.PI * 2) / 3;
      (s as Phaser.GameObjects.Text).setPosition(Math.cos(a) * this.h * 0.32, Math.sin(a) * this.h * 0.1);
    });
    void dtMs;
  }

  destroy(): void {
    this.root.destroy();
  }
}
