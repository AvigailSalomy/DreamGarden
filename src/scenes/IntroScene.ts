import Phaser from "phaser";
import { bodyStyle, titleStyle } from "../ui/theme";
import { makePanel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { makeIconButton } from "../ui/hit";
import { buildCozyBackdrop } from "../world/cozyBackdrop";
import { safeInsets } from "../util/safeArea";
import { save } from "../game/services";
import { audio } from "../audio/AudioManager";

const LINES = [
  "This garden has been quiet for a very long time.",
  "But its old magic never truly left — it's just scattered, in pieces.",
  "Put the pieces back together, and its friends will find their way home.",
];

/** Short magical-letter intro. Only shown for a fresh garden; always skippable. */
export class IntroScene extends Phaser.Scene {
  private lineObjs: Phaser.GameObjects.Text[] = [];
  private lineTweens: Phaser.Tweens.Tween[] = [];
  private enterBtn!: Button;
  private enterTween?: Phaser.Tweens.Tween;

  constructor() {
    super("Intro");
  }

  /** Tap-anywhere: jump the line reveal straight to "ready to enter". */
  private reveal(): void {
    let changed = false;
    this.lineTweens.forEach((tw, i) => {
      if (tw.isPlaying() || tw.paused || (this.lineObjs[i] && this.lineObjs[i].alpha < 1)) {
        tw.stop();
        this.lineObjs[i].setAlpha(1);
        changed = true;
      }
    });
    if (this.enterBtn && this.enterBtn.alpha < 1) {
      this.enterTween?.stop();
      this.enterBtn.setAlpha(1);
      changed = true;
    }
    if (changed) audio.playSfx("ui_click");
  }

  create(): void {
    buildCozyBackdrop(this);
    const W = this.scale.width;
    const H = this.scale.height;
    const inset = safeInsets();

    // dim + a full-screen tap zone that fast-forwards the line reveal
    const scrim = this.add
      .rectangle(0, 0, W, H, 0x241a2e, 0.32)
      .setOrigin(0, 0)
      .setDepth(0)
      .setInteractive();
    scrim.on("pointerdown", () => this.reveal());

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

    this.lineObjs = LINES.map((text, i) => {
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
    this.lineTweens = this.lineObjs.map((t, i) =>
      this.tweens.add({ targets: t, alpha: 1, y: t.y - 6, delay: 250 + i * 550, duration: 420 }),
    );

    this.enterBtn = new Button(this, 0, panelH / 2 - 62, {
      width: Math.min(320, panelW - 60),
      height: 88,
      label: "Enter the Garden",
      fontSize: 26,
      onClick: () => this.finish(),
    });
    this.enterBtn.setAlpha(0);
    this.enterTween = this.tweens.add({
      targets: this.enterBtn,
      alpha: 1,
      delay: 250 + LINES.length * 550,
      duration: 300,
    });
    card.add(this.enterBtn);

    card.setScale(0.94).setAlpha(0);
    this.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 300, ease: "Back.easeOut" });

    makeIconButton(
      this,
      W - inset.right - 44,
      inset.top + 28,
      "Skip ›",
      20,
      () => this.finish(),
      { color: "#fef6e8", hitW: 110, hitH: 52 },
    ).setDepth(2);

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
    audio.unlock();
    audio.playSfx("ui_click");
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
