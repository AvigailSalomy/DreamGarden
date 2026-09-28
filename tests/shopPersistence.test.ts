import { beforeEach, describe, expect, it } from "vitest";
import { Emitter } from "../src/core/EventBus";
import type { GameEvents } from "../src/core/events";
import { SaveService } from "../src/core/SaveService";
import { EconomyService } from "../src/core/EconomyService";
import { ProgressionService } from "../src/core/ProgressionService";
import { ShopService } from "../src/core/ShopService";
import { CATALOG } from "../src/data/objects";
import { rollDailyItems } from "../src/data/shop";
const key = "dreamgarden.shop.test";
function stack() {
  const save = new SaveService(key), bus = new Emitter<GameEvents>();
  const economy = new EconomyService(save, bus);
  const progression = new ProgressionService(save, economy, bus, CATALOG);
  return { save, economy, shop: new ShopService(save, economy, progression, bus) };
}
beforeEach(() => localStorage.clear());
describe("Shop regression: shared currency and persistent personalization", () => {
  it("keeps six deterministic daily items and purchased inventory after reload", () => {
    const {save, economy, shop} = stack(); economy.add(1000, "test fixture");
    const daily = shop.dailyItems(); expect(daily.length).toBe(6);
    expect(new Set(rollDailyItems("2026-09-28")).size).toBe(6);
    expect(rollDailyItems("2026-09-28")).toEqual(rollDailyItems("2026-09-28"));
    const before = economy.coins;
    expect(shop.buyDecor(daily[0].id).ok).toBe(true);
    expect(shop.buyAccessory("garden_hat").ok).toBe(true);
    const next = stack();
    expect(next.economy.coins).toBe(before - daily[0].cost - 300);
    expect(next.shop.dailyItems()).toEqual(daily);
    expect(next.shop.decorOwnedCount(daily[0].id)).toBe(1);
    expect(next.shop.ownsAccessory("garden_hat")).toBe(true);
    save.saveNow();
  });
  it("replaces a same-slot accessory and persists placements without placing purchases automatically", () => {
    const {save,economy,shop} = stack(); economy.add(2000,"fixture");
    save.state.objects.rabbit = {puzzles_completed:1,is_unlocked:true};
    shop.buyAccessory("garden_hat");shop.buyAccessory("flower_bow");
    expect(shop.equip("rabbit","garden_hat").ok).toBe(true);
    expect(shop.equip("rabbit","flower_bow").ok).toBe(true);
    shop.buyDecor("bench");expect(shop.placedDecor()).toHaveLength(0);
    expect(shop.placeDecor("bench",500,900)).toBeTruthy();
    expect(shop.placeDecor("bench",600,900)).toBeNull();
    const next=stack();expect(next.shop.equippedFor("rabbit")).toEqual({head:"flower_bow"});
    expect(next.shop.placedDecor()).toHaveLength(1);expect(next.shop.decorOwnedCount("bench")).toBe(0);
  });
  it("charges exactly once per gift and cannot spend below zero or duplicate accessory ownership", () => {
    const {save,economy,shop}=stack(); save.state.coins=500;
    const gift=shop.openMysteryGift();expect(gift.ok).toBe(true);expect(gift.reward).toBeTruthy();
    expect(economy.coins).toBe(0);expect(shop.openMysteryGift().ok).toBe(false);
    expect(stack().save.state.shop.mysteryGiftsOpened).toBe(1);
    expect(shop.buyAccessory("magic_crown").ok).toBe(false);
    economy.add(300,"fixture");shop.buyAccessory("garden_hat");
    expect(shop.buyAccessory("garden_hat").ok).toBe(false);expect(economy.coins).toBe(0);
  });
});
