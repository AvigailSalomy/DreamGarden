import { beforeEach, describe, expect, it } from "vitest";
import { SaveService, freshSave, migrate } from "../src/core/SaveService";
import { SAVE_VERSION } from "../src/game/config";

const KEY = "dreamgarden.save.test";

beforeEach(() => localStorage.clear());

describe("freshSave", () => {
  it("has the expected shape", () => {
    const s = freshSave();
    expect(s).toMatchObject({
      saveVersion: SAVE_VERSION,
      coins: 0,
      currentTaskIndex: 0,
      introSeen: false,
      openingGardenTourSeen: false,
      lettersSeen: {},
      objects: {},
    });
    expect(s.stats.puzzlesSolved).toBe(0);
  });
});

describe("migrate", () => {
  it("fills in missing fields without dropping known data", () => {
    const m = migrate({ coins: 42, objects: { rabbit: { puzzles_completed: 1, is_unlocked: true } } });
    expect(m.coins).toBe(42);
    expect(m.objects.rabbit.is_unlocked).toBe(true);
    expect(m.stats.puzzlesSolved).toBe(0);
    expect(m.saveVersion).toBe(SAVE_VERSION);
    expect(m.lettersSeen).toEqual({});
  });

  it("returns a fresh save for junk input", () => {
    expect(migrate(null).coins).toBe(0);
    expect(migrate("nope" as unknown).coins).toBe(0);
  });

  it("a Milestone-2 save with no tour/letters fields loads without crashing", () => {
    const m2 = {
      saveVersion: 1,
      coins: 20,
      currentTaskIndex: 1,
      introSeen: true,
      objects: { rabbit: { puzzles_completed: 1, is_unlocked: true } },
      stats: { puzzlesSolved: 1, startedAt: 1, lastPlayed: 2 },
    };
    const m = migrate(m2);
    expect(m.coins).toBe(20);
    expect(m.currentTaskIndex).toBe(1);
    expect(m.objects.rabbit.is_unlocked).toBe(true);
    // an existing player never gets the opening tour retroactively
    expect(m.openingGardenTourSeen).toBe(true);
    expect(m.lettersSeen).toEqual({});
  });

  it("a fresh (no-progress) blob keeps the tour unseen", () => {
    expect(migrate({ coins: 0, objects: {} }).openingGardenTourSeen).toBe(false);
  });
});

describe("SaveService", () => {
  it("round-trips through localStorage", () => {
    const a = new SaveService(KEY);
    a.state.coins = 120;
    a.state.objects.rabbit = { puzzles_completed: 1, is_unlocked: true };
    a.state.lettersSeen.rabbit = true;
    a.state.openingGardenTourSeen = true;
    a.saveNow();

    const b = new SaveService(KEY);
    expect(b.state.coins).toBe(120);
    expect(b.state.objects.rabbit.is_unlocked).toBe(true);
    expect(b.state.lettersSeen.rabbit).toBe(true);
    expect(b.state.openingGardenTourSeen).toBe(true);
  });

  it("recovers from a corrupt blob", () => {
    localStorage.setItem(KEY, "{not json");
    const s = new SaveService(KEY);
    expect(s.state.coins).toBe(0);
  });

  it("reset wipes every DreamGarden field", () => {
    const s = new SaveService(KEY);
    s.state.coins = 99;
    s.state.openingGardenTourSeen = true;
    s.state.lettersSeen = { rabbit: true, wildflowers: true };
    s.state.objects.rabbit = { puzzles_completed: 1, is_unlocked: true };
    s.saveNow();

    s.reset();
    expect(s.state.coins).toBe(0);
    expect(s.state.openingGardenTourSeen).toBe(false);
    expect(s.state.lettersSeen).toEqual({});
    expect(s.state.objects).toEqual({});

    const reloaded = new SaveService(KEY);
    expect(reloaded.state.coins).toBe(0);
    expect(reloaded.state.openingGardenTourSeen).toBe(false);
    expect(reloaded.state.lettersSeen).toEqual({});
  });
});
