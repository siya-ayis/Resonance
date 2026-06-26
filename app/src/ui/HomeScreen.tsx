import { PILLARS, type PillarId } from './pillars';
import { PALETTES } from '../visual/palette';

const LEGEND: Array<{ swatch: 'bass' | 'drums' | 'melody' | 'vocal'; glyph: string; label: string }> = [
  { swatch: 'bass', glyph: '●', label: 'Bass — orbs + the buzz you feel' },
  { swatch: 'drums', glyph: '✦', label: 'Drums — spark bursts' },
  { swatch: 'melody', glyph: '〜', label: 'Melody — flowing ribbons' },
  { swatch: 'vocal', glyph: '◎', label: 'Vocals — a glowing aura' },
];

interface HomeProps {
  onSelect: (id: PillarId) => void;
}

/** Landing screen — leads with the one-sentence promise, then the four pillars. */
export default function HomeScreen({ onSelect }: HomeProps) {
  const palette = PALETTES['vivid-warm-magenta'];
  const cards = PILLARS.filter((p) => p.id !== 'home');

  return (
    <div className="screen home" role="region" aria-label="Resonance home">
      <header className="home-hero">
        <p className="home-eyebrow">Resonance</p>
        <h1 className="home-title" tabIndex={-1}>
          We don't visualize music.
          <br />
          We translate it into a language you can <em>feel</em>.
        </h1>
        <p className="home-sub">
          AI splits a song into its instruments, then gives each one its own light and its own
          touch — so music is something you can see and feel, not only hear.
        </p>
      </header>

      <ul className="home-cards" aria-label="Choose an experience">
        {cards.map((p) => (
          <li key={p.id}>
            <button className="home-card" onClick={() => onSelect(p.id)}>
              <span className="home-card-glyph" aria-hidden="true">
                {p.glyph}
              </span>
              <span className="home-card-text">
                <span className="home-card-label">{p.label}</span>
                <span className="home-card-tag">{p.tagline}</span>
              </span>
              <span className="home-card-go" aria-hidden="true">
                →
              </span>
            </button>
          </li>
        ))}
      </ul>

      <div className="home-legend" role="list" aria-label="What each colour means">
        {LEGEND.map((l) => (
          <span className="legend-item" role="listitem" key={l.swatch}>
            <span className="legend-shape" style={{ color: hex(palette[l.swatch]) }} aria-hidden="true">
              {l.glyph}
            </span>
            {l.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function hex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}
