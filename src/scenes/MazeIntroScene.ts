import Phaser from "phaser";
import { FONT_FAMILY } from "../ui/theme";
import { makePanel } from "../ui/Panel";
import { Button } from "../ui/Button";
import { bus } from "../game/services";
import { RESOURCES } from "../data/resources";
import { audio } from "../audio/AudioManager";

export interface MazeIntroInit {
  objectId: string;
  sourceId: string;
  resourceId: string;
  amount: number;
}

/**
 * The short "Carrot Hunt" pre-maze card (see data/maze.ts + GardenMazeScene —
 * one reusable system for every animal/resource, this screen just presents
 * whichever one was requested from the habitat Request screen's Get/Play).
 */
export class MazeIntroScene extends Phaser.Scene {
  private mi!: MazeIntroInit;
  private closing = false;
  constructor() {
    super("MazeIntro");
  }
  init(data: MazeIntroInit): void {
    this.mi = data;
    this.closing = false;
  }
  create(): void {
    const resource = RESOURCES[this.mi.resourceId];
    if (!resource) {
      this.close();
      return;
    }
    this.add.rectangle(0, 0, this.scale.width, this.scale.height, 0x252b20, 0.7).setOrigin(0).setInteractive();
    const root = this.add.container(this.scale.width / 2, this.scale.height / 2);
    root.setScale(Math.min(1, (this.scale.width - 32) / 560, (this.scale.height - 32) / 560));

    const wood = makePanel(this, 520, 500, { radius: 36, fill: 0xb47b48, edge: 0x754b2e });
    root.add(wood);
    const paper = makePanel(this, 496, 476, { radius: 28, fill: 0xfff3dc, edge: 0xe6c392 });
    root.add(paper);

    for (const [x, flip] of [[-190, false], [190, true]] as const) {
      root.add(this.add.image(x, -168, "dg_flowers_yellow_01").setDisplaySize(92, 74).setFlipX(flip));
    }

    const art = this.add.image(0, -78, resource.icon);
    art.setScale(Math.min(200 / art.width, 160 / art.height));
    root.add(art);
    this.tweens.add({ targets: art, y: { from: -82, to: -74 }, duration: 1400, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    root.add(
      this.add
        .text(0, 40, `${resource.label} Hunt`, {
          fontFamily: FONT_FAMILY,
          fontStyle: "700",
          fontSize: "34px",
          color: "#5b3d22",
        })
        .setOrigin(0.5),
    );
    root.add(
      this.add
        .text(0, 84, `Collect ${this.mi.amount} ${resource.label.toLowerCase()}${this.mi.amount === 1 ? "" : "s"} in the garden maze!`, {
          fontFamily: FONT_FAMILY,
          fontStyle: "500",
          fontSize: "19px",
          color: "#70482e",
          align: "center",
          wordWrap: { width: 440 },
        })
        .setOrigin(0.5),
    );

    const playBtn = new Button(this, 0, 172, {
      width: 260,
      height: 68,
      label: "Play",
      fontSize: 30,
      onClick: () => this.play(),
    });
    playBtn.startPulse();
    root.add(playBtn);

    root.add(
      this.add
        .text(0, 226, "Maybe later", { fontFamily: FONT_FAMILY, fontStyle: "600", fontSize: "16px", color: "#8a6a4a" })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true })
        .on("pointerup", () => this.close()),
    );

    root.setAlpha(0);
    this.tweens.add({ targets: root, alpha: 1, duration: 220 });
    this.cameras.main.fadeIn(200, 36, 26, 46);
  }

  private play(): void {
    if (this.closing) return;
    this.closing = true;
    audio.playSfx("ui_click");
    this.scene.launch("GardenMaze", this.mi);
    this.scene.stop();
  }

  private close(): void {
    if (this.closing) return;
    this.closing = true;
    audio.playSfx("ui_click");
    bus.emit("habitatRequest:open", { objectId: this.mi.objectId });
    this.scene.stop();
  }
}
