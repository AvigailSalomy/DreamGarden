import { beforeEach, describe, expect, it } from "vitest";
import { Emitter } from "../src/core/EventBus";
import type { GameEvents } from "../src/core/events";
import { SaveService } from "../src/core/SaveService";
import { EconomyService } from "../src/core/EconomyService";
import { HINT_COST, PuzzleHintSession, chooseHintPiece } from "../src/puzzle/puzzleHints";
import type { HintCandidate } from "../src/puzzle/puzzleHints";
import { mulberry32 } from "../src/core/rng";

const KEY = "dreamgarden.save.hinttest";

function wallet(coins: number) {
  const save = new SaveService(KEY);
  save.reset();
  save.state.coins = coins;
  const economy = new EconomyService(save, new Emitter<GameEvents>());
  return { save, economy };
}

beforeEach(() => localStorage.clear());

describe("PuzzleHintSession — 2 free piece hints, then 20 coins each", () => {
  it("first two piece hints are free, the third costs exactly 20 coins", () => {
    const { economy } = wallet(100);
    const s = new PuzzleHintSession(economy);
    expect(s.priceOf("piece")).toBe(0);
    expect(s.use("piece")).toEqual({ ok: true, paid: 0 });
    expect(s.freeLeft("piece")).toBe(1);
    expect(s.use("piece")).toEqual({ ok: true, paid: 0 });
    expect(economy.coins).toBe(100);
    expect(s.priceOf("piece")).toBe(HINT_COST);
    expect(s.use("piece")).toEqual({ ok: true, paid: 20 });
    expect(economy.coins).toBe(80);
    expect(s.use("piece")).toEqual({ ok: true, paid: 20 });
    expect(economy.coins).toBe(60);
  });

  it("a paid hint with fewer than 20 coins is refused and never goes negative", () => {
    const { economy } = wallet(15);
    const s = new PuzzleHintSession(economy);
    s.use("piece");
    s.use("piece");
    expect(s.canUse("piece")).toBe(false);
    expect(s.use("piece")).toEqual({ ok: false, paid: 0 });
    expect(economy.coins).toBe(15);
    expect(s.usedCount("piece")).toBe(2);
  });

  it("the image preview has its own counter: first free, then 20 coins", () => {
    const { economy } = wallet(40);
    const s = new PuzzleHintSession(economy);
    expect(s.use("image")).toEqual({ ok: true, paid: 0 });
    expect(s.freeLeft("piece")).toBe(2); // untouched
    expect(s.priceOf("image")).toBe(20);
    expect(s.use("image").paid).toBe(20);
    expect(economy.coins).toBe(20);
  });

  it("hint usage is session-only: it never writes animal progression", () => {
    const { economy, save } = wallet(100);
    const before = JSON.stringify(save.state.frostedValley);
    const s = new PuzzleHintSession(economy);
    s.use("piece");
    s.use("image");
    expect(JSON.stringify(save.state.frostedValley)).toBe(before);
    expect(new PuzzleHintSession(economy).freeLeft("piece")).toBe(2); // a new attempt starts fresh
  });
});

describe("chooseHintPiece", () => {
  const c = (index: number, over: Partial<HintCandidate> = {}): HintCandidate => ({
    index,
    placed: false,
    dragging: false,
    hinted: false,
    onScreen: true,
    border: false,
    placedNeighbours: 0,
    ...over,
  });

  it("never picks a placed or held piece", () => {
    const pick = chooseHintPiece([c(0, { placed: true }), c(1, { dragging: true }), c(2)], mulberry32(1));
    expect(pick).toBe(2);
    expect(chooseHintPiece([c(0, { placed: true })], mulberry32(1))).toBeNull();
  });

  it("avoids repeating an already-hinted piece while others remain", () => {
    for (let seed = 0; seed < 20; seed++) {
      expect(chooseHintPiece([c(0, { hinted: true, border: true, placedNeighbours: 3 }), c(1)], mulberry32(seed))).toBe(1);
    }
    expect(chooseHintPiece([c(0, { hinted: true })], mulberry32(1))).toBe(0); // only one left: fine to repeat
  });

  it("prefers visible pieces with easy-to-read destinations", () => {
    expect(chooseHintPiece([c(0, { onScreen: false }), c(1)], mulberry32(3))).toBe(1);
    expect(chooseHintPiece([c(0), c(1, { placedNeighbours: 2 })], mulberry32(3))).toBe(1);
  });
});
