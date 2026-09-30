/**
 * Frozen Pac-Man — narrow-turn tests, real keyboard input only.
 *
 *   npm run e2e:server        # terminal 1 (isolated DEV server, :5199)
 *   npm run test:e2e:turns    # terminal 2
 *   ONLY=fox ... / SHOTS=<dir> ...
 *
 * For each maze it finds NARROW OPENINGS automatically: a junction on a
 * straight corridor with exactly one side exit (a single-tile opening) and
 * four straight approach tiles with no earlier opening on that same side. At each one the player is
 * stood four tiles out, set running toward it with a real arrow key, and the
 * turn key is pressed at a measured distance from the opening:
 *
 *   A  early   — 1, 2 and 3 tiles before          → turns at the opening
 *   B  exact   — as it reaches the opening         → turns at the opening
 *   C  late    — a fraction of a tile past it      → still takes it
 *   D1 stale   — turn, then straight-ahead again   → does NOT turn
 *   D2 re-ask  — turn, straight, turn again        → turns at the opening
 *   E  blocked — the side with no opening          → keeps going, no clipping
 *   F  far tap — tapped ~4.5 tiles out (beyond the 3-tile buffer) → dropped
 *   G  far held — HELD from ~4.5 tiles out         → turns at the opening
 *
 * Every sample of every scenario also checks the player never stands in or
 * heads into a wall. The Fox is run on every maze it can be given (the 8
 * easy-tier layouts); the other five Frosted Valley animals on one each.
 */
import { createHarness, expect, same, keyFor, dirName } from "./harness.mjs";

const h = createHarness();
/**
 * The game clock runs at this fraction during the approaches (DEV hook), so
 * the lag between reading the player's position and the real key press
 * landing is a small fraction of a tile even on a busy machine. All the rules
 * under test are in tiles, so this only sharpens timing — it can't hide a bug.
 */
const TIME_SCALE = Number(process.env.TIME_SCALE ?? 0.25);

/* ---------------- geometry ---------------- */

function narrowOpenings(rows) {
  const R = rows.length;
  const C = rows[0].length;
  const open = (r, c) => r >= 0 && r < R && c >= 0 && c < C && rows[r][c] !== "#";
  const dirs = [
    { dr: 0, dc: 1 },
    { dr: 0, dc: -1 },
    { dr: 1, dc: 0 },
    { dr: -1, dc: 0 },
  ];
  const perp = (d) => [
    { dr: d.dc, dc: d.dr },
    { dr: -d.dc, dc: -d.dr },
  ];
  const found = [];
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (!open(r, c)) continue;
      for (const d of dirs) {
        const sides = perp(d).filter((p) => open(r + p.dr, c + p.dc));
        if (sides.length !== 1) continue; // exactly one opening at the junction
        const exit = sides[0];
        const blocked = perp(d).find((p) => !same(p, exit));
        // four straight approach tiles behind the junction with no earlier
        // opening on the SAME side as the turn (one there could rightly take
        // it first); openings on the far side are fine — that's a real maze
        let clean = true;
        for (let k = 1; k <= 4 && clean; k++) {
          const rr = r - d.dr * k;
          const cc = c - d.dc * k;
          if (!open(rr, cc)) clean = false;
          else if (open(rr + exit.dr, cc + exit.dc)) clean = false;
        }
        // the exit must be a real corridor (one tile wide: walls either side of it)
        const er = r + exit.dr;
        const ec = c + exit.dc;
        const exitNarrow = !open(er + d.dr, ec + d.dc) && !open(er - d.dr, ec - d.dc);
        // a little room beyond the junction, so "kept going" is observable
        const beyond = open(r + d.dr, c + d.dc);
        // for the blocked-direction test: that side has no opening anywhere
        // from the approach start to 3 tiles beyond, so any move there is illegal
        let blockedClear = true;
        for (let k = -4; k <= 3 && blockedClear; k++) {
          const rr = r + d.dr * k;
          const cc = c + d.dc * k;
          if (open(rr, cc) && open(rr + blocked.dr, cc + blocked.dc)) blockedClear = false;
        }
        let runway = 4;
        while (runway < 6) {
          const rr = r - d.dr * (runway + 1);
          const cc = c - d.dc * (runway + 1);
          if (!open(rr, cc) || open(rr + exit.dr, cc + exit.dc)) break;
          runway++;
        }
        if (clean && exitNarrow && beyond) found.push({ j: { row: r, col: c }, d, exit, blocked, blockedClear, runway });
      }
    }
  }
  return found;
}

