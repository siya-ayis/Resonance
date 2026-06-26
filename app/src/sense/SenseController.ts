import type { SharedEngine } from '../SharedEngine';
import type { VisualEngine } from '../visual/VisualEngine';
import type { HapticEngine } from '../haptics/HapticEngine';
import { LiveAudioEngine, type LiveFeatures } from '../audio/LiveAudioEngine';
import { pitchClassOf, swaraName, westernName } from '../visual/colorEngine';

export type SenseStatus = 'idle' | 'starting' | 'listening' | 'denied' | 'error';

export interface SenseState {
  status: SenseStatus;
  errorMessage: string;
  bass: number;
  mid: number;
  treble: number;
  level: number;
  /** Western note name of the current stable pitch, e.g. "C#4" or "" when unvoiced. */
  note: string;
  /** Swara (Sa Re Ga …) of the current pitch relative to the chosen Sa. */
  swara: string;
  /** Pitch class (0-11) of the current note, for colouring the readout. */
  pc: number;
  /** Whether a stable note is currently held. */
  voiced: boolean;
  /** The chosen tonic (Sa) pitch class. */
  tonicPc: number;
  fps: number;
  hapticBackend: string;
  hapticAvailable: boolean;
}

/**
 * If the mic doesn't come up within this window we stop waiting and show a clear
 * error instead of leaving the button stuck on "Starting…" forever. The in-flight
 * getUserMedia is torn down safely (LiveAudioEngine honours its cancelled flag).
 */
const MIC_TIMEOUT_MS = 12000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new MicTimeoutError()), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

class MicTimeoutError extends Error {
  constructor() {
    super('mic-timeout');
    this.name = 'MicTimeoutError';
  }
}

/**
 * SenseController — the SENSE pillar's brain. Pulls live features from the mic
 * each frame and translates them into the SAME shared visual language + haptics
 * as FEEL: band energy -> continuous motion, onsets -> spark bursts + buzzes,
 * confident pitch -> flowing note-coloured dye + a clearly-distinct haptic per
 * register. No manifest, no recording — purely live.
 */
export class SenseController {
  private readonly visual: VisualEngine;
  private readonly haptics: HapticEngine;
  private readonly live = new LiveAudioEngine();

  onState?: (s: SenseState) => void;

  private raf = 0;
  private status: SenseStatus = 'idle';
  private errorMessage = '';
  private primed = false;

  // Visual note gating (fluid/responsive).
  private lastVisualMs = 0;
  private lastVisualMidi = -1;

  // Stable note for the DISPLAY + haptics (debounced so the label never flickers).
  private candMidi = -1;
  private candCount = 0;
  private stableMidi = -1;
  private stableSinceMs = 0;
  private lastVoicedMs = 0;
  private lastNoteHapticMs = 0;
  private voicedHold = false; // hysteresis latch for the pitch-confidence gate

  private tonicPc = 0; // Sa = C by default; user can re-anchor with setSa()
  private lastEmit = 0;

  constructor(private engine: SharedEngine) {
    this.visual = engine.visual;
    this.haptics = engine.haptics;
  }

  setSensitivity(v: number): void {
    this.live.setSensitivity(v);
  }

  /** Re-anchor Sa to the note currently being heard (tonic calibration). */
  setSa(): void {
    if (this.stableMidi >= 0) {
      this.tonicPc = pitchClassOf(this.stableMidi);
      this.emit();
    }
  }

  setTonicPc(pc: number): void {
    this.tonicPc = ((pc % 12) + 12) % 12;
    this.emit();
  }

  async start(): Promise<void> {
    if (this.status === 'listening' || this.status === 'starting') return;
    this.status = 'starting';
    this.errorMessage = '';
    this.emit();
    try {
      // Acquire the mic IMMEDIATELY in the gesture call stack — do NOT await
      // anything before it (priming haptics first can lose the user gesture and
      // hang the permission prompt). Race a timeout so the UI never sticks.
      const ok = await withTimeout(this.live.start(), MIC_TIMEOUT_MS);
      // If we were torn down while the prompt was open (user navigated away then
      // granted), the engine bailed — do NOT start a zombie rAF loop that would
      // stomp the now-active pillar's visuals.
      if (!ok || this.status !== 'starting') {
        this.live.stop();
        return;
      }
      this.engine.setEnergyProvider(() => this.live.energy());
      this.status = 'listening';
      this.startLoop();
      this.emit();

      // Haptics priming is not gesture-critical for the mic; best-effort, after.
      if (!this.primed) {
        this.primed = true;
        void this.haptics.prime?.().catch(() => {});
      }
    } catch (e) {
      this.live.stop(); // never leave a mic/context live on any failure
      const err = e as DOMException;
      if (err?.name === 'MicTimeoutError') {
        this.status = 'error';
        this.errorMessage =
          "Couldn't reach the microphone. If you opened this inside another app, open the link in Chrome or Safari and allow mic access.";
      } else if (err?.name === 'NotAllowedError' || err?.name === 'SecurityError') {
        this.status = 'denied';
        this.errorMessage = 'Microphone permission was blocked. Allow mic access and try again.';
      } else if (err?.name === 'NotFoundError') {
        this.status = 'error';
        this.errorMessage = 'No microphone was found on this device.';
      } else {
        this.status = 'error';
        this.errorMessage = err?.message ?? 'Could not start the microphone.';
      }
      this.emit();
    }
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.live.stop();
    this.haptics.cancel();
    // Reset from BOTH live states (incl. 'starting' so a cancelled-mid-prompt
    // start() can't be mistaken for still-active).
    if (this.status === 'listening' || this.status === 'starting') this.status = 'idle';
    this.resetNote();
  }

