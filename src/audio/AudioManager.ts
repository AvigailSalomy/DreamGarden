import { Sfx } from "../fx/Sfx";

/**
 * Central audio for Dream Garden.
 *
 *  - Background music: ONE looping HTMLAudioElement owned by this module (not
 *    by any Phaser scene), so scene starts/stops, pauses, overlays and panels
 *    can never restart or duplicate it. `startMusic()` is idempotent.
 *  - Autoplay: if the browser refuses `play()`, it retries on the first
 *    pointer/key/touch gesture.
 *  - SFX: short ORIGINAL sounds synthesised with the project's existing
 *    WebAudio engine (fx/Sfx.ts — the game ships no SFX files), addressed by
 *    semantic name, each with a minimum re-trigger interval so rapid clicks
 *    can't stack them.
 *  - Ducking: the big moments briefly lower the music, then ease it back.
 *  - One sound on/off switch (settings) covers music and SFX.
 */

export type SfxName =
  | "ui_click"
  | "resource_collect"
  | "restore_confirm"
  | "resource_restore"
  | "progress_fill"
  | "habitat_complete"
  | "puzzle_action"
  | "puzzle_hint"
  | "puzzle_complete"
  | "animal_rescue"
  | "animal_discovery"
  | "coin_reward"
  | "shop_purchase"
  | "accessory_equip";

const MUSIC_URL = "assets/audio/dream_garden_theme.mp3";
/** Per-device preference (not game progress), so it lives outside the save. */
const MUSIC_PREF_KEY = "dreamgarden.musicEnabled";
const MUSIC_VOLUME = 0.3;

type Tone = [freq: number, dur: number, vol: number, delay: number, type?: OscillatorType, slideTo?: number];

