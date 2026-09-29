/** Pure helpers for the drag-pan + zoom camera, Phaser-free so they can be unit tested. */

export interface ViewLike {
  width: number;
  height: number;
  zoom: number;
}

export interface WorldSize {
  w: number;
  h: number;
}

export const ZOOM_MAX = 1.5;
/** Absolute lower bound; the *effective* minimum is computed from the viewport. */
export const ZOOM_MIN = 0.32;

/** The chunk of world we want a player to be able to see at the widest zoom:
 *  the WHOLE playable garden (full world width; ground from the horizon down),
 *  so a fully zoomed-out view is a real overview of every habitat. Small
 *  screens still bottom out at ZOOM_MIN and pan to see the rest. */
export const OVERVIEW_W = 3200;
export const OVERVIEW_H = 2000;

/**
 * A responsive minimum zoom: small enough that most of the neglected garden fits
 * on screen at once, but not so small that everything turns to specks. Wider
 * viewports (desktop) get a higher minimum because they already show a lot.
 */
export function computeMinZoom(
  viewW: number,
  viewH: number,
  overviewW = OVERVIEW_W,
  overviewH = OVERVIEW_H,
  floor = ZOOM_MIN,
  ceil = 0.9,
): number {
  const fit = Math.min(viewW / overviewW, viewH / overviewH);
  return Math.min(ceil, Math.max(floor, fit));
}

export function clampZoom(z: number, min = ZOOM_MIN, max = ZOOM_MAX): number {
  return Math.min(max, Math.max(min, z));
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

/**
 * New scroll so that the world point currently under the focal *screen* point
 * (focalX/focalY, measured from the camera's top-left) stays under it after the
 * zoom changes. `view` carries the CURRENT scroll+zoom via extra fields.
 */
export function zoomAroundPoint(
  view: ViewLike & { scrollX: number; scrollY: number },
  focalX: number,
  focalY: number,
  newZoom: number,
): { scrollX: number; scrollY: number } {
  const worldX = view.scrollX + focalX / view.zoom;
  const worldY = view.scrollY + focalY / view.zoom;
  return {
    scrollX: worldX - focalX / newZoom,
    scrollY: worldY - focalY / newZoom,
  };
}

/** Frame-rate-independent exponential decay of a velocity component. */
export function decayVelocity(v: number, dtMs: number, damping = 0.9): number {
  const next = v * Math.pow(damping, dtMs / 16.667);
  return Math.abs(next) < 0.01 ? 0 : next;
}

/** True when the pointer moved far/long enough that this gesture is a drag, not a tap. */
export function isDragGesture(
  dx: number,
  dy: number,
  dtMs: number,
  moveThreshold = 7,
  timeThreshold = 320,
): boolean {
  return Math.hypot(dx, dy) > moveThreshold || dtMs > timeThreshold;
}
