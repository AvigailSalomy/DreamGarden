import { beforeEach, describe, expect, it } from "vitest";
import { Emitter } from "../src/core/EventBus";
import type { GameEvents } from "../src/core/events";
import { SaveService } from "../src/core/SaveService";
import { EconomyService } from "../src/core/EconomyService";
import { ProgressionService } from "../src/core/ProgressionService";
import { RequestsService } from "../src/core/RequestsService";
import { CATALOG } from "../src/data/objects";
import { STARTING_COINS } from "../src/game/config";

const KEY = "dreamgarden.save.requeststest";
const rabbit = CATALOG.find((o) => o.id === "rabbit")!;
const [carrotBasket, softHay, cloverPatch] = rabbit.requests;

function makeStack() {
  const bus = new Emitter<GameEvents>();
  const save = new SaveService(KEY);
  save.reset();
  const economy = new EconomyService(save, bus);
  const progression = new ProgressionService(save, economy, bus, CATALOG);
  const requests = new RequestsService(save, economy, bus, CATALOG);
  return { bus, save, economy, progression, requests };
}

beforeEach(() => localStorage.clear());

describe("RequestsService", () => {
  it("fresh game starts with enough coins for the first Rabbit request", () => {
    const { economy } = makeStack();
    expect(economy.coins).toBe(STARTING_COINS);
    expect(STARTING_COINS).toBeGreaterThanOrEqual(carrotBasket.cost);
  });

  it("purchase deducts coins and records the request", () => {
    const { requests, economy } = makeStack();
    const res = requests.purchase("rabbit", carrotBasket.id);
    expect(res.ok).toBe(true);
    expect(economy.coins).toBe(STARTING_COINS - carrotBasket.cost);
    expect(requests.isPurchased("rabbit", carrotBasket.id)).toBe(true);
  });

  it("blocks a purchase without enough coins", () => {
    const { requests, economy } = makeStack();
    // soft_hay (70) costs more than the fresh balance minus nothing spent yet is fine,
    // but draining coins first proves the guard.
    requests.purchase("rabbit", carrotBasket.id); // 60 -> 10
    const res = requests.purchase("rabbit", softHay.id); // needs 70, only has 10
    expect(res).toEqual({ ok: false, reason: "insufficient_coins" });
    expect(requests.isPurchased("rabbit", softHay.id)).toBe(false);
    expect(economy.coins).toBe(STARTING_COINS - carrotBasket.cost);
  });

  it("blocks purchasing the same request twice", () => {
    const { requests, economy } = makeStack();
    requests.purchase("rabbit", carrotBasket.id);
    const coinsAfterFirst = economy.coins;
    const res = requests.purchase("rabbit", carrotBasket.id);
    expect(res).toEqual({ ok: false, reason: "already_owned" });
    expect(economy.coins).toBe(coinsAfterFirst);
    expect(requests.progress("rabbit").completed).toBe(1);
  });

  it("progress increments exactly once per successful purchase", () => {
    const { requests } = makeStack();
    expect(requests.progress("rabbit")).toEqual({ completed: 0, total: 3 });
    requests.purchase("rabbit", carrotBasket.id);
    expect(requests.progress("rabbit")).toEqual({ completed: 1, total: 3 });
  });

  it("isComplete flips only once every request is purchased", () => {
    const { requests, economy } = makeStack();
    economy.add(1000, "test-topup");
    expect(requests.isComplete("rabbit")).toBe(false);
    requests.purchase("rabbit", carrotBasket.id);
    requests.purchase("rabbit", softHay.id);
    expect(requests.isComplete("rabbit")).toBe(false);
    requests.purchase("rabbit", cloverPatch.id);
    expect(requests.isComplete("rabbit")).toBe(true);
  });

  it("emits request:purchased on a successful buy, not on a rejected one", () => {
    const { requests, bus } = makeStack();
    const seen: string[] = [];
    bus.on("request:purchased", (p) => seen.push(p.requestId));
    requests.purchase("rabbit", carrotBasket.id);
    requests.purchase("rabbit", carrotBasket.id); // rejected: already owned
    expect(seen).toEqual([carrotBasket.id]);
  });

  it("persists purchases immediately", () => {
    const { requests } = makeStack();
    requests.purchase("rabbit", carrotBasket.id);
    const reloaded = new SaveService(KEY);
    expect(reloaded.state.requests.rabbit).toEqual([carrotBasket.id]);
  });

  it("minigame level starts at 1 and advances per completed round, per object", () => {
    const { requests, economy } = makeStack();
    expect(requests.minigameLevel("rabbit")).toBe(1);
    requests.recordMinigameRound("rabbit", 60);
    expect(requests.minigameLevel("rabbit")).toBe(2);
    expect(economy.coins).toBe(STARTING_COINS + 60);
    // a different object's level is independent
    expect(requests.minigameLevel("wildflowers")).toBe(1);
  });

  it("catalog order is unaffected by requests", () => {
    expect(CATALOG.map((o) => o.id)).toEqual([
      "rabbit",
      "bird",
      "hedgehog",
      "squirrel",
      "fox",
      "deer",
    ]);
  });

  it("puzzle stays gated until requests are complete, unlocks once they are (combined check)", () => {
    const { requests, progression, economy } = makeStack();
    const puzzleAvailable = () => requests.isComplete("rabbit") && !progression.isUnlocked("rabbit");
    expect(puzzleAvailable()).toBe(false);
    economy.add(1000, "test-topup");
    requests.purchase("rabbit", carrotBasket.id);
    requests.purchase("rabbit", softHay.id);
    requests.purchase("rabbit", cloverPatch.id);
    expect(puzzleAvailable()).toBe(true);
  });
});

describe("habitat restoration transactions", () => {
  it("acquisition never restores automatically; explicit restore consumes once and survives reload", () => {
    const { requests, save } = makeStack();
    const source = { id: "rabbit_carrot_patch", produces: "carrot", restoreCost: 5 };
    expect(requests.restoreSourceNow(source).ok).toBe(false);
    requests.collectResource("carrot", 5);
    expect(requests.isSourceRestored(source.id)).toBe(false);
    expect(requests.restoreSourceNow(source).ok).toBe(true);
    expect(requests.resourceCount("carrot")).toBe(0);
    expect(requests.restoreSourceNow(source).ok).toBe(false);
    const reloaded = new SaveService(KEY);
    expect(reloaded.state.restoredSources[source.id]).toBe(true);
    expect(reloaded.state.resources.carrot).toBe(0);
    expect(save.state.restoredSources[source.id]).toBe(true);
  });
});
