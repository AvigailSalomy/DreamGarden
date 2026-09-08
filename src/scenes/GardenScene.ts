import Phaser from "phaser";
import { START_SCROLL, WORLD_HEIGHT, WORLD_WIDTH } from "../game/config";
import { COLORS } from "../ui/theme";
import { bus, progression } from "../game/services";
import { CameraController } from "../world/CameraController";
import { GardenObjectView } from "../world/GardenObjectView";
import { RegionOverlay } from "../world/RegionOverlay";
import type { RegionRect } from "../world/RegionOverlay";
import { IdleBehavior } from "../behavior/IdleBehavior";
import { RevealSequencer } from "../reveal/RevealSequencer";
import type { RevealHost } from "../reveal/types";
import { ambientFireflies } from "../fx/Particles";
import { Sfx } from "../fx/Sfx";
import type { GardenObjectDef } from "../data/types";
import type { UIScene } from "./UIScene";

const MEADOW: RegionRect = { id: "animalMeadow", x: 505, y: 1010, w: 640, h: 360 };
const HORIZON = 340;

export class GardenScene extends Phaser.Scene implements RevealHost {
  camera!: CameraController;
  private reveal!: RevealSequencer;

  private views = new Map<string, GardenObjectView>();
  private idles = new Map<string, IdleBehavior>();
  private regions = new Map<string, RegionOverlay>();

  private taskGlow?: Phaser.GameObjects.Image;
  private taskGhost?: Phaser.GameObjects.Image;
  private pendingUnlockId: string | null = null;
  private offFns: Array<() => void> = [];

  constructor() {
    super("Garden");
  }

  /** RevealHost: expose the scene under a name that doesn't clash with Scene.scene. */
  get phaserScene(): Phaser.Scene {
    return this;
  }

