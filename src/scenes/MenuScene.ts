import Phaser from "phaser";
import { FONT_FAMILY, bodyStyle } from "../ui/theme";
import { Button } from "../ui/Button";
import { confirmModal, settingsModal } from "../ui/Modal";
import { buildCozyBackdrop } from "../world/cozyBackdrop";
import { safeInsets } from "../util/safeArea";
import { hasProgress, resetGarden, save } from "../game/services";
import { Sfx } from "../fx/Sfx";

/** The opening storybook screen: title, Continue / Start, Settings. */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super("Menu");
  }

  create(): void {
    buildCozyBackdrop(this);

    const W = this.scale.width;
    const H = this.scale.height;
    const inset = safeInsets();
    const resume = hasProgress();

    this.add
      .text(W / 2, H * 0.22, "DreamGarden", {
        fontFamily: FONT_FAMILY,
        fontStyle: "700",
        fontSize: `${Math.min(64, W * 0.122)}px`,
        color: "#5b4636",
      })
      .setOrigin(0.5)
      .setShadow(0, 3, "rgba(70,50,60,0.25)", 6);

    this.add
      .text(W / 2, H * 0.22 + Math.min(52, W * 0.095), "a garden waiting to wake up", {
        ...bodyStyle(Math.min(21, W * 0.044), "#6c5a48"),
      })
      .setOrigin(0.5);

    // primary
    const primaryW = Math.min(360, W - 96);
    new Button(this, W / 2, H * 0.66, {
      width: primaryW,
      height: 104,
      label: resume ? "Continue" : "Start Garden",
      fontSize: 34,
      onClick: () => this.enter(false),
    }).startPulse();

    // secondary — only when there is a garden to erase
    if (resume) {
      new Button(this, W / 2, H * 0.66 + 128, {
        width: primaryW,
        height: 78,
        label: "Start New Garden",
        variant: "cream",
        fontSize: 24,
        onClick: () => this.confirmNew(),
      });
    }

    // settings gear
    const gear = this.add
      .text(W - inset.right - 26, inset.top + 26, "⚙", {
        fontFamily: FONT_FAMILY,
        fontSize: "34px",
        color: "#5b4636",
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    gear.on("pointerdown", () => {
      Sfx.unlock();
      Sfx.tap();
      settingsModal(this, { onStartNew: () => this.confirmNew() });
    });

    this.scale.on(Phaser.Scale.Events.RESIZE, this.relayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off(Phaser.Scale.Events.RESIZE, this.relayout, this),
    );

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

  /** Route into the game: fresh gardens see the intro; returning players skip it. */
  private enter(forceIntro: boolean): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.relayout, this);
    if (forceIntro || !save.state.introSeen) {
      this.scene.start("Intro");
    } else {
      this.scene.start("Garden");
      this.scene.launch("UI");
    }
  }
}
