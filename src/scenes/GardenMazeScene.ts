import { MAZE_ECONOMY, MAZE_LEAF_SUCCESS_VALUE } from "../data/economy";
import { mazeCoinTiles } from "../data/mazeCoins";
import { MazeRunRewards } from "../core/MazeRunRewards";
import Phaser from "phaser";
import { FONT_FAMILY, labelStyle, titleStyle } from "../ui/theme";
import { makePanel, makePill } from "../ui/Panel";
import { Button } from "../ui/Button";
import { safeInsets } from "../util/safeArea";
import { bus, economy, progression, requests, save } from "../game/services";
import { RESOURCES } from "../data/resources";
import { generateMaze, MAZE_LEVELS, type MazeGrid, type MazeLevelConfig } from "../data/maze";
import { Sfx } from "../fx/Sfx";
import { sparkleBurst, petalPuff } from "../fx/Particles";

export interface MazeInit {
  objectId: string;
  sourceId: string;
  resourceId: string;
  amount: number;
}

const CELL = 64;
const PLAYER_SPEED = 148;
const PLAYER_R = 20;
const ENEMY_R = 18;
const INVULN_MS = 1400;
const MAGIC_MS = 6000;

type Kind = "target" | "leaf" | "magic" | "coin";
interface Collectible {
  kind: Kind;
  img: Phaser.GameObjects.Image;
  glow?: Phaser.GameObjects.Image;
  x: number;
  y: number;
  taken: boolean;
}

interface Enemy {
  img: Phaser.GameObjects.Image;
  x: number;
  y: number;
  cx: number; // current cell tile coords (tx,ty), the node it's travelling FROM
  cy: number;
  tx: number; // target cell it's travelling TO
  ty: number;
  dirX: number;
  dirY: number;
}

function pickDifficulty(amount: number): keyof typeof MAZE_LEVELS {
  if (amount <= 3) return "easy";
  if (amount <= 5) return "medium";
  return "hard";
}

/** Bakes a small round garden-mischief creature onto a canvas texture — no new
 *  image assets, consistent with the silhouette-baking approach used elsewhere. */
