import Phaser from "phaser";
import { COLORS, RADIUS } from "./theme";

export interface PanelOpts {
  radius?: number;
  fill?: number;
  edge?: number;
  shadow?: boolean;
  highlight?: boolean;
}

/**
 * A soft cream "paper" panel drawn with Graphics (rounded, inner edge, drop shadow,
 * top highlight). Returns a Container centred on (0,0); position it yourself.
 */
export function makePanel(
  scene: Phaser.Scene,
  w: number,
  h: number,
  opts: PanelOpts = {},
): Phaser.GameObjects.Container {
  const radius = opts.radius ?? RADIUS.panel;
  const fill = opts.fill ?? COLORS.panel;
  const edge = opts.edge ?? COLORS.panelEdge;
  const c = scene.add.container(0, 0);
  const g = scene.add.graphics();

  if (opts.shadow !== false) {
    g.fillStyle(COLORS.shadow, 0.22);
    g.fillRoundedRect(-w / 2 - 3, -h / 2 + 8, w + 6, h + 10, radius + 4);
  }
  g.fillStyle(edge, 1);
  g.fillRoundedRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6, radius + 3);
  g.fillStyle(fill, 1);
  g.fillRoundedRect(-w / 2, -h / 2, w, h, radius);

  if (opts.highlight !== false) {
    g.fillStyle(0xffffff, 0.35);
    g.fillRoundedRect(-w / 2 + 6, -h / 2 + 6, w - 12, h * 0.32, radius - 6);
  }

  c.add(g);
  return c;
}

/** Fully-round pill (for the coins HUD). */
export function makePill(
  scene: Phaser.Scene,
  w: number,
  h: number,
): Phaser.GameObjects.Container {
  return makePanel(scene, w, h, { radius: h / 2 });
}
