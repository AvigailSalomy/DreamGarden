/**
 * Frozen Pac-Man (FrostedMaze) — real-browser input & flow tests.
 *
 *   npm run e2e:server   # terminal 1: isolated DEV server on :5199 (no hot reload)
 *   npm run test:e2e     # terminal 2
 *
 * Plays the actual game in Chromium with real keyboard events (no calls into
 * the movement code) and checks where the player really goes. It needs a
 * DEV server (it reads state through the DEV-only `window.__dgMaze` hooks);
 * the isolated one on :5199 is used so another tab/session saving files can't
 * hot-reload the page mid-scenario. `URL=...` points it elsewhere.
 *
 *   node e2e/frostedMazeInput.e2e.mjs            # all scenarios
 *   ONLY=late-turn node e2e/frostedMazeInput.e2e.mjs
 *   SHOTS=<dir> ...                               # also save screenshots
 *
 * Input tests pin the maze to "Frozen Garden" (landscape, so screen
 * directions == layout directions) and put the enemies to sleep, so every
 * run is deterministic. Its row 3 is one long corridor (cols 1-17) with
 * openings UP at cols 1,4,8,10,14,17 and DOWN at cols 1,4,6,12,14,17.
 */
import { chromium } from "playwright";
import path from "node:path";

const URL = process.env.URL ?? "http://localhost:5199/"; // the isolated e2e server (npm run e2e:server)
const ONLY = process.env.ONLY;
const SHOTS = process.env.SHOTS;
const W = 1280;
const H = 800;

const RIGHT = { dr: 0, dc: 1 };
const LEFT = { dr: 0, dc: -1 };
const UP = { dr: -1, dc: 0 };
const DOWN = { dr: 1, dc: 0 };
const KEY = { ArrowRight: RIGHT, ArrowLeft: LEFT, ArrowUp: UP, ArrowDown: DOWN };
const same = (a, b) => !!a && !!b && a.dr === b.dr && a.dc === b.dc;
const name = (d) => (!d ? "none" : Object.keys(KEY).find((k) => same(KEY[k], d)) ?? JSON.stringify(d));

const results = [];
let page;
let browser;

async function until(fn, ms = 20000, arg) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await page.evaluate(fn, arg).catch(() => false)) return true;
    await page.waitForTimeout(30);
  }
  return false;
}
const st = () => page.evaluate(() => window.__dgMaze?.state());
const call = (fn, ...args) => page.evaluate(([f, a]) => window.__dgMaze[f](...a), [fn, args]);
async function shot(label) {
  if (!SHOTS) return;
  await page.screenshot({ path: path.join(SHOTS, `e2e_${label}.png`) });
}

function seed({ tutorialSeen }) {
  return {
    saveVersion: 3, coins: 1000, currentTaskIndex: 0, introSeen: true, openingGardenTourSeen: true,
    lettersSeen: {}, objects: {}, requests: {}, minigame: {},
    frostedValley: { currentAnimalIndex: 0, mazeTutorialSeen: tutorialSeen, mazeDeck: [], storyNotesSeen: { all: true },
      animals: { fv_rabbit: { resources: {}, rescued: false, rewardClaimed: false, letterSeen: true } } },
    frostedShop: { placements: [], petOwned: {}, equipped: {} },
    stats: { puzzlesSolved: 0, startedAt: Date.now(), lastPlayed: Date.now() },
  };
}

async function boot({ tutorialSeen = true } = {}) {
  await browser?.close();
  browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
  page = await browser.newPage({ viewport: { width: W, height: H } });
  page.on("pageerror", (e) => console.log("   [pageerror]", e.message));
  await page.addInitScript((s) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("dreamgarden.save.v1", JSON.stringify(s));
  }, seed({ tutorialSeen }));
  await page.goto(URL);
  if (!(await until(() => window.__dgGame?.scene.isActive("Menu"), 90000))) throw new Error("menu never loaded");
  await page.waitForTimeout(400);
  await page.mouse.click(30, 32); // the ❄ Frosted Valley button, like a player
  if (!(await until(() => !!window.__dgFrostedValley, 60000))) throw new Error("valley never loaded");
  await page.waitForTimeout(1500);
}

