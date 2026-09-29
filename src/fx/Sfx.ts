/**
 * Tiny WebAudio synth — no audio files. Soft, warm blips that match the mood.
 * Safe to call before the AudioContext is allowed; it resumes on first gesture.
 */
class SfxEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  /** Call once from a pointer/touch handler so mobile browsers unlock audio. */
  unlock(): void {
    this.ensure();
  }

  /** A single soft enveloped tone — the building block AudioManager composes
   *  its named SFX from. */
  tone(
    freq: number,
    dur: number,
    opts: { type?: OscillatorType; vol?: number; slideTo?: number; delay?: number } = {},
  ): void {
    this.blip(freq, dur, opts);
  }

  private blip(
    freq: number,
    dur: number,
    opts: { type?: OscillatorType; vol?: number; slideTo?: number; delay?: number } = {},
  ): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + (opts.delay ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = opts.type ?? "sine";
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t0 + dur);
    const vol = opts.vol ?? 0.25;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  pickup(): void {
    this.blip(520, 0.09, { type: "triangle", vol: 0.16, slideTo: 640 });
  }
  snap(): void {
    this.blip(720, 0.12, { type: "sine", vol: 0.22, slideTo: 960 });
    this.blip(300, 0.08, { type: "sine", vol: 0.12 });
  }
  returnTile(): void {
    this.blip(360, 0.1, { type: "triangle", vol: 0.12, slideTo: 280 });
  }
  sparkle(): void {
    this.blip(1400, 0.08, { type: "sine", vol: 0.08, slideTo: 2100 });
  }
  complete(): void {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.blip(f, 0.22, { type: "triangle", vol: 0.2, delay: i * 0.09 }),
    );
  }
  whoosh(): void {
    this.blip(180, 0.5, { type: "sine", vol: 0.12, slideTo: 520 });
  }
  land(): void {
    this.blip(140, 0.16, { type: "sine", vol: 0.26, slideTo: 90 });
  }
  coin(): void {
    this.blip(880, 0.07, { type: "square", vol: 0.09, slideTo: 1320 });
  }
  fanfare(): void {
    [659, 880, 1175].forEach((f, i) =>
      this.blip(f, 0.3, { type: "triangle", vol: 0.22, delay: i * 0.08 }),
    );
  }
  tap(): void {
    this.blip(440, 0.05, { type: "sine", vol: 0.1 });
  }

  /** Bunny Heist: a fox has just noticed something ("!"). */
  alertPing(): void {
    this.blip(760, 0.06, { type: "square", vol: 0.13, slideTo: 980 });
    this.blip(760, 0.06, { type: "square", vol: 0.13, slideTo: 980, delay: 0.11 });
  }
  /** Bunny Heist: caught by a fox — short, not harsh. */
  caughtThud(): void {
    this.blip(220, 0.15, { type: "sine", vol: 0.22, slideTo: 80 });
    this.blip(150, 0.18, { type: "triangle", vol: 0.16, slideTo: 60, delay: 0.05 });
  }
  /** Bunny Heist: safely escaped with the loot. */
  escapeChime(): void {
    [784, 988, 1318].forEach((f, i) => this.blip(f, 0.2, { type: "triangle", vol: 0.2, delay: i * 0.07 }));
  }

  /* ---- object-specific puzzle-completion sounds (short, never looped) ---- */

  /** Rabbit: a soft two-note squeak — cute, tiny, not an animal recording. */
  rabbitChirp(): void {
    this.blip(560, 0.09, { type: "triangle", vol: 0.14, slideTo: 720, delay: 0.0 });
    this.blip(700, 0.11, { type: "triangle", vol: 0.13, slideTo: 880, delay: 0.13 });
  }

  /** Songbird: a clear, pleasant little warble. */
  birdSong(): void {
    const notes: Array<[number, number, number]> = [
      [1046, 0.1, 0.0],
      [1318, 0.09, 0.11],
      [1174, 0.09, 0.21],
      [1568, 0.14, 0.32],
      [1318, 0.16, 0.46],
    ];
    for (const [f, d, t] of notes) {
      this.blip(f, d, { type: "sine", vol: 0.13, slideTo: f * 1.03, delay: t });
    }
    this.blip(2100, 0.06, { type: "sine", vol: 0.05, delay: 0.5 });
  }

  /** Wildflowers: a soft magical bloom chime (no animal sound). */
  bloomChime(): void {
    [880, 1175, 1568, 2093].forEach((f, i) =>
      this.blip(f, 0.42, { type: "sine", vol: 0.11 - i * 0.015, delay: i * 0.11 }),
    );
    this.blip(2637, 0.2, { type: "sine", vol: 0.04, delay: 0.5 });
  }
}

export const Sfx = new SfxEngine();
