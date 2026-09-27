import Phaser from "phaser";
import { CameraController } from "../world/CameraController";
import { sparkleBurst, gatherGlow, petalPuff } from "../fx/Particles";
import { Sfx } from "../fx/Sfx";
import { makeIconButton } from "../ui/hit";
import { safeInsets } from "../util/safeArea";

/**
 * The first Frosted Valley hero area (Snowy Village + Frozen Waterfall), built
 * from the supplied production art in public/assets/frosted/. Fully isolated:
 * its own preload(), its own world, no dependency on the main Garden catalog/
 * progression/economy/save systems. The fountain restoration below is a
 * self-contained stand-in for what will eventually be triggered by solving a
 * real puzzle (see the comment on `triggerFountainRestore`) — that wiring is
 * intentionally left for a later integration pass, not built here.
 */

const FV_KEYS = [
  "fv_bridge",
  "fv_cottage_a",
  "fv_cottage_b",
  "fv_pine",
  "fv_magic_treehouse",
  "fv_fence",
  "fv_barrel_flowers",
  "fv_birdhouse_post",
  "fv_ice_block",
  "fv_icicles",
  "fv_waterfall",
  "fv_riverbank",
  "fv_crystal_a",
  "fv_crystal_b",
  "fv_flower_bush",
  "fv_rabbit",
  "fv_fox",
  "fv_squirrel",
  "fv_sparkle_trail",
  "fv_berry_branch",
  "fv_fountain_damaged",
  "fv_fountain_restored",
  "fv_dead_tree",
];

const WORLD_W = 2400;
const WORLD_H = 1800;
const HORIZON = 360;
const FOUNTAIN = { x: 1300, y: 940 };
const OVERVIEW_CENTER = { x: 1300, y: 950 };
const START_FOCUS = { x: 1300, y: 900 };

const wait = (scene: Phaser.Scene, ms: number) => new Promise<void>((res) => scene.time.delayedCall(ms, res));

export class FrostedValleyScene extends Phaser.Scene {
  private camera!: CameraController;
  private fountainDamaged!: Phaser.GameObjects.Image;
  private fountainRestored!: Phaser.GameObjects.Image;
  private restored = false;
  private restoring = false;
  private flowBusy = false;
  private skipBtn?: Phaser.GameObjects.Container;
  private tourSkipped = false;
  private idleTargets: Phaser.GameObjects.Image[] = [];

  constructor() {
    super("FrostedValley");
  }

  preload(): void {
    for (const key of FV_KEYS) this.load.image(key, `assets/frosted/${key}.png`);
  }

