import Phaser from "phaser";
import { COLORS, FONT_FAMILY, bodyStyle, labelStyle, titleStyle } from "../ui/theme";
import { makePanel, makePill } from "../ui/Panel";
import { Button } from "../ui/Button";
import { makeIconButton } from "../ui/hit";
import { safeInsets } from "../util/safeArea";
import { bus, economy, requests as requestsService } from "../game/services";
import { Sfx } from "../fx/Sfx";
import { sparkleBurst } from "../fx/Particles";
import type { RequestDef } from "../data/types";

interface RequestsInit {
  objectId: string;
}

function firstName(full: string): string {
  return full.split(" ")[0];
}

/**
 * The Requests screen: buy every request for the current object (each visibly
 * changes the garden — see GardenScene's `request:purchased` handling) to unlock
 * its puzzle. Launched on top of a paused "Garden", exactly like Puzzle/Letter.
 */
export class RequestsScene extends Phaser.Scene {
  private objectId!: string;
  private root!: Phaser.GameObjects.Container;
  private body!: Phaser.GameObjects.Container;
  private coinText!: Phaser.GameObjects.Text;
  private closing = false;

  constructor() {
    super("Requests");
  }

  init(data: RequestsInit): void {
    this.objectId = data.objectId;
    this.closing = false;
  }

