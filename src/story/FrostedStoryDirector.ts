import Phaser from "phaser";
import { bus, frostedProgression } from "../game/services";
import {
  NOT_YET_HINT,
  PUZZLE_TUTORIAL,
  SHOP_DONE,
  SHOP_INTRO,
  SHOP_THANKS,
  SHOP_TUTORIAL,
  mazeHitTutorial,
  nextActionableResource,
  requirementStory,
  shouldShowNote,
  storyFor,
} from "../data/frostedStory";
import type { StoryNoteDef } from "../data/frostedStory";
import type { NoteResult, NoteTarget } from "../scenes/FrostedNoteScene";
import { showNote } from "./StoryNotes";
import type { ShowNoteOptions } from "./StoryNotes";

/** What the director needs from FrostedValleyScene — nothing more. */
export interface StoryHost {
  scene: Phaser.Scene;
  /** The damaged sprite of a requirement (world-space), if it exists in this world. */
  requirementSprite(animalId: string, resourceId: string): Phaser.GameObjects.Image | undefined;
  /** The animal's current world sprite (silhouette or NPC). */
  animalSprite(animalId: string): Phaser.GameObjects.Image | undefined;
  /** Block world taps + camera for a story beat; returns the release function. */
  lock(): () => void;
  /** The existing restore entry point (commit + ~6s restoration cinematic). */
  triggerRestore(animalId: string, resourceId: string): Promise<void>;
  /** The existing puzzle entry point. */
  openPuzzle(animalId: string): void;
  /** The existing small floating hint bubble. */
  showHint(x: number, y: number, message: string): void;
  /** Gently pan so this (world-space) area is comfortably on screen — framed with `companion` when both fit. */
  bringIntoView(area: Phaser.Geom.Rectangle, companion?: Phaser.GameObjects.Image): Promise<void>;
  /** Centre the camera on these objects' real bounds, zoomed so they fill `fill` of the screen. */
  frame(objs: Phaser.GameObjects.Image[], fill: number, minZoom: number, maxZoom: number): Promise<void>;
  frameRect(r: Phaser.Geom.Rectangle, fill: number, minZoom: number, maxZoom: number): Promise<void>;
  /** World bounds of the Winter Market building. */
  shopBounds(): Phaser.Geom.Rectangle;
  /** The existing Shop entry point, optionally on a given tab / previewing a given friend. */
  openShop(tab?: string, previewAnimal?: string): void;
  /** Is a Shop item currently being dragged/placed in the world? */
  isPlacing(): boolean;
}

interface MazeClosed {
  animalId: string;
  resourceId: string;
  completed: boolean;
}

/**
 * Drives every guided chapter on top of the existing systems. The player is
 * never left to guess: each progression step leads straight into the next
 * one's framing + envelope, event by event (no timers):
 *
 *   camera settles on the animal → STORY note → camera frames the next
 *   requirement → its OBJECTIVE note (button → maze) → maze win → short
 *   CELEBRATION → restoration cinematic → next requirement framed + its
 *   note … → "all restored" note → puzzle (+ one-time TUTORIAL) → living
 *   artwork → unlock cinematic → final note → [after the Rabbit only: the
 *   guided first Shop visit] → camera travels to the next animal.
 *
 * Leaving a maze without winning brings the same requirement's note back,
 * so there is always a visible next step. It owns no progression truth —
 * every decision reads FrostedValleyProgressionService, and every "seen"
 * flag lives in its save slice — so a reload lands on exactly the right step.
 */
export class FrostedStoryDirector {
  private highlight?: { resourceKey: string; objs: Phaser.GameObjects.GameObject[] };
  /** A guidance beat (framing + note) is running — never start a second one on top. */
  private guiding = false;
  private readonly onMazeHit = (e: { livesLeft: number }) => this.mazeHit(e);
  private readonly onMazeClosed = (e: MazeClosed) => void this.mazeClosed(e);

