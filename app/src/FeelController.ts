import { AudioEngine } from './audio/AudioEngine';
import type { HapticEngine } from './haptics/HapticEngine';
import type { VisualEngine } from './visual/VisualEngine';
import type { SharedEngine } from './SharedEngine';
import { EventScheduler, SectionTracker } from './sync/Scheduler';
import { loadManifest } from './manifest/loader';
import { pitchClassOf, swaraName, tonicPcFromKey, westernName } from './visual/colorEngine';
import type { Beat, HapticEvent, LyricLine, Manifest, MelodyNote, Section } from './manifest/types';

/** Haptics fire slightly ahead so the actuator has time to spin up (look-ahead). */
const HAPTIC_LEAD_MS = 35;

export interface LyricWordView {
  w: string;
  active: boolean;
}

export interface FeelState {
  loaded: boolean;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  sectionLabel: string;
  sectionMeaning: string;
  sections: Array<{ label: string; startMs: number; endMs: number; palette: string }>;
  sectionIndex: number;
  lyric: string;
  lyricWords: LyricWordView[];
  lyricEmotion: string;
  hapticBackend: string;
  hapticAvailable: boolean;
  fps: number;
  stems: number;
  audioPresent: boolean;
  /** Current melody note readout (shared note-colour language with SENSE). */
  noteSwara: string;
  noteWestern: string;
  notePc: number;
  noteActive: boolean;
}

/**
 * FeelController — the FEEL pillar's brain. Loads + validates a manifest, wires
 * the audio master clock to the SHARED visual + haptic engines through the
 * look-ahead scheduler, and exposes simple transport + a per-frame state
 * callback for the UI. It does NOT own the visual engine (that is shared and
 * persistent); it only drives it while FEEL is the active pillar.
 */
export class FeelController {
  readonly audio = new AudioEngine();
  private readonly visual: VisualEngine;
  private readonly haptics: HapticEngine;

  onState?: (s: FeelState) => void;

  private manifest!: Manifest;
  private beatSched!: EventScheduler<Beat>;
  private hapticSched!: EventScheduler<HapticEvent>;
  private melodySched!: EventScheduler<MelodyNote>;
  private lyricSched!: EventScheduler<LyricLine>;
  private sectionTracker!: SectionTracker<Section>;

  private raf = 0;
  private primed = false;
  private starting = false;
  private audioPresent = false;
  private curLyric: LyricLine | null = null;
  private curSection: Section | null = null;
  private tonicPc = 0;
  private lastMelodyMidi = -1;
  private lastMelodyMs = -1;

  constructor(private engine: SharedEngine) {
    this.visual = engine.visual;
    this.haptics = engine.haptics;
  }

  async load(manifestUrl: string): Promise<void> {
    const { manifest, baseUrl } = await loadManifest(manifestUrl);
    this.manifest = manifest;
    this.tonicPc = tonicPcFromKey(manifest.song.key);

    this.engine.setEnergyProvider(() => this.audio.energy());

    const res = await this.audio.loadAudio(baseUrl, manifest.audio);
    this.audioPresent = res.loaded.length > 0;
    // Silent-clock fallback: with no audio, drive the clock from the manifest duration.
    if (this.audio.durationMs === 0) this.audio.durationMs = manifest.song.durationMs;

    this.buildSchedulers();
    this.curSection = manifest.sections[0];
    this.visual.setSectionPalette(manifest.sections[0].palette, true);
    this.audio.onEnded(() => this.handleEnded());

    this.startLoop();
    this.emit();
  }

  private buildSchedulers(): void {
    const m = this.manifest;
    this.beatSched = new EventScheduler<Beat>(m.beats, (b) => this.visual.fireBeat(b.type, b.strength));
    this.hapticSched = new EventScheduler<HapticEvent>(
      m.haptics,
      (h) => {
        this.haptics.trigger({ pattern: h.pattern, intensity: h.intensity, channel: h.channel });
        this.visual.fireHapticProxy(h.channel, h.intensity);
      },
      HAPTIC_LEAD_MS,
    );
    this.melodySched = new EventScheduler<MelodyNote>(m.melody, (n) => {
      this.visual.fireMelodyNote(n.midi, 0.85);
      this.lastMelodyMidi = n.midi;
      this.lastMelodyMs = this.audio.positionMs();
    });
    this.lyricSched = new EventScheduler<LyricLine>(m.lyrics, (l) => {
      this.curLyric = l;
    });
    this.sectionTracker = new SectionTracker<Section>(m.sections, (s) => {
      this.curSection = s;
      this.visual.setSectionPalette(s.palette);
    });
    const pos = this.audio.positionMs();
    this.beatSched.reset(pos);
    this.hapticSched.reset(pos);
    this.melodySched.reset(pos);
    this.lyricSched.reset(pos);
  }

