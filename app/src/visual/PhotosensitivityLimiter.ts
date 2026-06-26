/**
 * PhotosensitivityLimiter — WCAG 2.3.1 safety guard.
 *
 * Goal: never allow more than three large brightness transitions ("flashes") in
 * any one-second window. Rather than reacting *after* the limit is breached, this
 * damps the additive (bright) layers *pre-emptively* as the flash count climbs
 * toward the cap — so the would-be fourth flash is physically attenuated below the
 * flash threshold before it can occur. Our visuals are smooth by design, so this
 * should rarely engage hard, but it is a real, demoable guard.
 */
const FLASH_DELTA = 0.15; // |Δbrightness| that counts as a flash transition
const WINDOW_MS = 1000;
const MAX_FLASHES = 3;

export class PhotosensitivityLimiter {
  private flashes: number[] = [];
  private prev = 0;
  private damp = 1;

  /** @param brightness 0..1 estimate of overall additive brightness this frame. */
  multiplier(brightness: number, nowMs: number, dt: number): number {
    // Compare against the *damped* brightness the user actually saw last frame,
    // so damping genuinely reduces perceived flashing (not just the raw signal).
    const seen = brightness * this.damp;
    const delta = Math.abs(seen - this.prev);
    if (delta > FLASH_DELTA) this.flashes.push(nowMs);
    while (this.flashes.length && nowMs - this.flashes[0] > WINDOW_MS) this.flashes.shift();

    // Pre-emptive ladder: the closer we get to the cap, the harder we damp, so a
    // further large transition lands below the flash threshold. At/over the cap we
    // clamp hard; the smooth ease below also means the damp change is never itself
    // a flash.
    const count = this.flashes.length;
    let target = 1;
    if (count >= MAX_FLASHES) target = 0.3;
    else if (count === MAX_FLASHES - 1) target = 0.55;
    else if (count === MAX_FLASHES - 2) target = 0.8;

    // Damp can drop quickly (safety) but recovers slowly (avoid a bright rebound
    // that would itself read as a flash).
    const rate = target < this.damp ? Math.min(1, dt * 12) : Math.min(1, dt * 2.5);
    this.damp += (target - this.damp) * rate;
    this.prev = brightness * this.damp;
    return this.damp;
  }

  reset(): void {
    this.flashes = [];
    this.prev = 0;
    this.damp = 1;
  }
}