/** Each sound: notes + min re-trigger gap (ms) + optional music duck (ms). */
const SOUNDS: Record<SfxName, { notes: Tone[]; gap: number; duck?: number }> = {
  // barely-there soft tick
  ui_click: { gap: 70, notes: [[660, 0.035, 0.045, 0, "sine"]] },
  // tiny magical pluck + sparkle (~0.3s)
  resource_collect: {
    gap: 90,
    notes: [
      [988, 0.12, 0.11, 0, "triangle", 1319],
      [1976, 0.16, 0.045, 0.06, "sine", 2349],
    ],
  },
  // short soft two-note confirmation
  restore_confirm: {
    gap: 300,
    notes: [
      [784, 0.13, 0.075, 0, "sine"],
      [1175, 0.16, 0.07, 0.07, "sine"],
    ],
  },
  // main restoration: warm swell + ascending bloom arpeggio + shimmer (~1.2s)
  resource_restore: {
    gap: 600,
    notes: [
      [262, 1.0, 0.05, 0, "sine"],
      [523, 0.38, 0.09, 0.0, "sine"],
      [659, 0.38, 0.09, 0.11, "sine"],
      [784, 0.4, 0.085, 0.22, "sine"],
      [1047, 0.45, 0.08, 0.33, "sine"],
      [1319, 0.5, 0.065, 0.44, "sine"],
      [2093, 0.3, 0.03, 0.62, "sine", 2349],
      [2637, 0.35, 0.025, 0.78, "sine"],
    ],
  },
  // tiny HUD ping, much smaller than the restore
  progress_fill: {
    gap: 150,
    notes: [
      [1568, 0.12, 0.05, 0, "sine"],
      [2093, 0.12, 0.03, 0.05, "sine"],
    ],
  },
  // all three restored: brighter arpeggio + held chord (~1.4s)
  habitat_complete: {
    gap: 1200,
    duck: 1500,
    notes: [
      [659, 0.35, 0.1, 0, "triangle"],
      [784, 0.35, 0.1, 0.09, "triangle"],
      [988, 0.38, 0.1, 0.18, "triangle"],
      [1319, 0.45, 0.095, 0.27, "triangle"],
      [1568, 0.5, 0.085, 0.36, "triangle"],
      [1319, 0.9, 0.04, 0.5, "sine"],
      [1568, 0.9, 0.035, 0.5, "sine"],
      [1976, 0.9, 0.03, 0.5, "sine"],
    ],
  },
  // soft positive pluck when a piece lands correctly
  puzzle_action: { gap: 60, notes: [[880, 0.09, 0.09, 0, "sine", 1100], [440, 0.07, 0.04, 0, "sine"]] },
  // gentle magical hint shimmer
  puzzle_hint: {
    gap: 400,
    notes: [
      [1760, 0.25, 0.06, 0, "sine", 2349],
      [2637, 0.3, 0.035, 0.12, "sine"],
    ],
  },
  // picture complete: short success flourish (~0.9s)
  puzzle_complete: {
    gap: 1500,
    duck: 1200,
    notes: [
      [523, 0.3, 0.13, 0, "triangle"],
      [659, 0.3, 0.13, 0.09, "triangle"],
      [784, 0.32, 0.13, 0.18, "triangle"],
      [1047, 0.45, 0.12, 0.27, "triangle"],
      [1319, 0.4, 0.06, 0.4, "sine"],
    ],
  },
  // THE big one: bells + warm chord + sparkle tail (~2.2s)
  animal_rescue: {
    gap: 2500,
    duck: 2600,
    notes: [
      [523, 0.5, 0.14, 0, "triangle"],
      [659, 0.5, 0.14, 0.11, "triangle"],
      [784, 0.5, 0.14, 0.22, "triangle"],
      [1047, 0.6, 0.13, 0.33, "triangle"],
      [1319, 0.6, 0.12, 0.44, "triangle"],
      [1568, 0.8, 0.11, 0.55, "triangle"],
      [523, 1.6, 0.06, 0.2, "sine"],
      [659, 1.6, 0.05, 0.2, "sine"],
      [784, 1.6, 0.05, 0.2, "sine"],
      [2093, 0.35, 0.04, 0.85, "sine"],
      [2637, 0.35, 0.035, 1.0, "sine"],
      [3136, 0.45, 0.03, 1.15, "sine"],
      [2093, 0.6, 0.025, 1.4, "sine", 2637],
    ],
  },
  // small sparkle as the next animal is introduced
  animal_discovery: {
    gap: 800,
    notes: [
      [1319, 0.2, 0.06, 0, "sine", 1760],
      [2349, 0.25, 0.03, 0.1, "sine"],
    ],
  },
  coin_reward: {
    gap: 90,
    notes: [
      [988, 0.08, 0.07, 0, "triangle", 1480],
      [1480, 0.1, 0.045, 0.06, "sine"],
    ],
  },
  shop_purchase: {
    gap: 300,
    notes: [
      [784, 0.12, 0.09, 0, "triangle"],
      [1175, 0.14, 0.09, 0.07, "triangle"],
      [1568, 0.2, 0.05, 0.15, "sine"],
    ],
  },
  accessory_equip: {
    gap: 300,
    notes: [
      [1175, 0.25, 0.06, 0, "sine", 1760],
      [2349, 0.3, 0.03, 0.12, "sine"],
    ],
  },
};

class AudioManager {
  private music: HTMLAudioElement | null = null;
  private musicWanted = false;
  private lastPlayed = new Map<SfxName, number>();
  private duckUntil = 0;
  private fadeRaf = 0;
  private gestureArmed = false;
  private musicOn = readMusicPref();

  /** Music on/off (settings) — independent of SFX. */
  get musicEnabled(): boolean {
    return this.musicOn;
  }

  setMusicEnabled(on: boolean): void {
    this.musicOn = on;
    try {
      localStorage.setItem(MUSIC_PREF_KEY, on ? "1" : "0");
    } catch {
      /* private mode etc. — preference just won't persist */
    }
    if (!this.music) return;
    if (on && this.musicWanted && this.enabled) this.tryPlay();
    else if (!on) this.music.pause();
  }

  get enabled(): boolean {
    return Sfx.enabled;
  }

