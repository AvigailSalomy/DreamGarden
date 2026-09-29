import { Emitter } from "../core/EventBus";
import type { GameEvents } from "../core/events";
import { SaveService } from "../core/SaveService";
import { EconomyService } from "../core/EconomyService";
import { ProgressionService } from "../core/ProgressionService";
import { RequestsService } from "../core/RequestsService";
import { ShopService } from "../core/ShopService";
import { FrostedValleyProgressionService } from "../core/FrostedValleyProgressionService";
import { FrostedShopService } from "../core/FrostedShopService";
import { CATALOG } from "../data/objects";
import { FROSTED_CATALOG } from "../data/frostedValley";
import { FROSTED_SHOP_CATALOG } from "../data/frostedShop";
import { SAVE_KEY } from "./config";

/** `?reset` on the URL wipes the save before anything reads it (handy for demos). */
if (typeof location !== "undefined" && /(?:\?|&)reset\b/.test(location.search)) {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export const bus = new Emitter<GameEvents>();
export const save = new SaveService();
export const economy = new EconomyService(save, bus);
export const progression = new ProgressionService(save, economy, bus, CATALOG);
export const requests = new RequestsService(save, economy, bus, CATALOG);
export const shop = new ShopService(save, economy, progression, bus);
export const frostedProgression = new FrostedValleyProgressionService(save, economy, bus, FROSTED_CATALOG);
export const frostedShop = new FrostedShopService(save, economy, bus, FROSTED_SHOP_CATALOG);

/** True when the player has anything worth continuing (unlocked objects, coins, or a puzzle in progress). */
export function hasProgress(): boolean {
  const s = save.state;
  return (
    s.currentTaskIndex > 0 ||
    s.coins > 0 ||
    Object.values(s.objects).some((o) => o.puzzles_completed > 0 || o.is_unlocked) ||
    Object.values(s.requests).some((ids) => ids.length > 0)
  );
}

/** Wipe DreamGarden progress only — never any other localStorage key. */
export function resetGarden(): void {
  save.reset();
}

/** Persist on the way out — presentation may be mid-animation, truth is already safe. */
if (typeof window !== "undefined") {
  const flush = () => save.saveNow();
  window.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}

/** DEV ONLY: the live service instances, for driving/verifying flows from the browser console. */
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__dgServices = { save, economy, frostedProgression, frostedShop };
}
