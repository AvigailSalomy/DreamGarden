import type { RegionId } from "./types";

/**
 * The world-restoration layer: which garden-world RESOURCES belong to which
 * animal's habitat, and what condition unlocks each one's restored state.
 *
 * This is deliberately separate from `GardenObjectDef.requests` (data/objects.ts) —
 * that system already handles "buy a request, its prop appears in the world" and
 * is untouched here. `HabitatDef`/`RestorationResource` describe the SURROUNDING
 * ENVIRONMENT each animal's habitat lives in: the resources that read as damaged
 * on a fresh save (a dry flower patch, a cracked fountain, an unlit lantern) and
 * swap to their real production-art restored counterpart once their
 * `requirement` is met — reusing EXISTING progression/requests state as the
 * source of truth (no new save fields; see `ResourceRequirement`).
 *
 * Only the three real catalog entries (rabbit, wildflowers, bird — see
 * data/objects.ts CATALOG) get a habitat. The ambient wildlife GardenScene
 * places for atmosphere (hedgehog/squirrel/fox/deer) are NOT in progression —
 * they are decorative, not rescuable, and intentionally have no habitat entry
 * here (inventing one would fabricate progression state that doesn't exist).
 */

export type ResourceRequirement =
  | { kind: "objectUnlocked"; objectId: string }
  | { kind: "requestPurchased"; objectId: string; requestId: string }
  /** The garden-wide capstone: every catalog object currently unlocked. */
  | { kind: "allUnlocked" };

export interface RestorationResource {
  id: string;
  label: string;
  position: { x: number; y: number };
  scale: number;
  shadowW?: number;
  /**
   * `dg_`-prefixed production texture key shown before restoration. Omitted
   * when the resource's "damaged" state is its ABSENCE from the world (a
   * real, honest alternative to faking damage art that doesn't exist —
   * see the report's "no damaged counterpart supplied" list).
   */
  damagedAsset?: string;
  /** `dg_`-prefixed production texture key shown once restored. */
  restoredAsset: string;
  /**
   * True for the one resource in a habitat where no damaged/restored ASSET
   * PAIR was available at all, and a tint is used as the only stand-in
   * (documented explicitly, never silently) — currently just the cottage
   * lantern (dim/cool -> its own true colours), since only one lantern
   * sprite was supplied.
   */
  tintOnly?: boolean;
  requirement: ResourceRequirement;
}

export interface HabitatDef {
  id: string;
  /** Owning catalog object id, or null for the fountain (owned by no single
   *  animal — a whole-garden capstone landmark). */
  animalId: string | null;
  name: string;
  region: RegionId;
  resources: RestorationResource[];
}

export const RABBIT_HABITAT: HabitatDef = {
  id: "rabbitMeadow",
  animalId: "rabbit",
  name: "Rabbit's Meadow",
  region: "animalMeadow",
  resources: [
    {
      id: "meadowBloom",
      label: "Wild meadow flowers",
      position: { x: 1140, y: 1580 },
      scale: 0.19,
      // damaged state = absence (the meadow's existing dead_shrub/weeds already
      // carry the "neglected" read — see buildProps) — no separate damaged
      // asset was needed for this one.
      restoredAsset: "flowers_yellow_01",
      requirement: { kind: "objectUnlocked", objectId: "rabbit" },
    },
  ],
};

export const WILDFLOWER_HABITAT: HabitatDef = {
  id: "wildflowerBed",
  animalId: "wildflowers",
  name: "Wildflower Bed",
  region: "flowerBed",
  resources: [
    {
      id: "flowerBedGrowth",
      label: "The flower bed itself",
      position: { x: 260, y: 1560 },
      scale: 0.22,
      // both real, distinct production-art photos of the RESTORATION folder —
      // not an officially-named pair, but genuinely two different states.
      damagedAsset: "vegetation_04",
      restoredAsset: "vegetation_01",
      requirement: { kind: "objectUnlocked", objectId: "wildflowers" },
    },
  ],
};

export const BIRD_HABITAT: HabitatDef = {
  id: "birdCottage",
  animalId: "bird",
  name: "Pip's Cottage Garden",
  region: "cottageYard",
  resources: [
    {
      id: "cottageLantern",
      label: "The cottage lantern",
      position: { x: 1860, y: 1280 },
      scale: 0.22,
      restoredAsset: "lantern_01",
      tintOnly: true, // see RestorationResource.tintOnly — no unlit-lantern asset exists
      requirement: { kind: "objectUnlocked", objectId: "bird" },
    },
    {
      id: "cottageDoorstepFlowers",
      label: "Flowers by the cottage door",
      position: { x: 2100, y: 1300 },
      scale: 0.17,
      restoredAsset: "flowers_pink_01",
      requirement: { kind: "objectUnlocked", objectId: "bird" },
    },
  ],
};

/**
 * Not owned by a single rescued animal — the garden-wide capstone landmark.
 * pondside has no catalog entry of its own (see the report), so rather than
 * invent a fourth fake progression object, its restoration rides the one
 * honest signal that already exists: the whole visible garden being restored.
 */
export const FOUNTAIN_LANDMARK: HabitatDef = {
  id: "fountainClearing",
  animalId: null,
  name: "The Fountain Clearing",
  region: "pondside",
  resources: [
    {
      id: "fountain",
      label: "The stone fountain",
      position: { x: 1540, y: 1980 },
      scale: 0.62,
      damagedAsset: "pond_damaged_01",
      restoredAsset: "pond_restored_01",
      requirement: { kind: "allUnlocked" },
    },
  ],
};

export const HABITATS: HabitatDef[] = [RABBIT_HABITAT, WILDFLOWER_HABITAT, BIRD_HABITAT, FOUNTAIN_LANDMARK];
