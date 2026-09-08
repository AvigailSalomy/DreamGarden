import Phaser from "phaser";
import { HORIZON, START_FOCUS, WORLD_HEIGHT, WORLD_WIDTH } from "../game/config";
import { COLORS } from "../ui/theme";
import { bus, progression } from "../game/services";
import { CameraController } from "../world/CameraController";
import { GardenObjectView } from "../world/GardenObjectView";
import { RegionOverlay, addDormantVeil } from "../world/RegionOverlay";
import type { RegionRect } from "../world/RegionOverlay";
import { IdleBehavior } from "../behavior/IdleBehavior";
import { RevealSequencer } from "../reveal/RevealSequencer";
import type { RevealHost } from "../reveal/types";
import { ambientFireflies } from "../fx/Particles";
import { Sfx } from "../fx/Sfx";
import type { GardenObjectDef } from "../data/types";
import type { UIScene } from "./UIScene";

/** Region rectangles (centre x/y + w/h) laid across the expanded world. */
const REGIONS: Record<string, RegionRect> = {
  animalMeadow: { id: "animalMeadow", x: 900, y: 1500, w: 760, h: 440 },
  cottageYard: { id: "cottageYard", x: 1560, y: 1380, w: 640, h: 400 },
  flowerBed: { id: "flowerBed", x: 380, y: 1560, w: 560, h: 420 },
  treeGrove: { id: "treeGrove", x: 2320, y: 1460, w: 680, h: 560 },
  farmCorner: { id: "farmCorner", x: 2660, y: 1000, w: 600, h: 420 },
  pondside: { id: "pondside", x: 1540, y: 1980, w: 760, h: 380 },
};

/** Which regions have real bloomable content wired up right now. */
const BLOOMABLE = new Set(["animalMeadow", "cottageYard"]);

export class GardenScene extends Phaser.Scene implements RevealHost {
  camera!: CameraController;
  private reveal!: RevealSequencer;

  private views = new Map<string, GardenObjectView>();
  private idles = new Map<string, IdleBehavior>();
  private regions = new Map<string, RegionOverlay>();

  private screenObjects: Phaser.GameObjects.Image[] = [];
  private taskGlow?: Phaser.GameObjects.Image;
  private taskGhost?: Phaser.GameObjects.Image;
  private pendingUnlockId: string | null = null;
  private offFns: Array<() => void> = [];

  constructor() {
    super("Garden");
  }

  get phaserScene(): Phaser.Scene {
    return this;
  }

  create(): void {
    this.buildSky();
    this.buildGround();
    this.buildProps();
    this.buildRegions();
    this.buildForeground();
    this.layoutScreen();

    this.camera = new CameraController(this, { w: WORLD_WIDTH, h: WORLD_HEIGHT });
    this.cameras.main.centerOn(START_FOCUS.x, START_FOCUS.y);
    this.camera.onTap = (x, y) => this.handleTap(x, y);
    this.camera.enable();

    this.reveal = new RevealSequencer(this);

    this.spawnSavedObjects();
    this.updateTaskMarker();

    this.time.delayedCall(60, () => {
      (this.scene.get("UI") as UIScene).setTaskFromProgression();
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.wireEvents();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.teardown());

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__dgCam = () => ({
        zoom: this.cameras.main.zoom,
        scrollX: this.cameras.main.scrollX,
        scrollY: this.cameras.main.scrollY,
      });
    }
  }

  update(): void {
    for (const v of this.views.values()) v.setDepthFromY();
  }

  private onResize(): void {
    this.layoutScreen();
    this.camera?.onResize();
  }

  /** Re-fit the screen-locked images (sky, vignette) to the viewport. */
  private layoutScreen(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    for (const o of this.screenObjects) o.setDisplaySize(w, h);
  }

  /* ---------------- world building ---------------- */

  private buildSky(): void {
    const sky = this.add.image(0, 0, "sky").setOrigin(0, 0).setScrollFactor(0).setDepth(-1000);
    this.screenObjects.push(sky);

    this.add.image(300, 180, "clouds").setOrigin(0, 0).setScrollFactor(0.1).setDepth(-900).setAlpha(0.9);
    this.add.image(1400, 90, "clouds").setOrigin(0, 0).setScrollFactor(0.16).setDepth(-900).setScale(0.85).setAlpha(0.65);
    this.add.image(2400, 220, "clouds").setOrigin(0, 0).setScrollFactor(0.13).setDepth(-900).setScale(0.7).setAlpha(0.6);

    this.add.image(-160, HORIZON + 70, "hills_far").setOrigin(0, 1).setScrollFactor(0.32).setDepth(-820).setScale(1.5);
    this.add.image(-220, HORIZON + 110, "hills_near").setOrigin(0, 1).setScrollFactor(0.5).setDepth(-780).setScale(1.5);
  }

