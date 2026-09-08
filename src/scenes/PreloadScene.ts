import Phaser from "phaser";
import { COLORS, FONT_FAMILY } from "../ui/theme";

const SVG = (name: string) => `assets/svg/${name}.svg`;

/** Cozy themed loader + all texture loading. Full-screen. */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super("Preload");
  }

  preload(): void {
    this.drawLoader();

    const svg = (key: string, w: number, h: number) =>
      this.load.svg(key, SVG(key), { width: w, height: h });

    // sky / terrain
    svg("sky", 900, 1100);
    svg("clouds", 1400, 360);
    svg("hills_far", 2400, 560);
    svg("hills_near", 2400, 640);
    svg("grass_tile", 256, 256);
    svg("path", 700, 1200);
    svg("meadow_lush", 1000, 640);
    svg("vignette", 900, 1400);

    // world props
    svg("rock", 220, 170);
    svg("fence", 360, 200);
    svg("weeds", 180, 200);
    svg("dead_shrub", 220, 200);
    svg("stump", 180, 140);
    svg("arch", 460, 560);
    svg("flower", 64, 72);
    svg("planter", 240, 150);
    svg("sapling", 130, 210);
    svg("crate", 200, 170);
    svg("pond_dry", 380, 200);
    svg("signpost", 150, 190);

    // creatures + puzzle pictures
    svg("rabbit", 220, 250);
    svg("rabbit_portrait", 900, 900);
    svg("bird", 150, 160);
    svg("bird_portrait", 900, 900);

    // fx + ui
    svg("spark", 48, 48);
    svg("glow", 256, 256);
    svg("firefly", 24, 24);
    svg("petal", 28, 28);
    svg("dust", 140, 140);
    svg("coin", 64, 64);
    svg("shadow", 200, 90);
  }

  create(): void {
    this.scene.start("Menu");
  }

  private drawLoader(): void {
    const w = this.scale.width || window.innerWidth;
    const h = this.scale.height || window.innerHeight;

    const bg = this.add.graphics();
    bg.fillGradientStyle(COLORS.skyTop, COLORS.skyTop, COLORS.skyLow, COLORS.skyLow, 1);
    bg.fillRect(0, 0, w, h);

    this.add
      .text(w / 2, h / 2 - 54, "DreamGarden", {
        fontFamily: FONT_FAMILY,
        fontSize: "48px",
        fontStyle: "700",
        color: "#5b4636",
      })
      .setOrigin(0.5);
    this.add
      .text(w / 2, h / 2 - 8, "a garden is waking up", {
        fontFamily: FONT_FAMILY,
        fontSize: "20px",
        fontStyle: "500",
        color: "#7a6350",
      })
      .setOrigin(0.5);

    const barW = Math.min(360, w - 80);
    const barX = w / 2 - barW / 2;
    const barY = h / 2 + 44;
    const track = this.add.graphics();
    track.fillStyle(COLORS.panelEdge, 1);
    track.fillRoundedRect(barX - 4, barY - 4, barW + 8, 24, 12);
    track.fillStyle(0xffffff, 0.5);
    track.fillRoundedRect(barX, barY, barW, 16, 8);

    const fill = this.add.graphics();
    this.load.on("progress", (p: number) => {
      fill.clear();
      fill.fillStyle(COLORS.gold, 1);
      fill.fillRoundedRect(barX, barY, Math.max(16, barW * p), 16, 8);
    });
  }
}