  constructor(private host: StoryHost) {
    const game = host.scene.game;
    game.events.on("gardenMaze:hit", this.onMazeHit);
    game.events.on("gardenMaze:closed", this.onMazeClosed);
    host.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      game.events.off("gardenMaze:hit", this.onMazeHit);
      game.events.off("gardenMaze:closed", this.onMazeClosed);
      this.clearHighlight();
    });
  }

  handles(animalId: string | undefined): boolean {
    return !!animalId && !!storyFor(animalId);
  }

  /* ------------------------------------------------------------ helpers */

  private get game(): Phaser.Game {
    return this.host.scene.game;
  }

  private seen = (id: string) => frostedProgression.isStoryNoteSeen(id);

  /** World bounds → screen rect, trimmed a little since the art has soft transparent margins. */
  private screenRect(obj: Phaser.GameObjects.Image | Phaser.Geom.Rectangle | undefined, trim = 0.12): NoteTarget | null {
    if (!obj) return null;
    if (!(obj instanceof Phaser.Geom.Rectangle) && !obj.active) return null;
    const cam = this.host.scene.cameras.main;
    const b = obj instanceof Phaser.Geom.Rectangle ? obj : obj.getBounds();
    const z = cam.zoom;
    const x = (b.x + b.width * trim - cam.worldView.x) * z;
    const y = (b.y + b.height * trim - cam.worldView.y) * z;
    return { x, y, w: b.width * (1 - trim * 2) * z, h: b.height * (1 - trim * 2) * z };
  }

  private async note(def: StoryNoteDef, opts: Partial<ShowNoteOptions> = {}): Promise<NoteResult> {
    return showNote(this.game, { note: def, ...opts });
  }

  /** Show a note while the world is locked (no taps, no camera). */
  private async lockedNote(def: StoryNoteDef, opts: Partial<ShowNoteOptions> = {}): Promise<NoteResult> {
    const release = this.host.lock();
    try {
      return await this.note(def, opts);
    } finally {
      release();
    }
  }

  /** Resolves on the first game step where `cond` holds — works while the world scene is paused. */
  private waitUntil(cond: () => boolean): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        if (!cond()) return;
        this.game.events.off(Phaser.Core.Events.POST_STEP, check);
        resolve();
      };
      this.game.events.on(Phaser.Core.Events.POST_STEP, check);
      check();
    });
  }

  private sceneRunning(key: string): boolean {
    return this.game.scene.isActive(key);
  }

  /* ------------------------------------------------------------ chapter start */

  /**
   * The camera arrived at this animal (opening reveal, or the hand-off after
   * the previous rescue). First time: the STORY note beside it. Then — every
   * time, including after a reload — straight on to the next step.
   * Returns true when the director owns this animal's flow.
   */
  async onSettled(animalId: string | undefined): Promise<boolean> {
    const story = animalId ? storyFor(animalId) : undefined;
    if (!animalId || !story) return false;
    if (frostedProgression.isRescued(animalId)) return true;
    // its old-style full-screen letter is replaced by this note
    frostedProgression.markLetterSeen(animalId);
    if (frostedProgression.isUnlockPending(animalId)) return true;
    const sil = this.host.animalSprite(animalId);
    if (shouldShowNote(story.intro, this.seen)) {
      if (sil) await this.host.frame([sil], 0.32, 0.5, 0.9);
      await this.lockedNote(story.intro, { target: this.screenRect(sil, 0.05), envelope: true });
    }
    await this.guideNext(animalId);
    return true;
  }

  /**
   * THE "what now?" answer: whatever the current step is, frame it and open
   * its envelope — the next requirement's objective, or the puzzle once all
   * are restored. Called on every progression event, never by a timer.
   */
  async guideNext(animalId: string): Promise<void> {
    if (!this.handles(animalId) || frostedProgression.isRescued(animalId) || !frostedProgression.isCurrentAnimal(animalId)) return;
    if (this.guiding) return;
    this.guiding = true;
    try {
      // no separate pan here: offerPuzzle / introduceRequirement frame the step
      // themselves, and a second, concurrent pan would swallow theirs (Phaser
      // ignores a pan while another runs) — leaving their await hanging forever
      this.refreshHighlight(false);
      if (frostedProgression.isPuzzleAvailable(animalId)) {
        if (!frostedProgression.isPuzzleSolved(animalId)) await this.offerPuzzle(animalId);
        return;
      }
      const def = frostedProgression.def(animalId);
      const next = def ? nextActionableResource(def, (id) => frostedProgression.resourceState(animalId, id).restored) : null;
      if (next) await this.introduceRequirement(animalId, next);
    } finally {
      this.guiding = false;
    }
  }

  /** Frame the requirement, then its objective envelope; its button goes straight into the maze. */
  private async introduceRequirement(animalId: string, resourceId: string): Promise<void> {
    const sprite = this.host.requirementSprite(animalId, resourceId);
    const req = requirementStory(animalId, resourceId);
    if (!sprite || !req) return;
    // enough already collected (e.g. an older save): no maze needed, restore now
    if (frostedProgression.canRestore(animalId, resourceId)) {
      this.guiding = false;
      await this.host.triggerRestore(animalId, resourceId);
      return;
    }
    await this.host.frame([sprite], 0.42, 0.45, 1.0);
    const result = await this.lockedNote(req.note, { target: this.screenRect(sprite), envelope: true });
    if (result === "confirm") this.launchMaze(animalId, resourceId);
  }

  /* ------------------------------------------------------------ taps */

  /** World tap (world coords). Returns true if the story flow consumed it. */
  handleTap(x: number, y: number): boolean {
    const current = frostedProgression.currentAnimal;
    if (!current || !this.handles(current.id)) return false;
    const animalId = current.id;
    if (frostedProgression.isRescued(animalId)) return false;

    // requirement objects of the current animal
    for (const r of current.resources) {
      const sprite = this.host.requirementSprite(animalId, r.id);
      if (!sprite || sprite.alpha < 0.5) continue; // restored ones are just scenery now
      const b = sprite.getBounds();
      const inset = Math.min(b.width, b.height) * 0.12;
      if (!Phaser.Geom.Rectangle.Contains(new Phaser.Geom.Rectangle(b.x + inset, b.y + inset, b.width - inset * 2, b.height - inset * 2), x, y)) {
        continue;
      }
      void this.onRequirementTap(animalId, r.id);
      return true;
    }

    // its silhouette: re-opens whatever the current step is
    const sil = this.host.animalSprite(animalId);
    if (sil) {
      const b = sil.getBounds();
      const pad = Math.max(40, b.width * 0.15);
      if (Phaser.Geom.Rectangle.Contains(new Phaser.Geom.Rectangle(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2), x, y)) {
        if (!frostedProgression.isUnlockPending(animalId)) void this.guideNext(animalId);
        return true;
      }
    }
    return false;
  }

  /** Draw the eye back to the one requirement that's actionable now. */
  private pulseHighlight(): void {
    const hl = this.highlight?.objs[0] as Phaser.GameObjects.Image | undefined;
    if (hl?.active) this.host.scene.tweens.add({ targets: hl, scale: hl.scale * 1.35, duration: 260, yoyo: true, repeat: 1, ease: "Sine.easeInOut" });
  }

  /** Tapping the current requirement (after dismissing its note) goes straight to its maze. */
  private async onRequirementTap(animalId: string, resourceId: string): Promise<void> {
    const def = frostedProgression.def(animalId);
    if (!def || this.guiding) return;
    const next = nextActionableResource(def, (id) => frostedProgression.resourceState(animalId, id).restored);
    const sprite = this.host.requirementSprite(animalId, resourceId);
    if (next !== resourceId) {
      // a future requirement: never skip ahead
      if (sprite) this.host.showHint(sprite.x, sprite.getBounds().y + 40, NOT_YET_HINT);
      this.pulseHighlight();
      return;
    }
    if (frostedProgression.canRestore(animalId, resourceId)) {
      await this.host.triggerRestore(animalId, resourceId);
      return;
    }
    this.launchMaze(animalId, resourceId);
  }

  /* ------------------------------------------------------------ maze */

  /**
   * The existing maze; on a win it resumes the world straight into
   * FrostedValleyScene.triggerRestore, which plays `celebrate` then the
   * restoration cinematic, then calls back into `afterRestore`.
   */
  private launchMaze(animalId: string, resourceId: string): void {
    const scene = this.host.scene;
    scene.scene.pause();
    scene.scene.launch("FrostedMaze", { animalId, resourceId, returnTo: scene.scene.key });
  }

  /** Left the maze without winning: the same objective is offered again right away. */
  private async mazeClosed(e: MazeClosed): Promise<void> {
    if (e.completed || !this.handles(e.animalId) || !frostedProgression.isCurrentAnimal(e.animalId)) return;
    await this.waitUntil(() => this.sceneRunning(this.host.scene.scene.key));
    await this.guideNext(e.animalId);
  }

  /** The short "all collected!" beat, right before the restoration cinematic — never over it. */
  async celebrate(animalId: string, resourceId: string): Promise<void> {
    const req = requirementStory(animalId, resourceId);
    this.clearHighlight();
    if (!req) return;
    await this.lockedNote(
      { id: `${animalId}_${resourceId}_celebration`, kind: "celebration", title: req.celebration, body: "", durationMs: 1900, once: false },
      { blocking: false },
    );
  }

  /** The very first time the player is ever hit in the maze: a tiny, non-blocking tip. */
  private mazeHit(e: { livesLeft: number }): void {
    const tip = mazeHitTutorial(e.livesLeft);
    if (e.livesLeft <= 0 || !shouldShowNote(tip, this.seen)) return;
    // flag it right away so a second hit during the tip can't queue another
    frostedProgression.markStoryNoteSeen(tip.id);
    void this.note({ ...tip, once: false }, { blocking: false, anchor: "top-right" });
  }

  /* ------------------------------------------------------------ after restore */

  /** Called by FrostedValleyScene.triggerRestore the moment the restoration cinematic ends. */
  async afterRestore(animalId: string): Promise<void> {
    this.refreshHighlight(false); // guideNext frames the next step itself
    await this.guideNext(animalId);
  }

  /**
   * Once, between the Rabbit and the Fox: the coins are explained, the camera
   * shows the Winter Market, the first visit is guided (accessories for the
   * new friend first), and closing the Shop hands straight back to the story.
   * It changes no progression — the Fox stays exactly as locked as it was.
   */
  async shopIntro(friendId = "fv_rabbit"): Promise<void> {
    // only once the first friend is really home, and only ever once (also
    // re-offered after a reload that interrupted it — see FrostedValleyScene)
    if (!frostedProgression.isRescued("fv_rabbit") || !shouldShowNote(SHOP_INTRO, this.seen)) return;
    const shop = this.host.shopBounds();
    await this.host.frameRect(shop, 0.4, 0.45, 0.9);
    const result = await this.lockedNote(SHOP_INTRO, { target: this.screenRect(shop, 0), envelope: true });

    if (result === "confirm") {
      let purchased = false;
      const onPurchased = () => (purchased = true);
      bus.on("frosted:shopPurchased", onPurchased);
      try {
        this.host.openShop("pet", friendId);
        if (shouldShowNote(SHOP_TUTORIAL, this.seen)) void this.note(SHOP_TUTORIAL, { blocking: true, anchor: "center", delayMs: 300 });
        // wait for the Shop to open, then for the whole visit (incl. dragging an item out) to end
        await this.waitUntil(() => this.sceneRunning("FrostedShop"));
        await this.waitUntil(() => !this.sceneRunning("FrostedShop") && this.sceneRunning(this.host.scene.scene.key) && !this.host.isPlacing());
      } finally {
        bus.off("frosted:shopPurchased", onPurchased);
      }
      if (purchased) await this.lockedNote(SHOP_THANKS, { blocking: false });
    }
    // either way, the story points on to the next friend
    await this.lockedNote(SHOP_DONE, { target: this.screenRect(shop, 0) });
  }

  private async offerPuzzle(animalId: string): Promise<void> {
    const story = storyFor(animalId);
    if (!story) return;
    const sil = this.host.animalSprite(animalId);
    if (sil) await this.host.frame([sil], 0.32, 0.5, 0.9);
    const result = await this.lockedNote(story.allRestored, { target: this.screenRect(sil, 0.05), envelope: true });
    if (result === "confirm") this.openPuzzle(animalId);
  }

  /** Opens the existing puzzle, with the global one-time tutorial on top of the very first one. */
  openPuzzle(animalId: string): void {
    this.host.openPuzzle(animalId);
    if (shouldShowNote(PUZZLE_TUTORIAL, this.seen)) {
      void this.note(PUZZLE_TUTORIAL, { blocking: true, anchor: "center", delayMs: 650 });
    }
  }

  /* ------------------------------------------------------------ after unlock */

  /** Right after the unlock cinematic: the final celebration note, beside the now-real animal. */
  async afterUnlock(animalId: string): Promise<void> {
    const story = storyFor(animalId);
    if (story && shouldShowNote(story.final, this.seen)) {
      await this.lockedNote(story.final, { target: this.screenRect(this.host.animalSprite(animalId), 0.05), envelope: true });
    }
    // the first friend is back: time to meet the Winter Market, before the next chapter begins
    if (shouldShowNote(SHOP_INTRO, this.seen)) await this.shopIntro(animalId);
  }

  /* ------------------------------------------------------------ highlight */

  /**
   * A soft breathing glow + a bobbing sparkle on the ONE requirement that's
   * actionable now. `bringIntoView`: also pan so it's on screen — off when the
   * caller is about to frame that step itself.
   */
  refreshHighlight(bringIntoView = true): void {
    const current = frostedProgression.currentAnimal;
    const animalId = current?.id;
    const next =
      current && this.handles(animalId) && !frostedProgression.isRescued(current.id)
        ? nextActionableResource(current, (id) => frostedProgression.resourceState(current.id, id).restored)
        : null;
    const key = next && animalId ? `${animalId}:${next}` : "";
    if (this.highlight?.resourceKey === key) return;
    this.clearHighlight();
    if (!next || !animalId) return;
    const sprite = this.host.requirementSprite(animalId, next);
    if (!sprite) return;

    const scene = this.host.scene;
    const b = sprite.getBounds();
    const size = Math.max(b.width, b.height);
    const glow = scene.add
      .image(b.centerX, b.centerY + b.height * 0.1, "glow")
      .setDepth(sprite.depth - 0.05)
      .setDisplaySize(size * 1.25, size * 1.0)
      // a normal-blend icy tint: additive light vanishes against white snow
      .setTint(0x5fb4ea)
      .setAlpha(0);
    scene.tweens.add({ targets: glow, alpha: { from: 0.22, to: 0.5 }, duration: 1300, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    const markerKey = scene.textures.exists("fv_star_sparkle") ? "fv_star_sparkle" : "spark";
    const marker = scene.add
      .image(b.centerX, b.y + b.height * 0.08, markerKey)
      .setDepth(sprite.depth + 0.2)
      .setAlpha(0.95);
    marker.setScale(Math.max(70, size * 0.2) / Math.max(marker.width, 1));
    scene.tweens.add({ targets: marker, y: marker.y - size * 0.06, duration: 900, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    scene.tweens.add({ targets: marker, angle: 20, duration: 1800, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });

    this.highlight = { resourceKey: key, objs: [glow, marker] };
    // make sure the player can actually SEE what to tap next (the requirement
    // may sit at, or past, the edge of the view the camera settled on)
    if (bringIntoView) void this.host.bringIntoView(b, this.host.animalSprite(animalId));
  }

  private clearHighlight(): void {
    for (const o of this.highlight?.objs ?? []) {
      this.host.scene.tweens.killTweensOf(o);
      o.destroy();
    }
    this.highlight = undefined;
  }
}
