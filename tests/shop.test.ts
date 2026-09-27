import { beforeEach, describe, expect, it } from "vitest";
import { Emitter } from "../src/core/EventBus";
import type { GameEvents } from "../src/core/events";
import { SaveService } from "../src/core/SaveService";
import { EconomyService } from "../src/core/EconomyService";
import { ProgressionService } from "../src/core/ProgressionService";
import { CATALOG } from "../src/data/objects";
import { ShopSaveService } from "../src/shop/ShopSaveService";
import { ShopService } from "../src/shop/ShopService";
import { UNIVERSAL_ACCESSORIES, ANIMAL_SPECIFIC_ACCESSORIES } from "../src/shop/data/accessories";
import { ANIMAL_COLLECTIONS } from "../src/shop/data/animalCollections";
import { MYSTERY_SEED } from "../src/shop/data/gardenItems";

const SAVE_KEY = "dreamgarden.save.shoptest";
const SHOP_KEY = "dreamgarden.shop.shoptest";

/** Real progression stack (same pattern as tests/requestsService.test.ts) — this
 *  exercises ShopService against the actual `unlockedObjects()` implementation,
 *  not a hand-rolled fake, so the "unlockedAnimals -> availableShopCollections"
 *  requirement is genuinely proven, not assumed. */
function makeStack() {
  const bus = new Emitter<GameEvents>();
  const save = new SaveService(SAVE_KEY);
  save.reset();
  const economy = new EconomyService(save, bus);
  const progression = new ProgressionService(save, economy, bus, CATALOG);
  const shopSave = new ShopSaveService(SHOP_KEY);
  shopSave.reset();
  const shop = new ShopService(shopSave, economy, progression);
  return { bus, save, economy, progression, shopSave, shop };
}

beforeEach(() => localStorage.clear());

describe("ShopService — animal collections derive from real progression state", () => {
  it("no animal is unlocked on a fresh game", () => {
    const { shop } = makeStack();
    const cols = shop.collections();
    const rabbit = cols.find((c) => c.def.animalId === "rabbit")!;
    const bird = cols.find((c) => c.def.animalId === "bird")!;
    expect(rabbit.unlocked).toBe(false);
    expect(bird.unlocked).toBe(false);
  });

  it("unlocking rabbit's puzzle flips its collection to unlocked, others stay locked", () => {
    const { shop, progression } = makeStack();
    progression.recordPuzzleCompletion("rabbit");
    const cols = shop.collections();
    expect(cols.find((c) => c.def.animalId === "rabbit")!.unlocked).toBe(true);
    expect(cols.find((c) => c.def.animalId === "bird")!.unlocked).toBe(false);
  });

  it("comingSoon collections (no matching catalog entry) never resolve as unlocked", () => {
    const { shop, progression } = makeStack();
    progression.recordPuzzleCompletion("rabbit");
    progression.recordPuzzleCompletion("wildflowers");
    progression.recordPuzzleCompletion("bird");
    const cols = shop.collections();
    for (const id of ["squirrel", "hedgehog", "bear"]) {
      const col = cols.find((c) => c.def.animalId === id)!;
      expect(col).toBeDefined();
      expect(col.def.comingSoon).toBe(true);
      expect(col.unlocked).toBe(false);
    }
  });

  it("is not hardcoded to Rabbit — every catalog animal category entry gets a real collection row", () => {
    const animalIds = CATALOG.filter((o) => o.category === "animal").map((o) => o.id);
    for (const id of animalIds) {
      expect(ANIMAL_COLLECTIONS.some((c) => c.animalId === id)).toBe(true);
    }
  });
});

