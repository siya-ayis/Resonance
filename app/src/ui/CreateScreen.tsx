import { useEffect, useRef, useState } from 'react';
import { CreateController, type CreateState, STEPS } from '../create/CreateController';
import { INSTRUMENTS } from '../play/instruments';
import type { SharedEngine } from '../SharedEngine';
import { PALETTES } from '../visual/palette';

interface CreateProps {
  engine: SharedEngine;
}

export default function CreateScreen({ engine }: CreateProps) {
  const ctrlRef = useRef<CreateController | null>(null);
  const [state, setState] = useState<CreateState | null>(null);
  const [focus, setFocus] = useState<{ r: number; c: number }>({ r: 0, c: 0 });
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const palette = PALETTES['cold-contrast-violet'];

  useEffect(() => {
    const ctrl = new CreateController(engine);
    ctrlRef.current = ctrl;
    ctrl.onState = setState;
    ctrl.start();
    return () => {
      ctrl.destroy();
      ctrlRef.current = null;
    };
  }, [engine]);

  const moveFocus = (r: number, c: number) => {
    setFocus({ r, c });
    // Roving tabindex: actually move DOM focus to the target cell (updating
    // tabIndex alone does not move keyboard focus).
    cellRefs.current.get(`${r}-${c}`)?.focus();
  };

  const onGridKey = (e: React.KeyboardEvent, r: number, c: number) => {
    let nr = r;
    let nc = c;
    if (e.key === 'ArrowRight') nc = Math.min(STEPS - 1, c + 1);
    else if (e.key === 'ArrowLeft') nc = Math.max(0, c - 1);
    else if (e.key === 'ArrowDown') nr = Math.min(INSTRUMENTS.length - 1, r + 1);
    else if (e.key === 'ArrowUp') nr = Math.max(0, r - 1);
    else if (e.key === 'Home') nc = 0;
    else if (e.key === 'End') nc = STEPS - 1;
    else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      ctrlRef.current?.toggleCell(INSTRUMENTS[r].id, c);
      return;
    } else return;
    e.preventDefault();
    moveFocus(nr, nc);
  };

  const step = state?.step ?? -1;
  const bpm = state?.bpm ?? 110;

  return (
    <div className="screen create">
      <h2 className="sr-only" tabIndex={-1}>
        Create — build a loop you can feel
      </h2>

      <header className="overlay top">
        <div className="ai-line">
          <strong>Build a beat and feel it loop.</strong> Toggle steps; press play. Every lane drives
          the same light + touch as the rest of Resonance.
        </div>
      </header>

      <div className="overlay seq-area">
        <div
          className="seq-grid"
          role="grid"
          aria-label="16 step sequencer"
          aria-rowcount={INSTRUMENTS.length}
          aria-colcount={STEPS}
        >
          {INSTRUMENTS.map((inst, r) => (
            <div className="seq-row" role="row" key={inst.id}>
              <span className="seq-rowlabel" role="rowheader" style={{ color: hex(palette[inst.swatch]) }}>
                {inst.label}
              </span>
              {Array.from({ length: STEPS }).map((_, c) => {
                const on = state?.grid?.[inst.id]?.[c] ?? false;
                const isFocus = focus.r === r && focus.c === c;
                const isBeat = c % 4 === 0;
                return (
                  <button
                    key={c}
                    ref={(el) => {
                      if (el) cellRefs.current.set(`${r}-${c}`, el);
                      else cellRefs.current.delete(`${r}-${c}`);
                    }}
                    role="gridcell"
                    tabIndex={isFocus ? 0 : -1}
                    aria-selected={on}
                    aria-label={`${inst.label} step ${c + 1} ${on ? 'on' : 'off'}`}
                    className={`cell${on ? ' on' : ''}${isBeat ? ' beat' : ''}${step === c ? ' playing' : ''}`}
                    style={on ? { background: hex(palette[inst.swatch]), borderColor: hex(palette[inst.swatch]) } : undefined}
                    onClick={() => {
                      moveFocus(r, c);
                      ctrlRef.current?.toggleCell(inst.id, c);
                    }}
                    onKeyDown={(e) => onGridKey(e, r, c)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <footer className="overlay bottom">
        <div className="transport">
          <button
            className="play-btn"
            onClick={() => ctrlRef.current?.toggle()}
            aria-label={state?.playing ? 'Stop' : 'Play loop'}
          >
            {state?.playing ? '■' : '▶'}
          </button>
          <label className="ctrl">
            Tempo {bpm}
            <input
              type="range"
              min={60}
              max={180}
              step={1}
              value={bpm}
              onChange={(e) => ctrlRef.current?.setBpm(Number(e.target.value))}
              aria-label="Tempo in beats per minute"
              aria-valuetext={`${bpm} BPM`}
            />
          </label>
          <button className="text-btn" onClick={() => ctrlRef.current?.loadPreset()}>
            Preset
          </button>
          <button className="text-btn" onClick={() => ctrlRef.current?.clear()}>
            Clear
          </button>
        </div>
        <div className="status">
          <span>haptics: {state?.hapticAvailable ? state.hapticBackend : 'visual proxy'}</span>
          <span>·</span>
          <span>{state?.fps ?? 0} fps</span>
        </div>
      </footer>
    </div>
  );
}

function hex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}
