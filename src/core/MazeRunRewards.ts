/** One receipt per run. Pickups are credited immediately; only a successful
 * finish grants resources/leaf bonus. Closing or repeated callbacks cannot pay twice. */
export class MazeRunRewards {
  private pickups = new Set<string>();
  private settled = false;
  coins = 0;
  constructor(private credit: (amount: number) => void, private success: () => void) {}
  collect(id: string, value: number): boolean {
    if (this.settled || this.pickups.has(id) || !Number.isFinite(value) || value <= 0) return false;
    this.pickups.add(id);
    this.coins += value;
    this.credit(value);
    return true;
  }
  finish(won: boolean): boolean {
    if (this.settled) return false;
    this.settled = true;
    if (won) this.success();
    return true;
  }
}