/** Enter the maze through the valley's launch path; `mazeId` pins the layout via the retry path. */
const roundNow = () => page.evaluate(() => (window.__dgGame.scene.isActive("FrostedMaze") && window.__dgMaze ? window.__dgMaze.state().round : -1));
/** Wait until a NEW round (not the one being replaced) exists. */
const waitNewRound = (prev) => until((p) => window.__dgGame.scene.isActive("FrostedMaze") && !!window.__dgMaze && window.__dgMaze.state().round !== p, 10000, prev);

async function enterMaze({ mazeId, resourceId = "carrots" } = {}) {
  let prev = await roundNow();
  await page.evaluate((r) => window.__dgFrostedValley.playMaze("fv_rabbit", r), resourceId);
  await waitNewRound(prev);
  if (mazeId) {
    prev = await roundNow();
    await page.evaluate(
      ([m, r]) => window.__dgGame.scene.getScene("FrostedMaze").scene.restart({ animalId: "fv_rabbit", resourceId: r, retry: { mazeId: m, bankedCoinKeys: [] } }),
      [mazeId, resourceId],
    );
    await waitNewRound(prev);
  }
}

const waitStarted = () => until(() => window.__dgMaze?.state().started === true && window.__dgMaze.state().status === "playing", 8000);

/** A fresh, calm, pinned board: Frozen Garden, enemies asleep, player placed. */
async function calmBoard(row, col) {
  await enterMaze({ mazeId: "frozen-garden" });
  await waitStarted();
  await call("calm");
  await call("place", row, col);
  await page.waitForTimeout(60);
}

async function press(key) {
  await page.keyboard.press(key);
}

/** Tap a key and watch the player until `pred(state)` holds (or time out). Returns the matching state or null. */
async function watch(pred, ms = 1500) {
  const end = Date.now() + ms;
  let s;
  while (Date.now() < end) {
    s = await st();
    if (pred(s)) return s;
    await page.waitForTimeout(16);
  }
  return null;
}

async function scenario(id, title, fn) {
  if (ONLY && !id.includes(ONLY)) return;
  try {
    const detail = await fn();
    results.push({ id, title, ok: true, detail });
    console.log(`PASS  ${id} — ${title}${detail ? `  (${detail})` : ""}`);
  } catch (e) {
    results.push({ id, title, ok: false, detail: e.message });
    console.log(`FAIL  ${id} — ${title}\n      ${e.message}`);
    await shot(`FAIL_${id}`);
  }
}
const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

/* ======================================================================= */

await boot();

await scenario("reverse-h", "Right → Left and Left → Right reverse immediately mid-corridor", async () => {
  await calmBoard(3, 6);
  await press("ArrowRight");
  const moving = await watch((s) => s.player.pos.col > 6.6);
  expect(moving, "never started moving right");
  await press("ArrowLeft");
  const t0 = Date.now();
  const rev = await watch((s) => same(s.player.dir, LEFT), 400);
  expect(rev, "Left was ignored while moving right");
  const back = await watch((s) => s.player.pos.col < moving.player.pos.col - 0.5, 800);
  expect(back, "did not actually travel left after reversing");
  await press("ArrowRight");
  const rev2 = await watch((s) => same(s.player.dir, RIGHT), 400);
  expect(rev2, "Right was ignored while moving left");
  return `reversed in ~${Date.now() - t0}ms`;
});

await scenario("reverse-v", "Up → Down and Down → Up reverse immediately mid-corridor", async () => {
  await calmBoard(2, 4); // column 4 is open rows 1-7
  await press("ArrowDown");
  const moving = await watch((s) => s.player.pos.row > 2.5 && same(s.player.dir, DOWN));
  expect(moving, "never started moving down");
  await press("ArrowUp");
  expect(await watch((s) => same(s.player.dir, UP), 400), "Up was ignored while moving down");
  await press("ArrowDown");
  expect(await watch((s) => same(s.player.dir, DOWN), 400), "Down was ignored while moving up");
});

await scenario("pre-turn", "Up pressed just BEFORE a junction turns up at that junction", async () => {
  await calmBoard(3, 6);
  await press("ArrowLeft"); // heading for the col-4 junction (open up)
  await watch((s) => s.player.pos.col < 4.6, 1500);
  await press("ArrowUp");
  const turned = await watch((s) => s.player.pos.row < 2.6, 1500);
  expect(turned, "never turned up");
  expect(Math.round(turned.player.pos.col) === 4, `turned at col ${turned.player.pos.col.toFixed(2)}, expected col 4`);
});

