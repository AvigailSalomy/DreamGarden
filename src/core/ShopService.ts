import { SHOP_ECONOMY } from "../data/economy";
import type { Emitter } from "./EventBus";
import type { GameEvents } from "./events";
import type { SaveService } from "./SaveService";
import type { EconomyService } from "./EconomyService";
import type { ProgressionService } from "./ProgressionService";
import {
  ACCESSORY_CATALOG,
  DECOR_CATALOG,
  DAILY_ITEM_COUNT,
  MYSTERY_GIFT_POOL,
  accessoryItem,
  decorItem,
  rollDailyItems,
  type DecorCatalogItem,
  type MysteryGiftReward,
} from "../data/shop";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Personalization layer: Daily decor rotation, purchase/inventory/placement,
 * animal accessories, and the Mystery Gift. Deliberately separate from
 * ProgressionService/RequestsService (restoration) — see Part Q: nothing
 * here can ever be spent to help rescue an animal, and only a RESCUED animal
 * can be equipped (checked via ProgressionService.isUnlocked).
 */
export class ShopService {
  constructor(
    private save: SaveService,
    private economy: EconomyService,
    private progression: ProgressionService,
    private bus: Emitter<GameEvents>,
  ) {}

  private get s() {
    return this.save.state.shop;
  }

  get isUnlocked(): boolean {
    return this.s.unlocked;
  }

  /** Called once, right after Nibs's (the rabbit's) first rescue — see
   *  GardenScene's Part I hand-off. Idempotent. */
  unlock(): void {
    if (this.s.unlocked) return;
    this.s.unlocked = true;
    this.save.saveNow();
  }

  /** Today's six Daily items — rolled deterministically from the date the
   *  first time it's needed each day, then persisted so reopening the Shop
   *  (or playing later the same day) never rerolls it. */
  dailyItems(): DecorCatalogItem[] {
    const today = todayStr();
    if (this.s.dailyDate !== today || this.s.dailyItemIds.length !== DAILY_ITEM_COUNT) {
      this.s.dailyDate = today;
      this.s.dailyItemIds = rollDailyItems(today);
      this.save.saveNow();
    }
    return this.s.dailyItemIds.map((id) => decorItem(id)).filter((d): d is DecorCatalogItem => !!d);
  }

  decorOwnedCount(itemId: string): number {
    return this.s.decorInventory[itemId] ?? 0;
  }

  buyDecor(itemId: string): { ok: boolean; reason?: string } {
    const item = decorItem(itemId);
    if (!item) return { ok: false, reason: "unknown item" };
    if (!this.economy.spend(item.cost, "shop_decor")) return { ok: false, reason: "cannot afford" };
    this.s.decorInventory[itemId] = (this.s.decorInventory[itemId] ?? 0) + 1;
    this.save.saveNow();
    return { ok: true };
  }

  placedDecor() {
    return this.s.placedDecor;
  }

  /** Commits a placement — call only after GardenScene's placement mode has
   *  validated the position (no overlap with animals/resources/Shop/etc). */
  placeDecor(itemId: string, x: number, y: number): string | null {
    if (this.decorOwnedCount(itemId) <= 0) return null;
    this.s.decorInventory[itemId] -= 1;
    const placementId = `${itemId}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    this.s.placedDecor.push({ placementId, itemId, x, y });
    this.save.saveNow();
    return placementId;
  }

  ownsAccessory(id: string): boolean {
    return this.s.ownedAccessories.includes(id);
  }

  buyAccessory(id: string): { ok: boolean; reason?: string } {
    const item = accessoryItem(id);
    if (!item) return { ok: false, reason: "unknown item" };
    if (this.ownsAccessory(id)) return { ok: false, reason: "already owned" };
    if (!this.economy.spend(item.cost, "shop_accessory")) return { ok: false, reason: "cannot afford" };
    this.s.ownedAccessories.push(id);
    this.save.saveNow();
    return { ok: true };
  }

  /* ---- Puzzle Hints: a consumable, saved with the rest of the Shop state ---- */

  get hintsOwned(): number {
    return this.s.hintsOwned;
  }

  get hintCost(): number {
    return SHOP_ECONOMY.puzzleHint;
  }

  buyHint(): { ok: boolean; reason?: string } {
    if (!this.economy.spend(this.hintCost, "shop_hint")) return { ok: false, reason: "cannot afford" };
    this.s.hintsOwned += 1;
    this.save.saveNow();
    this.bus.emit("hints:changed", { total: this.s.hintsOwned });
    return { ok: true };
  }

  /** Spend exactly one owned hint. False (and no change) when none are left. */
  useHint(): boolean {
    if (this.s.hintsOwned <= 0) return false;
    this.s.hintsOwned -= 1;
    this.save.saveNow();
    this.bus.emit("hints:changed", { total: this.s.hintsOwned });
    return true;
  }

  equippedFor(animalId: string): Record<string, string> {
    return this.s.equippedAccessories[animalId] ?? {};
  }

  /** Equip (or replace the current occupant of that slot). Only a rescued
   *  animal may be equipped — see Part Q. */
  equip(animalId: string, accessoryId: string): { ok: boolean; reason?: string } {
    const item = accessoryItem(accessoryId);
    if (!item) return { ok: false, reason: "unknown item" };
    if (!this.ownsAccessory(accessoryId)) return { ok: false, reason: "not owned" };
    if (!this.progression.isUnlocked(animalId)) return { ok: false, reason: "animal not rescued yet" };
    const slots = this.s.equippedAccessories[animalId] ?? (this.s.equippedAccessories[animalId] = {});
    slots[item.slot] = accessoryId;
    this.save.saveNow();
    this.bus.emit("accessory:changed", { animalId });
    return { ok: true };
  }

  unequip(animalId: string, slot: string): void {
    const slots = this.s.equippedAccessories[animalId];
    if (!slots || !slots[slot]) return;
    delete slots[slot];
    this.save.saveNow();
    this.bus.emit("accessory:changed", { animalId });
  }

  get mysteryGiftCost(): number {
    return SHOP_ECONOMY.mysteryGift;
  }

  /** Purchase + open in one step (the UI shows the closed-gift beat itself;
   *  by the time this resolves the reward is already committed to save). */
  openMysteryGift(): { ok: boolean; reward?: MysteryGiftReward; reason?: string } {
    if (!this.economy.spend(this.mysteryGiftCost, "mystery_gift")) return { ok: false, reason: "cannot afford" };
    const pool = MYSTERY_GIFT_POOL.filter((r) => (r.kind === "accessory" ? !this.ownsAccessory(r.refId) : true));
    const usable = pool.length > 0 ? pool : MYSTERY_GIFT_POOL;
    const totalWeight = usable.reduce((sum, r) => sum + r.weight, 0);
    let roll = Math.random() * totalWeight;
    let reward = usable[usable.length - 1];
    for (const r of usable) {
      if (roll < r.weight) {
        reward = r;
        break;
      }
      roll -= r.weight;
    }
    if (reward.kind === "decor") {
      this.s.decorInventory[reward.refId] = (this.s.decorInventory[reward.refId] ?? 0) + 1;
    } else if (!this.ownsAccessory(reward.refId)) {
      this.s.ownedAccessories.push(reward.refId);
    }
    this.s.mysteryGiftsOpened += 1;
    this.save.saveNow();
    return { ok: true, reward };
  }
}

export { ACCESSORY_CATALOG, DECOR_CATALOG };
