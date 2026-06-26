import { useEffect, useRef, useState } from 'react';
import { SenseController, type SenseState } from '../sense/SenseController';
import type { SharedEngine } from '../SharedEngine';
import { pitchClassColor, SHUDDHA_PC, SWARA_SHORT } from '../visual/colorEngine';

interface SenseProps {
  engine: SharedEngine;
}

const METERS: Array<{ key: 'bass' | 'mid' | 'treble'; label: string; cls: string }> = [
  { key: 'bass', label: 'Bass', cls: 'm-bass' },
  { key: 'mid', label: 'Mid / voice', cls: 'm-mid' },
  { key: 'treble', label: 'Treble', cls: 'm-treble' },
];

function hex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}

export default function SenseScreen({ engine }: SenseProps) {
  const ctrlRef = useRef<SenseController | null>(null);
  const [state, setState] = useState<SenseState | null>(null);
  const [sensitivity, setSensitivity] = useState(1.4);
  const [learn, setLearn] = useState(false);

  useEffect(() => {
    const ctrl = new SenseController(engine);
    ctrlRef.current = ctrl;
    ctrl.onState = setState;
    ctrl.setSensitivity(1.4);
    return () => {
      ctrl.destroy();
      ctrlRef.current = null;
    };
  }, [engine]);

  const status = state?.status ?? 'idle';
  const listening = status === 'listening';
  const tonicPc = state?.tonicPc ?? 0;
  const voiced = !!state?.voiced;
  const noteColor = voiced && state ? hex(pitchClassColor(60 + state.pc)) : '#7f8aa6';

  const onSensitivity = (v: number) => {
    setSensitivity(v);
    ctrlRef.current?.setSensitivity(v);
  };

  return (
    <div className="screen sense">
      <h2 className="sr-only" tabIndex={-1}>
        Sense — translate live sound around you
      </h2>

      <header className="overlay top">
        <div className="ai-line">
          <strong>Sing, hum, or point at a melody.</strong> Each note becomes its own colour you can
          see and a pulse you can feel — live. (Works best on one voice or instrument at a time.)
        </div>
      </header>

      {!listening && (
        <div className="overlay center sense-cta">
          {(status === 'idle' || status === 'starting') && (
            <>
              <button
                className="big-btn"
                onClick={() => ctrlRef.current?.start()}
                disabled={status === 'starting'}
              >
                {status === 'starting' ? 'Starting…' : '🎙  Start listening'}
              </button>
              <p className="privacy">
                Your phone will ask for microphone access. Audio is analysed on-device in real time —
                never recorded, never sent.
              </p>
            </>
          )}
          {(status === 'denied' || status === 'error') && (
            <div className="error-banner" role="alert">
              {state?.errorMessage}
              <div>
                <button className="big-btn small" onClick={() => ctrlRef.current?.start()}>
                  Try again
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {listening && (
        <div className="overlay center note-stage">
          <div className="note-readout" aria-hidden="true">
            <div className="note-swara" style={{ color: noteColor, textShadow: `0 0 48px ${noteColor}` }}>
              {state?.swara || '·'}
            </div>
            <div className="note-western" style={{ color: noteColor }}>
              {state?.note || 'listening…'}
            </div>
          </div>
          {!voiced && (
            <p className="sense-hint" aria-hidden="true">
              🎤 sing or hum a note — watch it light up
            </p>
          )}
          <p className="sr-only" aria-live="polite">
            {voiced ? `Note ${state?.note}, swara ${state?.swara}.` : 'Listening.'}
          </p>

          <div className="swara-ring" role="list" aria-label="Swaras">
            {SHUDDHA_PC.map((deg) => {
              const pc = (tonicPc + deg) % 12;
              const active = voiced && state ? ((state.pc - tonicPc + 12) % 12) === deg : false;
              const c = hex(pitchClassColor(60 + pc));
              return (
                <span
                  key={deg}
                  role="listitem"
                  className={`swara-chip${active ? ' active' : ''}`}
                  style={{ '--c': c } as React.CSSProperties}
                >
                  {SWARA_SHORT[deg]}
                </span>
              );
            })}
          </div>
        </div>
      )}

      <footer className="overlay bottom">
        {listening && learn && (
          <div className="meters" aria-hidden="true">
            {METERS.map((m) => (
              <div className="meter" key={m.key}>
                <div className="meter-track">
                  <div
                    className={`meter-fill ${m.cls}`}
                    style={{ height: `${Math.round((state?.[m.key] ?? 0) * 100)}%` }}
                  />
                </div>
                <span className="meter-label">{m.label}</span>
              </div>
            ))}
          </div>
        )}

        {listening && (
          <div className="sense-controls">
            <button className="big-btn small" onClick={() => ctrlRef.current?.stop()}>
              ■ Stop
            </button>
            <button
              className="big-btn small ghost"
              onClick={() => ctrlRef.current?.setSa()}
              disabled={!voiced}
              title="Make the note you're hearing the home note (Sa), so the swaras line up to your key"
            >
              ⌂ Set Sa{voiced && state?.swara ? ` (now ${state.swara})` : ''}
            </button>
            <label className="ctrl toggle">
              <input type="checkbox" checked={learn} onChange={(e) => setLearn(e.target.checked)} />
              Learn mode
            </label>
          </div>
        )}

        {listening && learn && (
          <div className="row-between">
            <label className="ctrl">
              Sensitivity
              <input
                type="range"
                min={0.5}
                max={3}
                step={0.05}
                value={sensitivity}
                onChange={(e) => onSensitivity(Number(e.target.value))}
                aria-label="Microphone sensitivity"
              />
            </label>
            <div className="status">
              <span>haptics: {state?.hapticAvailable ? state.hapticBackend : 'visual proxy'}</span>
              <span>·</span>
              <span>{state?.fps ?? 0} fps</span>
            </div>
          </div>
        )}
      </footer>
    </div>
  );
}