  /** Sound on/off (settings): covers music and SFX. */
  setEnabled(on: boolean): void {
    Sfx.enabled = on;
    if (!this.music) return;
    if (on && this.musicWanted && this.musicOn) this.tryPlay();
    else if (!on) this.music.pause();
  }

  /** Call from a user gesture so mobile browsers unlock WebAudio. */
  unlock(): void {
    Sfx.unlock();
    if (this.musicWanted && this.music?.paused && this.enabled && this.musicOn) this.tryPlay();
  }

  /** Start the looping theme. Safe to call any number of times. */
  startMusic(): void {
    this.musicWanted = true;
    if (!this.music) {
      // survive Vite HMR in dev: reuse the element a previous module copy made
      const w = window as unknown as { __dgMusic?: HTMLAudioElement };
      this.music = w.__dgMusic ?? new Audio(MUSIC_URL);
      w.__dgMusic = this.music;
      this.music.loop = true;
      this.music.preload = "auto";
      this.music.volume = MUSIC_VOLUME;
      document.addEventListener("visibilitychange", () => {
        if (!this.music || !this.musicWanted || !this.enabled || !this.musicOn) return;
        if (document.visibilityState === "hidden") this.music.pause();
        else this.tryPlay();
      });
    }
    if (this.enabled && this.musicOn && this.music.paused) this.tryPlay();
  }

  private tryPlay(): void {
    if (!this.music) return;
    this.music.play().catch(() => this.armGestureRetry());
  }

  /** Autoplay was blocked: start on the first real user gesture instead. */
  private armGestureRetry(): void {
    if (this.gestureArmed) return;
    this.gestureArmed = true;
    const retry = () => {
      this.gestureArmed = false;
      ["pointerdown", "keydown", "touchstart"].forEach((e) => window.removeEventListener(e, retry, true));
      if (this.musicWanted && this.enabled && this.musicOn) this.tryPlay();
    };
    ["pointerdown", "keydown", "touchstart"].forEach((e) => window.addEventListener(e, retry, true));
  }

  /** Named SFX; ignored if the same sound fired within its minimum gap. */
  playSfx(name: SfxName): void {
    if (!this.enabled) return;
    const def = SOUNDS[name];
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? -Infinity) < def.gap) return;
    this.lastPlayed.set(name, now);
    for (const [f, d, v, delay, type, slideTo] of def.notes) {
      Sfx.tone(f, d, { vol: v, delay, type: type ?? "sine", slideTo });
    }
    if (def.duck) this.duck(def.duck);
  }

  /** Briefly lower the music under a flourish, then ease it back. */
  private duck(ms: number): void {
    if (!this.music) return;
    this.duckUntil = Math.max(this.duckUntil, performance.now() + ms);
    cancelAnimationFrame(this.fadeRaf);
    const step = () => {
      if (!this.music) return;
      const target = performance.now() < this.duckUntil ? MUSIC_VOLUME * 0.55 : MUSIC_VOLUME;
      const v = this.music.volume + (target - this.music.volume) * 0.12;
      this.music.volume = Math.abs(v - target) < 0.004 ? target : v;
      if (this.music.volume !== MUSIC_VOLUME || performance.now() < this.duckUntil) {
        this.fadeRaf = requestAnimationFrame(step);
      }
    };
    this.fadeRaf = requestAnimationFrame(step);
  }

  /** QA/debug snapshot. */
  debugState(): { musicInstances: number; playing: boolean; volume: number; time: number } {
    return {
      musicInstances: this.music ? 1 : 0,
      playing: !!this.music && !this.music.paused,
      volume: this.music ? +this.music.volume.toFixed(3) : 0,
      time: this.music ? +this.music.currentTime.toFixed(2) : 0,
    };
  }
}

function readMusicPref(): boolean {
  try {
    return localStorage.getItem(MUSIC_PREF_KEY) !== "0";
  } catch {
    return true;
  }
}

export const audio = new AudioManager();
