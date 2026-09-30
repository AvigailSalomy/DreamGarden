import { beforeEach, describe, expect, it } from "vitest";
import { migrate } from "../src/core/SaveService";
import { CATALOG, GARDEN_COMPLETE_LETTER, GARDEN_COMPLETE_LETTER_ID } from "../src/data/objects";
import { progression, save, isFrostedValleyUnlocked } from "../src/game/services";

/** Rescue Dream Garden animals through the real progression path (puzzles → unlock). */
function rescue(ids: string[]): void {
  for (const id of ids) {
    const def = progression.def(id)!;
    while (!progression.isUnlocked(id) && progression.completedCount(id) < def.puzzles_required) {
      progression.recordPuzzleCompletion(id);
    }
  }
}

beforeEach(() => save.reset());

describe("Frosted Valley unlock — Dream Garden fully completed", () => {
  it("is locked on a fresh save", () => {
    expect(isFrostedValleyUnlocked()).toBe(false);
  });

  it("stays locked with partial Dream Garden progress (1 to 5 of 6 animals)", () => {
    for (let n = 1; n <= 5; n++) {
      rescue(CATALOG.slice(0, n).map((o) => o.id));
      expect(isFrostedValleyUnlocked()).toBe(false);
    }
  });

  it("unlocks once all six Dream Garden animals are rescued, and stays unlocked after reload", () => {
    rescue(CATALOG.map((o) => o.id));
    expect(isFrostedValleyUnlocked()).toBe(true);
    const reloaded = migrate(JSON.parse(JSON.stringify(save.state)));
    expect(CATALOG.every((o) => reloaded.objects[o.id]?.is_unlocked)).toBe(true);
  });

  it("Start New Garden begins a new playthrough: the valley is locked again", () => {
    rescue(CATALOG.map((o) => o.id));
    save.reset();
    expect(isFrostedValleyUnlocked()).toBe(false);
  });
});

describe("the one-time 'Garden restored' letter", () => {
  it("has the completion copy and the travel button", () => {
    expect(GARDEN_COMPLETE_LETTER.title).toBe("The Garden Is Restored!");
    expect(GARDEN_COMPLETE_LETTER.highlight).toContain("Frosted Valley is now unlocked!");
    expect(GARDEN_COMPLETE_LETTER.button).toBe("Travel to Frosted Valley");
  });

  it("its read-state lives in lettersSeen, persists through reload, and is cleared by Start New Garden", () => {
    save.state.lettersSeen[GARDEN_COMPLETE_LETTER_ID] = true;
    save.saveNow();
    expect(migrate(JSON.parse(JSON.stringify(save.state))).lettersSeen[GARDEN_COMPLETE_LETTER_ID]).toBe(true);
    save.reset();
    expect(save.state.lettersSeen[GARDEN_COMPLETE_LETTER_ID]).toBeUndefined();
  });
});
