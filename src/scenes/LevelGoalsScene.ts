import Phaser from "phaser";
import { bodyStyle, labelStyle, titleStyle } from "../ui/theme";
import { makePanel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { makeIconButton } from "../ui/hit";
import { requests as requestsService } from "../game/services";
import { hashStr } from "../core/rng";
import { generateLevel } from "../data/minigame";
import type { LevelDef } from "../data/types";
import { audio } from "../audio/AudioManager";

interface LevelGoalsInit {
  objectId: string;
}

/**
 * Shown before every Bunny Heist round: the level number and the coin reward.
 * Launched on top of a paused "Requests"; on Back it just closes back to
 * Requests (Requests was only paused, not stopped).
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
    const panelH = Math.min(H - 120, 408);
    this.root.add(makePanel(this, panelW, panelH).setPosition(cx, cy));

    let y = cy - panelH / 2 + 42;
    this.root.add(this.add.text(cx, y, `LEVEL ${levelDef.level}`, titleStyle(25)).setOrigin(0.5));
    y += 34;
    this.root.add(this.add.text(cx, y, "BUNNY HEIST", labelStyle(17, "#7a6350")).setOrigin(0.5));
    y += 26;
    this.root.add(
      this.add
        .text(cx, y, "Sneak in, grab loot, and reach the exit before a fox spots you!", {
          ...bodyStyle(14),
          align: "center",
          wordWrap: { width: panelW - 56 },
        })
        .setOrigin(0.5),
    );
    y += 34;

    // compact legend — mirrors the same icons the heist itself uses
    const legend: Array<[string, string, number | undefined]> = [
      ["carrot", "Collect", undefined],
      ["star_special", "Rare", undefined],
      ["carrot", "Golden", 0xffcf3f],
      ["fox", "Fox = danger", undefined],
      ["rock", "Break sight", undefined],
      ["glow", "Exit = safe", 0xffe6a3],
    ];
    const cols = 3;
    const colW = Math.min((panelW - 40) / cols, 118);
    const legendX = cx - (colW * (cols - 1)) / 2;
    legend.forEach(([tex, label, tint], i) => {
      const gx = legendX + (i % cols) * colW;
      const gy = y + Math.floor(i / cols) * 40;
      const im = this.add.image(gx - 30, gy, tex).setDisplaySize(24, 24);
      if (tint !== undefined) im.setTint(tint);
      this.root.add(im);
      this.root.add(this.add.text(gx - 15, gy, label, labelStyle(13, "#5b4636")).setOrigin(0, 0.5));
    });
    y += 40 + 30;

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

    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>).__dgLevelGoals = {
        play: () => this.play(levelDef),
      };
    }
  }

  private play(levelDef: LevelDef): void {
    if (this.closing) return;
    this.closing = true;
    audio.playSfx("ui_click");
    this.scene.launch("BunnyHeist", { objectId: this.objectId, level: levelDef });
    this.scene.stop();
  }

  private close(): void {
    if (this.closing) return;
    this.closing = true;
    audio.playSfx("ui_click");
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
