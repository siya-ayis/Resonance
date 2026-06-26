import { useEffect, useRef, useState } from 'react';
import { PlayController, type PlayState } from '../play/PlayController';
import { INSTRUMENTS } from '../play/instruments';
import type { InstrumentId } from '../audio/Synth';
import type { SharedEngine } from '../SharedEngine';
import { PALETTES } from '../visual/palette';

interface PlayProps {
  engine: SharedEngine;
}

export default function PlayScreen({ engine }: PlayProps) {
  const ctrlRef = useRef<PlayController | null>(null);
  const primedRef = useRef(false);
  const [state, setState] = useState<PlayState | null>(null);
  const palette = PALETTES['vivid-warm-magenta'];

  useEffect(() => {
    const ctrl = new PlayController(engine);
    ctrlRef.current = ctrl;
    ctrl.onState = setState;
    ctrl.start();
    return () => {
      ctrl.destroy();
      ctrlRef.current = null;
    };
  }, [engine]);

  const hit = (id: InstrumentId) => {
    if (!primedRef.current) {
      primedRef.current = true;
      void ctrlRef.current?.prime();
    }
    ctrlRef.current?.press(id, 1);
  };

  // Letter shortcuts (a s d f g h).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const inst = INSTRUMENTS.find((i) => i.key === e.key.toLowerCase());
      if (inst) {
        e.preventDefault();
        hit(inst.id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="screen play">
      <h2 className="sr-only" tabIndex={-1}>
        Play — tap instruments in light and touch
      </h2>

      <header className="overlay top">
        <div className="ai-line">
          <strong>Each pad is an instrument you can feel.</strong> Tap to fire its own light burst
          and its own haptic signature — the same language Resonance uses to translate songs.
        </div>
      </header>

      <div className="overlay pad-area">
        <div className="pad-grid" role="group" aria-label="Instrument pads">
          {INSTRUMENTS.map((inst) => {
            const flash = state?.flashes?.[inst.id] ?? 0;
            const color = hex(palette[inst.swatch]);
            return (
              <button
                key={inst.id}
                className="pad"
                style={{
                  borderColor: color,
                  boxShadow: flash > 0.01 ? `0 0 ${8 + flash * 40}px ${color}` : 'none',
                  background: `rgba(${rgb(palette[inst.swatch])}, ${0.08 + flash * 0.5})`,
                }}
                aria-label={`${inst.label}. ${inst.hint}. Key ${inst.key.toUpperCase()}.`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  hit(inst.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    hit(inst.id);
                  }
                }}
              >
                <span className="pad-label">{inst.label}</span>
                <span className="pad-hint">{inst.hint}</span>
                <span className="pad-key" aria-hidden="true">
                  {inst.key.toUpperCase()}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <footer className="overlay bottom">
        <div className="status">
          <span>haptics: {state?.hapticAvailable ? state.hapticBackend : 'visual proxy'}</span>
          <span>·</span>
          <span>{state?.fps ?? 0} fps</span>
          {!state?.ready && (
            <>
              <span>·</span>
              <span className="status-hint">tap any pad to start sound</span>
            </>
          )}
        </div>
      </footer>
    </div>
  );
}

function hex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}
function rgb(color: number): string {
  return `${(color >> 16) & 0xff},${(color >> 8) & 0xff},${color & 0xff}`;
}
