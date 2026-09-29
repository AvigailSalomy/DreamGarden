/**
 * Pure enemy-targeting logic for the Garden Maze — deliberately separate
 * from Phaser: given a personality and the current situation, decide which
 * CELL an enemy should path toward this tick. The scene still owns actual
 * movement (BFS-stepping one cell toward whatever this returns) and all
 * timers (scatter/chase phase, the wanderer's patrol/chase toggle) — this
 * module only answers "where do I want to go", which is what makes it easy
 * to unit-test without spinning up a scene.
 */

export type EnemyPersonality = "chaser" | "ambusher" | "flanker" | "wanderer";
export type EnemyPhase = "chase" | "scatter";
export type Cell = { row: number; col: number };

export interface EnemyAIState {
  personality: EnemyPersonality;
  cell: Cell;
  /** Where this enemy retreats to during the SCATTER phase — spreads enemies out so they don't permanently converge. */
  homeCorner: Cell;
  /** Wanderer only: is it currently in its unpredictable patrol sub-state (true) or actively chasing (false)? Owned/toggled by the caller's own timer. */
  wanderPatrolling: boolean;
  /** Wanderer only: the patrol destination while wanderPatrolling is true. */
  wanderTarget?: Cell;
}

/**
 * Predicts a few steps ahead of the player along their last movement
 * direction, clamped to valid path cells — an AMBUSHER aims here instead of
 * the player's current cell, so it tries to cut them off rather than trail
 * behind.
 */
function predictAhead(playerCell: Cell, lastDir: Cell, steps: number, isPath: (r: number, c: number) => boolean): Cell {
  let { row, col } = playerCell;
  if (lastDir.row === 0 && lastDir.col === 0) return playerCell;
  for (let i = 0; i < steps; i++) {
    const nr = row + lastDir.row;
    const nc = col + lastDir.col;
    if (!isPath(nr, nc)) break;
    row = nr;
    col = nc;
  }
  return { row, col };
}

/**
 * Aims for a cell on the far side of the player relative to where this
 * enemy currently is, so a FLANKER's route tends to differ from a chaser
 * bearing straight down on the player — approximates "coming from another
 * route" without real multi-route path planning.
 */
function flankTarget(enemyCell: Cell, playerCell: Cell, isPath: (r: number, c: number) => boolean): Cell {
  const dr = playerCell.row - enemyCell.row;
  const dc = playerCell.col - enemyCell.col;
  const signR = dr === 0 ? 1 : Math.sign(dr);
  const signC = dc === 0 ? 1 : Math.sign(dc);
  const candidates: Cell[] = [
    { row: playerCell.row + signR * 2, col: playerCell.col + signC * 2 },
    { row: playerCell.row + signR * 2, col: playerCell.col },
    { row: playerCell.row, col: playerCell.col + signC * 2 },
  ];
  for (const c of candidates) {
    if (isPath(c.row, c.col)) return c;
  }
  return playerCell;
}

export function chooseTargetCell(
  state: EnemyAIState,
  playerCell: Cell,
  playerLastDir: Cell,
  phase: EnemyPhase,
  isPath: (row: number, col: number) => boolean,
): Cell {
  if (phase === "scatter") return state.homeCorner;

  switch (state.personality) {
    case "chaser":
      return playerCell;
    case "ambusher":
      return predictAhead(playerCell, playerLastDir, 4, isPath);
    case "flanker":
      return flankTarget(state.cell, playerCell, isPath);
    case "wanderer":
      if (state.wanderPatrolling && state.wanderTarget) return state.wanderTarget;
      return playerCell;
  }
}
