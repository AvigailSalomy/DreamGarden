import { beforeEach, describe, expect, it } from "vitest";
import { Emitter } from "../src/core/EventBus";
import type { GameEvents } from "../src/core/events";
import { SaveService } from "../src/core/SaveService";
import { EconomyService } from "../src/core/EconomyService";
import { FrostedShopService } from "../src/core/FrostedShopService";
import { FROSTED_SHOP_CATALOG } from "../src/data/frostedShop";

const KEY = "dreamgarden.save.frostedshoptest";

function makeStack(startingCoins = 1000) {
  const bus = new Emitter<GameEvents>();
  localStorage.removeItem(KEY); // a fresh slate: SaveService.reset() deliberately keeps Frosted Valley's slices
  const save = new SaveService(KEY);
  save.reset();
  save.state.coins = startingCoins;
  const economy = new EconomyService(save, bus);
  const shop = new FrostedShopService(save, economy, bus, FROSTED_SHOP_CATALOG);
  return { bus, save, economy, shop };
}

beforeEach(() => localStorage.clear());

describe("FrostedShopService — the Winter Market", () => {
  it("catalog covers all four categories with real texture keys and no duplicate ids", () => {
    const ids = new Set(FROSTED_SHOP_CATALOG.map((i) => i.id));
    expect(ids.size).toBe(FROSTED_SHOP_CATALOG.length);
    for (const cat of ["building", "pet", "plant", "decoration"] as const) {
      expect(FROSTED_SHOP_CATALOG.some((i) => i.category === cat)).toBe(true);
    }
    for (const item of FROSTED_SHOP_CATALOG) {
      expect(item.textureKey.startsWith("fv_shop_")).toBe(true);
      expect(item.price).toBeGreaterThan(0);
      expect(item.targetHeight).toBeGreaterThan(0);
    }
  });

  it("confirmPurchasePlacement spends coins and records a placement, only when affordable", () => {
    const { shop, economy } = makeStack(100);
    const item = FROSTED_SHOP_CATALOG.find((i) => i.price <= 100)!;
    const before = economy.coins;

    const placed = shop.confirmPurchasePlacement(item.id, 10, 20, 0);
    expect(placed).not.toBeNull();
    expect(economy.coins).toBe(before - item.price);
    expect(shop.listPlacements()).toHaveLength(1);
    expect(shop.ownedCount(item.id)).toBe(1);
  });

  it("refuses to purchase when the player can't afford it, and never adds a placement", () => {
    const { shop, economy } = makeStack(0);
    const item = FROSTED_SHOP_CATALOG[0];
    const before = economy.coins;

    const placed = shop.confirmPurchasePlacement(item.id, 0, 0, 0);
    expect(placed).toBeNull();
    expect(economy.coins).toBe(before);
    expect(shop.listPlacements()).toHaveLength(0);
  });

  it("refuses an unknown item id without touching coins", () => {
    const { shop, economy } = makeStack(500);
    const before = economy.coins;
    expect(shop.confirmPurchasePlacement("not-a-real-item", 0, 0, 0)).toBeNull();
    expect(economy.coins).toBe(before);
  });

  it("starting placement mode never costs coins — only confirming does", () => {
    // there is no separate "start" call on the service (the scene owns the
    // in-progress ghost state); the guarantee this test protects is that
    // canAfford()/def() — the calls a Shop UI makes while browsing — are
    // pure reads with no side effect on the wallet
    const { shop, economy } = makeStack(50);
    const item = FROSTED_SHOP_CATALOG.find((i) => i.price > 50)!;
    expect(shop.canAfford(item.id)).toBe(false);
    expect(economy.coins).toBe(50);
    expect(shop.def(item.id)?.id).toBe(item.id);
    expect(economy.coins).toBe(50);
  });

  it("movePlacement repositions a placement for free (no coin change)", () => {
    const { shop, economy } = makeStack(1000);
    const item = FROSTED_SHOP_CATALOG[0];
    const placed = shop.confirmPurchasePlacement(item.id, 10, 10, 0)!;
    const coinsAfterBuy = economy.coins;

    const moved = shop.movePlacement(placed.id, 500, 600, 90);
    expect(moved).toBe(true);
    expect(economy.coins).toBe(coinsAfterBuy);
    expect(shop.placement(placed.id)).toMatchObject({ x: 500, y: 600, rotation: 90 });
  });

  it("movePlacement on an unknown id returns false and changes nothing", () => {
    const { shop } = makeStack(1000);
    expect(shop.movePlacement("nope", 1, 2, 3)).toBe(false);
  });

  it("removePlacement deletes it and drops ownedCount, without refunding coins", () => {
    const { shop, economy } = makeStack(1000);
    const item = FROSTED_SHOP_CATALOG[0];
    const placed = shop.confirmPurchasePlacement(item.id, 0, 0, 0)!;
    const coinsAfterBuy = economy.coins;

    expect(shop.removePlacement(placed.id)).toBe(true);
    expect(shop.ownedCount(item.id)).toBe(0);
    expect(shop.listPlacements()).toHaveLength(0);
    expect(economy.coins).toBe(coinsAfterBuy); // no refund — matches "no refunds" simplicity of the design
  });

  it("removePlacement on an already-removed id is a safe no-op (idempotent)", () => {
    const { shop } = makeStack(1000);
    const item = FROSTED_SHOP_CATALOG[0];
    const placed = shop.confirmPurchasePlacement(item.id, 0, 0, 0)!;
    expect(shop.removePlacement(placed.id)).toBe(true);
    expect(shop.removePlacement(placed.id)).toBe(false);
  });

  it("multiple purchases of the same item stack ownedCount correctly", () => {
    const { shop } = makeStack(10000);
    const item = FROSTED_SHOP_CATALOG.find((i) => i.category === "decoration")!;
    shop.confirmPurchasePlacement(item.id, 1, 1, 0);
    shop.confirmPurchasePlacement(item.id, 2, 2, 0);
    shop.confirmPurchasePlacement(item.id, 3, 3, 0);
    expect(shop.ownedCount(item.id)).toBe(3);
    expect(shop.listPlacements().every((p) => p.itemId === item.id)).toBe(true);
  });

  it("persists placements across a fresh SaveService load (reload-safe)", () => {
    const bus = new Emitter<GameEvents>();
    const save1 = new SaveService(KEY);
    save1.reset();
    save1.state.coins = 1000;
    const economy1 = new EconomyService(save1, bus);
    const shop1 = new FrostedShopService(save1, economy1, bus, FROSTED_SHOP_CATALOG);
    const item = FROSTED_SHOP_CATALOG[0];
    const placed = shop1.confirmPurchasePlacement(item.id, 42, 84, 15)!;

    // a brand new stack reading the same underlying save key
    const save2 = new SaveService(KEY);
    const economy2 = new EconomyService(save2, bus);
    const shop2 = new FrostedShopService(save2, economy2, bus, FROSTED_SHOP_CATALOG);
    expect(shop2.listPlacements()).toHaveLength(1);
    expect(shop2.placement(placed.id)).toMatchObject({ itemId: item.id, x: 42, y: 84, rotation: 15 });
    expect(economy2.coins).toBe(1000 - item.price);
  });

  it("buyPetAccessory spends coins once, marks it owned, and equips it on that animal", () => {
    const { shop, economy } = makeStack(1000);
    const item = FROSTED_SHOP_CATALOG.find((i) => i.category === "pet")!;
    const before = economy.coins;

    expect(shop.isPetOwned(item.id)).toBe(false);
    expect(shop.equippedFor("fv_rabbit")).toBeNull();

    const ok = shop.buyPetAccessory("fv_rabbit", item.id);
    expect(ok).toBe(true);
    expect(economy.coins).toBe(before - item.price);
    expect(shop.isPetOwned(item.id)).toBe(true);
    expect(shop.equippedFor("fv_rabbit")).toBe(item.id);
  });

  it("buyPetAccessory refuses on insufficient funds and equips nothing", () => {
    const { shop, economy } = makeStack(0);
    const item = FROSTED_SHOP_CATALOG.find((i) => i.category === "pet")!;
    expect(shop.buyPetAccessory("fv_rabbit", item.id)).toBe(false);
    expect(economy.coins).toBe(0);
    expect(shop.equippedFor("fv_rabbit")).toBeNull();
  });

  it("re-equipping an already-owned pet item on the same or a different animal never charges twice", () => {
    const { shop, economy } = makeStack(1000);
    const item = FROSTED_SHOP_CATALOG.find((i) => i.category === "pet")!;
    shop.buyPetAccessory("fv_rabbit", item.id);
    const afterFirst = economy.coins;

    shop.buyPetAccessory("fv_rabbit", item.id); // re-equip same animal
    shop.buyPetAccessory("fv_fox", item.id); // equip on a different animal too
    expect(economy.coins).toBe(afterFirst); // never charged again
    expect(shop.equippedFor("fv_rabbit")).toBe(item.id);
    expect(shop.equippedFor("fv_fox")).toBe(item.id); // both animals can wear the same owned item
  });

  it("buyPetAccessory refuses a non-pet item id", () => {
    const { shop, economy } = makeStack(1000);
    const building = FROSTED_SHOP_CATALOG.find((i) => i.category === "building")!;
    const before = economy.coins;
    expect(shop.buyPetAccessory("fv_rabbit", building.id)).toBe(false);
    expect(economy.coins).toBe(before);
  });

  it("switching accessories on the same animal just updates the equipped slot", () => {
    const { shop } = makeStack(1000);
    const pets = FROSTED_SHOP_CATALOG.filter((i) => i.category === "pet");
    shop.buyPetAccessory("fv_rabbit", pets[0].id);
    shop.buyPetAccessory("fv_rabbit", pets[1].id);
    expect(shop.equippedFor("fv_rabbit")).toBe(pets[1].id);
    expect(shop.isPetOwned(pets[0].id)).toBe(true); // still owned, just not worn
  });

  it("unequip clears the slot without un-owning the item", () => {
    const { shop } = makeStack(1000);
    const item = FROSTED_SHOP_CATALOG.find((i) => i.category === "pet")!;
    shop.buyPetAccessory("fv_rabbit", item.id);
    shop.unequip("fv_rabbit");
    expect(shop.equippedFor("fv_rabbit")).toBeNull();
    expect(shop.isPetOwned(item.id)).toBe(true);
  });

  it("persists pet ownership and equip state across a fresh SaveService load", () => {
    const bus = new Emitter<GameEvents>();
    const save1 = new SaveService(KEY);
    save1.reset();
    save1.state.coins = 1000;
    const economy1 = new EconomyService(save1, bus);
    const shop1 = new FrostedShopService(save1, economy1, bus, FROSTED_SHOP_CATALOG);
    const item = FROSTED_SHOP_CATALOG.find((i) => i.category === "pet")!;
    shop1.buyPetAccessory("fv_rabbit", item.id);

    const save2 = new SaveService(KEY);
    const economy2 = new EconomyService(save2, bus);
    const shop2 = new FrostedShopService(save2, economy2, bus, FROSTED_SHOP_CATALOG);
    expect(shop2.isPetOwned(item.id)).toBe(true);
    expect(shop2.equippedFor("fv_rabbit")).toBe(item.id);
  });

  it("does not touch Garden or Frosted Valley progression fields", () => {
    const { save, shop } = makeStack(1000);
    const before = JSON.stringify({ objects: save.state.objects, requests: save.state.requests, frostedValley: save.state.frostedValley });
    shop.confirmPurchasePlacement(FROSTED_SHOP_CATALOG[0].id, 0, 0, 0);
    const after = JSON.stringify({ objects: save.state.objects, requests: save.state.requests, frostedValley: save.state.frostedValley });
    expect(after).toBe(before);
  });

  it("affordability boundary: exactly the price, above it → purchasable; one coin below → not, and nothing is charged", () => {
    const price = FROSTED_SHOP_CATALOG.find((i) => i.id === "cabin_small")!.price; // 260
    for (const [coins, ok] of [[price, true], [price + 1, true], [price - 1, false], [100, false]] as const) {
      const { shop, economy } = makeStack(coins);
      expect(shop.canAfford("cabin_small")).toBe(ok);
      const placed = shop.confirmPurchasePlacement("cabin_small", 900, 1800, 0);
      expect(!!placed).toBe(ok);
      expect(economy.coins).toBe(ok ? coins - price : coins);
      expect(shop.listPlacements().length).toBe(ok ? 1 : 0);
    }
  });

  it("owning one copy never makes the next one affordable: 100 coins cannot buy a second 260-coin hut", () => {
    const { shop, economy, save } = makeStack(300);
    expect(shop.confirmPurchasePlacement("cabin_small", 900, 1800, 0)).not.toBeNull();
    save.state.coins = 100;
    expect(shop.ownedCount("cabin_small")).toBe(1);
    expect(shop.canAfford("cabin_small")).toBe(false);
    expect(shop.confirmPurchasePlacement("cabin_small", 1500, 1800, 0)).toBeNull();
    expect(economy.coins).toBe(100);
    expect(shop.listPlacements().length).toBe(1);
  });
});
