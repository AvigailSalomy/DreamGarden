import Phaser from "phaser";
import { makeIconButton, attachHit } from "../ui/hit";
import { makePanel } from "../ui/Panel";
import { titleStyle, bodyStyle, COLORS } from "../ui/theme";
import { FROSTED_CATALOG } from "../data/frostedValley";
import { frostedProgression } from "../game/services";
import { Sfx } from "../fx/Sfx";
import { sparkleBurst } from "../fx/Particles";
import type { FrostedResourceDef, FrostedResourceProgress } from "../data/types";
import type { FrostedValleyScene } from "./FrostedValleyScene";

/** A round, icy-themed button (frost-white with a soft blue rim) — used for the two bottom actions. */
function makeCircleButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  radius: number,
  label: string,
  onTap: () => void,
  opts: { fill?: number; edge?: number; textColor?: string } = {},
): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  g.fillStyle(0x3a5f78, 0.18);
  g.fillCircle(0, radius * 0.12, radius);
  g.fillStyle(opts.fill ?? 0xeaf6fb, 1);
  g.fillCircle(0, 0, radius);
  g.lineStyle(3, opts.edge ?? 0x9fd3ea, 1);
  g.strokeCircle(0, 0, radius);
  g.fillStyle(0xffffff, 0.4);
  g.fillEllipse(-radius * 0.25, -radius * 0.4, radius * 0.9, radius * 0.5);
  const t = scene.add
    .text(0, 0, label, { ...titleStyle(Math.round(radius * 0.34)), color: opts.textColor ?? "#2f6b52", align: "center", wordWrap: { width: radius * 1.6 } })
    .setOrigin(0.5);
  c.add([g, t]);
  c.setSize(radius * 2, radius * 2);
  attachHit(scene, c as unknown as Parameters<typeof attachHit>[1], radius * 2, radius * 2, { onTap, feedbackTarget: c });
  return c;
}

/**
 * "A friend needs help!" — the Frosted Valley Request screen. One reusable,
 * data-driven scene for all six animals: shows the current animal's exactly-
 * three resource cards, each independently tracking progress against
 * FrostedValleyProgressionService (the single source of truth — this screen
 * never holds its own copy of the numbers).
 *
 * Get/Play -> launches GardenMaze for that one resource, and returns here.
 * Restore -> commits the restoration through FrostedValleyScene.triggerRestore
 * (the actual damaged->restored crossfade happens in the WORLD, not here) and
 * refreshes this screen's cards, per the "player must see the world change,
 * not the request panel" rule.
 */
interface RequestLaunchData {
  animalId: string;
}

const CARD_W = 190;
const CARD_H = 260;
const PORTRAIT_SIZE = 180;
const PORTRAIT_GAP = 26;

export class FrostedRequestScene extends Phaser.Scene {
  private animalId!: string;
  private cardsLayer?: Phaser.GameObjects.Container;
  private progressText?: Phaser.GameObjects.Text;

  constructor() {
    super("FrostedRequest");
  }

