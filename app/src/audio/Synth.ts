/**
 * Synth — a tiny hand-rolled Web Audio instrument set for PLAY and CREATE.
 *
 * No Tone.js: keeping it dependency-free keeps the bundle lean and avoids any
 * WebView/Expo surprises. Each voice is built from oscillators + a noise buffer
 * + gain/filter envelopes, then routed through a shared limiter so stacked hits
 * never clip. Recipes are the SME-validated drum/bass/pad/pluck designs.
 */
export type InstrumentId = 'kick' | 'snare' | 'hat' | 'bass' | 'pad' | 'pluck';

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export class Synth {
  ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private comp: DynamicsCompressorNode | null = null;
  private noise: AudioBuffer | null = null;

  async init(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 8;
    this.comp.attack.value = 0.003;
    this.comp.release.value = 0.18;
    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);
    this.noise = this.makeNoise(ctx);
    if (ctx.state === 'suspended') await ctx.resume();
  }

  get ready(): boolean {
    return this.ctx !== null;
  }

  /** Trigger an instrument voice. `when` defaults to now; `midi` tunes pitched voices. */
  trigger(id: InstrumentId, when?: number, velocity = 1, midi?: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const t = when ?? ctx.currentTime;
    const v = Math.max(0.05, Math.min(1, velocity));
    switch (id) {
      case 'kick':
        return this.kick(ctx, master, t, v);
      case 'snare':
        return this.snare(ctx, master, t, v);
      case 'hat':
        return this.hat(ctx, master, t, v);
      case 'bass':
        return this.bass(ctx, master, t, v, midi ?? 36);
      case 'pad':
        return this.pad(ctx, master, t, v, midi ?? 60);
      case 'pluck':
        return this.pluck(ctx, master, t, v, midi ?? 72);
    }
  }

  resume(): void {
    void this.ctx?.resume().catch(() => {});
  }

  destroy(): void {
    try {
      this.master?.disconnect();
      this.comp?.disconnect();
    } catch {
      /* ignore */
    }
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.master = null;
    this.comp = null;
    this.noise = null;
  }

  /* ---- voices ---- */
  private kick(ctx: AudioContext, out: GainNode, t: number, v: number): void {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.08);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  private snare(ctx: AudioContext, out: GainNode, t: number, v: number): void {
    const n = this.noiseSource(ctx);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1800;
    bp.Q.value = 0.7;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(v * 0.9, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    n.connect(bp).connect(ng).connect(out);
    n.start(t);
    n.stop(t + 0.2);
    // Tonal body.
    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, t);
    og.gain.setValueAtTime(v * 0.5, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(og).connect(out);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  private hat(ctx: AudioContext, out: GainNode, t: number, v: number): void {
    const n = this.noiseSource(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
    n.connect(hp).connect(g).connect(out);
    n.start(t);
    n.stop(t + 0.06);
  }

  private bass(ctx: AudioContext, out: GainNode, t: number, v: number, midi: number): void {
    const osc = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = midiToFreq(midi);
    lp.type = 'lowpass';
    lp.frequency.value = 800;
    // Amp ADSR ~ 5/100/0.4/80ms.
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.005);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, v * 0.4), t + 0.105);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    osc.connect(lp).connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.45);
  }

  private pad(ctx: AudioContext, out: GainNode, t: number, v: number, midi: number): void {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2000;
    const g = ctx.createGain();
    // Amp ADSR ~ 500/400/0.7/900ms.
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(v * 0.5, t + 0.5);
    g.gain.linearRampToValueAtTime(v * 0.35, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    const f = midiToFreq(midi);
    for (const detune of [-8, 8]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      osc.detune.value = detune;
      osc.connect(lp);
      osc.start(t);
      osc.stop(t + 1.9);
    }
    lp.connect(g).connect(out);
  }

  private pluck(ctx: AudioContext, out: GainNode, t: number, v: number, midi: number): void {
    const osc = ctx.createOscillator();
    const lp = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = midiToFreq(midi);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4000, t);
    lp.frequency.exponentialRampToValueAtTime(500, t + 0.16);
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(v, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
    osc.connect(lp).connect(g).connect(out);
    osc.start(t);
    osc.stop(t + 0.26);
  }

  private noiseSource(ctx: AudioContext): AudioBufferSourceNode {
    const src = ctx.createBufferSource();
    src.buffer = this.noise ?? this.makeNoise(ctx);
    return src;
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const len = Math.floor(ctx.sampleRate * 1);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
}
