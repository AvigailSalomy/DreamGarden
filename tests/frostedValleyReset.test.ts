import { beforeEach, describe, expect, it } from "vitest";
import { SaveService } from "../src/core/SaveService";

const KEY = "dreamgarden.save.frostedresettest";

beforeEach(() => localStorage.clear());

/** A save with a finished Dream Garden and a well-played Frosted Valley. */
function playedSave(): SaveService {
  const save = new SaveService(KEY);
  const s = save.state;
  s.coins = 777;
  s.introSeen = true;
  s.openingGardenTourSeen = true;
  s.currentTaskIndex = 6;
  s.objects.rabbit = { puzzles_completed: 1, is_unlocked: true } as (typeof s.objects)[string];
  s.lettersSeen.frosted_valley_invite = true;
  s.frostedValley.currentAnimalIndex = 3;
  s.frostedValley.animals.fv_rabbit = { resources: {}, rescued: true, rewardClaimed: true, letterSeen: true };
  s.frostedValley.storyNotesSeen = { shop_intro_seen: true };
  s.frostedValley.mazeTutorialSeen = true;
  s.frostedShop.placements.push({ id: "p1", itemId: "decor_bench", x: 1, y: 2, rotation: 0 } as (typeof s.frostedShop.placements)[number]);
  s.frostedShop.petOwned.pet_tiara = true;
  s.frostedShop.equipped.fv_rabbit = "pet_tiara";
  save.saveNow();
  return save;
}

describe("Frosted Valley — Start New Garden (SaveService.resetFrostedValley)", () => {
  it("resets the valley's own progression and Winter Market state", () => {
    const save = playedSave();
    save.resetFrostedValley();
    const fv = save.state.frostedValley;
    expect(fv.currentAnimalIndex).toBe(0);
    expect(fv.animals).toEqual({});
    expect(fv.storyNotesSeen ?? {}).toEqual({});
    expect(fv.mazeTutorialSeen).toBe(false);
    expect(save.state.frostedShop).toEqual({ placements: [], petOwned: {}, equipped: {} });
  });

  it("keeps Dream Garden, the shared coin wallet and the valley invitation — and persists", () => {
    playedSave();
    // everything but the two Frosted Valley slices, exactly as a reload sees it
    const gardenOnly = (s: SaveService["state"]) => {
      const { frostedValley: _fv, frostedShop: _fs, stats: _st, ...rest } = s;
      return rest;
    };
    const before = gardenOnly(new SaveService(KEY).state);
    new SaveService(KEY).resetFrostedValley();
    const reloaded = new SaveService(KEY).state;
    expect(gardenOnly(reloaded)).toEqual(before);
    expect(reloaded.coins).toBe(777);
    expect(reloaded.objects.rabbit.is_unlocked).toBe(true);
    expect(reloaded.introSeen && reloaded.openingGardenTourSeen).toBe(true);
    expect(reloaded.lettersSeen.frosted_valley_invite).toBe(true);
    expect(reloaded.frostedValley.currentAnimalIndex).toBe(0);
  });

  it("Dream Garden's own reset still never touches Frosted Valley", () => {
    const save = playedSave();
    save.reset();
    expect(save.state.frostedValley.currentAnimalIndex).toBe(3);
    expect(save.state.frostedShop.petOwned.pet_tiara).toBe(true);
  });
});
