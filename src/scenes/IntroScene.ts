import Phaser from "phaser";
import { FONT_FAMILY, bodyStyle, titleStyle } from "../ui/theme";
import { makePanel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { buildCozyBackdrop } from "../world/cozyBackdrop";
import { safeInsets } from "../util/safeArea";
import { save } from "../game/services";
import { Sfx } from "../fx/Sfx";

const LINES = [
  "This garden has been quiet for a very long time.",
  "But its old magic never truly left — it's just scattered, in pieces.",
  "Put the pieces back together, and its friends will find their way home.",
];

/** Short magical-letter intro. Only shown for a fresh garden; always skippable. */
export class IntroScene extends Phaser.Scene {
  constructor() {
    super("Intro");
  }

  create(): void {
    buildCozyBackdrop(this);
    const W = this.scale.width;
    const H = this.scale.height;
    const inset = safeInsets();

    this.add.rectangle(0, 0, W, H, 0x241a2e, 0.32).setOrigin(0, 0).setDepth(0);

    const panelW = Math.min(W - 44, 540);
    const panelH = Math.min(H - 220, 470);
    const card = this.add.container(W / 2, H / 2).setDepth(1);
    card.add(makePanel(this, panelW, panelH));
    card.add(
      this.add
        .text(0, -panelH / 2 + 46, "A letter for the new gardener", {
          ...titleStyle(Math.min(26, W * 0.052)),
          align: "center",
          wordWrap: { width: panelW - 64 },
        })
        .setOrigin(0.5),
    );

    const lineObjs = LINES.map((text, i) => {
      const t = this.add
        .text(0, -panelH / 2 + 120 + i * 78, text, {
          ...bodyStyle(Math.min(20, W * 0.042)),
          align: "center",
          wordWrap: { width: panelW - 80 },
        })
        .setOrigin(0.5)
        .setAlpha(0);
      card.add(t);
      return t;
    });
    lineObjs.forEach((t, i) =>
      this.tweens.add({ targets: t, alpha: 1, y: t.y - 6, delay: 250 + i * 550, duration: 420 }),
    );

    const enter = new Button(this, 0, panelH / 2 - 62, {
      width: Math.min(320, panelW - 60),
      height: 88,
      label: "Enter the Garden",
      fontSize: 26,
      onClick: () => this.finish(),
    });
    enter.setAlpha(0);
    this.tweens.add({ targets: enter, alpha: 1, delay: 250 + LINES.length * 550, duration: 300 });
    card.add(enter);

    card.setScale(0.94).setAlpha(0);
    this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 300, ease: "Back.easeOut" });

    const skip = this.add
      .text(W - inset.right - 24, inset.top + 24, "Skip ›", {
        fontFamily: FONT_FAMILY,
        fontStyle: "600",
        fontSize: "20px",
        color: "#fef6e8",
      })
      .setOrigin(1, 0.5)
      .setDepth(2)
      .setInteractive({ useHandCursor: true });
    skip.on("pointerdown", () => this.finish());

    this.scale.on(Phaser.Scale.Events.RESIZE, this.relayout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
      this.scale.off(Phaser.Scale.Events.RESIZE, this.relayout, this),
    );

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__dgIntro = () => this.finish();
    }
  }

  private relayout(): void {
    this.scene.restart();
  }

  private finish(): void {
    Sfx.unlock();
    Sfx.tap();
    this.scale.off(Phaser.Scale.Events.RESIZE, this.relayout, this);
    save.state.introSeen = true;
    save.saveNow();
    this.cameras.main.fadeOut(260, 233, 207, 196);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.start("Garden");
      this.scene.launch("UI");
    });
  }
}