function bakeEnemyTexture(scene: Phaser.Scene, key: string, body: string, spike: boolean): string {
  if (scene.textures.exists(key)) return key;
  const size = 64;
  const canvas = scene.textures.createCanvas(key, size, size);
  if (!canvas) return key;
  const ctx = canvas.getContext();
  const cx = size / 2;
  const cy = size / 2 + 4;
  const r = 22;
  if (spike) {
    ctx.fillStyle = body;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2));
      ctx.lineTo(cx + Math.cos(a) * (r + 10), cy + Math.sin(a) * (r + 10));
      ctx.lineTo(cx + Math.cos(a + 0.35) * (r - 2), cy + Math.sin(a + 0.35) * (r - 2));
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.ellipse(cx, cy, r, r * 0.86, 0, 0, Math.PI * 2);
  ctx.fill();
  // eyes
  ctx.fillStyle = "#2a2036";
  ctx.beginPath();
  ctx.ellipse(cx - 8, cy - 4, 4.2, 5.2, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 8, cy - 4, 4.2, 5.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(cx - 6.5, cy - 6, 1.4, 1.6, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 9.5, cy - 6, 1.4, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();
  canvas.refresh();
  return key;
}

/**
 * Reusable Garden Maze: a hedge-corridor hunt for ONE resource (see
 * data/maze.ts for the generator). Configured entirely by objectId/
 * sourceId/resourceId/amount from the Request screen's Get/Play — the same
 * system runs for every animal's every resource; only the title, target
 * art/count, player sprite and enemy count change per hunt.
 */
export class GardenMazeScene extends Phaser.Scene {
  private mi!: MazeInit;
  private cfg!: MazeLevelConfig;
  private grid!: MazeGrid;
  private root!: Phaser.GameObjects.Container;
  private hud!: Phaser.GameObjects.Container;

  private player!: Phaser.GameObjects.Container;
  private playerBody!: Phaser.GameObjects.Image;
  private px = 0;
  private py = 0;

  private enemies: Enemy[] = [];
  private collectibles: Collectible[] = [];

  private collectedTarget = 0;
  private leafScore = 0;
  private lives = 3;
  private invulnUntil = 0;
  private magicUntil = 0;
  private finished = false;
  private returning = false;
  private rewards!: MazeRunRewards;
  private coinPill!: Phaser.GameObjects.Text;
  private baseZoom = 1;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
  private padDir = { x: 0, y: 0 };

  private targetPill!: Phaser.GameObjects.Text;
  private leafPill!: Phaser.GameObjects.Text;
  private hearts: Phaser.GameObjects.Text[] = [];
  private magicRing?: Phaser.GameObjects.Image;

  constructor() {
    super("GardenMaze");
  }

  init(data: MazeInit): void {
    this.mi = data;
    this.returning = false;
    this.invulnUntil = 0;
    this.magicUntil = 0;
    this.magicRing = undefined;
    this.enemyRng = undefined;
    this.padDir = { x: 0, y: 0 };
    this.rewards = new MazeRunRewards(amount => {
      economy.add(amount, "maze pickup");
      save.saveNow();
    }, () => {
      requests.collectResource(this.mi.resourceId, this.mi.amount);
      economy.add(this.leafScore * MAZE_LEAF_SUCCESS_VALUE, "maze leaves");
      save.saveNow();
    });
    this.finished = false;
    this.collectedTarget = 0;
    this.leafScore = 0;
    this.enemies = [];
    this.collectibles = [];
    this.hearts = [];
  }

  create(): void {
    const resource = RESOURCES[this.mi.resourceId];
    const def = progression.def(this.mi.objectId);
    this.cfg = MAZE_LEVELS[pickDifficulty(this.mi.amount)];
    this.lives = this.cfg.lives;
    this.grid = generateMaze(this.cfg);

    const worldW = this.grid.tileCols * CELL;
    const worldH = this.grid.tileRows * CELL;
    this.cameras.main.setBounds(0, 0, worldW, worldH);
    // Opaque clear colour: a Phaser camera is transparent by default, so
    // without this, Garden/UI (still active underneath, paused, not hidden)
    // would bleed straight through at this scene's own screen edges/gaps.
    this.cameras.main.setBackgroundColor(0x86ae57);
    this.physics?.world?.setBounds?.(0, 0, worldW, worldH);

    this.root = this.add.container(0, 0);
    this.buildFloor(worldW, worldH);
    this.buildWalls();
    this.buildDecor();

    const spawn = this.grid.cellTiles[0];
    this.px = spawn.tx * CELL + CELL / 2;
    this.py = spawn.ty * CELL + CELL / 2;
    this.playerBody = this.add.image(0, 0, def?.garden_sprite ?? "dg_rabbit").setOrigin(0.5, 0.72);
    const targetH = CELL * 0.82;
    this.playerBody.setScale(targetH / this.playerBody.height);
    this.player = this.add.container(this.px, this.py, [this.playerBody]);
    this.root.add(this.player);

    this.buildCollectibles(resource.icon);
    this.buildCoins();
    this.buildEnemies();

    this.cameras.main.startFollow(this.player, true, 0.14, 0.14);
    this.baseZoom = Math.min(1.15, this.scale.width / (CELL * 6));
    this.cameras.main.setZoom(this.baseZoom);

    this.buildHud(resource);
    this.buildControls();
    this.positionHud(this.baseZoom);

    this.cameras.main.fadeIn(220, 36, 26, 46);
  }

  /* ---------------- world building ---------------- */

  private buildFloor(w: number, h: number): void {
    const g = this.add.graphics().setDepth(-100);
    g.fillGradientStyle(0x9fc26b, 0x9fc26b, 0x86ae57, 0x86ae57, 1);
    g.fillRect(0, 0, w, h);
    this.root.add(g);
  }

  private buildWalls(): void {
    const { walls, tileCols, tileRows } = this.grid;
    for (let ty = 0; ty < tileRows; ty++) {
      for (let tx = 0; tx < tileCols; tx++) {
        if (!walls[ty][tx]) continue;
        const img = this.add
          .image(tx * CELL + CELL / 2, ty * CELL + CELL / 2, "dg_hedge_straight_01")
          .setDisplaySize(CELL * 1.38, CELL * 1.38)
          .setDepth(10);
        this.root.add(img);
      }
    }
  }

  private buildDecor(): void {
    const rng = new Phaser.Math.RandomDataGenerator([String(this.cfg.seed + 7)]);
    const opens = this.grid.cellTiles;
    const flowerTex = ["dg_flowers_pink_01", "dg_flowers_blue_01", "dg_flowers_yellow_01"];
    for (let i = 0; i < Math.floor(opens.length * 0.1); i++) {
      const c = opens[rng.between(0, opens.length - 1)];
      const key = flowerTex[rng.between(0, flowerTex.length - 1)];
      const img = this.add
        .image(c.tx * CELL + CELL / 2, c.ty * CELL + CELL / 2, key)
        .setDisplaySize(30, 24)
        .setAlpha(0.85)
        .setDepth(-50);
      this.root.add(img);
    }
    // a lantern or two at open cells for warm-light flavour
    for (let i = 0; i < 2; i++) {
      const c = opens[rng.between(0, opens.length - 1)];
      const img = this.add
        .image(c.tx * CELL + CELL / 2, c.ty * CELL + CELL / 2, "dg_lantern_01")
        .setDisplaySize(34, 46)
        .setDepth(5);
      this.root.add(img);
      const glow = this.add.image(img.x, img.y - 10, "glow").setScale(0.7).setAlpha(0.3).setBlendMode(Phaser.BlendModes.ADD).setDepth(4);
      this.root.add(glow);
      this.tweens.add({ targets: glow, alpha: 0.5, duration: 1200, yoyo: true, repeat: -1 });
    }
  }

  /* ---------------- collectibles ---------------- */

  private cellWorldPositions(exclude: Set<string>, count: number, rng: Phaser.Math.RandomDataGenerator): { x: number; y: number }[] {
    const opens = this.grid.cellTiles.filter((c) => !(c.tx === this.grid.cellTiles[0].tx && c.ty === this.grid.cellTiles[0].ty));
    const shuffled = [...opens];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = rng.between(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const out: { x: number; y: number }[] = [];
    for (const c of shuffled) {
      const key = `${c.tx},${c.ty}`;
      if (exclude.has(key)) continue;
      exclude.add(key);
      out.push({ x: c.tx * CELL + CELL / 2, y: c.ty * CELL + CELL / 2 });
      if (out.length >= count) break;
    }
    return out;
  }

  private buildCollectibles(targetIcon: string): void {
    const rng = new Phaser.Math.RandomDataGenerator([String(this.cfg.seed + 21)]);
    const used = new Set<string>();

    for (const { x, y } of this.cellWorldPositions(used, this.mi.amount, rng)) {
      const img = this.add.image(x, y, targetIcon).setDisplaySize(34, 34).setDepth(20);
      const glow = this.add.image(x, y, "glow").setScale(0.55).setAlpha(0.4).setBlendMode(Phaser.BlendModes.ADD).setDepth(19);
      this.tweens.add({ targets: [img, glow], y: y - 5, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.root.add([glow, img]);
      this.collectibles.push({ kind: "target", img, glow, x, y, taken: false });
    }
    for (const { x, y } of this.cellWorldPositions(used, this.cfg.leafCount, rng)) {
      const img = this.add.image(x, y, "star_special").setDisplaySize(18, 18).setTint(0xf4c430).setDepth(20);
      this.tweens.add({ targets: img, angle: 360, duration: 3000, repeat: -1, ease: "Linear" });
      this.root.add(img);
      this.collectibles.push({ kind: "leaf", img, x, y, taken: false });
    }
    for (const { x, y } of this.cellWorldPositions(used, this.cfg.magicFlowerCount, rng)) {
      const img = this.add.image(x, y, "flower").setDisplaySize(30, 34).setTint(0xd28bf0).setDepth(20);
      const glow = this.add.image(x, y, "glow").setScale(0.6).setAlpha(0.45).setBlendMode(Phaser.BlendModes.ADD).setDepth(19);
      this.tweens.add({ targets: [img, glow], scale: "+=0.12", duration: 700, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.root.add([glow, img]);
      this.collectibles.push({ kind: "magic", img, glow, x, y, taken: false });
    }
  }

  private buildCoins(): void {
    const occupied = new Set(this.collectibles.map(c => `${Math.floor(c.x / CELL)},${Math.floor(c.y / CELL)}`));
    const targets = this.collectibles.filter(c => c.kind === "target").map(c => ({ tx: Math.floor(c.x / CELL), ty: Math.floor(c.y / CELL) }));
    for (const t of mazeCoinTiles(this.grid, this.cfg.difficulty, occupied, targets)) {
      const x = t.tx * CELL + CELL / 2, y = t.ty * CELL + CELL / 2;
      const img = this.add.image(x, y, "coin").setDisplaySize(25, 25).setDepth(20);
      this.root.add(img);
      this.tweens.add({ targets: img, y: y - 3, duration: 760, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.collectibles.push({ kind: "coin", img, x, y, taken: false });
    }
  }

  /* ---------------- enemies ---------------- */

  private buildEnemies(): void {
    const kinds = [
      { key: "maze_thorn", color: "#7bb268", spike: true },
      { key: "maze_mud", color: "#8a6a4a", spike: false },
      { key: "maze_shadow", color: "#5b4a78", spike: false },
    ];
    const opens = this.grid.cellTiles;
    const start = opens[0];
    // spawn enemies away from the player's start cell
    const far = [...opens].sort(
      (a, b) => Math.hypot(b.tx - start.tx, b.ty - start.ty) - Math.hypot(a.tx - start.tx, a.ty - start.ty),
    );
    for (let i = 0; i < this.cfg.enemyCount; i++) {
      const kind = kinds[i % kinds.length];
      const tex = bakeEnemyTexture(this, kind.key, kind.color, kind.spike);
      const cell = far[i % far.length];
      const img = this.add.image(0, 0, tex).setDisplaySize(ENEMY_R * 2.1, ENEMY_R * 2.1).setDepth(21);
      this.root.add(img);
      this.enemies.push({
        img,
        x: cell.tx * CELL + CELL / 2,
        y: cell.ty * CELL + CELL / 2,
        cx: cell.tx,
        cy: cell.ty,
        tx: cell.tx,
        ty: cell.ty,
        dirX: 0,
        dirY: 0,
      });
    }
  }

  /* ---------------- HUD ---------------- */

  private buildHud(resource: (typeof RESOURCES)[string]): void {
    const W = this.scale.width;
    const inset = safeInsets();
    this.hud = this.add.container(0, 0).setScrollFactor(0).setDepth(9000);

    const backZone = this.add
      .circle(inset.left + 28, inset.top + 34, 26, 0x2a2036, 0.35)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true })
      .on("pointerup", () => this.confirmAbandon());
    const backGlyph = this.add
      .text(inset.left + 28, inset.top + 34, "‹", { fontFamily: FONT_FAMILY, fontStyle: "700", fontSize: "30px", color: "#fff3dc" })
      .setOrigin(0.5);
    this.hud.add([backZone, backGlyph]);

    const titlePill = makePill(this, Math.min(210, W - 160), 52).setPosition(inset.left + 160, inset.top + 34);
    this.hud.add(titlePill);
    this.hud.add(
      this.add
        .text(inset.left + 160, inset.top + 34, `${resource.label} Hunt`, labelStyle(16))
        .setOrigin(0.5),
    );

    const targetPillBg = makePill(this, 96, 44).setPosition(W - inset.right - 148, inset.top + 82);
    this.hud.add(targetPillBg);
    this.hud.add(this.add.image(W - inset.right - 184, inset.top + 82, resource.icon).setDisplaySize(26, 26));
    this.targetPill = this.add
      .text(W - inset.right - 140, inset.top + 82, `0/${this.mi.amount}`, labelStyle(18))
      .setOrigin(0.5);
    this.hud.add(this.targetPill);

    const leafPillBg = makePill(this, 74, 40).setPosition(W - inset.right - 48, inset.top + 82);
    this.hud.add(leafPillBg);
    this.hud.add(this.add.image(W - inset.right - 74, inset.top + 82, "star_special").setDisplaySize(20, 20).setTint(0xf4c430));
    this.leafPill = this.add.text(W - inset.right - 40, inset.top + 82, "0", labelStyle(16)).setOrigin(0.5);
    this.hud.add(this.leafPill);

    this.hud.add(makePill(this, 100, 42).setPosition(W - inset.right - 58, inset.top + 32));
    this.hud.add(this.add.image(W - inset.right - 88, inset.top + 32, "coin").setDisplaySize(24, 24));
    this.coinPill = this.add.text(W - inset.right - 48, inset.top + 32, `${economy.coins}`, labelStyle(17)).setOrigin(0.5);
    this.hud.add(this.coinPill);

    for (let i = 0; i < this.lives; i++) {
      const h = this.add
        .text(inset.left + 24 + i * 26, inset.top + 78, "♥", { fontFamily: FONT_FAMILY, fontSize: "22px", color: "#e8607a" })
        .setOrigin(0.5);
      this.hearts.push(h);
      this.hud.add(h);
    }
  }

  private positionHud(zoom: number): void {
    // Scroll-factor zero still inherits camera zoom. Cancel it so counters and
    // touch controls stay inside the actual viewport at every gameplay zoom.
    this.hud.setScale(1 / zoom).setPosition(this.scale.width / 2 * (1 - 1 / zoom), this.scale.height / 2 * (1 - 1 / zoom));
  }

  private refreshHud(): void {
    this.coinPill.setText(`${economy.coins}`);
    this.targetPill.setText(`${this.collectedTarget}/${this.mi.amount}`);
    this.leafPill.setText(`${this.leafScore}`);
    this.hearts.forEach((h, i) => h.setAlpha(i < this.lives ? 1 : 0.25));
  }

  /* ---------------- input ---------------- */

  private buildControls(): void {
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      const keys = this.input.keyboard.addKeys("W,A,S,D") as Record<"W" | "A" | "S" | "D", Phaser.Input.Keyboard.Key>;
      this.wasd = keys;
    }

    // touch D-pad, fixed bottom-right, screen-space
    const W = this.scale.width;
    const H = this.scale.height;
    const inset = safeInsets();
    const cx = W - inset.right - 78;
    const cy = H - inset.bottom - 78;
    const r = 58;
    const ring = this.add.circle(cx, cy, r, 0x2a2036, 0.18).setScrollFactor(0).setDepth(9000);
    this.hud.add(ring);
    const dirs: Array<{ dx: number; dy: number; ox: number; oy: number; glyph: string }> = [
      { dx: 0, dy: -1, ox: 0, oy: -r * 0.62, glyph: "▲" },
      { dx: 0, dy: 1, ox: 0, oy: r * 0.62, glyph: "▼" },
      { dx: -1, dy: 0, ox: -r * 0.62, oy: 0, glyph: "◀" },
      { dx: 1, dy: 0, ox: r * 0.62, oy: 0, glyph: "▶" },
    ];
    for (const d of dirs) {
      const zone = this.add
        .circle(cx + d.ox, cy + d.oy, 26, 0xfff3dc, 0.22)
        .setScrollFactor(0)
        .setDepth(9001)
        .setInteractive({ useHandCursor: true });
      const glyph = this.add
        .text(cx + d.ox, cy + d.oy, d.glyph, { fontFamily: FONT_FAMILY, fontSize: "20px", color: "#fff3dc" })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(9002);
      zone.on("pointerdown", () => {
        this.padDir = { x: d.dx, y: d.dy };
      });
      zone.on("pointerup", () => {
        if (this.padDir.x === d.dx && this.padDir.y === d.dy) this.padDir = { x: 0, y: 0 };
      });
      zone.on("pointerout", () => {
        if (this.padDir.x === d.dx && this.padDir.y === d.dy) this.padDir = { x: 0, y: 0 };
      });
      this.hud.add([zone, glyph]);
    }
  }

  private readInputDir(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.cursors) {
      if (this.cursors.left.isDown || this.wasd?.A.isDown) x -= 1;
      if (this.cursors.right.isDown || this.wasd?.D.isDown) x += 1;
      if (this.cursors.up.isDown || this.wasd?.W.isDown) y -= 1;
      if (this.cursors.down.isDown || this.wasd?.S.isDown) y += 1;
    }
    if (x === 0 && y === 0) {
      x = this.padDir.x;
      y = this.padDir.y;
    }
    if (x !== 0 && y !== 0) {
      const inv = 1 / Math.SQRT2;
      x *= inv;
      y *= inv;
    }
    return { x, y };
  }

  /* ---------------- collision helpers ---------------- */

  private isWallAt(worldX: number, worldY: number): boolean {
    const tx = Math.floor(worldX / CELL);
    const ty = Math.floor(worldY / CELL);
    if (ty < 0 || ty >= this.grid.tileRows || tx < 0 || tx >= this.grid.tileCols) return true;
    return this.grid.walls[ty][tx];
  }

  private circleHitsWall(x: number, y: number, r: number): boolean {
    const pts = [
      [x - r, y],
      [x + r, y],
      [x, y - r],
      [x, y + r],
      [x - r * 0.7, y - r * 0.7],
      [x + r * 0.7, y - r * 0.7],
      [x - r * 0.7, y + r * 0.7],
      [x + r * 0.7, y + r * 0.7],
    ];
    return pts.some(([px, py]) => this.isWallAt(px, py));
  }

  private moveWithCollision(x: number, y: number, dx: number, dy: number, r: number): { x: number; y: number } {
    let nx = x + dx;
    if (this.circleHitsWall(nx, y, r)) nx = x;
    let ny = y + dy;
    if (this.circleHitsWall(nx, ny, r)) ny = y;
    return { x: nx, y: ny };
  }

  /* ---------------- game loop ---------------- */

  update(time: number, delta: number): void {
    if (!this.root || this.finished) return;
    const dt = Math.min(delta, 45) / 1000;

    const dir = this.readInputDir();
    if (dir.x !== 0 || dir.y !== 0) {
      const step = { x: dir.x * PLAYER_SPEED * dt, y: dir.y * PLAYER_SPEED * dt };
      const moved = this.moveWithCollision(this.px, this.py, step.x, step.y, PLAYER_R);
      this.px = moved.x;
      this.py = moved.y;
      this.player.setPosition(this.px, this.py);
      this.playerBody.setFlipX(dir.x < 0 ? true : dir.x > 0 ? false : this.playerBody.flipX);
    }

    this.updateEnemies(dt, time);
    this.checkCollectibles();
    this.checkEnemyContact(time);

    if (this.magicRing) {
      this.magicRing.setPosition(this.px, this.py);
      if (time > this.magicUntil) {
        this.magicRing.destroy();
        this.magicRing = undefined;
      }
    }
  }

  private updateEnemies(dt: number, time: number): void {
    const rng = this.enemyRng ?? (this.enemyRng = new Phaser.Math.RandomDataGenerator([String(this.cfg.seed + 99)]));
    for (const e of this.enemies) {
      const targetX = e.tx * CELL + CELL / 2;
      const targetY = e.ty * CELL + CELL / 2;
      const dxT = targetX - e.x;
      const dyT = targetY - e.y;
      const distT = Math.hypot(dxT, dyT);
      if (distT < 3) {
        // arrived — pick the next node
        const options: Array<{ tx: number; ty: number }> = [];
        const cur = { tx: e.tx, ty: e.ty };
        const neighbours: Array<[number, number]> = [
          [0, -1],
          [0, 1],
          [-1, 0],
          [1, 0],
        ];
        for (const [dx, dy] of neighbours) {
          const ntx = cur.tx + dx * 2;
          const nty = cur.ty + dy * 2;
          const wallTx = cur.tx + dx;
          const wallTy = cur.ty + dy;
          if (
            nty >= 0 &&
            nty < this.grid.tileRows &&
            ntx >= 0 &&
            ntx < this.grid.tileCols &&
            !this.grid.walls[wallTy]?.[wallTx] &&
            !(ntx === e.cx && nty === e.cy) // avoid immediate reverse unless it's the only option
          ) {
            options.push({ tx: ntx, ty: nty });
          }
        }
        let next = options.length ? options[rng.between(0, options.length - 1)] : null;
        if (!next) {
          // dead end — reverse
          next = { tx: e.cx, ty: e.cy };
        } else if (rng.frac() < 0.4) {
          // bias toward the player when nearby, for a bit of real chase feel
          const distToPlayer = Math.hypot(this.px - e.x, this.py - e.y);
          if (distToPlayer < CELL * 5) {
            let best = options[0];
            let bestD = Infinity;
            for (const o of options) {
              const d = Math.hypot(o.tx * CELL - this.px, o.ty * CELL - this.py);
              if (d < bestD) {
                bestD = d;
                best = o;
              }
            }
            next = best;
          }
        }
        e.cx = e.tx;
        e.cy = e.ty;
        e.tx = next.tx;
        e.ty = next.ty;
      } else {
        const speed = this.cfg.enemySpeed * dt;
        e.x += (dxT / distT) * Math.min(speed, distT);
        e.y += (dyT / distT) * Math.min(speed, distT);
      }
      e.img.setPosition(e.x, e.y);
    }
    void time;
  }
  private enemyRng?: Phaser.Math.RandomDataGenerator;

  private checkCollectibles(): void {
    for (const c of this.collectibles) {
      if (c.taken) continue;
      const d = Math.hypot(c.x - this.px, c.y - this.py);
      if (d > PLAYER_R + 20) continue;
      c.taken = true;
      c.img.destroy();
      c.glow?.destroy();
      if (c.kind === "coin") {
        const value = MAZE_ECONOMY[this.cfg.difficulty].value;
        if (this.rewards.collect(`${c.x},${c.y}`, value)) {
          Sfx.coin();
          sparkleBurst(this, c.x, c.y, 7, 24);
          const pop = this.add.text(c.x, c.y - 16, `+${value}`, { ...labelStyle(20), color: "#ffe39a", stroke: "#765020", strokeThickness: 3 }).setOrigin(0.5).setDepth(100);
          this.tweens.add({ targets: pop, y: c.y - 54, alpha: 0, duration: 650, onComplete: () => pop.destroy() });
        }
      } else if (c.kind === "target") {
        this.collectedTarget++;
        Sfx.coin();
        sparkleBurst(this, c.x, c.y, 10, 30);
        if (this.collectedTarget >= this.mi.amount) {
          this.time.delayedCall(150, () => this.onWin());
        }
      } else if (c.kind === "leaf") {
        this.leafScore++;
        Sfx.sparkle();
      } else {
        Sfx.bloomChime();
        petalPuff(this, c.x, c.y, 14);
        this.magicUntil = this.time.now + MAGIC_MS;
        if (!this.magicRing) {
          this.magicRing = this.add.image(this.px, this.py, "glow").setScale(1.1).setAlpha(0.5).setBlendMode(Phaser.BlendModes.ADD).setDepth(22);
          this.root.add(this.magicRing);
        }
      }
      this.refreshHud();
    }
  }

  private checkEnemyContact(time: number): void {
    if (time < this.invulnUntil) return;
    if (time < this.magicUntil) return;
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - this.px, e.y - this.py);
      if (d < PLAYER_R + ENEMY_R - 6) {
        this.onHit(time);
        return;
      }
    }
  }

  private onHit(time: number): void {
    this.lives--;
    this.invulnUntil = time + INVULN_MS;
    Sfx.caughtThud();
    this.cameras.main.shake(180, 0.008);
    this.refreshHud();
    this.tweens.add({ targets: this.playerBody, alpha: 0.3, duration: 120, yoyo: true, repeat: 4 });
    // respawn near start, safely away from enemies
    const spawn = this.grid.cellTiles[0];
    this.px = spawn.tx * CELL + CELL / 2;
    this.py = spawn.ty * CELL + CELL / 2;
    this.player.setPosition(this.px, this.py);
    if (this.lives <= 0) this.time.delayedCall(200, () => this.onLose());
  }

  /* ---------------- end states ---------------- */

  private onWin(): void {
    if (this.finished || this.lives <= 0 || this.collectedTarget < this.mi.amount) return;
    this.finished = true;
    this.rewards.finish(true);
    this.refreshHud();
    Sfx.fanfare();
    sparkleBurst(this, this.px, this.py, 24, 60);
    const resource = RESOURCES[this.mi.resourceId];
    this.showEndPanel({
      title: `${resource.label}s Found!`,
      icon: resource.icon,
      sub: `${this.mi.amount}/${this.mi.amount}` + (this.leafScore ? `   ·   +${this.leafScore} leaves` : ""),
      primaryLabel: "Return to the Garden",
      onPrimary: () => this.finishAndReturn(true),
    });
  }

  private onLose(): void {
    if (this.finished) return;
    this.finished = true;
    this.rewards.finish(false);
    Sfx.whoosh();
    this.showEndPanel({
      title: "Try Again?",
      icon: RESOURCES[this.mi.resourceId].icon,
      sub: `Resources return to the garden. ${this.rewards.coins} collected coins saved.`,
      primaryLabel: "Try Again",
      onPrimary: () => {
        this.scene.restart(this.mi);
      },
      secondaryLabel: "Return to the Garden",
      onSecondary: () => this.finishAndReturn(false),
    });
  }

  private confirmAbandon(): void {
    if (this.finished) return;
    Sfx.tap();
    this.finished = true;
    this.showEndPanel({
      title: "Leave the hunt?",
      icon: RESOURCES[this.mi.resourceId].icon,
      sub: `${this.rewards.coins} collected coins are saved. Resources require finishing.`,
      primaryLabel: "Keep Hunting",
      onPrimary: () => {
        this.finished = false;
        this.clearEndPanel();
        this.cameras.main.setZoom(this.baseZoom);
        this.positionHud(this.baseZoom);
        this.cameras.main.startFollow(this.player, true, 0.14, 0.14);
      },
      secondaryLabel: "Return to the Garden",
      onSecondary: () => this.finishAndReturn(false),
    });
  }

  private endPanelRoot?: Phaser.GameObjects.Container;
  private clearEndPanel(): void {
    this.endPanelRoot?.destroy();
    this.endPanelRoot = undefined;
  }

  private showEndPanel(opts: {
    title: string;
    icon: string;
    sub: string;
    primaryLabel: string;
    onPrimary: () => void;
    secondaryLabel?: string;
    onSecondary?: () => void;
  }): void {
    this.clearEndPanel();
    // Measured empirically: a scrollFactor(0) object's render position and
    // its input hit-test position can drift apart by tens of pixels once
    // this scene's follow camera has any non-zero scroll combined with its
    // gameplay zoom (~1.09x) — independent of container nesting depth (a
    // top-level HUD icon at (28,34) hit perfectly; a panel button at
    // (210,550) needed a real click ~30px higher to register). Gameplay is
    // already frozen the instant any end panel shows (`update()` bails out
    // once `finished` is true), so there is nothing left on screen that
    // needs the follow/zoom — freeze the camera to the identity transform
    // here so scrollFactor(0) hit-testing and rendering are both computed
    // from the same simple (scroll 0, zoom 1) math and can't diverge.
    this.cameras.main.stopFollow();
    this.cameras.main.setZoom(1);
    this.positionHud(1);
    this.cameras.main.setScroll(0, 0);
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const veil = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x252b20, 0.68)
      .setOrigin(0)
      .setScrollFactor(0)
      .setInteractive()
      .setAlpha(0);
    const root = this.add.container(0, 0, [veil]);
    root.setScrollFactor(0).setDepth(9500);
    this.endPanelRoot = root;
    this.tweens.add({ targets: veil, alpha: 1, duration: 220 });

    // Decorative chrome only (nothing interactive) — safe to nest inside its
    // own sub-container positioned at (cx,cy) so the pop-in scale tween
    // pivots correctly around the panel's visual centre.
    const panelBox = this.add.container(cx, cy).setScrollFactor(0).setAlpha(0).setScale(0.9);
    root.add(panelBox);
    panelBox.add(makePanel(this, 440, 340, { radius: 32, fill: 0xb47b48, edge: 0x754b2e }));
    panelBox.add(makePanel(this, 416, 316, { radius: 24, fill: 0xfff3dc, edge: 0xe6c392 }));
    const art = this.add.image(0, -84, opts.icon);
    art.setScale(Math.min(120 / art.width, 100 / art.height));
    panelBox.add(art);
    panelBox.add(this.add.text(0, -18, opts.title, titleStyle(28)).setOrigin(0.5).setColor("#5b3d22"));
    panelBox.add(
      this.add
        .text(0, 22, opts.sub, { fontFamily: FONT_FAMILY, fontStyle: "500", fontSize: "16px", color: "#70482e", align: "center", wordWrap: { width: 360 } })
        .setOrigin(0.5),
    );
    this.tweens.add({ targets: panelBox, alpha: 1, scale: 1, duration: 220, ease: "Back.easeOut" });

    // Buttons are direct, ABSOLUTE-position children of `root` (which sits
    // at world (0,0)) rather than nested inside panelBox. Phaser's input
    // hit-test for a scrollFactor(0) object nested inside a scrollFactor(0)
    // container still runs the pointer through this scene's (zoomed,
    // following) main camera transform, and that transform is effectively
    // pivoted at world (0,0) — not at the container's own position. Two
    // levels of "centre panel at screen-middle, then offset a button a
    // little from there" compounds into a real, measurable render/hit-test
    // mismatch once you're ~500px from the origin (verified empirically: a
    // button drawn that way at world (210,550) rendered correctly but only
    // hit-tested correctly around canvas (210,520) — a ~30px miss, enough to
    // make the button feel unresponsive). Keeping buttons flat, absolutely
    // positioned, one level below `root`, eliminates that compounding.
    const primary = new Button(this, cx + (opts.secondaryLabel ? -108 : 0), cy + 100, {
      width: opts.secondaryLabel ? 190 : 260,
      height: 60,
      label: opts.primaryLabel,
      fontSize: 20,
      onClick: () => {
        this.clearEndPanel();
        opts.onPrimary();
      },
    });
    primary.setScrollFactor(0).setAlpha(0).setScale(0.9);
    root.add(primary);
    this.tweens.add({
      targets: primary, alpha: 1, scale: 1, duration: 220, ease: "Back.easeOut",
      onComplete: () => primary.startPulse(),
    });

    if (opts.secondaryLabel && opts.onSecondary) {
      const secondary = new Button(this, cx + 108, cy + 100, {
        width: 190,
        height: 60,
        label: opts.secondaryLabel,
        variant: "cream",
        fontSize: 18,
        onClick: () => {
          this.clearEndPanel();
          opts.onSecondary!();
        },
      });
      secondary.setScrollFactor(0).setAlpha(0).setScale(0.9);
      root.add(secondary);
      this.tweens.add({ targets: secondary, alpha: 1, scale: 1, duration: 220, ease: "Back.easeOut" });
    }
  }

  private finishAndReturn(success: boolean): void {
    if (this.returning) return;
    this.returning = true;
    this.rewards.finish(success && this.collectedTarget >= this.mi.amount && this.lives > 0);
    this.scene.stop();
    bus.emit("habitatRequest:open", { objectId: this.mi.objectId });
  }
}
