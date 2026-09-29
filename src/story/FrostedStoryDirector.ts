import Phaser from "phaser";
import { frostedProgression } from "../game/services";
import {
  NOT_YET_HINT,
  PUZZLE_TUTORIAL,
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
}

/**
 * Drives the guided Rabbit / Fox chapters on top of the existing systems:
 *
 *   silhouette → STORY note → requirement (highlighted, one at a time) →
 *   OBJECTIVE note → existing Garden Maze → short CELEBRATION → existing
 *   restoration cinematic → next requirement … → "all restored" note →
 *   existing puzzle (+ one-time TUTORIAL) → living artwork → existing unlock
 *   cinematic → final CELEBRATION note → active animal.
 *
 * It owns no progression truth — every decision reads
 * FrostedValleyProgressionService, and every "seen" flag lives in its save
 * slice (see StoryNotes) — so a reload lands back on exactly the right step.
 * Animals without story data (data/frostedStory.ts) are left to the
 * original Request-screen flow.
 */
export class FrostedStoryDirector {
  private highlight?: { resourceKey: string; objs: Phaser.GameObjects.GameObject[] };
  private readonly onMazeHit = (e: { livesLeft: number }) => this.mazeHit(e);

  constructor(private host: StoryHost) {
    const game = host.scene.game;
    game.events.on("gardenMaze:hit", this.onMazeHit);
    host.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      game.events.off("gardenMaze:hit", this.onMazeHit);
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

  /** World bounds → screen rect, trimmed a little since the art has soft transparent margins. */
  private screenRect(obj: Phaser.GameObjects.Image | undefined, trim = 0.12): NoteTarget | null {
    if (!obj || !obj.active) return null;
    const cam = this.host.scene.cameras.main;
    const b = obj.getBounds();
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

  /* ------------------------------------------------------------ chapter start */

  /**
   * The camera just settled on this animal (opening reveal, or the hand-off
   * after the previous rescue). First time only: the STORY note beside it.
   * Returns true when the director owns this animal's flow.
   */
  async onSettled(animalId: string | undefined): Promise<boolean> {
    const story = animalId ? storyFor(animalId) : undefined;
    if (!animalId || !story) return false;
    if (frostedProgression.isRescued(animalId)) return true;
    // its old-style full-screen letter is replaced by this note
    frostedProgression.markLetterSeen(animalId);
    if (!frostedProgression.isUnlockPending(animalId) && shouldShowNote(story.intro, (id) => frostedProgression.isStoryNoteSeen(id))) {
      await this.lockedNote(story.intro, { target: this.screenRect(this.host.animalSprite(animalId), 0.05), envelope: true });
    }
    this.refreshHighlight();
    // everything already restored on an earlier visit: point straight at the puzzle
    if (frostedProgression.isPuzzleAvailable(animalId) && !frostedProgression.isPuzzleSolved(animalId)) {
      await this.offerPuzzle(animalId);
    }
    return true;
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

    // its silhouette: the gateway to the puzzle once everything's restored,
    // otherwise a gentle nudge toward the requirement that's next
    const sil = this.host.animalSprite(animalId);
    if (sil) {
      const b = sil.getBounds();
      const pad = Math.max(40, b.width * 0.15);
      if (Phaser.Geom.Rectangle.Contains(new Phaser.Geom.Rectangle(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2), x, y)) {
        if (frostedProgression.isUnlockPending(animalId)) return true;
        if (frostedProgression.isPuzzleAvailable(animalId)) void this.offerPuzzle(animalId);
        else {
          this.host.showHint(sil.x, b.y, NOT_YET_HINT);
          this.pulseHighlight();
        }
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

  private async onRequirementTap(animalId: string, resourceId: string): Promise<void> {
    const def = frostedProgression.def(animalId);
    if (!def) return;
    const next = nextActionableResource(def, (id) => frostedProgression.resourceState(animalId, id).restored);
    const sprite = this.host.requirementSprite(animalId, resourceId);
    if (next !== resourceId) {
      // a future requirement: never skip ahead
      if (sprite) this.host.showHint(sprite.x, sprite.getBounds().y + 40, NOT_YET_HINT);
      this.pulseHighlight();
      return;
    }
    // enough was already collected on an earlier (pre-story) run: restore now
    if (frostedProgression.canRestore(animalId, resourceId)) {
      await this.restore(animalId, resourceId);
      return;
    }
    const req = requirementStory(animalId, resourceId);
    if (req && shouldShowNote(req.note, (id) => frostedProgression.isStoryNoteSeen(id))) {
      const result = await this.lockedNote(req.note, { target: this.screenRect(sprite) });
      if (result !== "confirm") return;
    }
    this.launchMaze(animalId, resourceId);
  }

  /* ------------------------------------------------------------ maze */

  /**
   * The existing Garden Maze; on a win it resumes the world straight into
   * FrostedValleyScene.triggerRestore, which plays `celebrate` then the
   * restoration cinematic, then calls back into `afterRestore`.
   */
  private launchMaze(animalId: string, resourceId: string): void {
    const scene = this.host.scene;
    scene.scene.pause();
    scene.scene.launch("FrostedMaze", { animalId, resourceId, returnTo: scene.scene.key });
  }

  private async restore(animalId: string, resourceId: string): Promise<void> {
    await this.host.triggerRestore(animalId, resourceId);
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
    if (e.livesLeft <= 0 || !shouldShowNote(tip, (id) => frostedProgression.isStoryNoteSeen(id))) return;
    // flag it right away so a second hit during the tip can't queue another
    frostedProgression.markStoryNoteSeen(tip.id);
    void this.note({ ...tip, once: false }, { blocking: false, anchor: "top-right" });
  }

  /* ------------------------------------------------------------ after restore */

  /** Called by FrostedValleyScene.triggerRestore once the restoration cinematic has finished. */
  async afterRestore(animalId: string): Promise<void> {
    this.refreshHighlight();
    if (frostedProgression.isPuzzleAvailable(animalId)) await this.offerPuzzle(animalId);
  }

  private async offerPuzzle(animalId: string): Promise<void> {
    const story = storyFor(animalId);
    if (!story) return;
    const result = await this.lockedNote(story.allRestored, {
      target: this.screenRect(this.host.animalSprite(animalId), 0.05),
      envelope: true,
    });
    if (result === "confirm") this.openPuzzle(animalId);
  }

  /** Opens the existing puzzle, with the global one-time tutorial on top of the very first one. */
  openPuzzle(animalId: string): void {
    this.host.openPuzzle(animalId);
    if (shouldShowNote(PUZZLE_TUTORIAL, (id) => frostedProgression.isStoryNoteSeen(id))) {
      void this.note(PUZZLE_TUTORIAL, { blocking: true, anchor: "center", delayMs: 650 });
    }
  }

  /* ------------------------------------------------------------ after unlock */

  /** Right after the unlock cinematic: the final celebration note, beside the now-real animal. */
  async afterUnlock(animalId: string): Promise<void> {
    const story = storyFor(animalId);
    if (!story || !shouldShowNote(story.final, (id) => frostedProgression.isStoryNoteSeen(id))) return;
    await this.lockedNote(story.final, { target: this.screenRect(this.host.animalSprite(animalId), 0.05), envelope: true });
  }

  /* ------------------------------------------------------------ highlight */

  /** A soft breathing glow + a bobbing sparkle on the ONE requirement that's actionable now. */
  refreshHighlight(): void {
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
  }

  private clearHighlight(): void {
    for (const o of this.highlight?.objs ?? []) {
      this.host.scene.tweens.killTweensOf(o);
      o.destroy();
    }
    this.highlight = undefined;
  }
}