  create(): void {
    this.buildSky();
    this.buildGround();
    this.buildProps();
    this.buildRegions();
    this.buildForeground();

    this.camera = new CameraController(this, { w: WORLD_WIDTH, h: WORLD_HEIGHT });
    this.cameras.main.setScroll(START_SCROLL.x, START_SCROLL.y);
    this.camera.onTap = (x, y) => this.handleTap(x, y);
    this.camera.enable();

    this.reveal = new RevealSequencer(this);

    this.spawnSavedObjects();
    this.updateTaskMarker();

    this.time.delayedCall(60, () => {
      const ui = this.scene.get("UI") as UIScene;
      ui.setTaskFromProgression();
    });

    this.wireEvents();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());
  }

  update(): void {
    // y-sort the living actors
    for (const v of this.views.values()) v.setDepthFromY();
  }

  /* ---------------- world building ---------------- */

  private buildSky(): void {
    this.add
      .image(0, 0, "sky")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setDepth(-1000);

    this.add.image(120, 120, "clouds").setOrigin(0, 0).setScrollFactor(0.12).setDepth(-900).setAlpha(0.9);
    this.add.image(760, 60, "clouds").setOrigin(0, 0).setScrollFactor(0.18).setDepth(-900).setScale(0.8).setAlpha(0.7);

    // hills rise from just below the horizon; their feet get covered by the grass
    this.add.image(-120, HORIZON + 60, "hills_far").setOrigin(0, 1).setScrollFactor(0.35).setDepth(-820);
    this.add.image(-160, HORIZON + 96, "hills_near").setOrigin(0, 1).setScrollFactor(0.55).setDepth(-780);
  }

  private buildGround(): void {
    // guaranteed backdrop behind the ground tile
    const g = this.add.graphics().setDepth(-200).setScrollFactor(1);
    g.fillStyle(COLORS.grassDull, 1);
    g.fillRect(0, HORIZON - 4, WORLD_WIDTH, WORLD_HEIGHT - HORIZON + 4);

    this.add
      .tileSprite(0, HORIZON, WORLD_WIDTH, WORLD_HEIGHT - HORIZON, "grass_tile")
      .setOrigin(0, 0)
      .setDepth(-190);

    // soft horizon: grass fades up over the hills instead of a hard line
    const blend = this.add.graphics().setDepth(-185).setScrollFactor(1);
    blend.fillGradientStyle(
      COLORS.grassDull,
      COLORS.grassDull,
      COLORS.grassDull,
      COLORS.grassDull,
      0,
      0,
      1,
      1,
    );
    blend.fillRect(0, HORIZON - 96, WORLD_WIDTH, 128);

    this.add
      .image(1180, WORLD_HEIGHT + 6, "path")
      .setOrigin(0.5, 1)
      .setScale(1.35)
      .setDepth(-120)
      .setAlpha(0.95);
  }

  private prop(key: string, x: number, y: number, scale = 1, shadowW = 0): void {
    if (shadowW > 0) {
      this.add
        .image(x, y + 2, "shadow")
        .setOrigin(0.5, 0.5)
        .setDisplaySize(shadowW, shadowW * 0.32)
        .setAlpha(0.4)
        .setDepth(y - 1);
    }
    this.add.image(x, y, key).setOrigin(0.5, 1).setScale(scale).setDepth(y);
  }

  private buildProps(): void {
    this.prop("arch", 1160, 1660, 1.05);

    // weathered fence line along the mid-garden
    for (let i = 0; i < 5; i++) this.prop("fence", 250 + i * 330, 760 + (i % 2) * 6, 1.0);

    // neglect signifiers, denser near the meadow
    this.prop("dead_shrub", 300, 940, 1.0, 150);
    this.prop("dead_shrub", 880, 1120, 0.85, 140);
    this.prop("weeds", 470, 1120, 1.1);
    this.prop("weeds", 640, 980, 0.9);
    this.prop("weeds", 360, 1060, 0.8);
    this.prop("weeds", 760, 1180, 1.0);
    this.prop("stump", 1650, 1080, 1.1, 150);
    this.prop("rock", 200, 1180, 1.0, 150);
    this.prop("rock", 1400, 1260, 1.2, 190);
    this.prop("rock", 1950, 900, 0.8, 120);
    this.prop("weeds", 1500, 1180, 0.9);
    this.prop("weeds", 1780, 1040, 0.8);
  }

  private buildRegions(): void {
    const meadow = new RegionOverlay(this, MEADOW, 1337);
    this.regions.set("animalMeadow", meadow);
    if (progression.unlockedObjects().some((o) => o.region === "animalMeadow")) {
      meadow.applyRestoredInstant();
    }

    const alive = progression.unlockedObjects().length;
    ambientFireflies(
      this,
      new Phaser.Geom.Rectangle(MEADOW.x - 420, MEADOW.y - 300, 900, 520),
      alive > 0 ? 16 : 6,
    );
  }

  private buildForeground(): void {
    this.add
      .image(0, 0, "vignette")
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDisplaySize(this.scale.width, this.scale.height)
      .setDepth(8000);
  }

  /* ---------------- objects ---------------- */

  private spawnSavedObjects(): void {
    for (const def of progression.unlockedObjects()) {
      const view = this.spawnObjectView(def, false);
      view.setGroundPosition(def.garden_position.x, def.garden_position.y);
      this.attachIdle(view, def);
    }
  }

  spawnObjectView(def: GardenObjectDef, startHidden: boolean): GardenObjectView {
    let view = this.views.get(def.id);
    if (!view) {
      view = new GardenObjectView(this, def.garden_position.x, def.garden_position.y, {
        texture: def.garden_sprite,
        scale: def.garden_scale,
        shadowWidth: 150,
      });
      this.views.set(def.id, view);
    }
    view.container.setVisible(!startHidden);
    view.setDepthFromY();
    return view;
  }

  attachIdle(view: GardenObjectView, def: GardenObjectDef): void {
    if (this.idles.has(def.id)) return;
    const bounds =
      def.movement_bounds ?? {
        shape: "rect" as const,
        x: def.garden_position.x,
        y: def.garden_position.y,
        w: 320,
        h: 200,
      };
    const idle = new IdleBehavior(this, view, bounds);
    idle.start();
    this.idles.set(def.id, idle);
  }

  getRegionOverlay(region: string): RegionOverlay | undefined {
    return this.regions.get(region);
  }

  /* ---------------- task marker ---------------- */

  private updateTaskMarker(): void {
    const task = progression.currentTask;
    this.taskGlow?.destroy();
    this.taskGhost?.destroy();
    this.taskGlow = undefined;
    this.taskGhost = undefined;
    if (!task || progression.isUnlocked(task.id)) return;

    const { x, y } = task.garden_position;
    this.taskGlow = this.add
      .image(x, y - 30, "glow")
      .setDepth(5)
      .setScale(0.7)
      .setAlpha(0.35)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: this.taskGlow,
      scale: 0.95,
      alpha: 0.55,
      duration: 1400,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.taskGhost = this.add
      .image(x, y, task.garden_sprite)
      .setOrigin(0.5, 1)
      .setScale(task.garden_scale)
      .setDepth(6)
      .setTint(0x4a3f5c)
      .setAlpha(0.22);
    this.tweens.add({
      targets: this.taskGhost,
      alpha: 0.34,
      duration: 1600,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
  }

  private handleTap(x: number, y: number): void {
    Sfx.unlock();
    const task = progression.currentTask;
    if (task && !progression.isUnlocked(task.id) && !this.reveal.isRunning) {
      const d = Phaser.Math.Distance.Between(x, y, task.garden_position.x, task.garden_position.y);
      if (d < 150) {
        (this.scene.get("UI") as UIScene).nudgePlay();
      }
    }
  }

  /* ---------------- RevealHost extras ---------------- */

  playCoinGain(worldX: number, worldY: number, amount: number): Promise<void> {
    const ui = this.scene.get("UI") as UIScene;
    return ui.playCoinGain(this.cameras.main, worldX, worldY, amount);
  }

  refreshTaskCard(): void {
    this.updateTaskMarker();
    (this.scene.get("UI") as UIScene).setTaskFromProgression();
  }

  toast(text: string): void {
    (this.scene.get("UI") as UIScene).showToast(text);
  }

  /* ---------------- flow wiring ---------------- */

  private wireEvents(): void {
    this.offFns.push(
      bus.on("puzzle:start", ({ objectId }) => {
        if (this.reveal.isRunning) return;
        this.camera.disable();
        this.scene.launch("Puzzle", { objectId });
        this.scene.pause();
      }),
    );

    this.offFns.push(
      bus.on("object:unlock", ({ objectId }) => {
        this.pendingUnlockId = objectId;
      }),
    );

    this.offFns.push(
      bus.on("puzzle:closed", ({ solved }) => {
        const ui = this.scene.get("UI") as UIScene;
        ui.setRevealing(!!this.pendingUnlockId);
        if (this.pendingUnlockId) {
          const def = progression.def(this.pendingUnlockId);
          this.pendingUnlockId = null;
          if (def) {
            void this.reveal.play(def).then(() => {
              ui.setRevealing(false);
              bus.emit("reveal:done", { objectId: def.id });
            });
            return;
          }
        }
        this.camera.enable();
        ui.setRevealing(false);
        if (solved) this.updateTaskMarker();
        ui.setTaskFromProgression();
        ui.showCard();
      }),
    );
  }

  private teardown(): void {
    this.offFns.forEach((fn) => fn());
    this.offFns = [];
    this.idles.forEach((i) => i.stop());
  }
}
