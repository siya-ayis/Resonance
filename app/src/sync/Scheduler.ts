/**
 * EventScheduler — fires sorted, timed events as the master clock crosses them.
 *
 * Visuals fire on-crossing (frame granularity < 16ms is imperceptible). Haptics
 * and audio-scheduled events use a small positive `leadMs` so the device/actuator
 * has time to react (look-ahead, per Chris Wilson's "A Tale of Two Clocks").
 *
 * On seek/pause the pointer is repositioned by binary search — O(log n), no replay.
 */
export interface Timed {
  tMs: number;
}

export class EventScheduler<T extends Timed> {
  private ptr = 0;

  constructor(
    private readonly events: readonly T[],
    private readonly onFire: (event: T, positionMs: number) => void,
    private readonly leadMs = 0,
  ) {}

  /** Reposition the pointer to the first event at/after `positionMs` (after a seek). */
  reset(positionMs: number): void {
    this.ptr = firstIndexAtOrAfter(this.events, positionMs);
  }

  /** Call every frame with the current clock position; fires all crossed events. */
  update(positionMs: number): void {
    const threshold = positionMs + this.leadMs;
    while (this.ptr < this.events.length && this.events[this.ptr].tMs <= threshold) {
      this.onFire(this.events[this.ptr], positionMs);
      this.ptr++;
    }
  }

  get remaining(): number {
    return this.events.length - this.ptr;
  }
}

/**
 * SectionTracker — reports the active section index for the current position and
 * emits a callback when the section changes (drives palette cross-fades).
 */
export interface SectionLike {
  startMs: number;
  endMs: number;
}

export class SectionTracker<T extends SectionLike> {
  private current = -1;
  constructor(
    private readonly sections: readonly T[],
    private readonly onChange: (section: T, index: number) => void,
  ) {}

  reset(positionMs: number): void {
    this.current = this.indexAt(positionMs);
    if (this.current >= 0) this.onChange(this.sections[this.current], this.current);
  }

  update(positionMs: number): void {
    const idx = this.indexAt(positionMs);
    if (idx !== this.current && idx >= 0) {
      this.current = idx;
      this.onChange(this.sections[idx], idx);
    }
  }

  private indexAt(positionMs: number): number {
    for (let i = 0; i < this.sections.length; i++) {
      if (positionMs >= this.sections[i].startMs && positionMs < this.sections[i].endMs) return i;
    }
    return this.sections.length ? this.sections.length - 1 : -1;
  }
}

/** Index of the first event whose tMs >= t (binary search; events must be sorted). */
export function firstIndexAtOrAfter<T extends Timed>(events: readonly T[], t: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (events[mid].tMs < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
