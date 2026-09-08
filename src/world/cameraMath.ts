/** Pure helpers for the drag-pan camera, kept Phaser-free so they can be unit tested. */

export interface ViewLike {
  width: number;
  height: number;
  zoom: number;
}

export interface WorldSize {
  w: number;
  h: number;
}

/** Clamp a scroll position so the visible view never leaves the world bounds. */
export function clampScroll(
  x: number,
  y: number,
  view: ViewLike,
  world: WorldSize,
): { x: number; y: number } {
  const viewW = view.width / view.zoom;
  const viewH = view.height / view.zoom;

  const maxX = Math.max(0, world.w - viewW);
  const maxY = Math.max(0, world.h - viewH);

  // If the world is smaller than the view on an axis, centre it.
  const cx = world.w <= viewW ? (world.w - viewW) / 2 : Math.min(Math.max(x, 0), maxX);
  const cy = world.h <= viewH ? (world.h - viewH) / 2 : Math.min(Math.max(y, 0), maxY);

  return { x: cx, y: cy };
}

/** Frame-rate-independent exponential decay of a velocity component. */
export function decayVelocity(v: number, dtMs: number, damping = 0.92): number {
  const next = v * Math.pow(damping, dtMs / 16.667);
  return Math.abs(next) < 0.01 ? 0 : next;
}

/** True when the pointer moved far/long enough that this gesture is a drag, not a tap. */
export function isDragGesture(
  dx: number,
  dy: number,
  dtMs: number,
  moveThreshold = 10,
  timeThreshold = 320,
): boolean {
  return Math.hypot(dx, dy) > moveThreshold || dtMs > timeThreshold;
}
