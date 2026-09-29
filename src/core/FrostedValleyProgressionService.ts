import type { Emitter } from "./EventBus";
import type { GameEvents } from "./events";
import type { SaveService } from "./SaveService";
import type { EconomyService } from "./EconomyService";
import { drawFromDeck } from "../data/mazeRun";
import type { FrostedAnimalDef, FrostedAnimalProgress, FrostedResourceProgress } from "../data/types";

/**
 * Owns Frosted Valley's own sequential progression: which animal is currently
 * active (every other animal is locked and non-interactive), each animal's
 * per-resource collection progress, restoration state, and one-time rescue
 * rewards. Entirely separate from Garden's ProgressionService and SaveState
 * fields — see FrostedValleySaveState.
 *
 * Same idempotency pattern as ProgressionService.recordPuzzleCompletion:
 * mutate state, save immediately, THEN let the caller play any animation —
 * a reload mid-animation can never re-grant a reward or re-reveal an animal.
 */
export class FrostedValleyProgressionService {
  constructor(
    private save: SaveService,
    private economy: EconomyService,
    private bus: Emitter<GameEvents>,
    private catalog: FrostedAnimalDef[],
  ) {}

  private slice() {
    return this.save.state.frostedValley;
  }

  private progress(animalId: string): FrostedAnimalProgress {
    const s = this.slice();
    let p = s.animals[animalId];
    if (!p) {
      p = { resources: {}, rescued: false, rewardClaimed: false, letterSeen: false };
      s.animals[animalId] = p;
    }
    return p;
  }

  private resourceProgress(animalId: string, resourceId: string): FrostedResourceProgress {
    const p = this.progress(animalId);
    let r = p.resources[resourceId];
    if (!r) {
      r = { current: 0, restored: false };
      p.resources[resourceId] = r;
    }
    return r;
  }

  def(animalId: string): FrostedAnimalDef | undefined {
    return this.catalog.find((a) => a.id === animalId);
  }

  /** The one animal the player can currently interact with — every later one is locked. */
  get currentAnimal(): FrostedAnimalDef | null {
    return this.catalog[this.slice().currentAnimalIndex] ?? null;
  }

  isCurrentAnimal(animalId: string): boolean {
    return this.currentAnimal?.id === animalId;
  }

  /**
   * Every animal the player has actually met in the world so far — already
   * rescued ones, plus the current one (its silhouette/letter is live even
   * before it's rescued). Animals later than `currentAnimalIndex` are still
   * unrevealed silhouettes the player hasn't unlocked yet. Used by the
   * Shop's "try it out" animal picker so it only ever offers real, met
   * animals — never a future locked one.
   */
  unlockedAnimals(): FrostedAnimalDef[] {
    const idx = this.slice().currentAnimalIndex;
    return this.catalog.filter((a) => a.order <= idx);
  }

  isRescued(animalId: string): boolean {
    return !!this.slice().animals[animalId]?.rescued;
  }

  /** True once every resource belonging to this animal has been restored. */
  isFullyRestored(animalId: string): boolean {
    const def = this.def(animalId);
    if (!def) return false;
    return def.resources.every((r) => this.resourceProgress(animalId, r.id).restored);
  }

  resourceState(animalId: string, resourceId: string): FrostedResourceProgress {
    return this.resourceProgress(animalId, resourceId);
  }

  /** Add collected units toward a resource (from the future Garden Maze minigame). Clamped, saved immediately. */
  addResourceProgress(animalId: string, resourceId: string, amount: number): void {
    // a locked (non-current) animal's resources can never start collecting —
    // "resource acquisition cannot start" for future animals
    if (!this.isCurrentAnimal(animalId)) return;
    const def = this.def(animalId);
    const resDef = def?.resources.find((r) => r.id === resourceId);
    if (!resDef) return;
    const r = this.resourceProgress(animalId, resourceId);
    if (r.restored) return; // already restored — nothing left to collect
    r.current = Math.min(resDef.requiredAmount, r.current + amount);
    this.save.saveNow();
    this.bus.emit("frosted:resourceProgress", { animalId, resourceId, current: r.current, required: resDef.requiredAmount });
  }

  /**
   * A Garden Maze run was WON — every mission item collected in one life.
   * Only this ever counts: partial runs (died, exited) are never saved.
   */
  completeMazeRun(animalId: string, resourceId: string): void {
    const resDef = this.def(animalId)?.resources.find((r) => r.id === resourceId);
    if (!resDef) return;
    this.addResourceProgress(animalId, resourceId, resDef.requiredAmount);
  }

  /** Has the Garden Maze's one-time "How to play" card been dismissed? */
  isMazeTutorialSeen(): boolean {
    return !!this.slice().mazeTutorialSeen;
  }

  markMazeTutorialSeen(): void {
    if (this.slice().mazeTutorialSeen) return;
    this.slice().mazeTutorialSeen = true;
    this.save.saveNow();
  }

