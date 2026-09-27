import type { EconomyService } from "../core/EconomyService";
import type { ShopSaveService } from "./ShopSaveService";
import type { AccessoryDef, AnimalCollectionVM, GardenItemDef, GardenItemCategory } from "./types";
import { ANIMAL_COLLECTIONS } from "./data/animalCollections";
import { ALL_ACCESSORIES } from "./data/accessories";
import { ALL_GARDEN_ITEMS } from "./data/gardenItems";

/**
 * The only thing ShopService needs from the main game's progression system —
 * a narrow, duck-typed slice of `ProgressionService`'s real public API. Kept
 * this small on purpose: as long as whatever is passed in exposes this one
 * method, ShopService works, regardless of how that class's internals change
 * during parallel development.
 */
export interface UnlockedAnimalsSource {
  unlockedObjects(): Array<{ id: string }>;
}

export type PurchaseResult =
  | { ok: true }
  | { ok: false; reason: "already_owned" | "insufficient_coins" | "unknown_item" };

export type EquipResult = { ok: true } | { ok: false; reason: "not_owned" | "incompatible" | "unknown_item" };

/**
 * Shop query/mutation API. Reads unlocked-animal state and coins from the
 * main game (read-only — never mutates anything outside `ShopSaveService`'s
 * own store) and owns all purchase/equip logic itself.
 */
export class ShopService {
  constructor(
    private shopSave: ShopSaveService,
    private economy: EconomyService,
    private progression: UnlockedAnimalsSource,
  ) {}

  /* ---------------- lookups ---------------- */

  accessoryDef(id: string): AccessoryDef | undefined {
    return ALL_ACCESSORIES.find((a) => a.id === id);
  }

  gardenItemDef(id: string): GardenItemDef | undefined {
    return ALL_GARDEN_ITEMS.find((g) => g.id === id);
  }

  private itemPrice(itemId: string): number | undefined {
    return this.accessoryDef(itemId)?.price ?? this.gardenItemDef(itemId)?.price;
  }

  gardenItems(category?: GardenItemCategory): GardenItemDef[] {
    return category ? ALL_GARDEN_ITEMS.filter((g) => g.category === category) : ALL_GARDEN_ITEMS;
  }

  /** Every animal collection, cross-referenced against real unlock state. */
  collections(): AnimalCollectionVM[] {
    const unlockedIds = new Set(this.progression.unlockedObjects().map((o) => o.id));
    return ANIMAL_COLLECTIONS.map((def) => ({
      def,
      unlocked: !def.comingSoon && unlockedIds.has(def.animalId),
      equippedAccessoryId: this.shopSave.state.equippedByAnimal[def.animalId] ?? null,
    }));
  }

  /** Resolved accessory defs for a collection — unknown/future-only ids are silently skipped. */
  accessoriesFor(animalId: string): AccessoryDef[] {
    const col = ANIMAL_COLLECTIONS.find((c) => c.animalId === animalId);
    if (!col) return [];
    return col.accessoryIds
      .map((id) => this.accessoryDef(id))
      .filter((a): a is AccessoryDef => !!a);
  }

  /* ---------------- ownership / coins ---------------- */

  isOwned(itemId: string): boolean {
    return !!this.shopSave.state.owned[itemId];
  }

  get coins(): number {
    return this.economy.coins;
  }

  canAfford(itemId: string): boolean {
    const price = this.itemPrice(itemId);
    return price !== undefined && this.economy.canAfford(price);
  }

  /* ---------------- purchase ---------------- */

  purchase(itemId: string): PurchaseResult {
    const price = this.itemPrice(itemId);
    if (price === undefined) return { ok: false, reason: "unknown_item" };
    if (this.isOwned(itemId)) return { ok: false, reason: "already_owned" };
    if (!this.economy.canAfford(price)) return { ok: false, reason: "insufficient_coins" };

    this.economy.spend(price, `shop:${itemId}`);
    this.shopSave.state.owned[itemId] = true;
    this.shopSave.saveNow();
    return { ok: true };
  }

  /* ---------------- equip ---------------- */

  private isCompatible(accessory: AccessoryDef, animalId: string): boolean {
    return accessory.compatibleAnimalIds === "universal" || accessory.compatibleAnimalIds.includes(animalId);
  }

  equip(animalId: string, accessoryId: string): EquipResult {
    const accessory = this.accessoryDef(accessoryId);
    if (!accessory) return { ok: false, reason: "unknown_item" };
    if (!this.isOwned(accessoryId)) return { ok: false, reason: "not_owned" };
    if (!this.isCompatible(accessory, animalId)) return { ok: false, reason: "incompatible" };

    this.shopSave.state.equippedByAnimal[animalId] = accessoryId;
    this.shopSave.saveNow();
    return { ok: true };
  }

  unequip(animalId: string): void {
    this.shopSave.state.equippedByAnimal[animalId] = null;
    this.shopSave.saveNow();
  }

  equippedFor(animalId: string): string | null {
    return this.shopSave.state.equippedByAnimal[animalId] ?? null;
  }
}
