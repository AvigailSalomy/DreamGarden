# Bird / Shop viewport / Maze economy continuation

Review URL: http://127.0.0.1:5173/ — existing Vite server left running.
Branch: feature/dream-garden-production-art. No commits, pushes, branch changes, resets, stashes or discarded working-tree changes.

## Files changed in this pass

This list excludes the many pre-existing uncommitted files.

- `src/data/habitats.ts` — only Bird resource positions changed.
- `src/scenes/GardenScene.ts` — Bird resource texture selection/crossfade; nearby arch, fence, cottage, bench and waterfall cleared away from its resources; cottage-yard overlay flowers suppressed to avoid covering the pond.
- `src/scenes/PreloadScene.ts` — bake shared Bird frames after loading.
- `src/world/birdResourceFrames.ts` — new aspect-preserving, bottom-grounded frames for the six Bird variants.
- `public/assets/dg/resources/bird_water_lily_patch_damaged.png` — cleaned alpha.
- `public/assets/dg/resources/bird_water_lily_patch_restored.png` — removed baked checkerboard.
- `public/assets/dg/resources/bird_blossom_tree_restored.png` — removed additional checkerboard discovered during the restored-state browser check.
- `src/scenes/ShopScene.ts` — bounded catalog mask, wheel/touch scrolling, responsive columns, fixed header/currency/tabs, clipped input, responsive animal preview/picker and explicit Equip, brief repeated-action guard.
- `src/data/shop.ts` — minimum basic prices 150; corrected Bird anchor lookup from `bluebird` to the actual `bird` ID.
- `src/core/ShopService.ts` — Mystery Gift price reads centralized configuration.
- `src/data/economy.ts` — centralized Maze collectible amounts, retained leaf conversion, basic price minimum and gift price.
- `src/data/mazeCoins.ts` — deterministic exploration-oriented coin distribution.
- `src/core/MazeRunRewards.ts` — per-run idempotent pickup/completion receipt.
- `src/scenes/GardenMazeScene.ts` — existing coin art, pickups/FX/shared-balance HUD, immediate persisted coin credit, one-time success settlement, retry reset, failure/abandon messaging; cancel camera zoom on HUD so it stays onscreen.
- `tests/mazeEconomy.test.ts` — five distribution/reward regression tests.
- `tests/shopPersistence.test.ts` — three inventory/equipment/placement/currency regression tests.
- `docs/bird-shop-maze-continuation.md` — this report.

## Result

Bird remains at its existing home (1750,1182). Its tree is at (1700,1110), feeder at (1600,1280), pond at (1900,1320). The tree supports the bird from behind; feeder and pond flank it at different distances/heights. Other animal and habitat positions were not changed.

Bird pairs now have identical frame sizes, origins, scales, positions and depths. Tree: 1100×1100 at .192; feeder: 760×1100 at .144; pond: 1100×850 at .192. Art is fitted without distortion and grounded on a common baseline. Restoration crossfades at fixed scale. Natural differences between the supplied damaged/restored silhouettes remain.

Both pond PNGs were inspected over pink and navy solid backgrounds. True zero-alpha outside pixels and semitransparent edge pixels are present. No visible checkerboard remained in the final pond or restored-tree browser captures. Cleanup edited the supplied artwork; it did not substitute generic assets. Fine edge/detail pixels can differ slightly because these were image edits, not mathematically lossless extraction.

Shop catalog scrolls inside its wooden frame. Header, balance and tabs remain fixed. Desktop uses three columns; mobile uses two. Offscreen button input is disabled; dragging suppresses purchase taps. Preview/picker/Equip sits above the masked catalog. Existing purchasing, placement validation and save model remain in use.

Maze collectible totals: easy 12×2 = 24; medium 18×2 = 36; hard 24×2 = 48. Coins use the existing `coin` texture. Distribution includes a near-start coin, optional branches, dead ends and far corridors. Each pickup immediately credits and flushes the existing shared coin balance. Failure/abandon keeps these coins but grants no habitat resource. Success grants the requested resource and the existing Golden Leaf conversion once. Rescue puzzle rewards are unchanged. A retry creates a new receipt and must physically collect new coins. There is no resumed-run reward ledger because the existing game does not resume Maze runs after page reload.

## Browser verification

Used an isolated Chrome QA profile, desktop 1280×900 and mobile portrait 390×844. Extra currency for the later accessory/gift regression checks was a QA fixture in that isolated save, not a production reward mechanism.

