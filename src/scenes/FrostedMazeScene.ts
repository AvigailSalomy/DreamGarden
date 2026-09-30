import Phaser from "phaser";
import { makeIconButton } from "../ui/hit";
import { makePanel, makePill } from "../ui/Panel";
import { titleStyle, bodyStyle, FONT_FAMILY } from "../ui/theme";
import { FROSTED_CATALOG } from "../data/frostedValley";
import { frostedProgression, economy, bus } from "../game/services";
import { IS_TOUCH } from "../game/config";
import { MAZE_LAYOUTS } from "../data/mazeLayouts";
import type { MazeLayout } from "../data/mazeLayouts";
import { MAZE_THEMES } from "../data/mazeThemes";
import type { MazeTheme } from "../data/mazeThemes";
import {
  MazeRun,
  difficultyForOrder,
  PLAYER_MS_PER_CELL,
  START_LIVES,
  MAX_LIVES,
  POWER_MS,
  RATINGS_FOR,
  cellKey,
} from "../data/mazeRun";
import type { Cell, Dir, EnemyKind, EnemyState, RunEvent, CoinState } from "../data/mazeRun";
import type { FrostedMazeItemDef } from "../data/types";
import { Sfx } from "../fx/Sfx";
import { requirementStory } from "../data/frostedStory";
import { safeInsets } from "../util/safeArea";
import { ensureMazeTextures, MZ_HEART, MZ_POWER, MZ_SOFT_GLOW } from "../world/mazeTextures";
import { MazePlayerRig, EAR_FRAC } from "../world/MazePlayerRig";
import type { FrostedValleyScene } from "./FrostedValleyScene";

/**
 * Frozen Pac-Man — the Garden Maze behind every Frosted Valley requirement
 * (Request → Play → Maze → Victory → the requirement's restoration in the
 * world). One engine for every animal/resource, driven by data:
 *
 *  - gameplay rules live in the Phaser-free MazeRun (data/mazeRun.ts) — this
 *    scene only renders it, feeds it input and reacts to its events;
 *  - the maze is one of ten handcrafted layouts (data/mazeLayouts.ts), drawn
 *    from a persisted shuffle deck filtered by the animal's difficulty tier;
 *  - its look is the layout's visual theme (data/mazeThemes.ts);
 *  - what you collect is the requirement's own mission item (FROSTED_CATALOG
 *    `mazeItem`), how many is its `requiredAmount`;
 *  - enemies are the four Frosted Valley enemy artworks from
 *    Game_Assets_frozen_world_Compressed/packman_game/enemys (cut out by
 *    scripts/fix_maze_enemy_alpha.py into public/assets/frosted/maze/).
 *
 * Coins are paid straight into the ONE global wallet (`economy.coins`) the
 * moment they're picked up. Mission progress is never saved until a run is
 * WON — every item in one life — which is the only thing that completes the
 * requirement.
 */

interface MazeLaunchData {
  animalId: string;
  resourceId: string;
  /** Scene key to resume on exit — the Request screen normally, or FrostedValley for the dev hook. */
  returnTo?: string;
  /** TRY AGAIN: replay this same maze; coin cells already paid out stay collected. */
  retry?: { mazeId: string; bankedCoinKeys: string[] };
}

const ENEMY_TEXTURE: Record<EnemyKind, string> = {
  flame: "fv_enemy_flame",
  thorn: "fv_enemy_thorn",
  snowball: "fv_enemy_snowball",
  mushroom: "fv_enemy_mushroom",
};

const ENEMY_AURA: Record<EnemyKind, number> = {
  flame: 0xff8a3d,
  thorn: 0x36f0b4,
  snowball: 0x9fd8ff,
  mushroom: 0xc77dff,
};

/** SVG icons this scene loads at high resolution (keys are `mz_<file>`). */
const MZ_SVGS: Record<string, [number, number]> = {
  coin: [128, 128],
  carrot: [160, 160],
  water_drop: [160, 160],
  star_special: [160, 160],
  flower: [142, 160],
  berry: [160, 160],
};

interface EnemyView {
  root: Phaser.GameObjects.Container;
  body: Phaser.GameObjects.Container;
  img: Phaser.GameObjects.Image;
  aura: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  zzz: Phaser.GameObjects.Text;
  wisp: Phaser.GameObjects.Image;
  baseScale: number;
  mode: EnemyState["mode"];
  lastX: number;
  clock: number;
}

type OverlayKind = "tutorial" | "confirm" | "gameover" | "victory" | null;

const HUD_H = 76;
/** Below this width the HUD wraps onto two rows so nothing overlaps. */
const NARROW_W = 640;
const HUD_H_NARROW = 112;

export class FrostedMazeScene extends Phaser.Scene {
  private animalId = "";
  private resourceId = "";
  private returnTo = "FrostedValley";
  private animalName = "";
  private mazeItem!: FrostedMazeItemDef;
  private layout!: MazeLayout;
  private theme!: MazeTheme;
  private run!: MazeRun;

  private started = false;
  private paused = false;
  private ended = false;
  private overlayKind: OverlayKind = null;

  // layout geometry
  private transposed = false;
  private cell = 48;
  private ox = 0;
  private oy = 0;

  // display
  private world!: Phaser.GameObjects.Container;
  private rig!: MazePlayerRig;
  private itemNodes = new Map<string, Phaser.GameObjects.Container>();
  private coinNodes = new Map<string, Phaser.GameObjects.Container>();
  private heartNodes = new Map<string, Phaser.GameObjects.Container>();
  private crystalNodes = new Map<string, Phaser.GameObjects.Container>();
  private enemyViews = new Map<number, EnemyView>();
  private sparkFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private snowFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private goldFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private hud!: Phaser.GameObjects.Container;
  private overlay?: Phaser.GameObjects.Container;
  private progressText!: Phaser.GameObjects.Text;
  private pips: Phaser.GameObjects.Arc[] = [];
  private heartSlots: Phaser.GameObjects.Image[] = [];
  private coinText!: Phaser.GameObjects.Text;
  private coinIcon!: Phaser.GameObjects.Image;
  private powerBar!: Phaser.GameObjects.Container;
  private powerFill!: Phaser.GameObjects.Rectangle;
  private powerBarW = 120;
  private controls?: Phaser.GameObjects.Container;
  private redFlash!: Phaser.GameObjects.Rectangle;

  private lastPlayerKey = "";
  private deathPos = { x: 0, y: 0 };
  private offFns: Array<() => void> = [];
  private swipeStart: { x: number; y: number } | null = null;
  /** Direction keys physically held right now, most recent last (screen directions). */
  private heldKeys: Array<{ key: string; sx: number; sy: number }> = [];
  /** Bumped every create() — lets tests tell a fresh round from the one it replaced. */
  private roundId = 0;
  /** DEV-only: game-clock multiplier for timing-sensitive browser tests (1 in play). */
  private devTimeScale = 1;
  /** Coins paid out THIS attempt (for the end cards). */
  private coinsThisRun = 0;

  constructor() {
    super("FrostedMaze");
  }

  preload(): void {
    for (const [name, [w, h]] of Object.entries(MZ_SVGS)) {
      const key = `mz_${name}`;
      if (!this.textures.exists(key)) this.load.svg(key, `assets/svg/${name}.svg`, { width: w, height: h });
    }
    for (const key of Object.values(ENEMY_TEXTURE)) {
      if (!this.textures.exists(key)) this.load.image(key, `assets/frosted/maze/${key}.png`);
    }
    // Frosted Valley art used here is normally already loaded by the world;
    // anything that isn't (e.g. the snowflake icon) is fetched on demand
    const wanted = new Set<string>(["fv_rabbit", "fv_fox", "fv_deer", "fv_squirrel", "fv_polarbear", "fv_penguin", "fv_snowflake_icon"]);
    for (const a of FROSTED_CATALOG) for (const r of a.resources) if (r.mazeItem.texture.startsWith("fv_")) wanted.add(r.mazeItem.texture);
    for (const t of Object.values(MAZE_THEMES)) t.decor.forEach((d) => wanted.add(d));
    for (const key of wanted) if (!this.textures.exists(key)) this.load.image(key, `assets/frosted/${key}.png`);
  }

