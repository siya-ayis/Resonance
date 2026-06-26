import { Application, Container, Ticker } from 'pixi.js';
import { makeAuraTexture, makeRibbonTexture, makeSoftDotTexture } from './ParticlePool';
import { BassOrbs, DrumSparks, EmotionField, HapticProxy, MelodyRibbons, VocalAura } from './layers';
import { DyeFluid } from './DyeFluid';
import { PhotosensitivityLimiter } from './PhotosensitivityLimiter';
import { DEFAULT_PALETTE, lerpPalette, luminance, resolvePalette, type Palette } from './palette';
import { midiToY, noteColor } from './colorEngine';
import type { FrameCtx, Layer } from './types';
import type { BeatType } from '../manifest/types';

export interface VisualEngineOptions {
  /** Supplies broadband energy 0..1 (e.g. AudioEngine.energy). */
  energyProvider?: () => number;
  reducedMotion?: boolean;
}

/**
 * VisualEngine — owns the PIXI Application and the layered scene, runs the
 * render loop, cross-fades palettes per section, enforces the photosensitivity
 * limiter, and adapts particle load to measured FPS. It exposes a small trigger
 * API the sync layer calls when the audio clock crosses manifest events.
 */
export class VisualEngine {
  readonly app = new Application();
  private fx = new Container(); // additive (bright) layers, damped by the limiter
  private field!: EmotionField;
  private dye!: DyeFluid;
  private bass!: BassOrbs;
  private aura!: VocalAura;
  private ribbons!: MelodyRibbons;
  private sparks!: DrumSparks;
  private proxy!: HapticProxy;
  private layers: Layer[] = [];

  private fromPalette: Palette = DEFAULT_PALETTE;
  private toPalette: Palette = DEFAULT_PALETTE;
  private curPalette: Palette = DEFAULT_PALETTE;
  private blendT = 1;
  private readonly blendDur = 1.4;

  private envBass = 0;
  private envDrums = 0;
  private envVocals = 0;
  private intensity = 1;
  private reducedMotion = false;
  private energyProvider: () => number = () => 0;

  private limiter = new PhotosensitivityLimiter();
  private fpsEMA = 60;
  private perfScale = 1;
  private framePhase = 0;
  private inited = false;

  private tick = (ticker: Ticker) => this.onFrame(ticker);

  async init(mount: HTMLElement, opts: VisualEngineOptions = {}): Promise<void> {
    this.energyProvider = opts.energyProvider ?? (() => 0);
    this.reducedMotion = opts.reducedMotion ?? false;

    await this.app.init({
      background: '#05060f',
      resizeTo: mount,
      antialias: true,
      autoDensity: true,
      resolution: Math.min(2, window.devicePixelRatio || 1),
      powerPreference: 'high-performance',
    });
    mount.appendChild(this.app.canvas);

    const dot = makeSoftDotTexture(64);
    this.field = new EmotionField(dot);
    this.dye = new DyeFluid(this.app.renderer, makeAuraTexture(256), 96);
    this.bass = new BassOrbs(dot, 3);
    this.aura = new VocalAura(makeAuraTexture(512));
    this.ribbons = new MelodyRibbons(makeRibbonTexture(128, 32), 8, 28);
    this.sparks = new DrumSparks(dot, 700);
    this.proxy = new HapticProxy(8);

    this.app.stage.addChild(this.field.container, this.dye.container, this.fx);
    this.fx.addChild(
      this.bass.container,
      this.aura.container,
      this.ribbons.container,
      this.sparks.container,
      this.proxy.container,
    );
    this.layers = [this.field, this.dye, this.bass, this.aura, this.ribbons, this.sparks, this.proxy];

    this.resize();
    this.app.renderer.on('resize', () => this.resize());
    this.app.ticker.add(this.tick);
    this.inited = true;
  }

  destroy(): void {
    if (!this.inited) return; // init never completed (e.g. WebGL unavailable) — nothing to tear down
    this.inited = false;
    this.app.ticker.remove(this.tick);
    this.dye.destroy();
    this.app.destroy(true, { children: true, texture: true });
  }

