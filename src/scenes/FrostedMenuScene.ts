import Phaser from "phaser";
import { FONT_FAMILY, bodyStyle } from "../ui/theme";
import { Button } from "../ui/Button";
import { confirmModal } from "../ui/Modal";
import { makeIconButton } from "../ui/hit";
import { safeInsets } from "../util/safeArea";
import { hasFrostedProgress, resetFrostedValley } from "../game/services";
import { audio } from "../audio/AudioManager";

export interface FrostedMenuData {
  /** Go into the valley (Continue, or right after Start New Garden). */
  onEnter: () => void;
  /** Back to the main menu without entering. */
  onBack: () => void;
}

/** The painted valley pieces this screen is dressed with (loaded here too, so it never depends on having visited). */
const ART: Array<[string, string]> = [
  ["fv_glade_ground", "assets/frosted/fv_glade_ground.jpg"],
  ["fv_cottage_a", "assets/frosted/fv_cottage_a.png"],
  ["fv_pine_b", "assets/frosted/fv_pine_b.png"],
  ["fv_pine_c", "assets/frosted/fv_pine_c.png"],
  ["fv_lamppost", "assets/frosted/fv_lamppost.png"],
  ["fv_rabbit", "assets/frosted/fv_rabbit.png"],
];

/**
 * Frosted Valley's own start screen, shown from the main menu's ❄️ once the
 * valley is unlocked (Dream Garden complete). The same choice — and the same
 * rules — as MenuScene's: Continue when there's a valley to continue, and
 * Start New Garden (confirmed) to begin this world again. Only Frosted
 * Valley's own save is reset — see SaveService.resetFrostedValley.
 */
export class FrostedMenuScene extends Phaser.Scene {
  private cb!: FrostedMenuData;

  constructor() {
    super("FrostedMenu");
  }

  init(data: FrostedMenuData): void {
    this.cb = data;
  }

  preload(): void {
    for (const [key, url] of ART) if (!this.textures.exists(key)) this.load.image(key, url);
  }

  create(): void {
    this.registry.set("pointerOnUI", true);
    const W = this.scale.width;
    const H = this.scale.height;
    const inset = safeInsets();
    const art = (key: string, x: number, y: number, height: number, flip = false) => {
      const img = this.add.image(x, y, key).setOrigin(0.5, 1).setFlipX(flip);
      img.setScale(height / img.height);
      return img;
    };

    // painted valley ground, cooled into a winter dusk
    const ground = this.add.image(W / 2, H / 2, "fv_glade_ground");
    ground.setScale(Math.max(W / ground.width, H / ground.height) * 1.05);
    this.add.rectangle(0, 0, W, H, 0x1d3553, 0.35).setOrigin(0, 0);
    for (const side of [-1, 1]) {
      art("fv_pine_c", W / 2 + side * W * 0.42, H * 0.78, H * 0.62, side > 0);
      art("fv_pine_b", W / 2 + side * W * 0.3, H * 0.98, H * 0.5, side < 0);
    }
    art("fv_cottage_a", W * 0.7, H * 0.62, H * 0.3);
    art("fv_lamppost", W * 0.33, H * 0.7, H * 0.26);
    art("fv_rabbit", W * 0.25, H * 0.97, H * 0.17);

    // an icy sign, the frosty twin of the garden's wooden one
    const sign = this.add.graphics();
    const sw = Math.min(530, W - 36);
    const sy = H * 0.2;
    sign.fillStyle(0x3d6a8f).fillRoundedRect(W / 2 - sw / 2, sy - 44, sw, 93, 28);
    sign.fillStyle(0xa9d4ec).fillRoundedRect(W / 2 - sw / 2 + 5, sy - 43, sw - 10, 80, 24);
    sign.lineStyle(2, 0xffffff, 0.75).strokeRoundedRect(W / 2 - sw / 2 + 10, sy - 37, sw - 20, 68, 20);
    this.add
      .text(W / 2, sy, "Frosted Valley", {
        fontFamily: FONT_FAMILY,
        fontStyle: "700",
        fontSize: `${Math.min(58, W * 0.115)}px`,
        color: "#ffffff",
      })
      .setOrigin(0.5)
      .setShadow(0, 3, "rgba(30,60,100,0.35)", 6);
    this.add.text(W / 2, sy + 65, "a snowy valley waiting to wake up", bodyStyle(Math.min(21, W * 0.044), "#eef8ff")).setOrigin(0.5);

    const resume = hasFrostedProgress();
    const primaryW = Math.min(360, W - 96);
    new Button(this, W / 2, H * 0.66, {
      width: primaryW,
      height: Math.min(90, H * 0.12),
      label: resume ? "Continue" : "Start New Garden",
      fontSize: 34,
      onClick: () => this.enter(),
    }).startPulse();

    // secondary — only when there is a valley to erase
    if (resume) {
      new Button(this, W / 2, H * 0.66 + Math.min(108, H * 0.15), {
        width: primaryW,
        height: Math.min(72, H * 0.1),
        label: "Start New Garden",
        variant: "cream",
        fontSize: 24,
        onClick: () => this.confirmNew(),
      });
    }

    makeIconButton(
      this,
      inset.left + 30,
      inset.top + 32,
      "‹",
      40,
      () => {
        audio.playSfx("ui_click");
        this.leave(this.cb.onBack);
      },
      { hitW: 56, hitH: 56, color: "#2f5577" },
    );
  }

  private confirmNew(): void {
    confirmModal(this, {
      title: "Start a new Frosted Valley?",
      body: "Your Frosted Valley progress will be erased for good.\nYour Dream Garden and your coins stay safe.",
      confirmLabel: "Start New Garden",
      onConfirm: () => {
        resetFrostedValley();
        this.enter();
      },
    });
  }

  private enter(): void {
    this.leave(this.cb.onEnter);
  }

  private leave(then: () => void): void {
    this.registry.set("pointerOnUI", false);
    this.scene.stop();
    then();
  }
}
