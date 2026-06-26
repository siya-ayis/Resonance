/** Shared haptics types. A `pattern` is on/off milliseconds (Web Vibration style). */
export type HapticChannel = 'bass' | 'drums' | 'vocals' | 'other' | 'accent';

export interface HapticHit {
  pattern: number[];
  /** 0..1 advisory strength; most actuators lack amplitude, so backends may map it to density/style. */
  intensity: number;
  channel: HapticChannel;
}

export interface HapticBackend {
  readonly name: string;
  /** True when this backend can actually produce a physical sensation now. */
  available(): boolean;
  /** Fire one merged pattern. `intensity` is the already-scaled 0..1 strength. */
  fire(pattern: number[], intensity: number, channel?: HapticChannel): void;
  /** Optional warm-up from a user gesture (some platforms need it). */
  prime?(): void | Promise<void>;
  /** Optional: stop any in-flight buzz-train / scheduled impacts immediately. */
  cancel?(): void;
}

/** Channel priority when two haptic events collide on one tick — bass wins (the hero feel). */
export const CHANNEL_PRIORITY: Record<HapticChannel, number> = {
  bass: 4,
  drums: 3,
  accent: 2,
  vocals: 1,
  other: 0,
};