  /* ---- transport ---- */
  async play(): Promise<void> {
    // Synchronous latch: a fast double-tap must not start two overlapping plays.
    if (this.audio.isPlaying || this.starting) return;
    this.starting = true;
    try {
      if (!this.primed) {
        await this.haptics.prime();
        this.primed = true;
      }
      await this.audio.play();
    } finally {
      this.starting = false;
    }
    this.emit();
  }

  pause(): void {
    this.audio.pause();
    this.haptics.cancel();
    this.emit();
  }

  async toggle(): Promise<void> {
    if (this.audio.isPlaying) this.pause();
    else await this.play();
  }

  seek(ms: number): void {
    this.audio.seek(ms);
    const pos = this.audio.positionMs();
    this.beatSched.reset(pos);
    this.hapticSched.reset(pos);
    this.melodySched.reset(pos);
    this.lyricSched.reset(pos);
    this.sectionTracker.reset(pos);
    this.visual.clearTransients();
    this.haptics.cancel();
    this.emit();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.audio.destroy();
    this.haptics.cancel();
    this.engine.resetScene();
  }

  private startLoop(): void {
    // The engine runs at the display refresh (rAF), but the React UI only needs
    // ~20fps for legible text/seek updates — so we throttle state emission to
    // avoid 60fps re-renders on the phone. Transport changes emit immediately.
    let lastEmit = 0;
    const loop = () => {
      const pos = this.audio.positionMs();
      this.sampleEnvelopes(pos);
      this.beatSched.update(pos);
      this.hapticSched.update(pos);
      this.melodySched.update(pos);
      this.lyricSched.update(pos);
      this.sectionTracker.update(pos);

      // Auto-stop at end-of-song. The audio 'ended' event covers the real-audio
      // path; this also covers silent-clock mode (no audio file), which has none.
      if (this.audio.isPlaying && this.audio.durationMs > 0 && pos >= this.audio.durationMs) {
        this.pause(); // settles position at the end and emits immediately; replayable
      } else {
        const now = performance.now();
        if (now - lastEmit >= 50) {
          this.emit();
          lastEmit = now;
        }
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private sampleEnvelopes(pos: number): void {
    const env = this.manifest.envelopes;
    if (!env) {
      // No envelopes: approximate continuous motion from live analyser energy.
      const e = this.audio.energy();
      this.visual.setContinuous(e, e, e * 0.7);
      return;
    }
    const idx = Math.min(env.bass.length - 1, Math.max(0, Math.floor(pos / env.frameMs)));
    // Modest visual gain so loud sections read as vibrant on a phone screen. The
    // persistent ambient flow (VisualEngine) keeps quiet sections alive; this makes
    // the build/drop genuinely pop. Clamped to keep the photosensitivity limiter happy.
    const g = 1.4;
    this.visual.setContinuous(
      Math.min(1, (env.bass[idx] ?? 0) * g),
      Math.min(1, (env.drums[idx] ?? 0) * g),
      Math.min(1, (env.vocals[idx] ?? 0) * g),
    );
  }

  private handleEnded(): void {
    this.haptics.cancel();
    this.emit();
  }

  /** Word-level kinetic lyric view: words up to the current position are "active". */
  private lyricWordViews(pos: number): { words: LyricWordView[]; line: string } {
    const l = this.curLyric;
    if (!l) return { words: [], line: '' };
    if (!l.words.length) return { words: [], line: l.line };
    return {
      line: l.line,
      words: l.words.map((wd) => ({ w: wd.w, active: pos >= wd.tMs })),
    };
  }

  private emit(): void {
    if (!this.onState) return;
    const dbg = this.visual.debug;
    const pos = this.audio.positionMs();
    const { words, line } = this.lyricWordViews(pos);
    const sections = this.manifest.sections.map((s) => ({
      label: s.label,
      startMs: s.startMs,
      endMs: s.endMs,
      palette: s.palette,
    }));
    const sectionIndex = this.curSection ? this.manifest.sections.indexOf(this.curSection) : -1;
    const noteActive = this.lastMelodyMidi >= 0 && pos - this.lastMelodyMs < 600 && pos >= this.lastMelodyMs;
    this.onState({
      loaded: true,
      playing: this.audio.isPlaying,
      positionMs: pos,
      durationMs: this.audio.durationMs,
      sectionLabel: this.curSection?.label ?? '',
      sectionMeaning: this.curSection?.meaning ?? '',
      sections,
      sectionIndex,
      lyric: line,
      lyricWords: words,
      lyricEmotion: this.curLyric?.emotion ?? '',
      hapticBackend: this.haptics.backendName,
      hapticAvailable: this.haptics.isAvailable,
      fps: dbg.fps,
      stems: this.manifest.audio.stems ? Object.keys(this.manifest.audio.stems).length : 0,
      audioPresent: this.audioPresent,
      noteSwara: noteActive ? swaraName(this.lastMelodyMidi, this.tonicPc) : '',
      noteWestern: noteActive ? westernName(this.lastMelodyMidi) : '',
      notePc: noteActive ? pitchClassOf(this.lastMelodyMidi) : -1,
      noteActive,
    });
  }
}
