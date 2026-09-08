import Phaser from "phaser";
import { DESIGN_HEIGHT, DESIGN_WIDTH } from "../game/config";
import { COLORS, FONT_FAMILY, bodyStyle, labelStyle, titleStyle } from "../ui/theme";
import { makePanel, makePill } from "../ui/Panel";
import { Button } from "../ui/Button";
import { bus, economy, progression } from "../game/services";
import { Sfx } from "../fx/Sfx";

const SAFE_TOP = 22;
const SAFE_SIDE = 24;

export class UIScene extends Phaser.Scene {
  private displayedCoins = 0;
  private revealing = false;

  private coinText!: Phaser.GameObjects.Text;
  private coinPill!: Phaser.GameObjects.Container;

  private card!: Phaser.GameObjects.Container;
  private cardTitle!: Phaser.GameObjects.Text;
  private cardStory!: Phaser.GameObjects.Text;
  private cardThumb!: Phaser.GameObjects.Image;
  private cardThumbQ!: Phaser.GameObjects.Text;
  private pips!: Phaser.GameObjects.Graphics;
  private playBtn!: Button;
  private cardHidden = false;

  private readonly cardW = 690;
  private readonly cardH = 286;
  private get cardRestY(): number {
    return DESIGN_HEIGHT - this.cardH / 2 - 16;
  }

  private offFns: Array<() => void> = [];

  constructor() {
    super("UI");
  }