  create(): void {
    const def = requestsService.def(this.objectId);
    if (!def) {
      this.close();
      return;
    }

    const W = this.scale.width;
    const H = this.scale.height;
    const inset = safeInsets();

    this.root = this.add.container(0, 0);
    const veil = this.add.rectangle(0, 0, W, H, 0x2a2036, 0.55).setOrigin(0, 0).setInteractive();
    this.root.add(veil);

    const panelW = Math.min(W - 32, 480);
    const px = W / 2;
    let y = inset.top + 90;

    // header: portrait + title
    const portraitR = 40;
    const portraitX = px - panelW / 2 + portraitR + 4;
    this.root.add(
      makePanel(this, portraitR * 2, portraitR * 2, { radius: portraitR, highlight: false }).setPosition(
        portraitX,
        y,
      ),
    );
    this.root.add(
      this.add
        .image(portraitX, y + 2, def.garden_sprite)
        .setDisplaySize(portraitR * 1.5, portraitR * 1.5),
    );
    this.root.add(
      this.add
        .text(portraitX + portraitR + 20, y, `${firstName(def.name)}'s Requests`, {
          ...titleStyle(Math.min(24, panelW * 0.055)),
          wordWrap: { width: panelW - portraitR * 2 - 60 },
        })
        .setOrigin(0, 0.5),
    );

    // coin pill, top-right
    const pillW = 132;
    const pillH = 50;
    const pill = makePill(this, pillW, pillH).setPosition(W - inset.right - pillW / 2 - 16, inset.top + 40);
    pill.add(this.add.image(-pillW / 2 + 26, 0, "coin").setDisplaySize(30, 30));
    this.coinText = this.add.text(0, 0, `${economy.coins}`, labelStyle(20)).setOrigin(0, 0.5);
    pill.add(this.coinText);
    this.root.add(pill);

    // close (X)
    this.root.add(
      makeIconButton(this, W - inset.right - 24, H - inset.bottom - 34, "✕", 20, () => this.close(), {
        color: "#fef6e8",
        hitW: 56,
        hitH: 56,
      }).setDepth(60),
    );

    this.body = this.add.container(0, 0);
    this.root.add(this.body);

    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 220 });
    this.cameras.main.fadeIn(220, 36, 26, 46);

    this.rebuild();

    this.events.on(Phaser.Scenes.Events.RESUME, () => this.rebuild());
    const off = bus.on("coins:changed", () => {
      if (this.coinText) this.coinText.setText(`${economy.coins}`);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__dgRequests = {
        buy: (id: string) => this.buy(requestsService.def(this.objectId)!.requests.find((r) => r.id === id)!),
      };
    }
  }

  /** Redraw the card list + progress bar + complete state from current save truth. */
  private rebuild(): void {
    const def = requestsService.def(this.objectId);
    if (!def) return;
    this.body.removeAll(true);
    this.coinText.setText(`${economy.coins}`);

    const W = this.scale.width;
    const inset = safeInsets();
    const panelW = Math.min(W - 32, 480);
    const px = W / 2;
    let y = inset.top + 150;

    const vm = requestsService.vm(this.objectId)!;

    // progress bar
    const barY = y;
    this.body.add(this.drawProgressBar(px, barY, panelW, vm.completed, vm.total));
    y += 56;

    // request cards
    const sorted = [...def.requests].sort((a, b) => a.order - b.order);
    const cardH = 78;
    for (const req of sorted) {
      this.body.add(this.buildCard(req, px, y, panelW, cardH, vm.purchased.has(req.id)));
      y += cardH + 14;
    }

    y += 6;
    if (vm.isComplete) {
      const glow = this.add
        .image(px, y + 10, "glow")
        .setScale(1.4)
        .setAlpha(0.3)
        .setBlendMode(Phaser.BlendModes.ADD);
      this.tweens.add({ targets: glow, alpha: 0.5, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
      this.body.add(glow);

      this.body.add(
        this.add
          .text(px, y + 10, `Everything is ready for ${firstName(def.name)}!`, {
            ...labelStyle(20),
            align: "center",
            wordWrap: { width: panelW - 40 },
          })
          .setOrigin(0.5),
      );
      y += 54;

      const completeBtn = new Button(this, px, y + 4, {
        width: Math.min(panelW - 20, 320),
        height: 62,
        label: `Complete ${firstName(def.name)}'s Puzzle`,
        fontSize: 20,
        onClick: () => this.completePuzzle(),
      });
      completeBtn.startPulse();
      this.body.add(completeBtn);
    } else {
      this.body.add(
        this.add
          .text(px, y + 4, `${vm.completed}/${vm.total} gathered`, bodyStyle(16))
          .setOrigin(0.5),
      );
    }
  }

  private drawProgressBar(
    cx: number,
    cy: number,
    panelW: number,
    completed: number,
    total: number,
  ): Phaser.GameObjects.Container {
    const c = this.add.container(cx, cy);
    const segW = Math.min(64, (panelW - 40) / Math.max(1, total));
    const gap = 12;
    const totalW = total * segW + (total - 1) * gap;
    const startX = -totalW / 2 + segW / 2;
    const g = this.add.graphics();
    for (let i = 0; i < total; i++) {
      const sx = startX + i * (segW + gap);
      g.fillStyle(COLORS.shadow, 0.16);
      g.fillRoundedRect(sx - segW / 2, -14, segW, 26, 8);
      if (i < completed) {
        g.fillStyle(COLORS.gold, 1);
        g.fillRoundedRect(sx - segW / 2 + 2, -12, segW - 4, 22, 7);
      } else {
        g.fillStyle(COLORS.panelEdge, 1);
        g.fillRoundedRect(sx - segW / 2 + 2, -12, segW - 4, 22, 7);
      }
    }
    c.add(g);
    c.add(
      this.add
        .text(0, 26, `${completed}/${total}`, labelStyle(16))
        .setOrigin(0.5),
    );
    return c;
  }

  private buildCard(
    req: RequestDef,
    cx: number,
    cy: number,
    w: number,
    h: number,
    purchased: boolean,
  ): Phaser.GameObjects.Container {
    const c = this.add.container(cx, cy);
    c.add(makePanel(this, w, h, { highlight: !purchased }));

    const iconR = 26;
    c.add(makePanel(this, iconR * 2, iconR * 2, { radius: iconR, highlight: false }).setPosition(-w / 2 + iconR + 16, 0));
    c.add(this.add.image(-w / 2 + iconR + 16, 0, req.icon).setDisplaySize(iconR * 1.4, iconR * 1.4));

    const textX = -w / 2 + iconR * 2 + 34;
    c.add(this.add.text(textX, -12, req.label, labelStyle(18)).setOrigin(0, 0.5));

    if (purchased) {
      c.add(this.add.text(textX, 14, "Purchased", bodyStyle(14, "#7a6350")).setOrigin(0, 0.5));
      c.add(
        this.add
          .text(w / 2 - 30, 0, "✓", { fontFamily: FONT_FAMILY, fontStyle: "700", fontSize: "26px", color: "#5f9a56" })
          .setOrigin(0.5),
      );
      c.setAlpha(0.72);
      return c;
    }

    c.add(this.add.image(textX + 10, 14, "coin").setDisplaySize(20, 20));
    c.add(this.add.text(textX + 24, 14, `${req.cost}`, bodyStyle(15)).setOrigin(0, 0.5));

    const affordable = economy.canAfford(req.cost);
    const btn = new Button(this, w / 2 - 68, 0, {
      width: 110,
      height: 48,
      label: affordable ? "Buy" : "Earn Coins",
      variant: affordable ? "gold" : "cream",
      fontSize: affordable ? 18 : 14,
      onClick: () => (affordable ? this.buy(req) : this.earnCoins()),
    });
    c.add(btn);
    return c;
  }

  private buy(req: RequestDef): void {
    const res = requestsService.purchase(this.objectId, req.id);
    if (!res.ok) return;
    Sfx.coin();
    sparkleBurst(this, this.scale.width / 2, this.scale.height / 2, 12, 50);
    this.rebuild();
  }

  private earnCoins(): void {
    this.scene.launch("LevelGoals", { objectId: this.objectId });
    this.scene.pause();
  }

  private completePuzzle(): void {
    if (this.closing) return;
    this.closing = true;
    bus.emit("puzzle:start", { objectId: this.objectId });
    this.tweens.add({
      targets: this.root,
      alpha: 0,
      duration: 200,
      onComplete: () => this.scene.stop(),
    });
  }

  private close(): void {
    if (this.closing) return;
    this.closing = true;
    Sfx.tap();
    const finish = () => {
      this.scene.resume("Garden");
      bus.emit("requests:closed", { objectId: this.objectId });
      this.scene.stop();
    };
    if (this.root) {
      this.tweens.add({ targets: this.root, alpha: 0, duration: 200, onComplete: finish });
    } else {
      finish();
    }
  }
}
