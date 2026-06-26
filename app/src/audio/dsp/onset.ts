/**
 * Onset detector — whitened log spectral flux with an adaptive (z-score)
 * threshold and a refractory period. Robust to steady room noise (the running
 * EMA whitens the spectrum) and to both percussive and tonal onsets. Operates on
 * the dB spectrum from AnalyserNode.getFloatFrequencyData. (Audio SME spec §1.)
 */
export interface OnsetResult {
  onset: boolean;
  flux: number;
  /** 0..1 strength estimate of this onset (for visual/haptic intensity). */
  strength: number;
}

export class OnsetDetector {
  private prevL: Float32Array;
  private ema: Float32Array;
  private history = new Float32Array(36);
  private histPtr = 0;
  private histFilled = 0;
  private lastOnsetSec = -1;
  private loBin: number;
  private hiBin: number;

  constructor(
    binCount: number,
    sampleRate: number,
    fftSize: number,
    private zThresh = 2.7,
    private fluxFloor = 0.035,
    private refractorySec = 0.09,
  ) {
    this.prevL = new Float32Array(binCount);
    this.ema = new Float32Array(binCount);
    const binHz = sampleRate / fftSize;
    this.loBin = Math.max(1, Math.ceil(60 / binHz));
    this.hiBin = Math.min(binCount - 1, Math.floor(8000 / binHz));
  }

  process(db: Float32Array, dt: number, nowSec: number): OnsetResult {
    const decay = Math.exp(-dt / 1.0);
    let flux = 0;
    let n = 0;
    for (let k = this.loBin; k <= this.hiBin; k++) {
      const A = Math.pow(10, Math.min(-20, Math.max(-90, db[k])) / 20);
      const L = Math.log1p((10 * A) / (this.ema[k] + 1e-5));
      const d = L - this.prevL[k];
      if (d > 0) flux += d;
      this.prevL[k] = L;
      this.ema[k] = decay * this.ema[k] + (1 - decay) * A;
      n++;
    }
    flux /= Math.max(1, n);

    // Running mean/std over the recent history.
    let mean = 0;
    const m = this.histFilled;
    for (let i = 0; i < m; i++) mean += this.history[i];
    mean = m ? mean / m : 0;
    let varSum = 0;
    for (let i = 0; i < m; i++) {
      const dv = this.history[i] - mean;
      varSum += dv * dv;
    }
    const std = m ? Math.sqrt(varSum / m) : 0;
    const z = (flux - mean) / (std + 1e-4);

    // Push current flux into the ring buffer.
    this.history[this.histPtr] = flux;
    this.histPtr = (this.histPtr + 1) % this.history.length;
    if (this.histFilled < this.history.length) this.histFilled++;

    let onset = false;
    if (z > this.zThresh && flux > this.fluxFloor && nowSec - this.lastOnsetSec > this.refractorySec) {
      onset = true;
      this.lastOnsetSec = nowSec;
    }
    const strength = onset ? Math.min(1, 0.3 + (z - this.zThresh) * 0.18 + flux * 2) : 0;
    return { onset, flux, strength };
  }

  reset(): void {
    this.prevL.fill(0);
    this.ema.fill(0);
    this.history.fill(0);
    this.histPtr = 0;
    this.histFilled = 0;
    this.lastOnsetSec = -1;
  }
}
