import type { RoamArea } from "../world/animalBehavior";

/**
 * Where each rescued Frosted Valley animal may roam, authored RELATIVE to
 * its home spot (the (x, y) buildAnimals places it at), so a zone that is
 * moved later keeps its area. Measured against the painted world map with
 * a world-coordinate grid overlay (see __dgFrostedValley.debugRoam in DEV):
 *
 *   poly  the open snow the animal's feet stay on — bounded by water,
 *         fences, cliffs and big landmarks
 *   noGo  flat landmarks (pools, flower beds) and awkward spots inside that
 *         snow the animal must never stand on or behind; tall props (trees,
 *         lampposts…) and Shop decorations are blocked automatically at
 *         runtime from their footprints, so they aren't listed here
 *   pois  stand spots beside this animal's own RESTORED landmarks
 *   gazes landmarks outside the area it turns to look at
 */
export const FROSTED_ROAM: Record<string, RoamArea> = {
  // inside the fenced yard only; the whole band behind/on the carrot bed is
  // off-limits (the rabbit draws above the yard art, so it must never stand
  // where the bed should cover it)
  fv_rabbit: {
    poly: [
      { x: -11, y: -390 },
      { x: 330, y: -225 },
      { x: 0, y: 55 },
      { x: -340, y: -215 },
    ],
    noGo: [
      { x0: -264, y0: -439, x1: 86, y1: -144 }, // the carrot bed + behind it
      { x0: 239, y0: -263, x1: 377, y1: -203 }, // the barrel stumps baked into the yard art
    ],
    pois: [{ x: 110, y: -175, face: -1, action: "nibble" }], // the carrot patch
    gazes: [
      { x: 1156, y: -219 }, // the well
      { x: 936, y: -759 }, // the wind chime
    ],
  },

  // the snow tongue under the bridge, between the ice crossing, the river and the signpost
  fv_fox: {
    poly: [
      { x: -100, y: -100 },
      { x: 200, y: -110 },
      { x: 230, y: 20 },
      { x: 170, y: 85 },
      { x: 0, y: 90 },
      { x: -50, y: 60 },
      { x: -100, y: 0 },
    ],
    noGo: [
      { x0: -400, y0: -85, x1: -15, y1: 180 }, // the ice crossing pool
      { x0: 200, y0: -50, x1: 440, y1: 220 }, // the signpost and its rocks
    ],
    pois: [
      { x: 160, y: 0, face: 1, action: "sniff" }, // the signpost
      { x: 15, y: 65, face: -1, action: "look" }, // the ice crossing
    ],
    gazes: [{ x: 60, y: -450 }], // the bridge
  },

  // the open snow below the fountain, between the magic tree and the crystal rocks
  fv_deer: {
    poly: [
      { x: -380, y: -89 },
      { x: 120, y: -98 },
      { x: 171, y: 187 },
      { x: 585, y: 204 },
      { x: 758, y: 393 },
      { x: 68, y: 514 },
      { x: -536, y: 428 },
      { x: -570, y: 152 },
      { x: -398, y: 83 },
    ],
    noGo: [
      { x0: -420, y0: 100, x1: -180, y1: 305 }, // the flower bed
      { x0: 130, y0: -200, x1: 560, y1: 190 }, // the crystal rock pile
    ],
    pois: [
      { x: -120, y: 270, face: -1, action: "graze" }, // the flower bed
      { x: 60, y: -70, face: 1, action: "look" }, // the fountain
      { x: -330, y: -40, face: -1, action: "graze" }, // the magic tree
    ],
    gazes: [{ x: -120, y: -560 }], // the blossom trees
  },

  // the snow around the nest stump and rock pool, stopping at the waterfall's stream
  fv_squirrel: {
    poly: [
      { x: -121, y: -132 },
      { x: 60, y: -130 },
      { x: 60, y: -20 },
      { x: 130, y: 187 },
      { x: 240, y: 393 },
      { x: -242, y: 445 },
      { x: -621, y: 376 },
      { x: -621, y: 204 },
      { x: -483, y: -3 },
    ],
    noGo: [
      { x0: -500, y0: -170, x1: -150, y1: 220 }, // the tree-stump nest
      { x0: -104, y0: 92, x1: 189, y1: 316 }, // the rock pool
    ],
    pois: [
      { x: -100, y: -30, face: -1, action: "nibble" }, // berries in the stump nest
      { x: -60, y: 60, face: 1, action: "nibble" }, // a sip at the rock pool
    ],
    gazes: [
      { x: -260, y: -180 }, // the little waterfall
      { x: 520, y: -460 }, // the big waterfall
    ],
  },

  // the wide snow and ice below the cave
  fv_polarbear: {
    poly: [
      { x: -328, y: -124 },
      { x: 190, y: -150 },
      { x: 276, y: -3 },
      { x: 241, y: 152 },
      { x: 379, y: 255 },
      { x: 345, y: 428 },
      { x: -276, y: 445 },
      { x: -672, y: 324 },
      { x: -690, y: 83 },
      { x: -448, y: -72 },
    ],
    noGo: [],
    pois: [
      { x: -10, y: -110, face: -1, action: "sniff" }, // the ice cave's mouth
      { x: 150, y: -120, face: 1, action: "play" }, // the ice fishing hole
    ],
    gazes: [{ x: 80, y: -520 }], // the crystal cluster above the cave
  },

  // the shore snow between the iceberg and the igloo, opening out below them
  fv_penguin: {
    poly: [
      { x: -124, y: -263 },
      { x: 100, y: -263 },
      { x: 117, y: 48 },
      { x: 583, y: 82 },
      { x: 755, y: 151 },
      { x: 669, y: 392 },
      { x: -107, y: 461 },
      { x: -624, y: 392 },
      { x: -659, y: 151 },
      { x: -314, y: 82 },
      { x: -141, y: 13 },
    ],
    noGo: [],
    pois: [
      { x: 100, y: -10, face: 1, action: "play" }, // the igloo
      { x: -90, y: -90, face: -1, action: "look" }, // the iceberg
    ],
    gazes: [{ x: 20, y: -480 }], // the slide
  },
};
