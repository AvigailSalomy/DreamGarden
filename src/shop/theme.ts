import { COLORS } from "../ui/theme";
import type { Rarity } from "./types";

/** Rarity visuals reuse the shared palette wherever it already fits (epic/legendary);
 *  "rare" is the one shop-local addition, kept out of the shared `ui/theme.ts`. */
export const RARITY_COLORS: Record<Rarity, number> = {
  common: COLORS.panelEdge,
  rare: 0x7ea6d8,
  epic: COLORS.magic,
  legendary: COLORS.gold,
};

export const RARITY_LABELS: Record<Rarity, string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};
