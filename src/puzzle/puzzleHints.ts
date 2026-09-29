/**
 * Hint rules for the Frosted Valley reward puzzles. Phaser-free so the pricing
 * and piece choice can be unit tested.
 *
 * Scope: ONE puzzle attempt. Nothing here is saved — leaving and reopening a
 * puzzle is a fresh attempt (the pieces are re-scattered too), and hint usage
 * never touches animal progression. Paid hints spend the shared economy coins.
 */

export const PIECE_HINT_FREE = 2;
export const IMAGE_HINT_FREE = 1;
export const HINT_COST = 20;
export const IMAGE_HINT_SECONDS = 10;

export type HintKind = "image" | "piece";

export interface Wallet {
  readonly coins: number;
  canAfford(amount: number): boolean;
  spend(amount: number, reason: string): boolean;
}

export class PuzzleHintSession {
  private used: Record<HintKind, number> = { image: 0, piece: 0 };

  constructor(private wallet: Wallet) {}

  private freeFor(kind: HintKind): number {
    return kind === "piece" ? PIECE_HINT_FREE : IMAGE_HINT_FREE;
  }

  /** Free uses of this kind still left this attempt. */
  freeLeft(kind: HintKind): number {
    return Math.max(0, this.freeFor(kind) - this.used[kind]);
  }

  /** What the NEXT use of this kind costs (0 = free). */
  priceOf(kind: HintKind): number {
    return this.freeLeft(kind) > 0 ? 0 : HINT_COST;
  }

  canUse(kind: HintKind): boolean {
    const price = this.priceOf(kind);
    return price === 0 || this.wallet.canAfford(price);
  }

  usedCount(kind: HintKind): number {
    return this.used[kind];
  }

  /**
   * Consume one hint: free while free ones remain, otherwise spends exactly
   * HINT_COST coins. Returns false (and charges nothing) when unaffordable.
   */
  use(kind: HintKind): { ok: boolean; paid: number } {
    const price = this.priceOf(kind);
    if (price > 0 && !this.wallet.spend(price, `frosted:puzzleHint:${kind}`)) return { ok: false, paid: 0 };
    this.used[kind]++;
    return { ok: true, paid: price };
  }
}

export interface HintCandidate {
  index: number;
  placed: boolean;
  dragging: boolean;
  /** Already pointed out earlier in this attempt. */
  hinted: boolean;
  /** Whole piece is on screen (not tucked under the header / off an edge). */
  onScreen: boolean;
  /** Border pieces (a straight edge) are the easiest to recognise. */
  border: boolean;
  /** How many of its board neighbours are already placed — its slot is easy to read. */
  placedNeighbours: number;
}

/**
 * Pick the most useful piece to point out: never a placed or held piece;
 * strongly prefer one not hinted before, then one that's visible, then one
 * whose destination is easy to read (placed neighbours) or that is itself
 * easy to recognise (a border piece). `rng` only breaks ties.
 */
export function chooseHintPiece(cands: HintCandidate[], rng: () => number): number | null {
  let best: number | null = null;
  let bestScore = -Infinity;
  for (const c of cands) {
    if (c.placed || c.dragging) continue;
    const score =
      (c.hinted ? 0 : 100) + (c.onScreen ? 20 : 0) + Math.min(3, c.placedNeighbours) * 4 + (c.border ? 3 : 0) + rng();
    if (score > bestScore) {
      bestScore = score;
      best = c.index;
    }
  }
  return best;
}
