import { SAVE_KEY, SAVE_VERSION, STARTING_COINS } from "../game/config";
import type { FrostedShopSaveState, FrostedValleySaveState, SaveState } from "../data/types";

function freshFrostedValley(): FrostedValleySaveState {
  return { currentAnimalIndex: 0, animals: {}, mazeTutorialSeen: false, mazeDeck: [], storyNotesSeen: {} };
}

function freshFrostedShop(): FrostedShopSaveState {
  return { placements: [], petOwned: {}, equipped: {} };
}

export function freshSave(): SaveState {
  const now = Date.now();
  return {
    saveVersion: SAVE_VERSION,
    coins: STARTING_COINS,
    currentTaskIndex: 0,
    introSeen: false,
    openingGardenTourSeen: false,
    lettersSeen: {},
    objects: {},
    requests: {},
    minigame: {},
    frostedValley: freshFrostedValley(),
    frostedShop: freshFrostedShop(),
    stats: { puzzlesSolved: 0, startedAt: now, lastPlayed: now },
  };
}

/**
 * Bring any older / partial blob up to the current shape without losing data.
 * Milestone 2 saves (no openingGardenTourSeen / lettersSeen) load fine: a player
 * who already has progress is treated as having seen the opening tour so it never
 * replays for them.
 */
export function migrate(data: unknown): SaveState {
  const base = freshSave();
  if (!data || typeof data !== "object") return base;
  const d = data as Partial<SaveState>;

  const objects = d.objects && typeof d.objects === "object" ? d.objects : {};
  const hadProgress =
    (typeof d.currentTaskIndex === "number" && d.currentTaskIndex > 0) ||
    Object.keys(objects).length > 0;

  return {
    saveVersion: SAVE_VERSION,
    coins: typeof d.coins === "number" ? d.coins : base.coins,
    currentTaskIndex:
      typeof d.currentTaskIndex === "number" ? d.currentTaskIndex : base.currentTaskIndex,
    introSeen: !!d.introSeen,
    openingGardenTourSeen: !!d.openingGardenTourSeen || hadProgress,
    lettersSeen:
      d.lettersSeen && typeof d.lettersSeen === "object" ? d.lettersSeen : {},
    objects,
    requests: d.requests && typeof d.requests === "object" ? d.requests : {},
    minigame: d.minigame && typeof d.minigame === "object" ? d.minigame : {},
    frostedValley:
      d.frostedValley && typeof d.frostedValley === "object"
        ? {
            currentAnimalIndex:
              typeof d.frostedValley.currentAnimalIndex === "number" ? d.frostedValley.currentAnimalIndex : 0,
            animals:
              d.frostedValley.animals && typeof d.frostedValley.animals === "object" ? d.frostedValley.animals : {},
            mazeTutorialSeen: !!d.frostedValley.mazeTutorialSeen,
            mazeDeck: Array.isArray(d.frostedValley.mazeDeck)
              ? d.frostedValley.mazeDeck.filter((id): id is string => typeof id === "string")
              : [],
            lastMazeId: typeof d.frostedValley.lastMazeId === "string" ? d.frostedValley.lastMazeId : undefined,
            storyNotesSeen:
              d.frostedValley.storyNotesSeen && typeof d.frostedValley.storyNotesSeen === "object"
                ? d.frostedValley.storyNotesSeen
                : {},
          }
        : freshFrostedValley(),
    frostedShop:
      d.frostedShop && Array.isArray(d.frostedShop.placements)
        ? {
            placements: d.frostedShop.placements,
            petOwned: d.frostedShop.petOwned && typeof d.frostedShop.petOwned === "object" ? d.frostedShop.petOwned : {},
            equipped: d.frostedShop.equipped && typeof d.frostedShop.equipped === "object" ? d.frostedShop.equipped : {},
          }
        : freshFrostedShop(),
    stats: { ...base.stats, ...(d.stats ?? {}) },
  };
}

/**
 * localStorage-backed persistence. The in-memory `state` is the working truth;
 * localStorage is a mirror. Every read/write is guarded so private-mode / disabled
 * storage never crashes the game.
 */
export class SaveService {
  state: SaveState;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private storageOk = true;

  constructor(private key: string = SAVE_KEY) {
    this.state = this.load();
  }

  load(): SaveState {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) return freshSave();
      return migrate(JSON.parse(raw));
    } catch {
      this.storageOk = false;
      return freshSave();
    }
  }

  /** Debounced write for frequent, non-critical changes. */
  save(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.saveNow(), 400);
  }

  /** Immediate write — call this the instant progression truth changes. */
  saveNow(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.state.stats.lastPlayed = Date.now();
    try {
      localStorage.setItem(
        this.key,
        JSON.stringify({ ...this.state, saveVersion: SAVE_VERSION }),
      );
      this.storageOk = true;
    } catch {
      this.storageOk = false;
    }
  }

  get canPersist(): boolean {
    return this.storageOk;
  }

  reset(): void {
    this.state = freshSave();
    this.saveNow();
  }
}