  create(data: RequestLaunchData): void {
    this.animalId = data.animalId;
    this.registry.set("pointerOnUI", true);

    const w = this.scale.width;
    const h = this.scale.height;
    const scrim = this.add.rectangle(0, 0, w, h, 0x0d1f2e, 0.55).setOrigin(0, 0).setInteractive();
    attachHit(this, scrim as unknown as Parameters<typeof attachHit>[1], w, h, {});

    const def = FROSTED_CATALOG.find((a) => a.id === this.animalId);
    if (!def) {
      this.close();
      return;
    }

    // once every requirement is restored, a 🧩 puzzle card joins the row
    const n = def.resources.length + (frostedProgression.isPuzzleAvailable(def.id) ? 1 : 0);
    const maxPanelW = w - 60 - PORTRAIT_SIZE - PORTRAIT_GAP;
    const panelW = Math.min(Math.max(560, n * CARD_W + (n + 1) * 26 + 40), maxPanelW);
    const panelH = 560;
    const cx = w / 2;
    const cy = h / 2;

    // the panel sits shifted RIGHT of center by half the portrait's footprint
    // (which hangs off its left edge), so the portrait-plus-panel COMPOSITION
    // as a whole stays screen-centered
    const composeShift = (PORTRAIT_SIZE + PORTRAIT_GAP) / 2;
    const root = this.add.container(cx + composeShift, cy).setScale(0.9).setAlpha(0);
    this.tweens.add({ targets: root, scale: 1, alpha: 1, duration: 260, ease: "Back.easeOut" });

    const panel = makePanel(this, panelW, panelH, { radius: 30, fill: COLORS.panel });
    root.add(panel);

    // a cute portrait of the animal being rescued, medallion-style, just
    // outside the panel's left edge
    root.add(this.buildPortrait(-panelW / 2 - PORTRAIT_GAP - PORTRAIT_SIZE / 2, def.id));

    // cute flower-bush decorations at the top corners, and a small envelope
    // nodding to the letter this animal's chapter opened with
    const bushL = this.add.image(-panelW / 2 + 26, -panelH / 2 + 8, "fv_flower_bush").setDisplaySize(96, 96).setOrigin(0.5).setAngle(-8);
    const bushR = this.add.image(panelW / 2 - 26, -panelH / 2 + 8, "fv_flower_bush").setDisplaySize(96, 96).setOrigin(0.5).setAngle(8).setFlipX(true);
    root.add([bushL, bushR]);
    root.add(this.drawEnvelopeIcon(0, -panelH / 2 + 22));

    const title = this.add.text(0, -panelH / 2 + 58, "A friend needs help!", { ...titleStyle(25), color: "#5b4636" }).setOrigin(0.5);
    const subtitle = this.add
      .text(0, -panelH / 2 + 92, `This little ${def.name.toLowerCase()} is looking for these items:`, bodyStyle(15))
      .setOrigin(0.5);
    // a small, always-current "N / total restored" readout — so the player
    // can see their overall progress on this animal at a glance, not just
    // each card's own state (kept in sync in rebuildCards, since this note
    // can be resumed after a maze run without being fully recreated)
    this.progressText = this.add.text(panelW / 2 - 26, -panelH / 2 + 58, "", { ...titleStyle(13), color: "#3f7a5a" }).setOrigin(1, 0.5);
    root.add([title, subtitle, this.progressText]);

    this.cardsLayer = this.add.container(0, 0);
    root.add(this.cardsLayer);
    this.rebuildCards(def);

    // every requirement restored → the reward puzzle is the one thing left to do
    const puzzleReady = frostedProgression.isPuzzleAvailable(def.id);

    const footer = this.add
      .text(
        0,
        158,
        puzzleReady
          ? "Everything is restored! Put the picture back together to bring your friend home."
          : "Choose an item to help your friend's home bloom.",
        puzzleReady ? { ...titleStyle(14), color: "#3f7a5a" } : bodyStyle(13),
      )
      .setOrigin(0.5);
    root.add(footer);

    const laterBtn = makeCircleButton(this, puzzleReady ? -150 : -80, 226, 38, "Maybe\nlater", () => this.close(), {
      fill: 0xf3ede0,
      edge: 0xd9c9a8,
      textColor: "#5b4636",
    });
    root.add(laterBtn);
    if (puzzleReady) {
      root.add(this.makePuzzleButton(50, 226, () => this.onPuzzle(def.id)));
    } else {
      const playBtn = makeCircleButton(this, 80, 226, 44, "Play", () => this.onHelpNow(def), {
        fill: 0xdff3fb,
        edge: 0x7fc2e0,
        textColor: "#1f5a7a",
      });
      root.add(playBtn);
    }

    this.events.once(Phaser.Scenes.Events.RESUME, () => {
      this.scene.setVisible(true);
      this.rebuildCards(def);
    });
  }

  /** A cute medallion portrait of the animal being rescued, reusing its real world sprite — no new art. */
  private buildPortrait(x: number, animalKey: string): Phaser.GameObjects.Container {
    const c = this.add.container(x, 0);
    const r = PORTRAIT_SIZE / 2;
    const g = this.add.graphics();
    g.fillStyle(0x3a5f78, 0.16);
    g.fillCircle(0, r * 0.12, r);
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(0, 0, r);
    g.lineStyle(4, 0xdcbf87, 1);
    g.strokeCircle(0, 0, r);
    const portrait = this.add.image(0, 4, animalKey).setOrigin(0.5);
    const targetSize = PORTRAIT_SIZE * 0.72;
    const fitScale = Math.min(targetSize / portrait.width, targetSize / portrait.height);
    portrait.setScale(fitScale);
    c.add([g, portrait]);
    this.tweens.add({ targets: c, y: -8, duration: 1900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    return c;
  }

  /** A small decorative envelope (no new art) — a nod to the letter that opened this animal's chapter. */
  private drawEnvelopeIcon(x: number, y: number): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);
    const w = 46;
    const h = 32;
    const g = this.add.graphics();
    g.fillStyle(0xfff7e6, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, 5);
    g.lineStyle(2, 0xd9b978, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, 5);
    g.beginPath();
    g.moveTo(-w / 2, -h / 2);
    g.lineTo(0, 2);
    g.lineTo(w / 2, -h / 2);
    g.strokePath();
    c.add(g);
    return c;
  }

