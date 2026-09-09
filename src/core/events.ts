import type { GridSize } from "../puzzle/slice";

/** The full set of cross-scene events. Payloads are data only — never Phaser objects. */
export interface GameEvents {
  /** `force` = an explicit user action (e.g. the Requests "Complete Puzzle" button) that
   *  must launch the puzzle even if a stale entry-flow flag is still set. */
  "puzzle:start": { objectId: string; force?: boolean };
  "puzzle:closed": { objectId: string; solved: boolean; unlockedNow: boolean };
  "puzzle:solved": { objectId: string; puzzleIndex: number; grid: GridSize };
  "progress:updated": {
    objectId: string;
    completed: number;
    required: number;
  };
  "object:unlock": { objectId: string };
  "reveal:coins": { worldX: number; worldY: number; amount: number };
  "reveal:done": { objectId: string };
  "letter:done": { objectId: string };
  "task:changed": { objectId: string | null };
  "coins:changed": { total: number; delta: number; reason: string };
  "requests:open": { objectId: string };
  "requests:closed": { objectId: string };
  "request:purchased": { objectId: string; requestId: string };
  "minigame:completed": { objectId: string; level: number; coinsEarned: number };
}
