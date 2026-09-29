import type Phaser from "phaser";
import { Sfx } from "./Sfx";

/**
 * Background music — one small controller on top of Sfx's AudioContext (no
 * second context, no audio files). Three short original loops are rendered
 * once, on first use, into AudioBuffers by an OfflineAudioContext, then looped
 * through a single "music bus" that is independent of Sfx's own master gain, so
 * music and effects always play together and are muted independently.
 *
 *   world   — Frosted Valley exploration (cozy, magical, wintery)
 *   mission — Garden Maze / Pac-Man (playful, brisk)
 *   calm    — Shop + Puzzle (soft music-box)
 *
 * Which track plays is derived from the active scenes by `startMusicDirector`
 * — scenes never call the music controller themselves.
 */
export type TrackId = "world" | "mission" | "calm";

const PREF_KEY = "dreamgarden.music.v1";
const FADE_IN = 1.4;
const FADE_OUT = 0.9;
const VOLUME = 0.42;

function readEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

/* ------------------------------------------------------------------ */
/* Loop synthesis (rendered once per track)                            */
/* ------------------------------------------------------------------ */

const SR = 32000;
const TAIL = 2.5; // seconds of echo tail, folded back onto the loop start so the seam is inaudible
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A chord is a pitch class (0 = C) and whether it is minor. */
interface Chord {
  pc: number;
  minor?: boolean;
}
const C: Chord = { pc: 0 };
const G: Chord = { pc: 7 };
const F: Chord = { pc: 5 };
const Am: Chord = { pc: 9, minor: true };
const Dm: Chord = { pc: 2, minor: true };
const Bb: Chord = { pc: 10 };

/** Triad tones around middle C, `oct` octaves up (0 = around C4). */
function triad(ch: Chord, oct = 0): number[] {
  const base = 60 + (ch.pc > 6 ? ch.pc - 12 : ch.pc) + oct * 12;
  return [base, base + (ch.minor ? 3 : 4), base + 7];
}
const bassOf = (ch: Chord) => 36 + ch.pc;

interface Kit {
  ctx: OfflineAudioContext;
  dry: AudioNode;
  wet: AudioNode;
  noise: AudioBuffer;
}

interface ToneOpts {
  type?: OscillatorType;
  vol: number;
  attack?: number;
  release?: number;
  bell?: boolean;
  wet?: number;
}

function tone(k: Kit, midi: number, t: number, dur: number, o: ToneOpts): void {
  const attack = o.attack ?? 0.006;
  const release = o.release ?? 0.05;
  const partials: Array<[number, number]> = [[1, 1]];
  if (o.bell) partials.push([2, 0.28], [4, 0.09]);
  const env = k.ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(o.vol, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack + 0.02, dur) + release);
  for (const [mul, amp] of partials) {
    const osc = k.ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.value = mtof(midi) * mul;
    if (amp === 1) osc.connect(env);
    else {
      const g = k.ctx.createGain();
      g.gain.value = amp;
      osc.connect(g).connect(env);
    }
    osc.start(t);
    osc.stop(t + Math.max(attack + 0.02, dur) + release + 0.05);
  }
  env.connect(k.dry);
  if (o.wet) {
    const send = k.ctx.createGain();
    send.gain.value = o.wet;
    env.connect(send).connect(k.wet);
  }
}

function hat(k: Kit, t: number, vol: number): void {
  const src = k.ctx.createBufferSource();
  src.buffer = k.noise;
  const hp = k.ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7500;
  const g = k.ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.connect(hp).connect(g).connect(k.dry);
  src.start(t, Math.random() * 0.5, 0.06);
}

function thump(k: Kit, t: number, vol: number): void {
  const osc = k.ctx.createOscillator();
  osc.frequency.setValueAtTime(120, t);
  osc.frequency.exponentialRampToValueAtTime(48, t + 0.14);
  const g = k.ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  osc.connect(g).connect(k.dry);
  osc.start(t);
  osc.stop(t + 0.25);
}

const PENTA = [0, 2, 4, 7, 9]; // major pentatonic degrees (semitones from the key's tonic)

