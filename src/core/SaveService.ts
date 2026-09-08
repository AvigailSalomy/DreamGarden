import { SAVE_KEY, SAVE_VERSION, STARTING_COINS } from "../game/config";
import type { SaveState } from "../data/types";

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
