/**
 * YIN pitch detector (CMNDF variant) — monophonic, in-browser.
 *
 * Operates on a time-domain frame from an AnalyserNode (getFloatTimeDomainData).
 * Returns a fundamental frequency + a clarity score, or null when the frame is
 * too quiet / not confidently pitched. Buffers are preallocated (no per-frame
 * GC in the audio path). Validated against the design's SENSE spec (§9B).
 */
export interface PitchResult {
  hz: number;
  clarity: number;
}

export class YinPitch {
  private diff: Float32Array;
  private cmndf: Float32Array;

  constructor(
    private sampleRate: number,
    private n = 2048,
    private minHz = 70,
    private maxHz = 1000,
    private clarityGate = 0.75,
  ) {
    this.diff = new Float32Array(n);
    this.cmndf = new Float32Array(n);
  }

  detect(x: Float32Array): PitchResult | null {
    const n = Math.min(this.n, x.length);

    let mean = 0;
    for (let i = 0; i < n; i++) mean += x[i];
    mean /= n;

    let rms = 0;
    for (let i = 0; i < n; i++) {
      const v = x[i] - mean;
      rms += v * v;
    }
    rms = Math.sqrt(rms / n);
    if (rms < 0.012) return null; // too quiet to pitch reliably

    const tauMin = Math.max(2, Math.floor(this.sampleRate / this.maxHz));
    const tauMax = Math.min(Math.floor(this.sampleRate / this.minHz), n >> 1);

    // Squared difference function.
    for (let tau = 1; tau <= tauMax; tau++) {
      let sum = 0;
      for (let i = 0; i < n - tau; i++) {
        const d = x[i] - mean - (x[i + tau] - mean);
        sum += d * d;
      }
      this.diff[tau] = sum;
    }

    // Cumulative mean normalized difference.
    this.cmndf[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      running += this.diff[tau];
      this.cmndf[tau] = running ? (this.diff[tau] * tau) / running : 1;
    }

    // Absolute threshold: first local min below 0.18 (a slightly looser dip so
    // real-world/sung notes commit, while the clarity gate below rejects noise).
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (this.cmndf[t] < 0.18) {
        while (t + 1 <= tauMax && this.cmndf[t + 1] < this.cmndf[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) return null;

    // Parabolic interpolation around the dip for sub-sample precision.
    const a = this.cmndf[tau - 1] ?? this.cmndf[tau];
    const b = this.cmndf[tau];
    const c = this.cmndf[tau + 1] ?? b;
    const denom = a - 2 * b + c || 1;
    const betterTau = tau + (a - c) / (2 * denom);

    const clarity = 1 - b;
    if (clarity < this.clarityGate) return null;

    const hz = this.sampleRate / betterTau;
    return hz >= this.minHz && hz <= this.maxHz ? { hz, clarity } : null;
  }
}
