import { beforeEach, describe, expect, it } from "vitest";
import { Emitter } from "../src/core/EventBus";
import type { GameEvents } from "../src/core/events";
import { SaveService } from "../src/core/SaveService";
import { EconomyService } from "../src/core/EconomyService";
import { FrostedValleyProgressionService } from "../src/core/FrostedValleyProgressionService";
import { FROSTED_CATALOG } from "../src/data/frostedValley";
import { STARTING_COINS } from "../src/game/config";

const KEY = "dreamgarden.save.frostedtest";

function makeStack() {
  const bus = new Emitter<GameEvents>();
  const save = new SaveService(KEY);
  save.reset();
  const economy = new EconomyService(save, bus);
  const frosted = new FrostedValleyProgressionService(save, economy, bus, FROSTED_CATALOG);
  return { bus, save, economy, frosted };
}

function fullyCollect(frosted: FrostedValleyProgressionService, animalId: string) {
  const def = FROSTED_CATALOG.find((a) => a.id === animalId)!;
  for (const r of def.resources) {
    frosted.addResourceProgress(animalId, r.id, r.requiredAmount);
    frosted.restoreResource(animalId, r.id);
  }
}

/** Every requirement restored + the reward puzzle solved — what the unlock cinematic commits on. */
function fullyCollectAndSolve(frosted: FrostedValleyProgressionService, animalId: string) {
  fullyCollect(frosted, animalId);
  frosted.markPuzzleSolved(animalId);
}

beforeEach(() => localStorage.clear());