/** Spread picks out rather than taking neighbours. */
function pick(list, n) {
  if (list.length <= n) return list;
  const out = [];
  for (let i = 0; i < n; i++) out.push(list[Math.floor((i * list.length) / n)]);
  return out;
}

/** Signed tiles still to go before the junction along the approach (negative = past it). */
const toGo = (s, t) => (t.d.dc !== 0 ? (t.j.col - s.player.pos.col) * t.d.dc : (t.j.row - s.player.pos.row) * t.d.dr);
/** Perpendicular offset from the approach line (0 while still on it). */
const offLine = (s, t) => (t.d.dc !== 0 ? (s.player.pos.row - t.j.row) * t.exit.dr : (s.player.pos.col - t.j.col) * t.exit.dc);

/* ---------------- one approach ---------------- */

/**
 * Stand the player 4 tiles out, run toward the junction, and at each planned
 * distance press the planned key. Watches until the player has either left
 * the approach line (turned) or run 1.6 tiles past the junction.
 */
async function approach(t, plan, opts) {
  // a slow frame can make a key land far later than planned, or a round can
  // fail to get moving at all — neither says anything about the game, so
  // such an attempt is re-run (and reported) instead of passed or failed
  let r;
  const why = [];
  for (let attempt = 1; attempt <= 3; attempt++) {
    r = await approachOnce(t, plan, opts);
    if (!r.mistimed) return why.length ? { ...r, landed: `${r.landed} [retried: ${why.join("; ")}]` } : r;
    why.push(r.mistimedWhy);
  }
  throw new Error(`harness could not time the keys after 3 attempts: ${why.join("; ")}`);
}

async function approachOnce(t, plan, { walls, from = 4 }) {
  const start = { row: t.j.row - t.d.dr * from, col: t.j.col - t.d.dc * from };
  await h.call("calm");
  await h.call("timeScale", TIME_SCALE);
  await h.call("place", start.row, start.col);
  await h.page.waitForTimeout(40);
  await h.press(keyFor(t.d));
  const landed = [];
  const steps = [...plan];
  let turnedAt = null;
  let clipped = null;
  let mistimedWhy = "";
  let moved = false;
  const end = Date.now() + 4000 / TIME_SCALE;
  while (Date.now() < end) {
    const s = await h.st();
    const p = s.player;
    for (const cell of [p.cell, p.next].filter(Boolean)) if (walls(cell.row, cell.col)) clipped = cell;
    const go = toGo(s, t);
    if (go < from - 0.2) moved = true;
    if (steps.length && go <= steps[0].at) {
      const step = steps.shift();
      if (step.hold) await h.page.keyboard.down(keyFor(step.dir));
      else await h.press(keyFor(step.dir));
      const after = await h.st();
      const at = toGo(after, t);
      landed.push(`${dirName(step.dir)}@${at.toFixed(2)}`);
      if (at < step.at - 0.6) mistimedWhy ||= `${dirName(step.dir)} planned @${step.at} landed @${at.toFixed(2)}`;
    }
    if (Math.abs(offLine(s, t)) > 0.3) {
      turnedAt = { along: -go, off: offLine(s, t), dir: p.dir };
      break;
    }
    if (go < -1.6) break;
    await h.page.waitForTimeout(4);
  }
  for (const step of plan) if (step.hold) await h.page.keyboard.up(keyFor(step.dir));
  if (!moved) {
    const s = await h.st();
    mistimedWhy ||= `never started moving (player ${JSON.stringify(s.player.cell)} dir=${dirName(s.player.dir)} want=${dirName(s.player.wantDir)} status=${s.status})`;
  }
  return { turnedAt, clipped, landed: landed.join(" "), mistimed: !!mistimedWhy, mistimedWhy };
}