  /* ---- configuration ---- */
  setIntensity(v: number): void {
    this.intensity = Math.max(0, Math.min(1, v));
  }
  setReducedMotion(on: boolean): void {
    this.reducedMotion = on;
  }
  /** Swap the broadband-energy source (FEEL uses decoded audio; SENSE uses the mic). */
  setEnergyProvider(fn: () => number): void {
    this.energyProvider = fn;
  }

  /** Begin a cross-fade to the given section palette. */
  setSectionPalette(name: string, immediate = false): void {
    const target = resolvePalette(name);
    if (immediate) {
      this.fromPalette = this.toPalette = this.curPalette = target;
      this.blendT = 1;
      return;
    }
    this.fromPalette = this.curPalette;
    this.toPalette = target;
    this.blendT = 0;
  }

  /** Continuous per-stem levels sampled from manifest envelopes. */
  setContinuous(bass: number, drums: number, vocals: number): void {
    this.envBass = bass;
    this.envDrums = drums;
    this.envVocals = vocals;
  }

  /* ---- event triggers (called by the sync scheduler) ---- */
  fireBeat(type: BeatType, strength: number): void {
    const { width: w, height: h } = this.app.screen;
    let x: number, y: number;
    if (type === 'kick') {
      x = w / 2;
      y = h * 0.45;
      this.bass.pulseHit(strength);
      // The kick blooms bigger + brighter when the section is energetic, so the
      // drop delivers a full-screen "pump" you can see (and feel via haptics).
      const drive = 1 + this.envBass + this.energyProvider() * 0.6;
      this.dye.inject(w / 2, h * 0.9, this.curPalette.bass, Math.min(w, h) * 0.34 * drive, Math.min(0.85, 0.5 * strength * drive));
    } else if (type === 'snare') {
      x = w * (0.25 + Math.random() * 0.5);
      y = h * 0.4;
      this.dye.inject(x, h * 0.7, this.curPalette.drums, Math.min(w, h) * 0.16, 0.4 * strength);
    } else if (type === 'hat') {
      x = w * (0.1 + Math.random() * 0.8);
      y = h * 0.2;
      this.dye.inject(x, h * 0.3, this.curPalette.drums, Math.min(w, h) * 0.08, 0.28 * strength);
    } else {
      x = w / 2;
      y = h * 0.4;
    }
    this.sparks.burst(x, y, strength, type, this.curPalette.drums, this.intensity * this.perfScale);
  }

  fireBassOnset(intensity: number): void {
    this.bass.pulseHit(intensity);
    const { width: w, height: h } = this.app.screen;
    this.dye.inject(w / 2, h * 0.9, this.curPalette.bass, Math.min(w, h) * 0.3, 0.42 * intensity);
  }

  /** Spawn a melody ribbon for a note (pitch -> y + hue, level -> brightness). */
  fireMelodyNote(midi: number, level = 0.8): void {
    const color = noteColor(midi, level);
    this.ribbons.fireNote(midi, level, color, this.intensity);
    // The note also BLOOMS as flowing dye in its own colour at its pitch height —
    // low notes sink + bloom large, high notes rise + bloom small (redundant cue).
    const { width: w, height: h } = this.app.screen;
    const reg = Math.max(0, Math.min(1, (midi - 45) / 50)); // low..high
    const x = w * (0.3 + Math.random() * 0.4);
    const y = midiToY(midi, h);
    const radius = Math.min(w, h) * (0.26 - reg * 0.12);
    // A soft wide bloom + a bright concentrated core = vivid, readable note colour.
    this.dye.inject(x, y, color, radius, 0.6 + 0.4 * level);
    this.dye.inject(x, y, color, radius * 0.45, 0.8 + 0.2 * level);
  }

  /** Continuous vocal level for the aura (when not driven via setContinuous). */
  setVocal(level: number): void {
    this.envVocals = level;
  }

  /** Fire the on-screen haptic proxy (always, even when no physical buzz). */
  fireHapticProxy(channel: string, intensity: number): void {
    const { width: w, height: h } = this.app.screen;
    const isBass = channel === 'bass' || channel === 'accent';
    const x = isBass ? w / 2 : w * (0.3 + Math.random() * 0.4);
    const y = isBass ? h * 0.82 : h * 0.45;
    const color = isBass ? this.curPalette.bass : this.curPalette.drums;
    this.proxy.ping(x, y, intensity, color, isBass);
  }

