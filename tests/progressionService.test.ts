import { beforeEach, describe, expect, it } from "vitest";
import { Emitter } from "../src/core/EventBus";
import type { GameEvents } from "../src/core/events";
import { SaveService } from "../src/core/SaveService";
import { EconomyService } from "../src/core/EconomyService";
import { ProgressionService } from "../src/core/ProgressionService";
import { CATALOG } from "../src/data/objects";
import { DEFAULT_PROGRESSION } from "../src/data/progression";

const KEY = "dreamgarden.save.progtest";

function makeStack() {
  const bus = new Emitter<GameEvents>();
  const save = new SaveService(KEY);
  save.reset();
  const economy = new EconomyService(save, bus);
  const progression = new ProgressionService(save, economy, bus, CATALOG);
  return { bus, save, economy, progression };
}

beforeEach(() => localStorage.clear());

describe("ProgressionService — rabbit vertical slice", () => {
  it("starts on the rabbit task with 0/1 progress", () => {
    const { progression } = makeStack();
    expect(progression.currentTask?.id).toBe("rabbit");
    const vm = progression.taskVM();
    expect(vm).toMatchObject({ completed: 0, required: 1 });
    expect(vm?.segments).toEqual([false]);
  });

  it("unlocks the rabbit on the final puzzle and awards coins", () => {
    const { progression, economy } = makeStack();

    const res = progression.recordPuzzleCompletion("rabbit");
    expect(res.unlockedNow).toBe(true);
    expect(progression.isUnlocked("rabbit")).toBe(true);
    // per-puzzle bonus (5) + reward (15)
    expect(economy.coins).toBe(DEFAULT_PROGRESSION.perPuzzleBonus + 15);
    expect(progression.currentTask).toBeNull();
    expect(progression.isGardenComplete()).toBe(true);
  });

  it("emits object:unlock and coins:changed", () => {
    const { progression, bus } = makeStack();
    const unlocked: string[] = [];
    const coinEvents: number[] = [];
    bus.on("object:unlock", (p) => unlocked.push(p.objectId));
    bus.on("coins:changed", (p) => coinEvents.push(p.delta));

    progression.recordPuzzleCompletion("rabbit");
    expect(unlocked).toEqual(["rabbit"]);
    expect(coinEvents).toEqual([5, 15]);
  });

  it("commits the unlock to storage before any animation could run", () => {
    const { progression } = makeStack();
    progression.recordPuzzleCompletion("rabbit");

    const reloaded = new SaveService(KEY);
    expect(reloaded.state.objects.rabbit.is_unlocked).toBe(true);
    expect(reloaded.state.currentTaskIndex).toBe(1);
    expect(reloaded.state.coins).toBe(20);
  });

  it("ignores a stray repeat of an already-finished puzzle", () => {
    const { progression, economy } = makeStack();
    progression.recordPuzzleCompletion("rabbit");
    const coinsAfterFirst = economy.coins;
    const res = progression.recordPuzzleCompletion("rabbit");
    expect(res.unlockedNow).toBe(false);
    expect(progression.completedCount("rabbit")).toBe(1);
    expect(economy.coins).toBe(coinsAfterFirst);
  });
});