  /**
   * The next maze to play, from a persisted shuffle deck: every maze once
   * before any repeats, reshuffled when empty, never the one just played.
   */
  drawMaze(allIds: string[], rand: () => number = Math.random, allowed?: (id: string) => boolean): string {
    const s = this.slice();
    const { id, deck } = drawFromDeck(s.mazeDeck ?? [], allIds, rand, s.lastMazeId, allowed);
    s.mazeDeck = deck;
    s.lastMazeId = id;
    this.save.saveNow();
    return id;
  }

  canRestore(animalId: string, resourceId: string): boolean {
    const def = this.def(animalId);
    const resDef = def?.resources.find((r) => r.id === resourceId);
    if (!resDef) return false;
    const r = this.resourceProgress(animalId, resourceId);
    return !r.restored && r.current >= resDef.requiredAmount;
  }

  /**
   * The explicit player-pressed Restore action — never automatic just because
   * the minigame finished. Flips damaged→restored for this one resource.
   */
  restoreResource(animalId: string, resourceId: string): boolean {
    if (!this.canRestore(animalId, resourceId)) return false;
    const r = this.resourceProgress(animalId, resourceId);
    r.restored = true;
    this.save.saveNow();
    this.bus.emit("frosted:resourceRestored", { animalId, resourceId });
    return true;
  }

  /**
   * The reward puzzle only exists once EVERY requirement of the current animal
   * is restored, and only until its unlock has been committed.
   */
  isPuzzleAvailable(animalId: string): boolean {
    return this.isCurrentAnimal(animalId) && this.isFullyRestored(animalId) && !this.isRescued(animalId);
  }

  isPuzzleSolved(animalId: string): boolean {
    return !!this.slice().animals[animalId]?.puzzleSolved;
  }

  /**
   * The jigsaw's last piece just snapped. Persisted immediately, so a reload
   * during the living-artwork beat or the unlock cinematic resumes at the
   * cinematic rather than asking for the puzzle again.
   */
  markPuzzleSolved(animalId: string): boolean {
    if (!this.isPuzzleAvailable(animalId)) return false;
    const p = this.progress(animalId);
    if (p.puzzleSolved) return false;
    p.puzzleSolved = true;
    this.save.saveNow();
    return true;
  }

  /** Solved puzzle whose unlock cinematic hasn't completed yet (e.g. the tab was closed mid-way). */
  isUnlockPending(animalId: string): boolean {
    return this.isPuzzleSolved(animalId) && !this.isRescued(animalId) && this.isCurrentAnimal(animalId);
  }

  /**
   * Called as the unlock cinematic ends: the animal becomes a permanent NPC.
   * Awards the coin reward exactly once, advances currentAnimalIndex, and
   * commits before any next-habitat hand-off plays.
   */
  rescueAnimal(animalId: string): { rescuedNow: boolean } {
    const def = this.def(animalId);
    // gated on being the CURRENT animal, not just on its own resources being
    // restored — future animals' resources must never be collectible before
    // their turn, but this is the defensive backstop at the service layer —
    // and on its reward puzzle actually having been solved
    if (!def || !this.isCurrentAnimal(animalId) || !this.isFullyRestored(animalId) || !this.isPuzzleSolved(animalId)) {
      return { rescuedNow: false };
    }
    const p = this.progress(animalId);
    if (p.rescued) return { rescuedNow: false }; // already done — ignore stray repeats

    p.rescued = true;
    if (!p.rewardClaimed) {
      p.rewardClaimed = true;
      this.economy.add(def.coinReward, "frosted:rescue");
    }
    const s = this.slice();
    if (s.currentAnimalIndex === def.order) s.currentAnimalIndex = def.order + 1;
    this.save.saveNow();

    this.bus.emit("frosted:animalRescued", { animalId });
    return { rescuedNow: true };
  }

  /** Has THIS animal's own introductory letter been shown yet (the rabbit's doubles as the game's intro)? */
  isLetterSeen(animalId: string): boolean {
    return this.progress(animalId).letterSeen;
  }

  markLetterSeen(animalId: string): void {
    const p = this.progress(animalId);
    if (p.letterSeen) return;
    p.letterSeen = true;
    this.save.saveNow();
  }

  /** Has this one-time story/tutorial note (see data/frostedStory.ts) already been shown? */
  isStoryNoteSeen(noteId: string): boolean {
    return !!this.slice().storyNotesSeen?.[noteId];
  }

  markStoryNoteSeen(noteId: string): void {
    const s = this.slice();
    if (s.storyNotesSeen?.[noteId]) return;
    (s.storyNotesSeen ??= {})[noteId] = true;
    this.save.saveNow();
  }

  isValleyComplete(): boolean {
    return this.catalog.every((a) => this.isRescued(a.id));
  }
}