await scenario("late-turn", "Up pressed JUST AFTER passing a junction still takes that junction (no running on)", async () => {
  await calmBoard(3, 6);
  await press("ArrowLeft");
  // wait until the player is a hair past the col-4 junction centre (heading to col 3)
  const past = await watch((s) => s.player.pos.col < 3.97 && s.player.pos.col > 3.5, 2000);
  expect(past, "never passed the junction");
  await press("ArrowUp");
  const landed = await st(); // where the player was when the key actually took effect
  const pastBy = (4 - landed.player.pos.col).toFixed(2);
  const turned = await watch((s) => s.player.pos.row < 2.6, 1600);
  expect(turned, `Up was effectively ignored — the player never went up (key landed ${pastBy} tiles past the junction)`);
  const col = turned.player.pos.col;
  expect(Math.round(col) === 4, `ran on and turned at col ${col.toFixed(2)} instead of the junction just passed (col 4)`);
  return `key landed ~${pastBy} tiles past the junction`;
});

// buffered-turn distance (early / far / held) is covered geometrically, on
// every maze, by e2e/frostedMazeTurns.e2e.mjs

await scenario("wall-then-valid", "pressing into a wall, then a valid direction, moves the valid way", async () => {
  await calmBoard(1, 1); // top-left corner: only Right and Down are open
  await press("ArrowUp");
  await press("ArrowLeft");
  await page.waitForTimeout(150);
  let s = await st();
  expect(!s.player.next, "moved into a wall?");
  await press("ArrowRight");
  expect(await watch((x) => x.player.pos.col > 1.4, 800), "Right ignored after pressing into the wall");
  // run into the right-hand wall of row 1's left half (col 8), then go Down at once
  await watch((x) => !x.player.next && x.player.cell.col === 8, 3000);
  await press("ArrowRight"); // blocked
  await press("ArrowDown");
  expect(await watch((x) => x.player.pos.row > 1.4, 800), "Down ignored at the wall");
});

await scenario("eight-transitions", "every 90° / 180° transition from a standing start at a 4-way junction", async () => {
  const pairs = [
    ["ArrowRight", "ArrowLeft"], ["ArrowLeft", "ArrowRight"], ["ArrowUp", "ArrowDown"], ["ArrowDown", "ArrowUp"],
    ["ArrowRight", "ArrowUp"], ["ArrowUp", "ArrowLeft"], ["ArrowLeft", "ArrowDown"], ["ArrowDown", "ArrowRight"],
  ];
  await calmBoard(3, 4);
  const bad = [];
  for (const [a, b] of pairs) {
    await call("place", 3, 4);
    await press(a);
    await watch((s) => same(s.player.dir, KEY[a]) && !!s.player.next, 600); // just set off
    await press(b);
    // b must take effect: a reversal instantly, a 90° turn by the time it's back at / reaches the junction
    const ok = await watch((s) => same(s.player.dir, KEY[b]), 700);
    if (!ok) bad.push(`${name(KEY[a])}→${name(KEY[b])}`);
  }
  expect(!bad.length, `ignored: ${bad.join(", ")}`);
});

await scenario("rapid", "rapid key mashing never leaves the player stuck or ignoring the last key", async () => {
  await calmBoard(3, 4);
  const seq = ["ArrowRight", "ArrowLeft", "ArrowUp", "ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown", "ArrowRight"];
  for (let round = 0; round < 3; round++) {
    await call("place", 3, 4);
    for (const k of seq) {
      await press(k);
      await page.waitForTimeout(40 + round * 40);
    }
    // the last key (Right) must win: moving right, or right is queued at a wall
    const s = await watch((x) => same(x.player.dir, RIGHT) && !!x.player.next, 900);
    expect(s, `round ${round}: last key Right lost (dir=${name((await st()).player.dir)})`);
  }
});

await scenario("countdown-press", "a key held during READY? moves the player the moment GO appears", async () => {
  await enterMaze({ mazeId: "frozen-garden" });
  await page.keyboard.down("ArrowLeft"); // start (11,9): left is open
  await waitStarted();
  const moved = await watch((s) => s.player.pos.col < 8.7, 1200);
  await page.keyboard.up("ArrowLeft");
  expect(moved, "the held key from the countdown was dropped — player stood still after GO");
});

