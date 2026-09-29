/**
 * Visual themes for the Garden Maze — kept separate from the maze LAYOUTS
 * (mazeLayouts.ts), which own gameplay structure only. Every theme stays in
 * the Frosted Valley palette (icy blues, cyan, frosty white, blue-grey, muted
 * blue-purple) but has its own wall style, background, floor and decoration
 * set, so a different maze also LOOKS like a different place.
 *
 * Readability rule every theme follows: walls are always clearly darker /
 * more saturated than the pale walkable floor, and decorations only ever go
 * on wall tiles buried inside wall masses — never on or over a path.
 */

export type MazeWallStyle = "ice" | "stone" | "crystal" | "forest" | "glacier" | "snow";

export interface MazeTheme {
  id: string;
  name: string;
  wallStyle: MazeWallStyle;
  /** Background gradient behind the board. */
  bgTop: number;
  bgBottom: number;
  /** Wall body, lit top face and dark edge. */
  wall: number;
  wallTop: number;
  wallEdge: number;
  /** Walkable floor and its shaded edge. */
  floor: number;
  floorShade: number;
  /** Glow / sparkle accent. */
  accent: number;
  /** Frosted Valley textures sprinkled on deep wall tiles (never paths). */
  decor: string[];
  /** Relative snowfall density (0..1). */
  snow: number;
}

export const MAZE_THEMES: Record<string, MazeTheme> = {
  caves: {
    id: "caves",
    name: "Frozen Caves",
    wallStyle: "ice",
    bgTop: 0x0c1c33,
    bgBottom: 0x1b3656,
    wall: 0x3f6f9e,
    wallTop: 0x8fc3ea,
    wallEdge: 0x1d3c61,
    floor: 0xdcebf6,
    floorShade: 0xb3cde2,
    accent: 0x9fe3ff,
    decor: ["fv_icicles", "fv_crystal_c"],
    snow: 0.3,
  },
  ruins: {
    id: "ruins",
    name: "Snowy Ruins",
    wallStyle: "stone",
    bgTop: 0x1a2233,
    bgBottom: 0x33405a,
    wall: 0x5c6b85,
    wallTop: 0xf2f6fb,
    wallEdge: 0x2f3a50,
    floor: 0xe6e9ee,
    floorShade: 0xc3cad6,
    accent: 0xcfe0ff,
    decor: ["fv_lamppost", "fv_ice_block"],
    snow: 0.7,
  },
  crystal: {
    id: "crystal",
    name: "Crystal Ice",
    wallStyle: "crystal",
    bgTop: 0x0d1f3f,
    bgBottom: 0x2a2f6b,
    wall: 0x2f86b8,
    wallTop: 0x8ff0ff,
    wallEdge: 0x173e73,
    floor: 0xe2f1fb,
    floorShade: 0xb8d3ee,
    accent: 0x7ff6ff,
    decor: ["fv_crystal_a", "fv_crystal_e", "fv_crystal_b"],
    snow: 0.2,
  },
  forest: {
    id: "forest",
    name: "Frozen Forest",
    wallStyle: "forest",
    bgTop: 0x0f2230,
    bgBottom: 0x1f3d4f,
    wall: 0x2f5a66,
    wallTop: 0xe7f4f7,
    wallEdge: 0x173540,
    floor: 0xe5efee,
    floorShade: 0xbfd3d3,
    accent: 0xc8f2ff,
    decor: ["fv_pine", "fv_pine_b", "fv_hedge"],
    snow: 0.8,
  },
  glacier: {
    id: "glacier",
    name: "Glacier",
    wallStyle: "glacier",
    bgTop: 0x5d8fc0,
    bgBottom: 0xa9d0ee,
    wall: 0x6aa6d8,
    wallTop: 0xf4fbff,
    wallEdge: 0x3a70a6,
    floor: 0xf2f7fb,
    floorShade: 0xcfe0ee,
    accent: 0xffffff,
    decor: ["fv_ice_block", "fv_icicles"],
    snow: 0.4,
  },
  snowfield: {
    id: "snowfield",
    name: "Magical Snowfield",
    wallStyle: "snow",
    bgTop: 0x2c3a6e,
    bgBottom: 0x5a6aa8,
    wall: 0x8e9fd6,
    wallTop: 0xffffff,
    wallEdge: 0x55609a,
    floor: 0xeef0fa,
    floorShade: 0xcdd3ec,
    accent: 0xe8d9ff,
    decor: ["fv_flower_bush", "fv_glow_orb"],
    snow: 1,
  },
};
