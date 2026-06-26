import type { VisualEngine } from '../visual/VisualEngine';
import type { HapticEngine } from '../haptics/HapticEngine';
import type { Instrument } from './instruments';

/**
 * PerformanceVisualizer — turns instrument hits into the shared visual language
 * for the interactive pillars (PLAY + CREATE). It keeps decaying per-channel
 * levels so an orb keeps glowing / an aura keeps breathing after a tap, then
 * feeds them to the engine each frame via setContinuous. Transients (sparks,
 * ribbons, rings) fire instantly on the hit.
 */
export class PerformanceVisualizer {
  private cBass = 0;
  private cDrums = 0;
  private cVocal = 0;

  constructor(
    private visual: VisualEngine,
    private haptics: HapticEngine,
  ) {}

  /** Fire one instrument's full fingerprint: synth-independent visual + haptic. */
  fire(inst: Instrument, velocity = 1): void {
    const v = Math.max(0.05, Math.min(1, velocity));
    switch (inst.id) {
      case 'kick':
        this.visual.fireBeat('kick', v);
        this.visual.fireBassOnset(v);
        this.cBass = Math.min(1.2, this.cBass + 0.7 * v);
        this.visual.fireHapticProxy('bass', v);
        break;
      case 'snare':
        this.visual.fireBeat('snare', v);
        this.cDrums = Math.min(1, this.cDrums + 0.6 * v);
        this.visual.fireHapticProxy('drums', v);
        break;
      case 'hat':
        this.visual.fireBeat('hat', v * 0.85);
        this.cDrums = Math.min(1, this.cDrums + 0.3 * v);
        this.visual.fireHapticProxy('drums', v * 0.6);
        break;
      case 'bass':
        this.visual.fireBassOnset(v);
        this.visual.fireMelodyNote(inst.midi, v * 0.6);
        this.cBass = Math.min(1.2, this.cBass + 0.9 * v);
        this.visual.fireHapticProxy('bass', v);
        break;
      case 'pad':
        this.visual.fireMelodyNote(inst.midi, v * 0.5);
        this.cVocal = Math.min(1, this.cVocal + 0.85 * v);
        this.visual.fireHapticProxy('vocals', v * 0.8);
        break;
      case 'pluck':
        this.visual.fireMelodyNote(inst.midi, v);
        this.cDrums = Math.min(1, this.cDrums + 0.15 * v);
        this.visual.fireHapticProxy('accent', v);
        break;
    }
    this.haptics.trigger({ pattern: inst.hapticPattern, intensity: v, channel: inst.hapticChannel });
  }

  /** Decay levels and push continuous motion to the engine. Call every frame. */
  tick(dt: number): void {
    this.cBass *= Math.exp(-dt / 0.35);
    this.cDrums *= Math.exp(-dt / 0.18);
    this.cVocal *= Math.exp(-dt / 0.6);
    this.visual.setContinuous(this.cBass, this.cDrums, this.cVocal);
  }

  energy(): number {
    return Math.min(1, Math.max(this.cBass, this.cDrums, this.cVocal));
  }
}
