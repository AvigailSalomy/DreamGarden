# DreamGarden — Rabbit Vertical Slice

A cozy magical garden-restoration game. The player revives a neglected garden by
solving **object-as-puzzle** picture puzzles: you reassemble the exact thing that is
about to appear in the garden, then watch it arrive and bring its corner to life.

This repository is **only the Rabbit vertical slice** — one panning meadow, one
object (Nibs the Rabbit), one 4-piece tutorial puzzle. The architecture is built for
the full catalog, but no second object, no full world map, and no shop are included.

Art direction: **Hearthlight Storybook** (see [`docs/VISUAL_BIBLE.md`](docs/VISUAL_BIBLE.md)).
All current art is **temporary hand-authored SVG** that follows the palette and mood;
it is placeholder for the painted asset pack.

---

## Run it

```bash
npm install
npm run dev        # → http://localhost:5173
```

Other scripts:

```bash
npm run typecheck  # tsc --noEmit (strict)
npm run test       # vitest (41 unit tests)
npm run build      # production build → dist/
npm run preview    # serve the built bundle
```

### Demo helpers

- `http://localhost:5173/?reset` — wipes the save before boot (fresh neglected garden).
- Progress auto-saves to `localStorage` under `dreamgarden.save.v1` and is flushed on
  tab hide / page unload.

---

## The loop (milestone)

1. Open app → **neglected meadow**, camera can be dragged around a world larger than
   the viewport.
2. **Task card** slides up: _"Bring back Nibs"_ with a ghosted thumbnail + **Play**.
3. Play → **4-piece drag-and-snap puzzle**: faint ghost image in a wooden frame,
   pieces on a tray, pickup scale, generous snap radius, sparkle on each correct
   placement, no timer / no fail / no punishment.
4. Last piece → **completion celebration**: seams fade, full-picture glow, petals +
   sparkles, screen flash.
5. **Transition back to the garden**, camera eases to the meadow.
6. **Reveal**: magic gathers, Nibs hops in over three arcs and squash-lands.
7. **Meadow restoration**: the neglect veil lifts, lush grass fades in, flowers bloom.
8. **Coins** fly from the rabbit to the HUD and tick up (saved _before_ the animation).
9. Nibs starts a living **idle/hop** loop (weighted state machine, bounded hops).
10. **Refresh the page** → Nibs is already there, meadow already restored, task card
    shows the garden is resting. Nothing replays.

---

## Architecture

```
src/
  main.ts                 entry — loads fonts, starts the game
  game/
    DreamGarden.ts        Phaser.Game config (portrait 720×1280, Scale.FIT)
    config.ts             design/world size, save key, start scroll
    services.ts           singletons: bus, save, economy, progression
  core/
    EventBus.ts           tiny typed pub/sub (no Phaser)  — decouples scenes/services
    events.ts             the cross-scene event contract (data-only payloads)
    SaveService.ts        localStorage mirror, migration, guarded read/write
    EconomyService.ts     coin balance + coins:changed events
    ProgressionService.ts "what am I working on / what is earned"; commits to disk
                          BEFORE any reveal animation runs
    rng.ts                mulberry32 + FNV-1a hash (deterministic puzzle shuffles)
  data/
    types.ts              GardenObjectDef, SaveState, view-models
    objects.ts            the catalog — currently ONE row: RABBIT (2×2 puzzle)
    progression.ts        constrained requirement-sequence generator (for later objects)
  scenes/
    BootScene → PreloadScene → GardenScene (+ UIScene launched parallel)
    PuzzleScene            modal puzzle over the paused garden
  puzzle/
    slice.ts              pure geometry: sliceGrid / shuffle / nearestEmptyCell / trayLayout
    PuzzleTile.ts         one draggable dressed picture tile
    PuzzleBoard.ts        builds + runs a puzzle, frame + ghost + tray + solve
  world/
    cameraMath.ts         pure: clampScroll / decayVelocity / isDragGesture
    CameraController.ts    drag-to-pan + inertia + tap/drag disambiguation + focusOn
    GardenObjectView.ts    body + contact shadow, hop height, squash, y-sort
    RegionOverlay.ts       the neglect veil + hidden lush grass / flowers per region
  reveal/
    RevealSequencer.ts    the hero moment; a single `finally` forces the saved end state
    entrancePresets.ts    hop_in (animal) + scale_bloom (plants, ready for later)
  behavior/
    IdleBehavior.ts       weighted idle/look/hop/rest state machine
  fx/
    Particles.ts          sparkle / petal / dust / gather-glow / ambient fireflies
    Sfx.ts                WebAudio synth — no audio files
  ui/
    theme.ts  Panel.ts  Button.ts   cream-paper panels, chunky gold buttons
tests/                    41 vitest unit tests over the pure logic
public/assets/svg/        temporary SVG art
```

**Key principle:** logical state (unlock, coins, task pointer) is written to
`localStorage` the instant a puzzle is solved — every animation after that is pure
presentation. Closing the app mid-reveal just means the rabbit is already home on the
next launch.

---

## Known temporary / not-yet-done

See the handoff notes from the slice review, but in short: all art is placeholder
SVG; the palette in code currently leans lavender-pastel and needs a pass against the
approved golden-hour Hearthlight Storybook palette; fence-repair, burrow-upgrade,
carrot patch, hutch, signpost, butterflies and god-rays are all deferred
(nice-to-have) and not in this slice.
