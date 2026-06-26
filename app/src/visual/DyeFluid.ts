import { BlurFilter, Container, RenderTexture, Sprite } from 'pixi.js';
import type { Renderer, Texture } from 'pixi.js';
import { clamp01 } from './colorEngine';
import type { FrameCtx, Layer } from './types';

/**
 * DyeFluid — the hero "ink in water" background.
 *
 * Instead of a heavy GPU fluid simulation (a second WebGL context + shader-compile
 * risk on phones) we use a cheap, rock-solid **render-texture feedback loop** that
 * reads like flowing dye:
 *   1. each frame the previous frame is redrawn into a fresh low-res texture,
 *      lifted upward a touch (buoyancy), swayed sideways, gently scaled out and
 *      blurred (diffusion), and multiplied down (decay);
 *   2. new note-coloured dye blobs are added on top (additive);
 *   3. the result is shown full-screen with additive blending so the colours glow.
 *
 * The net effect: a struck note blooms in its colour, then drifts, spreads, and
 * fades like ink dropped in water — at a guaranteed 60fps inside the single
 * existing PIXI context.
 */
export class DyeFluid implements Layer {
  readonly container = new Container();
  private display: Sprite; // what the user sees (shows the front texture)
  private feedback: Sprite; // previous frame, transformed for advection
  private scratch = new Container(); // offscreen compose target tree (feedback + blobs)
  private blur = new BlurFilter({ strength: 1, quality: 1 });

  private rtA!: RenderTexture;
  private rtB!: RenderTexture;
  private blobs: Sprite[] = [];
  private blobTop = 0; // how many blobs are armed for this frame
  private rtW = 2;
  private rtH = 2;
  private scale = 0.5; // texture resolution vs screen
  private sway = 0;
  private master = 1; // overall opacity, driven by the photosensitivity limiter
  private injLoad = 0; // recent dye-injection energy (feeds the brightness guard)
  private filtered = true; // whether the blur filter is currently attached
  private skipPhase = 0; // alternate-frame skip counter for the low-FPS budget

  constructor(
    private renderer: Renderer,
    private blobTex: Texture,
    capacity = 64,
  ) {
    this.display = new Sprite();
    this.display.blendMode = 'add';
    this.container.addChild(this.display);

    this.feedback = new Sprite();
    this.feedback.anchor.set(0.5);
    this.feedback.filters = [this.blur];
    this.scratch.addChild(this.feedback);

    for (let i = 0; i < capacity; i++) {
      const s = new Sprite(this.blobTex);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.visible = false;
      this.scratch.addChild(s);
      this.blobs.push(s);
    }
  }

  /**
   * Drop dye into the field. (x,y) are in screen px; the colour is the note's
   * colour; radius/strength scale the bloom. Baked into the texture next frame.
   */
  inject(x: number, y: number, color: number, radius: number, strength: number): void {
    const s = this.blobs[this.blobTop];
    if (!s) return; // pool exhausted this frame — drop silently
    this.blobTop++;
    s.visible = true;
    s.x = x * this.scale;
    s.y = y * this.scale;
    s.tint = color;
    s.alpha = clamp01(strength);
    const d = (radius * 2 * this.scale) / this.blobTex.width;
    s.scale.set(d);
    this.injLoad = Math.min(3, this.injLoad + clamp01(strength));
  }

  /** Overall opacity of the dye, multiplied by the photosensitivity limiter's damp. */
  setMasterAlpha(a: number): void {
    this.master = clamp01(a);
  }

  /** 0..1 estimate of how much bright dye is being injected (for the brightness guard). */
  get activity(): number {
    return Math.min(1, this.injLoad);
  }

  resize(w: number, h: number): void {
    if (w < 2 || h < 2) return;
    const cap = 768; // cap the long edge so big screens stay cheap
    const long = Math.max(w, h);
    this.scale = Math.min(0.5, cap / long);
    this.rtW = Math.max(2, Math.round(w * this.scale));
    this.rtH = Math.max(2, Math.round(h * this.scale));
    this.rtA?.destroy(true);
    this.rtB?.destroy(true);
    this.rtA = RenderTexture.create({ width: this.rtW, height: this.rtH, resolution: 1 });
    this.rtB = RenderTexture.create({ width: this.rtW, height: this.rtH, resolution: 1 });
    this.display.texture = this.rtA;
    this.display.scale.set(1 / this.scale);
    this.display.position.set(0, 0);
    this.feedback.texture = this.rtA;
  }

  update(ctx: FrameCtx): void {
    if (!this.rtA) return;
    const rm = ctx.reducedMotion;
    // The limiter's damp gates the dye's opacity so this (the brightest, most
    // transient-driven layer) is covered by the WCAG 2.3.1 flash guard too.
    this.display.alpha = this.master;
    this.injLoad *= 0.9; // decay the injection-energy estimate

    // Low-FPS budget: skip the costly feedback+blur composite on alternate IDLE
    // frames (nothing new to bake), roughly halving the dye's cost when starved.
    if (ctx.perfScale < 0.7 && this.blobTop === 0 && (this.skipPhase++ & 1)) return;

    // Advection of the previous frame: lift (buoyancy), sway, spread, decay.
    this.feedback.texture = this.rtA;
    const buoy = rm ? 0 : 2.2 * (0.6 + ctx.intensity); // px (texture space) upward
    this.sway += ctx.dt * 0.6;
    const swayX = rm ? 0 : Math.sin(this.sway) * 0.7 * ctx.intensity;
    this.feedback.position.set(this.rtW / 2 + swayX, this.rtH / 2 - buoy);
    const spread = rm ? 1 : 1.006 + ctx.energy * 0.005;
    this.feedback.scale.set(spread);
    this.feedback.alpha = rm ? 0.992 : 0.985; // dye half-life ~0.8s (caps additive build-up)
    // Blur is the priciest step on weak GPUs — ease it off when FPS drops, and
    // DETACH the filter entirely when it would be a no-op (a 0-strength blur still
    // costs a full-screen pass in PIXI v8).
    const strength = rm ? 0 : (1.2 + ctx.energy * 0.8) * ctx.perfScale;
    this.blur.strength = strength;
    const wantFilter = strength >= 0.05;
    if (wantFilter !== this.filtered) {
      this.feedback.filters = wantFilter ? [this.blur] : [];
      this.filtered = wantFilter;
    }

    // Compose previous-frame + freshly injected blobs into the back texture.
    this.renderer.render({ container: this.scratch, target: this.rtB, clear: true });

    // Swap front/back.
    const tmp = this.rtA;
    this.rtA = this.rtB;
    this.rtB = tmp;
    this.display.texture = this.rtA;

    // Retire this frame's blobs (already baked into the texture).
    for (let i = 0; i < this.blobTop; i++) this.blobs[i].visible = false;
    this.blobTop = 0;
  }

  destroy(): void {
    this.rtA?.destroy(true);
    this.rtB?.destroy(true);
    // texture:true also frees the dedicated blob aura texture (offscreen, so the
    // app-level texture sweep never reaches it) — avoids a GPU texture leak.
    this.scratch.destroy({ children: true, texture: true });
  }
}
