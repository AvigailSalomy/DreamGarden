import Phaser from "phaser";

/**
 * Procedural pickup textures for the Garden Maze — drawn once at 2× the size
 * they're ever shown at, so they stay crisp. Deliberately unlike anything
 * else on the board: the Heart is a bold red heart (extra life), the Power
 * Crystal a faceted cyan gem (turn the tables) — neither can be mistaken for
 * a gold coin or a mission item.
 */

export const MZ_HEART = "mz_heart_px";
export const MZ_POWER = "mz_power_px";
export const MZ_SOFT_GLOW = "mz_soft_glow_px";

const SIZE = 128;

export function ensureMazeTextures(scene: Phaser.Scene): void {
  if (!scene.textures.exists(MZ_HEART)) drawHeart(scene);
  if (!scene.textures.exists(MZ_POWER)) drawCrystal(scene);
  if (!scene.textures.exists(MZ_SOFT_GLOW)) drawSoftGlow(scene);
}

function heartPath(g: Phaser.GameObjects.Graphics, cx: number, cy: number, s: number): void {
  // two lobes + a point, as one filled shape
  g.fillCircle(cx - 0.25 * s, cy - 0.12 * s, 0.27 * s);
  g.fillCircle(cx + 0.25 * s, cy - 0.12 * s, 0.27 * s);
  g.fillTriangle(cx - 0.5 * s, cy - 0.02 * s, cx + 0.5 * s, cy - 0.02 * s, cx, cy + 0.48 * s);
}

function drawHeart(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const c = SIZE / 2;
  g.fillStyle(0x8a1033, 1);
  heartPath(g, c, c + 4, SIZE * 0.92);
  g.fillStyle(0xff3d63, 1);
  heartPath(g, c, c + 2, SIZE * 0.8);
  g.fillStyle(0xff7a93, 1);
  heartPath(g, c - 4, c - 4, SIZE * 0.5);
  g.fillStyle(0xffffff, 0.85);
  g.fillEllipse(c - SIZE * 0.22, c - SIZE * 0.2, SIZE * 0.16, SIZE * 0.1);
  g.generateTexture(MZ_HEART, SIZE, SIZE);
  g.destroy();
}

function drawCrystal(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const top = { x: 64, y: 6 };
  const l = { x: 22, y: 50 };
  const r = { x: 106, y: 50 };
  const bot = { x: 64, y: 124 };
  const ml = { x: 46, y: 50 };
  const mr = { x: 82, y: 50 };
  // outline halo
  g.fillStyle(0x0b5a86, 1);
  g.fillPoints([{ x: 64, y: 0 }, { x: 114, y: 50 }, { x: 64, y: 128 }, { x: 14, y: 50 }], true);
  // facets
  g.fillStyle(0xbff4ff, 1);
  g.fillPoints([top, r, mr, ml, l], true);
  g.fillStyle(0x6fd8ff, 1);
  g.fillPoints([l, ml, bot], true);
  g.fillStyle(0x2fb0e8, 1);
  g.fillPoints([ml, mr, bot], true);
  g.fillStyle(0x1b8ec8, 1);
  g.fillPoints([mr, r, bot], true);
  g.fillStyle(0xffffff, 0.9);
  g.fillPoints([top, { x: 52, y: 30 }, { x: 58, y: 48 }, ml], true);
  g.lineStyle(2, 0xffffff, 0.7);
  g.strokePoints([top, r, bot, l], true);
  g.generateTexture(MZ_POWER, SIZE, SIZE);
  g.destroy();
}

function drawSoftGlow(scene: Phaser.Scene): void {
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const c = SIZE / 2;
  for (let i = 16; i >= 1; i--) {
    g.fillStyle(0xffffff, 0.06);
    g.fillCircle(c, c, (c * i) / 16);
  }
  g.generateTexture(MZ_SOFT_GLOW, SIZE, SIZE);
  g.destroy();
}