describe("ShopService — purchase", () => {
  it("purchase deducts coins and marks the item owned", () => {
    const { shop, economy } = makeStack();
    economy.add(1000, "test-topup");
    const item = UNIVERSAL_ACCESSORIES[0];
    const before = economy.coins;
    const res = shop.purchase(item.id);
    expect(res).toEqual({ ok: true });
    expect(economy.coins).toBe(before - item.price);
    expect(shop.isOwned(item.id)).toBe(true);
  });

  it("blocks a purchase without enough coins", () => {
    const { shop } = makeStack();
    const expensive = ANIMAL_SPECIFIC_ACCESSORIES.find((a) => a.id === "carrot_backpack")!;
    const res = shop.purchase(expensive.id);
    expect(res).toEqual({ ok: false, reason: "insufficient_coins" });
    expect(shop.isOwned(expensive.id)).toBe(false);
  });

  it("blocks purchasing the same item twice", () => {
    const { shop, economy } = makeStack();
    economy.add(1000, "test-topup");
    const item = UNIVERSAL_ACCESSORIES[0];
    shop.purchase(item.id);
    const coinsAfterFirst = economy.coins;
    const res = shop.purchase(item.id);
    expect(res).toEqual({ ok: false, reason: "already_owned" });
    expect(economy.coins).toBe(coinsAfterFirst);
  });

  it("rejects an unknown item id", () => {
    const { shop } = makeStack();
    expect(shop.purchase("not-a-real-item")).toEqual({ ok: false, reason: "unknown_item" });
  });

  it("persists ownership immediately, independent of the main save", () => {
    const { shop, economy } = makeStack();
    economy.add(1000, "test-topup");
    const item = MYSTERY_SEED;
    shop.purchase(item.id);

    const reloadedShop = new ShopSaveService(SHOP_KEY);
    expect(reloadedShop.state.owned[item.id]).toBe(true);

    const reloadedMainSave = new SaveService(SAVE_KEY);
    expect((reloadedMainSave.state as unknown as Record<string, unknown>).owned).toBeUndefined();
  });
});

describe("ShopService — equip", () => {
  it("cannot equip an item that isn't owned", () => {
    const { shop } = makeStack();
    const item = UNIVERSAL_ACCESSORIES[0];
    expect(shop.equip("rabbit", item.id)).toEqual({ ok: false, reason: "not_owned" });
  });

  it("buy -> own -> equip -> equippedFor reflects it", () => {
    const { shop, economy } = makeStack();
    economy.add(1000, "test-topup");
    const item = UNIVERSAL_ACCESSORIES[0];
    shop.purchase(item.id);
    const res = shop.equip("rabbit", item.id);
    expect(res).toEqual({ ok: true });
    expect(shop.equippedFor("rabbit")).toBe(item.id);
  });

  it("an animal-specific accessory cannot be equipped on an incompatible animal", () => {
    const { shop, economy } = makeStack();
    economy.add(1000, "test-topup");
    const carrotBackpack = ANIMAL_SPECIFIC_ACCESSORIES.find((a) => a.id === "carrot_backpack")!;
    shop.purchase(carrotBackpack.id);
    expect(shop.equip("bird", carrotBackpack.id)).toEqual({ ok: false, reason: "incompatible" });
    expect(shop.equip("rabbit", carrotBackpack.id)).toEqual({ ok: true });
  });

  it("unequip clears the slot", () => {
    const { shop, economy } = makeStack();
    economy.add(1000, "test-topup");
    const item = UNIVERSAL_ACCESSORIES[0];
    shop.purchase(item.id);
    shop.equip("rabbit", item.id);
    shop.unequip("rabbit");
    expect(shop.equippedFor("rabbit")).toBeNull();
  });

  it("equipped state persists across a fresh ShopSaveService instance", () => {
    const { shop, economy } = makeStack();
    economy.add(1000, "test-topup");
    const item = UNIVERSAL_ACCESSORIES[0];
    shop.purchase(item.id);
    shop.equip("rabbit", item.id);

    const reloadedShopSave = new ShopSaveService(SHOP_KEY);
    expect(reloadedShopSave.state.equippedByAnimal.rabbit).toBe(item.id);
  });
});

describe("ShopService — accessoriesFor", () => {
  it("resolves only ids that exist in the accessory catalog (future-collection ids are silently skipped)", () => {
    const { shop } = makeStack();
    const squirrelAccessories = shop.accessoriesFor("squirrel");
    expect(squirrelAccessories).toEqual([]); // none of squirrel's item ids have real defs yet
    const rabbitAccessories = shop.accessoriesFor("rabbit");
    expect(rabbitAccessories.length).toBeGreaterThan(0);
  });
});
