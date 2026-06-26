import { VisualEngine } from './visual/VisualEngine';
import { HapticEngine } from './haptics/HapticEngine';

/**
 * SharedEngine — ONE persistent VisualEngine + HapticEngine for the whole app.
 *
 * All four pillars (FEEL / SENSE / PLAY / CREATE) drive this single engine, so we
 * never create or destroy a WebGL context on navigation — the root cause of
 * "too many active WebGL contexts" / context-lost crashes on mobile. The canvas
 * is mounted ONCE by AppShell into a persistent host; each pillar controller
 * attaches as the active driver and detaches (without tearing down the engine)
 * on unmount. This also gives free visual cohesion: every pillar speaks the same
 * visual language through the same layers.
 */
export class SharedEngine {
  readonly visual = new VisualEngine();
  readonly haptics = new HapticEngine();

  private energyProvider: () => number = () => 0;
  private _mounted = false;
  private _intensity = 0.8;
  private _hapticsEnabled = true;

  get mounted(): boolean {
    return this._mounted;
  }

  get reducedMotion(): boolean {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  }

  async mount(host: HTMLElement): Promise<void> {
    if (this._mounted) return;
    const reduced = this.reducedMotion;
    await this.visual.init(host, { energyProvider: () => this.energyProvider(), reducedMotion: reduced });
    this.visual.setReducedMotion(reduced);
    this.visual.setIntensity(this._intensity);
    this._mounted = true;
  }

  /** Swap the broadband-energy source for the active pillar (audio vs mic). */
  setEnergyProvider(fn: () => number): void {
    this.energyProvider = fn;
    this.visual.setEnergyProvider(fn);
  }

  setIntensity(v: number): void {
    this._intensity = Math.max(0, Math.min(1, v));
    this.visual.setIntensity(this._intensity);
    this.haptics.setIntensity(this._intensity);
  }
  get intensity(): number {
    return this._intensity;
  }

  setHapticsEnabled(on: boolean): void {
    this._hapticsEnabled = on;
    this.haptics.setEnabled(on);
  }
  get hapticsEnabled(): boolean {
    return this._hapticsEnabled;
  }

  /** Clear transient visuals + stop any buzz when switching pillars. */
  resetScene(): void {
    this.setEnergyProvider(() => 0);
    this.visual.clearTransients();
    this.visual.setContinuous(0, 0, 0);
    this.visual.setVocal(0);
    this.haptics.cancel();
  }

  destroy(): void {
    this.haptics.cancel();
    this.visual.destroy();
    this._mounted = false;
  }
}

let engineSingleton: SharedEngine | null = null;

/** The one shared engine for the app's lifetime. */
export function getSharedEngine(): SharedEngine {
  return (engineSingleton ??= new SharedEngine());
}

export function disposeSharedEngine(): void {
  engineSingleton?.destroy();
  engineSingleton = null;
}
