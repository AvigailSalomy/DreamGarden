import type { Emitter } from "./EventBus";
import type { GameEvents } from "./events";
import type { SaveService } from "./SaveService";
import type { EconomyService } from "./EconomyService";
import type { CurrentTaskVM, GardenObjectDef, ObjectProgress } from "../data/types";
import { DEFAULT_PROGRESSION } from "../data/progression";

/**
 * Owns "what is the player working on" and "what has been earned".
 * The logical unlock (is_unlocked, coins, currentTaskIndex) is committed to disk
 * *before* any reveal animation plays — animations are presentation, the save is truth.
 */
export class ProgressionService {
  constructor(
    private save: SaveService,
    private economy: EconomyService,
    private bus: Emitter<GameEvents>,
    private catalog: GardenObjectDef[],
  ) {}

  private prog(id: string): ObjectProgress {
    let p = this.save.state.objects[id];
    if (!p) {
      p = { puzzles_completed: 0, is_unlocked: false };
      this.save.state.objects[id] = p;
    }
    return p;
  }

  def(id: string): GardenObjectDef | undefined {
    return this.catalog.find((o) => o.id === id);
  }

  get currentTask(): GardenObjectDef | null {
    return this.catalog[this.save.state.currentTaskIndex] ?? null;
  }

  isUnlocked(id: string): boolean {
    return !!this.save.state.objects[id]?.is_unlocked;
  }

  completedCount(id: string): number {
    return this.save.state.objects[id]?.puzzles_completed ?? 0;
  }

  unlockedObjects(): GardenObjectDef[] {
    return this.catalog.filter((o) => this.isUnlocked(o.id));
  }

  isGardenComplete(): boolean {
    return this.catalog.every((o) => this.isUnlocked(o.id));
  }

  /** Animal-only rescue order, derived from each animal's `unlock_order`
   *  (Rabbit → Bird → Hedgehog → Squirrel → Fox → Deer) — the non-animal
   *  Wildflowers task interleaves elsewhere but never gates an animal. */
  animalOrder(): GardenObjectDef[] {
    return this.catalog
      .filter((o) => o.category === "animal")
      .sort((a, b) => a.unlock_order - b.unlock_order);
  }

  /** The one animal currently open for rescue — the first not-yet-unlocked
   *  animal in sequence — or null once every animal is rescued. */
  activeAnimalId(): string | null {
    return this.animalOrder().find((o) => !this.isUnlocked(o.id))?.id ?? null;
  }

  /** True for an animal whose turn hasn't come yet: not rescued, and not the
   *  current active animal. Rescued animals and the active one are never locked. */
  isAnimalLocked(id: string): boolean {
    const def = this.def(id);
    if (!def || def.category !== "animal" || this.isUnlocked(id)) return false;
    return id !== this.activeAnimalId();
  }

  taskVM(): CurrentTaskVM | null {
    const object = this.currentTask;
    if (!object) return null;
    const completed = this.completedCount(object.id);
    const required = object.puzzles_required;
    const nextGrid = object.puzzle.grids[Math.min(completed, required - 1)];
    const segments = Array.from({ length: required }, (_, i) => i < completed);
    return { object, completed, required, nextGrid, segments };
  }

  /**
   * Record one solved puzzle for the current object. Awards the per-puzzle bonus,
   * and if this was the final required puzzle: marks it unlocked, awards the reward
   * coins, advances the task pointer, and forces an immediate save.
   */
  recordPuzzleCompletion(id: string): { unlockedNow: boolean } {
    const def = this.def(id);
    if (!def) return { unlockedNow: false };

    const p = this.prog(id);
    if (p.puzzles_completed >= def.puzzles_required) {
      return { unlockedNow: false }; // already done — ignore stray repeats
    }
    p.puzzles_completed += 1;
    this.save.state.stats.puzzlesSolved += 1;
    this.economy.add(DEFAULT_PROGRESSION.perPuzzleBonus, "puzzle");

    let unlockedNow = false;
    if (p.puzzles_completed >= def.puzzles_required && !p.is_unlocked) {
      p.is_unlocked = true;
      this.economy.add(def.reward_coins, "unlock");
      this.save.state.currentTaskIndex += 1;
      unlockedNow = true;
    }

    this.save.saveNow(); // commit truth before any animation

    this.bus.emit("progress:updated", {
      objectId: id,
      completed: p.puzzles_completed,
      required: def.puzzles_required,
    });
    if (unlockedNow) this.bus.emit("object:unlock", { objectId: id });

    return { unlockedNow };
  }
}
