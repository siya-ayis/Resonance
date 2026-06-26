/**
 * AudioEngine — the master clock and transport for FEEL playback.
 *
 * Timing law: never use setInterval/Date.now() for musical timing. All position
 * is derived from AudioContext.currentTime (audio-thread-backed, high-res).
 *
 * Robustness: the clock advances even with NO audio loaded (so the visual +
 * haptic pipeline is fully testable against a hand-authored manifest before any
 * stem audio exists). When stems/master are present they are started
 * sample-aligned to the same clock.
 */
export type StemKey = 'bass' | 'drums' | 'vocals' | 'other';

export interface LoadResult {
  loaded: string[];
  missing: string[];
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  durationMs = 0;

  private masterGain: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  private freqData: Uint8Array | null = null;

  private buffers = new Map<string, AudioBuffer>();
  private sources: AudioBufferSourceNode[] = [];

  private _playing = false;
  private _startCtxTime = 0; // ctx.currentTime captured at last (re)start
  private _offsetMs = 0; // position when last started/seeked
  private _onEnded: (() => void) | null = null;

  /** Lazily create the AudioContext. Must be called from a user gesture. */
  async init(): Promise<void> {
    if (this.ctx) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx();
    this.masterGain = this.ctx.createGain();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.8;
    this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
  }

  /** Fetch + decode master and any stems. Missing files are tolerated. */
  async loadAudio(baseUrl: string, refs: { master: string; stems?: Partial<Record<StemKey, string>> }): Promise<LoadResult> {
    await this.init();
    const ctx = this.ctx!;
    const jobs: Array<Promise<void>> = [];
    const loaded: string[] = [];
    const missing: string[] = [];
    const fetchInto = async (key: string, url: string) => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${res.status}`);
        const buf = await res.arrayBuffer();
        const audio = await ctx.decodeAudioData(buf);
        this.buffers.set(key, audio);
        loaded.push(key);
        this.durationMs = Math.max(this.durationMs, audio.duration * 1000);
      } catch {
        missing.push(key);
      }
    };
    // Prefer stems (so each instrument is an independent channel); fall back to master.
    if (refs.stems && Object.keys(refs.stems).length) {
      for (const [k, rel] of Object.entries(refs.stems)) {
        if (rel) jobs.push(fetchInto(k, join(baseUrl, rel)));
      }
    }
    jobs.push(fetchInto('master', join(baseUrl, refs.master)));
    await Promise.all(jobs);
    return { loaded, missing };
  }

  get isPlaying(): boolean {
    return this._playing;
  }

  /** Current playback position in milliseconds (the master clock). */
  positionMs(): number {
    let pos = this._offsetMs;
    if (this._playing && this.ctx) {
      pos += (this.ctx.currentTime - this._startCtxTime) * 1000;
    }
    if (this.durationMs > 0 && pos >= this.durationMs) {
      pos = this.durationMs;
    }
    return Math.max(0, pos);
  }

  async play(): Promise<void> {
    await this.init();
    const ctx = this.ctx!;
    if (ctx.state === 'suspended') await ctx.resume();
    if (this._playing) return;
    if (this.durationMs > 0 && this._offsetMs >= this.durationMs) this._offsetMs = 0;

    this._startCtxTime = ctx.currentTime;
    this._playing = true;
    this.startSources(this._offsetMs / 1000);
  }

  pause(): void {
    if (!this._playing) return;
    this._offsetMs = this.positionMs();
    this._playing = false;
    this.stopSources();
  }

  seek(ms: number): void {
    const wasPlaying = this._playing;
    if (wasPlaying) this.stopSources();
    this._offsetMs = Math.max(0, this.durationMs ? Math.min(ms, this.durationMs) : ms);
    if (wasPlaying && this.ctx) {
      this._startCtxTime = this.ctx.currentTime;
      this.startSources(this._offsetMs / 1000);
    }
  }

  stop(): void {
    this._playing = false;
    this._offsetMs = 0;
    this.stopSources();
  }

  /**
   * Fully release the AudioContext and decoded buffers. Browsers cap live
   * AudioContexts (~6 in Chromium), so FEEL MUST close its context on teardown —
   * otherwise repeated visits leak a context each time and eventually the
   * constructor throws and playback breaks until a full reload.
   */
  destroy(): void {
    this.stopSources();
    this._playing = false;
    this._onEnded = null;
    try {
      this.masterGain?.disconnect();
      this.analyser?.disconnect();
    } catch {
      /* nodes already detached */
    }
    const ctx = this.ctx;
    this.ctx = null;
    this.masterGain = null;
    this.analyser = null;
    this.freqData = null;
    this.buffers.clear();
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => {});
  }

  onEnded(cb: () => void): void {
    this._onEnded = cb;
  }

  /** Master volume 0..1 (audio only — visuals/haptics are independent). */
  setVolume(v: number): void {
    if (this.masterGain) this.masterGain.gain.value = Math.max(0, Math.min(1, v));
  }

  /** Smoothed broadband energy 0..1 from the analyser, for organic micro-motion. */
  energy(): number {
    if (!this.analyser || !this.freqData) return 0;
    const data = this.freqData;
    this.analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    return sum / (data.length * 255);
  }

  private startSources(offsetSec: number): void {
    if (!this.ctx || !this.masterGain) return;
    if (this.buffers.size === 0) return; // silent-clock mode: nothing to play
    const ctx = this.ctx;
    // Prefer playing stems together; if only master exists, play master.
    const keys = [...this.buffers.keys()].filter((k) => k !== 'master');
    const playKeys = keys.length ? keys : ['master'];
    for (const key of playKeys) {
      const buffer = this.buffers.get(key);
      if (!buffer) continue;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(this.masterGain);
      try {
        src.start(ctx.currentTime, Math.max(0, offsetSec));
      } catch {
        /* offset past end */
      }
      this.sources.push(src);
    }
    if (this.sources[0]) {
      this.sources[0].onended = () => {
        if (this._playing && this.positionMs() >= this.durationMs - 30) {
          this._playing = false;
          this._offsetMs = this.durationMs;
          this._onEnded?.();
        }
      };
    }
  }

  private stopSources(): void {
    for (const s of this.sources) {
      try {
        s.onended = null;
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
  }
}

function join(base: string, rel: string): string {
  if (rel.startsWith('http') || rel.startsWith('/')) return rel;
  return `${base.replace(/\/$/, '')}/${rel}`;
}
