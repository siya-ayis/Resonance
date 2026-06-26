import { OnsetDetector } from './dsp/onset';
import { YinPitch } from './dsp/pitch';
import { hzToMidi } from '../visual/colorEngine';

/**
 * LiveAudioEngine — the SENSE pillar's real-time ear.
 *
 * Captures the device microphone and, every frame, extracts the musical
 * features that drive sight + touch with <100ms perceived latency:
 *   - band levels (bass / mid / treble) via linear-power averaging of the FFT
 *   - loudness (RMS) from the time-domain frame
 *   - onsets via whitened log spectral flux (OnsetDetector)
 *   - monophonic pitch via YIN (YinPitch)
 *
 * Signal chain (SME-validated):
 *   mic --highpass(35Hz)--> analyserFFT(2048, smoothing 0)  [bands + onset]
 *                       \-> analyserTime(2048)               [pitch]
 *
 * All per-frame buffers are preallocated. Band levels use asymmetric
 * attack/release followers so motion feels musical, not jittery.
 */
export interface LiveFeatures {
  bass: number;
  mid: number;
  treble: number;
  rms: number;
  onset: boolean;
  onsetStrength: number;
  pitchHz: number | null;
  midi: number | null;
  pitchClarity: number;
}

interface BandRange {
  lo: number;
  hi: number;
}

const EMPTY: LiveFeatures = {
  bass: 0,
  mid: 0,
  treble: 0,
  rms: 0,
  onset: false,
  onsetStrength: 0,
  pitchHz: null,
  midi: null,
  pitchClarity: 0,
};

export class LiveAudioEngine {
  ctx: AudioContext | null = null;
  running = false;
  /** Set by stop() so an in-flight start() (awaiting the mic prompt) bails out. */
  private cancelled = false;

  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private highpass: BiquadFilterNode | null = null;
  private anFFT: AnalyserNode | null = null;
  private anTime: AnalyserNode | null = null;

  private freqDb = new Float32Array(0);
  private timeBuf = new Float32Array(0);

  private onsetDet: OnsetDetector | null = null;
  private yin: YinPitch | null = null;

  private band: Record<'bass' | 'mid' | 'treble', BandRange> = {
    bass: { lo: 0, hi: 0 },
    mid: { lo: 0, hi: 0 },
    treble: { lo: 0, hi: 0 },
  };

  // Smoothed levels.
  private sBass = 0;
  private sMid = 0;
  private sTreble = 0;
  private sRms = 0;

  private sensitivity = 1.4; // user-tunable gain
  private lastMs = 0;
  private lastPitchMs = 0;
  private features: LiveFeatures = { ...EMPTY };

  get features$(): LiveFeatures {
    return this.features;
  }

  setSensitivity(v: number): void {
    this.sensitivity = Math.max(0.3, Math.min(4, v));
  }

