/**
 * Shared Playwright harness for the Frozen Pac-Man (FrostedMaze) e2e suites.
 * Boots the real game in Chromium, enters Frosted Valley through the Menu's
 * ❄ button like a player, launches maze rounds, and reads state through the
 * DEV-only `window.__dgMaze` hooks. All steering in the suites is done with
 * real keyboard events — the hooks are only used to observe, to pin the
 * layout, to put enemies to sleep and to stand the player on a start tile.
 */
import { chromium } from "playwright";
import path from "node:path";

export const W = 1280;
export const H = 800;
export const RIGHT = { dr: 0, dc: 1 };
export const LEFT = { dr: 0, dc: -1 };
export const UP = { dr: -1, dc: 0 };
export const DOWN = { dr: 1, dc: 0 };
export const KEY = { ArrowRight: RIGHT, ArrowLeft: LEFT, ArrowUp: UP, ArrowDown: DOWN };
export const keyFor = (d) => Object.keys(KEY).find((k) => same(KEY[k], d));
export const same = (a, b) => !!a && !!b && a.dr === b.dr && a.dc === b.dc;
export const dirName = (d) => (!d ? "none" : (keyFor(d) ?? JSON.stringify(d)).replace("Arrow", ""));

export function createHarness({ url = process.env.URL ?? "http://localhost:5199/", shots = process.env.SHOTS } = {}) {
  let browser;
  let page;
  const results = [];
  const consoleErrors = [];

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
  const press = (key) => page.keyboard.press(key);

  async function shot(label) {
    if (!shots) return;
    await page.screenshot({ path: path.join(shots, `e2e_${label}.png`) });
  }

  /** Poll the maze state until `pred(state)` holds; returns that state (or null on timeout). */
  async function watch(pred, ms = 1500) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const s = await st();
      if (s && pred(s)) return s;
      await page.waitForTimeout(8);
    }
    return null;
  }

  function seed({ tutorialSeen = true, animalIndex = 0 } = {}) {
    const order = ["fv_rabbit", "fv_fox", "fv_deer", "fv_squirrel", "fv_polarbear", "fv_penguin"];
    const animals = {};
    order.forEach((id, i) => {
      if (i < animalIndex) animals[id] = { resources: {}, rescued: true, rewardClaimed: true, letterSeen: true, puzzleSolved: true };
      if (i === animalIndex) animals[id] = { resources: {}, rescued: false, rewardClaimed: false, letterSeen: true };
    });
    return {
      saveVersion: 3, coins: 1000, currentTaskIndex: 0, introSeen: true, openingGardenTourSeen: true,
      lettersSeen: {}, objects: {}, requests: {}, minigame: {},
      frostedValley: { currentAnimalIndex: animalIndex, mazeTutorialSeen: tutorialSeen, mazeDeck: [], storyNotesSeen: { all: true }, animals },
      frostedShop: { placements: [], petOwned: {}, equipped: {} },
      stats: { puzzlesSolved: 0, startedAt: Date.now(), lastPlayed: Date.now() },
    };
  }

  async function boot(opts = {}) {
    await browser?.close();
    browser = await chromium.launch({ headless: true, args: ["--use-angle=d3d11", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
    page = await browser.newPage({ viewport: { width: W, height: H } });
    page.on("pageerror", (e) => {
      consoleErrors.push(e.message);
      console.log("   [pageerror]", e.message);
    });
    page.on("console", (m) => {
      if (m.type() === "error") consoleErrors.push(m.text());
    });
    await page.addInitScript((s) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("dreamgarden.save.v1", JSON.stringify(s));
    }, seed(opts));
    await page.goto(url);
    if (!(await until(() => window.__dgGame?.scene.isActive("Menu"), 90000))) throw new Error("menu never loaded");
    await page.waitForTimeout(400);
    await page.mouse.click(30, 32); // the ❄ Frosted Valley button, like a player
    if (!(await until(() => !!window.__dgFrostedValley, 60000))) throw new Error("valley never loaded");
    await page.waitForTimeout(1500);
  }

  const roundNow = () => page.evaluate(() => (window.__dgGame.scene.isActive("FrostedMaze") && window.__dgMaze ? window.__dgMaze.state().round : -1));
  /** Wait until a NEW round (not the one being replaced) exists. */
  const waitNewRound = (prev) =>
    until((p) => window.__dgGame.scene.isActive("FrostedMaze") && !!window.__dgMaze && window.__dgMaze.state().round !== p, 10000, prev);
  const waitStarted = () => until(() => window.__dgMaze?.state().started === true && window.__dgMaze.state().status === "playing", 8000);

  /** Enter a maze round through the valley's launch path; `mazeId` pins the layout via the retry path. */
  async function enterMaze({ animalId = "fv_rabbit", resourceId = "carrots", mazeId } = {}) {
    let prev = await roundNow();
    await page.evaluate(([a, r]) => window.__dgFrostedValley.playMaze(a, r), [animalId, resourceId]);
    await waitNewRound(prev);
    if (mazeId) {
      prev = await roundNow();
      await page.evaluate(
        ([a, r, m]) => window.__dgGame.scene.getScene("FrostedMaze").scene.restart({ animalId: a, resourceId: r, retry: { mazeId: m, bankedCoinKeys: [] } }),
        [animalId, resourceId, mazeId],
      );
      await waitNewRound(prev);
    }
  }

  async function leaveMaze() {
    await page.evaluate(() => {
      const m = window.__dgGame.scene.getScene("FrostedMaze");
      m.scene.stop();
      m.scene.resume("FrostedValley");
    });
    await page.waitForTimeout(200);
  }

  async function scenario(id, title, fn, only = process.env.ONLY) {
    if (only && !id.includes(only)) return;
    try {
      const detail = await fn();
      results.push({ id, title, ok: true, detail });
      console.log(`PASS  ${id} — ${title}${detail ? `  (${detail})` : ""}`);
      if (process.env.SHOT_ALL) await shot(`PASS_${id}`).catch(() => {});
    } catch (e) {
      results.push({ id, title, ok: false, detail: e.message });
      console.log(`FAIL  ${id} — ${title}\n      ${e.message}`);
      await shot(`FAIL_${id}`).catch(() => {});
    }
  }

  async function finish() {
    await browser?.close();
    const failed = results.filter((r) => !r.ok);
    if (consoleErrors.length) console.log(`\nbrowser console errors (${consoleErrors.length}):\n  ${[...new Set(consoleErrors)].slice(0, 8).join("\n  ")}`);
    console.log(`\n${results.length - failed.length}/${results.length} passed`);
    process.exit(failed.length ? 1 : 0);
  }

  return {
    get page() {
      return page;
    },
    results,
    consoleErrors,
    until,
    st,
    call,
    press,
    shot,
    watch,
    boot,
    enterMaze,
    leaveMaze,
    waitNewRound,
    waitStarted,
    roundNow,
    scenario,
    finish,
  };
}

export const expect = (cond, msg) => {
  if (!cond) throw new Error(msg);
};