/** A seeded stepwise-ish melody walk over the key's pentatonic, snapping to chord tones on strong beats. */
function makeMelody(seed: number, tonic: number, lo: number, hi: number) {
  const rand = rng(seed);
  const pool: number[] = [];
  for (let m = lo; m <= hi; m++) if (PENTA.includes(((m - tonic) % 12 + 12) % 12)) pool.push(m);
  let idx = Math.floor(pool.length / 2);
  return {
    rand,
    next(chordTones: number[] | null): number {
      idx = Math.max(0, Math.min(pool.length - 1, idx + Math.round((rand() - 0.5) * 4)));
      if (chordTones) {
        // pull to the nearest chord tone (any octave) among the pool
        let best = idx;
        let bestD = 99;
        pool.forEach((m, i) => {
          if (chordTones.some((c) => (((m - c) % 12) + 12) % 12 === 0) && Math.abs(i - idx) < bestD) {
            best = i;
            bestD = Math.abs(i - idx);
          }
        });
        idx = best;
      }
      return pool[idx];
    },
  };
}

interface Spec {
  bpm: number;
  chords: Chord[];
  layers: (k: Kit, ch: Chord, bar: number, t0: number, beat: number) => void;
}

const SPECS: Record<TrackId, Spec> = {
  /* cozy, slow, bell-like arpeggios over a warm pad */
  world: (() => {
    const mel = makeMelody(11, 0, 72, 91);
    const arpRand = rng(5);
    return {
      bpm: 84,
      chords: [C, Am, F, G, C, Am, F, G, F, C, G, Am, F, G, C, C],
      layers: (k, ch, bar, t0, beat) => {
        const barLen = beat * 4;
        for (const n of triad(ch)) tone(k, n, t0, barLen * 0.95, { vol: 0.05, attack: 0.9, release: 0.9, wet: 0.2 });
        tone(k, bassOf(ch), t0, beat * 1.7, { vol: 0.17, attack: 0.02, release: 0.3 });
        tone(k, bassOf(ch) + (bar % 2 ? 7 : 0), t0 + beat * 2, beat * 1.4, { vol: 0.12, attack: 0.02, release: 0.3 });
        const up = triad(ch, 1);
        const pattern = [0, 1, 2, 1, 2, 1, 0, 1];
        pattern.forEach((p, i) => {
          if (arpRand() < 0.22) return; // let it breathe
          tone(k, up[p], t0 + i * beat * 0.5, beat * 0.9, { vol: 0.06, bell: true, wet: 0.5 });
        });
        if (mel.rand() < 0.75) {
          const spots = [0, 1.5, 2, 3];
          const n = mel.rand() < 0.5 ? 2 : 3;
          for (let i = 0; i < n; i++) {
            const pos = spots[Math.min(spots.length - 1, i + (mel.rand() < 0.3 ? 1 : 0))];
            tone(k, mel.next(triad(ch, 1)), t0 + pos * beat, beat * 1.3, { type: "triangle", vol: 0.075, bell: true, wet: 0.6 });
          }
        }
        if (mel.rand() < 0.2) tone(k, triad(ch, 2)[2], t0 + beat * 3.5, beat, { vol: 0.03, bell: true, wet: 0.8 }); // a little glint
      },
    };
  })(),

  /* brisk and bouncy: walking bass, offbeat stabs, a repeating hook */
  mission: (() => {
    return {
      bpm: 128,
      chords: [C, G, Am, F, C, G, F, G, Am, F, C, G, Am, F, G, C],
      layers: (k, ch, bar, t0, beat) => {
        const hook = makeMelody(200 + (Math.floor(bar / 4) % 2), 0, 72, 93); // the hook repeats every 8 bars
        const b = bassOf(ch);
        [0, 12, 0, 7, 0, 12, 7, 12].forEach((o, i) => tone(k, b + o, t0 + i * beat * 0.5, beat * 0.4, { type: "triangle", vol: 0.13, attack: 0.008, release: 0.05 }));
        [0.5, 1.5, 2.5, 3.5].forEach((p) => triad(ch).forEach((n) => tone(k, n, t0 + p * beat, beat * 0.22, { type: "triangle", vol: 0.03, wet: 0.15 })));
        [0, 2].forEach((p) => thump(k, t0 + p * beat, 0.11));
        [0.5, 1.5, 2.5, 3.5].forEach((p) => hat(k, t0 + p * beat, 0.02));
        // advance the seeded hook to this bar so each phrase is the same every time it comes round
        for (let i = 0; i < (bar % 4) * 8; i++) hook.rand();
        for (let i = 0; i < 8; i++) {
          if (hook.rand() < 0.28) continue;
          tone(k, hook.next(i % 4 === 0 ? triad(ch, 1) : null), t0 + i * beat * 0.5, beat * 0.45, { type: "triangle", vol: 0.08, bell: true, wet: 0.35 });
        }
      },
    };
  })(),

  /* soft music-box, unhurried — for the shop and the puzzle table */
  calm: (() => {
    const mel = makeMelody(77, 5, 72, 89);
    return {
      bpm: 96,
      chords: [F, Dm, Bb, C, F, Dm, Bb, C, Dm, Bb, F, C, Bb, C, F, F],
      layers: (k, ch, _bar, t0, beat) => {
        const barLen = beat * 4;
        for (const n of triad(ch)) tone(k, n, t0, barLen * 0.95, { vol: 0.035, attack: 0.7, release: 0.8, wet: 0.2 });
        tone(k, bassOf(ch), t0, beat * 2.6, { vol: 0.13, attack: 0.03, release: 0.4 });
        const up = triad(ch, 1);
        [0, 2, 1, 2, 0, 2, 1, 2].forEach((p, i) => tone(k, up[p], t0 + i * beat * 0.5, beat * 0.8, { vol: 0.065, bell: true, wet: 0.55 }));
        if (mel.rand() < 0.55) {
          tone(k, mel.next(triad(ch, 1)), t0 + beat * (mel.rand() < 0.5 ? 1 : 3), beat * 1.2, { type: "triangle", vol: 0.07, bell: true, wet: 0.6 });
        }
      },
    };
  })(),
};

