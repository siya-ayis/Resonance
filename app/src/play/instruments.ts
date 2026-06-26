import type { InstrumentId } from '../audio/Synth';
import type { HapticChannel } from '../haptics/types';

/** A PLAY/CREATE instrument: synth voice + its visual + haptic "fingerprint". */
export interface Instrument {
  id: InstrumentId;
  label: string;
  /** Which palette colour identifies it (matches the FEEL legend). */
  swatch: 'bass' | 'drums' | 'melody' | 'vocal';
  /** Default pitch for pitched voices (ignored for drums). */
  midi: number;
  /** Web-Vibration-style on/off pattern (the felt signature). */
  hapticPattern: number[];
  hapticChannel: HapticChannel;
  /** Keyboard shortcut for the pad. */
  key: string;
  hint: string;
}

/**
 * The six instruments with their doc §8.3 fingerprints. Each one is a unique
 * COMBINATION of the shared visual primitives (orb / sparks / ribbon / aura),
 * not a bespoke effect — so PLAY looks like the same product as FEEL.
 */
export const INSTRUMENTS: Instrument[] = [
  { id: 'kick', label: 'Kick', swatch: 'bass', midi: 36, hapticPattern: [80], hapticChannel: 'bass', key: 'a', hint: 'Big central thump' },
  { id: 'snare', label: 'Snare', swatch: 'drums', midi: 38, hapticPattern: [30, 40, 30], hapticChannel: 'drums', key: 's', hint: 'Wide spark scatter' },
  { id: 'hat', label: 'Hat', swatch: 'drums', midi: 42, hapticPattern: [22], hapticChannel: 'drums', key: 'd', hint: 'Tiny bright flecks' },
  { id: 'bass', label: 'Bass', swatch: 'bass', midi: 31, hapticPattern: [200], hapticChannel: 'bass', key: 'f', hint: 'Swelling low orb' },
  { id: 'pad', label: 'Pad', swatch: 'vocal', midi: 60, hapticPattern: [40, 60, 40, 60], hapticChannel: 'vocals', key: 'g', hint: 'Expanding aura' },
  { id: 'pluck', label: 'Pluck', swatch: 'melody', midi: 74, hapticPattern: [32], hapticChannel: 'accent', key: 'h', hint: 'Rising ribbon' },
];

export const INSTRUMENT_BY_ID: Record<InstrumentId, Instrument> = Object.fromEntries(
  INSTRUMENTS.map((i) => [i.id, i]),
) as Record<InstrumentId, Instrument>;
