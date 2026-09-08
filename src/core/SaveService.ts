import { SAVE_KEY, SAVE_VERSION } from "../game/config";
import type { SaveState } from "../data/types";

export function freshSave(): SaveState {
  const now = Date.now();
  return {
    saveVersion: SAVE_VERSION,
    coins: 0,
    currentTaskIndex: 0,
    introSeen: false,
    objects: {},
    stats: { puzzlesSolved: 0, startedAt: now, lastPlayed: now },
  };
}

/** Bring any older / partial blob up to the current shape without losing data. */
export function migrate(data: unknown): SaveState {
  const base = freshSave();
  if (!data || typeof data !== "object") return base;
  const d = data as Partial<SaveState>;
  return {
    saveVersion: SAVE_VERSION,
    coins: typeof d.coins === "number" ? d.coins : base.coins,
    currentTaskIndex:
      typeof d.currentTaskIndex === "number" ? d.currentTaskIndex : base.currentTaskIndex,
    introSeen: !!d.introSeen,
    objects: d.objects && typeof d.objects === "object" ? d.objects : {},
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