describe("FrostedValleyProgressionService — Rabbit → Fox → Deer → Squirrel → Polar Bear → Penguin", () => {
  it("catalog is ordered and every animal has a letter and at least one real resource", () => {
    expect(FROSTED_CATALOG.map((a) => a.id)).toEqual(["fv_rabbit", "fv_fox", "fv_deer", "fv_squirrel", "fv_polarbear", "fv_penguin"]);
    for (const a of FROSTED_CATALOG) {
      expect(a.letterBody.length).toBeGreaterThan(10);
      expect(a.resources.length).toBeGreaterThan(0);
    }
  });

  it("requirement counts per animal: rabbit 3, fox 2, deer 1 (flower bed), squirrel 3, polar bear 3, penguin 3", () => {
    const counts = Object.fromEntries(FROSTED_CATALOG.map((a) => [a.id, a.resources.map((r) => r.id)]));
    expect(counts).toEqual({
      fv_rabbit: ["well", "carrots", "chime"],
      fv_fox: ["ice", "signpost"],
      fv_deer: ["flowerbed"],
      fv_squirrel: ["nest", "pool", "waterfall"],
      fv_polarbear: ["crystal", "hole", "cave"],
      fv_penguin: ["igloo", "iceberg", "slide"],
    });
  });

  it("puzzle difficulty strictly increases along the rescue order", () => {
    const pieces = FROSTED_CATALOG.map((a) => a.puzzle.cols * a.puzzle.rows);
    const irr = FROSTED_CATALOG.map((a) => a.puzzle.irregularity);
    const ghost = FROSTED_CATALOG.map((a) => a.puzzle.guideAlpha);
    for (let i = 1; i < FROSTED_CATALOG.length; i++) {
      expect(pieces[i]).toBeGreaterThan(pieces[i - 1]);
      expect(irr[i]).toBeGreaterThan(irr[i - 1]);
      expect(ghost[i]).toBeLessThan(ghost[i - 1]);
    }
    expect(pieces[0]).toBe(12);
    expect(pieces[pieces.length - 1]).toBe(32);
  });

  it("the puzzle only becomes available once EVERY requirement is restored", () => {
    const { frosted } = makeStack();
    expect(frosted.isPuzzleAvailable("fv_rabbit")).toBe(false);
    frosted.addResourceProgress("fv_rabbit", "well", 5);
    frosted.restoreResource("fv_rabbit", "well");
    frosted.addResourceProgress("fv_rabbit", "carrots", 5);
    frosted.restoreResource("fv_rabbit", "carrots");
    expect(frosted.isPuzzleAvailable("fv_rabbit")).toBe(false); // chime still missing
    expect(frosted.markPuzzleSolved("fv_rabbit")).toBe(false);
    frosted.addResourceProgress("fv_rabbit", "chime", 5);
    expect(frosted.isPuzzleAvailable("fv_rabbit")).toBe(false); // collected but not restored yet
    frosted.restoreResource("fv_rabbit", "chime");
    expect(frosted.isPuzzleAvailable("fv_rabbit")).toBe(true);
  });

  it("rescue additionally requires the puzzle to be solved; a solved-but-unrescued animal is 'unlock pending' across reloads", () => {
    const { frosted } = makeStack();
    fullyCollect(frosted, "fv_rabbit");
    expect(frosted.rescueAnimal("fv_rabbit").rescuedNow).toBe(false);
    expect(frosted.markPuzzleSolved("fv_rabbit")).toBe(true);
    expect(frosted.markPuzzleSolved("fv_rabbit")).toBe(false); // idempotent
    expect(frosted.isUnlockPending("fv_rabbit")).toBe(true);

    const reloaded = new SaveService(KEY);
    expect(reloaded.state.frostedValley.animals["fv_rabbit"].puzzleSolved).toBe(true);
    expect(reloaded.state.frostedValley.animals["fv_rabbit"].rescued).toBe(false);

    expect(frosted.rescueAnimal("fv_rabbit").rescuedNow).toBe(true);
    expect(frosted.isUnlockPending("fv_rabbit")).toBe(false);
    expect(frosted.isPuzzleAvailable("fv_rabbit")).toBe(false); // never offered again once unlocked
  });

  it("reload after PARTIAL restoration keeps exactly the restored/unrestored split, and the animal stays locked", () => {
    const { frosted } = makeStack();
    frosted.addResourceProgress("fv_rabbit", "well", 5);
    frosted.restoreResource("fv_rabbit", "well");
    frosted.addResourceProgress("fv_rabbit", "carrots", 2); // in progress, not enough to restore yet

    const reloaded = new SaveService(KEY);
    const rabbit = reloaded.state.frostedValley.animals["fv_rabbit"];
    expect(rabbit.resources["well"]).toEqual({ current: 5, restored: true });
    expect(rabbit.resources["carrots"]).toEqual({ current: 2, restored: false });
    expect(rabbit.resources["chime"]).toBeUndefined(); // never touched, never fabricated
    expect(reloaded.state.frostedValley.currentAnimalIndex).toBe(0); // still locked on the rabbit

    // and the reloaded state is exactly what a fresh service instance sees too
    const bus2 = new Emitter<GameEvents>();
    const economy2 = new EconomyService(reloaded, bus2);
    const frosted2 = new FrostedValleyProgressionService(reloaded, economy2, bus2, FROSTED_CATALOG);
    expect(frosted2.resourceState("fv_rabbit", "well").restored).toBe(true);
    expect(frosted2.resourceState("fv_rabbit", "carrots").restored).toBe(false);
    expect(frosted2.isFullyRestored("fv_rabbit")).toBe(false);
    expect(frosted2.isPuzzleAvailable("fv_rabbit")).toBe(false);
  });

  it("reload after FULL restoration but BEFORE the puzzle is solved leaves the puzzle available and the animal still locked", () => {
    const { frosted } = makeStack();
    fullyCollect(frosted, "fv_rabbit"); // every resource restored, puzzle not yet solved

    const reloaded = new SaveService(KEY);
    const rabbit = reloaded.state.frostedValley.animals["fv_rabbit"];
    expect(Object.values(rabbit.resources).every((r) => r.restored)).toBe(true);
    expect(rabbit.puzzleSolved).toBeFalsy();
    expect(rabbit.rescued).toBe(false);
    expect(reloaded.state.frostedValley.currentAnimalIndex).toBe(0);

    const bus2 = new Emitter<GameEvents>();
    const economy2 = new EconomyService(reloaded, bus2);
    const frosted2 = new FrostedValleyProgressionService(reloaded, economy2, bus2, FROSTED_CATALOG);
    expect(frosted2.isFullyRestored("fv_rabbit")).toBe(true);
    expect(frosted2.isPuzzleAvailable("fv_rabbit")).toBe(true); // the whole point of finishing restoration
    expect(frosted2.isCurrentAnimal("fv_rabbit")).toBe(true); // not advanced past — puzzle+unlock still owed
  });

  it("a locked future animal's puzzle can never be marked solved", () => {
    const { frosted } = makeStack();
    expect(frosted.markPuzzleSolved("fv_fox")).toBe(false);
    expect(frosted.isPuzzleSolved("fv_fox")).toBe(false);
  });

  it("starts on the rabbit, every other animal locked (not current)", () => {
    const { frosted } = makeStack();
    expect(frosted.currentAnimal?.id).toBe("fv_rabbit");
    expect(frosted.isCurrentAnimal("fv_fox")).toBe(false);
  });

  it("unlockedAnimals is empty at the start and only grows once an animal is fully rescued (never the current silhouette)", () => {
    const { frosted } = makeStack();
    expect(frosted.unlockedAnimals().map((a) => a.id)).toEqual([]);
    fullyCollectAndSolve(frosted, "fv_rabbit");
    // restored + puzzle solved, but the unlock cinematic hasn't committed yet: still locked
    expect(frosted.unlockedAnimals().map((a) => a.id)).toEqual([]);
    frosted.rescueAnimal("fv_rabbit");
    expect(frosted.unlockedAnimals().map((a) => a.id)).toEqual(["fv_rabbit"]);
    fullyCollectAndSolve(frosted, "fv_fox");
    frosted.rescueAnimal("fv_fox");
    expect(frosted.unlockedAnimals().map((a) => a.id)).toEqual(["fv_rabbit", "fv_fox"]);
  });

  it("cannot restore a resource before its required amount is collected", () => {
    const { frosted } = makeStack();
    frosted.addResourceProgress("fv_rabbit", "well", 2);
    expect(frosted.canRestore("fv_rabbit", "well")).toBe(false);
    expect(frosted.restoreResource("fv_rabbit", "well")).toBe(false);
    expect(frosted.resourceState("fv_rabbit", "well").restored).toBe(false);
  });

  it("collecting the full required amount unlocks Restore, which is an explicit separate action", () => {
    const { frosted } = makeStack();
    frosted.addResourceProgress("fv_rabbit", "well", 5);
    expect(frosted.canRestore("fv_rabbit", "well")).toBe(true);
    expect(frosted.resourceState("fv_rabbit", "well").restored).toBe(false); // not auto-restored
    expect(frosted.restoreResource("fv_rabbit", "well")).toBe(true);
    expect(frosted.resourceState("fv_rabbit", "well").restored).toBe(true);
  });

  it("progress amount is clamped to requiredAmount and ignored once restored", () => {
    const { frosted } = makeStack();
    frosted.addResourceProgress("fv_rabbit", "well", 999);
    expect(frosted.resourceState("fv_rabbit", "well").current).toBe(5);
    frosted.restoreResource("fv_rabbit", "well");
    frosted.addResourceProgress("fv_rabbit", "well", 5);
    expect(frosted.resourceState("fv_rabbit", "well").current).toBe(5); // no further change once restored
  });

  it("rescue is gated on ALL resources restored, not just some", () => {
    const { frosted } = makeStack();
    frosted.addResourceProgress("fv_rabbit", "well", 5);
    frosted.restoreResource("fv_rabbit", "well");
    expect(frosted.isFullyRestored("fv_rabbit")).toBe(false);
    expect(frosted.rescueAnimal("fv_rabbit").rescuedNow).toBe(false);

    fullyCollect(frosted, "fv_rabbit");
    expect(frosted.isFullyRestored("fv_rabbit")).toBe(true);
  });

  it("rescuing the rabbit awards its coin reward once and advances to the fox", () => {
    const { frosted, economy } = makeStack();
    fullyCollectAndSolve(frosted, "fv_rabbit");
    const res = frosted.rescueAnimal("fv_rabbit");
    expect(res.rescuedNow).toBe(true);
    expect(economy.coins).toBe(STARTING_COINS + 100);
    expect(frosted.currentAnimal?.id).toBe("fv_fox");
    expect(frosted.isRescued("fv_rabbit")).toBe(true);
  });

  it("a stray repeat rescue call never double-grants the reward", () => {
    const { frosted, economy } = makeStack();
    fullyCollectAndSolve(frosted, "fv_rabbit");
    frosted.rescueAnimal("fv_rabbit");
    const coinsAfterFirst = economy.coins;
    const res = frosted.rescueAnimal("fv_rabbit");
    expect(res.rescuedNow).toBe(false);
    expect(economy.coins).toBe(coinsAfterFirst);
  });

  it("fox's resources cannot even start collecting while the rabbit is still current — sequencing is enforced at the service layer, not just cosmetically", () => {
    const { frosted } = makeStack();
    // attempting to collect fox's resources before it's the current animal is a no-op
    fullyCollect(frosted, "fv_fox");
    expect(frosted.isFullyRestored("fv_fox")).toBe(false);
    expect(frosted.resourceState("fv_fox", "ice").current).toBe(0);
    expect(frosted.isCurrentAnimal("fv_fox")).toBe(false);

    // even if resources were somehow already restored, rescue itself is
    // gated on being current — a locked animal can never be rescued
    frosted.rescueAnimal("fv_fox");
    expect(frosted.currentAnimal?.id).toBe("fv_rabbit");
    expect(frosted.isRescued("fv_fox")).toBe(false);
  });

  it("full six-animal sequence completes the valley and persists across reload", () => {
    const { frosted, economy } = makeStack();
    let totalReward = 0;
    for (const a of FROSTED_CATALOG) {
      fullyCollectAndSolve(frosted, a.id);
      frosted.rescueAnimal(a.id);
      totalReward += a.coinReward;
    }
    expect(frosted.isValleyComplete()).toBe(true);
    expect(economy.coins).toBe(STARTING_COINS + totalReward);

    const reloaded = new SaveService(KEY);
    expect(reloaded.state.frostedValley.currentAnimalIndex).toBe(FROSTED_CATALOG.length);
    for (const a of FROSTED_CATALOG) {
      expect(reloaded.state.frostedValley.animals[a.id].rescued).toBe(true);
      expect(reloaded.state.frostedValley.animals[a.id].rewardClaimed).toBe(true);
    }
  });

  it("each animal's own letter-seen flag persists and is idempotent, independent of the others", () => {
    const { frosted } = makeStack();
    expect(frosted.isLetterSeen("fv_rabbit")).toBe(false);
    expect(frosted.isLetterSeen("fv_fox")).toBe(false);
    frosted.markLetterSeen("fv_rabbit");
    expect(frosted.isLetterSeen("fv_rabbit")).toBe(true);
    expect(frosted.isLetterSeen("fv_fox")).toBe(false); // unaffected
    frosted.markLetterSeen("fv_rabbit"); // no-op, no throw
    const reloaded = new SaveService(KEY);
    expect(reloaded.state.frostedValley.animals["fv_rabbit"].letterSeen).toBe(true);
  });

  it("emits frosted:* events distinct from Garden's own events", () => {
    const { frosted, bus } = makeStack();
    const seen: string[] = [];
    bus.on("frosted:resourceProgress", () => seen.push("progress"));
    bus.on("frosted:resourceRestored", () => seen.push("restored"));
    bus.on("frosted:animalRescued", () => seen.push("rescued"));
    frosted.addResourceProgress("fv_rabbit", "well", 5);
    frosted.restoreResource("fv_rabbit", "well");
    fullyCollectAndSolve(frosted, "fv_rabbit");
    frosted.rescueAnimal("fv_rabbit");
    expect(seen).toContain("progress");
    expect(seen).toContain("restored");
    expect(seen).toContain("rescued");
  });

  it("does not touch any Garden SaveState field", () => {
    const { save, frosted } = makeStack();
    const before = { coins: save.state.coins, currentTaskIndex: save.state.currentTaskIndex, objects: { ...save.state.objects } };
    fullyCollectAndSolve(frosted, "fv_rabbit");
    frosted.rescueAnimal("fv_rabbit");
    expect(save.state.currentTaskIndex).toBe(before.currentTaskIndex);
    expect(save.state.objects).toEqual(before.objects);
    // coins DOES change (shared economy, by design) — only Garden-specific fields must stay untouched
  });
});
