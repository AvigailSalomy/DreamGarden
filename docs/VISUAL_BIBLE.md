# DreamGarden — Visual Bible (v0.1, vertical-slice)

The single reference every later asset must match. Temporary art already follows this so the
slice reads as **cozy · magical · dreamy · soft · colourful · whimsical · alive** — never a tech demo.

> Original identity. No Garden Tails artwork, palette, characters, UI or lettering is referenced or reused.

---

## 1. Mood words
cozy · dreamy · hand-made · soft-focus · golden-hour · gentle magic · quietly alive

## 2. Colour palette (authoritative hex)

| Role | Hex | Notes |
|---|---|---|
| Sky top | `#c9b8e8` | soft lavender |
| Sky mid | `#e7cfe4` | mauve blush |
| Sky low | `#ffe0cc` | warm peach (golden hour) |
| Sun glow | `#fff4dd` | additive, upper-right |
| Hills far | `#aab7e2` | hazy periwinkle |
| Hills near | `#a9cf9a` | soft sage |
| Grass — neglected | `#aeb885` | muted olive (slice default) |
| Grass — restored | `#8fc77a` | lively spring green (fade-in target) |
| Dry patch | `#c8c79c` | pale straw |
| Dirt / path | `#cda887` → `#b2895f` | warm clay |
| Rock | `#bfb9cb` / hi `#dcd8e6` | cool lilac-grey |
| Wood | `#c99a6b` / dark `#8f6444` | weathered honey |
| Weeds / neglect | `#6f7d52` | dull bramble |
| Twig / dead | `#7c6a54` | greyed brown |
| UI panel | `#fef6e8` | warm cream paper |
| UI panel edge | `#e7d3af` | soft tan |
| Ink / text | `#5b4636` | warm dark brown (never pure black) |
| Accent gold | `#f5c24b` / light `#ffe6a3` | coins, Play button, rewards |
| Magic violet | `#b98be0` | reveal energy, sparkle cores |
| Sparkle white | `#fffdf5` | never `#ffffff` |
| Shadow | `rgba(70,50,60,0.18)` | soft, warm, never grey/black |

Rule: **no pure black, no pure white, no fully-saturated primaries.** Everything sits a step toward warm & pastel.

## 3. Perspective & staging
- Gentle **¾ storybook view** (~30° tilt). Flat ground plane, objects face camera slightly turned.
- World is a shallow stage: far hills → mid garden → soft foreground framing.
- Portrait 720×1280 design frame; world 2160×1680 (pans by drag).

## 4. Lighting
- Warm key from **upper-right**, cool lavender ambient fill.
- Every ground object gets a **soft contact shadow** (blurred ellipse, `rgba(70,50,60,0.18)`, offset down ~6px).
- Screen edges carry a subtle warm **vignette** (~0.2 alpha).
- "Magic" = additive gold/violet glows + slow sparkles, never harsh bloom.

## 5. Terrain
- Grass = smooth gradient + faint low-contrast speckle + occasional blade tufts. Tileable.
- Path = soft-edged clay ribbon, lighter centre, a few rounded pebbles.
- Neglect signifiers: dry straw patches, bramble weed clumps, a bare twiggy shrub, a mossy stump, a leaning fence. All low-contrast so the scene still feels inviting.

## 6. Vegetation
- Rounded, slightly irregular silhouettes. No spiky realism.
- Leaves as soft lobes; flowers as simple 5-petal daisies with gold centres.
- Idle: whole-plant sway ±3°, 2–2.6 s ease-in-out yoyo, randomised phase.

## 7. Creature proportions (rabbit is the template)
- **Big head (~45% of body), round body, short limbs, oversized calm eyes, tiny blush.**
- Chunky, no visible skeleton, thick soft forms.
- Palette: cream `#f6ecdd` body, pink `#f3c9cf` inner ear, ink `#5b4636` eye, blush `#f2b8b0`.
- Motion vocabulary: breathe (scaleY 1↔1.04), ear twitch, look (±6° tilt / flip), hop (parabolic arc + squash-land). Reads at 90 px tall.

## 8. Objects / furniture
- Storybook-chunky, rounded corners everywhere, 2px soft low-contrast edge or no edge.
- Slight imperfection (a tilt, a knot in wood) = charm.

## 9. UI style
- **Diegetic paper & wood**, not flat material. Cream rounded panels (`#fef6e8`) with a 2 px `#e7d3af` inner edge and a soft drop shadow.
- Corner radius: panels 22–28 px, buttons 20 px, pills fully round.
- **Play button**: gold gradient `#ffe6a3`→`#f5c24b`, soft top highlight, 1.5 px `#d9a43c` edge, gentle 1.0↔1.04 breathing pulse; press = scale 0.96 + darken.
- Progress = round segment pips (empty `#e7d3af`, filled gold with a tiny shine).
- Coins pill: cream round pill, coin icon + number, bounces on gain.
- No sharp rectangles, no hairlines, no dashboard grids, no default HTML controls.

## 10. Typography
- **Baloo 2** (rounded, friendly), bundled via `@fontsource/baloo-2`.
- Weights: 700 titles, 600 buttons/labels, 500 body, 400 captions.
- Colour `#5b4636`. Soft warm shadow `rgba(255,255,255,0.5)` up 1px for a "printed" feel on cream; on art use `rgba(70,50,60,0.25)` down 2px.
- Sentence case, warm and gentle voice. Never ALLCAPS except tiny tracked labels.

## 11. Shadows & outlines
- Shadows: single soft blurred ellipse per grounded object; airborne objects shrink+fade their shadow.
- Outlines: avoid hard strokes. If needed, 2 px at 60–70% of the fill's own darkened tone.

## 12. Particle style
- `spark` — 4-point twinkle + soft core, gold/white, additive, 400–900 ms life, slow.
- `firefly` — warm radial dot, drifts, alpha pulse; count scales with how alive the garden is.
- `petal` — pale pink, diagonal drift + slow spin.
- `glow` — big soft radial, gold or violet, for reveal gather & completion.
- `dust` — pale expanding ring on landings.
- Keep density low; motion slow; everything translucent.

## 13. Animation feel
- Eases: `Sine`/`Quad` for drift, `Back.easeOut` for pops/landings, `Elastic.easeOut` sparingly for playful bounce-back, `Cubic` for camera.
- Nothing linear, nothing snappy-harsh. Durations 180–260 ms for UI pops, 700–1200 ms for reveals, 1.8–2.6 s for ambient loops.
- Squash & stretch on every jump/land. Anticipation before big moves.

## 14. Visual hierarchy
1. Current task card + Play (bottom, highest contrast warm gold).
2. The living creature / active object.
3. Coins pill (top-left).
4. Garden props & terrain.
5. Ambient particles & vignette (never competing for attention).

## 15. The reveal (hero moment) look
gather violet+gold glow at the spot → camera eases in → creature arcs in from screen edge →
squash-land + dust ring + sparkle burst → meadow warms (grey lifts, lush green + daisies fade in) →
coins arc to the pill → creature starts breathing/looking → next task card rises.
Target feeling: a real casual-mobile "you earned something lovely" beat.
