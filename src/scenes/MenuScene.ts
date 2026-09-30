import Phaser from "phaser";
import { FONT_FAMILY, bodyStyle } from "../ui/theme";
import { Button } from "../ui/Button";
import { confirmModal, settingsModal } from "../ui/Modal";
import { makeIconButton } from "../ui/hit";
import { buildCozyBackdrop } from "../world/cozyBackdrop";
import { safeInsets } from "../util/safeArea";
import { hasProgress, isFrostedValleyUnlocked, resetGarden, save } from "../game/services";
import type { FrostedMenuData } from "./FrostedMenuScene";
import { audio } from "../audio/AudioManager";

/** The opening storybook screen: title, Continue / Start, Settings. */
export class MenuScene extends Phaser.Scene {
  /** Arrived from the "Garden restored" letter's Travel button: open Frosted Valley straight away. */
  private travelToValley = false;

  constructor() {
    super("Menu");
  }

  init(data?: { openFrostedValley?: boolean }): void {
    this.travelToValley = !!data?.openFrostedValley;
    // Phaser keeps start data across restart() (relayout on resize): consume it once
    if (data) delete data.openFrostedValley;
  }

  create(): void {
    this.input.enabled = true; // (re)entering the menu always takes input again
    const backdrop = buildCozyBackdrop(this);
    for (const obj of backdrop) {
      const key = (obj as Phaser.GameObjects.Image).texture?.key;
      if (["arch", "dead_shrub", "stump", "weeds", "flower"].includes(key)) obj.destroy();
    }

    const W = this.scale.width;
    const H = this.scale.height;
    const inset = safeInsets();
    const resume = hasProgress();
    // Reuse the garden production library to look through a living entrance.
    const art = (key: string, x: number, y: number, height: number, depth: number) => {
      const image = this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(depth);
      image.setScale(height / image.height);
      return image;
    };
    art("dg_grass_ground", W / 2, H * 1.35, H, -79).setDisplaySize(W * 1.4, H);
    art("dg_cottage_small_01", W * 0.68, H * 0.58, H * 0.27, -70);
    art("dg_pond_restored_01", W * 0.5, H * 0.65, H * 0.23, -69);
    for (const side of [-1, 1]) {
      art("dg_tree_pink_01", W / 2 + side * W * 0.40, H * 0.61, H * 0.60, -68);
      art("dg_bush_mixed_01", W / 2 + side * W * 0.37, H * 0.9, H * 0.38, -58);

      art("dg_flowers_mixed_01", W / 2 + side * W * 0.41, H * 1.05, H * 0.32, -51);
    }
    art("dg_flower_arch_01", W / 2, H * 0.72, H * 0.69, -60);
    const sign = this.add.graphics();
    const sw = Math.min(530, W - 36), sy = H * 0.20;
    sign.fillStyle(0x613d28).fillRoundedRect(W / 2 - sw / 2, sy - 44, sw, 93, 28);
    sign.fillStyle(0xb77d48).fillRoundedRect(W / 2 - sw / 2 + 5, sy - 43, sw - 10, 80, 24);
    sign.lineStyle(2, 0xe8b877, 0.7).strokeRoundedRect(W / 2 - sw / 2 + 10, sy - 37, sw - 20, 68, 20);

    this.add
      .text(W / 2, H * 0.20, "Dream Garden", {
        fontFamily: FONT_FAMILY,
        fontStyle: "700",
        fontSize: `${Math.min(58, W * 0.115)}px`,
        color: "#fff0c9",
      })
      .setOrigin(0.5)
      .setShadow(0, 3, "rgba(70,50,60,0.25)", 6);

    this.add
      .text(W / 2, H * 0.20 + 65, "a garden waiting to wake up", {
        ...bodyStyle(Math.min(21, W * 0.044), "#fff3dc"),
      })
      .setOrigin(0.5);

    // primary
    const primaryW = Math.min(360, W - 96);
    new Button(this, W / 2, H * 0.66, {
      width: primaryW,
      height: Math.min(90, H * 0.12),
      label: resume ? "Continue" : "Start New Garden",
      fontSize: 34,
      onClick: () => this.enter(false),
    }).startPulse();

    // secondary — only when there is a garden to erase
    if (resume) {
      new Button(this, W / 2, H * 0.66 + Math.min(108, H * 0.15), {
        width: primaryW,
        height: Math.min(72, H * 0.10),
        label: "Start New Garden",
        variant: "cream",
        fontSize: 24,
        onClick: () => this.confirmNew(),
      });
    }

    // settings gear — whole ~52px zone taps, not just the glyph
    makeIconButton(
      this,
      W - inset.right - 30,
      inset.top + 32,
      "⚙",
      34,
      () => {
        audio.unlock();
        audio.playSfx("ui_click");
        settingsModal(this, { onStartNew: () => this.confirmNew() });
      },
      { hitW: 56, hitH: 56 },
    );

    // Frosted Valley — an isolated new-world build; launched as an overlay on
    // top of Menu, its own "‹" back button just stops it.
    makeIconButton(
      this,
      inset.left + 30,
      inset.top + 32,
      "❄️",
      28,
      () => {
        audio.unlock();
        audio.playSfx("ui_click");
        // once unlocked, later visits first offer the valley's own
        // Continue / Start New Garden; while locked it opens its preview
        if (isFrostedValleyUnlocked()) this.openValleyMenu();
        else this.openFrostedValley("Loading Frosted Valley…");
      },
      { hitW: 56, hitH: 56 },
    );

    this.scale.on(Phaser.Scale.Events.RESIZE, this.relayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off(Phaser.Scale.Events.RESIZE, this.relayout, this),
    );

    if (this.travelToValley) {
      this.travelToValley = false;
      this.openFrostedValley("Traveling to Frosted Valley…", true);
    }

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__dgMenu = {
        start: () => this.enter(false),
        newGarden: () => {
          resetGarden();
          this.enter(true);
        },
        hasProgress: () => hasProgress(),
      };
    }
  }

  /**
   * Open Frosted Valley as an overlay on top of this menu — from the ❄️ icon,
   * or on arrival from the "Garden restored" letter. The valley itself decides
   * locked preview vs. world (isFrostedValleyUnlocked). Its art loads on first
   * open, so a soft veil shows right away until the valley's first frame.
   */
  private openFrostedValley(veilText: string, instant = false): void {
    // Frosted Valley plays the same soundtrack as Dream Garden (one music
    // system; startMusic is idempotent, so a theme already playing just continues)
    audio.startMusic();
    // While the valley is open the menu must not take input — otherwise a tap
    // on empty snow falls through to the Continue/New Garden buttons underneath.
    this.input.enabled = false;

    const W = this.scale.width;
    const H = this.scale.height;
    const veil = this.add.container(0, 0).setDepth(10000).setAlpha(instant ? 1 : 0);
    veil.add(this.add.rectangle(0, 0, W, H, 0x14182c, 0.88).setOrigin(0, 0));
    veil.add(this.add.text(W / 2, H / 2, `❄️  ${veilText}`, { ...bodyStyle(22, "#eef3fb"), align: "center" }).setOrigin(0.5));
    // cached art opens in a frame or two — only fade the veil in if it's a real wait
    if (!instant) this.tweens.add({ targets: veil, alpha: 1, delay: 120, duration: 220 });

    const valley = this.scene.get("FrostedValley");
    valley.events.once(Phaser.Scenes.Events.CREATE, () => veil.destroy());
    valley.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (veil.active) veil.destroy();
      if (this.sys.isActive()) this.input.enabled = true;
    });
    this.scene.launch("FrostedValley");
  }

  /** Frosted Valley's start screen (FrostedMenuScene) — Continue / Start New Garden — over this menu. */
  private openValleyMenu(): void {
    this.input.enabled = false;
    const data: FrostedMenuData = {
      onEnter: () => this.openFrostedValley("Loading Frosted Valley…"),
      onBack: () => {
        if (this.sys.isActive()) this.input.enabled = true;
      },
    };
    this.scene.launch("FrostedMenu", data);
  }

  private relayout(): void {
    this.scene.restart();
  }

  private confirmNew(): void {
    confirmModal(this, {
      title: "Start a new garden?",
      body: "Your current garden progress will be erased for good.",
      confirmLabel: "Start New Garden",
      onConfirm: () => {
        resetGarden();
        this.enter(true);
      },
    });
  }

  /** Route into the game: a fresh garden sees the intro; returning players skip it. */
  private enter(forceIntro: boolean): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.relayout, this);
    const fresh = !save.state.introSeen || !save.state.openingGardenTourSeen;
    if (forceIntro || fresh) {
      this.scene.start("Intro");
    } else {
      this.scene.start("Garden");
      this.scene.launch("UI");
    }
  }
}
