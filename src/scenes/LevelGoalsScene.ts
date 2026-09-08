import Phaser from "phaser";
import { bodyStyle, labelStyle, titleStyle } from "../ui/theme";
import { makePanel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { makeIconButton } from "../ui/hit";
import { requests as requestsService } from "../game/services";
import { hashStr } from "../core/rng";
import { generateLevel } from "../data/minigame";
import { Sfx } from "../fx/Sfx";
import type { LevelDef } from "../data/types";

interface LevelGoalsInit {
  objectId: string;
}

/**
 * Shown before every Catch & Collect round: which item(s), how many, and the
 * coin reward. Launched on top of a paused "Requests"; on Back it just closes
 * back to Requests (Requests was only paused, not stopped).
 */
export class LevelGoalsScene extends Phaser.Scene {
  private objectId!: string;
  private root!: Phaser.GameObjects.Container;
  private closing = false;

  constructor() {
    super("LevelGoals");
  }

  init(data: LevelGoalsInit): void {
    this.objectId = data.objectId;
    this.closing = false;
  }

  create(): void {
    const def = requestsService.def(this.objectId);
    if (!def) {
      this.close();
      return;
    }

    const level = requestsService.minigameLevel(this.objectId);
    const seed = (hashStr(this.objectId) + level * 7919) >>> 0;
    const levelDef: LevelDef = generateLevel(level, def.miniGamePool, seed);

    const W = this.scale.width;
    const H = this.scale.height;
    const cx = W / 2;
    const cy = H / 2;

    this.root = this.add.container(0, 0);
    const veil = this.add.rectangle(0, 0, W, H, 0x2a2036, 0.6).setOrigin(0, 0).setInteractive();
    this.root.add(veil);

    const panelW = Math.min(W - 48, 420);
    const panelH = Math.min(H - 140, 60 + levelDef.goals.length * 76 + 220);
    this.root.add(makePanel(this, panelW, panelH).setPosition(cx, cy));

    let y = cy - panelH / 2 + 46;
    this.root.add(this.add.text(cx, y, `LEVEL ${levelDef.level}`, titleStyle(26)).setOrigin(0.5));
    y += 40;
    this.root.add(this.add.text(cx, y, "GOALS", labelStyle(18, "#7a6350")).setOrigin(0.5));
    y += 44;

    for (const goal of levelDef.goals) {
      const item = def.miniGamePool.find((i) => i.id === goal.itemId);
      if (!item) continue;
      const rowY = y;
      this.root.add(this.add.image(cx - 56, rowY, item.icon).setDisplaySize(48, 48));
      this.root.add(
        this.add.text(cx - 20, rowY, `× ${goal.target}`, titleStyle(28)).setOrigin(0, 0.5),
      );
      y += 68;
    }

    y += 8;
    this.root.add(this.add.image(cx - 44, y, "coin").setDisplaySize(28, 28));
    this.root.add(
      this.add.text(cx - 22, y, `Reward: +${levelDef.reward} Coins`, bodyStyle(17)).setOrigin(0, 0.5),
    );
    y += 60;

    const playBtn = new Button(this, cx, y, {
      width: Math.min(panelW - 60, 220),
      height: 64,
      label: "PLAY",
      fontSize: 26,
      onClick: () => this.play(levelDef),
    });
    playBtn.startPulse();
    this.root.add(playBtn);

    this.root.add(
      makeIconButton(this, cx - panelW / 2 + 30, cy - panelH / 2 + 28, "‹", 26, () => this.close(), {
        color: "#5b4636",
      }),
    );

    this.root.setAlpha(0);
    this.tweens.add({ targets: this.root, alpha: 1, duration: 200 });
  }

  private play(levelDef: LevelDef): void {
    if (this.closing) return;
    this.closing = true;
    Sfx.tap();
    this.scene.launch("CatchCollect", { objectId: this.objectId, level: levelDef });
    this.scene.stop();
  }

  private close(): void {
    if (this.closing) return;
    this.closing = true;
    Sfx.tap();
    this.tweens.add({
      targets: this.root,
      alpha: 0,
      duration: 180,
      onComplete: () => {
        this.scene.resume("Requests");
        this.scene.stop();
      },
    });
  }
}