  clearTransients(): void {
    this.sparks.clear();
  }

  private resize(): void {
    const { width, height } = this.app.screen;
    for (const l of this.layers) l.resize(width, height);
  }

  private onFrame(ticker: Ticker): void {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    const now = performance.now();

    // Palette cross-fade.
    if (this.blendT < 1) {
      this.blendT = Math.min(1, this.blendT + dt / this.blendDur);
      const e = easeInOut(this.blendT);
      this.curPalette = lerpPalette(this.fromPalette, this.toPalette, e);
    } else {
      this.curPalette = this.toPalette;
    }

    const energy = this.energyProvider();

    // Photosensitivity damp on the additive layers. The dye is the brightest,
    // most transient-driven layer, so fold its injection activity into the
    // estimate AND apply the same damp to it (it lives outside `fx`).
    const brightness =
      luminance(this.curPalette.bass) * 0.35 +
      (this.envBass + this.envDrums) * 0.28 +
      energy * 0.2 +
      this.dye.activity * 0.25;
    const damp = this.limiter.multiplier(brightness, now, dt);
    this.fx.alpha = damp;
    this.dye.setMasterAlpha(damp);

    const ctx: FrameCtx = {
      dt,
      width: this.app.screen.width,
      height: this.app.screen.height,
      energy,
      bass: this.envBass,
      drums: this.envDrums,
      vocals: this.envVocals,
      palette: this.curPalette,
      intensity: this.intensity,
      reducedMotion: this.reducedMotion,
      perfScale: this.perfScale,
    };

    // The water is ALWAYS alive — even in a silent intro or while SENSE waits.
    // Two slow, drifting blooms in the section's colours give a persistent
    // "flowing ink" floor that breathes UP with energy (never a dead-black screen).
    const { width: w, height: h } = this.app.screen;
    const t = now / 1000;
    // Slow "breathing" so even a silent intro visibly swells and recedes like a tide.
    const breath = 0.82 + 0.18 * Math.sin(t * 0.5);
    const flow = (0.055 + energy * 0.14) * breath;
    const span = Math.min(w, h);
    // On FPS-starved phones, inject the ambient floor only every other frame so
    // DyeFluid's idle composite-skip (which needs blobTop===0) can still kick in.
    const ambientFrame = this.perfScale >= 0.7 || (this.framePhase++ & 1) === 0;
    if (ambientFrame) {
      this.dye.inject(
        w * (0.5 + 0.32 * Math.sin(t * 0.27)),
        h * (0.52 + 0.3 * Math.sin(t * 0.19 + 1.3)),
        this.curPalette.vocal,
        span * 0.34,
        flow * this.intensity,
      );
      this.dye.inject(
        w * (0.5 + 0.34 * Math.sin(t * 0.21 + 2.4)),
        h * (0.6 + 0.26 * Math.sin(t * 0.16 + 0.5)),
        this.curPalette.bass,
        span * 0.3,
        flow * 0.85 * this.intensity,
      );
    }
    // Envelope-driven blooms layer on top (louder stems = more, brighter dye).
    if (this.envBass > 0.03)
      this.dye.inject(w * (0.35 + Math.random() * 0.3), h * 0.9, this.curPalette.bass, span * 0.3, this.envBass * 0.16 * this.intensity);
    if (this.envVocals > 0.04)
      this.dye.inject(w * 0.5, h * 0.5, this.curPalette.vocal, span * 0.24, this.envVocals * 0.12 * this.intensity);
    if (this.envDrums > 0.05)
      this.dye.inject(w * (0.2 + Math.random() * 0.6), h * (0.28 + Math.random() * 0.3), this.curPalette.drums, span * 0.13, this.envDrums * 0.1 * this.intensity);

    for (const l of this.layers) l.update(ctx);

    // Adaptive perf: ease an FPS estimate and scale particle load.
    this.fpsEMA += (1000 / Math.max(1, ticker.deltaMS) - this.fpsEMA) * 0.05;
    this.perfScale = this.fpsEMA < 45 ? 0.55 : this.fpsEMA < 55 ? 0.8 : 1;
  }

  get debug(): { fps: number; sparks: number; perfScale: number } {
    return { fps: Math.round(this.fpsEMA), sparks: this.sparks.activeCount, perfScale: this.perfScale };
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}
