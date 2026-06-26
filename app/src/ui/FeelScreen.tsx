import { useEffect, useRef, useState } from 'react';
import { FeelController, type FeelState } from '../FeelController';
import type { SharedEngine } from '../SharedEngine';
import { PALETTES } from '../visual/palette';
import { pitchClassColor } from '../visual/colorEngine';

const MANIFEST_URL = `${import.meta.env.BASE_URL}manifests/song1/manifest.json`;

const LEGEND: Array<{ swatch: 'bass' | 'drums' | 'melody' | 'vocal'; glyph: string; label: string }> = [
  { swatch: 'bass', glyph: '●', label: 'Bass — orbs + buzz' },
  { swatch: 'drums', glyph: '✦', label: 'Drums — sparks' },
  { swatch: 'melody', glyph: '〜', label: 'Melody — ribbons (hue follows pitch)' },
  { swatch: 'vocal', glyph: '◎', label: 'Vocals — aura' },
];

function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

interface FeelProps {
  engine: SharedEngine;
  /** Start playback automatically once the manifest loads (first-run wow). */
  autoStart?: boolean;
}

export default function FeelScreen({ engine, autoStart }: FeelProps) {
  const ctrlRef = useRef<FeelController | null>(null);
  const [state, setState] = useState<FeelState | null>(null);
  const [error, setError] = useState('');
  const [leanIn, setLeanIn] = useState(true);

  useEffect(() => {
    const ctrl = new FeelController(engine);
    ctrlRef.current = ctrl;
    ctrl.onState = setState;
    ctrl
      .load(MANIFEST_URL)
      .then(() => {
        if (autoStart) void ctrl.play();
      })
      .catch((e) => setError(e?.message ?? String(e)));
    return () => {
      ctrl.destroy();
      ctrlRef.current = null;
    };
  }, [engine, autoStart]);

  const pos = state?.positionMs ?? 0;
  const dur = state?.durationMs ?? 1;
  const palette = PALETTES['vivid-warm-magenta'];

  return (
    <div className="screen feel">
      <h2 className="sr-only" tabIndex={-1}>
        Feel — play a song and feel every instrument
      </h2>

      <header className="overlay top">
        <div className="ai-line">
          {state?.audioPresent ? (
            <>
              <strong>AI split this song into {state?.stems ?? 4} instruments</strong> — that's why
              the bass gets its own pulse and the melody its own light. A normal visualizer only sees
              one waveform.
            </>
          ) : (
            <>
              <strong>A baked AI preview</strong> — bass, drums, melody and vocals each get their own
              light and touch. (Audio file lands with the full song; the felt translation is live.)
            </>
          )}
        </div>
        {leanIn && (
          <div className="legend" role="list" aria-label="What each colour means">
            {LEGEND.map((l) => (
              <span className="legend-item" role="listitem" key={l.swatch}>
                <span className="legend-shape" style={{ color: hex(palette[l.swatch]) }} aria-hidden="true">
                  {l.glyph}
                </span>
                {l.label}
              </span>
            ))}
          </div>
        )}
      </header>

      <div className="overlay center">
        {leanIn && state?.sectionLabel && (
          <div className="section-chip">
            {state.sectionLabel}
            {state.sectionMeaning ? ` — ${state.sectionMeaning}` : ''}
          </div>
        )}
        {state?.noteActive && (
          <div className="note-chip" aria-hidden="true" style={{ color: hex(pitchClassColor(60 + state.notePc)) }}>
            <span className="note-chip-swara">{state.noteSwara}</span>
            <span className="note-chip-western">{state.noteWestern}</span>
          </div>
        )}
        {state && (state.lyricWords.length > 0 || state.lyric) && (
          <p className="lyric" aria-hidden="true">
            {state.lyricWords.length > 0 ? (
              state.lyricWords.map((w, i) => (
                <span key={`${state.lyric}-${i}`} className={`word${w.active ? ' active' : ''}`}>
                  {w.w}{' '}
                </span>
              ))
            ) : (
              <span className="word active">{state.lyric}</span>
            )}
          </p>
        )}
        {leanIn && state?.lyricEmotion && (
          <span className="meaning-chip">Resonance's read: {state.lyricEmotion}</span>
        )}
        {/* Screen readers get the line as a whole, not word-by-word. */}
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          {state?.lyric ?? ''}
        </p>
      </div>

      {error && <div className="error-banner" role="alert">{error}</div>}

      <footer className="overlay bottom">
        {state && state.sections.length > 1 && (
          <div className="section-map" role="group" aria-label="Song sections">
            {state.sections.map((s, i) => {
              const widthPct = ((s.endMs - s.startMs) / (state.durationMs || 1)) * 100;
              const active = i === state.sectionIndex;
              return (
                <button
                  key={`${s.label}-${i}`}
                  className={`section-seg${active ? ' active' : ''}`}
                  style={{ width: `${widthPct}%`, background: hex(paletteAccent(s.palette)) }}
                  aria-label={`Jump to ${s.label}${active ? ', current section' : ''}`}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => ctrlRef.current?.seek(s.startMs)}
                >
                  <span className="section-seg-label">{s.label}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="transport">
          <button
            className="play-btn"
            onClick={() => ctrlRef.current?.toggle()}
            aria-label={state?.playing ? 'Pause' : 'Play'}
          >
            {state?.playing ? '❚❚' : '▶'}
          </button>
          <span className="time" aria-hidden="true">{fmt(pos)}</span>
          <input
            className="seek"
            type="range"
            min={0}
            max={dur}
            value={pos}
            step={50}
            onChange={(e) => ctrlRef.current?.seek(Number(e.target.value))}
            aria-label="Seek"
          />
          <span className="time" aria-hidden="true">{fmt(dur)}</span>
        </div>

        <div className="row-between">
          <label className="ctrl toggle">
            <input type="checkbox" checked={leanIn} onChange={(e) => setLeanIn(e.target.checked)} />
            Lean-in labels
          </label>
          <div className="status">
            {leanIn && (
              <>
                <span>haptics: {state?.hapticAvailable ? state.hapticBackend : 'visual proxy'}</span>
                <span>·</span>
                <span>{state?.fps ?? 0} fps</span>
              </>
            )}
            {state && !state.audioPresent && (
              <span className="warn">visual + haptic preview</span>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}

function hex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

function paletteAccent(name: string): number {
  const p = (PALETTES as Record<string, { melody: number } | undefined>)[name];
  return p?.melody ?? PALETTES['vivid-warm-magenta'].melody;
}
