/**
 * Global tunables. The game runs full-screen (Phaser.Scale.RESIZE); DESIGN_* is only
 * a nominal portrait reference for composing UI. The world is much larger than any
 * viewport and is explored by drag-pan + pinch/wheel zoom.
 */
export const DESIGN_WIDTH = 720;
export const DESIGN_HEIGHT = 1280;

export const WORLD_WIDTH = 3200;
export const WORLD_HEIGHT = 2400;

/** Ground horizon in world Y (sky/hills above, garden below). */
export const HORIZON = 460;

export const SAVE_KEY = "dreamgarden.save.v1";
export const SAVE_VERSION = 1;

/** World point the camera centres on when the garden opens (the rabbit meadow). */
export const START_FOCUS = { x: 900, y: 1500 };

export const IS_TOUCH =
  typeof window !== "undefined" &&
  ("ontouchstart" in window || (navigator?.maxTouchPoints ?? 0) > 0);
