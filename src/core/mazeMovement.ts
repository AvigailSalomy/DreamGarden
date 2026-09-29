/**
 * Garden Maze player collision — pure (Phaser-free) so it can be unit tested.
 *
 * The player is a circle (radius r) moving through a tile grid of 1-tile-wide
 * corridors. Without help, a player standing a few pixels off a corridor's
 * centre line at a junction cannot turn: e.g. coming DOWN a vertical corridor
 * slightly past a junction that opens to the RIGHT, the circle's lower edge
 * still sits in the downward corridor, so moving right would push it into the
 * solid wall block diagonally below-right and the move is (correctly) refused.
 * Pressing Up re-centres the player, which is why "Up then Right" used to be
 * the only way out.
 *
 * `moveWithCollision` therefore adds standard grid-maze CORNERING: when a move
 * along one axis is blocked but the tile in that direction is an open corridor,
 * the player eases toward that corridor's centre line by at most the same step
 * length (normal walking speed — never a snap), and only if the eased position
 * is itself collision-free. Walls stay fully solid.
 */

export interface CollisionGrid {
  walls: boolean[][];
  tileCols: number;
  tileRows: number;
}

export function isWallAt(grid: CollisionGrid, cell: number, worldX: number, worldY: number): boolean {
  const tx = Math.floor(worldX / cell);
  const ty = Math.floor(worldY / cell);
  if (ty < 0 || ty >= grid.tileRows || tx < 0 || tx >= grid.tileCols) return true;
  return grid.walls[ty][tx];
}

export function circleHitsWall(grid: CollisionGrid, cell: number, x: number, y: number, r: number): boolean {
  const d = r * 0.7;
  const pts: Array<[number, number]> = [
    [x - r, y],
    [x + r, y],
    [x, y - r],
    [x, y + r],
    [x - d, y - d],
    [x + d, y - d],
    [x - d, y + d],
    [x + d, y + d],
  ];
  return pts.some(([px, py]) => isWallAt(grid, cell, px, py));
}

/**
 * One axis blocked: if the neighbouring tile that way is open, slide the other
 * coordinate toward that corridor's centre by at most `step`. Returns the new
 * perpendicular coordinate, or null if cornering doesn't apply.
 */
function cornerNudge(
  grid: CollisionGrid,
  cell: number,
  x: number,
  y: number,
  r: number,
  axis: "x" | "y",
  dir: number,
  step: number,
): number | null {
  const tx = Math.floor(x / cell);
  const ty = Math.floor(y / cell);
  const ntx = axis === "x" ? tx + dir : tx;
  const nty = axis === "y" ? ty + dir : ty;
  if (nty < 0 || nty >= grid.tileRows || ntx < 0 || ntx >= grid.tileCols || grid.walls[nty][ntx]) return null;
  // corridor centre line on the perpendicular axis
  const centre = axis === "x" ? ty * cell + cell / 2 : tx * cell + cell / 2;
  const cur = axis === "x" ? y : x;
  const delta = centre - cur;
  if (Math.abs(delta) < 0.01) return null;
  const next = cur + Math.sign(delta) * Math.min(Math.abs(delta), step);
  const [cx, cy] = axis === "x" ? [x, next] : [next, y];
  return circleHitsWall(grid, cell, cx, cy, r) ? null : next;
}

export function moveWithCollision(
  grid: CollisionGrid,
  cell: number,
  x: number,
  y: number,
  dx: number,
  dy: number,
  r: number,
): { x: number; y: number } {
  let nx = x + dx;
  let ny = y;
  if (circleHitsWall(grid, cell, nx, y, r)) {
    nx = x;
    // only when this is the ONLY requested axis — a diagonal input keeps its
    // own perpendicular movement instead of being steered
    if (dx !== 0 && dy === 0) {
      const c = cornerNudge(grid, cell, x, y, r, "x", Math.sign(dx), Math.abs(dx));
      if (c !== null) ny = c;
    }
  }
  if (dy !== 0) {
    const ty = ny + dy;
    if (!circleHitsWall(grid, cell, nx, ty, r)) ny = ty;
    else if (dx === 0) {
      const c = cornerNudge(grid, cell, nx, ny, r, "y", Math.sign(dy), Math.abs(dy));
      if (c !== null) nx = c;
    }
  }
  return { x: nx, y: ny };
}

/**
 * flipX for a sprite that should face its horizontal movement. `dirX` is the
 * input's horizontal component (any sign/magnitude; 0 = no horizontal input),
 * `nativeFacing` the direction the art faces unflipped. With no horizontal
 * input (up/down only, or standing still) the current flip is kept, so
 * vertical movement never flips the sprite.
 */
export function facingFlipX(nativeFacing: "left" | "right", dirX: number, currentFlipX: boolean): boolean {
  if (dirX === 0) return currentFlipX;
  const wantRight = dirX > 0;
  return nativeFacing === "right" ? !wantRight : wantRight;
}
