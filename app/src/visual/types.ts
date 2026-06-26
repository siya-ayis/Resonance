import type { Container } from 'pixi.js';
import type { Palette } from './palette';

/** Per-frame context handed to every layer. */
export interface FrameCtx {
  dt: number; // seconds since last frame
  width: number;
  height: number;
  energy: number; // broadband analyser energy 0..1
  bass: number; // bass envelope 0..1
  drums: number; // drums envelope 0..1
  vocals: number; // vocals envelope 0..1
  palette: Palette; // current (possibly cross-faded) palette
  intensity: number; // global motion intensity from the slider 0..1
  reducedMotion: boolean;
  perfScale: number; // adaptive load scaler from measured FPS (1 = full, <1 = ease off)
}

export interface Layer {
  container: Container;
  resize(width: number, height: number): void;
  update(ctx: FrameCtx): void;
}
