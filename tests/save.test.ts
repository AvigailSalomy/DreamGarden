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
  });

  it("returns a fresh save for junk input", () => {
    expect(migrate(null).coins).toBe(0);
    expect(migrate("nope" as unknown).coins).toBe(0);
  });
});

describe("SaveService", () => {
  it("round-trips through localStorage", () => {
    const a = new SaveService(KEY);
    a.state.coins = 120;
    a.state.objects.rabbit = { puzzles_completed: 1, is_unlocked: true };
    a.saveNow();

    const b = new SaveService(KEY);
    expect(b.state.coins).toBe(120);
    expect(b.state.objects.rabbit.is_unlocked).toBe(true);
  });

  it("recovers from a corrupt blob", () => {
    localStorage.setItem(KEY, "{not json");
    const s = new SaveService(KEY);
    expect(s.state.coins).toBe(0);
  });

  it("reset wipes progress", () => {
    const s = new SaveService(KEY);
    s.state.coins = 99;
    s.saveNow();
    s.reset();
    expect(s.state.coins).toBe(0);
    expect(new SaveService(KEY).state.coins).toBe(0);
  });
});
