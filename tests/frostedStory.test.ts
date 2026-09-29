import { beforeEach, describe, expect, it } from "vitest";
import { Emitter } from "../src/core/EventBus";
import type { GameEvents } from "../src/core/events";
import { SaveService, migrate } from "../src/core/SaveService";
import { EconomyService } from "../src/core/EconomyService";
import { FrostedValleyProgressionService } from "../src/core/FrostedValleyProgressionService";
import { FROSTED_CATALOG } from "../src/data/frostedValley";
import {
  FROSTED_STORY,
  MAZE_HIT_TUTORIAL_ID,
  PUZZLE_TUTORIAL,
  mazeHitTutorial,
  nextActionableResource,
  shouldShowNote,
  storyFor,
} from "../src/data/frostedStory";

const KEY = "dreamgarden.save.storytest";

function makeStack() {
  const bus = new Emitter<GameEvents>();
  const save = new SaveService(KEY);
  save.reset();
  const economy = new EconomyService(save, bus);
  const frosted = new FrostedValleyProgressionService(save, economy, bus, FROSTED_CATALOG);
  return { save, frosted };
}

const def = (id: string) => FROSTED_CATALOG.find((a) => a.id === id)!;

beforeEach(() => localStorage.clear());

describe("Frosted Valley story notes — data", () => {
  it("every one of the six animals has a story for every requirement, in catalog order", () => {
    for (const a of FROSTED_CATALOG) {
      const story = storyFor(a.id)!;
      expect(story, a.id).toBeDefined();
      expect(Object.keys(story.requirements), a.id).toEqual(a.resources.map((r) => r.id));
    }
  });

  it("uses the persisted ids the spec names", () => {
    const r = FROSTED_STORY.fv_rabbit;
    const f = FROSTED_STORY.fv_fox;
    expect([r.intro.id, r.requirements.well.note.id, r.requirements.carrots.note.id, r.requirements.chime.note.id, r.allRestored.id]).toEqual([
      "rabbit_intro_seen",
      "rabbit_well_note_seen",
      "rabbit_carrot_note_seen",
      "rabbit_wind_chime_note_seen",
      "rabbit_all_requirements_note_seen",
    ]);
    expect([f.intro.id, f.requirements.ice.note.id, f.requirements.signpost.note.id, f.allRestored.id]).toEqual([
      "fox_intro_seen",
      "fox_ice_note_seen",
      "fox_signpost_note_seen",
      "fox_all_requirements_note_seen",
    ]);
    expect(MAZE_HIT_TUTORIAL_ID).toBe("pacman_hit_tutorial_seen");
    expect(PUZZLE_TUTORIAL.id).toBe("puzzle_tutorial_seen");
  });

  it("mission amounts match the spec and the maze HUD goal text", () => {
    const amounts = (id: string) => Object.fromEntries(def(id).resources.map((r) => [r.id, r.requiredAmount]));
    expect(amounts("fv_rabbit")).toEqual({ well: 5, carrots: 5, chime: 4 });
    expect(amounts("fv_fox")).toEqual({ ice: 6, signpost: 4 });
    expect(amounts("fv_deer")).toEqual({ flowerbed: 4 });
    expect(amounts("fv_squirrel")).toEqual({ nest: 5, pool: 5, waterfall: 6 });
    expect(amounts("fv_polarbear")).toEqual({ crystal: 5, hole: 5, cave: 6 });
    expect(amounts("fv_penguin")).toEqual({ igloo: 5, iceberg: 5, slide: 6 });
    // every animal's HUD goal text actually names its own required amount —
    // catches a copy/paste mistake in the new Deer/Squirrel/Polar Bear/
    // Penguin story content just as much as it would in Rabbit/Fox's
    for (const a of FROSTED_CATALOG) {
      for (const r of a.resources) {
        expect(FROSTED_STORY[a.id].requirements[r.id].hudGoal, `${a.id}.${r.id}`).toContain(String(r.requiredAmount));
      }
    }
  });

  it("every objective / story note has a call-to-action; short tips don't", () => {
    for (const story of Object.values(FROSTED_STORY)) {
      for (const n of [story.intro, story.allRestored, story.final, ...Object.values(story.requirements).map((r) => r.note)]) {
        expect(n.button, n.id).toBeTruthy();
        expect(n.title.length).toBeGreaterThan(2);
      }
    }
    const tip = mazeHitTutorial(2);
    expect(tip.button).toBeUndefined();
    expect(tip.body).toContain("2");
    expect(tip.durationMs).toBeLessThanOrEqual(3000);
  });

  it("the all-restored note is re-showable (it's the puzzle gateway); the rest are one-time", () => {
    expect(FROSTED_STORY.fv_rabbit.allRestored.once).toBe(false);
    expect(FROSTED_STORY.fv_rabbit.intro.once).toBe(true);
    expect(shouldShowNote(FROSTED_STORY.fv_rabbit.allRestored, () => true)).toBe(true);
    expect(shouldShowNote(FROSTED_STORY.fv_rabbit.intro, () => true)).toBe(false);
    expect(shouldShowNote(FROSTED_STORY.fv_rabbit.intro, () => false)).toBe(true);
  });
});

describe("Frosted Valley story notes — progression gating", () => {
  it("only the first unrestored requirement is actionable: Well → Carrot Patch → Wind Chime", () => {
    const { frosted } = makeStack();
    const rabbit = def("fv_rabbit");
    const next = () => nextActionableResource(rabbit, (id) => frosted.resourceState("fv_rabbit", id).restored);
    expect(next()).toBe("well");
    for (const [id, after] of [
      ["well", "carrots"],
      ["carrots", "chime"],
      ["chime", null],
    ] as const) {
      frosted.addResourceProgress("fv_rabbit", id, 99);
      expect(frosted.restoreResource("fv_rabbit", id)).toBe(true);
      expect(next()).toBe(after);
    }
    expect(frosted.isPuzzleAvailable("fv_rabbit")).toBe(true);
  });

  it("the fox's order is Cracked Ice → Signpost", () => {
    const fox = def("fv_fox");
    const restored = new Set<string>();
    expect(nextActionableResource(fox, (id) => restored.has(id))).toBe("ice");
    restored.add("ice");
    expect(nextActionableResource(fox, (id) => restored.has(id))).toBe("signpost");
  });
});

describe("Frosted Valley story notes — persistence", () => {
  it("seen flags survive a reload through the existing save", () => {
    const { frosted } = makeStack();
    expect(frosted.isStoryNoteSeen("rabbit_intro_seen")).toBe(false);
    frosted.markStoryNoteSeen("rabbit_intro_seen");
    frosted.markStoryNoteSeen(MAZE_HIT_TUTORIAL_ID);

    const reloaded = new SaveService(KEY);
    expect(reloaded.state.frostedValley.storyNotesSeen).toEqual({ rabbit_intro_seen: true, pacman_hit_tutorial_seen: true });
  });

  it("older saves without the field migrate cleanly and keep their other progress", () => {
    const old = migrate({
      frostedValley: { currentAnimalIndex: 1, animals: { fv_rabbit: { resources: {}, rescued: true, rewardClaimed: true, letterSeen: true } }, mazeTutorialSeen: true, mazeDeck: [] },
    });
    expect(old.frostedValley.storyNotesSeen).toEqual({});
    expect(old.frostedValley.currentAnimalIndex).toBe(1);
    expect(old.frostedValley.animals.fv_rabbit.rescued).toBe(true);
  });
});
