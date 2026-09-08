import type { Emitter } from "./EventBus";
import type { GameEvents } from "./events";
import type { SaveService } from "./SaveService";

/**
 * Coin balance. MVP only earns coins; `spend` exists so a shop can be added later
 * without touching the save shape or the loop.
 */
export class EconomyService {
  constructor(
    private save: SaveService,
    private bus: Emitter<GameEvents>,
  ) {}

  get coins(): number {
    return this.save.state.coins;
  }

  add(amount: number, reason: string): number {
    if (amount <= 0) return this.coins;
    this.save.state.coins += amount;
    this.save.save();
    this.bus.emit("coins:changed", {
      total: this.save.state.coins,
      delta: amount,
      reason,
    });
    return this.save.state.coins;
  }

  canAfford(amount: number): boolean {
    return this.save.state.coins >= amount;
  }

  spend(amount: number, reason: string): boolean {
    if (!this.canAfford(amount)) return false;
    this.save.state.coins -= amount;
    this.save.save();
    this.bus.emit("coins:changed", {
      total: this.save.state.coins,
      delta: -amount,
      reason,
    });
    return true;
  }
}
