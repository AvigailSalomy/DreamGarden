import Phaser from "phaser";
import { COLORS, FONT_FAMILY, bodyStyle, labelStyle, titleStyle } from "../ui/theme";
import { makePanel, makePill } from "../ui/Panel";
import { Button } from "../ui/Button";
import { confirmModal, settingsModal } from "../ui/Modal";
import { safeInsets } from "../util/safeArea";
import { bus, economy, progression, resetGarden } from "../game/services";
import { Sfx } from "../fx/Sfx";

/** Screen-fixed HUD. Its camera never pans or zooms, so it stays put over the garden. */
export class UIScene extends Phaser.Scene {
  private displayedCoins = 0;
  private revealing = false;

  private coinText!: Phaser.GameObjects.Text;
  private coinPill!: Phaser.GameObjects.Container;
  private gear!: Phaser.GameObjects.Text;

  private card!: Phaser.GameObjects.Container;
  private cardTitle!: Phaser.GameObjects.Text;
  private cardStory!: Phaser.GameObjects.Text;
  private cardThumb!: Phaser.GameObjects.Image;
  private cardThumbQ!: Phaser.GameObjects.Text;
  private pips!: Phaser.GameObjects.Graphics;
  private playBtn!: Button;
  private cardHidden = false;

  private cardW = 690;
  /** Compact: title + 2-line story + pips + a full-width Play bar, no dead space.
   *  Same layout for every stage (Nibs, Wildflower, …) — nothing hard-coded. */
  private readonly cardH = 184;
  private thumbSize = 72;

  private offFns: Array<() => void> = [];

  constructor() {
    super("UI");
  }

