import type { SharedEngine } from '../SharedEngine';
import type { VisualEngine } from '../visual/VisualEngine';
import type { HapticEngine } from '../haptics/HapticEngine';
import { Synth, type InstrumentId } from '../audio/Synth';
import { PerformanceVisualizer } from '../play/PerformanceVisualizer';
import { INSTRUMENTS, INSTRUMENT_BY_ID } from '../play/instruments';

export const STEPS = 16;

export interface CreateState {
  playing: boolean;
  bpm: number;
  step: number; // playhead, -1 when stopped
  grid: Record<string, boolean[]>;
  fps: number;
  hapticBackend: string;
  hapticAvailable: boolean;
}

interface QueuedStep {
  step: number;
  time: number;
}

const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD_S = 0.1;

/**
 * CreateController — the CREATE pillar's brain: a 16-step, 6-lane sequencer.
 *
 * Audio is scheduled with the Chris Wilson "Tale of Two Clocks" look-ahead
 * pattern (a setTimeout pump schedules note times slightly ahead on the audio
 * clock). Visuals + haptics are NOT audio-accurate, so each scheduled step is
 * queued and fired from rAF when its audio time arrives — keeping the lights and
 * the buzzes locked to the sound. Every lane reuses the same instrument
 * fingerprints as PLAY, so a loop you build looks/feels like the rest of Resonance.
 */
export class CreateController {
  private readonly visual: VisualEngine;
  private readonly haptics: HapticEngine;
  private readonly synth = new Synth();
  private readonly pv: PerformanceVisualizer;

  readonly lanes = INSTRUMENTS;
  onState?: (s: CreateState) => void;

  private grid: Record<InstrumentId, boolean[]> = {} as Record<InstrumentId, boolean[]>;
  private bpm = 110;
  private playing = false;
  private nextStepTime = 0;
  private nextStep = 0;
  private playhead = -1;
  private queue: QueuedStep[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private raf = 0;
  private last = 0;
  private lastEmit = 0;
  private primed = false;
  private starting = false;

  constructor(private engine: SharedEngine) {
    this.visual = engine.visual;
    this.haptics = engine.haptics;
    this.pv = new PerformanceVisualizer(this.visual, this.haptics);
    for (const inst of INSTRUMENTS) this.grid[inst.id] = new Array(STEPS).fill(false);
    this.loadPreset();
  }

  start(): void {
    this.engine.setEnergyProvider(() => this.pv.energy());
    this.visual.setSectionPalette('cold-contrast-violet', true);
    this.last = performance.now();
    this.startRenderLoop();
    this.emit();
  }

  /* ---- editing ---- */
  toggleCell(id: InstrumentId, step: number): void {
    const lane = this.grid[id];
    if (lane) lane[step] = !lane[step];
    this.emit();
  }

  isOn(id: InstrumentId, step: number): boolean {
    return !!this.grid[id]?.[step];
  }

  setBpm(v: number): void {
    this.bpm = Math.max(60, Math.min(180, Math.round(v)));
    this.emit();
  }

  getBpm(): number {
    return this.bpm;
  }

  clear(): void {
    for (const inst of INSTRUMENTS) this.grid[inst.id].fill(false);
    this.emit();
  }

  /** A pleasant default groove so the grid is never empty on first view. */
  loadPreset(): void {
    const set = (id: InstrumentId, steps: number[]) => {
      this.grid[id].fill(false);
      for (const s of steps) this.grid[id][s] = true;
    };
    set('kick', [0, 4, 8, 12]);
    set('snare', [4, 12]);
    set('hat', [2, 6, 10, 14]);
    set('bass', [0, 8]);
    set('pluck', [6, 14]);
    set('pad', [0]);
    this.emit();
  }

  /* ---- transport ---- */
  async toggle(): Promise<void> {
    if (this.playing) this.stopTransport();
    else await this.play();
  }

  async play(): Promise<void> {
    // Synchronous latch so a double-tap can't start two scheduler chains
    // (which would share this.timer and double-schedule every step).
    if (this.playing || this.starting) return;
    this.starting = true;
    try {
      if (!this.primed) {
        await this.haptics.prime();
        this.primed = true;
      }
      await this.synth.init();
    } finally {
      this.starting = false;
    }
    const ctx = this.synth.ctx;
    if (!ctx) return;
    this.playing = true;
    this.nextStep = 0;
    this.nextStepTime = ctx.currentTime + 0.08;
    this.queue = [];
    this.scheduler();
    this.emit();
  }

  stopTransport(): void {
    this.playing = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.queue = [];
    this.playhead = -1;
    this.haptics.cancel();
    this.emit();
  }

  stop(): void {
    this.stopTransport();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy(): void {
    this.stop();
    this.synth.destroy();
    this.engine.resetScene();
  }

  /* ---- internals ---- */
  private stepDur(): number {
    return 60 / this.bpm / 4; // 16th note
  }

  private scheduler = (): void => {
    const ctx = this.synth.ctx;
    if (!ctx || !this.playing) return;
    while (this.nextStepTime < ctx.currentTime + SCHEDULE_AHEAD_S) {
      this.scheduleStep(this.nextStep, this.nextStepTime);
      this.queue.push({ step: this.nextStep, time: this.nextStepTime });
      this.nextStepTime += this.stepDur();
      this.nextStep = (this.nextStep + 1) % STEPS;
    }
    this.timer = setTimeout(this.scheduler, LOOKAHEAD_MS);
  };

  private scheduleStep(step: number, time: number): void {
    for (const inst of INSTRUMENTS) {
      if (this.grid[inst.id][step]) {
        this.synth.trigger(inst.id, time, 0.92, inst.midi);
      }
    }
  }

  private startRenderLoop(): void {
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
      this.last = now;

      const ctx = this.synth.ctx;
      if (ctx && this.playing) {
        // Fire visuals/haptics for steps whose audio time has arrived.
        while (this.queue.length && this.queue[0].time <= ctx.currentTime + 0.016) {
          const q = this.queue.shift()!;
          this.playhead = q.step;
          for (const inst of INSTRUMENTS) {
            if (this.grid[inst.id][q.step]) this.pv.fire(inst, 0.92);
          }
        }
      }
      this.pv.tick(dt);

      if (now - this.lastEmit >= 60) {
        this.emit();
        this.lastEmit = now;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private snapshotGrid(): Record<string, boolean[]> {
    const out: Record<string, boolean[]> = {};
    for (const inst of INSTRUMENTS) out[inst.id] = this.grid[inst.id].slice();
    return out;
  }

  private emit(): void {
    if (!this.onState) return;
    this.onState({
      playing: this.playing,
      bpm: this.bpm,
      step: this.playhead,
      grid: this.snapshotGrid(),
      fps: this.visual.debug.fps,
      hapticBackend: this.haptics.backendName,
      hapticAvailable: this.haptics.isAvailable,
    });
  }
}

export { INSTRUMENT_BY_ID };