await scenario("focus", "clicking the board / HUD never steals keyboard control", async () => {
  await calmBoard(3, 6);
  await page.mouse.click(W / 2, H / 2); // the maze board
  await press("ArrowRight");
  expect(await watch((s) => same(s.player.dir, RIGHT), 500), "keys dead after clicking the board");
  await page.mouse.click(W - 90, 50); // the coin pill
  await press("ArrowLeft");
  expect(await watch((s) => same(s.player.dir, LEFT), 500), "keys dead after clicking the HUD");
});

await scenario("overlay-gating", "arrows do nothing while the Leave? card is open, and work again after", async () => {
  await calmBoard(3, 6);
  await press("Escape");
  await until(() => window.__dgMaze.state().overlay === "confirm", 2000);
  const before = (await st()).player.pos;
  await press("ArrowRight");
  await page.waitForTimeout(400);
  const during = (await st()).player.pos;
  expect(Math.abs(during.col - before.col) < 0.01, "player moved while the pause card was open");
  await press("Escape");
  await press("ArrowRight");
  expect(await watch((s) => s.player.pos.col > before.col + 0.5, 1000), "keys dead after closing the card");
});

await scenario("death-controls", "lose a life (real contact) → controls work right after respawn", async () => {
  await calmBoard(3, 6);
  await call("die");
  expect(await until(() => window.__dgMaze.state().status === "dying", 2000), "no death");
  const s1 = await st();
  expect(s1.lives === 2, `lives ${s1.lives} (expected 2)`);
  await until(() => window.__dgMaze.state().status === "playing", 4000);
  await call("calm");
  await press("ArrowRight");
  expect(await watch((s) => s.player.pos.col > 9.4, 1200), "controls dead after respawn");
});

await scenario("gameover-retry", "Game Over after the last life → TRY AGAIN → fresh round, keys work, no duplicate listeners", async () => {
  await enterMaze({ mazeId: "frozen-garden" });
  await waitStarted();
  const listenersBefore = (await st()).keydownListeners;
  for (let i = 0; i < 6; i++) {
    const s = await st();
    if (s.overlay === "gameover") break;
    if (s.status === "playing") await call("die");
    await page.waitForTimeout(2300);
  }
  const go = await st();
  expect(go.overlay === "gameover" && go.lives === 0, `no Game Over (overlay=${go.overlay}, lives=${go.lives})`);
  const walletAtGameOver = go.wallet;
  await press("ArrowLeft"); // must do nothing behind the card
  await shot("gameover");
  const fit = Math.min(1, (W - 24) / 440, (H - 24) / 330);
  const tx = W / 2 - 95 * fit;
  const ty = H / 2 + 110 * fit;
  await page.mouse.move(tx, ty);
  const hits = await page.evaluate(() =>
    window.__dgGame.scene.getScenes(true).reverse().map((sc) => `${sc.scene.key}[input ${sc.input.enabled ? "on" : "OFF"}]: ` +
      sc.input.hitTestPointer(sc.input.activePointer).map((h) => h.text ?? (h.list ? h.list.map((c) => c.text ?? c.type).join("+") : h.type)).join(" | ")),
  );
  const roundBefore = go.round;
  await page.mouse.click(tx, ty); // TRY AGAIN
  if (!(await waitNewRound(roundBefore))) throw new Error(`TRY AGAIN click did nothing. Under the pointer: ${hits.join(" ;; ")}`);
  await waitStarted();
  const fresh = await st();
  expect(fresh.lives === 3 && fresh.collected === 0 && fresh.status === "playing", `not fresh: ${JSON.stringify({ l: fresh.lives, c: fresh.collected, s: fresh.status })}`);
  expect(fresh.keydownListeners === listenersBefore, `keydown listeners ${listenersBefore} → ${fresh.keydownListeners} after retry`);
  expect(!fresh.player.dir && !fresh.player.wantDir, `stale input leaked into the new round: dir=${name(fresh.player.dir)} want=${name(fresh.player.wantDir)}`);
  expect(fresh.wallet === walletAtGameOver, "wallet changed on retry");
  await call("calm");
  await press("ArrowRight");
  expect(await watch((s) => s.player.pos.col > 9.4, 1200), "controls dead in the new round");
});

