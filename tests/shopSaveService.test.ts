import { beforeEach, describe, expect, it } from "vitest";
import { ShopSaveService, freshShopSave, migrateShopSave, SHOP_SAVE_VERSION } from "../src/shop/ShopSaveService";

const KEY = "dreamgarden.shop.savetest";

beforeEach(() => localStorage.clear());

describe("freshShopSave", () => {
  it("has the expected empty shape", () => {
    expect(freshShopSave()).toEqual({ saveVersion: SHOP_SAVE_VERSION, owned: {}, equippedByAnimal: {} });
  });
});

describe("migrateShopSave", () => {
  it("fills in missing fields without dropping known data", () => {
    const m = migrateShopSave({ owned: { bow: true } });
    expect(m.owned).toEqual({ bow: true });
    expect(m.equippedByAnimal).toEqual({});
    expect(m.saveVersion).toBe(SHOP_SAVE_VERSION);
  });

  it("returns a fresh save for junk input", () => {
    expect(migrateShopSave(null)).toEqual(freshShopSave());
    expect(migrateShopSave("nope")).toEqual(freshShopSave());
  });
});

describe("ShopSaveService", () => {
  it("round-trips through localStorage, independent of the main game's save key", () => {
    const a = new ShopSaveService(KEY);
    a.state.owned.crown = true;
    a.state.equippedByAnimal.rabbit = "crown";
    a.saveNow();

    const b = new ShopSaveService(KEY);
    expect(b.state.owned.crown).toBe(true);
    expect(b.state.equippedByAnimal.rabbit).toBe("crown");

    expect(localStorage.getItem("dreamgarden.save.v1")).toBeNull();
  });

  it("recovers from a corrupt blob", () => {
    localStorage.setItem(KEY, "{not json");
    const s = new ShopSaveService(KEY);
    expect(s.state).toEqual(freshShopSave());
  });

  it("reset wipes owned + equipped state", () => {
    const s = new ShopSaveService(KEY);
    s.state.owned.crown = true;
    s.state.equippedByAnimal.rabbit = "crown";
    s.saveNow();

    s.reset();
    expect(s.state).toEqual(freshShopSave());

    const reloaded = new ShopSaveService(KEY);
    expect(reloaded.state).toEqual(freshShopSave());
  });
});
