import type { Emitter } from "./EventBus";
import type { GameEvents } from "./events";
import type { SaveService } from "./SaveService";
import type { EconomyService } from "./EconomyService";
import type { FrostedShopCategory, FrostedShopItemDef, FrostedShopPlacement } from "../data/types";

/**
 * The Winter Market's purchase/placement ledger. Fully isolated from every
 * other Frosted Valley or Garden field (own SaveState slice — see
 * FrostedShopSaveState) and spends from the SAME shared `economy` coin
 * balance the Garden Maze pays into — there is deliberately no second
 * currency or wallet here.
 *
 * A purchase and its placement are committed together, atomically, only once
 * the player CONFIRMS a spot in the world: `confirmPurchasePlacement` spends
 * the coins and records the placement in the same call. Starting placement
 * mode from the Shop UI never touches the wallet — Cancel is always free.
 */
export class FrostedShopService {
  constructor(
    private save: SaveService,
    private economy: EconomyService,
    private bus: Emitter<GameEvents>,
    private catalog: FrostedShopItemDef[],
  ) {}

  private slice() {
    return this.save.state.frostedShop;
  }

  def(itemId: string): FrostedShopItemDef | undefined {
    return this.catalog.find((i) => i.id === itemId);
  }

  itemsByCategory(category: FrostedShopCategory): FrostedShopItemDef[] {
    return this.catalog.filter((i) => i.category === category);
  }

  listPlacements(): FrostedShopPlacement[] {
    return this.slice().placements;
  }

  placement(placementId: string): FrostedShopPlacement | undefined {
    return this.slice().placements.find((p) => p.id === placementId);
  }

  /** How many of this item the player currently has standing in the world. */
  ownedCount(itemId: string): number {
    return this.slice().placements.filter((p) => p.itemId === itemId).length;
  }

  canAfford(itemId: string): boolean {
    const def = this.def(itemId);
    return !!def && this.economy.canAfford(def.price);
  }

  /**
   * Spends the item's price and adds one placement — atomic: a failed spend
   * (insufficient funds, or a stale item id) never adds a placement, and a
   * successful placement is never left unpaid.
   */
  confirmPurchasePlacement(itemId: string, x: number, y: number, rotation: number): FrostedShopPlacement | null {
    const def = this.def(itemId);
    if (!def) return null;
    if (!this.economy.spend(def.price, `frosted:shop:${itemId}`)) return null;

    const placement: FrostedShopPlacement = {
      id: `${itemId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      itemId,
      x,
      y,
      rotation,
    };
    this.slice().placements.push(placement);
    this.save.saveNow();
    this.bus.emit("frosted:shopPurchased", { itemId, placementId: placement.id });
    return placement;
  }

  /** Repositioning an already-owned decoration — free, no economy transaction. */
  movePlacement(placementId: string, x: number, y: number, rotation: number): boolean {
    const p = this.placement(placementId);
    if (!p) return false;
    p.x = x;
    p.y = y;
    p.rotation = rotation;
    this.save.saveNow();
    return true;
  }

  removePlacement(placementId: string): boolean {
    const list = this.slice().placements;
    const idx = list.findIndex((p) => p.id === placementId);
    if (idx === -1) return false;
    const [removed] = list.splice(idx, 1);
    this.save.saveNow();
    this.bus.emit("frosted:shopRemoved", { itemId: removed.itemId, placementId: removed.id });
    return true;
  }

  /* ---------------- pet accessories — worn, not placed in the world ---------------- */

  isPetOwned(itemId: string): boolean {
    return !!this.slice().petOwned[itemId];
  }

  /** The itemId currently worn by this animal, or null if bare. */
  equippedFor(animalId: string): string | null {
    return this.slice().equipped[animalId] ?? null;
  }

  /**
   * Buys a pet accessory and equips it on `animalId` in one atomic step —
   * trying it on (browsing the Shop) never touches the wallet; only this
   * does. Buying an already-owned item just re-equips it for free (no
   * double charge).
   */
  buyPetAccessory(animalId: string, itemId: string): boolean {
    const def = this.def(itemId);
    if (!def || def.category !== "pet") return false;
    if (!this.isPetOwned(itemId)) {
      if (!this.economy.spend(def.price, `frosted:shop:${itemId}`)) return false;
      this.slice().petOwned[itemId] = true;
    }
    this.slice().equipped[animalId] = itemId;
    this.save.saveNow();
    this.bus.emit("frosted:shopPurchased", { itemId, placementId: `equip:${animalId}` });
    return true;
  }

  /** Un-equips whatever this animal is currently wearing (does not un-own it). */
  unequip(animalId: string): void {
    if (this.slice().equipped[animalId] == null) return;
    this.slice().equipped[animalId] = null;
    this.save.saveNow();
  }
}
