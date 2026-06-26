import { CHANNEL_PRIORITY, type HapticBackend, type HapticHit } from './types';
import { CapacitorHapticBackend } from './backends/CapacitorHapticBackend';
import { WebVibrationBackend } from './backends/WebVibrationBackend';
import { WebViewBridgeHapticBackend } from './backends/WebViewBridgeHapticBackend';

/**
 * HapticEngine — the device-facing haptic layer.
 *
 *  - Auto-selects the best backend (Expo WebView bridge > native Capacitor > web vibration).
 *  - Merges hits that land in the same tiny window into ONE device call,
 *    keeping the highest-priority channel (bass/kick), because a new vibrate()
 *    cancels the previous one.
 *  - Applies the global intensity slider (scales pattern strength).
 *  - `offsetMs` (latency calibration) is applied upstream by the scheduler's
 *    leadMs; here we expose it so the UI can tune per device.
 */
export class HapticEngine {
  private backend: HapticBackend;
  private readonly fallback: WebVibrationBackend;
  private _intensity = 1;
  private _enabled = true;

  // Merge window: collapse hits arriving within this gap into one device call.
  private static readonly MERGE_WINDOW_MS = 24;
  private lastFireAt = -Infinity;
  private lastPriority = -Infinity;

  constructor() {
    const bridge = new WebViewBridgeHapticBackend();
    const native = new CapacitorHapticBackend();
    this.fallback = new WebVibrationBackend();
    // Prefer the Expo WebView bridge (real native haptics incl. iOS), then
    // Capacitor native, then the web Vibration API.
    this.backend = bridge.available() ? bridge : native.available() ? native : this.fallback;
  }

  get backendName(): string {
    return this.backend.name;
  }

  /** Whether a *physical* sensation is possible (false e.g. on iOS Safari web). */
  get isAvailable(): boolean {
    return this._enabled && this.backend.available();
  }

  setIntensity(v: number): void {
    this._intensity = Math.max(0, Math.min(1, v));
  }

  setEnabled(on: boolean): void {
    this._enabled = on;
    if (!on && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(0);
  }

  /** Prime the backend from a user gesture (call on first Play). */
  async prime(): Promise<void> {
    await this.backend.prime?.();
  }

  /**
   * Trigger a haptic hit. Returns true if it was dispatched to the device
   * (false when merged-away or unavailable). The on-screen haptic proxy should
   * fire regardless — it is the visible/iOS-web substitute for the buzz.
   */
  trigger(hit: HapticHit, nowMs = performance.now()): boolean {
    if (!this._enabled || !this.backend.available()) return false;

    const priority = CHANNEL_PRIORITY[hit.channel] ?? 0;
    // If a stronger/equal hit just fired, swallow this one (avoid cancel-stutter).
    if (nowMs - this.lastFireAt < HapticEngine.MERGE_WINDOW_MS && priority <= this.lastPriority) {
      return false;
    }

    const strength = Math.max(0, Math.min(1, hit.intensity)) * this._intensity;
    if (strength <= 0.001) return false;

    this.backend.fire(hit.pattern, strength, hit.channel);
    this.lastFireAt = nowMs;
    this.lastPriority = priority;
    return true;
  }

  /** Stop any in-flight vibration immediately. */
  cancel(): void {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(0);
    // Reach the active backend too (the Expo/native host runs a buzz-train of
    // scheduled impacts that navigator.vibrate(0) can't touch).
    this.backend.cancel?.();
    this.lastFireAt = -Infinity;
    this.lastPriority = -Infinity;
  }
}
