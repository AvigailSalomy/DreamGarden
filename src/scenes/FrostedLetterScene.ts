import Phaser from "phaser";
import { bodyStyle, titleStyle, COLORS } from "../ui/theme";
import { makePanel } from "../ui/Panel";
import { makeIconButton } from "../ui/hit";
import { safeInsets } from "../util/safeArea";
import { frostedProgression } from "../game/services";
import { FROSTED_CATALOG } from "../data/frostedValley";
import { Sfx } from "../fx/Sfx";
import { sparkleBurst } from "../fx/Particles";

interface FrostedLetterInit {
  animalId: string;
}

/**
 * Frosted Valley's own letter presentation — the SAME proven flow as Garden's
 * LetterScene (envelope → tap → seal breaks → paper slides up → note fades in
 * → button → done), reimplemented with winter theming instead of Garden's
 * envelope/letter_paper art, since those textures are Garden-specific and
 * this stays fully isolated from that file. No new art needed: the "paper"
 * is the same cream makePanel used everywhere else in Frosted Valley, with a
 * soft icy glow instead of Garden's flower sprites.
 *
 * One letter per animal (letterSeen persisted per-animal in
 * FrostedValleyProgressionService) — the rabbit's doubles as the game's
 * intro letter, per spec.
 */
export class FrostedLetterScene extends Phaser.Scene {
  private animalId!: string;
  private bodyText = "";
  private opened = false;
  private done = false;
  private root!: Phaser.GameObjects.Container;
  private envelope!: Phaser.GameObjects.Container;
  private glow!: Phaser.GameObjects.Arc;
  private tapHint!: Phaser.GameObjects.Text;

  constructor() {
    super("FrostedLetter");
  }

  init(data: FrostedLetterInit): void {
    this.animalId = data.animalId;
    this.opened = false;
    this.done = false;
  }