  create(): void {
    this.restored = false;
    this.restoring = false;
    this.flowBusy = false;
    this.tourSkipped = false;
    this.idleTargets = [];

    this.buildSky();
    this.buildGround();
    this.buildForestFringe();
    this.buildVillageCluster();
    this.buildWaterfallCluster();
    this.buildFountainPlaza();
    this.buildAnimals();
    this.buildForeground();
    this.buildSnowfall();

    this.camera = new CameraController(this, { w: WORLD_W, h: WORLD_H });
    this.camera.onTap = (x, y) => this.handleTap(x, y);

    this.startIdleBreathing();

    const backBtn = makeIconButton(this, 56, safeInsets().top + 34, "‹", 26, () => this.close(), {
      hitW: 56,
      hitH: 56,
      color: "#fef6e8",
    });
    backBtn.setScrollFactor(0).setDepth(9500);

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    });

    this.time.delayedCall(60, () => void this.playOpeningReveal());

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__dgFrostedValley = {
        restore: () => this.triggerFountainRestore(),
        skipTour: () => (this.tourSkipped = true),
      };
    }
  }

  private onResize(): void {
    this.camera?.onResize();
  }

  /* ---------------- opening camera reveal (section 23/24) ---------------- */

  private async playOpeningReveal(): Promise<void> {
    this.flowBusy = true;
    this.camera.disable();
    this.camera.frameWide(OVERVIEW_CENTER.x, OVERVIEW_CENTER.y);
    this.showSkip();
    if (!this.tourSkipped) await wait(this, 1500);
    this.hideSkip();
    await this.camera.focusOn(START_FOCUS.x, START_FOCUS.y, this.tourSkipped ? 500 : 900, 1);
    this.camera.enable();
    this.flowBusy = false;
  }

  private showSkip(): void {
    const btn = makeIconButton(
      this,
      this.scale.width - 74,
      safeInsets().top + 34,
      "Skip ›",
      18,
      () => {
        Sfx.tap();
        this.tourSkipped = true;
      },
      { color: "#fef6e8", hitW: 112, hitH: 50 },
    );
    btn.setScrollFactor(0).setDepth(9500);
    this.skipBtn = btn;
  }

  private hideSkip(): void {
    this.registry.set("pointerOnUI", false);
    this.skipBtn?.destroy();
    this.skipBtn = undefined;
  }

  private close(): void {
    Sfx.tap();
    this.cameras.main.fadeOut(180, 20, 16, 30);
    this.time.delayedCall(190, () => this.scene.stop());
  }

  /* ---------------- background ---------------- */

  private buildSky(): void {
    const sky = this.add
      .image(0, 0, "sky")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(-1000)
      .setTint(0xcfe3f5);
    sky.setDisplaySize(this.scale.width, this.scale.height);

    this.add
      .image(300, 140, "clouds")
      .setOrigin(0, 0)
      .setScrollFactor(0.1)
      .setDepth(-900)
      .setAlpha(0.85)
      .setTint(0xffffff);
    this.add
      .image(1500, 90, "clouds")
      .setOrigin(0, 0)
      .setScrollFactor(0.16)
      .setDepth(-900)
      .setScale(0.8)
      .setAlpha(0.6)
      .setTint(0xffffff);

    this.add
      .image(-160, HORIZON + 40, "hills_far")
      .setOrigin(0, 1)
      .setScrollFactor(0.32)
      .setDepth(-820)
      .setScale(1.4)
      .setTint(0xb9cfe8);
    this.add
      .image(-220, HORIZON + 90, "hills_near")
      .setOrigin(0, 1)
      .setScrollFactor(0.5)
      .setDepth(-780)
      .setScale(1.4)
      .setTint(0xd7e6f2);
  }

  private buildGround(): void {
    const g = this.add.graphics().setDepth(-200);
    g.fillGradientStyle(0xe7eff8, 0xe7eff8, 0xf6fafd, 0xf6fafd, 1);
    g.fillRect(0, HORIZON - 4, WORLD_W, WORLD_H - HORIZON + 4);

    // soft horizon blend, matching the main garden's convention
    const blend = this.add.graphics().setDepth(-185);
    blend.fillGradientStyle(0xcfe3f5, 0xcfe3f5, 0xe7eff8, 0xe7eff8, 0.9, 0.9, 0, 0);
    blend.fillRect(0, HORIZON - 90, WORLD_W, 120);

    // a winding worn-snow path guiding the eye from the entrance up to the fountain
    const path = this.add.graphics().setDepth(-150);
    path.fillStyle(0xfdfaf3, 0.9);
    const pts: Array<[number, number, number]> = [
      [1300, 1750, 170],
      [1320, 1500, 150],
      [1300, 1260, 130],
      [1300, 1060, 110],
    ];
    for (const [x, y, w] of pts) path.fillEllipse(x, y, w, 90);

    this.add
      .image(1560, WORLD_H + 10, "path")
      .setOrigin(0.5, 1)
      .setScale(1.2)
      .setDepth(-140)
      .setAlpha(0.4)
      .setTint(0xe3ecf6);
  }

  /* ---------------- clusters ---------------- */

  private prop(
    key: string,
    x: number,
    y: number,
    scale = 1,
    opts: { depth?: number; tint?: number; alpha?: number; flip?: boolean; scroll?: number } = {},
  ): Phaser.GameObjects.Image {
    const img = this.add.image(x, y, key).setOrigin(0.5, 1).setScale(scale);
    img.setDepth(opts.depth ?? y);
    if (opts.tint !== undefined) img.setTint(opts.tint);
    if (opts.alpha !== undefined) img.setAlpha(opts.alpha);
    if (opts.flip) img.setFlipX(true);
    if (opts.scroll !== undefined) img.setScrollFactor(opts.scroll);
    return img;
  }

  /** Distant, hazy pine line for depth — same tinted-hazy-tree-line idiom as the main garden. */
  private buildForestFringe(): void {
    for (let i = 0; i < 9; i++) {
      const x = 80 + i * 300 + (i % 2) * 60;
      this.prop("fv_pine", x, HORIZON + 60 + (i % 3) * 20, 0.55 + (i % 2) * 0.12, {
        depth: -160,
        tint: 0xb9cfe8,
        alpha: 0.9,
        scroll: 0.9,
      });
    }
    // mid-ground pines, full colour, framing the village and plaza
    const midPines: Array<[number, number, number]> = [
      [180, 640, 0.9],
      [340, 700, 1.0],
      [980, 640, 0.85],
      [1620, 660, 0.9],
      [2260, 700, 1.0],
      [2340, 900, 0.85],
    ];
    for (const [x, y, s] of midPines) this.prop("fv_pine", x, y, s);

    // the elaborate magic treehouse — a large background hero landmark, off to one side
    this.prop("fv_magic_treehouse", 2150, 620, 1.15, { depth: 550 });

    // a dormant, unrestored tree — the world isn't perfect yet (section 24)
    this.prop("fv_dead_tree", 480, 980, 0.85);
  }

  private buildVillageCluster(): void {
    this.prop("fv_cottage_a", 560, 780, 1.05);
    this.prop("fv_cottage_b", 830, 840, 0.85);
    this.prop("fv_fence", 470, 900, 0.75);
    this.prop("fv_fence", 640, 910, 0.75, { flip: true });
    this.prop("fv_birdhouse_post", 960, 800, 0.65);
    this.prop("fv_flower_bush", 700, 940, 0.6);
    this.prop("fv_barrel_flowers", 400, 940, 0.55);
  }

  private buildWaterfallCluster(): void {
    this.prop("fv_waterfall", 1980, 760, 1.15);
    this.prop("fv_riverbank", 1780, 960, 1.0);
    this.prop("fv_icicles", 2140, 830, 0.6);
    this.prop("fv_ice_block", 2260, 940, 0.55);

    // a simple river ribbon flowing down from the waterfall base
    const river = this.add.graphics().setDepth(-130);
    river.fillStyle(0x8fd0e8, 0.85);
    const bank: Array<[number, number, number]> = [
      [1970, 900, 140],
      [1880, 1080, 170],
      [1780, 1280, 190],
      [1700, 1480, 200],
    ];
    for (const [x, y, w] of bank) river.fillEllipse(x, y, w, 110);

    this.prop("fv_bridge", 1720, 1120, 1.1);
  }

  private buildFountainPlaza(): void {
    this.prop("fv_crystal_a", FOUNTAIN.x - 210, FOUNTAIN.y + 20, 0.75);
    this.prop("fv_crystal_b", FOUNTAIN.x + 220, FOUNTAIN.y + 10, 0.7, { flip: true });
    this.prop("fv_flower_bush", FOUNTAIN.x + 60, FOUNTAIN.y + 90, 0.5);

    this.fountainDamaged = this.prop("fv_fountain_damaged", FOUNTAIN.x, FOUNTAIN.y, 1.0, {
      depth: FOUNTAIN.y,
    });
    this.fountainRestored = this.prop("fv_fountain_restored", FOUNTAIN.x, FOUNTAIN.y, 1.0, {
      depth: FOUNTAIN.y + 0.1,
    });
    this.fountainRestored.setAlpha(0);
  }

  private buildAnimals(): void {
    const rabbit = this.prop("fv_rabbit", 640, 850, 0.42);
    const fox = this.prop("fv_fox", FOUNTAIN.x - 120, FOUNTAIN.y + 60, 0.38);
    const squirrel = this.prop("fv_squirrel", 2050, 900, 0.36, { flip: true });
    this.idleTargets.push(rabbit, fox, squirrel);
  }

  private buildForeground(): void {
    this.prop("fv_berry_branch", 90, 220, 1.3, { depth: 9000, scroll: 1.04 });
    this.prop("fv_berry_branch", WORLD_W - 40, 260, 1.3, { depth: 9000, scroll: 1.04, flip: true });
    this.prop("fv_crystal_b", FOUNTAIN.x, 200, 0.9, { depth: 9000, scroll: 1.02, alpha: 0.96 });
  }

  /** Restrained ambient snow — a generated dot texture drifting slowly downward. */
  private buildSnowfall(): void {
    const key = "fv_snow_dot";
    if (!this.textures.exists(key)) {
      const g = this.make.graphics({}, false);
      g.fillStyle(0xffffff, 1);
      g.fillCircle(4, 4, 4);
      g.generateTexture(key, 8, 8);
      g.destroy();
    }
    const emitter = this.add.particles(0, 0, key, {
      x: { min: 0, max: this.scale.width },
      y: -10,
      lifespan: { min: 6000, max: 11000 },
      speedY: { min: 20, max: 46 },
      speedX: { min: -8, max: 8 },
      scale: { min: 0.4, max: 1.1 },
      alpha: { start: 0.85, end: 0.15 },
      frequency: 160,
    });
    emitter.setScrollFactor(0).setDepth(8000);
  }

  /* ---------------- idle life ---------------- */

  private startIdleBreathing(): void {
    for (const t of this.idleTargets) {
      this.tweens.add({
        targets: t,
        scaleY: t.scaleY * 1.04,
        duration: 1400 + Math.random() * 400,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
        delay: Math.random() * 600,
      });
    }
    // gentle idle sparkle drifting near the magic treehouse
    this.time.addEvent({
      delay: 3400,
      loop: true,
      callback: () => {
        const s = this.add.image(2150 + Phaser.Math.Between(-40, 40), 500, "fv_sparkle_trail")
          .setScale(0.35)
          .setAlpha(0)
          .setDepth(560);
        this.tweens.add({
          targets: s,
          alpha: 0.8,
          y: s.y - 40,
          duration: 1600,
          ease: "Sine.easeOut",
          onComplete: () => this.tweens.add({ targets: s, alpha: 0, duration: 600, onComplete: () => s.destroy() }),
        });
      },
    });
  }

  /* ---------------- interaction ---------------- */

  private handleTap(x: number, y: number): void {
    if (this.flowBusy || this.restoring) return;
    Sfx.unlock();
    const d = Phaser.Math.Distance.Between(x, y, FOUNTAIN.x, FOUNTAIN.y - 40);
    if (d < 190 && !this.restored) this.triggerFountainRestore();
  }

  /**
   * Stand-in for the eventual puzzle hookup: in the finished game, this should
   * be called once the player solves this area's picture puzzle (mirroring
   * `ProgressionService.recordPuzzleCompletion` + `PuzzleScene.onSolved` in the
   * main Garden flow), not from a direct tap. Left as a tap for this isolated
   * world-building pass so the restoration beat can be seen and reviewed.
   */
  private async triggerFountainRestore(): Promise<void> {
    if (this.restoring || this.restored) return;
    this.restoring = true;

    // 1. anticipation
    this.cameras.main.shake(160, 0.002);
    Sfx.sparkle();
    await wait(this, 220);

    // 2. magical particles gather
    const glow = await gatherGlow(this, FOUNTAIN.x, FOUNTAIN.y - 30, 650);
    sparkleBurst(this, FOUNTAIN.x, FOUNTAIN.y - 30, 22, 70);

    // 3. damaged -> restored crossfade
    this.tweens.add({ targets: this.fountainDamaged, alpha: 0, duration: 420, ease: "Sine.easeIn" });
    this.tweens.add({
      targets: this.fountainRestored,
      alpha: 1,
      duration: 520,
      ease: "Sine.easeOut",
      onComplete: () => {
        this.tweens.add({
          targets: this.fountainRestored,
          scaleY: this.fountainRestored.scaleY * 1.03,
          scaleX: this.fountainRestored.scaleX * 1.03,
          duration: 1400,
          yoyo: true,
          repeat: 1,
          ease: "Sine.easeInOut",
        });
      },
    });
    Sfx.fanfare();
    petalPuff(this, FOUNTAIN.x, FOUNTAIN.y - 60, 14);

    await wait(this, 500);
    this.tweens.add({ targets: glow, alpha: 0, duration: 500, onComplete: () => glow.destroy() });

    // 4. a nearby animal reacts with an excited little hop
    const fox = this.idleTargets[1];
    if (fox) {
      this.tweens.add({
        targets: fox,
        y: fox.y - 22,
        duration: 200,
        yoyo: true,
        repeat: 2,
        ease: "Sine.easeOut",
      });
    }

    this.restored = true;
    this.restoring = false;
  }
}
