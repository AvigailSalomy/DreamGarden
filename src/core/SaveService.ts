import { SAVE_KEY, SAVE_VERSION, STARTING_COINS } from "../game/config";
import type { FrostedShopSaveState, FrostedValleySaveState, SaveState, ShopSaveState } from "../data/types";
import { CATALOG } from "../data/objects";

function freshShopState(): ShopSaveState {
  return {
    unlocked: false,
    dailyDate: "",
    dailyItemIds: [],
    decorInventory: {},
    placedDecor: [],
    ownedAccessories: [],
    equippedAccessories: {},
    mysteryGiftsOpened: 0,
    hintsOwned: 0,
  };
}


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
    resources: {},
    restoredSources: {},
    frostedValley: freshFrostedValley(),
    frostedShop: freshFrostedShop(),
    stats: { puzzlesSolved: 0, startedAt: now, lastPlayed: now },
    shop: freshShopState(),
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

  const rawObjects = d.objects && typeof d.objects === "object" ? d.objects : {};
  // Drop any stale per-object progress for ids no longer in CATALOG — in
  // particular a pre-existing save's "wildflowers" entry (the standalone
  // Wildflowers progression task was removed; a save from before that removal
  // must never let a leftover entry for it affect anything going forward).
  const catalogIds = new Set(CATALOG.map((o) => o.id));
  const objects = Object.fromEntries(Object.entries(rawObjects).filter(([id]) => catalogIds.has(id)));
  const hadProgress =
    (typeof d.currentTaskIndex === "number" && d.currentTaskIndex > 0) ||
    Object.keys(objects).length > 0;

  // currentTaskIndex is DERIVED, not trusted verbatim: a raw stored index can
  // point at the wrong animal after CATALOG's shape changes (exactly what
  // removing the Wildflowers slot did to every existing save — its index and
  // everything after it shifted down by one). The correct index is always
  // "how many CATALOG animals, in order, are already unlocked".
  const currentTaskIndex = CATALOG.findIndex((o) => !objects[o.id]?.is_unlocked);

  return {
    saveVersion: SAVE_VERSION,
    coins: typeof d.coins === "number" ? d.coins : base.coins,
    currentTaskIndex: currentTaskIndex === -1 ? CATALOG.length : currentTaskIndex,
    introSeen: !!d.introSeen,
    openingGardenTourSeen: !!d.openingGardenTourSeen || hadProgress,
    lettersSeen:
      d.lettersSeen && typeof d.lettersSeen === "object" ? d.lettersSeen : {},
    objects,
    requests: d.requests && typeof d.requests === "object" ? d.requests : {},
    minigame: d.minigame && typeof d.minigame === "object" ? d.minigame : {},
    // absent in any save from before the habitat-resource system existed —
    // defaults to empty, never corrupts/loses older progress
    resources: d.resources && typeof d.resources === "object" ? d.resources : {},
    restoredSources:
      d.restoredSources && typeof d.restoredSources === "object" ? d.restoredSources : {},
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
    shop: sanitizeShop({
      ...base.shop,
      ...(d.shop && typeof d.shop === "object" ? d.shop : {}),
    }),
  };
}

/** Older saves have no hint inventory (-> 0); never let a bad value go negative/fractional. */
function sanitizeShop(shop: ShopSaveState): ShopSaveState {
  const h = shop.hintsOwned;
  shop.hintsOwned = typeof h === "number" && Number.isFinite(h) && h > 0 ? Math.floor(h) : 0;
  return shop;
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

  /** "Start New Garden": wipes every Dream Garden field (and resets the shared
   *  coin wallet), but NEVER Frosted Valley — the other world's progression and
   *  Winter Market placements are carried over untouched. */
  reset(): void {
    const { frostedValley, frostedShop } = this.state;
    this.state = { ...freshSave(), frostedValley, frostedShop };
    this.saveNow();
  }

  /** Frosted Valley's own "Start New Garden" — the mirror of reset(): wipes
   *  that world's progression (animals, resources, maze deck, story notes)
   *  and its Winter Market state (placed decorations, owned/equipped pet
   *  accessories), but NEVER Dream Garden or the shared coin wallet. The
   *  valley stays open: its lock is Dream Garden's completion, untouched here. */
  resetFrostedValley(): void {
    this.state.frostedValley = freshFrostedValley();
    this.state.frostedShop = freshFrostedShop();
    this.saveNow();
  }
}