async function renderLoop(id: TrackId): Promise<AudioBuffer> {
  const spec = SPECS[id];
  const beat = 60 / spec.bpm;
  const loopSec = spec.chords.length * 4 * beat;
  const loopLen = Math.floor(loopSec * SR);
  const ctx = new OfflineAudioContext(1, loopLen + Math.floor(TAIL * SR), SR);

  const master = ctx.createGain();
  master.connect(ctx.destination);
  const noise = ctx.createBuffer(1, SR, SR);
  const nd = noise.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  // a dotted-eighth echo bus gives the bells their frosty room
  const wet = ctx.createGain();
  const delay = ctx.createDelay(1);
  delay.delayTime.value = beat * 0.75;
  const fb = ctx.createGain();
  fb.gain.value = 0.38;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3200;
  const echoOut = ctx.createGain();
  echoOut.gain.value = 0.55;
  wet.connect(delay).connect(lp);
  lp.connect(fb).connect(delay);
  lp.connect(echoOut).connect(master);

  const kit: Kit = { ctx, dry: master, wet, noise };
  spec.chords.forEach((ch, bar) => spec.layers(kit, ch, bar, bar * 4 * beat, beat));

  const rendered = await ctx.startRendering();
  const src = rendered.getChannelData(0);
  const out = new AudioBuffer({ length: loopLen, sampleRate: SR, numberOfChannels: 1 });
  const dst = out.getChannelData(0);
  const tail = src.length - loopLen;
  let peak = 0;
  for (let i = 0; i < loopLen; i++) {
    dst[i] = src[i] + (i < tail ? src[loopLen + i] : 0); // fold the echo tail onto the start
    peak = Math.max(peak, Math.abs(dst[i]));
  }
  // level by loudness (RMS), not peak — sparse bells have low RMS — while capping peaks
  let sq = 0;
  for (let i = 0; i < loopLen; i++) sq += dst[i] * dst[i];
  const rms = Math.sqrt(sq / loopLen);
  const norm = peak > 0 && rms > 0 ? Math.min(0.12 / rms, 0.9 / peak) : 1;
  for (let i = 0; i < loopLen; i++) dst[i] *= norm;
  return out;
}

/* ------------------------------------------------------------------ */
/* Controller                                                          */
/* ------------------------------------------------------------------ */

class MusicEngine {
  enabled = readEnabled();
  /** Live (started, not yet ended) loop sources — 1 in steady state, briefly 2 while a fade-out finishes. */
  live = 0;
  private wanted: TrackId | null = null;
  private cur: { id: TrackId; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private pending: TrackId | null = null;
  private ver = 0;
  private unlocked = false;
  private bus: GainNode | null = null;
  private buffers = new Map<TrackId, Promise<AudioBuffer>>();
  analyser: AnalyserNode | null = null;

  get current(): TrackId | null {
    return this.cur?.id ?? null;
  }

  get target(): TrackId | null {
    return this.wanted;
  }

  /** Ask for a track (or null for silence). Same track again is a no-op. */
  request(id: TrackId | null): void {
    if (id === this.wanted) return;
    this.wanted = id;
    this.apply();
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      localStorage.setItem(PREF_KEY, on ? "on" : "off");
    } catch {
      /* private mode — the preference just isn't remembered */
    }
    this.apply();
  }

