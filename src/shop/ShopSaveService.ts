import type { ShopSaveState } from "./types";

export const SHOP_SAVE_KEY = "dreamgarden.shop.v1";
export const SHOP_SAVE_VERSION = 1;

export function freshShopSave(): ShopSaveState {
  return { saveVersion: SHOP_SAVE_VERSION, owned: {}, equippedByAnimal: {} };
}

/** Bring any older/partial blob up to the current shape without losing data. */
export function migrateShopSave(data: unknown): ShopSaveState {
  const base = freshShopSave();
  if (!data || typeof data !== "object") return base;
  const d = data as Partial<ShopSaveState>;
  return {
    saveVersion: SHOP_SAVE_VERSION,
    owned: d.owned && typeof d.owned === "object" ? d.owned : {},
    equippedByAnimal:
      d.equippedByAnimal && typeof d.equippedByAnimal === "object" ? d.equippedByAnimal : {},
  };
}

/**
 * Entirely independent of the main game's `SaveService`/`SAVE_KEY` — its own
 * localStorage key and version, so Shop persistence can never affect (or be
 * affected by) the main save's migration path. Same guarded-read/write shape
 * as `core/SaveService.ts` so private-mode/disabled storage never crashes.
 */
export class ShopSaveService {
  state: ShopSaveState;
  private storageOk = true;

  constructor(private key: string = SHOP_SAVE_KEY) {
    this.state = this.load();
  }

  load(): ShopSaveState {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return freshShopSave();
      return migrateShopSave(JSON.parse(raw));
    } catch {
      this.storageOk = false;
      return freshShopSave();
    }
  }

  saveNow(): void {
    try {
      localStorage.setItem(this.key, JSON.stringify({ ...this.state, saveVersion: SHOP_SAVE_VERSION }));
      this.storageOk = true;
    } catch {
      this.storageOk = false;
    }
  }

  get canPersist(): boolean {
    return this.storageOk;
  }

  reset(): void {
    this.state = freshShopSave();
    this.saveNow();
  }
}
