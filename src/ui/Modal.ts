import Phaser from "phaser";
import { bodyStyle, titleStyle } from "./theme";
import { makePanel } from "./Panel";
import { Button } from "./Button";
import { makeIconButton } from "./hit";
import { audio } from "../audio/AudioManager";

interface ConfirmOpts {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
}

/** Full-screen storybook confirm dialog. Blocks input behind it; cleans itself up. */
export function confirmModal(scene: Phaser.Scene, o: ConfirmOpts): void {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const layer = scene.add.container(0, 0).setDepth(99999);
  scene.registry.set("pointerOnUI", true);

  const scrim = scene.add
    .rectangle(0, 0, W, H, 0x241a2e, 0.55)
    .setOrigin(0, 0)
    .setInteractive();
  scrim.on("pointerdown", () => {});
  layer.add(scrim);

  const panelW = Math.min(W - 48, 520);
  const panelH = 300;
  const card = scene.add.container(W / 2, H / 2).setDepth(1);
  card.add(makePanel(scene, panelW, panelH));
  card.add(
    scene.add
      .text(0, -panelH / 2 + 44, o.title, { ...titleStyle(28), align: "center" })
      .setOrigin(0.5),
  );
  card.add(
    scene.add
      .text(0, -18, o.body, {
        ...bodyStyle(18),
        align: "center",
        wordWrap: { width: panelW - 72 },
      })
      .setOrigin(0.5),
  );

  const close = () => {
    scene.registry.set("pointerOnUI", false);
    layer.destroy();
  };

  card.add(
    new Button(scene, -panelW / 4, panelH / 2 - 58, {
      width: panelW / 2 - 28,
      height: 78,
      label: o.cancelLabel ?? "Cancel",
      variant: "cream",
      fontSize: 22,
      onClick: () => {
        audio.playSfx("ui_click");
        o.onCancel?.();
        close();
      },
    }),
  );
  card.add(
    new Button(scene, panelW / 4, panelH / 2 - 58, {
      width: panelW / 2 - 28,
      height: 78,
      label: o.confirmLabel,
      fontSize: 22,
      onClick: () => {
        o.onConfirm();
        close();
      },
    }),
  );

  layer.add(card);
  card.setScale(0.9).setAlpha(0);
  scene.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 220, ease: "Back.easeOut" });
}

interface SettingsOpts {
  onStartNew: () => void;
}

/** Small settings sheet: sound toggle + start-new-garden. */
export function settingsModal(scene: Phaser.Scene, o: SettingsOpts): void {
  const W = scene.scale.width;
  const H = scene.scale.height;
  const layer = scene.add.container(0, 0).setDepth(99998);
  scene.registry.set("pointerOnUI", true);

  const scrim = scene.add
    .rectangle(0, 0, W, H, 0x241a2e, 0.5)
    .setOrigin(0, 0)
    .setInteractive();
  layer.add(scrim);

  const panelW = Math.min(W - 48, 480);
  const panelH = 384;
  const card = scene.add.container(W / 2, H / 2);
  card.add(makePanel(scene, panelW, panelH));
  card.add(
    scene.add.text(0, -panelH / 2 + 42, "Settings", { ...titleStyle(28) }).setOrigin(0.5),
  );

  const close = () => {
    scene.registry.set("pointerOnUI", false);
    layer.destroy();
  };

  const soundBtn = new Button(scene, 0, -76, {
    width: panelW - 80,
    height: 70,
    label: audio.enabled ? "Sound: On" : "Sound: Off",
    variant: "cream",
    fontSize: 22,
    onClick: () => {
      audio.setEnabled(!audio.enabled);
      if (audio.enabled) audio.playSfx("ui_click");
      soundBtn.setLabel(audio.enabled ? "Sound: On" : "Sound: Off");
    },
  });
  card.add(soundBtn);

  const musicLabel = () => (audio.musicEnabled ? "Music: On" : "Music: Off");
  const musicBtn = new Button(scene, 0, 8, {
    width: panelW - 80,
    height: 70,
    label: musicLabel(),
    variant: "cream",
    fontSize: 22,
    onClick: () => {
      audio.setMusicEnabled(!audio.musicEnabled);
      musicBtn.setLabel(musicLabel());
    },
  });
  card.add(musicBtn);

  card.add(
    new Button(scene, 0, 96, {
      width: panelW - 80,
      height: 70,
      label: "Start New Garden",
      fontSize: 22,
      onClick: () => {
        close();
        o.onStartNew();
      },
    }),
  );

  const x = makeIconButton(scene, panelW / 2 - 26, -panelH / 2 + 26, "✕", 22, () => {
    audio.playSfx("ui_click");
    close();
  });
  card.add(x);

  layer.add(card);
  card.setScale(0.9).setAlpha(0);
  scene.tweens.add({ targets: card, scale: 1, alpha: 1, duration: 220, ease: "Back.easeOut" });
}