- Bird: inspected damaged/restored composition, cleared arch/waterfall overlap, restored all three through RequestsService, compared position/scale/origin/depth/frame dimensions before and after. All equal. Restored state persisted after reload.
- Pond: both states composited over pink/navy; final world inspected. Also cleaned the restored blossom tree after its separate checker contamination became visible.
- Shop: actual mouse-wheel and touch-drag events scrolled catalog; all bottom-row cards and buttons were reachable inside the panel. A real click purchased Garden Backpack from the formerly clipped bottom row.
- Mobile: viewed the six rescued animals, selected Bird, pressed Equip; Rabbit replacement hat→bow also persisted and produced the expected world accessory sprite.
- Daily: six items shown: Picnic Table, Garden Tree, Fern Cluster, Flower Planter, Garden Rock, Wooden Sign (2026-09-28).
- Placement: Place created a preview; Bird's occupied position was rejected; a clear position (200,1800) accepted the fern and persisted after reload.
- Mystery Gift: 500 charged once for two rapid UI action calls; one Animal House reward and one gift count persisted.
- Maze: used normal movement/collision with enemies active; collected coins physically and observed balance/HUD increases. A failed run retained 2 coins and awarded no resource. Clicked Retry: target reset to 0, lives to 3, balance unchanged; a fresh physical pickup then credited 2 coins. Repeated Return did not duplicate rewards.
- Abandon→Shop: balance 244 remained 244, buying Fern Cluster cost 150, balance 94 and inventory survived reload.
- Successful one-resource-remaining hunt: balance 98→102 (2 physical coins + existing 2-leaf bonus), resource 0→1. Repeated completion callbacks left both totals unchanged. Success/resource persisted after reload.
- Final saved QA state: balance 2452; placed fern; Animal House inventory reward; owned hat, bow, backpack; Rabbit bow and Bird hat equipped. Reload retained all values.
- No runtime exceptions in the verified flows; final reload captured no console errors.

Captures retained locally: `/tmp/pond-alpha-final.png`, `/tmp/bird-final.png`, `/tmp/shop-bottom-final.png`, `/tmp/shop-mobile.png`, `/tmp/shop-mobile-preview.png`, `/tmp/maze-playing.png`.

## Validation

- `npx tsc --noEmit`: passed.
- `npx vitest run`: 11 files, 99 tests passed. No existing tests weakened or removed.
- `npx vite build`: passed.

## Remaining issues / limits

- Some unrelated supplied artwork still has baked checkerboard (notably accessory crowns/glasses and the large world pond). Those assets were not part of this Bird cleanup and remain unchanged.
- Existing legacy scenery/silhouette artifacts outside Bird's resources remain; progression and silhouette systems were not rewritten.
- Accessory anchors remain approximate; preview uses the same anchor metadata as the Garden. No six-animal anchor retuning was attempted.
- Existing placement validation uses center-distance checks, not full sprite-outline collision.
- Review fine raster edges manually. Raw asset-processing scripts can overwrite edited runtime PNGs if rerun; preserve these approved cleanup outputs when reprocessing.

## Raster edit provenance

Used the imagegen skill and built-in image editing with the actual runtime PNG as each reference. Originals were preserved outside the repository at `/tmp/bird-water-lily-before.png`, `/tmp/bird-water-lily-damaged-before.png`, `/tmp/bird-blossom-before.png`. Generated originals remain under `/Users/avigailsalomy/.codex/generated_images/01a0e341-45b8-7700-a0f9-ef44b133b128/`.

Restored pond prompt:
> Use case: background-extraction. Edit THIS exact supplied production water lily pond sprite. Remove all the fake beige/white checkerboard pixels behind the reeds at the upper right and everywhere outside the natural pond silhouette. The outside must be ACTUAL fully transparent alpha, not a drawn checkerboard or a solid background. Preserve the original pond exactly: same irregular stone rim, water, submerged stones, lily pads, pink/white flowers, reeds, moss, and fine edge details. Preserve useful antialiased edge alpha. Do not crop away reeds or the natural pond edges. No redesign, no added elements, no drop shadow, no rectangle or ground behind it. Preserve composition and aspect ratio as closely as possible. Output clean transparent PNG.

Damaged pond prompt:
> Edit this exact supplied damaged water lily pond game sprite only to clean its transparency. Remove baked grey/white/lavender checkerboard remnants, including contamination on and between the stones near the lower left and lower right rim. Preserve the dry damaged pond, murky water, dead lily pads, reeds, stones, moss, irregular natural edges and fine details faithfully. Restore natural stone surfaces where checker contamination damaged them, preserving the original shapes. Outside the natural pond silhouette must be actual alpha transparency, with clean antialiased edges. No new background, no ground rectangle, no shadow, no redesign. Keep the same composition and aspect ratio. Transparent PNG.

Restored tree prompt:
> Clean the background of this exact production blossom tree sprite. Remove every baked grey/beige checkerboard patch behind and between the branches and flower clusters, including the entire right side. These gaps and all outside pixels must be genuine alpha transparency. Preserve this same tree, its trunk, branching shape, pink/cream blossoms, leaves, mossy rocks, flower bed and fine antialiased edges. No redesign, no extra objects, no replacement background or shadow. Same composition and aspect ratio, transparent PNG.
