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

describe("ProgressionService — sequential objects (Rabbit → Bird)", () => {
  it("starts on the rabbit task with 0/1 progress", () => {
    const { progression } = makeStack();
    expect(progression.currentTask?.id).toBe("rabbit");
    const vm = progression.taskVM();
    expect(vm).toMatchObject({ completed: 0, required: 1 });
    expect(vm?.segments).toEqual([false]);
  });

  it("advances to the Bird task after the Rabbit unlocks (not garden-complete yet)", () => {
    const { progression, economy } = makeStack();

    const res = progression.recordPuzzleCompletion("rabbit");
    expect(res.unlockedNow).toBe(true);
    expect(progression.isUnlocked("rabbit")).toBe(true);
    expect(economy.coins).toBe(DEFAULT_PROGRESSION.perPuzzleBonus + 15);

    // the data-driven catalog rolls the current task forward automatically
    expect(progression.currentTask?.id).toBe("bird");
    expect(progression.isGardenComplete()).toBe(false);
    expect(progression.taskVM()).toMatchObject({ completed: 0, required: 1 });
  });

  it("unlocks the Bird next and only then is the garden complete", () => {
    const { progression, economy } = makeStack();
    progression.recordPuzzleCompletion("rabbit");

    const res = progression.recordPuzzleCompletion("bird");
    expect(res.unlockedNow).toBe(true);
    expect(progression.isUnlocked("bird")).toBe(true);
    expect(progression.unlockedObjects().map((o) => o.id)).toEqual(["rabbit", "bird"]);
    expect(progression.currentTask).toBeNull();
    expect(progression.isGardenComplete()).toBe(true);
    expect(economy.coins).toBe(2 * (DEFAULT_PROGRESSION.perPuzzleBonus + 15));
  });

  it("emits object:unlock for each object in order", () => {
    const { progression, bus } = makeStack();
    const unlocked: string[] = [];
    bus.on("object:unlock", (p) => unlocked.push(p.objectId));

    progression.recordPuzzleCompletion("rabbit");
    progression.recordPuzzleCompletion("bird");
    expect(unlocked).toEqual(["rabbit", "bird"]);
  });

  it("commits each unlock to storage immediately (both survive a reload)", () => {
    const { progression } = makeStack();
    progression.recordPuzzleCompletion("rabbit");
    progression.recordPuzzleCompletion("bird");

    const reloaded = new SaveService(KEY);
    expect(reloaded.state.objects.rabbit.is_unlocked).toBe(true);
    expect(reloaded.state.objects.bird.is_unlocked).toBe(true);
    expect(reloaded.state.currentTaskIndex).toBe(2);
    expect(reloaded.state.coins).toBe(40);
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
