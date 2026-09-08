import Phaser from "phaser";

/** Minimum comfortable touch target (CSS px). */
export const MIN_HIT = 48;

/**
 * Make an object forgiving to tap: a rectangular hit area at least `MIN_HIT` on
 * each side, padded `pad` px beyond the visual bounds, hand cursor on desktop, and
 * the shared `pointerOnUI` flag so the world camera never pans from a UI press.
 */
export function attachHit(
  scene: Phaser.Scene,
  obj: Phaser.GameObjects.GameObject & {
    setInteractive: (
      hitArea?: unknown,
      callback?: unknown,
      dropZone?: boolean,
    ) => Phaser.GameObjects.GameObject;
    on: (event: string, fn: () => void) => unknown;
  },
  visW: number,
  visH: number,
  opts: { pad?: number; onTap?: () => void; feedbackTarget?: Phaser.GameObjects.GameObject } = {},
): void {
  const pad = opts.pad ?? 12;
  const w = Math.max(MIN_HIT, visW + pad * 2);
  const h = Math.max(MIN_HIT, visH + pad * 2);
  // Containers (and origin-0.5 objects) offset the hit test by displayOrigin
  // (= size * 0.5), so size the object to the hit rect and anchor it at (0,0):
  // that centres the hit area on the object instead of shifting it up-left.
  (obj as unknown as { setSize?: (w: number, h: number) => unknown }).setSize?.(w, h);
  obj.setInteractive(
    new Phaser.Geom.Rectangle(0, 0, w, h),
    Phaser.Geom.Rectangle.Contains,
    false,
  );
  (obj as unknown as { input: Phaser.Types.Input.InteractiveObject }).input.cursor = "pointer";

  obj.on("pointerover", () => scene.registry.set("pointerOnUI", true));
  obj.on("pointerout", () => scene.registry.set("pointerOnUI", false));

  if (opts.onTap) {
    const fb = opts.feedbackTarget ?? (obj as unknown as Phaser.GameObjects.GameObject);
    obj.on("pointerdown", () => {
      scene.registry.set("pointerOnUI", true);
      scene.tweens.add({ targets: fb, scale: 0.9, duration: 80 });
    });
    obj.on("pointerup", () => {
      scene.registry.set("pointerOnUI", false);
      scene.tweens.add({
        targets: fb,
        scale: 1,
        duration: 150,
        ease: "Back.easeOut",
        onComplete: () => opts.onTap?.(),
      });
    });
    obj.on("pointerupoutside", () => {
      scene.registry.set("pointerOnUI", false);
      scene.tweens.add({ targets: fb, scale: 1, duration: 150 });
    });
  }
}

/**
 * A generous icon/glyph button: a transparent hit zone (>= MIN_HIT) with a text
 * glyph drawn on top. The WHOLE zone responds, not just the glyph pixels.
 */
export function makeIconButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  glyph: string,
  fontSize: number,
  onTap: () => void,
  opts: { color?: string; hitW?: number; hitH?: number } = {},
): Phaser.GameObjects.Container {
  const hitH = Math.max(MIN_HIT, opts.hitH ?? fontSize + 24);
  const hitW = Math.max(MIN_HIT, opts.hitW ?? fontSize + 24);
  const c = scene.add.container(x, y);
  const zone = scene.add.rectangle(0, 0, hitW, hitH, 0xffffff, 0.001).setOrigin(0.5);
  const t = scene.add
    .text(0, 0, glyph, {
      fontFamily: '"Baloo 2", system-ui, sans-serif',
      fontStyle: "700",
      fontSize: `${fontSize}px`,
      color: opts.color ?? "#5b4636",
    })
    .setOrigin(0.5)
    .setShadow(0, 2, "rgba(255,255,255,0.5)", 2);
  c.add([zone, t]);
  c.setSize(hitW, hitH);
  attachHit(scene, c as unknown as Parameters<typeof attachHit>[1], hitW - 8, hitH - 8, {
    pad: 4,
    onTap,
    feedbackTarget: t,
  });
  return c;
}