  async start(): Promise<boolean> {
    if (this.running) return true;
    this.cancelled = false;
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;

    let stream: MediaStream;
    try {
      if (ctx.state === 'suspended') await ctx.resume();
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: false },
          noiseSuppression: { ideal: false },
          autoGainControl: { ideal: false },
          channelCount: { ideal: 1 },
        },
      });
    } catch (e) {
      // Acquisition failed (denied / no device): release the context we created.
      void ctx.close().catch(() => {});
      if (this.ctx === ctx) this.ctx = null;
      throw e;
    }

    // If we were torn down while the permission prompt was open, immediately
    // release the freshly-acquired mic and bail — never leave the mic live.
    if (this.cancelled || this.ctx !== ctx) {
      for (const t of stream.getTracks()) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
      void ctx.close().catch(() => {});
      return false; // caller must NOT start its loop — we were cancelled mid-prompt
    }
    this.stream = stream;

    try {
      this.source = ctx.createMediaStreamSource(stream);
      this.highpass = ctx.createBiquadFilter();
      this.highpass.type = 'highpass';
      this.highpass.frequency.value = 35;

      this.anFFT = ctx.createAnalyser();
      this.anFFT.fftSize = 2048;
      this.anFFT.smoothingTimeConstant = 0; // we smooth ourselves
      this.anTime = ctx.createAnalyser();
      this.anTime.fftSize = 2048;
      this.anTime.smoothingTimeConstant = 0;

      this.source.connect(this.highpass);
      this.highpass.connect(this.anFFT);
      this.highpass.connect(this.anTime);
      // Note: analysers are sinks; we never connect to destination (no echo).

      const bins = this.anFFT.frequencyBinCount;
      this.freqDb = new Float32Array(bins);
      this.timeBuf = new Float32Array(this.anTime.fftSize);

      const binHz = ctx.sampleRate / this.anFFT.fftSize;
      this.band.bass = makeBand(35, 250, binHz, bins);
      this.band.mid = makeBand(250, 2000, binHz, bins);
      this.band.treble = makeBand(2000, 8000, binHz, bins);

      this.onsetDet = new OnsetDetector(bins, ctx.sampleRate, this.anFFT.fftSize);
      this.yin = new YinPitch(ctx.sampleRate, this.anTime.fftSize, 70, 1000);

      this.lastMs = performance.now();
      this.lastPitchMs = this.lastMs;
      this.running = true;
      return true;
    } catch (e) {
      // Node graph setup failed on a live stream: stop the mic + close before rethrow.
      for (const t of stream.getTracks()) {
        try {
          t.stop();
        } catch {
          /* ignore */
        }
      }
      void ctx.close().catch(() => {});
      this.stream = null;
      this.source = null;
      if (this.ctx === ctx) this.ctx = null;
      throw e;
    }
  }

  /** Read the analysers and compute features for this frame. Call once per rAF. */
  analyse(nowMs = performance.now()): LiveFeatures {
    if (!this.running || !this.anFFT || !this.anTime || !this.onsetDet || !this.yin) {
      return this.features;
    }
    const dt = Math.min(0.1, Math.max(0.001, (nowMs - this.lastMs) / 1000));
    this.lastMs = nowMs;

    this.anFFT.getFloatFrequencyData(this.freqDb);
    this.anTime.getFloatTimeDomainData(this.timeBuf);

    const g = this.sensitivity;
    const rawBass = bandRms(this.freqDb, this.band.bass) * g * 6;
    const rawMid = bandRms(this.freqDb, this.band.mid) * g * 9;
    const rawTreble = bandRms(this.freqDb, this.band.treble) * g * 14;
    const rawRms = timeRms(this.timeBuf) * g * 3;

    // Asymmetric followers (fast attack, slow release) for musical motion.
    this.sBass = follow(this.sBass, shape(rawBass), dt, 0.025, 0.22);
    this.sMid = follow(this.sMid, shape(rawMid), dt, 0.035, 0.18);
    this.sTreble = follow(this.sTreble, shape(rawTreble), dt, 0.008, 0.09);
    this.sRms = follow(this.sRms, shape(rawRms), dt, 0.01, 0.3);

    const onsetRes = this.onsetDet.process(this.freqDb, dt, nowMs / 1000);

    // Pitch ~30Hz (heavier than the rest; throttle to keep mobile smooth).
    let pitchHz = this.features.pitchHz;
    let clarity = this.features.pitchClarity;
    let midi = this.features.midi;
    if (nowMs - this.lastPitchMs >= 32) {
      this.lastPitchMs = nowMs;
      const p = this.yin.detect(this.timeBuf);
      if (p) {
        pitchHz = p.hz;
        clarity = p.clarity;
        midi = Math.round(hzToMidi(p.hz));
      } else {
        pitchHz = null;
        clarity = 0;
        midi = null;
      }
    }

    this.features = {
      bass: this.sBass,
      mid: this.sMid,
      treble: this.sTreble,
      rms: this.sRms,
      onset: onsetRes.onset,
      onsetStrength: onsetRes.strength,
      pitchHz,
      midi,
      pitchClarity: clarity,
    };
    return this.features;
  }

  /** Broadband energy 0..1 for the visual engine's energy provider. */
  energy(): number {
    return Math.min(1, (this.sBass + this.sMid + this.sTreble) / 2.2);
  }

  stop(): void {
    this.running = false;
    this.cancelled = true;
    try {
      this.source?.disconnect();
      this.highpass?.disconnect();
      this.anFFT?.disconnect();
      this.anTime?.disconnect();
    } catch {
      /* ignore */
    }
    for (const t of this.stream?.getTracks() ?? []) {
      try {
        t.stop();
      } catch {
        /* ignore */
      }
    }
    this.stream = null;
    this.source = null;
    void this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.onsetDet?.reset();
    this.sBass = this.sMid = this.sTreble = this.sRms = 0;
    this.features = { ...EMPTY };
  }
}

function makeBand(loHz: number, hiHz: number, binHz: number, bins: number): BandRange {
  return {
    lo: Math.max(1, Math.ceil(loHz / binHz)),
    hi: Math.min(bins - 1, Math.floor(hiHz / binHz)),
  };
}

/** RMS of linear power over a band of the dB spectrum. */
function bandRms(db: Float32Array, band: BandRange): number {
  let sum = 0;
  let n = 0;
  for (let k = band.lo; k <= band.hi; k++) {
    const amp = Math.pow(10, db[k] / 20);
    sum += amp * amp;
    n++;
  }
  return Math.sqrt(sum / Math.max(1, n));
}

function timeRms(buf: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

/** Perceptual shaping: lift quiet signals, clamp to 0..1. */
function shape(v: number): number {
  return Math.min(1, Math.pow(Math.max(0, v), 0.6));
}

/** Asymmetric one-pole follower: tau differs on attack vs release. */
function follow(y: number, x: number, dt: number, attack: number, release: number): number {
  const tau = x > y ? attack : release;
  return y + (x - y) * (1 - Math.exp(-dt / tau));
}
