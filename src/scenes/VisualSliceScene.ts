import Phaser from "phaser";
import { ambientFireflies, petalPuff, sparkleBurst } from "../fx/Particles";
import { Sfx } from "../fx/Sfx";

/**
 * VISUAL-DIRECTION VERTICAL SLICE — not part of the real game flow.
 *
 * A fully self-contained, isolated scene (own preload, own assets, no dependency
 * on GardenScene/UIScene/save/economy/progression) built to put the NEW layering /
 * lighting / parallax / damaged→restored / particle pipeline in front of a real
 * browser for comparison against the approved reference art direction, using the
 * richest hand-authored art achievable without an image-generation tool.
 *
 * Reached only via `?slice` on the URL (see BootScene) — the normal game boot
 * flow (Preload → Menu → Garden) is completely untouched.
 *
 * Honest scope: this proves the COMPOSITION/PIPELINE (depth bands, parallax,
 * warm key-light overlay, layered shadows, a real damaged↔restored asset pair,
 * particle-driven "coming alive" moment) with hand-drawn vector art. It is not,
 * and cannot be, the painted/rendered material fidelity of the reference images —
 * that gap is art-content, not engine capability (see the written gap analysis).
 */
export class VisualSliceScene extends Phaser.Scene {
  private restored = false;
  private fountainDamaged!: Phaser.GameObjects.Image;
  private fountainRestored!: Phaser.GameObjects.Image;
  private fountainGlow!: Phaser.GameObjects.Image;
  private lushPatch!: Phaser.GameObjects.Image;
  private caption!: Phaser.GameObjects.Text;
  private petalTimer?: Phaser.Time.TimerEvent;
  private driftTween?: Phaser.Tweens.Tween;

  constructor() {
    super("VisualSlice");
  }

  preload(): void {
    // fully self-contained: loads both its own new art AND the handful of
    // existing textures it reuses, under the same keys the real game uses.
    const svg = (key: string, w: number, h: number) =>
      this.load.svg(key, `assets/svg/${key}.svg`, { width: w, height: h });

    svg("slice_path_tile", 420, 260);
    svg("slice_bush_01", 240, 210);
    svg("slice_bush_02", 220, 190);
    svg("slice_blossom_tree", 360, 440);
    svg("slice_fountain_damaged", 300, 340);
    svg("slice_fountain_restored", 300, 340);
    svg("slice_rabbit_hero", 240, 260);
    svg("slice_foreground_frame", 380, 320);

    svg("hills_far", 2400, 560);
    svg("hills_near", 2400, 640);
    svg("firefly", 24, 24);
    svg("petal", 28, 28);
    svg("spark", 48, 48);
    svg("glow", 256, 256);
    svg("shadow", 200, 90);
  }

