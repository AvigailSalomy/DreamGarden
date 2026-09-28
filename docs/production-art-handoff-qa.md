# Production art handoff — 27 September 2026

Status: functional changes verified; **not ready for final visual sign-off**.

Dev server: http://127.0.0.1:5173/ (left running).
Branch: feature/dream-garden-production-art. Existing working changes preserved. No commit, push, reset, stash, revert, or branch switch.

## This pass

- Reduced six world animals independently of Request portraits. Nominal heights: Rabbit 110, Bird 69, Hedgehog 83, Squirrel 99, Fox 124, Deer 176 world pixels.
- Kept invisible animal hit zones, with a minimum 48 screen pixels while zoomed out; ignored drag releases. Restricted roaming to keep animals near their homes.
- All six animals are visible before rescue. Their resource sources remain absent until rescue. Existing pre-rescue progression gates remain intact.
- Suppressed consumed pre-rescue supply props for all animals. No habitat floors added.
- Reduced oversized resource footprints and adjusted placement. Removed duplicate resource shadows during swaps and cleared resource maps on scene shutdown.
- Reworked Request panels using wood/cream layers, reused flowers, expressive production animal art, three production resource cards, inventory counts, explicit Restore buttons, and completion animation.
- Rabbit requirements are Carrot 5, Herb 3, Wildflower 4.
- Replaced direct coin purchases with a resourceAcquisition:open event containing animal, source, resource, and outstanding amount. Get / Play currently displays an honest coming-soon message. No resource grant or spend occurs through it. The maze remains unimplemented as requested.
- Help now guides the player; only the card's Restore action consumes materials.
- Reused existing arch, cottage, pond, trees, flowers, and grass on Home. Existing new-garden confirmation preserved.
- Corrected the vignette SVG's aspect ratio behavior, which left rectangular edges when loaded at a different aspect ratio.
- Corrected the HUD's claim that rescuing every animal means the whole garden is restored.

## Validation

TypeScript, all 90 tests, and production build pass.

Chrome used a separate /tmp/dreamgarden-codex-qa profile, leaving the user's normal browser save alone. Browser QA used rescue/inventory fixtures and the existing service/scene methods; it did not manually solve six jigsaws or play a resource minigame.

- Fresh state: all six animal views present, no habitat resource views.
- Rescued state: 18 source views; each animal opens a matching three-card Request panel.
- Inventory at its requirement does not automatically restore.
- All 18 sources explicitly restored through Request scene actions, with matching restored texture keys and all six completion celebrations.
- Reload retained all 18 restored flags and inventory.
- A real Chrome pointer press on Rabbit's Restore button also consumed carrots and restored the selected source.
- Desktop 1280x900 and portrait 390x844 inspected. Request composition stays within the viewport. Phone text and resource buttons are smaller than ideal and warrant further polish.

## Remaining visual blockers and compromises

The inherited PNG extraction is not production-ready. Direct inspection of the PNGs confirms opaque, tinted checkerboards embedded in the pixels, not Phaser hit zones. Examples include Deer moonflower and mushroom states, Hedgehog mossy logs, Fox fern, Bird water lilies, and the restored environmental pond. Some assets also have over-extracted subject details (Bird's white belly and parts of resource trees). The existing saturation-threshold background-removal scripts cannot reliably distinguish those shaded checkerboards from natural subject colors.

These supplied assets were retained unchanged in this pass. The defects were not covered with scenery. The newly added separate Home lanterns were removed after their checkerboard defect was discovered; the existing floral arch provides lanterns instead. One decorative green bush was replaced with a clean existing mixed bush.

The world still mixes legacy SVG scenery with production art. Some restored source art is a garden patch/tree rather than an isolated collectible icon; the Request cards intentionally use the supplied source art. Home is an asset composition, not an exact match for the reference's illustrated sign, fountain, lighting, or depth. The scene is not visually approved.

Resource acquisition remains unavailable until a minigame/reward provider handles the new event. QA inventory grants are confined to the isolated browser fixture, not exposed as game buttons.

## Files modified in this pass

- public/assets/svg/vignette.svg
- src/core/RequestsService.ts
- src/core/events.ts
- src/data/habitats.ts
- src/data/objects.ts
- src/main.ts
- src/scenes/GardenScene.ts
- src/scenes/HabitatRequestScene.ts
- src/scenes/MenuScene.ts
- src/scenes/UIScene.ts
- src/world/GardenObjectView.ts
- tests/requestsService.test.ts
- docs/production-art-handoff-qa.md

Other pre-existing modified and untracked files remain in the working tree.
