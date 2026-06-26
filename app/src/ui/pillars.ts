export type PillarId = 'home' | 'feel' | 'sense' | 'play' | 'create';

export interface PillarMeta {
  id: PillarId;
  label: string;
  /** One-line promise shown on the home cards + nav. */
  tagline: string;
  /** Decorative glyph (aria-hidden). */
  glyph: string;
}

export const PILLARS: PillarMeta[] = [
  { id: 'home', label: 'Home', tagline: 'Music you can see and feel', glyph: '◉' },
  { id: 'feel', label: 'Feel', tagline: 'Play a song — feel every instrument', glyph: '♥' },
  { id: 'sense', label: 'Sense', tagline: 'Translate live sound around you', glyph: '🎙' },
  { id: 'play', label: 'Play', tagline: 'Tap instruments in light + touch', glyph: '⬢' },
  { id: 'create', label: 'Create', tagline: 'Build a loop you can feel', glyph: '⊞' },
];

export const PILLAR_BY_ID: Record<PillarId, PillarMeta> = Object.fromEntries(
  PILLARS.map((p) => [p.id, p]),
) as Record<PillarId, PillarMeta>;
