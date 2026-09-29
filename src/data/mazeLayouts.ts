/**
 * The ten handcrafted Garden Maze layouts. Every one is drawn by hand on the
 * same 19×13 tile grid ('#' wall, '.' path, 'S' the player's start), with its
 * own structure — not a seed fed to a generator, and not cosmetic variations
 * of one board. tests/mazeLayouts.test.ts proves each is fully connected and
 * has the junctions, loops and dead ends the gameplay relies on.
 *
 * Each layout names a visual theme (mazeThemes.ts) and a complexity rating,
 * so structure, look and difficulty stay separate, data-driven concerns.
 *
 * Collectibles, coins and enemy spawns are NOT baked in: mazeRun.ts derives
 * them from each layout's structure (dead ends, distance from the start,
 * junction density) so the same maze still plays differently run to run.
 */

export interface MazeLayout {
  id: string;
  name: string;
  /** Visual theme id (see mazeThemes.ts) — looks only, never gameplay. */
  theme: string;
  /** Structural complexity: 1 open & forgiving, 2 standard, 3 intricate. Early animals avoid 3, late ones avoid 1. */
  rating: 1 | 2 | 3;
  rows: string[];
}

export const MAZE_COLS = 19;
export const MAZE_ROWS = 13;

export const MAZE_LAYOUTS: MazeLayout[] = [
  {
    // symmetric classic: a hedge-ringed centre bed, wide top avenue
    id: "frozen-garden",
    name: "Frozen Garden",
    theme: "snowfield",
    rating: 1,
    rows: [
      "###################",
      "#........#........#",
      "#.##.###.#.###.##.#",
      "#.................#",
      "#.##.#.#####.#.##.#",
      "#....#...#...#....#",
      "####.###.#.###.####",
      "#......#...#......#",
      "#.####.#.#.#.####.#",
      "#...#.........#...#",
      "###.#.###.###.#.###",
      "#........S........#",
      "###################",
    ],
  },
  {
    // irregular pockets and long cave tunnels — the dead-end-heavy one
    id: "ice-caves",
    name: "Ice Caves",
    theme: "caves",
    rating: 2,
    rows: [
      "###################",
      "#S..#.....#.......#",
      "###.#.###.#.#####.#",
      "#...#...#...#.....#",
      "#.#####.#####.#.#.#",
      "#.#.........#.#...#",
      "#.#.#.#####.#.###.#",
      "#...#.....#.#...#.#",
      "#####.###.#.###.#.#",
      "#.....#...#...#...#",
      "#.#####.#####.#.###",
      "#.................#",
      "###################",
    ],
  },
  {
    // a lattice of four-way junctions — lots of choices, lots of exposure
    id: "frozen-crossroads",
    name: "Frozen Crossroads",
    theme: "glacier",
    rating: 1,
    rows: [
      "###################",
      "#.....#.....#.....#",
      "#.###.#.###.#.###.#",
      "#.................#",
      "#.#.###.#.#.###.#.#",
      "#.#...#.#.#.#...#.#",
      "#.###.#.....#.###.#",
      "#.....#.#.#.#.....#",
      "###.#####.#####.###",
      "#.......#S#.......#",
      "#.#####.#.#.#####.#",
      "#.................#",
      "###################",
    ],
  },
  {
    // radial: a central hub with arms reaching out like a snowflake
    id: "snowflake",
    name: "Snowflake",
    theme: "crystal",
    rating: 2,
    rows: [
      "###################",
      "#...#....#....#...#",
      "#.#.#.##.#.##.#.#.#",
      "#.#...#.....#...#.#",
      "#.###.#.###.#.###.#",
      "#.....#..#..#.....#",
      "###.#.##...##.#.###",
      "#...#....#....#...#",
      "#.###.##.#.##.###.#",
      "#...#.#.....#.#...#",
      "#.#.#.#.###.#.#.#.#",
      "#.#......S......#.#",
      "###################",
    ],
  },
  {
    // a frozen river wall splits the maze; only three bridges cross it
    id: "frozen-river",
    name: "Frozen River",
    theme: "glacier",
    rating: 1,
    rows: [
      "###################",
      "#.......#.........#",
      "#.#####.#.#####.#.#",
      "#.#...........#.#.#",
      "#.#.#####.###.#...#",
      "#...#...........#.#",
      "##.#######.######.#",
      "#...#.........#...#",
      "#.#.#.###.###.#.#.#",
      "#.#...#.....#...#.#",
      "#.###.#.#.#.#.###.#",
      "#.......#S#.......#",
      "###################",
    ],
  },
  {
    // an outer moat ring around a walled keep with narrow gates
    id: "ice-castle",
    name: "Ice Castle",
    theme: "ruins",
    rating: 2,
    rows: [
      "###################",
      "#.................#",
      "#.#######.#######.#",
      "#.#.....#.#.....#.#",
      "#.#.###.....###.#.#",
      "#...#.#.###.#.#...#",
      "#.#.#.........#.#.#",
      "#.#...###.###...#.#",
      "#.#.#.#.....#.#.#.#",
      "#.#.#...#S#...#.#.#",
      "#.#.#########.#.#.#",
      "#.................#",
      "###################",
    ],
  },
  {
    // winding switchbacks with only a few shortcuts between them
    id: "twisted-forest",
    name: "Twisted Forest",
    theme: "forest",
    rating: 3,
    rows: [
      "###################",
      "#S#...............#",
      "#.#.#####.#.#####.#",
      "#.#.#...#...#...#.#",
      "#...#.#######.#.#.#",
      "##.##.........#...#",
      "#.....#####.###.###",
      "#.###.....#...#...#",
      "#...#####.###.###.#",
      "#.#.#...#...#.....#",
      "#.#.#.#.###.#.###.#",
      "#.....#.....#.....#",
      "###################",
    ],
  },
  {
    // crystal chambers — small pillared rooms joined by tunnels
    id: "crystal-cave",
    name: "Crystal Cave",
    theme: "crystal",
    rating: 1,
    rows: [
      "###################",
      "#...#.........#...#",
      "#.#.#.#.###.#.#.#.#",
      "#.......#.#.......#",
      "##.####.#.#.####.##",
      "#...#.........#...#",
      "#.#.#.#.#.#.#.#.#.#",
      "#...#.........#...#",
      "##.####.#.#.####.##",
      "#.......#.#.......#",
      "#.#.#.#.###.#.#.#.#",
      "#...#....S....#...#",
      "###################",
    ],
  },
  {
    // blocky cottages lining village streets and back alleys
    id: "frozen-village",
    name: "Frozen Village",
    theme: "ruins",
    rating: 2,
    rows: [
      "###################",
      "#.......#.........#",
      "#.###.#.#.#.###.#.#",
      "#.###.#...#.###.#.#",
      "#.....###.#.....###",
      "#.###.....#.###...#",
      "#.###.###.#.###.#.#",
      "#.........#.....#.#",
      "#.#.###.#####.#.#.#",
      "#.#.###.......#...#",
      "#.#.....#.###.###.#",
      "#...###.#S........#",
      "###################",
    ],
  },
  {
    // the big one: long corridors, deep dead ends, few safe loops
    id: "great-frost-maze",
    name: "Great Frost Maze",
    theme: "caves",
    rating: 3,
    rows: [
      "###################",
      "#.........#.......#",
      "#.###.#.#.#.#####.#",
      "#.#...#.#.......#.#",
      "#.#.###.#####.#.#.#",
      "#.#.....#.....#...#",
      "#.#####.#.#######.#",
      "#.....#.........#.#",
      "#####.#####.###.###",
      "#...#.....#.......#",
      "#.#.#####.###.###.#",
      "#.#......S........#",
      "###################",
    ],
  },
];
