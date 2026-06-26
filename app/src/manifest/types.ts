import { z } from 'zod';

/**
 * The Experience Manifest is the single data contract between the offline
 * Python pipeline and the on-device renderer. The app renders purely from
 * this document + the audio. Keep this file in sync with shared/manifest.schema.json.
 */

export const StemName = z.enum(['bass', 'drums', 'vocals', 'other']);
export type StemName = z.infer<typeof StemName>;

export const SongMeta = z.object({
  title: z.string(),
  artist: z.string(),
  durationMs: z.number().positive(),
  bpm: z.number().positive(),
  key: z.string().optional(),
});

export const StemRefs = z.object({
  bass: z.string().optional(),
  drums: z.string().optional(),
  vocals: z.string().optional(),
  other: z.string().optional(),
});

export const AudioRefs = z.object({
  master: z.string(),
  stems: StemRefs.optional(),
});

export const GlobalStyle = z.object({
  particleStyle: z.string().default('bubbles+sparks'),
  seed: z.number().int().default(42),
});

/** A musical section (intro / verse / chorus / drop …) carrying emotion + palette. */
export const Section = z.object({
  id: z.number().int(),
  label: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().positive(),
  /** -1 (negative) … +1 (positive) */
  valence: z.number().min(-1).max(1),
  /** 0 (calm) … 1 (intense) */
  arousal: z.number().min(0).max(1),
  /** Named palette key resolved by the deterministic emotion->palette lookup. */
  palette: z.string(),
  /** Clearly-labelled interpretation, never authoritative (ethics rule). */
  meaning: z.string().optional(),
  events: z.array(z.string()).default([]),
});

export const BeatType = z.enum(['kick', 'snare', 'hat', 'beat']);
export type BeatType = z.infer<typeof BeatType>;

export const Beat = z.object({
  tMs: z.number().nonnegative(),
  strength: z.number().min(0).max(1),
  type: BeatType.default('beat'),
});

export const Onset = z.object({
  tMs: z.number().nonnegative(),
  stem: StemName,
  intensity: z.number().min(0).max(1),
});

/** Per-stem intensity frames (normalized 0..1) for organic continuous motion. */
export const Envelopes = z.object({
  frameMs: z.number().positive(),
  bass: z.array(z.number()),
  drums: z.array(z.number()),
  vocals: z.array(z.number()),
  other: z.array(z.number()),
});

export const MelodyNote = z.object({
  tMs: z.number().nonnegative(),
  midi: z.number().int(),
  durMs: z.number().positive(),
});

export const LyricWord = z.object({
  tMs: z.number().nonnegative(),
  w: z.string(),
});

export const LyricLine = z.object({
  tMs: z.number().nonnegative(),
  line: z.string(),
  words: z.array(LyricWord).default([]),
  emotion: z.string().optional(),
});

export const HapticChannel = z.enum(['bass', 'drums', 'vocals', 'other', 'accent']);

/**
 * A precomputed haptic event. `pattern` is on/off milliseconds (Web Vibration
 * style); native backends translate it to Taptic/Vibrator calls. Intensity is
 * advisory (most actuators lack amplitude control — it scales pattern density).
 */
export const HapticEvent = z.object({
  tMs: z.number().nonnegative(),
  pattern: z.array(z.number().nonnegative()).min(1),
  channel: HapticChannel.default('bass'),
  intensity: z.number().min(0).max(1).default(1),
});

export const Manifest = z.object({
  version: z.literal('1.0'),
  song: SongMeta,
  audio: AudioRefs,
  globalStyle: GlobalStyle.default({ particleStyle: 'bubbles+sparks', seed: 42 }),
  sections: z.array(Section).min(1),
  beats: z.array(Beat).default([]),
  onsets: z.array(Onset).default([]),
  envelopes: Envelopes.optional(),
  melody: z.array(MelodyNote).default([]),
  lyrics: z.array(LyricLine).default([]),
  haptics: z.array(HapticEvent).default([]),
});

export type Manifest = z.infer<typeof Manifest>;
export type Section = z.infer<typeof Section>;
export type Beat = z.infer<typeof Beat>;
export type Onset = z.infer<typeof Onset>;
export type MelodyNote = z.infer<typeof MelodyNote>;
export type LyricLine = z.infer<typeof LyricLine>;
export type HapticEvent = z.infer<typeof HapticEvent>;
export type Envelopes = z.infer<typeof Envelopes>;
