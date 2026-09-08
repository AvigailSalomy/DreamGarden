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