  create(): void {
    // Safety net: if anything ever fails to paint (a texture not ready, a
    // stale size on an early resize tick), the canvas clear colour shows
    // through instead of the game's own lavender chrome colour — so a gap
    // reads as "unfinished ground", not as a jarring wrong-colour seam.
    this.cameras.main.setBackgroundColor(0x8fc77a);
    this.buildGradientTextures();
    this.build();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  /** `Graphics.fillGradientStyle` is WebGL-only (see Phaser source) and silently
   *  no-ops under the Canvas2D fallback renderer — which is exactly what produced
   *  the ground/sky seam bug (the "gradient" fill never drew, so the canvas'
   *  background-colour clear showed through unfilled). Baking the gradients into
   *  small textures once, up front, renders identically on both renderer paths. */
  private buildGradientTextures(): void {
    const bake = (key: string, top: number, bottom: number) => {
      if (this.textures.exists(key)) return;
      const tex = this.textures.createCanvas(key, 4, 256);
      const ctx = tex!.getContext();
      const topHex = `#${top.toString(16).padStart(6, "0")}`;
      const bottomHex = `#${bottom.toString(16).padStart(6, "0")}`;
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, topHex);
      grad.addColorStop(1, bottomHex);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 4, 256);
      tex!.refresh();
    };
    bake("slice_sky_grad", 0xc9b8e8, 0xffe0cc);
    bake("slice_ground_grad", 0x9fd08a, 0x7fc06d);
  }

  private build(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const groundY = H * 0.6;

    // ---------- background: sky + parallax hills (scrollFactor < 1) ----------
    // Baked-texture gradients (see buildGradientTextures) — not Graphics.fillGradientStyle,
    // which is WebGL-only in Phaser and silently no-ops under the Canvas2D fallback
    // renderer (that was the actual cause of the ground/sky seam bug).
    this.add.image(0, 0, "slice_sky_grad").setOrigin(0, 0).setDisplaySize(W, groundY + 40).setDepth(-100);
    this.add.image(0, groundY, "slice_ground_grad").setOrigin(0, 0).setDisplaySize(W, H - groundY).setDepth(-100);

    this.add
      .image(W * 0.5, groundY + 20, "hills_far")
      .setOrigin(0.5, 1)
      .setDisplaySize(W * 1.6, H * 0.3)
      .setAlpha(0.55)
      .setTint(0xaab7e2)
      .setScrollFactor(0.25)
      .setDepth(-90);
    this.add
      .image(W * 0.5, groundY + 40, "hills_near")
      .setOrigin(0.5, 1)
      .setDisplaySize(W * 1.7, H * 0.32)
      .setAlpha(0.75)
      .setTint(0x8fc77a)
      .setScrollFactor(0.45)
      .setDepth(-80);

    // ---------- ground: path curving up toward the fountain ----------
    const pathPoints: Array<[number, number, number, number]> = [
      [W * 0.5, H * 0.94, 0.9, 0],
      [W * 0.47, H * 0.8, 0.85, -4],
      [W * 0.52, H * 0.66, 0.75, 5],
      [W * 0.49, H * 0.54, 0.62, -3],
    ];
    for (const [x, y, s, rot] of pathPoints) {
      this.add.image(x, y, "slice_path_tile").setScale(s).setAngle(rot).setDepth(y - 2).setOrigin(0.5, 0.6);
    }

    // ---------- mid vegetation, denser + overlapping, both sides ----------
    const bush = (x: number, y: number, tex: "slice_bush_01" | "slice_bush_02", scale: number, flip = false) => {
      const img = this.add.image(x, y, tex).setOrigin(0.5, 0.92).setScale(scale).setDepth(y);
      img.setFlipX(flip);
      return img;
    };
    bush(W * 0.14, H * 0.62, "slice_bush_01", 1.15);
    bush(W * 0.85, H * 0.6, "slice_bush_02", 1.05, true);
    bush(W * 0.22, H * 0.78, "slice_bush_02", 0.95);
    bush(W * 0.78, H * 0.8, "slice_bush_01", 1.0, true);
    bush(W * 0.32, H * 0.5, "slice_bush_01", 0.8);
    bush(W * 0.68, H * 0.5, "slice_bush_02", 0.75, true);

    // blossom tree, framing the left side
    this.add
      .image(W * 0.2, groundY + H * 0.05, "slice_blossom_tree")
      .setOrigin(0.5, 1)
      .setScale(Math.min(1.3, W / 720))
      .setDepth(groundY + H * 0.05);

    // ---------- hero restoration object: the fountain ----------
    const fx = W * 0.5;
    const fy = groundY - H * 0.03;
    const fScale = Math.min(1.15, W / 640);

    this.fountainGlow = this.add
      .image(fx, fy - 40, "glow")
      .setScale(fScale * 1.6)
      .setAlpha(0)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xfff2c4)
      .setDepth(fy - 1);

    this.lushPatch = this.add
      .image(fx, fy + 60, "glow")
      .setScale(fScale * 2.2, fScale * 0.9)
      .setAlpha(0)
      .setTint(0x8fc77a)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(fy - 2);

    this.fountainDamaged = this.add.image(fx, fy, "slice_fountain_damaged").setOrigin(0.5, 1).setScale(fScale).setDepth(fy);
    this.fountainRestored = this.add
      .image(fx, fy, "slice_fountain_restored")
      .setOrigin(0.5, 1)
      .setScale(fScale)
      .setDepth(fy + 0.1)
      .setAlpha(0);

    const fountainZone = this.add
      .zone(fx, fy - 100, 220 * fScale, 220 * fScale)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });
    fountainZone.on("pointerup", () => this.toggleRestore());

    // ---------- hero animal ----------
    const rabbitX = fx + 120 * fScale;
    const rabbitY = fy + 6;
    const rabbitShadow = this.add
      .image(rabbitX, rabbitY + 4, "shadow")
      .setDisplaySize(90 * fScale, 30 * fScale)
      .setAlpha(0.35)
      .setDepth(rabbitY - 1);
    const rabbit = this.add.image(rabbitX, rabbitY, "slice_rabbit_hero").setOrigin(0.5, 1).setScale(fScale * 0.95).setDepth(rabbitY);
    this.tweens.add({ targets: rabbit, y: rabbitY - 6, duration: 1500, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: rabbit, angle: 3, duration: 2200, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: 400 });
    void rabbitShadow;

    // ---------- warm key-light overlay (locked direction: upper-left) ----------
    this.add
      .image(W * 0.18, H * 0.16, "glow")
      .setDisplaySize(W * 1.3, W * 1.3)
      .setAlpha(0.22)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(0xfff2c4)
      .setScrollFactor(0.3)
      .setDepth(500);

    // ---------- foreground framing (screen-space-ish, closer-than-midground parallax) ----------
    this.add
      .image(-20, H + 20, "slice_foreground_frame")
      .setOrigin(0, 1)
      .setScale(Math.max(1, W / 600))
      .setScrollFactor(1.15)
      .setDepth(9000);
    this.add
      .image(W + 20, H + 20, "slice_foreground_frame")
      .setOrigin(1, 1)
      .setScale(Math.max(1, W / 600))
      .setFlipX(true)
      .setScrollFactor(1.15)
      .setDepth(9000);

    // ---------- ambient life ----------
    ambientFireflies(this, new Phaser.Geom.Rectangle(fx - 260, fy - 260, 520, 320), 14);
    this.petalTimer = this.time.addEvent({
      delay: 2600,
      loop: true,
      callback: () => petalPuff(this, W * 0.2 + Phaser.Math.Between(-40, 60), groundY - H * 0.28, 6),
    });

    // ---------- slow Ken-Burns camera drift, sells the parallax depth ----------
    this.driftTween = this.tweens.add({
      targets: this.cameras.main,
      zoom: 1.045,
      scrollX: 18,
      duration: 9000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // ---------- caption ----------
    this.caption = this.add
      .text(W / 2, 28, "VISUAL-DIRECTION PROTOTYPE — tap the fountain to restore it", {
        fontFamily: '"Baloo 2", system-ui, sans-serif',
        fontStyle: "700",
        fontSize: "16px",
        color: "#fef6e8",
        backgroundColor: "#2a2036",
        padding: { x: 12, y: 8 },
      })
      .setOrigin(0.5, 0)
      .setAlpha(0.92)
      .setScrollFactor(0)
      .setDepth(9999);
  }

  private toggleRestore(): void {
    if (this.restored) return; // one-way, like the real game's restoration moment
    this.restored = true;

    Sfx.sparkle();
    this.time.delayedCall(150, () => Sfx.bloomChime());
    sparkleBurst(this, this.fountainRestored.x, this.fountainRestored.y - 120, 26, 90);
    petalPuff(this, this.fountainRestored.x, this.fountainRestored.y - 140, 16);

    this.tweens.add({ targets: this.fountainDamaged, alpha: 0, duration: 700, ease: "Sine.easeOut" });
    this.tweens.add({ targets: this.fountainRestored, alpha: 1, duration: 700, ease: "Sine.easeOut" });
    this.tweens.add({ targets: this.fountainGlow, alpha: 0.8, scale: this.fountainGlow.scale * 1.15, duration: 900, yoyo: true, repeat: 1, ease: "Sine.easeOut" });
    this.tweens.add({ targets: this.lushPatch, alpha: 0.5, duration: 1200, ease: "Sine.easeOut" });

    this.caption.setText("RESTORED! — the same layering/lighting pipeline drives the real game's restore moment");
  }

  private cleanup(): void {
    this.petalTimer?.remove();
    this.petalTimer = undefined;
    this.driftTween?.stop();
    this.driftTween = undefined;
    this.tweens.killAll();
  }
}