  create(data: MazeLaunchData): void {
    this.animalId = data.animalId;
    this.resourceId = data.resourceId;
    this.returnTo = data.returnTo ?? "FrostedValley";
    this.started = false;
    this.paused = false;
    this.ended = false;
    this.overlayKind = null;
    this.overlay = undefined;
    this.coinsThisRun = 0;
    this.lastPlayerKey = "";
    this.itemNodes.clear();
    this.coinNodes.clear();
    this.heartNodes.clear();
    this.crystalNodes.clear();
    this.enemyViews.clear();
    this.offFns = [];
    this.heldKeys = [];
    this.roundId++;
    this.devTimeScale = 1;

    ensureMazeTextures(this);

    const def = FROSTED_CATALOG.find((a) => a.id === this.animalId) ?? FROSTED_CATALOG[0];
    const resDef = def.resources.find((r) => r.id === this.resourceId) ?? def.resources[0];
    this.animalName = def.name;
    this.mazeItem = resDef.mazeItem;
    const difficulty = difficultyForOrder(def.order);

    const mazeId =
      data.retry?.mazeId ??
      frostedProgression.drawMaze(
        MAZE_LAYOUTS.map((m) => m.id),
        Math.random,
        (id) => RATINGS_FOR[difficulty].includes(MAZE_LAYOUTS.find((m) => m.id === id)?.rating ?? 2),
      );
    this.layout = MAZE_LAYOUTS.find((m) => m.id === mazeId) ?? MAZE_LAYOUTS[0];
    this.theme = MAZE_THEMES[this.layout.theme] ?? MAZE_THEMES.caves;
    this.run = new MazeRun({
      layout: this.layout.rows,
      requiredItems: resDef.requiredAmount,
      difficulty,
      rand: Math.random,
      bankedCoinKeys: data.retry?.bankedCoinKeys,
    });

    this.buildEverything();
    this.bindInput();

    this.offFns.push(bus.on("coins:changed", ({ total }) => this.setCoinText(total, true)));
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
      this.offFns.forEach((f) => f());
      this.offFns = [];
    this.heldKeys = [];
    });

    if (!frostedProgression.isMazeTutorialSeen()) this.showTutorial();
    else this.startCountdown();

    if (import.meta.env.DEV) this.installDevHooks();
  }

  /* ================= geometry ================= */

  private computeGeometry(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const inset = safeInsets();
    this.transposed = H > W * 1.05;
    const cols = this.transposed ? this.run.grid.rows : this.run.grid.cols;
    const rows = this.transposed ? this.run.grid.cols : this.run.grid.rows;
    const top = inset.top + this.hudHeight() + 10;
    const bottom = inset.bottom + (IS_TOUCH && this.transposed ? 190 : 22);
    const side = IS_TOUCH && !this.transposed ? 180 : 22;
    const availW = W - side * 2;
    const availH = H - top - bottom;
    this.cell = Phaser.Math.Clamp(Math.floor(Math.min(availW / cols, availH / rows)), 18, 92);
    this.ox = Math.round((W - cols * this.cell) / 2);
    this.oy = Math.round(top + (availH - rows * this.cell) / 2);
  }

  /** Layout (row, col) — fractional is fine — to screen pixels (tile centre). */
  private toScreen(row: number, col: number): { x: number; y: number } {
    if (this.transposed) return { x: this.ox + (row + 0.5) * this.cell, y: this.oy + (col + 0.5) * this.cell };
    return { x: this.ox + (col + 0.5) * this.cell, y: this.oy + (row + 0.5) * this.cell };
  }

  /** A screen-space direction (arrow key / swipe) to a layout direction. */
  private screenToLayoutDir(sx: number, sy: number): Dir {
    return this.transposed ? { dr: sx, dc: sy } : { dr: sy, dc: sx };
  }

  private layoutToScreenDir(d: Dir | null): { x: number; y: number } {
    if (!d) return { x: 0, y: 0 };
    return this.transposed ? { x: d.dr, y: d.dc } : { x: d.dc, y: d.dr };
  }

  /* ================= build ================= */

  private buildEverything(): void {
    this.children.removeAll(true);
    this.itemNodes.clear();
    this.coinNodes.clear();
    this.heartNodes.clear();
    this.crystalNodes.clear();
    this.enemyViews.clear();
    this.computeGeometry();

    this.buildBackground();
    this.world = this.add.container(0, 0).setDepth(2);
    this.buildBoard();
    this.buildFx();
    this.syncPickups(false);
    this.buildEnemies();
    this.buildPlayer();
    this.buildHud();
    if (IS_TOUCH) this.buildTouchControls();
    this.redFlash = this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0xff2d55, 0).setOrigin(0).setDepth(150);
    this.syncVisuals(0);
  }

  private onResize(): void {
    const kind = this.overlayKind;
    this.buildEverything();
    if (kind === "tutorial") this.showTutorial();
    else if (kind === "confirm") this.showAbandonConfirm();
    else if (kind === "gameover") this.showGameOver();
    else if (kind === "victory") this.showVictoryCard();
  }

  private buildBackground(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const t = this.theme;
    const g = this.add.graphics().setDepth(0);
    g.fillGradientStyle(t.bgTop, t.bgTop, t.bgBottom, t.bgBottom, 1);
    g.fillRect(0, 0, W, H);
    // swallow every pointer event: the world (and the Menu under it) keep
    // running beneath this scene, and a tap/swipe on an empty bit of maze
    // must never fall through to a button down there
    this.add.rectangle(0, 0, W, H, 0x000000, 0).setOrigin(0).setDepth(0).setInteractive();
    // soft accent glows so the backdrop isn't flat
    const glowA = this.add.image(W * 0.18, H * 0.25, MZ_SOFT_GLOW).setTint(t.accent).setAlpha(0.18).setDisplaySize(W * 0.7, W * 0.7).setDepth(0);
    const glowB = this.add.image(W * 0.85, H * 0.8, MZ_SOFT_GLOW).setTint(t.accent).setAlpha(0.12).setDisplaySize(W * 0.8, W * 0.8).setDepth(0);
    this.tweens.add({ targets: [glowA, glowB], alpha: "+=0.06", duration: 3200, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    // gentle snowfall — one emitter for the whole scene
    this.add
      .particles(0, 0, "spark", {
        x: { min: 0, max: W },
        y: -10,
        lifespan: { min: 5000, max: 9000 },
        speedY: { min: 18, max: 46 },
        speedX: { min: -12, max: 12 },
        scale: { min: 0.12, max: 0.32 },
        alpha: { start: 0.75, end: 0.1 },
        tint: 0xffffff,
        frequency: Math.round(420 - 300 * t.snow),
      })
      .setDepth(1);
  }

  /**
   * Draws the maze in its theme. Walls are a solid carved block (the board is
   * filled with wall, then the walkable floor is cut out of it) so the
   * boundary between WALL and PATH is always crisp; each theme then dresses
   * the walls in its own style. Decorations only ever sit on wall tiles that
   * are surrounded by wall, so they can never cover a path.
   */
  private buildBoard(): void {
    const t = this.theme;
    const c = this.cell;
    const grid = this.run.grid;
    const cols = this.transposed ? grid.rows : grid.cols;
    const rows = this.transposed ? grid.cols : grid.rows;
    const bw = cols * c;
    const bh = rows * c;
    const isOpenScreen = (sr: number, sc: number) => (this.transposed ? grid.isOpen(sc, sr) : grid.isOpen(sr, sc));

    const g = this.add.graphics();
    this.world.add(g);
    // frame + drop shadow
    g.fillStyle(0x000000, 0.28);
    g.fillRoundedRect(this.ox - 10, this.oy - 4, bw + 20, bh + 22, 18);
    g.fillStyle(t.wallEdge, 1);
    g.fillRoundedRect(this.ox - 8, this.oy - 8, bw + 16, bh + 16, 16);
    g.fillStyle(t.wall, 1);
    g.fillRoundedRect(this.ox - 4, this.oy - 4, bw + 8, bh + 8, 14);

    const px = (sc: number) => this.ox + sc * c;
    const py = (sr: number) => this.oy + sr * c;

    // wall dressing per style, under the floor cut-out
    for (let sr = 0; sr < rows; sr++) {
      for (let sc = 0; sc < cols; sc++) {
        if (isOpenScreen(sr, sc)) continue;
        const x = px(sc);
        const y = py(sr);
        const hash = (sr * 73 + sc * 151) % 7;
        switch (t.wallStyle) {
          case "stone":
            g.fillStyle(hash % 2 ? t.wall : Phaser.Display.Color.IntegerToColor(t.wall).darken(8).color, 1);
            g.fillRoundedRect(x + 1.5, y + 1.5, c - 3, c - 3, c * 0.12);
            g.lineStyle(1, t.wallEdge, 0.5);
            g.lineBetween(x + 2, y + c * 0.5, x + c - 2, y + c * 0.5);
            g.lineBetween(x + c * (hash % 2 ? 0.35 : 0.65), y + 2, x + c * (hash % 2 ? 0.35 : 0.65), y + c * 0.5);
            break;
          case "crystal":
            g.fillStyle(Phaser.Display.Color.IntegerToColor(t.wall).lighten(hash * 2).color, 1);
            g.fillTriangle(x, y, x + c, y, x + c * (0.3 + hash * 0.06), y + c);
            g.fillStyle(Phaser.Display.Color.IntegerToColor(t.wall).darken(6).color, 1);
            g.fillTriangle(x + c, y, x + c, y + c, x + c * (0.3 + hash * 0.06), y + c);
            break;
          case "snow":
            g.fillStyle(Phaser.Display.Color.IntegerToColor(t.wall).lighten(6).color, 1);
            g.fillCircle(x + c * 0.5, y + c * 0.5, c * 0.56);
            break;
          case "glacier":
            g.fillStyle(0xffffff, 0.14);
            g.fillRect(x + c * 0.15 + hash, y, c * 0.14, c);
            break;
          case "forest":
            g.fillStyle(Phaser.Display.Color.IntegerToColor(t.wall).darken(hash).color, 1);
            g.fillCircle(x + c * 0.5, y + c * 0.55, c * 0.52);
            break;
          case "ice":
            g.fillStyle(0xffffff, 0.08 + hash * 0.01);
            g.fillTriangle(x + c * 0.1, y + c * 0.9, x + c * 0.5, y + c * 0.1, x + c * 0.9, y + c * 0.9);
            break;
        }
      }
    }

    // walkable floor, carved out of the wall
    for (let sr = 0; sr < rows; sr++) {
      for (let sc = 0; sc < cols; sc++) {
        if (!isOpenScreen(sr, sc)) continue;
        const x = px(sc);
        const y = py(sr);
        g.fillStyle(t.floor, 1);
        g.fillRect(x, y, c, c);
        // soft inner shadow along any wall edge — reads as a sunken path
        g.fillStyle(t.floorShade, 1);
        const sh = Math.max(3, c * 0.09);
        if (!isOpenScreen(sr - 1, sc)) g.fillRect(x, y, c, sh);
        if (!isOpenScreen(sr, sc - 1)) g.fillRect(x, y, sh * 0.7, c);
        if (!isOpenScreen(sr, sc + 1)) g.fillRect(x + c - sh * 0.7, y, sh * 0.7, c);
      }
    }

    // lit top face / snow cap on every wall edge that faces a path below
    for (let sr = 0; sr < rows; sr++) {
      for (let sc = 0; sc < cols; sc++) {
        if (isOpenScreen(sr, sc) || !isOpenScreen(sr + 1, sc)) continue;
        const x = px(sc);
        const y = py(sr);
        g.fillStyle(t.wallTop, t.wallStyle === "glacier" || t.wallStyle === "snow" || t.wallStyle === "stone" || t.wallStyle === "forest" ? 0.95 : 0.7);
        g.fillRoundedRect(x - 1, y + c * 0.62, c + 2, c * 0.3, c * 0.12);
        if (t.wallStyle === "ice" || t.wallStyle === "glacier" || t.wallStyle === "crystal") {
          // icicles hanging over the path edge
          g.fillStyle(t.wallTop, 0.9);
          const n = (sr + sc) % 2 ? 2 : 3;
          for (let i = 0; i < n; i++) {
            const ix = x + (c / (n + 1)) * (i + 1);
            g.fillTriangle(ix - c * 0.06, y + c * 0.9, ix + c * 0.06, y + c * 0.9, ix, y + c * (1.04 + ((sr + i) % 3) * 0.03));
          }
        }
      }
    }

    // floor detail: faint cracks / sparkle dots, never covering collectibles' read
    const detail = this.add.graphics();
    this.world.add(detail);
    detail.lineStyle(1, t.floorShade, 0.8);
    for (let sr = 0; sr < rows; sr++) {
      for (let sc = 0; sc < cols; sc++) {
        if (!isOpenScreen(sr, sc) || (sr * 7 + sc * 3) % 9 !== 0) continue;
        const x = px(sc) + c * 0.25;
        const y = py(sr) + c * 0.7;
        if (t.wallStyle === "ice" || t.wallStyle === "glacier") {
          detail.lineBetween(x, y, x + c * 0.18, y - c * 0.1);
          detail.lineBetween(x + c * 0.18, y - c * 0.1, x + c * 0.3, y - c * 0.02);
        } else {
          detail.fillStyle(0xffffff, 0.9);
          detail.fillCircle(x + c * 0.4, y - c * 0.3, Math.max(1, c * 0.03));
        }
      }
    }

    this.buildDecorations(rows, cols, isOpenScreen);

    // the start tile: a soft glowing snow circle so the player knows where they respawn
    const s = this.toScreen(grid.start.row, grid.start.col);
    const startGlow = this.add.image(s.x, s.y, MZ_SOFT_GLOW).setTint(this.theme.accent).setAlpha(0.35).setDisplaySize(c * 1.2, c * 1.2);
    this.world.add(startGlow);
    this.tweens.add({ targets: startGlow, alpha: 0.15, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
  }

  /** A few theme props on wall tiles buried in wall (all 8 neighbours wall) — pure atmosphere, never over a path. */
  private buildDecorations(rows: number, cols: number, isOpenScreen: (r: number, c: number) => boolean): void {
    const spots: Array<{ sr: number; sc: number }> = [];
    for (let sr = 1; sr < rows - 1; sr++) {
      for (let sc = 1; sc < cols - 1; sc++) {
        let buried = true;
        for (let dr = -1; dr <= 1 && buried; dr++) for (let dc = -1; dc <= 1; dc++) if (isOpenScreen(sr + dr, sc + dc)) buried = false;
        if (buried) spots.push({ sr, sc });
      }
    }
    // border-row wall tiles whose inner neighbour is wall too also qualify
    for (let sc = 1; sc < cols - 1; sc++) {
      if (!isOpenScreen(1, sc) && !isOpenScreen(1, sc - 1) && !isOpenScreen(1, sc + 1)) spots.push({ sr: 0, sc });
    }
    const decor = this.theme.decor.filter((k) => this.textures.exists(k));
    if (!decor.length) return;
    const max = Math.min(8, spots.length);
    for (let i = 0; i < max; i++) {
      const spot = spots[Math.floor((i * spots.length) / max)];
      const key = decor[i % decor.length];
      const x = this.ox + (spot.sc + 0.5) * this.cell;
      const y = this.oy + (spot.sr + 0.5) * this.cell;
      const img = this.add.image(x, y, key);
      const scale = (this.cell * 0.92) / Math.max(img.width, img.height);
      img.setScale(scale).setAlpha(0.95);
      this.world.add(img);
      if (key === "fv_glow_orb" || key.startsWith("fv_crystal")) {
        this.tweens.add({ targets: img, alpha: 0.65, duration: 1200 + i * 150, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      }
    }
  }

  private buildFx(): void {
    const base = {
      emitting: false,
      lifespan: { min: 350, max: 800 },
      speed: { min: 40, max: 160 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.55, end: 0 },
      alpha: { start: 1, end: 0 },
      blendMode: Phaser.BlendModes.ADD,
    };
    this.sparkFx = this.add.particles(0, 0, "spark", { ...base, tint: [0xffffff, this.theme.accent, 0xfff2b0] }).setDepth(60);
    this.goldFx = this.add.particles(0, 0, "spark", { ...base, tint: [0xffd75e, 0xfff2b0], speed: { min: 30, max: 110 } }).setDepth(60);
    this.snowFx = this.add
      .particles(0, 0, "spark", { ...base, tint: 0xffffff, blendMode: Phaser.BlendModes.NORMAL, speed: { min: 20, max: 70 }, gravityY: 60, scale: { start: 0.3, end: 0 } })
      .setDepth(9);
  }

  /* ================= pickups ================= */

  /** Bring the pickup visuals in line with the run's state (adds new ones, drops stale ones). */
  private syncPickups(animateNew: boolean, restoreFrom?: { x: number; y: number }): void {
    const drop = (nodes: Map<string, Phaser.GameObjects.Container>, live: Map<string, unknown>) => {
      for (const [k, n] of nodes) {
        if (live.has(k)) continue;
        n.destroy();
        nodes.delete(k);
      }
    };
    drop(this.itemNodes, this.run.items);
    drop(this.coinNodes, this.run.coins);
    drop(this.heartNodes, this.run.hearts);
    drop(this.crystalNodes, this.run.crystals);

    for (const [k, cell] of this.run.items) if (!this.itemNodes.has(k)) this.itemNodes.set(k, this.makeItem(cell, animateNew, restoreFrom));
    for (const [k, coin] of this.run.coins) if (!this.coinNodes.has(k)) this.coinNodes.set(k, this.makeCoin(coin));
    for (const [k, cell] of this.run.hearts) if (!this.heartNodes.has(k)) this.heartNodes.set(k, this.makeHeart(cell, animateNew));
    for (const [k, cell] of this.run.crystals) if (!this.crystalNodes.has(k)) this.crystalNodes.set(k, this.makeCrystal(cell, animateNew));
  }

  private fitImage(img: Phaser.GameObjects.Image, size: number): Phaser.GameObjects.Image {
    return img.setScale(size / Math.max(img.width, img.height, 1));
  }

  /** Mission item: big, colourful, glowing, floating — unmistakably not a coin. */
  private makeItem(cell: Cell, sprout: boolean, restoreFrom?: { x: number; y: number }): Phaser.GameObjects.Container {
    const p = this.toScreen(cell.row, cell.col);
    const c = this.add.container(p.x, p.y).setDepth(6);
    const glow = this.add.image(0, 0, MZ_SOFT_GLOW).setTint(0xffe9a8).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(this.cell * 1.5, this.cell * 1.5).setAlpha(0.8);
    const disc = this.add.circle(0, 0, this.cell * 0.4, 0xffffff, 0.55).setStrokeStyle(Math.max(2, this.cell * 0.05), 0xffd75e, 0.95);
    const inner = this.add.container(0, 0);
    const icon = this.fitImage(this.add.image(0, 0, this.mazeItem.texture), this.cell * 0.74);
    inner.add(icon);
    c.add([glow, disc, inner]);
    this.world.add(c);
    this.tweens.add({ targets: inner, y: -this.cell * 0.08, duration: 800, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: inner, angle: { from: -7, to: 7 }, duration: 1300, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: glow, alpha: 0.35, scale: glow.scale * 1.15, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    if (restoreFrom) {
      // after a death: the dropped item flies back to its original spot
      c.setPosition(restoreFrom.x, restoreFrom.y).setScale(0.4).setAlpha(0.9);
      this.tweens.add({ targets: c, x: p.x, y: p.y, scale: 1, duration: 700, ease: "Cubic.easeInOut" });
    } else if (sprout) {
      c.setScale(0);
      this.tweens.add({ targets: c, scale: 1, duration: 520, ease: "Back.easeOut" });
      const ring = this.add.circle(p.x, p.y, this.cell * 0.4).setStrokeStyle(3, 0xffe38a, 1).setDepth(7);
      this.world.add(ring);
      this.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: 700, ease: "Cubic.easeOut", onComplete: () => ring.destroy() });
      this.sparkFx.explode(10, p.x, p.y);
    }
    return c;
  }

  /** Coin: a gold coin that spins and glints — money, at a glance. Treasure coins are a little stack. */
  private makeCoin(coin: CoinState): Phaser.GameObjects.Container {
    const p = this.toScreen(coin.cell.row, coin.cell.col);
    const c = this.add.container(p.x, p.y).setDepth(5);
    const size = this.cell * (coin.treasure ? 0.46 : 0.4);
    const glow = this.add.image(0, 0, MZ_SOFT_GLOW).setTint(0xffd75e).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(this.cell * 0.95, this.cell * 0.95).setAlpha(0.45);
    c.add(glow);
    const spin = this.add.container(0, 0);
    if (coin.treasure) {
      for (let i = 0; i < 3; i++) spin.add(this.fitImage(this.add.image((i - 1) * size * 0.28, -i * size * 0.18 + size * 0.1, "mz_coin"), size));
    } else {
      spin.add(this.fitImage(this.add.image(0, 0, "mz_coin"), size));
    }
    c.add(spin);
    const glint = this.add.text(size * 0.3, -size * 0.35, "✦", { fontSize: `${Math.round(size * 0.45)}px`, color: "#ffffff" }).setOrigin(0.5).setAlpha(0);
    c.add(glint);
    this.world.add(c);
    this.tweens.add({ targets: spin, scaleX: 0.62, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut", delay: (coin.cell.row * 90 + coin.cell.col * 40) % 600 });
    this.tweens.add({ targets: glint, alpha: 1, scale: 1.3, duration: 180, yoyo: true, repeat: -1, repeatDelay: 1600 + ((coin.cell.col * 97) % 900) });
    return c;
  }

  /** Heart pickup: a bold red heart with a heartbeat pulse and pink glow. */
  private makeHeart(cell: Cell, sprout: boolean): Phaser.GameObjects.Container {
    const p = this.toScreen(cell.row, cell.col);
    const c = this.add.container(p.x, p.y).setDepth(6);
    const glow = this.add.image(0, 0, MZ_SOFT_GLOW).setTint(0xff6b8a).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(this.cell * 1.3, this.cell * 1.3).setAlpha(0.6);
    const heart = this.fitImage(this.add.image(0, 0, MZ_HEART), this.cell * 0.62);
    const plus = this.add
      .text(this.cell * 0.24, -this.cell * 0.24, "+", { fontFamily: FONT_FAMILY, fontStyle: "800", fontSize: `${Math.round(this.cell * 0.34)}px`, color: "#ffffff", stroke: "#b0103a", strokeThickness: 4 })
      .setOrigin(0.5);
    c.add([glow, heart, plus]);
    this.world.add(c);
    const base = heart.scale;
    this.tweens.chain({
      targets: heart,
      loop: -1,
      tweens: [
        { scale: base * 1.16, duration: 110, ease: "Sine.easeOut" },
        { scale: base, duration: 120, ease: "Sine.easeIn" },
        { scale: base * 1.12, duration: 110, ease: "Sine.easeOut" },
        { scale: base, duration: 160, ease: "Sine.easeIn" },
        { scale: base, duration: 700 },
      ],
    });
    if (sprout) {
      c.setScale(0);
      this.tweens.add({ targets: c, scale: 1, duration: 420, ease: "Back.easeOut" });
    }
    return c;
  }

  /** Power Crystal: a faceted cyan gem, slowly turning, with an orbiting frost ring. */
  private makeCrystal(cell: Cell, sprout: boolean): Phaser.GameObjects.Container {
    const p = this.toScreen(cell.row, cell.col);
    const c = this.add.container(p.x, p.y).setDepth(6);
    const glow = this.add.image(0, 0, MZ_SOFT_GLOW).setTint(0x6fe0ff).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(this.cell * 1.5, this.cell * 1.5).setAlpha(0.75);
    const ring = this.add.ellipse(0, 0, this.cell * 0.9, this.cell * 0.34).setStrokeStyle(2, 0xbff4ff, 0.8);
    const gem = this.fitImage(this.add.image(0, 0, MZ_POWER), this.cell * 0.6);
    c.add([glow, ring, gem]);
    this.world.add(c);
    this.tweens.add({ targets: gem, scaleX: gem.scaleX * 0.72, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    this.tweens.add({ targets: ring, angle: 360, duration: 3000, repeat: -1 });
    this.tweens.add({ targets: glow, alpha: 0.4, duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    if (sprout) {
      c.setScale(0);
      this.tweens.add({ targets: c, scale: 1, duration: 420, ease: "Back.easeOut" });
    }
    return c;
  }

  /* ================= enemies & player ================= */

  private buildEnemies(): void {
    for (const e of this.run.enemies) {
      const root = this.add.container(0, 0);
      const shadow = this.add.ellipse(0, this.cell * 0.36, this.cell * 0.62, this.cell * 0.16, 0x0b2236, 0.35);
      const aura = this.add.image(0, 0, MZ_SOFT_GLOW).setTint(ENEMY_AURA[e.kind]).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(this.cell * 1.45, this.cell * 1.45).setAlpha(0.55);
      const body = this.add.container(0, 0);
      const img = this.add.image(0, 0, ENEMY_TEXTURE[e.kind]);
      const baseScale = (this.cell * 1.02) / Math.max(img.width, img.height);
      img.setScale(baseScale);
      body.add(img);
      const zzz = this.add.text(this.cell * 0.3, -this.cell * 0.45, "z", { fontFamily: FONT_FAMILY, fontStyle: "700", fontSize: `${Math.round(this.cell * 0.3)}px`, color: "#e8f6ff" }).setOrigin(0.5);
      const wisp = this.add.image(0, 0, MZ_SOFT_GLOW).setTint(0xdff8ff).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(this.cell * 0.6, this.cell * 0.6).setAlpha(0);
      root.add([shadow, aura, body, zzz, wisp]);
      this.world.add(root);
      this.enemyViews.set(e.id, { root, body, img, aura, shadow, zzz, wisp, baseScale, mode: e.mode, lastX: 0, clock: e.id * 400 });
    }
  }

  private buildPlayer(): void {
    const key = this.textures.exists(this.animalId) ? this.animalId : "fv_rabbit";
    this.rig = new MazePlayerRig(this, { texture: key, height: this.cell * 1.08, earFrac: EAR_FRAC[key], msPerCell: PLAYER_MS_PER_CELL });
    this.world.add(this.rig.root);
  }

  /* ================= per-frame ================= */

  update(_time: number, delta: number): void {
    if (!this.run) return;
    const dt = Math.min(delta, 100) * this.devTimeScale;
    if (this.started && !this.paused && !this.ended) {
      for (const e of this.run.tick(dt)) this.onRunEvent(e);
    }
    this.syncVisuals(dt);
  }

  private syncVisuals(dt: number): void {
    const run = this.run;
    const pp = run.playerPos();
    const ps = this.toScreen(pp.row, pp.col);
    const playing = run.status === "playing" && this.started && !this.paused && !this.ended;
    const sdir = this.layoutToScreenDir(run.player.dir);
    const moving = playing && !!run.player.next;
    if (run.status !== "dying") this.rig.root.setPosition(ps.x, ps.y);
    this.rig.root.setDepth(10 + ps.y / 10000);
    this.rig.update(dt, moving, moving ? sdir.x : 0, moving ? sdir.y : 0);
    this.rig.setProtected(run.protectMs > 0 && run.status === "playing");
    this.rig.setPowered(run.powerMs > 0);

    // snow dust each time a tile is landed on
    const pk = cellKey(run.player.cell);
    if (moving && pk !== this.lastPlayerKey && this.lastPlayerKey) this.snowFx.explode(3, ps.x, ps.y + this.cell * 0.4);
    this.lastPlayerKey = pk;

    // danger alert: an active enemy almost on top of you
    let nearest = 99;
    for (const e of run.enemies) {
      if (!run.isDangerous(e)) continue;
      const ep = run.enemyPos(e);
      nearest = Math.min(nearest, Math.hypot(ep.row - pp.row, ep.col - pp.col));
    }
    this.rig.setAlert(playing && nearest < 1.9 && run.protectMs <= 0 && run.powerMs <= 0);

    for (const e of run.enemies) this.syncEnemy(e, dt);

    if (this.powerBar) {
      const on = run.powerMs > 0;
      this.powerBar.setVisible(on);
      if (on) {
        this.powerFill.width = this.powerBarW * (run.powerMs / POWER_MS);
        this.powerFill.setFillStyle(run.powerMs < 1800 && Math.floor(run.powerMs / 150) % 2 ? 0xffffff : 0x6fe0ff);
      }
    }
  }

  private syncEnemy(e: EnemyState, dt: number): void {
    const v = this.enemyViews.get(e.id);
    if (!v) return;
    v.clock += dt;
    const pos = this.run.enemyPos(e);
    const s = this.toScreen(pos.row, pos.col);
    v.root.setPosition(s.x, s.y).setDepth(10 + s.y / 10000);

    const dx = s.x - v.lastX;
    v.lastX = s.x;
    // the flame's trail is painted streaming right, so it faces left by default
    if (Math.abs(dx) > 0.05) v.img.setFlipX(e.kind === "flame" ? dx > 0 : dx < 0);

    const t = v.clock;
    const mode = e.mode;
    if (mode !== v.mode) {
      this.onEnemyModeChange(e, v, v.mode, mode);
      v.mode = mode;
    }

    const visible = mode !== "returning";
    v.body.setVisible(visible);
    v.shadow.setVisible(visible);
    v.aura.setVisible(visible);
    v.zzz.setVisible(mode === "sleeping");
    v.wisp.setAlpha(mode === "returning" ? 0.9 : 0);

    if (mode === "sleeping") {
      v.body.setAlpha(0.6).setScale(1, 0.94 + Math.sin(t / 500) * 0.04);
      v.body.y = 0;
      v.zzz.setY(-this.cell * 0.45 - ((t / 20) % 18)).setAlpha(1 - ((t / 20) % 18) / 18);
      v.img.clearTint();
    } else if (mode === "returning") {
      if (Math.floor(t / 60) % 3 === 0) this.sparkFx.explode(1, s.x, s.y);
    } else {
      const moving = !!e.next;
      const bob = moving ? Math.abs(Math.sin(t / 110)) : Math.abs(Math.sin(t / 380)) * 0.4;
      v.body.y = -bob * this.cell * 0.08;
      v.body.setScale(1 + (moving ? (1 - bob) * 0.06 : 0), 1 - (moving ? (1 - bob) * 0.06 : 0) + bob * 0.03);
      v.body.angle = moving ? Math.sin(t / 160) * 6 : 0;
      v.aura.setAlpha(0.45 + 0.2 * Math.sin(t / 240));
      if (mode === "frightened") {
        const blink = this.run.powerMs < 1800 && Math.floor(t / 140) % 2 === 0;
        v.img.setTint(blink ? 0xffffff : 0x8fd8ff);
        v.body.x = Math.sin(t / 30) * this.cell * 0.03; // shivering
        v.aura.setTint(0x6fe0ff);
        v.body.setAlpha(0.92);
      } else {
        v.img.clearTint();
        v.body.x = 0;
        v.aura.setTint(ENEMY_AURA[e.kind]);
        v.body.setAlpha(mode === "respawning" ? 0.45 + 0.4 * Math.abs(Math.sin(t / 90)) : 1);
      }
    }
  }

  private onEnemyModeChange(e: EnemyState, v: EnemyView, from: EnemyState["mode"], to: EnemyState["mode"]): void {
    const p = this.toScreen(e.cell.row, e.cell.col);
    if ((from === "sleeping" || from === "respawning") && (to === "active" || to === "frightened")) {
      // waking up: a little pop and burst of frost
      v.body.setScale(0.6);
      this.tweens.add({ targets: v.body, scaleX: 1, scaleY: 1, duration: 300, ease: "Back.easeOut" });
      this.snowFx.explode(8, p.x, p.y);
    }
    if (to === "respawning") {
      v.body.setScale(0.2);
      this.tweens.add({ targets: v.body, scaleX: 1, scaleY: 1, duration: 400, ease: "Back.easeOut" });
      this.sparkFx.explode(10, p.x, p.y);
    }
  }

  /* ================= events ================= */

  private onRunEvent(e: RunEvent): void {
    switch (e.type) {
      case "coin":
        this.onCoin(e.cell, e.value, e.treasure);
        break;
      case "item":
        this.onItem(e.cell, e.collected);
        break;
      case "itemSpawn":
        this.syncPickups(true);
        break;
      case "heart":
        this.onHeart(e.cell);
        break;
      case "heartFull": {
        const p = this.toScreen(e.cell.row, e.cell.col);
        this.floatText(p.x, p.y - this.cell * 0.5, "Lives full!", "#ffd1dc", 14);
        break;
      }
      case "power":
        this.onPower(e.cell);
        break;
      case "enemyCaught":
        this.onEnemyCaught(e.enemyId, e.bonus);
        break;
      case "hit":
        this.onHit(e.livesLeft);
        break;
      case "respawn":
        this.onRespawn(e.lostItems);
        this.reapplyHeldKey();
        break;
      case "won":
        this.winRound();
        break;
      case "lost":
        this.ended = true;
        this.time.delayedCall(250, () => this.showGameOver());
        break;
      default:
        break;
    }
  }

  private onCoin(cell: Cell, value: number, treasure: boolean): void {
    const k = cellKey(cell);
    const node = this.coinNodes.get(k);
    this.coinNodes.delete(k);
    const p = this.toScreen(cell.row, cell.col);
    // paid into the ONE global wallet right now — the HUD follows via coins:changed
    economy.add(value, "frosted:maze-coin");
    this.coinsThisRun += value;
    Sfx.coin();
    this.goldFx.explode(treasure ? 14 : 7, p.x, p.y);
    this.floatText(p.x, p.y - this.cell * 0.4, `+${value}`, "#ffe07a", treasure ? 20 : 16, "mz_coin");
    if (node) {
      this.tweens.killTweensOf(node.list);
      const target = this.coinIcon.getWorldTransformMatrix();
      this.tweens.add({ targets: node, scale: 1.4, duration: 90, yoyo: true });
      this.tweens.add({
        targets: node,
        x: target.tx,
        y: target.ty,
        scale: 0.4,
        alpha: 0.2,
        duration: 480,
        delay: 90,
        ease: "Cubic.easeIn",
        onComplete: () => node.destroy(),
      });
    }
  }

  private onItem(cell: Cell, collected: number): void {
    const k = cellKey(cell);
    const node = this.itemNodes.get(k);
    this.itemNodes.delete(k);
    const p = this.toScreen(cell.row, cell.col);
    Sfx.itemCollect();
    this.sparkFx.explode(18, p.x, p.y);
    this.floatText(p.x, p.y - this.cell * 0.55, `+1 ${this.mazeItem.singular}`, "#fff3c4", 17);
    if (node) {
      this.tweens.killTweensOf(node);
      this.tweens.add({ targets: node, scale: 1.6, alpha: 0, duration: 260, ease: "Back.easeIn", onComplete: () => node.destroy() });
    }
    this.refreshProgress(true);
    void collected;
  }

  private onHeart(cell: Cell): void {
    const k = cellKey(cell);
    const node = this.heartNodes.get(k);
    this.heartNodes.delete(k);
    const p = this.toScreen(cell.row, cell.col);
    Sfx.heartUp();
    this.sparkFx.explode(12, p.x, p.y);
    this.floatText(p.x, p.y - this.cell * 0.5, "❤️ +1 LIFE", "#ffd1dc", 18);
    node?.destroy();
    this.refreshHearts(true);
  }

  private onPower(cell: Cell): void {
    const k = cellKey(cell);
    this.crystalNodes.get(k)?.destroy();
    this.crystalNodes.delete(k);
    const p = this.toScreen(cell.row, cell.col);
    Sfx.powerUp();
    this.cameras.main.flash(220, 150, 230, 255);
    this.sparkFx.explode(24, p.x, p.y);
    this.floatText(p.x, p.y - this.cell * 0.6, "❄ FROST POWER!", "#bff4ff", 20);
  }

  private onEnemyCaught(enemyId: number, bonus: number): void {
    const e = this.run.enemies.find((x) => x.id === enemyId);
    const v = this.enemyViews.get(enemyId);
    if (!e || !v) return;
    const pos = this.run.enemyPos(e);
    const p = this.toScreen(pos.row, pos.col);
    Sfx.enemyCatch();
    economy.add(bonus, "frosted:maze-catch");
    this.coinsThisRun += bonus;
    this.sparkFx.explode(20, p.x, p.y);
    this.snowFx.explode(10, p.x, p.y);
    this.floatText(p.x, p.y - this.cell * 0.5, `✨ +${bonus}`, "#ffe07a", 20, "mz_coin");
  }

  private onHit(livesLeft: number): void {
    // lets the story layer show its one-time "oops" tip (FrostedStoryDirector)
    this.game.events.emit("gardenMaze:hit", { livesLeft });
    const pp = this.run.playerPos();
    this.deathPos = this.toScreen(pp.row, pp.col);
    Sfx.hit();
    this.time.delayedCall(260, () => Sfx.lifeLost());
    this.cameras.main.shake(260, 0.01);
    this.redFlash.setAlpha(0.35);
    this.tweens.add({ targets: this.redFlash, alpha: 0, duration: 520, ease: "Sine.easeOut" });
    this.snowFx.explode(16, this.deathPos.x, this.deathPos.y);
    this.rig.playDeath();

    // the lost heart pops off the HUD
    const slot = this.heartSlots[livesLeft];
    if (slot) {
      const ghost = this.add.image(slot.x, slot.y, MZ_HEART).setScale(slot.scale).setDepth(120);
      this.tweens.add({ targets: ghost, y: ghost.y + 40, scale: slot.scale * 1.6, alpha: 0, angle: 30, duration: 700, ease: "Cubic.easeIn", onComplete: () => ghost.destroy() });
    }
    this.refreshHearts(false);

    this.time.delayedCall(700, () => {
      const W = this.scale.width;
      const H = this.scale.height;
      this.centerBanner(W / 2, H * 0.42, "❤️ −1 LIFE", "#ffd1dc", 40, 1100);
      if (this.run.collected > 0) {
        this.centerBanner(W / 2, H * 0.42 + 48, `${this.mazeItem.label} dropped!  ${this.run.collected} → 0`, "#fff3c4", 22, 1100);
      }
    });
  }

  private onRespawn(lostItems: number): void {
    const s = this.toScreen(this.run.grid.start.row, this.run.grid.start.col);
    this.rig.root.setPosition(s.x, s.y);
    this.rig.playRespawn();
    Sfx.respawn();
    this.snowFx.explode(18, s.x, s.y);
    this.sparkFx.explode(12, s.x, s.y);
    // mission items fly back from where you fell to their original spots
    for (const [k, n] of this.itemNodes) {
      n.destroy();
      this.itemNodes.delete(k);
    }
    this.syncPickups(true, lostItems > 0 ? this.deathPos : undefined);
    this.refreshProgress(false);
    this.refreshHearts(false);
    if (lostItems > 0) {
      this.tweens.add({ targets: this.progressText, scale: 1.4, duration: 150, yoyo: true, repeat: 1 });
      this.progressText.setColor("#ff9aa8");
      this.time.delayedCall(900, () => this.progressText.setColor("#ffe07a"));
      this.centerBanner(this.scale.width / 2, this.scale.height * 0.42, `Collect all ${this.run.requiredItems} again!`, "#ffffff", 24, 1300);
    }
  }

  /* ================= HUD ================= */

  private hudHeight(): number {
    return this.scale.width < NARROW_W ? HUD_H_NARROW : HUD_H;
  }

  private buildHud(): void {
    const W = this.scale.width;
    const inset = safeInsets();
    const narrow = W < NARROW_W;
    const k = narrow ? 0.9 : Phaser.Math.Clamp(W / 1000, 0.72, 1);
    const hudH = this.hudHeight();
    const y = inset.top + (narrow ? 34 : HUD_H / 2 + 4);
    // narrow screens: row 2 holds the progress (left) and the lives (right)
    const y2 = inset.top + 82;
    this.hud = this.add.container(0, 0).setDepth(100);

    const bar = this.add.graphics();
    bar.fillStyle(0x0a1a2c, 0.55);
    bar.fillRoundedRect(8, inset.top + 6, W - 16, hudH - 4, 20);
    bar.lineStyle(2, 0xbfe3ff, 0.25);
    bar.strokeRoundedRect(8, inset.top + 6, W - 16, hudH - 4, 20);
    this.hud.add(bar);

    // TOP LEFT: back, then the mission
    const back = makeIconButton(this, 38, y, "‹", 26, () => this.showAbandonConfirm(), { hitW: 50, hitH: 50, color: "#fef6e8" });
    this.hud.add(back);
    const iconX = narrow ? 70 : 84;
    const pillW = 128 * k + 16;
    const missionIcon = this.fitImage(this.add.image(iconX, y, this.mazeItem.texture), 40 * k + 6);
    // story chapters (data/frostedStory.ts) name the mission in their own words: "💧 Well Mission — Collect 5 magic drops"
    const mission = requirementStory(this.animalId, this.resourceId);
    const label = this.add
      .text(
        iconX + 30 * k + 4,
        narrow ? y : y - 14 * k,
        mission ? `${mission.hudTitle} — ${mission.hudGoal}` : `COLLECT ${this.run.requiredItems} ${this.mazeItem.label.toUpperCase()}`,
        {
          ...titleStyle(Math.round((narrow ? 14 : 15) * k)),
          color: "#eaf6ff",
          resolution: 2,
          // never run into the coin pill
          wordWrap: { width: Math.max(120, (narrow ? W - pillW - 30 : W / 2 - 110) - (iconX + 34)) },
        },
      )
      .setOrigin(0, 0.5);
    const progX = narrow ? 30 : iconX + 30 * k + 4;
    const progY = narrow ? y2 : y + 12 * k;
    this.progressText = this.add
      .text(progX, progY, "", { ...titleStyle(Math.round(22 * k)), color: "#ffe07a", stroke: "#3b2a00", strokeThickness: 3, resolution: 2 })
      .setOrigin(0, 0.5);
    this.hud.add([missionIcon, label, this.progressText]);
    this.pips = [];
    const pipX = progX + 62 * k;
    for (let i = 0; i < this.run.requiredItems; i++) {
      const pip = this.add.circle(pipX + i * 14 * k, progY + 1, 5 * k, 0xffe07a, 1).setStrokeStyle(1.5, 0x3b2a00, 0.8);
      this.pips.push(pip);
      this.hud.add(pip);
    }

    // TOP CENTER: lives, maze name, power timer
    const cx = narrow ? W - 30 - ((MAX_LIVES - 1) / 2) * 30 * k - 13 : W / 2;
    const heartsY = narrow ? y2 : y - 8 * k;
    this.heartSlots = [];
    for (let i = 0; i < MAX_LIVES; i++) {
      const h = this.fitImage(this.add.image(cx + (i - (MAX_LIVES - 1) / 2) * 30 * k, heartsY, MZ_HEART), 26 * k);
      this.heartSlots.push(h);
      this.hud.add(h);
    }
    const name = this.add
      .text(cx, y + 18 * k, `${this.layout.name} · ${this.theme.name}`, { ...bodyStyle(Math.round(12 * k)), color: "#bcd9ef", resolution: 2 })
      .setOrigin(0.5)
      .setVisible(!narrow);
    this.hud.add(name);

    this.powerBarW = 120 * k;
    this.powerBar = this.add.container(W / 2, inset.top + hudH + 14).setVisible(false);
    const pbBg = this.add.rectangle(0, 0, this.powerBarW + 6, 12, 0x0a1a2c, 0.8).setStrokeStyle(1.5, 0xbff4ff, 0.8);
    this.powerFill = this.add.rectangle(-this.powerBarW / 2, 0, this.powerBarW, 7, 0x6fe0ff, 1).setOrigin(0, 0.5);
    const pbIcon = this.fitImage(this.add.image(-this.powerBarW / 2 - 16, 0, MZ_POWER), 20);
    this.powerBar.add([pbBg, this.powerFill, pbIcon]);
    this.hud.add(this.powerBar);

    // TOP RIGHT: the global coin balance (economy.coins, the same wallet as the Shop)
    const pill = makePill(this, pillW, 44 * k);
    pill.setPosition(W - pillW / 2 - 18, y);
    this.coinIcon = this.fitImage(this.add.image(W - pillW - 4 + 26 * k, y, "mz_coin"), 30 * k);
    this.coinText = this.add.text(W - 30, y, "", { ...titleStyle(Math.round(19 * k)), resolution: 2 }).setOrigin(1, 0.5);
    this.hud.add([pill, this.coinIcon, this.coinText]);
    this.setCoinText(economy.coins, false);

    this.refreshProgress(false);
    this.refreshHearts(false);
  }

  private setCoinText(total: number, pulse: boolean): void {
    if (!this.coinText?.active) return;
    this.coinText.setText(total.toLocaleString("en-US"));
    if (pulse) {
      this.tweens.killTweensOf(this.coinIcon);
      this.coinIcon.setScale(this.coinIcon.scale);
      const base = (30 * Phaser.Math.Clamp(this.scale.width / 1000, 0.72, 1)) / Math.max(this.coinIcon.width, 1);
      this.coinIcon.setScale(base);
      this.tweens.add({ targets: this.coinIcon, scale: base * 1.35, duration: 90, yoyo: true });
    }
  }

  private refreshProgress(bump: boolean): void {
    this.progressText.setText(`${this.run.collected} / ${this.run.requiredItems}`);
    this.pips.forEach((p, i) => p.setFillStyle(i < this.run.collected ? 0xffe07a : 0x223449, 1));
    if (bump) {
      this.tweens.killTweensOf(this.progressText);
      this.progressText.setScale(1);
      this.tweens.add({ targets: this.progressText, scale: 1.3, duration: 120, yoyo: true, ease: "Sine.easeOut" });
    }
  }

  /** ❤️ ❤️ 🖤 — at least the three starting slots, more once Hearts push past three. */
  private refreshHearts(popNew: boolean): void {
    const shown = Math.max(START_LIVES, this.run.lives);
    this.heartSlots.forEach((h, i) => {
      h.setVisible(i < shown);
      const full = i < this.run.lives;
      if (full) h.clearTint().setAlpha(1);
      else h.setTint(0x33455a).setAlpha(0.75);
      if (popNew && i === this.run.lives - 1) {
        const base = h.scale;
        this.tweens.add({ targets: h, scale: base * 1.6, duration: 160, yoyo: true, ease: "Back.easeOut" });
      }
    });
  }

  private floatText(x: number, y: number, text: string, color: string, size: number, icon?: string): void {
    const c = this.add.container(x, y).setDepth(70);
    const t = this.add
      .text(0, 0, text, { fontFamily: FONT_FAMILY, fontStyle: "800", fontSize: `${size}px`, color, stroke: "#0b1f33", strokeThickness: 5, resolution: 2 })
      .setOrigin(0.5);
    c.add(t);
    if (icon) {
      const ic = this.fitImage(this.add.image(t.width / 2 + size * 0.6, 0, icon), size * 1.1);
      c.add(ic);
    }
    c.setScale(0.6);
    this.tweens.add({ targets: c, scale: 1, duration: 140, ease: "Back.easeOut" });
    this.tweens.add({ targets: c, y: y - 42, alpha: 0, duration: 900, delay: 220, ease: "Sine.easeOut", onComplete: () => c.destroy() });
  }

  private centerBanner(x: number, y: number, text: string, color: string, size: number, holdMs: number): void {
    const t = this.add
      .text(x, y, text, { fontFamily: FONT_FAMILY, fontStyle: "800", fontSize: `${size}px`, color, stroke: "#0b1f33", strokeThickness: 7, resolution: 2, align: "center" })
      .setOrigin(0.5)
      .setDepth(160)
      .setScale(0.5)
      .setAlpha(0);
    this.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 220, ease: "Back.easeOut" });
    this.tweens.add({ targets: t, alpha: 0, y: y - 20, duration: 300, delay: holdMs, onComplete: () => t.destroy() });
  }

  /* ================= input ================= */

  private bindInput(): void {
    const kb = this.input.keyboard;
    const map: Record<string, [number, number]> = {
      ArrowUp: [0, -1],
      KeyW: [0, -1],
      ArrowDown: [0, 1],
      KeyS: [0, 1],
      ArrowLeft: [-1, 0],
      KeyA: [-1, 0],
      ArrowRight: [1, 0],
      KeyD: [1, 0],
    };
    // arrow keys belong to the game while it's open — never scroll the page
    kb?.addCapture("UP,DOWN,LEFT,RIGHT,SPACE");

    kb?.on("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (this.overlayKind === "confirm") this.closeOverlay();
        else this.showAbandonConfirm();
        return;
      }
      // e.code, not e.key: layout-independent, and caps-lock/shift can't turn "d" into "D"
      const m = map[e.code];
      if (!m) return;
      this.heldKeys = this.heldKeys.filter((h) => h.key !== e.code);
      this.heldKeys.push({ key: e.code, sx: m[0], sy: m[1] });
      this.steer(m[0], m[1], true);
    });
    kb?.on("keyup", (e: KeyboardEvent) => {
      const m = map[e.code];
      if (!m) return;
      this.heldKeys = this.heldKeys.filter((h) => h.key !== e.code);
      this.run.releaseWantDir(this.screenToLayoutDir(m[0], m[1]));
    });
    // alt-tab mid-press: the keyup never arrives, so treat everything as released
    const onBlur = () => {
      this.heldKeys = [];
      this.run?.releaseAllWantDirs();
    };
    this.game.events.on(Phaser.Core.Events.BLUR, onBlur);
    this.offFns.push(() => this.game.events.off(Phaser.Core.Events.BLUR, onBlur));

    // swipe anywhere on touch screens
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      this.swipeStart = { x: p.x, y: p.y };
    });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (!this.swipeStart) return;
      const dx = p.x - this.swipeStart.x;
      const dy = p.y - this.swipeStart.y;
      this.swipeStart = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 26) return;
      if (Math.abs(dx) > Math.abs(dy)) this.steer(Math.sign(dx), 0);
      else this.steer(0, Math.sign(dy));
    });
  }

  /**
   * Steer the player. Accepted whenever no card is up and the run isn't
   * over — including during READY?/GO (the sim isn't ticking yet, so the
   * direction simply waits for GO) and during the death sequence. `held`
   * = the key is still down (see MazeRun.setWantDir).
   */
  private steer(sx: number, sy: number, held = false): void {
    if (this.ended || this.paused || this.overlayKind) return;
    this.run.setWantDir(this.screenToLayoutDir(sx, sy), held);
  }

  /** After a respawn resets the player's direction, a key still held down keeps steering. */
  private reapplyHeldKey(): void {
    const h = this.heldKeys[this.heldKeys.length - 1];
    if (h) this.steer(h.sx, h.sy, true);
  }

  private buildTouchControls(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const inset = safeInsets();
    const cx = this.transposed ? W / 2 : 96;
    const cy = this.transposed ? H - inset.bottom - 95 : H - inset.bottom - 120;
    const gap = 56;
    this.controls = this.add.container(0, 0).setDepth(110);
    const btn = (x: number, y: number, label: string, sx: number, sy: number) =>
      makeIconButton(this, x, y, label, 24, () => this.steer(sx, sy), { hitW: 58, hitH: 58, color: "#fef6e8" });
    this.controls.add([
      btn(cx, cy - gap, "▲", 0, -1),
      btn(cx, cy + gap, "▼", 0, 1),
      btn(cx - gap, cy, "◀", -1, 0),
      btn(cx + gap, cy, "▶", 1, 0),
    ]);
  }

  /* ================= flow: tutorial / countdown / pause ================= */

  private closeOverlay(): void {
    this.overlay?.destroy();
    this.overlay = undefined;
    const wasConfirm = this.overlayKind === "confirm";
    this.overlayKind = null;
    if (wasConfirm) this.paused = false;
  }

  /**
   * A modal card. Content (buttons included) is laid out in the panel's own
   * design-size coordinates and the whole panel is scaled down to fit small
   * screens — so nothing is ever clipped and hit areas stay on their buttons.
   */
  private makeOverlay(kind: OverlayKind, w: number, h: number): { root: Phaser.GameObjects.Container; panel: Phaser.GameObjects.Container } {
    this.overlay?.destroy();
    this.overlayKind = kind;
    const W = this.scale.width;
    const H = this.scale.height;
    const root = this.add.container(0, 0).setDepth(200);
    const scrim = this.add.rectangle(0, 0, W, H, 0x06121f, 0.7).setOrigin(0).setInteractive();
    const panel = makePanel(this, w, h, { radius: 28 });
    panel.setPosition(W / 2, H / 2);
    root.add([scrim, panel]);
    const fit = Math.min(1, (W - 24) / w, (H - 24) / h);
    panel.setScale(fit * 0.9).setAlpha(0);
    this.tweens.add({ targets: panel, scale: fit, alpha: 1, duration: 240, ease: "Back.easeOut" });
    this.overlay = root;
    return { root, panel };
  }

  /** The first-ever run only: a short, friendly How-to-Play card. */
  private showTutorial(): void {
    const { panel } = this.makeOverlay("tutorial", 520, 540);
    const title = this.add.text(0, -226, "❄ HOW TO PLAY", { ...titleStyle(26), resolution: 2 }).setOrigin(0.5);
    panel.add(title);
    const enemyKey = ENEMY_TEXTURE[this.run.enemies[0]?.kind ?? "flame"];
    const rows: Array<[string | null, string]> = [
      [null, IS_TOUCH ? "Swipe or tap the arrows to move" : "Move with WASD or the Arrow keys"],
      [this.mazeItem.texture, `Collect all ${this.run.requiredItems} ${this.mazeItem.label}!`],
      ["mz_coin", "Grab coins — money for the Shop"],
      [enemyKey, "Watch out for the frost creatures!"],
      [MZ_HEART, `${START_LIVES} lives. Get caught and you drop your ${this.mazeItem.label.toLowerCase()}!`],
      [MZ_POWER, "Power Crystals turn the tables!"],
    ];
    rows.forEach(([icon, text], i) => {
      const ry = -160 + i * 56;
      if (icon) panel.add(this.fitImage(this.add.image(-200, ry, icon), 40));
      else panel.add(this.add.text(-200, ry, IS_TOUCH ? "👆" : "⌨", { fontSize: "30px" }).setOrigin(0.5));
      panel.add(this.add.text(-165, ry, text, { ...bodyStyle(17), wordWrap: { width: 370 }, resolution: 2 }).setOrigin(0, 0.5));
    });
    const btn = makeIconButton(this, 0, 222, "GOT IT", 22, () => {
      frostedProgression.markMazeTutorialSeen();
      this.closeOverlay();
      this.startCountdown();
    }, { hitW: 200, hitH: 56, color: "#2f6b8a" });
    panel.add(btn);
  }

  /** READY? → GO! — the run starts on GO (enemies are still asleep for a moment after that). */
  private startCountdown(): void {
    const W = this.scale.width;
    const H = this.scale.height;
    const intro = this.add
      .text(W / 2, H / 2 - 70, `${this.mazeItem.label.toUpperCase()} HUNT`, { fontFamily: FONT_FAMILY, fontStyle: "800", fontSize: "30px", color: "#fff3c4", stroke: "#0b1f33", strokeThickness: 7, resolution: 2 })
      .setOrigin(0.5)
      .setDepth(160);
    const sub = this.add
      .text(W / 2, H / 2 - 32, `${this.layout.name} — help the ${this.animalName}!`, { fontFamily: FONT_FAMILY, fontStyle: "700", fontSize: "18px", color: "#dff1ff", stroke: "#0b1f33", strokeThickness: 5, resolution: 2 })
      .setOrigin(0.5)
      .setDepth(160);
    const big = this.add
      .text(W / 2, H / 2 + 30, "READY?", { fontFamily: FONT_FAMILY, fontStyle: "800", fontSize: "54px", color: "#ffffff", stroke: "#0b1f33", strokeThickness: 9, resolution: 2 })
      .setOrigin(0.5)
      .setDepth(160)
      .setScale(0.4);
    Sfx.countdown();
    this.tweens.add({ targets: big, scale: 1, duration: 260, ease: "Back.easeOut" });
    this.time.delayedCall(1000, () => {
      big.setText("GO!").setColor("#8fffcf").setScale(0.5);
      Sfx.countdown(true);
      this.tweens.add({ targets: big, scale: 1.2, duration: 220, ease: "Back.easeOut" });
      this.started = true;
      this.tweens.add({ targets: [big, intro, sub], alpha: 0, duration: 380, delay: 420, onComplete: () => [big, intro, sub].forEach((o) => o.destroy()) });
    });
  }

  private showAbandonConfirm(): void {
    if (this.ended || this.overlayKind) return;
    this.paused = true;
    const { panel } = this.makeOverlay("confirm", 420, 250);
    panel.add(this.add.text(0, -70, "Leave the hunt?", { ...titleStyle(24), resolution: 2 }).setOrigin(0.5));
    panel.add(
      this.add
        .text(0, -22, `This run's ${this.mazeItem.label.toLowerCase()} won't be kept.\nCoins you picked up are yours.`, { ...bodyStyle(15), align: "center", resolution: 2 })
        .setOrigin(0.5),
    );
    panel.add(makeIconButton(this, -100, 70, "Keep Playing", 15, () => this.closeOverlay(), { hitW: 170, hitH: 50, color: "#2f6b8a" }));
    panel.add(makeIconButton(this, 100, 70, "Leave", 15, () => this.exitMaze(false), { hitW: 140, hitH: 50, color: "#5b4636" }));
  }

  /* ================= end states ================= */

  private showGameOver(): void {
    this.ended = true;
    const { panel } = this.makeOverlay("gameover", 440, 330);
    panel.add(this.add.text(0, -110, "GAME OVER", { ...titleStyle(34), color: "#b3304a", resolution: 2 }).setOrigin(0.5));
    panel.add(this.add.text(0, -62, "You ran out of lives.", { ...bodyStyle(17), resolution: 2 }).setOrigin(0.5));
    panel.add(this.fitImage(this.add.image(-70, -8, this.mazeItem.texture), 40));
    panel.add(this.add.text(-40, -8, `${this.run.collected} / ${this.run.requiredItems}`, { ...titleStyle(20), resolution: 2 }).setOrigin(0, 0.5));
    if (this.coinsThisRun > 0) {
      panel.add(this.fitImage(this.add.image(-70, 36, "mz_coin"), 30));
      panel.add(this.add.text(-40, 36, `+${this.coinsThisRun} kept`, { ...titleStyle(18), color: "#8a5a00", resolution: 2 }).setOrigin(0, 0.5));
    }
    panel.add(makeIconButton(this, -95, 110, "TRY AGAIN", 18, () => this.retry(), { hitW: 170, hitH: 54, color: "#2f6b8a" }));
    panel.add(makeIconButton(this, 95, 110, "EXIT", 18, () => this.exitMaze(false), { hitW: 150, hitH: 54, color: "#5b4636" }));
  }

  /** A completely fresh attempt at this same maze and requirement. Coins already paid stay paid (and don't respawn). */
  private retry(): void {
    Sfx.tap();
    this.scene.restart({
      animalId: this.animalId,
      resourceId: this.resourceId,
      returnTo: this.returnTo,
      retry: { mazeId: this.layout.id, bankedCoinKeys: [...this.run.bankedCoinKeys] },
    } satisfies MazeLaunchData);
  }

  private winRound(): void {
    this.ended = true;
    // the ONLY place maze progress is ever committed — a whole run, won
    frostedProgression.completeMazeRun(this.animalId, this.resourceId);
    Sfx.complete();
    this.time.delayedCall(450, () => Sfx.fanfare());
    this.rig.playCheer();
    const pp = this.run.playerPos();
    const p = this.toScreen(pp.row, pp.col);
    for (let i = 0; i < 4; i++) this.time.delayedCall(i * 180, () => this.sparkFx.explode(18, p.x + Phaser.Math.Between(-40, 40), p.y + Phaser.Math.Between(-30, 30)));
    this.time.delayedCall(650, () => this.showVictoryCard());
  }

  private showVictoryCard(): void {
    const { panel } = this.makeOverlay("victory", 460, 320);
    panel.add(this.add.text(0, -110, "VICTORY!", { ...titleStyle(40), color: "#2f7a52", resolution: 2 }).setOrigin(0.5));
    panel.add(this.add.text(0, -62, "✨ GREAT JOB! ✨", { ...titleStyle(22), color: "#8a5a00", resolution: 2 }).setOrigin(0.5));
    panel.add(this.fitImage(this.add.image(-60, -6, this.mazeItem.texture), 46));
    panel.add(this.add.text(-28, -6, `${this.run.requiredItems} / ${this.run.requiredItems}`, { ...titleStyle(26), resolution: 2 }).setOrigin(0, 0.5));
    if (this.coinsThisRun > 0) {
      panel.add(this.fitImage(this.add.image(-60, 42, "mz_coin"), 32));
      panel.add(this.add.text(-28, 42, `+${this.coinsThisRun}`, { ...titleStyle(22), color: "#8a5a00", resolution: 2 }).setOrigin(0, 0.5));
    }
    panel.add(this.add.text(0, 110, `Returning to the ${this.animalName}…`, { ...bodyStyle(15), resolution: 2 }).setOrigin(0.5));
    this.time.delayedCall(2600, () => this.exitMaze(true));
  }

  private exitingDone = false;

  /**
   * Leave the maze. On a WIN the Request screen underneath is closed too and
   * the world resumes straight into THIS requirement's restoration (the
   * existing triggerRestore flow — which also opens the animal's puzzle once
   * every requirement is restored). Otherwise just go back where we came from.
   */
  private exitMaze(completed: boolean): void {
    if (this.exitingDone) return;
    this.exitingDone = true;
    const finish = () => {
      this.exitingDone = false;
      const animalId = this.animalId;
      const resourceId = this.resourceId;
      this.scene.stop();
      if (completed) {
        if (this.scene.manager.isActive("FrostedRequest") || this.scene.manager.isPaused("FrostedRequest")) this.scene.stop("FrostedRequest");
        this.registry.set("pointerOnUI", false);
        this.scene.resume("FrostedValley");
        const fv = this.scene.get("FrostedValley") as FrostedValleyScene | null;
        if (fv) void fv.triggerRestore(animalId, resourceId);
      } else {
        this.scene.resume(this.returnTo);
      }
      this.game.events.emit("gardenMaze:closed", { animalId, resourceId, completed });
    };
    if (completed) {
      this.cameras.main.fadeOut(350, 235, 247, 255);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, finish);
    } else {
      finish();
    }
  }

  /* ================= dev hooks (playtesting) ================= */

  private installDevHooks(): void {
    const stepOnto = (cell: Cell) => {
      const from = this.run.grid.neighbours(cell)[0];
      const p = this.run.player;
      p.cell = { ...from };
      p.next = { ...cell };
      p.dir = { dr: cell.row - from.row, dc: cell.col - from.col };
      p.wantDir = p.dir;
      p.t = 0.999;
    };
    (window as unknown as Record<string, unknown>).__dgMaze = {
      state: () => ({
        maze: this.layout.id,
        theme: this.theme.id,
        transposed: this.transposed,
        status: this.run.status,
        started: this.started,
        lives: this.run.lives,
        collected: this.run.collected,
        required: this.run.requiredItems,
        enemies: this.run.enemies.map((e) => ({ kind: e.kind, mode: e.mode, behaviour: this.run.behaviour(e), cell: e.cell })),
        items: [...this.run.items.values()],
        hearts: [...this.run.hearts.values()],
        crystals: [...this.run.crystals.values()],
        coins: this.run.coins.size,
        wallet: economy.coins,
        overlay: this.overlayKind,
        player: {
          cell: this.run.player.cell,
          next: this.run.player.next,
          t: this.run.player.t,
          dir: this.run.player.dir,
          wantDir: this.run.player.wantDir,
          pos: this.run.playerPos(),
        },
        keydownListeners: this.input.keyboard?.listenerCount("keydown") ?? 0,
        round: this.roundId,
        paused: this.paused,
        ended: this.ended,
      }),
      /** Layout + orientation, so input tests can find corridors and junctions. */
      layout: () => ({ rows: this.layout.rows, transposed: this.transposed, start: this.run.grid.start }),
      /** Input tests: put every enemy to sleep for good and make the player untouchable. */
      calm: () => {
        for (const e of this.run.enemies) {
          e.mode = "sleeping";
          e.modeTimerMs = Number.MAX_SAFE_INTEGER;
          e.next = null;
        }
        this.run.protectMs = Number.MAX_SAFE_INTEGER;
      },
      /** Input tests: wake one enemy on (row, col), hunting at normal speed — the player stays untouchable. */
      chaseFrom: (row: number, col: number) => {
        const e = this.run.enemies[0];
        if (!e) return;
        e.mode = "active";
        e.cell = { row, col };
        e.next = null;
        e.t = 0;
        e.lastDir = null;
        this.run.protectMs = Number.MAX_SAFE_INTEGER;
      },
      /**
       * Input tests: run the game clock slower (e.g. 0.25), so machine lag
       * between a test's position check and its real key press is a tiny
       * fraction of a tile. Movement rules are all measured in tiles, so
       * this changes timing precision only, never behaviour. Resets per round.
       */
      timeScale: (k: number) => {
        this.devTimeScale = k;
      },
      /** Input tests: stand the player still on a tile with no pending direction. */
      place: (row: number, col: number) => {
        const p = this.run.player;
        p.cell = { row, col };
        p.next = null;
        p.t = 0;
        p.dir = null;
        p.wantDir = null;
      },
      collectNext: () => {
        const cell = [...this.run.items.values()][0];
        if (cell) stepOnto(cell);
      },
      grabHeart: () => {
        const cell = [...this.run.hearts.values()][0];
        if (cell) stepOnto(cell);
      },
      grabCoin: () => {
        const coin = [...this.run.coins.values()][0];
        if (coin) stepOnto(coin.cell);
      },
      grabCrystal: () => {
        const cell = [...this.run.crystals.values()][0];
        if (cell) stepOnto(cell);
      },
      die: () => {
        const e = this.run.enemies[0];
        if (!e) return;
        // put it exactly where the player is (mid-tile included) — a real overlap
        this.run.protectMs = 0;
        e.mode = "active";
        e.cell = { ...this.run.player.cell };
        e.next = this.run.player.next ? { ...this.run.player.next } : null;
        e.t = this.run.player.t;
        e.msPerCell = 1e9;
        this.time.delayedCall(2500, () => (e.msPerCell = 300));
      },
    };
  }
}
