import { PILLARS, type PillarId } from './pillars';

interface NavProps {
  active: PillarId;
  onSelect: (id: PillarId) => void;
}

/** Accessible bottom navigation across the pillars. */
export default function Nav({ active, onSelect }: NavProps) {
  return (
    <nav className="nav" aria-label="Resonance sections">
      {PILLARS.map((p) => (
        <button
          key={p.id}
          className={`nav-btn${active === p.id ? ' active' : ''}`}
          aria-current={active === p.id ? 'page' : undefined}
          onClick={() => onSelect(p.id)}
        >
          <span className="nav-glyph" aria-hidden="true">
            {p.glyph}
          </span>
          <span className="nav-label">{p.label}</span>
        </button>
      ))}
    </nav>
  );
}