  private rebuildCards(def: (typeof FROSTED_CATALOG)[number]): void {
    this.cardsLayer?.removeAll(true);
    const puzzleReady = frostedProgression.isPuzzleAvailable(def.id);
    const restoredCount = def.resources.filter((r) => frostedProgression.resourceState(def.id, r.id).restored).length;
    this.progressText?.setText(puzzleReady ? "" : `${restoredCount} / ${def.resources.length} restored`);
    const n = def.resources.length + (puzzleReady ? 1 : 0);
    const gap = 26;
    const totalW = n * CARD_W + (n - 1) * gap;
    const startX = -totalW / 2 + CARD_W / 2;

    def.resources.forEach((res, i) => {
      const state = frostedProgression.resourceState(def.id, res.id);
      const cx = startX + i * (CARD_W + gap);
      const cy = 0;
      this.cardsLayer?.add(this.buildQuestCard(def, res, state, cx, cy));
    });

    if (puzzleReady) this.cardsLayer?.add(this.buildPuzzleCard(def, startX + def.resources.length * (CARD_W + gap)));
  }

  /**
   * One "magical quest card" for a single resource — a premium redesign of
   * the old plain panel+text+button: a soft radial glow behind the
   * requirement's own restored-art icon (so it reads as "something
   * magical", not a generic thumbnail), tiny corner snowflake ornaments, a
   * divider for clearer hierarchy, and a RESTORE/PLAY action button with
   * its own distinct color identity.
   */
  private buildQuestCard(
    def: (typeof FROSTED_CATALOG)[number],
    res: FrostedResourceDef,
    state: FrostedResourceProgress,
    cx: number,
    cy: number,
  ): Phaser.GameObjects.Container {
    const card = this.add.container(cx, cy).setScale(0.85).setAlpha(0);
    this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 320, ease: "Back.easeOut", delay: 60 });

    const bg = makePanel(this, CARD_W, CARD_H, {
      radius: 22,
      fill: state.restored ? 0xeaf7ec : 0xfffaf0,
      edge: state.restored ? 0xbfe3c4 : COLORS.panelEdge,
      shadow: false,
    });
    card.add(bg);

    // corner snowflake ornaments — a quiet, consistent "this is a quest card" cue
    const corner = (x: number, flip: boolean) =>
      this.add.text(x, -CARD_H / 2 + 16, "❄", { fontSize: "13px", color: "#d9c9a8" }).setOrigin(0.5).setAlpha(0.7).setFlipX(flip);
    card.add([corner(-CARD_W / 2 + 16, false), corner(CARD_W / 2 - 16, true)]);

    // a soft glow behind the requirement's own art, so the icon itself feels magical
    const glowAlpha = state.restored ? 0.4 : 0.22;
    const glow = this.add
      .image(0, -68, "glow")
      .setDisplaySize(150, 150)
      .setAlpha(glowAlpha)
      .setTint(state.restored ? 0x9fe8b0 : 0xbfe0ff)
      .setBlendMode(Phaser.BlendModes.ADD);
    card.add(glow);
    this.tweens.add({ targets: glow, alpha: glowAlpha * 0.55, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    const iconFrame = this.add.rectangle(0, -68, CARD_W - 26, 128, 0xffffff, 0.5).setStrokeStyle(2, 0xf0e3c8);
    const icon = this.add.image(0, -68, res.restoredAsset).setOrigin(0.5);
    // fit inside the frame at the art's own aspect ratio — never stretched to a box
    icon.setScale(Math.min(118 / icon.width, 110 / icon.height));
    card.add([iconFrame, icon]);

    const label = this.add
      .text(0, 6, res.label, { ...titleStyle(14), color: "#5b4636", align: "center", wordWrap: { width: CARD_W - 20 } })
      .setOrigin(0.5, 0);
    card.add(label);

    const divider = this.add.graphics();
    divider.lineStyle(1, 0xe4d3ab, 0.9);
    divider.lineBetween(-CARD_W / 2 + 22, 46, CARD_W / 2 - 22, 46);
    card.add(divider);

    if (state.restored) {
      const check = this.add.text(0, 60, "Restored ✓", { ...titleStyle(16), color: "#3f8a4c" }).setOrigin(0.5);
      card.add(check);
      // a tiny permanent sparkle drift so a restored card still feels "alive"
      this.time.addEvent({
        delay: 2600,
        loop: true,
        callback: () => card.active && sparkleBurst(this, cx, cy - 68, 3, 30),
      });
    } else {
      const progress = this.add.text(0, 58, `${state.current} / ${res.requiredAmount}`, titleStyle(17)).setOrigin(0.5);
      card.add(progress);

      const canRestore = frostedProgression.canRestore(def.id, res.id);
      const btn = canRestore
        ? this.buildQuestButton(0, 100, CARD_W - 26, 40, "Restore", "✨", "restore", () => this.onRestore(def.id, res.id))
        : this.buildQuestButton(0, 100, CARD_W - 26, 40, "Play", "▶", "play", () => this.onPlay(def.id, res.id));
      card.add(btn);
    }

    return card;
  }

  /**
   * A premium pill button with its own color identity — RESTORE (icy cyan,
   * "a world action") vs PLAY (warm amber, "an arcade action") — replacing
   * the plain shared `makeIconButton` ONLY here, so every other place that
   * still uses that shared button (toolbar buttons, tab buttons, the puzzle
   * card's Start button, etc.) is untouched. Press feedback comes from
   * `attachHit`'s existing scale-down/up, the same feel as every other
   * button in the game — only the idle shimmer and the two-tone fill/glow
   * are new.
   */
  private buildQuestButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    icon: string,
    variant: "restore" | "play",
    onTap: () => void,
  ): Phaser.GameObjects.Container {
    const palette =
      variant === "restore"
        ? { top: 0x8fe6ec, bottom: 0x3fb3c7, edge: 0x1f8797, text: "#0a3f47", glowTint: 0x9df3ff }
        : { top: 0xffd98a, bottom: 0xf3a83a, edge: 0xc9821a, text: "#5b3a00", glowTint: 0xffe6a3 };

    const c = this.add.container(x, y);
    const glow = this.add
      .image(0, 0, "glow")
      .setDisplaySize(w * 1.5, h * 2.6)
      .setTint(palette.glowTint)
      .setAlpha(0.4)
      .setBlendMode(Phaser.BlendModes.ADD);
    const g = this.add.graphics();
    g.fillStyle(0x000000, 0.18);
    g.fillRoundedRect(-w / 2, -h / 2 + 3, w, h, h / 2);
    g.fillGradientStyle(palette.top, palette.top, palette.bottom, palette.bottom, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    g.lineStyle(2, palette.edge, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    g.fillStyle(0xffffff, 0.4);
    g.fillRoundedRect(-w / 2 + 6, -h / 2 + 4, w - 12, h * 0.3, h * 0.15);
    const t = this.add.text(0, 1, `${icon} ${label}`, { ...titleStyle(14), color: palette.text }).setOrigin(0.5);
    c.add([glow, g, t]);
    c.setSize(w, h);
    attachHit(this, c as unknown as Parameters<typeof attachHit>[1], w, h, {
      onTap: () => {
        Sfx.tap();
        onTap();
      },
      feedbackTarget: c,
    });
    this.tweens.add({ targets: glow, alpha: 0.18, duration: 1200, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    return c;
  }

  /**
   * The puzzle "note" that appears the moment every requirement is restored:
   * a golden card previewing the animal's picture, with its own Start button.
   */
  private buildPuzzleCard(def: (typeof FROSTED_CATALOG)[number], x: number): Phaser.GameObjects.Container {
    const card = this.add.container(x, 0);
    const glow = this.add.image(0, 0, "glow").setDisplaySize(CARD_W * 1.6, CARD_H * 1.4).setTint(0xffe6a3).setAlpha(0.5);
    const bg = makePanel(this, CARD_W, CARD_H, { radius: 22, fill: 0xfff4d6, edge: 0xe8b64c, shadow: false });
    card.add([glow, bg]);
    this.tweens.add({ targets: glow, alpha: 0.18, duration: 1000, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    const frame = this.add.rectangle(0, -68, CARD_W - 26, 128, 0xfffaf0, 1).setStrokeStyle(2, 0xe8b64c);
    const icon = this.add.text(0, -68, "🧩", { fontSize: "64px" }).setOrigin(0.5);
    card.add([frame, icon]);
    // swap the emoji for a preview of the real puzzle picture once it's loaded
    const key = def.puzzle.image;
    const showPreview = () => {
      if (!card.active) return;
      icon.setVisible(false);
      const pic = this.add.image(0, -68, key).setDisplaySize(CARD_W - 30, (CARD_W - 30) / 1.83).setOrigin(0.5);
      const badge = this.add.text(CARD_W / 2 - 26, -120, "🧩", { fontSize: "28px" }).setOrigin(0.5);
      card.addAt(pic, 3);
      card.add(badge);
    };
    if (this.textures.exists(key)) showPreview();
    else {
      this.load.image(key, `assets/frosted/puzzle/${key}.jpg`);
      this.load.once(Phaser.Loader.Events.COMPLETE, showPreview);
      this.load.start();
    }

    const label = this.add
      .text(0, 6, `${def.name}'s Puzzle`, { ...titleStyle(15), color: "#8a5a00", align: "center", wordWrap: { width: CARD_W - 20 } })
      .setOrigin(0.5, 0);
    const sub = this.add
      .text(0, 50, `${def.puzzle.cols * def.puzzle.rows} pieces`, bodyStyle(13))
      .setOrigin(0.5);
    const btn = makeIconButton(this, 0, 104, "Start ›", 16, () => this.onPuzzle(def.id), {
      hitW: CARD_W - 26,
      hitH: 42,
      color: "#8a5a00",
    });
    card.add([label, sub, btn]);

    // it slides in like a fresh note
    card.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 420, delay: 200, ease: "Back.easeOut" });
    return card;
  }

  /** The big, gently glowing "🧩 COMPLETE THE PUZZLE" pill — only built once every requirement is restored. */
  private makePuzzleButton(x: number, y: number, onTap: () => void): Phaser.GameObjects.Container {
    const w = 250;
    const h = 64;
    const c = this.add.container(x, y);
    const glow = this.add.image(0, 0, "glow").setDisplaySize(w * 1.5, h * 2.6).setTint(0xffe6a3).setAlpha(0.55);
    const g = this.add.graphics();
    g.fillStyle(0x8a5a00, 0.25);
    g.fillRoundedRect(-w / 2, -h / 2 + 5, w, h, h / 2);
    g.fillStyle(0xffd46b, 1);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    g.lineStyle(3, 0xd99a2b, 1);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    g.fillStyle(0xffffff, 0.35);
    g.fillRoundedRect(-w / 2 + 14, -h / 2 + 6, w - 28, h * 0.32, h * 0.16);
    const t = this.add.text(0, 1, "🧩 COMPLETE THE PUZZLE", { ...titleStyle(17), color: "#5b3a00" }).setOrigin(0.5);
    c.add([glow, g, t]);
    c.setSize(w, h);
    attachHit(this, c as unknown as Parameters<typeof attachHit>[1], w, h, { onTap, feedbackTarget: c });
    this.tweens.add({ targets: glow, alpha: 0.2, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    return c;
  }

  private onPuzzle(animalId: string): void {
    this.close();
    (this.scene.get("FrostedValley") as FrostedValleyScene).openPuzzle(animalId);
  }

  /** "Help now" jumps straight into the first unfinished resource's maze. */
  private onHelpNow(def: (typeof FROSTED_CATALOG)[number]): void {
    const next = def.resources.find((r) => !frostedProgression.resourceState(def.id, r.id).restored);
    if (!next) return;
    if (frostedProgression.canRestore(def.id, next.id)) this.onRestore(def.id, next.id);
    else this.onPlay(def.id, next.id);
  }

  private onPlay(animalId: string, resourceId: string): void {
    // fully hidden, not just paused — Phaser keeps rendering a paused scene's
    // last frame otherwise, which could show through under the maze
    this.scene.pause();
    this.scene.setVisible(false);
    this.scene.launch("GardenMaze", { animalId, resourceId, returnTo: "FrostedRequest" });
  }

  private async onRestore(animalId: string, resourceId: string): Promise<void> {
    // per spec: Restore closes the Request panel and shows the transformation
    // happening in the actual world, not behind this screen
    this.close();
    const fv = this.scene.get("FrostedValley") as FrostedValleyScene;
    await fv.triggerRestore(animalId, resourceId);
  }

  private close(): void {
    this.registry.set("pointerOnUI", false);
    this.scene.stop();
    this.scene.resume("FrostedValley");
  }
}
