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
    svg("heart_dormant", 220, 240);
    svg("oak_dead", 340, 440);

    // cozy woodland trees (layered background + foreground framing)
    svg("tree", 300, 360);
    svg("tree_tall", 260, 440);
    svg("tree_pine", 240, 420);
    svg("tree_fg", 360, 520);

    // restorations + puzzle pictures
    svg("rabbit", 220, 250);
    svg("rabbit_portrait", 900, 900);
    svg("fox", 220, 190); // Bunny Heist guard — no prior asset existed for this
    svg("bird", 150, 160);
    svg("bird_portrait", 900, 900);
    svg("wildflower_bed", 320, 320);
    svg("wildflowers_portrait", 900, 900);

    // letter system
    svg("envelope", 420, 310);
    svg("letter_paper", 460, 560);

    // requests economy — item icons (request cards + mini-game pool)
    svg("basket", 160, 120);
    svg("carrot", 64, 64);
    svg("clover", 64, 64);
    svg("apple", 64, 64);
    svg("hay", 64, 64);
    svg("seed", 64, 64);
    svg("flower_petals", 64, 64);
    svg("water_drop", 64, 64);
    svg("leaf", 64, 64);
    svg("berry", 64, 64);
    svg("feather", 64, 64);
    svg("star_special", 64, 64);

    // requests economy — world-state props (one per purchasable request)
    svg("carrot_basket_prop", 160, 130);
    svg("soft_hay_prop", 180, 110);
    svg("clover_patch_prop", 170, 100);
    svg("fresh_soil_prop", 180, 90);
    svg("flower_seeds_prop", 170, 110);
    svg("watering_supplies_prop", 150, 150);
    svg("bird_seeds_prop", 160, 100);
    svg("water_dish_prop", 150, 90);
    svg("cozy_perch_prop", 170, 130);

    // ---- production art pass (Dream Garden visual rebuild) ----
    // Raster PNGs (background-removed from the supplied Game_Assets_Dream_Garden
    // pack via scripts/process_dg_assets.py) — a different loader from the rest of
    // this file's hand-drawn SVGs. Prefixed "dg_" throughout so a texture key never
    // collides with the flat placeholder it's replacing (e.g. "rabbit" vs "dg_rabbit"),
    // which keeps the swap a one-line change in data/objects.ts and lets the puzzle
    // portraits (rabbit_portrait etc. — unrelated, untouched here) keep working.
    // registers under a FLAT key (folder stripped: "nature/rock_medium_01" -> "dg_rock_medium_01")
    // — GardenScene's `dprop()` helper derives the same flat key from the same path.
    const dg = (path: string) => this.load.image(`dg_${path.split("/").pop()}`, `assets/dg/${path}.png`);

    dg("animals/rabbit");
    dg("animals/bluebird");
    dg("animals/squirrel");
    dg("animals/fox");
    dg("animals/deer");
    dg("animals/hedgehog");

    dg("trees/tree_small_01");
    dg("trees/tree_medium_01");
    dg("trees/tree_large_01");
    dg("trees/tree_tall_01");
    dg("trees/tree_pink_01");
    dg("trees/magic_tree_restored");

    dg("vegetation/bush_green_01");
    dg("vegetation/bush_mixed_01");
    dg("vegetation/fern_01");
    dg("vegetation/hedge_straight_01");
    dg("vegetation/flowers_blue_01");
    dg("vegetation/flowers_mixed_01");
    dg("vegetation/flowers_pink_01");
    dg("vegetation/flowers_yellow_01");
    dg("vegetation/flower_arch_01");
    dg("vegetation/vegetation_01");
    dg("vegetation/vegetation_04");

    dg("nature/rock_large_01");
    dg("nature/rock_medium_01");
    dg("nature/rock_small_01");
    dg("nature/log_01");
    dg("nature/mushrooms_01");

    dg("decor/fence_01");
    dg("decor/lantern_01");
    dg("decor/sign_01");
    dg("decor/bench_01");
    dg("decor/birdhouse_01");
    dg("decor/planter_01");
    dg("decor/flower_cart_01");
    dg("decor/picnic_table_01");

    dg("structures/cottage_small_01");
    dg("structures/animal_house_01");
    dg("structures/bridge_wood_01");

    dg("water/pond_damaged_01");
    dg("water/pond_restored_01");
    dg("water/water_lilies_01");
    dg("water/waterfall_01");

    dg("foreground/foreground_02");
    dg("foreground/foreground_03");

    dg("terrain/terrain_04");
    dg("terrain/grass_ground"); // the supplied painted ground reference — the world's base terrain

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
