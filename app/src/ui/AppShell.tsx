import { useEffect, useRef, useState } from 'react';
import { getSharedEngine, disposeSharedEngine } from '../SharedEngine';
import Nav from './Nav';
import GlobalControls from './GlobalControls';
import HomeScreen from './HomeScreen';
import FeelScreen from './FeelScreen';
import SenseScreen from './SenseScreen';
import PlayScreen from './PlayScreen';
import CreateScreen from './CreateScreen';
import type { PillarId } from './pillars';

/**
 * AppShell — the persistent frame around all four pillars.
 *
 *  - Mounts the ONE shared VisualEngine into a persistent canvas host (so we
 *    never churn WebGL contexts on navigation).
 *  - Owns the cross-pillar chrome: global intensity + haptics toggle, the nav,
 *    and a first-run "Start" gate (a user gesture that unlocks audio/haptics and
 *    lets judges in with zero setup).
 *  - Moves focus to each screen's heading on navigation (screen-reader friendly).
 */
export default function AppShell() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef(getSharedEngine());
  const [ready, setReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [pillar, setPillar] = useState<PillarId>('home');
  const [intensity, setIntensity] = useState(0.8);
  const [hapticsOn, setHapticsOn] = useState(true);
  const [fatal, setFatal] = useState('');
  const [autoFeel, setAutoFeel] = useState(false);

  useEffect(() => {
    const engine = engineRef.current;
    let cancelled = false;
    engine
      .mount(hostRef.current!)
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((e) => setFatal(e?.message ?? 'Could not start the graphics engine (WebGL).'));
    return () => {
      cancelled = true;
      disposeSharedEngine();
    };
  }, []);

  // Move focus to the active screen's heading on navigation.
  useEffect(() => {
    if (!started || !ready) return;
    const el = document.querySelector<HTMLElement>('.screen-host h1, .screen-host h2');
    el?.focus();
  }, [pillar, started, ready]);

  const onIntensity = (v: number) => {
    setIntensity(v);
    engineRef.current.setIntensity(v);
  };
  const onHaptics = (on: boolean) => {
    setHapticsOn(on);
    engineRef.current.setHapticsEnabled(on);
  };

  // Manual navigation never auto-plays; only the first-run Start gate does.
  const goTo = (id: PillarId) => {
    setAutoFeel(false);
    setPillar(id);
  };

  const begin = () => {
    const engine = engineRef.current;
    engine.setIntensity(intensity);
    engine.setHapticsEnabled(hapticsOn);
    // Drop the visitor straight into a playing FEEL demo — immediate sight+touch
    // proof in the first second, instead of a static menu.
    setAutoFeel(true);
    setPillar('feel');
    setStarted(true);
  };

  const engine = engineRef.current;

  return (
    <div className="app-root">
      <div className="canvas-host" ref={hostRef} aria-hidden="true" />

      {fatal && (
        <div className="error-banner" role="alert">
          {fatal}
        </div>
      )}

      {!started && !fatal && <StartGate onStart={begin} ready={ready} />}

      {started && ready && (
        <>
          <GlobalControls
            intensity={intensity}
            onIntensity={onIntensity}
            hapticsOn={hapticsOn}
            onHaptics={onHaptics}
          />
          <main className="screen-host">
            {pillar === 'home' && <HomeScreen onSelect={goTo} />}
            {pillar === 'feel' && <FeelScreen engine={engine} autoStart={autoFeel} />}
            {pillar === 'sense' && <SenseScreen engine={engine} />}
            {pillar === 'play' && <PlayScreen engine={engine} />}
            {pillar === 'create' && <CreateScreen engine={engine} />}
          </main>
          <Nav active={pillar} onSelect={goTo} />
        </>
      )}
    </div>
  );
}

function StartGate({ onStart, ready }: { onStart: () => void; ready: boolean }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (ready) btnRef.current?.focus();
  }, [ready]);
  return (
    <div className="start-gate" role="dialog" aria-modal="true" aria-label="Welcome to Resonance">
      <div className="start-card">
        <p className="home-eyebrow">Resonance</p>
        <h1 className="start-title">Music you can see and feel</h1>
        <p className="start-sub">
          Headphones or speakers optional — this experience lives in light and touch. Turn your
          volume up if you'd like sound too.
        </p>
        <button ref={btnRef} className="big-btn" onClick={onStart} disabled={!ready}>
          {ready ? 'Feel the demo song' : 'Loading…'}
        </button>
        <p className="privacy">Works offline. Live audio (Sense) is analysed on-device only.</p>
      </div>
    </div>
  );
}