  private buildGround(): void {
    const g = this.add.graphics().setDepth(-200);
    g.fillStyle(COLORS.grassDull, 1);
    g.fillRect(0, HORIZON - 4, WORLD_WIDTH, WORLD_HEIGHT - HORIZON + 4);

    this.add
      .tileSprite(0, HORIZON, WORLD_WIDTH, WORLD_HEIGHT - HORIZON, "grass_tile")
      .setOrigin(0, 0)
      .setDepth(-190);

    const blend = this.add.graphics().setDepth(-185);
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
    blend.fillRect(0, HORIZON - 110, WORLD_WIDTH, 150);

    // central path spine, from the front up toward the archway
    this.add
      .image(1560, WORLD_HEIGHT + 10, "path")
      .setOrigin(0.5, 1)
      .setScale(1.6)
      .setDepth(-120)
      .setAlpha(0.95);
  }

  private prop(key: string, x: number, y: number, scale = 1, shadowW = 0): Phaser.GameObjects.Image {
    if (shadowW > 0) {
      this.add
        .image(x, y + 2, "shadow")
        .setOrigin(0.5, 0.5)
        .setDisplaySize(shadowW, shadowW * 0.32)
        .setAlpha(0.4)
        .setDepth(y - 1);
    }
    return this.add.image(x, y, key).setOrigin(0.5, 1).setScale(scale).setDepth(y);
  }

  private sign(x: number, y: number): void {
    this.prop("signpost", x, y, 0.95, 90);
  }

  private buildProps(): void {
    // ---- archway + cottage-yard fence ----
    this.prop("arch", 1560, 1170, 1.25);
    for (let i = 0; i < 6; i++) this.prop("fence", 1150 + i * 300, 1290 + (i % 2) * 6, 1.0);
    // fence turning up toward the farm corner
    for (let i = 0; i < 3; i++) this.prop("fence", 2560 + i * 20, 1180 - i * 150, 0.8);

    // ---- animal meadow (rabbit) — neglect signifiers ----
    this.prop("dead_shrub", 640, 1440, 1.0, 150);
    this.prop("weeds", 820, 1560, 1.1);
    this.prop("weeds", 1000, 1440, 0.9);
    this.prop("weeds", 1120, 1560, 0.85);
    this.prop("rock", 560, 1620, 1.0, 150);

    // ---- flower bed (future) ----
    this.prop("planter", 300, 1560, 1.0, 200);
    this.prop("planter", 470, 1650, 0.95, 190);
    this.prop("planter", 200, 1680, 0.85, 170);
    this.prop("weeds", 380, 1500, 0.8);
    this.sign(120, 1600);

    // ---- tree grove (future) ----
    this.prop("stump", 2140, 1420, 1.15, 160);
    this.prop("sapling", 2320, 1440, 1.1, 90);
    this.prop("sapling", 2480, 1520, 0.95, 80);
    this.prop("sapling", 2260, 1600, 0.9, 80);
    this.prop("rock", 2560, 1640, 1.1, 170);
    this.sign(2060, 1520);

    // ---- farm corner (future) ----
    this.prop("crate", 2560, 980, 1.0, 180);
    this.prop("crate", 2740, 1040, 0.9, 160);
    this.prop("weeds", 2660, 1080, 0.85);
    this.sign(2860, 1020);

    // ---- pondside (future) ----
    this.prop("pond_dry", 1540, 1980, 1.4);
    this.prop("rock", 1240, 1980, 1.1, 180);
    this.prop("rock", 1860, 1960, 0.9, 150);
    this.prop("weeds", 1420, 2040, 0.8);
    this.sign(1120, 1900);
  }

  private buildRegions(): void {
    const unlockedRegions = new Set(progression.unlockedObjects().map((o) => o.region));

    for (const key of Object.keys(REGIONS)) {
      const rect = REGIONS[key];
      if (BLOOMABLE.has(key)) {
        const ov = new RegionOverlay(this, rect, hashRegion(key));
        this.regions.set(key, ov);
        if (unlockedRegions.has(rect.id)) ov.applyRestoredInstant();
      } else {
        addDormantVeil(this, rect);
      }
    }

    const alive = progression.unlockedObjects().length;
    ambientFireflies(
      this,
      new Phaser.Geom.Rectangle(REGIONS.animalMeadow.x - 420, REGIONS.animalMeadow.y - 320, 1400, 640),
      alive > 0 ? 18 : 7,
    );
  }

  private buildForeground(): void {
    const v = this.add.image(0, 0, "vignette").setOrigin(0, 0).setScrollFactor(0).setDepth(8000);
    this.screenObjects.push(v);
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
        shadowWidth: def.category === "animal" ? 140 : 160,
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
    const idle = new IdleBehavior(this, view, bounds, def.idle_behavior);
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
      if (d < 170) (this.scene.get("UI") as UIScene).nudgePlay();
    }
  }

  /* ---------------- RevealHost extras ---------------- */

  playCoinGain(worldX: number, worldY: number, amount: number): Promise<void> {
    return (this.scene.get("UI") as UIScene).playCoinGain(this.cameras.main, worldX, worldY, amount);
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
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.offFns.forEach((fn) => fn());
    this.offFns = [];
    this.idles.forEach((i) => i.stop());
    this.idles.clear();
    this.views.clear();
    this.regions.clear();
    this.screenObjects = [];
  }
}

function hashRegion(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
