import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import type { HapticBackend } from '../types';

/**
 * Capacitor backend — real native haptics on iOS (Taptic) and Android (Vibrator).
 *
 * iOS exposes discrete impact styles (Light/Medium/Heavy), not continuous
 * amplitude, so we map a manifest `pattern` to a sequence of timed impacts and
 * simulate a sustained "rumble" (e.g. long bass) as a rapid buzz-train of light
 * impacts. This is the only web-reachable path to felt haptics on iPhone.
 */
export class CapacitorHapticBackend implements HapticBackend {
  readonly name = 'capacitor-native';
  private timers: number[] = [];

  available(): boolean {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Haptics');
  }

  async prime(): Promise<void> {
    if (!this.available()) return;
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch {
      /* ignore */
    }
  }

  fire(pattern: number[], intensity: number): void {
    if (!this.available()) return;
    // Only a SUSTAINED rumble replaces what's playing; discrete note patterns are
    // left to finish so an overlapping hit can't truncate the register cue.
    const total = onDuration(pattern);
    if (total >= 180) this.clearTimers();
    let offset = 0;
    for (let i = 0; i < pattern.length; i++) {
      const ms = pattern[i];
      if (i % 2 === 0) this.scheduleSegment(offset, ms, intensity);
      offset += ms;
    }
  }

  /** Stop any scheduled impacts immediately (Pause/Stop). */
  cancel(): void {
    this.clearTimers();
  }

  private scheduleSegment(offsetMs: number, durMs: number, intensity: number): void {
    if (durMs >= 180) {
      // Sustained rumble → buzz-train of light impacts (no continuous amplitude on this path).
      const step = 35;
      for (let o = 0; o < durMs; o += step) {
        this.at(offsetMs + o, () => this.impact(ImpactStyle.Light));
      }
    } else {
      const style = this.styleFor(durMs, intensity);
      this.at(offsetMs, () => this.impact(style));
    }
  }

  private styleFor(durMs: number, intensity: number): ImpactStyle {
    const score = (durMs >= 100 ? 2 : durMs >= 50 ? 1 : 0) + (intensity >= 0.8 ? 1 : 0);
    if (score >= 3) return ImpactStyle.Heavy;
    if (score >= 1) return ImpactStyle.Medium;
    return ImpactStyle.Light;
  }

  private impact(style: ImpactStyle): void {
    Haptics.impact({ style }).catch(() => {});
  }

  private at(delayMs: number, fn: () => void): void {
    const id = window.setTimeout(() => {
      fn();
      this.timers = this.timers.filter((h) => h !== id);
    }, Math.max(0, delayMs));
    this.timers.push(id);
  }

  private clearTimers(): void {
    for (const id of this.timers) window.clearTimeout(id);
    this.timers = [];
  }
}

/** Total "on" milliseconds in a Web-Vibration-style pattern (even indices = on). */
function onDuration(pattern: number[]): number {
  let sum = 0;
  for (let i = 0; i < pattern.length; i += 2) sum += pattern[i];
  return sum;
}
