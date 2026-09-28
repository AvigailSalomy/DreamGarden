import type { Emitter } from "./EventBus";
import type { GameEvents } from "./events";
import type { SaveService } from "./SaveService";
import type { EconomyService } from "./EconomyService";
import type { GardenObjectDef, MiniGameProgress, RequestsVM } from "../data/types";

export type PurchaseResult =
  | { ok: true }
  | { ok: false; reason: "already_owned" | "insufficient_coins" | "unknown_request" };

/**
 * Owns the per-object "requests" economy: which requests are purchased, whether
 * an object's requests are fully bought (the puzzle-unlock gate), and the
 * per-object Catch & Collect level counter. Mirrors ProgressionService's shape —
 * logical state is committed to disk immediately, presentation reads it after.
 */
export class RequestsService {
  constructor(
    private save: SaveService,
    private economy: EconomyService,
    private bus: Emitter<GameEvents>,
    private catalog: GardenObjectDef[],
  ) {}

  def(id: string): GardenObjectDef | undefined {
    return this.catalog.find((o) => o.id === id);
  }

  private purchasedIdsRaw(objectId: string): string[] {
    return this.save.state.requests[objectId] ?? [];
  }

  purchasedIds(objectId: string): Set<string> {
    return new Set(this.purchasedIdsRaw(objectId));
  }

  isPurchased(objectId: string, requestId: string): boolean {
    return this.purchasedIdsRaw(objectId).includes(requestId);
  }

  progress(objectId: string): { completed: number; total: number } {
    const def = this.def(objectId);
    const total = def?.requests.length ?? 0;
    const completed = this.purchasedIdsRaw(objectId).length;
    return { completed, total };
  }

  isComplete(objectId: string): boolean {
    const { completed, total } = this.progress(objectId);
    return total > 0 && completed >= total;
  }

  vm(objectId: string): RequestsVM | null {
    const def = this.def(objectId);
    if (!def) return null;
    const purchased = this.purchasedIds(objectId);
    return {
      object: def,
      purchased,
      completed: purchased.size,
      total: def.requests.length,
      isComplete: def.requests.length > 0 && purchased.size >= def.requests.length,
    };
  }

  /** Buy one request for `objectId`. Commits immediately — this is a real transaction. */
  purchase(objectId: string, requestId: string): PurchaseResult {
    const def = this.def(objectId);
    const request = def?.requests.find((r) => r.id === requestId);
    if (!def || !request) return { ok: false, reason: "unknown_request" };
    if (this.isPurchased(objectId, requestId)) return { ok: false, reason: "already_owned" };
    if (!this.economy.canAfford(request.cost)) return { ok: false, reason: "insufficient_coins" };

    this.economy.spend(request.cost, `request:${requestId}`);
    const list = this.save.state.requests[objectId] ?? (this.save.state.requests[objectId] = []);
    list.push(requestId);
    this.save.saveNow();

    this.bus.emit("request:purchased", { objectId, requestId });
    return { ok: true };
  }

  /* ---------------- habitat-resource economy (data/resources.ts + data/habitats.ts) ---------------- */

  resourceCount(resourceId: string): number {
    return this.save.state.resources[resourceId] ?? 0;
  }

  /** Add to the real, persisted resource inventory — called when the player
   *  taps a RESTORED resource source in the world (see GardenScene), or a future minigame reward. */
  collectResource(resourceId: string, amount = 1): number {
    const total = (this.save.state.resources[resourceId] ?? 0) + amount;
    this.save.state.resources[resourceId] = total;
    this.save.saveNow();
    this.bus.emit("resource:collected", { resourceId, amount, total });
    return total;
  }

  isSourceRestored(sourceId: string): boolean {
    return !!this.save.state.restoredSources[sourceId];
  }

  /**
   * Live progress toward restoring one habitat resource source — a real
   * inventory count, not a fake UI number. This is the POST-rescue Request
   * Page mechanic (data/habitats.ts RestorationResource), entirely separate
   * from `purchase()` (the PRE-rescue, coin-based puzzle-unlock gate) — the
   * two are never mixed.
   */
  restoreProgress(source: { id: string; produces: string; restoreCost: number }): { have: number; need: number } {
    return { have: this.resourceCount(source.produces), need: source.restoreCost };
  }

  canRestoreSource(source: { id: string; produces: string; restoreCost: number }): boolean {
    if (this.isSourceRestored(source.id)) return false;
    const p = this.restoreProgress(source);
    return p.have >= p.need;
  }

  /** Consume the resource cost and mark this specific world resource source
   *  restored. Commits immediately — a real transaction, same as every other
   *  save-truth change in this service. */
  restoreSourceNow(source: { id: string; produces: string; restoreCost: number }): PurchaseResult {
    if (this.isSourceRestored(source.id)) return { ok: false, reason: "already_owned" };
    if (!this.canRestoreSource(source)) return { ok: false, reason: "insufficient_coins" };

    this.save.state.resources[source.produces] -= source.restoreCost;
    this.save.state.restoredSources[source.id] = true;
    this.save.saveNow();

    this.bus.emit("resourceSource:restored", { sourceId: source.id });
    return { ok: true };
  }

  private progressFor(objectId: string): MiniGameProgress {
    let p = this.save.state.minigame[objectId];
    if (!p) {
      p = { level: 1, roundsCompleted: 0 };
      this.save.state.minigame[objectId] = p;
    }
    return p;
  }

  minigameLevel(objectId: string): number {
    return this.progressFor(objectId).level;
  }

  /** Award coins for a completed Catch & Collect round and advance that object's level. */
  recordMinigameRound(objectId: string, coinsEarned: number): void {
    const p = this.progressFor(objectId);
    const level = p.level;
    p.roundsCompleted += 1;
    p.level += 1;
    this.economy.add(coinsEarned, "minigame");
    this.save.saveNow();
    this.bus.emit("minigame:completed", { objectId, level, coinsEarned });
  }
}