  create(): void {
    this.displayedCoins = economy.coins;
    this.buildCoinPill();
    this.buildGear();
    this.buildTaskCard();
    this.layout();
    this.setTaskFromProgression();
    this.publishCoinTarget();

    this.offFns.push(
      bus.on("coins:changed", ({ total }) => {
        if (!this.revealing) this.animateCoinsTo(total);
      }),
    );
    this.offFns.push(bus.on("progress:updated", () => this.drawPips()));
    this.offFns.push(bus.on("requests:closed", () => this.setTaskFromProgression()));
    this.offFns.push(
      bus.on("reveal:done", () => {
        this.revealing = false;
        this.setTaskFromProgression();
        this.showCard();
      }),
    );

    this.scale.on(Phaser.Scale.Events.RESIZE, this.layout, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.layout, this);
      this.offFns.forEach((f) => f());
      this.offFns = [];
    });

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__dgUI = {
        play: () => this.onPlay(),
        task: () => progression.currentTask?.id ?? null,
        resetNow: () => {
          resetGarden();
          this.scene.stop("Garden");
          this.scene.stop("Puzzle");
          this.scene.start("Menu");
        },
      };
    }
  }

  /* ---------------- layout ---------------- */

  private get cardRestY(): number {
    const inset = safeInsets();
    return this.scale.height - inset.bottom - this.cardH / 2 - 12;
  }

  private layout(): void {
    const W = this.scale.width;
    const inset = safeInsets();

    const pillW = 158;
    const pillH = 60;
    this.coinPill.setPosition(inset.left + 16 + pillW / 2, inset.top + 10 + pillH / 2);

    this.gear.setPosition(W - inset.right - 24, inset.top + 24);

    this.cardW = Math.min(W - 24, 560);
    this.rebuildCard();
    this.card.setPosition(W / 2, this.cardHidden ? this.scale.height + 200 : this.cardRestY);

    this.publishCoinTarget();
  }

  /* ---------------- coins ---------------- */

  private buildCoinPill(): void {
    const w = 158;
    const h = 60;
    this.coinPill = makePill(this, w, h).setDepth(100);
    const icon = this.add.image(-w / 2 + 30, 0, "coin").setDisplaySize(40, 40);
    this.coinText = this.add.text(6, 0, `${this.displayedCoins}`, labelStyle(26)).setOrigin(0, 0.5);
    this.coinPill.add([icon, this.coinText]);
  }

  private buildGear(): void {
    this.gear = this.add
      .text(0, 0, "⚙", { fontFamily: FONT_FAMILY, fontSize: "32px", color: "#5b4636" })
      .setOrigin(0.5)
      .setDepth(100)
      .setShadow(0, 2, "rgba(255,255,255,0.5)", 2)
      .setInteractive({ useHandCursor: true });
    this.gear.on("pointerover", () => this.registry.set("pointerOnUI", true));
    this.gear.on("pointerout", () => this.registry.set("pointerOnUI", false));
    this.gear.on("pointerdown", () => {
      if (this.revealing) return;
      Sfx.unlock();
      Sfx.tap();
      settingsModal(this, { onStartNew: () => this.confirmNewGarden() });
    });
  }

  private confirmNewGarden(): void {
    confirmModal(this, {
      title: "Start a new garden?",
      body: "Your current garden progress will be erased for good.",
      confirmLabel: "Start New Garden",
      onConfirm: () => {
        resetGarden();
        this.scene.stop("Garden");
        this.scene.stop("Puzzle");
        this.scene.start("Menu");
      },
    });
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

  playCoinGain(
    cam: Phaser.Cameras.Scene2D.Camera,
    worldX: number,
    worldY: number,
    amount: number,
  ): Promise<void> {
    const sx = (worldX - cam.scrollX) * cam.zoom + cam.x;
    const sy = (worldY - cam.scrollY) * cam.zoom + cam.y;
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
            const shown = startDisplay + Math.round(((total - startDisplay) * landed) / n);
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
    this.card = this.add.container(this.scale.width / 2, this.scale.height + 200).setDepth(90);
    this.rebuildCard();
  }

  /* ---- shared compact layout (rebuildCard + drawPips read the same numbers) ---- */
  private get cardMetrics() {
    const w = this.cardW;
    const h = this.cardH;
    const narrow = w < 420;
    const thumbR = narrow ? 30 : 36;
    const pad = 16;
    const thumbX = -w / 2 + pad + thumbR;
    const thumbY = -h / 2 + pad + thumbR;
    const textX = thumbX + thumbR + 16;
    const btnH = narrow ? 54 : 58;
    return {
      w,
      h,
      narrow,
      thumbR,
      thumbX,
      thumbY,
      textX,
      wrap: w / 2 - pad - textX,
      titleY: -h / 2 + 14,
      storyY: -h / 2 + 14 + (narrow ? 26 : 30),
      pipsY: h / 2 - btnH - 24,
      btnY: h / 2 - 12 - btnH / 2,
      btnH,
    };
  }

  /**
   * (Re)draw the card at the current width — compact: a small thumbnail, title +
   * short story, a row of pips, and a full-width Play bar hugging the bottom edge.
   * No dead vertical space; the puzzle/garden stays the visual focus.
   */
  private rebuildCard(): void {
    const prevTitle = this.cardTitle?.text ?? "";
    const prevStory = this.cardStory?.text ?? "";
    this.card.removeAll(true);

    const m = this.cardMetrics;
    this.card.add(makePanel(this, m.w, m.h));

    // the whole card above the Play bar is a tap target
    const zoneH = m.h - m.btnH - 26;
    const cardZone = this.add
      .rectangle(0, -m.h / 2 + zoneH / 2 + 6, m.w, zoneH, 0xffffff, 0.001)
      .setInteractive({ useHandCursor: true });
    cardZone.on("pointerover", () => this.registry.set("pointerOnUI", true));
    cardZone.on("pointerout", () => this.registry.set("pointerOnUI", false));
    cardZone.on("pointerup", () => {
      this.registry.set("pointerOnUI", false);
      this.onPlay();
    });
    this.card.add(cardZone);

    this.thumbSize = m.thumbR * 1.62;
    this.card.add(
      makePanel(this, m.thumbR * 2, m.thumbR * 2, { radius: m.thumbR, highlight: false }).setPosition(m.thumbX, m.thumbY),
    );
    this.cardThumb = this.add
      .image(m.thumbX, m.thumbY + 1, "rabbit")
      .setOrigin(0.5, 0.5)
      .setDisplaySize(this.thumbSize, this.thumbSize);
    this.cardThumbQ = this.add
      .text(m.thumbX, m.thumbY, "?", {
        fontFamily: FONT_FAMILY,
        fontStyle: "700",
        fontSize: `${m.thumbR}px`,
        color: "#fef6e8",
      })
      .setOrigin(0.5);
    this.card.add([this.cardThumb, this.cardThumbQ]);

    this.cardTitle = this.add
      .text(m.textX, m.titleY, prevTitle, {
        ...titleStyle(m.narrow ? 20 : 23),
        wordWrap: { width: m.wrap },
      })
      .setOrigin(0, 0);
    this.cardStory = this.add
      .text(m.textX, m.storyY, prevStory, {
        ...bodyStyle(m.narrow ? 13 : 15),
        wordWrap: { width: m.wrap },
        lineSpacing: -1,
      })
      .setOrigin(0, 0);

    this.pips = this.add.graphics();

    this.playBtn = new Button(this, 0, m.btnY, {
      width: m.w - 40,
      height: m.btnH,
      label: "Play",
      fontSize: m.narrow ? 22 : 25,
      onClick: () => this.onPlay(),
    });

    this.card.add([this.cardTitle, this.cardStory, this.pips, this.playBtn]);
    this.setTaskFromProgression();
  }

  private onPlay(): void {
    const task = progression.currentTask;
    if (!task || this.revealing || progression.isUnlocked(task.id)) return;
    this.hideCard();
    // Always through the Request screen — restoring the habitat is how the
    // puzzle is earned, and once all 3 sources are restored the Request
    // screen's own "ready" state is what launches the puzzle (see
    // HabitatRequestScene.onHelpNow) so the flow reads consistently either
    // way the player reaches it (tapping the animal, or this HUD button).
    bus.emit("habitatRequest:open", { objectId: task.id });
  }

  setTaskFromProgression(): void {
    if (!this.cardTitle) return;
    const vm = progression.taskVM();
    if (!vm) {
      this.cardTitle.setText("Every friend is safe");
      this.cardStory.setText("Your friends are home. Visit them to help restore their habitats.");
      this.cardThumb.setTexture("rabbit").setDisplaySize(this.thumbSize, this.thumbSize).setTint(0x4a3f5c).setAlpha(0.22);
      this.cardThumbQ.setAlpha(0.35);
      this.playBtn.setLabel("Play").setEnabled(false).stopPulse();
      this.drawPips(0, 0);
      return;
    }
    const unlocked = progression.isUnlocked(vm.object.id);
    this.cardTitle.setText(unlocked ? vm.object.name : `Bring back ${shortName(vm.object.name)}`);
    this.cardStory.setText(vm.object.story_text);
    this.cardThumb.setTexture(vm.object.garden_sprite).setDisplaySize(this.thumbSize, this.thumbSize);
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
    this.playBtn.setLabel(unlocked ? "Play" : `Help ${shortName(vm.object.name)}`);
    this.drawPips(vm.completed, vm.required);
  }

  private drawPips(completed?: number, required?: number): void {
    const vm = progression.taskVM();
    const done = completed ?? vm?.completed ?? 0;
    const req = required ?? vm?.required ?? 0;
    const g = this.pips;
    g.clear();
    const m = this.cardMetrics;
    const x0 = m.textX;
    const y = m.pipsY;
    const r = 8;
    const gap = 24;
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
      y: this.scale.height + 220,
      duration: 320,
      ease: "Back.easeIn",
    });
  }

  showCard(): void {
    if (!this.cardHidden) return;
    this.cardHidden = false;
    this.tweens.add({ targets: this.card, y: this.cardRestY, duration: 380, ease: "Back.easeOut" });
  }

  /** Fade the persistent HUD chrome (coin pill, gear) in/out — used by GardenScene's
   *  entry zoom-reveal so the wide "look at this whole place" moment isn't cluttered. */
  setHudVisible(visible: boolean, animate = true): void {
    const targets = [this.coinPill, this.gear];
    this.tweens.killTweensOf(targets);
    if (!animate) {
      targets.forEach((t) => t.setAlpha(visible ? 1 : 0));
      return;
    }
    this.tweens.add({
      targets,
      alpha: visible ? 1 : 0,
      duration: visible ? 320 : 220,
      ease: "Sine.easeInOut",
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
    const inset = safeInsets();
    const t = this.add.container(this.scale.width / 2, -60).setDepth(9800);
    const label = this.add.text(0, 0, text, { ...labelStyle(20), align: "center" }).setOrigin(0.5);
    const pad = 28;
    t.add([makePanel(this, label.width + pad * 2, 62, { radius: 31 }), label]);
    this.tweens.add({
      targets: t,
      y: inset.top + 60,
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
