/**
 * Color Engine — the cross-modal color language.
 *
 * Notes become colour by the SAME principle as a rainbow: we fold a pitch into
 * one octave, stretch that octave across the **visible-light spectrum**
 * (≈400–700 nm) the way the classic "Musical Notes ↔ Colour" chart does
 * (G→red … F→violet), then convert that wavelength to RGB (Dan Bruton's
 * spectral algorithm). The result is then vivified to a fixed high chroma so
 * every one of the 12 notes is a clearly DISTINCT, bright colour — not a wash of
 * pink/orange. Same note = same colour across octaves (a learnable language);
 * octave + loudness only nudge brightness.
 */

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Frequency (Hz) -> fractional MIDI note number (A4=440 -> 69). */
export function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

/* ------------------------------------------------------------------ *
 * Pitch class -> visible-spectrum wavelength
 * ------------------------------------------------------------------ */

/**
 * Position of a pitch class on the spectrum, anchored to the reference chart:
 * G is the long-wavelength (red) end, ascending chromatically to violet.
 * Returns 0 (red end) … 1 (violet end). Octave-invariant.
 */
export function pitchClassSpectralPos(midi: number): number {
  const pc = ((Math.round(midi) % 12) + 12) % 12; // 0..11, C=0
  // Sequence starts at G (pc 7) = red. index 0..11 up the chromatic scale.
  const idx = (pc - 7 + 12) % 12;
  return idx / 12;
}

const LAMBDA_RED = 700; // nm (long wavelength, "G")
const LAMBDA_VIOLET = 410; // nm (short wavelength, near "F#")

/** Pitch class -> wavelength in nm across the visible band. */
export function midiToWavelength(midi: number): number {
  const pos = pitchClassSpectralPos(midi);
  return LAMBDA_RED - pos * (LAMBDA_RED - LAMBDA_VIOLET);
}

/**
 * Wavelength (nm) -> linear RGB in [0,1] (Dan Bruton's widely-used approximation,
 * with intensity roll-off near the ends of the visible range).
 */
export function wavelengthToRgb(nm: number): [number, number, number] {
  let r = 0,
    g = 0,
    b = 0;
  if (nm >= 380 && nm < 440) {
    r = -(nm - 440) / (440 - 380);
    b = 1;
  } else if (nm < 490) {
    g = (nm - 440) / (490 - 440);
    b = 1;
  } else if (nm < 510) {
    g = 1;
    b = -(nm - 510) / (510 - 490);
  } else if (nm < 580) {
    r = (nm - 510) / (580 - 510);
    g = 1;
  } else if (nm < 645) {
    r = 1;
    g = -(nm - 645) / (645 - 580);
  } else if (nm <= 780) {
    r = 1;
  }
  // Intensity falloff at the spectrum edges.
  let f = 1;
  if (nm >= 380 && nm < 420) f = 0.3 + (0.7 * (nm - 380)) / (420 - 380);
  else if (nm > 700 && nm <= 780) f = 0.3 + (0.7 * (780 - nm)) / (780 - 700);
  const gamma = 0.8;
  return [Math.pow(r * f, gamma), Math.pow(g * f, gamma), Math.pow(b * f, gamma)];
}

/* ------------------------------------------------------------------ *
 * HSL helpers (for vivifying spectral colours to a uniform brightness)
 * ------------------------------------------------------------------ */

export function hslToRgbInt(h: number, s: number, l: number): number {
  h = ((h % 360) + 360) % 360;
  s = clamp01(s);
  l = clamp01(l);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const R = Math.round((r + m) * 255);
  const G = Math.round((g + m) * 255);
  const B = Math.round((b + m) * 255);
  return (R << 16) | (G << 8) | B;
}

function rgbToHue(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 1e-6) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) % 360 + 360) % 360;
}

/** Wavelength (nm) -> a vivid hue/lightness colour, for the explanatory spectrum legend bar. */
export function wavelengthColor(nm: number): number {
  const [r, g, b] = wavelengthToRgb(nm);
  return hslToRgbInt(rgbToHue(r, g, b), 0.9, 0.55);
}

/* ------------------------------------------------------------------ *
 * OKLCH -> sRGB  (perceptually-uniform colour, so adjacent semitones are
 * GUARANTEED to look clearly different — raw wavelength RGB is not uniform and
 * crowds blue/violet together. We keep the spectrum's red→violet ORDERING from
 * the reference chart, but space the 12 hues evenly in perceptual hue and add a
 * lightness zig-zag so neighbours differ in both hue and lightness.)
 * ------------------------------------------------------------------ */