  /** Called from the first real user gesture: browsers only allow audio after one. */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    Sfx.unlock();
    this.apply();
  }

  setHidden(hidden: boolean): void {
    if (!this.unlocked) return;
    const ctx = Sfx.context();
    if (!ctx) return;
    if (hidden) void ctx.suspend();
    else void ctx.resume();
  }

  private busNode(ctx: AudioContext): GainNode {
    if (!this.bus) {
      this.bus = ctx.createGain();
      this.bus.gain.value = VOLUME;
      this.bus.connect(ctx.destination);
      if (import.meta.env.DEV) {
        this.analyser = ctx.createAnalyser();
        this.analyser.fftSize = 1024;
        this.bus.connect(this.analyser);
      }
    }
    return this.bus;
  }

  private buffer(id: TrackId): Promise<AudioBuffer> {
    let p = this.buffers.get(id);
    if (!p) {
      p = renderLoop(id);
      p.catch(() => this.buffers.delete(id));
      this.buffers.set(id, p);
    }
    return p;
  }

  private apply(): void {
    if (!this.unlocked) return;
    const ctx = Sfx.context();
    if (!ctx) return;
    const target = this.enabled ? this.wanted : null;
    if (target === (this.cur?.id ?? this.pending ?? null)) return;

    const v = ++this.ver;
    this.fadeOutCurrent(ctx);
    this.pending = target;
    if (!target) return;
    this.buffer(target).then(
      (buf) => {
        if (v !== this.ver) return; // a newer request superseded this one while it rendered
        this.pending = null;
        this.start(ctx, target, buf);
      },
      () => {
        if (v === this.ver) this.pending = null;
        console.warn("[music] could not build track", target);
      },
    );
  }

  private fadeOutCurrent(ctx: AudioContext): void {
    const c = this.cur;
    if (!c) return;
    this.cur = null;
    const now = ctx.currentTime;
    c.gain.gain.cancelScheduledValues(now);
    c.gain.gain.setValueAtTime(c.gain.gain.value, now);
    c.gain.gain.linearRampToValueAtTime(0, now + FADE_OUT);
    c.src.stop(now + FADE_OUT + 0.05);
  }

  private start(ctx: AudioContext, id: TrackId, buf: AudioBuffer): void {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + FADE_IN);
    src.connect(gain).connect(this.busNode(ctx));
    this.live++;
    src.onended = () => {
      this.live--;
      src.disconnect();
      gain.disconnect();
    };
    src.start(now);
    this.cur = { id, src, gain };
  }
}

export const Music = new MusicEngine();

/* ------------------------------------------------------------------ */
/* Scene-driven director                                               */
/* ------------------------------------------------------------------ */

let directorStarted = false;

/**
 * Picks the track from whichever scenes are up (checked a few times a second —
 * no per-scene wiring, no listeners that can pile up) and unlocks audio on the
 * first pointer/key press so autoplay policies never cause errors.
 */
export function startMusicDirector(game: Phaser.Game): void {
  if (directorStarted) return;
  directorStarted = true;
  const mgr = game.scene;
  const up = (key: string) => !!mgr.getScene(key) && (mgr.isActive(key) || mgr.isPaused(key));

  const pick = (): TrackId | null => {
    if (up("GardenMaze")) return "mission";
    if (up("FrostedShop") || up("FrostedPuzzle")) return "calm";
    if (up("FrostedValley")) return "world";
    return null;
  };
  setInterval(() => Music.request(pick()), 250);

  const unlock = () => {
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    window.removeEventListener("touchstart", unlock, true);
    Music.unlock();
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  window.addEventListener("touchstart", unlock, true);

  document.addEventListener("visibilitychange", () => Music.setHidden(document.hidden));

  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__dgMusic = {
      state: () => {
        let level = 0;
        const a = Music.analyser;
        if (a) {
          const buf = new Float32Array(a.fftSize);
          a.getFloatTimeDomainData(buf);
          level = Math.sqrt(buf.reduce((s, x) => s + x * x, 0) / buf.length);
        }
        return {
          current: Music.current,
          target: Music.target,
          enabled: Music.enabled,
          live: Music.live,
          level: +level.toFixed(4),
          ctx: Sfx.context()?.state ?? "none",
        };
      },
    };
  }
}
