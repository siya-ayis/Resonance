import type { HapticBackend, HapticChannel } from '../types';

/**
 * Web Vibration backend — `navigator.vibrate`. Works on Android Chrome/Firefox
 * and desktop Chrome; absent on iOS Safari. There is no amplitude control, so we
 * encode an instrument's "weight" as ON-time + a per-channel floor: bass is the
 * heaviest/longest thud, vocals a smooth swell, drums a sharp tick, accent crisp.
 * Velocity scales the whole thing. This is what makes families feel different.
 */
export class WebVibrationBackend implements HapticBackend {
  readonly name = 'web-vibration';

  available(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
  }

  fire(pattern: number[], intensity: number, channel: HapticChannel = 'bass'): void {
    if (!this.available()) return;
    const i = Math.max(0, Math.min(1, intensity));
    const weight =
      channel === 'bass' ? 1.6 : channel === 'vocals' ? 1.3 : channel === 'accent' ? 0.95 : channel === 'drums' ? 1.0 : 1.15;
    // Floor so even a faint hit is unmistakably felt on coarse phone actuators —
    // bass/vocals need more on-time to read as "heavy/smooth"; a hat stays a tick.
    const floor = channel === 'bass' ? 50 : channel === 'vocals' ? 28 : channel === 'drums' ? 14 : 18;
    const gain = 0.65 + 0.45 * i;
    const scaled = pattern.map((ms, idx) =>
      idx % 2 === 0 ? Math.max(floor, Math.round(ms * gain * weight)) : ms,
    );
    try {
      navigator.vibrate(0); // cancel any in-flight pattern so the new hit is crisp
      navigator.vibrate(scaled);
    } catch {
      /* ignore */
    }
  }
}
