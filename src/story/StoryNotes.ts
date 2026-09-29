import Phaser from "phaser";
import { FrostedNoteScene } from "../scenes/FrostedNoteScene";
import type { NoteLaunch, NoteResult } from "../scenes/FrostedNoteScene";
import { frostedProgression } from "../game/services";

export type ShowNoteOptions = Omit<NoteLaunch, "onDone">;

interface Pending {
  opts: ShowNoteOptions;
  resolve: (r: NoteResult) => void;
}

const queue: Pending[] = [];
let active = false;

/**
 * The one entry point for showing a story/tutorial note. Notes are queued so
 * two can never stack on screen, and a `once` note's seen-flag is persisted
 * (through the existing FrostedValleyProgressionService save slice) the moment
 * it's dismissed — a reload mid-note simply shows it again.
 *
 * The FrostedNote scene is registered lazily, last in the scene list, so it
 * renders above the world, the maze and the puzzle alike without touching
 * the game's scene config.
 */
export function showNote(game: Phaser.Game, opts: ShowNoteOptions): Promise<NoteResult> {
  return new Promise((resolve) => {
    queue.push({ opts, resolve });
    pump(game);
  });
}

export function isNoteActive(): boolean {
  return active;
}

function pump(game: Phaser.Game): void {
  if (active) return;
  const next = queue.shift();
  if (!next) return;
  active = true;

  const mgr = game.scene;
  if (!mgr.getScene(FrostedNoteScene.KEY)) mgr.add(FrostedNoteScene.KEY, FrostedNoteScene, false);

  const data: NoteLaunch = {
    ...next.opts,
    onDone: (result) => {
      if (next.opts.note.once) frostedProgression.markStoryNoteSeen(next.opts.note.id);
      active = false;
      next.resolve(result);
      pump(game);
    },
  };
  // queued (not direct) so it always lands AFTER any pending stop of the
  // previous note and after a just-launched scene it has to sit on top of
  (mgr as unknown as { queueOp(op: string, keyA: string, keyB: unknown): void }).queueOp("start", FrostedNoteScene.KEY, data);
}
