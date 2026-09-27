/** Central style tokens — mirrors docs/VISUAL_BIBLE.md. */
import Phaser from "phaser";

export const FONT_FAMILY =
  '"Baloo 2", "Trebuchet MS", "Segoe UI Rounded", system-ui, sans-serif';

export const COLORS = {
  skyTop: 0xc9b8e8,
  skyMid: 0xe7cfe4,
  skyLow: 0xffe0cc,
  hillFar: 0xaab7e2,
  hillNear: 0xa9cf9a,
  // richer, less olive-drab than before — matches the new production art's greens
  // (was 0xaeb885); keeps the same "everyday base ground" role.
  grassDull: 0x9cbf7a,
  grassLush: 0x8fc77a,
  dirt: 0xcda887,
  wood: 0xc99a6b,
  woodDark: 0x8f6444,
  panel: 0xfef6e8,
  panelEdge: 0xe7d3af,
  ink: 0x5b4636,
  inkSoft: 0x7a6350,
  gold: 0xf5c24b,
  goldLight: 0xffe6a3,
  goldEdge: 0xd9a43c,
  magic: 0xb98be0,
  sparkle: 0xfffdf5,
  shadow: 0x46323c,
} as const;

export const CSS = {
  ink: "#5b4636",
  inkSoft: "#7a6350",
  cream: "#fef6e8",
  gold: "#f5c24b",
} as const;

export const RADIUS = {
  panel: 26,
  button: 20,
  tile: 14,
} as const;

export function titleStyle(size: number): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT_FAMILY,
    fontSize: `${size}px`,
    fontStyle: "700",
    color: CSS.ink,
  };
}

export function labelStyle(
  size: number,
  color: string = CSS.ink,
): Phaser.Types.GameObjects.Text.TextStyle {
  return { fontFamily: FONT_FAMILY, fontSize: `${size}px`, fontStyle: "600", color };
}

export function bodyStyle(
  size: number,
  color: string = CSS.inkSoft,
): Phaser.Types.GameObjects.Text.TextStyle {
  return {
    fontFamily: FONT_FAMILY,
    fontSize: `${size}px`,
    fontStyle: "500",
    color,
    wordWrap: { width: 0 },
  };
}
