import { MazeRun, PLAYER_MS_PER_CELL } from "../src/data/mazeRun";
import type { Cell, Dir } from "../src/data/mazeRun";

/**
 * A reasonably careful player bot for the maze simulation — a stand-in for
 * "a person paying attention", used only by tests to measure run length and
 * winnability. It never reads the enemies' AI; it only sees where they are:
 *
 *  - a cell is SAFE to step through if the bot can reach it clearly before
 *    any awake enemy could (maze steps × speeds, plus a safety margin);
 *  - it walks the shortest safe route to the nearest mission item, grabbing
 *    coins only when they're on the way;
 *  - with no safe route, it retreats to the reachable cell with the biggest
 *    lead over the enemies.
 *
 * It decides once per cell approached (like steering at junctions), with a
 * human-ish reaction delay between looks.
 */
export function playWithBot(run: MazeRun, opts: { thinkMs?: number; maxMs?: number; marginMs?: number } = {}) {
  const thinkMs = opts.thinkMs ?? 160;
  const maxMs = opts.maxMs ?? 400_000;
  const margin = opts.marginMs ?? 450;
  let sinceThink = thinkMs;
  let hits = 0;
  let lastReverseAt = -1e9;
  while ((run.status === "playing" || run.status === "dying") && run.timeMs < maxMs) {
    if (sinceThink >= thinkMs) {
      sinceThink = 0;
      const d = decide(run, margin);
      const dir = run.player.dir;
      const isReverse = !!(d && dir && run.player.next && d.dr === -dir.dr && d.dc === -dir.dc);
      // commit to an escape: no flip-flopping back and forth within half a second
      if (d && (!isReverse || run.timeMs - lastReverseAt > 550)) {
        if (isReverse) lastReverseAt = run.timeMs;
        run.setWantDir(d);
      }
    }
    const events = run.tick(20);
    sinceThink += 20;
    hits += events.filter((e) => e.type === "hit").length;
  }
  return { status: run.status, timeMs: run.timeMs, hits, collected: run.collected, coins: run.coinsEarned };
}

const k = (c: Cell) => `${c.row},${c.col}`;

function decide(run: MazeRun, margin: number): Dir | null {
  const g = run.grid;
  const here = run.player.next ?? run.player.cell;
  // time until the player actually stands on `here`
  const hereDelay = run.player.next ? (1 - run.player.t) * PLAYER_MS_PER_CELL : 0;

  // earliest time any enemy could be DANGEROUS on each cell
  const enemyTime = new Map<string, number>();
  for (const e of run.enemies) {
    if (e.mode === "returning") continue;
    const wait =
      e.mode === "sleeping"
        ? Math.max(0, e.modeTimerMs - run.timeMs)
        : e.mode === "respawning"
          ? e.modeTimerMs
          : e.mode === "frightened"
            ? run.powerMs
            : 0;
    const origin = e.next ?? e.cell;
    const lead = e.next ? (1 - e.t) * e.msPerCell : 0;
    for (const [key, d] of g.distances(origin)) {
      const t = wait + lead + d * e.msPerCell;
      if (t < (enemyTime.get(key) ?? Infinity)) enemyTime.set(key, t);
    }
    // the cell it's leaving is also "occupied" right now
    if (e.next && e.mode === "active") enemyTime.set(k(e.cell), Math.min(enemyTime.get(k(e.cell)) ?? Infinity, 0));
  }
  const invuln = run.protectMs;
  const safeAt = (key: string, t: number) => t < invuln || t + margin < (enemyTime.get(key) ?? Infinity);

  // hysteresis: while walking into a cell that's still safe, never turn back
  // (turning back is only for when the cell ahead is about to be taken)
  const behind = run.player.next ? k(run.player.cell) : null;
  if (behind && run.player.dir && !safeAt(k(here), hereDelay)) {
    return { dr: -run.player.dir.dr, dc: -run.player.dir.dc };
  }

  // BFS over cells the bot can reach safely
  const prev = new Map<string, string>();
  const arrive = new Map<string, number>([[k(here), hereDelay]]);
  const q: Cell[] = [here];
  let goal: string | null = null;
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    const ck = k(cur);
    if (i > 0 && (run.items.has(ck) || (run.lives < 3 && run.hearts.has(ck)))) {
      goal = ck;
      break;
    }
    for (const n of g.neighbours(cur)) {
      const nk = k(n);
      if (arrive.has(nk)) continue;
      const t = arrive.get(ck)! + PLAYER_MS_PER_CELL;
      if (!safeAt(nk, t)) continue;
      arrive.set(nk, t);
      prev.set(nk, ck);
      q.push(n);
    }
  }
  if (!goal) {
    // no safe route to an item: retreat to the reachable cell with the biggest lead
    let best = k(here);
    let bestLead = -Infinity;
    for (const [key, t] of arrive) {
      const lead = (enemyTime.get(key) ?? 1e6) - t;
      if (lead > bestLead) {
        bestLead = lead;
        best = key;
      }
    }
    goal = best;
  }
  if (goal === k(here)) {
    // boxed in: step to whichever neighbour an enemy reaches last
    let bestDir: Dir | null = null;
    let bestT = -Infinity;
    for (const n of g.neighbours(here)) {
      const t = enemyTime.get(k(n)) ?? 1e6;
      if (t > bestT) {
        bestT = t;
        bestDir = { dr: n.row - here.row, dc: n.col - here.col };
      }
    }
    return bestDir;
  }
  let step = goal;
  while (prev.get(step) !== k(here)) step = prev.get(step)!;
  const [r, c] = step.split(",").map(Number);
  return { dr: r - here.row, dc: c - here.col };
}