  create(): void {
    const def = FROSTED_CATALOG.find((a) => a.id === this.animalId);
    if (!def) {
      this.finish();
      return;
    }
    this.bodyText = def.letterBody;
    this.registry.set("pointerOnUI", true);

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const cy = H * 0.46;

    this.root = this.add.container(0, 0).setDepth(50);
    const scrim = this.add.rectangle(0, 0, W, H, 0x0d2333, 0.55).setOrigin(0, 0).setInteractive();
    this.root.add(scrim);

    this.glow = this.add.circle(cx, cy, 140, 0xbfe8ff, 0).setBlendMode(Phaser.BlendModes.ADD);
    this.root.add(this.glow);

    // a simple icy-blue wax-sealed envelope, drawn from primitives — no new art required
    this.envelope = this.add.container(cx, cy - 20).setAlpha(0).setScale(0);
    const envW = 220;
    const envH = 150;
    const body = this.add.graphics();
    body.fillStyle(0xeaf3fb, 1);
    body.fillRoundedRect(-envW / 2, -envH / 2, envW, envH, 12);
    body.lineStyle(3, 0xbcd9ec, 1);
    body.strokeRoundedRect(-envW / 2, -envH / 2, envW, envH, 12);
    body.lineStyle(2, 0xbcd9ec, 0.9);
    body.beginPath();
    body.moveTo(-envW / 2, -envH / 2);
    body.lineTo(0, 6);
    body.lineTo(envW / 2, -envH / 2);
    body.strokePath();
    const seal = this.add.circle(0, 0, 22, 0x5aa9c9, 1);
    const sealEdge = this.add.circle(0, 0, 22, 0xffffff, 0).setStrokeStyle(2, 0xdff3fb, 0.8);
    this.envelope.add([body, seal, sealEdge]);
    this.root.add(this.envelope);

    this.tweens.add({
      targets: this.envelope,
      scale: 1,
      alpha: 1,
      y: cy,
      duration: 380,
      ease: "Back.easeOut",
      onComplete: () => {
        if (this.opened) return;
        this.tweens.add({ targets: this.envelope, y: cy - 8, duration: 1600, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
        this.tweens.add({ targets: this.glow, alpha: 0.3, radius: 170, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      },
    });

    this.tapHint = this.add.text(cx, cy + 130, "tap to open", { ...bodyStyle(16, "#eaf6fb") }).setOrigin(0.5).setAlpha(0.9);
    this.root.add(this.tapHint);

    scrim.on("pointerdown", () => this.open());
    this.envelope.setSize(envW, envH);
    this.envelope.setInteractive(new Phaser.Geom.Rectangle(0, 0, envW, envH), Phaser.Geom.Rectangle.Contains);
    this.envelope.on("pointerdown", () => this.open());

    const inset = safeInsets();
    makeIconButton(this, W - inset.right - 42, inset.top + 26, "Skip ›", 19, () => this.finish(), {
      color: "#fef6e8",
      hitW: 108,
      hitH: 52,
    }).setDepth(60);
  }

  private open(): void {
    if (this.opened || this.done) return;
    this.opened = true;
    Sfx.unlock();
    Sfx.sparkle();

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const cy = H * 0.46;

    this.tweens.killTweensOf(this.envelope);
    this.tweens.killTweensOf(this.glow);
    this.tapHint.setVisible(false);

    sparkleBurst(this, this.envelope.x, this.envelope.y - 6, 14, 40);
    this.cameras.main.shake(120, 0.003);
    this.tweens.add({ targets: this.envelope, angle: { from: -3, to: 3 }, duration: 60, yoyo: true, repeat: 3 });
    this.tweens.add({
      targets: this.envelope,
      scale: this.envelope.scale * 0.55,
      alpha: 0,
      y: this.envelope.y + 26,
      delay: 220,
      duration: 260,
      ease: "Quad.easeIn",
    });
    this.tweens.add({ targets: this.glow, alpha: 0, duration: 260 });

    // stack every element from measured content height, top to bottom — no
    // fixed magic-number positions, so the panel always exactly fits
    // whichever animal's letter (they're not all the same length)
    const panelW = 460;
    const bodyWidth = panelW - 80;
    const gapTop = 34;
    const titleH = 30;
    const gapTitleBody = 22;
    const gapBodyBtn = 32;
    const btnH = 60;
    const gapBtnBottom = 34;

    const note = this.add
      .text(0, 0, this.bodyText, { ...bodyStyle(17, "#5b4636"), align: "center", lineSpacing: 8, wordWrap: { width: bodyWidth } })
      .setOrigin(0.5, 0)
      .setDepth(3)
      .setAlpha(0);
    const bodyH = note.height;

    const panelH = gapTop + titleH + gapTitleBody + bodyH + gapBodyBtn + btnH + gapBtnBottom;
    const panelTopY = cy - panelH / 2;

    const paper = makePanel(this, panelW, panelH, { radius: 24, fill: COLORS.panel });
    paper.setPosition(cx, cy).setAlpha(0).setScale(0.85).setDepth(2);
    this.root.add(paper);
    this.tweens.add({ targets: paper, scale: 1, alpha: 1, delay: 240, duration: 380, ease: "Back.easeOut" });

    const titleY = panelTopY + gapTop + titleH / 2;
    const title = this.add
      .text(cx, titleY, "A Friend Needs Help", { ...titleStyle(22), color: "#2f6b52" })
      .setOrigin(0.5)
      .setDepth(3)
      .setAlpha(0);
    this.root.add(title);
    this.tweens.add({ targets: title, alpha: 1, delay: 460, duration: 300 });

    const bodyY = titleY + titleH / 2 + gapTitleBody;
    note.setPosition(cx, bodyY);
    this.root.add(note);
    this.tweens.add({ targets: note, alpha: 1, delay: 520, duration: 320 });

    const btnY = bodyY + bodyH + gapBodyBtn + btnH / 2;
    const btn = makeIconButton(this, cx, btnY, "Continue", 20, () => this.finish(), {
      hitW: 220,
      hitH: btnH,
      color: "#5b4636",
    });
    btn.setAlpha(0).setDepth(4);
    this.root.add(btn);
    this.tweens.add({ targets: btn, alpha: 1, delay: 620, duration: 300 });
  }

  private finish(): void {
    if (this.done) return;
    this.done = true;
    Sfx.tap();
    frostedProgression.markLetterSeen(this.animalId);
    this.registry.set("pointerOnUI", false);

    const emit = () => {
      this.scene.stop();
      this.scene.resume("FrostedValley");
      this.game.events.emit("frostedLetter:done", { animalId: this.animalId });
    };
    if (this.root) {
      this.tweens.add({ targets: this.root, alpha: 0, duration: 220, onComplete: emit });
    } else {
      emit();
    }
  }
}