await scenario("victory-flow", "win → only this requirement restored, no input after the end, reward once", async () => {
  await enterMaze({ mazeId: "frozen-garden" });
  await waitStarted();
  await call("calm");
  const wallet0 = (await st()).wallet;
  for (let i = 0; i < 12; i++) {
    const s = await st();
    if (s.status !== "playing") break;
    await call("collectNext");
    await page.waitForTimeout(250);
  }
  const won = await st();
  expect(won.status === "won", `status ${won.status}`);
  const pos = won.player.pos;
  await press("ArrowRight");
  await press("ArrowUp");
  await page.waitForTimeout(300);
  const after = await st();
  expect(after && Math.abs(after.player.pos.col - pos.col) < 0.01 && Math.abs(after.player.pos.row - pos.row) < 0.01, "player moved after winning");
  await shot("victory");
  await until(() => !window.__dgGame.scene.isActive("FrostedMaze"), 8000);
  await page.waitForTimeout(8000); // the restoration cinematic
  await shot("restored");
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem("dreamgarden.save.v1")));
  const res = save.frostedValley.animals.fv_rabbit.resources;
  expect(res.carrots?.restored === true, "carrots not restored");
  expect(!res.well?.restored && !res.chime?.restored, "a different requirement got restored too");
  return `wallet ${wallet0} → ${save.coins}`;
});

await scenario("persistence", "reload keeps the restoration + tutorial flag; wallet unchanged", async () => {
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("dreamgarden.save.v1")));
  await page.reload();
  await until(() => window.__dgGame?.scene.isActive("Menu"), 90000);
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("dreamgarden.save.v1")));
  expect(after.frostedValley.animals.fv_rabbit.resources.carrots?.restored === true, "restoration lost on reload");
  expect(after.coins === before.coins, `coins ${before.coins} → ${after.coins}`);
  expect(after.frostedValley.mazeTutorialSeen === before.frostedValley.mazeTutorialSeen, "tutorial flag changed");
});

await scenario("maze-variety", "consecutive launches get structurally different mazes, never the same twice in a row", async () => {
  await boot();
  const seen = [];
  for (let i = 0; i < 6; i++) {
    await enterMaze({ resourceId: "well" });
    const s = await st();
    const rows = (await call("layout")).rows.join("");
    seen.push({ id: s.maze, rows });
    await page.evaluate(() => {
      const m = window.__dgGame.scene.getScene("FrostedMaze");
      m.scene.stop();
      m.scene.resume("FrostedValley");
    });
    await page.waitForTimeout(300);
  }
  for (let i = 1; i < seen.length; i++) expect(seen[i].id !== seen[i - 1].id, `same maze twice in a row: ${seen[i].id}`);
  expect(new Set(seen.map((x) => x.rows)).size === seen.length, "two launches had identical wall layouts");
  return seen.map((x) => x.id).join(" → ");
});

await scenario("tutorial", "first run shows the tutorial, arrows are inert behind it, GOT IT hands control over, never shown again", async () => {
  await boot({ tutorialSeen: false });
  await enterMaze({ mazeId: "frozen-garden" });
  await until(() => window.__dgMaze.state().overlay === "tutorial", 3000);
  const s0 = await st();
  expect(s0.overlay === "tutorial", "no tutorial on the first run");
  await press("ArrowLeft");
  await page.waitForTimeout(300);
  expect(!(await st()).player.next, "the player moved behind the tutorial");
  await shot("tutorial");
  const fit = Math.min(1, (W - 24) / 520, (H - 24) / 540);
  await page.mouse.click(W / 2, H / 2 + 222 * fit); // GOT IT
  await waitStarted();
  await press("ArrowLeft");
  expect(await watch((s) => s.player.pos.col < 8.6, 1200), "keys dead after GOT IT");
  await page.evaluate(() => {
    const m = window.__dgGame.scene.getScene("FrostedMaze");
    m.scene.stop();
    m.scene.resume("FrostedValley");
  });
  await enterMaze({ mazeId: "frozen-garden" });
  await page.waitForTimeout(500);
  expect((await st()).overlay !== "tutorial", "tutorial shown a second time");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("dreamgarden.save.v1")).frostedValley.mazeTutorialSeen);
  expect(saved === true, "tutorial flag not saved");
});

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