const describeT = (t) => `(${t.j.row},${t.j.col}) running ${dirName(t.d)}, opening ${dirName(t.exit)}`;

async function testJunction(label, t, walls) {
  const turnHere = (r) => r.turnedAt && Math.abs(r.turnedAt.along) < 0.5 && same(r.turnedAt.dir, t.exit);
  const why = (r) =>
    r.turnedAt ? `turned ${dirName(r.turnedAt.dir)} at ${r.turnedAt.along.toFixed(2)} tiles from the opening` : "ran straight past the opening";

  await h.scenario(`${label} A-early`, `${describeT(t)} — ${dirName(t.exit)} pressed 1, 2, 3 tiles early is taken`, async () => {
    const out = [];
    for (const at of [1, 2, 3]) {
      const r = await approach(t, [{ at, dir: t.exit }], { walls });
      expect(!r.clipped, `clipped into wall at ${JSON.stringify(r.clipped)}`);
      expect(turnHere(r), `pressed ${at} tiles early (key landed ${r.landed}): ${why(r)}`);
      out.push(r.landed);
    }
    return out.join(" | ");
  });

  await h.scenario(`${label} B-exact`, `${describeT(t)} — pressed right at the opening is taken`, async () => {
    const r = await approach(t, [{ at: 0.15, dir: t.exit }], { walls });
    expect(!r.clipped, `clipped into wall at ${JSON.stringify(r.clipped)}`);
    expect(turnHere(r), `key landed ${r.landed}: ${why(r)}`);
    return r.landed;
  });

  await h.scenario(`${label} C-late`, `${describeT(t)} — pressed a fraction past the opening is still taken`, async () => {
    const r = await approach(t, [{ at: -0.05, dir: t.exit }], { walls });
    expect(!r.clipped, `clipped into wall at ${JSON.stringify(r.clipped)}`);
    expect(turnHere(r), `key landed ${r.landed}: ${why(r)}`);
    return r.landed;
  });

  await h.scenario(`${label} D1-stale`, `${describeT(t)} — ${dirName(t.exit)} then ${dirName(t.d)} again: no turn`, async () => {
    const r = await approach(t, [{ at: 3, dir: t.exit }, { at: 2, dir: t.d }], { walls });
    expect(!r.clipped, `clipped into wall at ${JSON.stringify(r.clipped)}`);
    expect(!r.turnedAt, `stale ${dirName(t.exit)} still fired (keys ${r.landed}): ${why(r)}`);
    return r.landed;
  });

  await h.scenario(`${label} D2-reask`, `${describeT(t)} — ${dirName(t.exit)}, ${dirName(t.d)}, ${dirName(t.exit)}: turns`, async () => {
    const r = await approach(t, [{ at: 3, dir: t.exit }, { at: 2.2, dir: t.d }, { at: 1.2, dir: t.exit }], { walls });
    expect(!r.clipped, `clipped into wall at ${JSON.stringify(r.clipped)}`);
    expect(turnHere(r), `keys ${r.landed}: ${why(r)}`);
    return r.landed;
  });

  if (t.runway >= 6) {
    await h.scenario(`${label} F-far-tap`, `${describeT(t)} — tapped ~4.5 tiles out (beyond the 3-tile buffer): dropped, no surprise turn`, async () => {
      const r = await approach(t, [{ at: 4.5, dir: t.exit }], { walls, from: 6 });
      expect(!r.clipped, `clipped into wall at ${JSON.stringify(r.clipped)}`);
      expect(!r.turnedAt, `a tap from ${r.landed} still fired: ${why(r)}`);
      return r.landed;
    });
    await h.scenario(`${label} G-far-held`, `${describeT(t)} — HELD from ~4.5 tiles out: turns at the opening`, async () => {
      const r = await approach(t, [{ at: 4.5, dir: t.exit, hold: true }], { walls, from: 6 });
      expect(!r.clipped, `clipped into wall at ${JSON.stringify(r.clipped)}`);
      expect(turnHere(r), `held from ${r.landed}: ${why(r)}`);
      return r.landed;
    });
  }

  if (t.blockedClear) await h.scenario(`${label} E-blocked`, `${describeT(t)} — ${dirName(t.blocked)} (no opening) keeps it running straight, no clipping`, async () => {
    const r = await approach(t, [{ at: 1, dir: t.blocked }], { walls });
    expect(!r.clipped, `clipped into wall at ${JSON.stringify(r.clipped)}`);
    expect(!r.turnedAt, `moved off the corridor: ${why(r)}`);
    return r.landed;
  });
}