  destroy(): void {
    this.stop();
    this.engine.resetScene();
  }

  private resetNote(): void {
    this.candMidi = -1;
    this.candCount = 0;
    this.stableMidi = -1;
    this.voicedHold = false;
  }

  private startLoop(): void {
    const loop = () => {
      const now = performance.now();
      const f = this.live.analyse(now);
      this.render(f, now);
      if (now - this.lastEmit >= 60) {
        this.emit();
        this.lastEmit = now;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private render(f: LiveFeatures, now: number): void {
    // Continuous motion: bass orbs (bass), drum field (treble), vocal aura (mid).
    this.visual.setContinuous(f.bass, f.treble, f.mid);

    if (f.onset) {
      const bassDom = f.bass >= f.treble && f.bass >= f.mid;
      const trebleDom = f.treble > f.bass && f.treble >= f.mid;
      const type = bassDom ? 'kick' : trebleDom ? 'hat' : 'snare';
      this.visual.fireBeat(type, f.onsetStrength);
      if (bassDom) this.visual.fireBassOnset(f.onsetStrength);

      // Each instrument family gets a DISTINCT rhythmic haptic signature (not just
      // a louder buzz): kick = one long thump, snare = a double tap, hat = a tick.
      const s = f.onsetStrength;
      if (bassDom) {
        this.haptics.trigger({ pattern: [Math.round(70 + s * 120)], intensity: s, channel: 'bass' }, now);
      } else if (trebleDom) {
        this.haptics.trigger({ pattern: [20], intensity: s, channel: 'drums' }, now);
      } else {
        this.haptics.trigger({ pattern: [18, 45, 18], intensity: s, channel: 'drums' }, now);
      }
      this.visual.fireHapticProxy(bassDom ? 'bass' : 'drums', s);
    }

    // ---- pitch -> visuals (responsive) ----
    // Confidence gate with HYSTERESIS: commit at high clarity, but keep holding a
    // note down to a lower clarity so sustained/sung notes don't drop out and
    // flicker back to "listening…". The level floor includes bass so LOW notes
    // (whose energy sits below the mid band) aren't unfairly gated out.
    const level = f.bass + f.mid + f.treble;
    const clarity = f.pitchClarity;
    const hasPitch = f.midi != null && level > 0.06;
    this.voicedHold = hasPitch && (this.voicedHold ? clarity > 0.7 : clarity > 0.85);
    const voiced = this.voicedHold && f.midi != null;
    if (voiced && f.midi != null) {
      const changed = Math.abs(f.midi - this.lastVisualMidi) >= 1;
      if (changed || now - this.lastVisualMs > 150) {
        this.visual.fireMelodyNote(f.midi, Math.max(0.4, f.mid));
        this.lastVisualMs = now;
        this.lastVisualMidi = f.midi;
      }
    }

    // ---- pitch -> stable display + per-note haptic (debounced) ----
    if (voiced && f.midi != null) {
      this.lastVoicedMs = now;
      if (f.midi === this.candMidi) {
        this.candCount++;
      } else {
        this.candMidi = f.midi;
        this.candCount = 1;
      }
      // Commit a note once it has held for a few frames AND the previous one has
      // been shown long enough — kills the per-frame flicker the SME flagged.
      if (
        this.candMidi !== this.stableMidi &&
        this.candCount >= 3 &&
        now - this.stableSinceMs > 200
      ) {
        this.stableMidi = this.candMidi;
        this.stableSinceMs = now;
        this.fireNoteHaptic(this.stableMidi, now);
      }
    } else if (now - this.lastVoicedMs > 350) {
      this.stableMidi = -1;
      this.candMidi = -1;
      this.candCount = 0;
    }
  }

  /**
   * A per-note haptic whose PULSE COUNT encodes register (low=1 long, mid=2,
   * high=3), because phone actuators can't vary amplitude — count is what a hand
   * can actually tell apart. Routed on a low priority + only on note CHANGE so it
   * never fights the bass pulse.
   */
  private fireNoteHaptic(midi: number, now: number): void {
    if (now - this.lastNoteHapticMs < 90) return;
    this.lastNoteHapticMs = now;
    let pattern: number[];
    if (midi < 52) pattern = [90]; // low register: one firm buzz
    else if (midi < 67) pattern = [14, 55, 14]; // mid: double tap
    else pattern = [10, 40, 10, 40, 10]; // high: quick triple tick
    this.haptics.trigger({ pattern, intensity: 0.75, channel: 'vocals' }, now);
    // ALWAYS show a visible note pulse — the felt buzz may be merged away by a
    // simultaneous bass/drum hit, or impossible (iOS Safari has no vibrate), so
    // the on-screen proxy is the guaranteed feedback that "a new note landed".
    this.visual.fireHapticProxy('vocals', 0.6);
  }

  private emit(): void {
    if (!this.onState) return;
    const f = this.live.features$;
    const voiced = this.stableMidi >= 0;
    this.onState({
      status: this.status,
      errorMessage: this.errorMessage,
      bass: f.bass,
      mid: f.mid,
      treble: f.treble,
      level: Math.min(1, (f.bass + f.mid + f.treble) / 2.2),
      note: voiced ? westernName(this.stableMidi) : '',
      swara: voiced ? swaraName(this.stableMidi, this.tonicPc) : '',
      pc: voiced ? pitchClassOf(this.stableMidi) : -1,
      voiced,
      tonicPc: this.tonicPc,
      fps: this.visual.debug.fps,
      hapticBackend: this.haptics.backendName,
      hapticAvailable: this.haptics.isAvailable,
    });
  }
}
