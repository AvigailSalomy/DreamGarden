import { beforeEach, describe, expect, it } from "vitest";
import { Emitter } from "../src/core/EventBus";
import type { GameEvents } from "../src/core/events";
import { SaveService } from "../src/core/SaveService";
import { EconomyService } from "../src/core/EconomyService";
import { ProgressionService } from "../src/core/ProgressionService";
import { CATALOG } from "../src/data/objects";
import { DEFAULT_PROGRESSION } from "../src/data/progression";
import { STARTING_COINS } from "../src/game/config";

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

describe("ProgressionService — animal-only order: Rabbit → Bird → Hedgehog → Squirrel → Fox → Deer", () => {
  it("catalog is exactly the six animals, in rescue order", () => {
    expect(CATALOG.map((o) => o.id)).toEqual([
      "rabbit",
      "bird",
      "hedgehog",
      "squirrel",
      "fox",
      "deer",
    ]);
    expect(CATALOG.every((o) => o.category === "animal")).toBe(true);
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

  it("rabbit unlock advances directly to bird, never an intermediate task", () => {
    const { progression, economy } = makeStack();
    const res = progression.recordPuzzleCompletion("rabbit");
    expect(res.unlockedNow).toBe(true);
    expect(progression.isUnlocked("rabbit")).toBe(true);
    expect(progression.currentTask?.id).toBe("bird");
    expect(progression.isGardenComplete()).toBe(false);
    expect(economy.coins).toBe(STARTING_COINS + BONUS + 15);
  });

  it("bird unlock advances to hedgehog", () => {
    const { progression, economy } = makeStack();
    progression.recordPuzzleCompletion("rabbit");
    const res = progression.recordPuzzleCompletion("bird");
    expect(res.unlockedNow).toBe(true);
    expect(progression.isUnlocked("bird")).toBe(true);
    expect(progression.currentTask?.id).toBe("hedgehog");
    expect(economy.coins).toBe(STARTING_COINS + BONUS + 15 + BONUS + 15);
  });

  it("hedgehog unlock advances to squirrel, not garden-complete", () => {
    const { progression } = makeStack();
    progression.recordPuzzleCompletion("rabbit");
    progression.recordPuzzleCompletion("bird");
    const res = progression.recordPuzzleCompletion("hedgehog");
    expect(res.unlockedNow).toBe(true);
    expect(progression.unlockedObjects().map((o) => o.id)).toEqual(["rabbit", "bird", "hedgehog"]);
    expect(progression.currentTask?.id).toBe("squirrel");
    expect(progression.isGardenComplete()).toBe(false);
  });

  it("unlocking every animal completes the garden", () => {
    const { progression, economy } = makeStack();
    for (const id of ["rabbit", "bird", "hedgehog", "squirrel", "fox", "deer"]) {
      progression.recordPuzzleCompletion(id);
    }
    expect(progression.currentTask).toBeNull();
    expect(progression.isGardenComplete()).toBe(true);
    const rewardSum = 15 + 15 + 20 + 20 + 20 + 25;
    expect(economy.coins).toBe(STARTING_COINS + 6 * BONUS + rewardSum);
  });

  it("emits object:unlock for each restoration in order", () => {
    const { progression, bus } = makeStack();
    const unlocked: string[] = [];
    bus.on("object:unlock", (p) => unlocked.push(p.objectId));
    progression.recordPuzzleCompletion("rabbit");
    progression.recordPuzzleCompletion("bird");
    progression.recordPuzzleCompletion("hedgehog");
    expect(unlocked).toEqual(["rabbit", "bird", "hedgehog"]);
  });

  it("commits each unlock + total puzzles solved to storage immediately", () => {
    const { progression } = makeStack();
    progression.recordPuzzleCompletion("rabbit");
    progression.recordPuzzleCompletion("bird");

    const reloaded = new SaveService(KEY);
    expect(reloaded.state.objects.rabbit.is_unlocked).toBe(true);
    expect(reloaded.state.objects.bird.is_unlocked).toBe(true);
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

  it("the songbird puzzle is a 2x4 (8-piece) reuse of the same engine", () => {
    const bird = CATALOG.find((o) => o.id === "bird")!;
    expect(bird.puzzle.grids[0]).toEqual({ cols: 2, rows: 4 });
    expect(bird.puzzle.image).toBe("bird_portrait");
  });

  it("piece counts escalate per animal: 6 / 8 / 10 / 12 / 14 / 16", () => {
    const count = (id: string) => {
      const g = CATALOG.find((o) => o.id === id)!.puzzle.grids[0];
      return g.cols * g.rows;
    };
    expect(count("rabbit")).toBe(6);
    expect(count("bird")).toBe(8);
    expect(count("hedgehog")).toBe(10);
    expect(count("squirrel")).toBe(12);
    expect(count("fox")).toBe(14);
    expect(count("deer")).toBe(16);
  });

  it("each restoration names an object-specific completion sound", () => {
    expect(CATALOG.find((o) => o.id === "rabbit")!.complete_sfx).toBe("rabbitChirp");
    expect(CATALOG.find((o) => o.id === "bird")!.complete_sfx).toBe("birdSong");
  });

  it("animalOrder/activeAnimalId/isAnimalLocked gate strictly in sequence", () => {
    const { progression } = makeStack();
    expect(progression.animalOrder().map((o) => o.id)).toEqual([
      "rabbit",
      "bird",
      "hedgehog",
      "squirrel",
      "fox",
      "deer",
    ]);
    expect(progression.activeAnimalId()).toBe("rabbit");
    expect(progression.isAnimalLocked("bird")).toBe(true);
    expect(progression.isAnimalLocked("rabbit")).toBe(false);

    progression.recordPuzzleCompletion("rabbit");
    expect(progression.activeAnimalId()).toBe("bird");
    expect(progression.isAnimalLocked("bird")).toBe(false);
    expect(progression.isAnimalLocked("hedgehog")).toBe(true);
    // a rescued animal is never "locked", even though it's no longer active
    expect(progression.isAnimalLocked("rabbit")).toBe(false);
  });
});
