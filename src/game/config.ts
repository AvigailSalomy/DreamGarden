/** Global tunables. Design frame is portrait; the world is larger and pans by drag. */
export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1280;

export const WORLD_WIDTH = 2160;
export const WORLD_HEIGHT = 1680;

export const SAVE_KEY = "dreamgarden.save.v1";
export const SAVE_VERSION = 1;

/** Where the camera rests when the garden first opens (top-left scroll, will be clamped).
 *  Kept high enough that sky + hills frame the top of the view. */
export const START_SCROLL = { x: 150, y: 150 };

export const IS_TOUCH =
  typeof window !== "undefined" &&
  ("ontouchstart" in window || (navigator?.maxTouchPoints ?? 0) > 0);
