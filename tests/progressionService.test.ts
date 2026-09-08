import { beforeEach, describe, expect, it } from "vitest";
import { Emitter } from "../src/core/EventBus";
import type { GameEvents } from "../src/core/events";
import { SaveService } from "../src/core/SaveService";
import { EconomyService } from "../src/core/EconomyService";
import { ProgressionService } from "../src/core/ProgressionService";
import { CATALOG } from "../src/data/objects";
import { DEFAULT_PROGRESSION } from "../src/data/progression";

const KEY = "dreamgarden.save.progtest";
const BONUS = DEFAULT_PROGRESSION.perPuzzleBonus;

function makeStack() {
  const bus = new Emitter<GameEvents>();
  const save = new SaveService(KEY);
  save.reset();
  const economy = new EconomyService(save, bus);
  const progression = new ProgressionService(save, economy, bus, CATALOG);
  return { bus, save, economy, progression };
}

beforeEach(() => localStorage.clear());

describe("ProgressionService — Milestone 3 order: Rabbit → Wildflowers → Songbird", () => {
  it("catalog is ordered rabbit, wildflowers, bird", () => {
    expect(CATALOG.map((o) => o.id)).toEqual(["rabbit", "wildflowers", "bird"]);
  });

  it("every restoration carries a task letter", () => {
    for (const o of CATALOG) {
      expect(typeof o.letter.body).toBe("string");
      expect(o.letter.body.length).toBeGreaterThan(10);
    }
  });

  it("starts on the rabbit task", () => {
    const { progression } = makeStack();
    expect(progression.currentTask?.id).toBe("rabbit");
    expect(progression.taskVM()).toMatchObject({ completed: 0, required: 1 });
  });

  it("rabbit unlock advances to WILDFLOWERS, not the bird", () => {
    const { progression, economy } = makeStack();
    const res = progression.recordPuzzleCompletion("rabbit");
    expect(res.unlockedNow).toBe(true);
    expect(progression.isUnlocked("rabbit")).toBe(true);
    expect(progression.currentTask?.id).toBe("wildflowers");
    expect(progression.isGardenComplete()).toBe(false);
    expect(economy.coins).toBe(BONUS + 15);
  });

  it("wildflowers unlock (reward 30) then advances to the songbird", () => {
    const { progression, economy } = makeStack();
    progression.recordPuzzleCompletion("rabbit");
    const res = progression.recordPuzzleCompletion("wildflowers");
    expect(res.unlockedNow).toBe(true);
    expect(progression.isUnlocked("wildflowers")).toBe(true);
    expect(progression.currentTask?.id).toBe("bird");
    // rabbit: 5+15, wildflowers: 5+30
    expect(economy.coins).toBe(BONUS + 15 + BONUS + 30);
  });

  it("songbird unlock completes the garden", () => {
    const { progression, economy } = makeStack();
    progression.recordPuzzleCompletion("rabbit");
    progression.recordPuzzleCompletion("wildflowers");
    const res = progression.recordPuzzleCompletion("bird");
    expect(res.unlockedNow).toBe(true);
    expect(progression.unlockedObjects().map((o) => o.id)).toEqual([
      "rabbit",
      "wildflowers",
      "bird",
    ]);
    expect(progression.currentTask).toBeNull();
    expect(progression.isGardenComplete()).toBe(true);
    expect(economy.coins).toBe(3 * BONUS + 15 + 30 + 15);
  });

  it("emits object:unlock for each restoration in order", () => {
    const { progression, bus } = makeStack();
    const unlocked: string[] = [];
    bus.on("object:unlock", (p) => unlocked.push(p.objectId));
    progression.recordPuzzleCompletion("rabbit");
    progression.recordPuzzleCompletion("wildflowers");
    progression.recordPuzzleCompletion("bird");
    expect(unlocked).toEqual(["rabbit", "wildflowers", "bird"]);
  });

  it("commits each unlock + total puzzles solved to storage immediately", () => {
    const { progression } = makeStack();
    progression.recordPuzzleCompletion("rabbit");
    progression.recordPuzzleCompletion("wildflowers");

    const reloaded = new SaveService(KEY);
    expect(reloaded.state.objects.rabbit.is_unlocked).toBe(true);
    expect(reloaded.state.objects.wildflowers.is_unlocked).toBe(true);
    expect(reloaded.state.currentTaskIndex).toBe(2);
    expect(reloaded.state.stats.puzzlesSolved).toBe(2);
  });

  it("ignores a stray repeat of an already-finished puzzle", () => {
    const { progression, economy } = makeStack();
    progression.recordPuzzleCompletion("rabbit");
    const coins = economy.coins;
    const res = progression.recordPuzzleCompletion("rabbit");
    expect(res.unlockedNow).toBe(false);
    expect(economy.coins).toBe(coins);
  });

  it("the songbird puzzle is a 2x3 (6-piece) reuse of the same engine", () => {
    const bird = CATALOG.find((o) => o.id === "bird")!;
    expect(bird.puzzle.grids[0]).toEqual({ cols: 2, rows: 3 });
    expect(bird.puzzle.image).toBe("bird_portrait");
  });
});