function linToSrgb(c: number): number {
  c = c <= 0 ? 0 : c >= 1 ? 1 : c;
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

function oklchToLinear(L: number, C: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH -> packed 0xRRGGBB, reducing chroma until the colour fits the sRGB gamut. */
export function oklchToRgbInt(L: number, C: number, hDeg: number): number {
  let c = C;
  let rgb = oklchToLinear(L, c, hDeg);
  for (let i = 0; i < 12 && (rgb[0] < -0.001 || rgb[1] < -0.001 || rgb[2] < -0.001 || rgb[0] > 1.001 || rgb[1] > 1.001 || rgb[2] > 1.001); i++) {
    c *= 0.9;
    rgb = oklchToLinear(L, c, hDeg);
  }
  const R = Math.round(linToSrgb(rgb[0]) * 255);
  const G = Math.round(linToSrgb(rgb[1]) * 255);
  const B = Math.round(linToSrgb(rgb[2]) * 255);
  return (R << 16) | (G << 8) | B;
}

/**
 * Per-pitch-class perceptual hue (deg) and base lightness. idx 0 = G (red end),
 * walking the spectrum to idx 11 = F# (violet/magenta). The lightness zig-zag
 * pushes adjacent semitones apart so even neighbours never look alike.
 */
function pcHueLight(midi: number): { hue: number; light: number } {
  const idx = (pitchClassOf(midi) - 7 + 12) % 12; // G -> 0
  const hue = 29 + (idx * (360 - 29 - 35)) / 11; // red(29) .. magenta(~325)
  const light = 0.7 + (idx % 2 === 0 ? 0.05 : -0.05);
  return { hue, light };
}

/* ------------------------------------------------------------------ *
 * Public colour API
 * ------------------------------------------------------------------ */

/** Canonical, fixed, vivid colour for a pitch class (used for legends/swatches). */
export function pitchClassColor(midi: number): number {
  const { hue, light } = pcHueLight(midi);
  return oklchToRgbInt(light, 0.15, hue);
}

/**
 * Cross-modal note colour: the HUE is FIXED per pitch class (the learnable
 * language); loudness + octave only lift lightness/chroma a touch so high/loud
 * notes glow a little brighter.
 */
export function noteColor(midi: number, level = 0.8): number {
  const { hue, light } = pcHueLight(midi);
  const octave = clamp01((midi - 36) / 60); // C2..C7 -> 0..1
  const L = clamp01(light + 0.04 * clamp01(level) + 0.04 * octave);
  const C = 0.13 + 0.05 * clamp01(level);
  return oklchToRgbInt(L, C, hue);
}

/** Vertical screen position for a pitch: low notes sink, high notes rise. */
export function midiToY(midi: number, height: number): number {
  const n = clamp01((midi - 45) / 50); // ~A2..B6 mapped into the frame
  return height * (0.82 - n * 0.6);
}

/** Loudness 0..1 -> a size multiplier in [min,max]. */
export function loudnessToScale(level: number, min = 0.6, max = 1.8): number {
  return min + (max - min) * clamp01(level);
}

/* ------------------------------------------------------------------ *
 * Note names — Western + Indian classical swaras
 * ------------------------------------------------------------------ */

export const WESTERN_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

/** 12 swaras relative to a tonic (Sa). Capitals = shuddha/tivra, ♭ = komal. */
export const SWARA_SHORT = [
  'Sa',
  'Re♭',
  'Re',
  'Ga♭',
  'Ga',
  'Ma',
  'Ma♯',
  'Pa',
  'Dha♭',
  'Dha',
  'Ni♭',
  'Ni',
] as const;

export const SWARA_FULL = [
  'Sa',
  'Komal Re',
  'Re',
  'Komal Ga',
  'Ga',
  'Ma',
  'Tivra Ma',
  'Pa',
  'Komal Dha',
  'Dha',
  'Komal Ni',
  'Ni',
] as const;

/** The seven natural (shuddha) swaras, for legends: Sa Re Ga Ma Pa Dha Ni. */
export const SHUDDHA_PC = [0, 2, 4, 5, 7, 9, 11] as const;

export function pitchClassOf(midi: number): number {
  return ((Math.round(midi) % 12) + 12) % 12;
}

export function westernName(midi: number): string {
  const octave = Math.floor(Math.round(midi) / 12) - 1;
  return `${WESTERN_NAMES[pitchClassOf(midi)]}${octave}`;
}

/** Swara label for a note given the tonic's pitch class (Sa). */
export function swaraName(midi: number, tonicPc = 0): string {
  const deg = (pitchClassOf(midi) - tonicPc + 12) % 12;
  return SWARA_SHORT[deg];
}

/** Map a key string like "A minor" / "C# major" to a tonic pitch class. */
export function tonicPcFromKey(key?: string): number {
  if (!key) return 0;
  const m = /^([A-Ga-g])([#b]?)/.exec(key.trim());
  if (!m) return 0;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let pc = base[m[1].toUpperCase()] ?? 0;
  if (m[2] === '#') pc = (pc + 1) % 12;
  else if (m[2] === 'b') pc = (pc + 11) % 12;
  return pc;
}