/* ---------------- runs ---------------- */

const FOX_MAZES = ["frozen-garden", "ice-caves", "frozen-crossroads", "snowflake", "frozen-river", "ice-castle", "crystal-cave", "frozen-village"];
const OTHERS = [
  { animalId: "fv_rabbit", resourceId: "carrots", mazeId: "frozen-crossroads", tag: "rabbit" },
  { animalId: "fv_deer", resourceId: "flowerbed", mazeId: "twisted-forest", tag: "deer" },
  { animalId: "fv_squirrel", resourceId: "nest", mazeId: "great-frost-maze", tag: "squirrel" },
  { animalId: "fv_polarbear", resourceId: "crystal", mazeId: "ice-caves", tag: "polarbear" },
  { animalId: "fv_penguin", resourceId: "igloo", mazeId: "frozen-village", tag: "penguin" },
];
const PER_MAZE = Number(process.env.PER_MAZE ?? 2);

await h.boot({ animalIndex: 1 }); // the Fox's chapter: Rabbit already rescued

async function runMaze({ animalId, resourceId, mazeId, tag }) {
  await h.enterMaze({ animalId, resourceId, mazeId });
  await h.waitStarted();
  const { rows } = await h.call("layout");
  const walls = (r, c) => r < 0 || r >= rows.length || c < 0 || c >= rows[0].length || rows[r][c] === "#";
  const spots = pick(narrowOpenings(rows), PER_MAZE);
  if (!spots.length) console.log(`   (no narrow openings found in ${mazeId})`);
  for (const t of spots) await testJunction(`${tag}/${mazeId}`, t, walls);
}

for (const mazeId of FOX_MAZES) await runMaze({ animalId: "fv_fox", resourceId: "ice", mazeId, tag: "fox" });

// a narrow turn with an awake enemy on the player's tail: turning works as normal
await h.scenario("fox enemy-near", "narrow turn with an enemy chasing close behind", async () => {
  await h.enterMaze({ animalId: "fv_fox", resourceId: "ice", mazeId: "frozen-garden" });
  await h.waitStarted();
  const { rows } = await h.call("layout");
  const walls = (r, c) => rows[r]?.[c] !== "." && rows[r]?.[c] !== "S";
  const t = narrowOpenings(rows)[0];
  await h.call("calm");
  await h.call("timeScale", TIME_SCALE);
  const start = { row: t.j.row - t.d.dr * 4, col: t.j.col - t.d.dc * 4 };
  await h.call("place", start.row, start.col);
  await h.call("chaseFrom", start.row - t.d.dr, start.col - t.d.dc); // one tile behind, awake, harmless
  await h.press(keyFor(t.d));
  await h.watch((s) => toGo(s, t) <= 2, 2000 / TIME_SCALE);
  await h.press(keyFor(t.exit));
  const turned = await h.watch((s) => Math.abs(offLine(s, t)) > 0.3 || toGo(s, t) < -1.6, 3000 / TIME_SCALE);
  expect(turned && Math.abs(offLine(turned, t)) > 0.3, "did not take the opening with an enemy behind");
  expect(!walls(turned.player.cell.row, turned.player.cell.col), "clipped");
  await h.shot("fox_enemy_near");
});

for (const o of OTHERS) await runMaze(o);

await h.finish();
