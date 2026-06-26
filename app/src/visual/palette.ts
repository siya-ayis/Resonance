/**
 * Deterministic emotion -> palette system (the critical-path color source; NO LLM).
 * Named palettes are pre-vetted for contrast/aesthetics. The pipeline picks a
 * palette name per section from valence/arousal; the renderer resolves it here.
 */
export interface Palette {
  name: string;
  /** Background gradient (top, bottom) as 0xRRGGBB. */
  bg: [number, number];
  bass: number;
  drums: number;
  melody: number;
  vocal: number;
}

export const PALETTES: Record<string, Palette> = {
  'cool-muted-indigo': { name: 'cool-muted-indigo', bg: [0x131a36, 0x05060f], bass: 0x3b4ea0, drums: 0x9fb0ff, melody: 0x6fd3c9, vocal: 0xc6d6ff },
  'cool-muted-teal': { name: 'cool-muted-teal', bg: [0x0c2230, 0x040d12], bass: 0x1f7a6e, drums: 0x7fe6d6, melody: 0x86d0ff, vocal: 0xd2fff4 },
  'cold-contrast-violet': { name: 'cold-contrast-violet', bg: [0x1a1030, 0x07030f], bass: 0x5a2ea0, drums: 0xb98cff, melody: 0x7f9bff, vocal: 0xe6d2ff },
  'warm-pastel-peach': { name: 'warm-pastel-peach', bg: [0x2a1c12, 0x140a05], bass: 0xc8884f, drums: 0xffd9a8, melody: 0xffc98f, vocal: 0xfff0dc },
  'vivid-warm-amber': { name: 'vivid-warm-amber', bg: [0x2a1804, 0x140a02], bass: 0xc8741f, drums: 0xffd27f, melody: 0xffae5e, vocal: 0xfff0c2 },
  'vivid-warm-magenta': { name: 'vivid-warm-magenta', bg: [0x2a0726, 0x12030f], bass: 0xc02a86, drums: 0xff7ad6, melody: 0xff5ea8, vocal: 0xffd2f0 },
};

export const DEFAULT_PALETTE = PALETTES['cool-muted-indigo'];

export function resolvePalette(name: string): Palette {
  return PALETTES[name] ?? DEFAULT_PALETTE;
}

/**
 * Deterministic valence/arousal -> palette name. Mirrors the Python pipeline so
 * the renderer can fall back if a manifest omits an explicit palette name.
 */
export function paletteForEmotion(valence: number, arousal: number): string {
  const positive = valence >= 0;
  const intense = arousal >= 0.5;
  if (positive && intense) return 'vivid-warm-magenta';
  if (positive && !intense) return 'warm-pastel-peach';
  if (!positive && intense) return 'cold-contrast-violet';
  return 'cool-muted-indigo';
}

/** Linear interpolate two 0xRRGGBB colors. t in [0,1]. */
export function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Blend two whole palettes (for section cross-fades). */
export function lerpPalette(a: Palette, b: Palette, t: number): Palette {
  return {
    name: `${a.name}->${b.name}`,
    bg: [lerpColor(a.bg[0], b.bg[0], t), lerpColor(a.bg[1], b.bg[1], t)],
    bass: lerpColor(a.bass, b.bass, t),
    drums: lerpColor(a.drums, b.drums, t),
    melody: lerpColor(a.melody, b.melody, t),
    vocal: lerpColor(a.vocal, b.vocal, t),
  };
}

/** Relative luminance 0..1 of a 0xRRGGBB color (for the photosensitivity limiter). */
export function luminance(color: number): number {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