  create(): void {
    this.displayedCoins = economy.coins;
    this.buildCoinPill();
    this.buildTaskCard();
    this.setTaskFromProgression();
    this.publishCoinTarget();

    this.offFns.push(
      bus.on("coins:changed", ({ total }) => {
        if (!this.revealing) this.animateCoinsTo(total);
      }),
    );
    this.offFns.push(
      bus.on("progress:updated", () => this.drawPips()),
    );
    this.offFns.push(
      bus.on("reveal:done", () => {
        this.revealing = false;
        this.setTaskFromProgression();
        this.showCard();
      }),
    );

    this.scale.on(Phaser.Scale.Events.RESIZE, () => this.publishCoinTarget());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.offFns.forEach((f) => f()));
  }

  /* ---------------- coins ---------------- */

  private buildCoinPill(): void {
    const w = 158;
    const h = 60;
    const cx = SAFE_SIDE + w / 2;
    const cy = SAFE_TOP + h / 2;
    this.coinPill = makePill(this, w, h).setPosition(cx, cy);
    const coin = this.add.image(-w / 2 + 30, 0, "coin").setDisplaySize(40, 40);
    this.coinText = this.add
      .text(6, 0, `${this.displayedCoins}`, labelStyle(26))
      .setOrigin(0, 0.5);
    this.coinPill.add([coin, this.coinText]);
    this.coinPill.setDepth(100);
  }

  private publishCoinTarget(): void {
    const m = this.coinPill.getWorldTransformMatrix();
    this.registry.set("hudCoinScreen", { x: m.tx, y: m.ty });
  }

  private animateCoinsTo(total: number): void {
    const from = this.displayedCoins;
    if (from === total) return;
    const proxy = { v: from };
    this.tweens.add({
      targets: proxy,
      v: total,
      duration: 500,
      ease: "Cubic.easeOut",
      onUpdate: () => {
        this.displayedCoins = Math.round(proxy.v);
        this.coinText.setText(`${this.displayedCoins}`);
      },
      onComplete: () => {
        this.displayedCoins = total;
        this.coinText.setText(`${total}`);
      },
    });
    this.bounceCoinPill();
  }

  private bounceCoinPill(): void {
    this.tweens.add({
      targets: this.coinPill,
      scaleX: 1.12,
      scaleY: 1.12,
      duration: 130,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
  }

  /**
   * Fly coins from a garden world point to the HUD pill, ticking the counter up as
   * they land. Resolves when the counter has reached the true saved total.
   */
  playCoinGain(
    cam: Phaser.Cameras.Scene2D.Camera,
    worldX: number,
    worldY: number,
    amount: number,
  ): Promise<void> {
    const sx = (worldX - cam.scrollX) * cam.zoom;
    const sy = (worldY - cam.scrollY) * cam.zoom;
    const m = this.coinPill.getWorldTransformMatrix();
    const target = { x: m.tx, y: m.ty };
    const total = economy.coins;
    const startDisplay = this.displayedCoins;

    const n = Phaser.Math.Clamp(Math.round(amount / 3), 4, 9);
    Sfx.sparkle();

    return new Promise((resolve) => {
      let landed = 0;
      for (let i = 0; i < n; i++) {
        const c = this.add
          .image(sx + Phaser.Math.Between(-24, 24), sy + Phaser.Math.Between(-16, 16), "coin")
          .setDepth(9500)
          .setDisplaySize(36, 36)
          .setScale(0)
          .setAlpha(0);
        this.tweens.add({
          targets: c,
          scale: 0.56,
          alpha: 1,
          duration: 160,
          delay: i * 55,
          ease: "Back.easeOut",
        });
        this.tweens.add({
          targets: c,
          x: target.x,
          y: target.y,
          duration: 460,
          delay: 180 + i * 55,
          ease: "Cubic.easeIn",
          onComplete: () => {
            c.destroy();
            landed++;
            Sfx.coin();
            this.bounceCoinPill();
            const shown =
              startDisplay + Math.round(((total - startDisplay) * landed) / n);
            this.displayedCoins = shown;
            this.coinText.setText(`${shown}`);
            if (landed === n) {
              this.displayedCoins = total;
              this.coinText.setText(`${total}`);
              resolve();
            }
          },
        });
      }
    });
  }

  /* ---------------- task card ---------------- */

  private buildTaskCard(): void {
    const w = this.cardW;
    const h = this.cardH;
    this.card = this.add.container(DESIGN_WIDTH / 2, this.cardRestY).setDepth(90);

    const panel = makePanel(this, w, h);
    this.card.add(panel);

    // thumbnail (left)
    const thumbR = 68;
    const thumbX = -w / 2 + 92;
    const thumbBg = makePanel(this, thumbR * 2, thumbR * 2, { radius: thumbR, highlight: false });
    thumbBg.setPosition(thumbX, -10);
    this.cardThumb = this.add.image(thumbX, -4, "rabbit").setOrigin(0.5, 0.5).setScale(0.56);
    this.cardThumbQ = this.add
      .text(thumbX, -10, "?", {
        fontFamily: FONT_FAMILY,
        fontStyle: "700",
        fontSize: "52px",
        color: "#fef6e8",
      })
      .setOrigin(0.5);
    this.card.add([thumbBg, this.cardThumb, this.cardThumbQ]);

    // Play (tall pill, right)
    const playW = 176;
    this.playBtn = new Button(this, w / 2 - playW / 2 - 18, -2, {
      width: playW,
      height: 172,
      label: "Play",
      fontSize: 34,
      onClick: () => this.onPlay(),
    });
    this.card.add(this.playBtn);

    // text column (between thumb and Play)
    const textX = thumbX + thumbR + 22;
    const playLeft = w / 2 - playW - 18;
    const wrap = playLeft - textX - 16;
    this.cardTitle = this.add.text(textX, -h / 2 + 24, "", titleStyle(26)).setOrigin(0, 0);
    this.cardStory = this.add
      .text(textX, -h / 2 + 64, "", { ...bodyStyle(16), wordWrap: { width: wrap } })
      .setOrigin(0, 0);
    this.pips = this.add.graphics();
    this.card.add([this.cardTitle, this.cardStory, this.pips]);
  }

  private onPlay(): void {
    const task = progression.currentTask;
    if (!task || this.revealing || progression.isUnlocked(task.id)) return;
    this.hideCard();
    bus.emit("puzzle:start", { objectId: task.id });
  }

  setTaskFromProgression(): void {
    const vm = progression.taskVM();
    if (!vm) {
      this.cardTitle.setText("The garden is waking");
      this.cardStory.setText("More friends are finding their way here. Come back soon.");
      this.cardThumb.setTint(0x4a3f5c).setAlpha(0.25);
      this.cardThumbQ.setAlpha(0.4);
      this.playBtn.setEnabled(false).stopPulse();
      this.drawPips(0, 0);
      return;
    }
    const unlocked = progression.isUnlocked(vm.object.id);
    this.cardTitle.setText(unlocked ? vm.object.name : `Bring back ${shortName(vm.object.name)}`);
    this.cardStory.setText(vm.object.story_text);
    this.cardThumb.setTexture(vm.object.garden_sprite);
    if (unlocked) {
      this.cardThumb.clearTint().setAlpha(1);
      this.cardThumbQ.setAlpha(0);
    } else {
      this.cardThumb.setTint(0x4a3f5c).setAlpha(0.28);
      this.cardThumbQ.setAlpha(0.5);
    }
    this.playBtn.setEnabled(!unlocked && !this.revealing);
    if (!unlocked && !this.revealing) this.playBtn.startPulse();
    else this.playBtn.stopPulse();
    this.drawPips(vm.completed, vm.required);
  }

  private drawPips(completed?: number, required?: number): void {
    const vm = progression.taskVM();
    const done = completed ?? vm?.completed ?? 0;
    const req = required ?? vm?.required ?? 0;
    const g = this.pips;
    g.clear();
    const x0 = -this.cardW / 2 + 152;
    const y = this.cardH / 2 - 38;
    const r = 11;
    const gap = 34;
    for (let i = 0; i < req; i++) {
      const cx = x0 + r + i * gap;
      g.fillStyle(COLORS.shadow, 0.18);
      g.fillCircle(cx, y + 2, r + 1);
      if (i < done) {
        g.fillStyle(COLORS.gold, 1);
        g.fillCircle(cx, y, r);
        g.fillStyle(COLORS.goldLight, 0.9);
        g.fillCircle(cx - 3, y - 3, r * 0.4);
      } else {
        g.fillStyle(COLORS.panelEdge, 1);
        g.fillCircle(cx, y, r);
      }
    }
  }

  /* ---------------- card show/hide + nudge ---------------- */

  hideCard(): void {
    if (this.cardHidden) return;
    this.cardHidden = true;
    this.tweens.add({
      targets: this.card,
      y: DESIGN_HEIGHT + 160,
      duration: 320,
      ease: "Back.easeIn",
    });
  }

  showCard(): void {
    if (!this.cardHidden) return;
    this.cardHidden = false;
    this.tweens.add({
      targets: this.card,
      y: this.cardRestY,
      duration: 380,
      ease: "Back.easeOut",
    });
  }

  setRevealing(v: boolean): void {
    this.revealing = v;
    if (v) {
      this.playBtn.setEnabled(false).stopPulse();
      this.hideCard();
    }
  }

  nudgePlay(): void {
    if (this.cardHidden || this.revealing) return;
    Sfx.tap();
    this.tweens.add({
      targets: this.playBtn,
      scaleX: 1.14,
      scaleY: 1.14,
      duration: 140,
      yoyo: true,
      repeat: 1,
      ease: "Sine.easeInOut",
    });
  }

  /* ---------------- toast ---------------- */

  showToast(text: string): void {
    const t = this.add.container(DESIGN_WIDTH / 2, -60).setDepth(9800);
    const label = this.add.text(0, 0, text, { ...labelStyle(21), align: "center" }).setOrigin(0.5);
    const pad = 28;
    const panel = makePanel(this, label.width + pad * 2, 64, { radius: 32 });
    t.add([panel, label]);
    this.tweens.add({
      targets: t,
      y: SAFE_TOP + 74,
      duration: 420,
      ease: "Back.easeOut",
      hold: 1700,
      yoyo: true,
      onComplete: () => t.destroy(),
    });
  }
}

function shortName(full: string): string {
  return full.split(" ")[0];
}
