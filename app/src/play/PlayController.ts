import type { SharedEngine } from '../SharedEngine';
import type { VisualEngine } from '../visual/VisualEngine';
import type { HapticEngine } from '../haptics/HapticEngine';
import { Synth, type InstrumentId } from '../audio/Synth';
import { PerformanceVisualizer } from './PerformanceVisualizer';
import { INSTRUMENT_BY_ID } from './instruments';

export interface PlayState {
  ready: boolean;
  fps: number;
  hapticBackend: string;
  hapticAvailable: boolean;
  /** Per-instrument flash 0..1 for the pad UI (decays in the loop). */
  flashes: Record<string, number>;
}

/**
 * PlayController — the PLAY pillar's brain. A press triggers the instrument's
 * synth voice AND its shared visual + haptic fingerprint. Audio + visuals are
 * decoupled (visuals never wait on audio), so the felt/seen response stays
 * instant even before the AudioContext warms up.
 */
export class PlayController {
  private readonly visual: VisualEngine;
  private readonly haptics: HapticEngine;
  private readonly synth = new Synth();
  private readonly pv: PerformanceVisualizer;

  onState?: (s: PlayState) => void;

  private raf = 0;
  private last = 0;
  private lastEmit = 0;
  private ready = false;
  private flashes: Record<string, number> = {};
  private primed = false;

  constructor(private engine: SharedEngine) {
    this.visual = engine.visual;
    this.haptics = engine.haptics;
    this.pv = new PerformanceVisualizer(this.visual, this.haptics);
  }

  async start(): Promise<void> {
    this.engine.setEnergyProvider(() => this.pv.energy());
    this.visual.setSectionPalette('vivid-warm-magenta', true);
    this.last = performance.now();
    this.startLoop();
    this.emit();
  }

  /** Warm up audio + haptics from the first user gesture. */
  async prime(): Promise<void> {
    if (!this.primed) {
      await this.haptics.prime();
      this.primed = true;
    }
    await this.synth.init();
    this.ready = this.synth.ready;
    this.emit();
  }

  press(id: InstrumentId, velocity = 1): void {
    const inst = INSTRUMENT_BY_ID[id];
    if (!inst) return;
    // Fire visuals/haptics immediately; warm audio lazily (non-blocking).
    this.pv.fire(inst, velocity);
    this.flashes[id] = 1;
    if (this.synth.ready) {
      this.synth.trigger(id, undefined, velocity, inst.midi);
    } else {
      void this.synth.init().then(() => {
        this.ready = this.synth.ready;
        this.synth.trigger(id, undefined, velocity, inst.midi);
      });
    }
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  destroy(): void {
    this.stop();
    this.synth.destroy();
    this.haptics.cancel();
    this.engine.resetScene();
  }

  private startLoop(): void {
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, Math.max(0.001, (now - this.last) / 1000));
      this.last = now;
      this.pv.tick(dt);
      for (const k of Object.keys(this.flashes)) {
        this.flashes[k] = Math.max(0, this.flashes[k] - dt * 3.2);
      }
      if (now - this.lastEmit >= 60) {
        this.emit();
        this.lastEmit = now;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private emit(): void {
    if (!this.onState) return;
    this.onState({
      ready: this.ready,
      fps: this.visual.debug.fps,
      hapticBackend: this.haptics.backendName,
      hapticAvailable: this.haptics.isAvailable,
      flashes: { ...this.flashes },
    });
  }
}
