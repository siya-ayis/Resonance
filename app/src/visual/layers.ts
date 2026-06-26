import { Container, Graphics, MeshRope, Point, Sprite, Texture } from 'pixi.js';
import { ParticlePool } from './ParticlePool';
import { clamp01, midiToY } from './colorEngine';
import type { FrameCtx, Layer } from './types';
import type { BeatType } from '../manifest/types';

/* ------------------------------------------------------------------ */
/* EmotionField — full-bleed gradient background that breathes with energy. */
/* ------------------------------------------------------------------ */
export class EmotionField implements Layer {
  readonly container = new Container();
  private bg: Sprite;
  private glow: Sprite;
  private lastTop = -1;
  private lastBottom = -1;
  private breath = 0;

  constructor(dot: Texture) {
    this.bg = new Sprite(this.gradientTexture(0x131a36, 0x05060f));
    this.bg.anchor.set(0);
    this.glow = new Sprite(dot);
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.alpha = 0.08;
    this.container.addChild(this.bg, this.glow);
  }

  /**
   * Set gradient colors. The background is a subtle dark gradient, so we quantize
   * the requested colors to ~8 levels/channel and only rebuild the texture when
   * that quantized value changes. Without this, a section cross-fade (which lerps
   * the palette every frame for ~1.4s) would allocate + GPU-upload + destroy a new
   * texture on nearly every frame.
   */
  setColors(top: number, bottom: number): void {
    const qTop = top & 0xe0e0e0;
    const qBottom = bottom & 0xe0e0e0;
    if (qTop === this.lastTop && qBottom === this.lastBottom) return;
    this.lastTop = qTop;
    this.lastBottom = qBottom;
    const tex = this.bg.texture;
    this.bg.texture = this.gradientTexture(top, bottom);
    tex.destroy(true);
  }

  resize(w: number, h: number): void {
    this.bg.width = w;
    this.bg.height = h;
    this.glow.x = w / 2;
    this.glow.y = h * 0.55;
    this.glow.scale.set((Math.max(w, h) * 1.6) / 64);
  }

  update(ctx: FrameCtx): void {
    this.setColors(ctx.palette.bg[0], ctx.palette.bg[1]);
    this.glow.tint = ctx.palette.bass;
    this.breath += ctx.dt * (0.4 + ctx.energy);
    const pulse = ctx.reducedMotion ? 0 : Math.sin(this.breath) * 0.02;
    this.glow.alpha = 0.05 + ctx.energy * 0.18 * ctx.intensity + Math.max(0, pulse);
  }

  private gradientTexture(top: number, bottom: number): Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 256;
    const c = canvas.getContext('2d')!;
    const g = c.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, hex(top));
    g.addColorStop(1, hex(bottom));
    c.fillStyle = g;
    c.fillRect(0, 0, 4, 256);
    return Texture.from(canvas);
  }
}

/* ------------------------------------------------------------------ */
/* BassOrbs — large soft orbs (lower third) that swell on bass, pulse on kick. */
/* ------------------------------------------------------------------ */
export class BassOrbs implements Layer {
  readonly container = new Container();
  private orbs: Sprite[] = [];
  private pulse = 0;
  private w = 0;
  private h = 0;

  constructor(dot: Texture, count = 3) {
    for (let i = 0; i < count; i++) {
      const s = new Sprite(dot);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.alpha = 0.5;
      this.orbs.push(s);
      this.container.addChild(s);
    }
  }

  /** Transient pulse on a strong bass onset (kick). */
  pulseHit(intensity: number): void {
    this.pulse = Math.min(1.4, this.pulse + intensity);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const n = this.orbs.length;
    this.orbs.forEach((s, i) => {
      s.x = w * ((i + 1) / (n + 1));
      s.y = h * 0.82;
    });
  }

  update(ctx: FrameCtx): void {
    this.pulse *= Math.max(0, 1 - ctx.dt * 4);
    const base = Math.min(this.w, this.h) * 0.55;
    const swell = 0.6 + ctx.bass * 0.6 * ctx.intensity + this.pulse * 0.7;
    for (const s of this.orbs) {
      s.tint = ctx.palette.bass;
      s.scale.set((base * swell) / 64);
      s.alpha = 0.16 + ctx.bass * 0.22 + this.pulse * 0.2;
    }
  }
}

/* ------------------------------------------------------------------ */
/* DrumSparks — the HERO layer: bright spark bursts on every onset.       */
/* ------------------------------------------------------------------ */
export class DrumSparks implements Layer {
  readonly container = new Container();
  private pool: ParticlePool;

  constructor(dot: Texture, capacity = 700) {
    this.pool = new ParticlePool(dot, capacity);
    this.container.addChild(this.pool.container);
  }

  setCapacity(n: number): void {
    this.pool.setCapacity(n);
  }

  clear(): void {
    this.pool.clear();
  }

  get activeCount(): number {
    return this.pool.activeCount;
  }

  /** Emit a burst. kick = large central; snare = wide scatter; hat = small flecks. */
  burst(x: number, y: number, intensity: number, type: BeatType, color: number, intensityScale: number): void {
    const energy = intensity * (0.5 + intensityScale * 0.5);
    let count: number, speed: number, size: number, spreadY: number;
    switch (type) {
      case 'kick':
        count = Math.round(16 * energy);
        speed = 240 * energy;
        size = 22;
        spreadY = 1;
        break;
      case 'snare':
        count = Math.round(13 * energy);
        speed = 320 * energy;
        size = 14;
        spreadY = 1.4;
        break;
      case 'hat':
        count = Math.round(6 * energy);
        speed = 190 * energy;
        size = 7;
        spreadY = 0.6;
        break;
      default:
        count = Math.round(10 * energy);
        speed = 240 * energy;
        size = 14;
        spreadY = 1;
    }
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.6);
      this.pool.spawn({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp * spreadY,
        size: size * (0.6 + Math.random() * 0.8),
        life: 0.4 + Math.random() * 0.5,
        tint: color,
        alpha: 0.55,
        drag: 1.6,
        additive: true,
      });
    }
  }

  resize(): void {
    /* particles are world-positioned by the engine */
  }

  update(ctx: FrameCtx): void {
    this.pool.update(ctx.dt);
  }
}

/* ------------------------------------------------------------------ */
/* HapticProxy — makes every buzz VISIBLE: expanding ring + edge flash.   */
/* This is the camera/iOS-web substitute for the felt pulse (R10).        */
/* ------------------------------------------------------------------ */
interface Ring {
  g: Graphics;
  life: number;
  maxLife: number;
  radius: number;
  maxRadius: number;
  color: number;
  active: boolean;
}

export class HapticProxy implements Layer {
  readonly container = new Container();
  private rings: Ring[] = [];
  private edge: Graphics;
  private edgeFlash = 0;
  private edgeColor = 0xffffff;
  private w = 0;
  private h = 0;

  constructor(capacity = 6) {
    this.edge = new Graphics();
    this.container.addChild(this.edge);
    for (let i = 0; i < capacity; i++) {
      const g = new Graphics();
      g.visible = false;
      this.container.addChild(g);
      this.rings.push({ g, life: 0, maxLife: 1, radius: 0, maxRadius: 0, color: 0xffffff, active: false });
    }
  }

  /** Fire a visible pulse aligned to a haptic event. */
  ping(x: number, y: number, intensity: number, color: number, isBass: boolean): void {
    const ring = this.rings.find((r) => !r.active);
    if (ring) {
      ring.active = true;
      ring.g.visible = true;
      ring.g.x = x;
      ring.g.y = y;
      ring.life = 0.55;
      ring.maxLife = 0.55;
      ring.radius = Math.min(this.w, this.h) * 0.04;
      ring.maxRadius = Math.min(this.w, this.h) * (isBass ? 0.42 : 0.28) * (0.6 + intensity * 0.6);
      ring.color = color;
    }
    if (isBass) {
      this.edgeFlash = Math.min(1, this.edgeFlash + intensity);
      this.edgeColor = color;
    }
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  update(ctx: FrameCtx): void {
    // Expanding rings.
    for (const r of this.rings) {
      if (!r.active) continue;
      r.life -= ctx.dt;
      if (r.life <= 0) {
        r.active = false;
        r.g.visible = false;
        continue;
      }
      const t = 1 - r.life / r.maxLife;
      r.radius = r.radius + (r.maxRadius - r.radius) * Math.min(1, ctx.dt * 6);
      const alpha = (1 - t) * 0.8;
      const width = 2 + (1 - t) * 6;
      r.g.clear();
      r.g.circle(0, 0, r.radius).stroke({ color: r.color, width, alpha });
    }
    // Bottom-edge bass flash (the "you can SEE the buzz" cue).
    this.edgeFlash *= Math.max(0, 1 - ctx.dt * 3.5);
    this.edge.clear();
    if (this.edgeFlash > 0.01) {
      const barH = this.h * 0.06;
      this.edge
        .rect(0, this.h - barH, this.w, barH)
        .fill({ color: this.edgeColor, alpha: this.edgeFlash * 0.5 });
    }
  }
}

/* ------------------------------------------------------------------ */
/* MelodyRibbons — flowing pitch streaks. y = pitch, hue = pitch class.    */
/* Pooled MeshRopes (retained geometry, no per-frame Graphics churn).      */
/* ------------------------------------------------------------------ */
interface Ribbon {
  rope: MeshRope;
  points: Point[];
  baseY: number;
  age: number;
  alpha: number;
  wobble: number;
  phase: number;
  active: boolean;
}

export class MelodyRibbons implements Layer {
  readonly container = new Container();
  private ribbons: Ribbon[] = [];
  private w = 0;
  private h = 0;

  constructor(tex: Texture, capacity = 8, pointCount = 28) {
    for (let i = 0; i < capacity; i++) {
      const points: Point[] = [];
      for (let p = 0; p < pointCount; p++) points.push(new Point(0, 0));
      const rope = new MeshRope({ texture: tex, points, width: 16 });
      rope.blendMode = 'add';
      rope.alpha = 0;
      rope.visible = false;
      this.container.addChild(rope);
      this.ribbons.push({ rope, points, baseY: 0, age: 0, alpha: 0, wobble: 0, phase: 0, active: false });
    }
  }

  /** Spawn a ribbon for a melody note (pitch -> y/hue, level -> brightness/length). */
  fireNote(midi: number, level: number, color: number, intensity: number): void {
    const r = this.ribbons.find((x) => !x.active);
    if (!r) return;
    r.active = true;
    r.rope.visible = true;
    r.age = 0;
    r.phase = Math.random() * Math.PI * 2;
    r.baseY = midiToY(midi, this.h);
    r.alpha = 0.45 + 0.5 * clamp01(level);
    r.wobble = (5 + 16 * clamp01(level)) * (0.4 + intensity * 0.6);
    r.rope.tint = color;
    const span = Math.min(this.w * 0.55, 380) * (0.6 + clamp01(level) * 0.6);
    const n = r.points.length;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      r.points[i].x = this.w * 0.92 - u * span;
      r.points[i].y = r.baseY;
    }
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
  }

  update(ctx: FrameCtx): void {
    const speed = 70 * (0.5 + ctx.intensity);
    for (const r of this.ribbons) {
      if (!r.active) continue;
      r.age += ctx.dt;
      r.alpha *= Math.exp(-ctx.dt / 0.75);
      if (r.alpha < 0.02) {
        r.active = false;
        r.rope.visible = false;
        r.rope.alpha = 0;
        continue;
      }
      const n = r.points.length;
      for (let i = 0; i < n; i++) {
        r.points[i].x -= speed * ctx.dt;
        const wob = ctx.reducedMotion ? 0 : Math.sin(r.age * 3.2 + i * 0.55 + r.phase) * r.wobble;
        r.points[i].y = r.baseY + wob;
      }
      r.rope.alpha = r.alpha * (0.5 + ctx.intensity * 0.5);
    }
  }
}

/* ------------------------------------------------------------------ */
/* VocalAura — a soft central orb that swells/brightens with the voice.   */
/* It is the anchor the kinetic lyrics sit on (the "voice" identity).     */
/* ------------------------------------------------------------------ */
export class VocalAura implements Layer {
  readonly container = new Container();
  private core: Sprite;
  private halo: Sprite;
  private level = 0;
  private w = 0;
  private h = 0;

  constructor(aura: Texture) {
    this.halo = new Sprite(aura);
    this.halo.anchor.set(0.5);
    this.halo.blendMode = 'add';
    this.core = new Sprite(aura);
    this.core.anchor.set(0.5);
    this.core.blendMode = 'add';
    this.container.addChild(this.halo, this.core);
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    const cx = w / 2;
    const cy = h * 0.5;
    this.halo.position.set(cx, cy);
    this.core.position.set(cx, cy);
  }

  update(ctx: FrameCtx): void {
    // Asymmetric follower: fast attack, slow release (musical, not jittery).
    const target = clamp01(ctx.vocals);
    const k = target > this.level ? 0.35 : 0.08;
    this.level += (target - this.level) * k;
    const base = Math.min(this.w, this.h);
    const lv = this.level;
    this.core.tint = ctx.palette.vocal;
    this.halo.tint = ctx.palette.vocal;
    const haloScale = (base * (0.7 + lv * 0.5)) / 512;
    const coreScale = (base * (0.32 + lv * 0.32)) / 512;
    this.halo.scale.set(haloScale);
    this.core.scale.set(coreScale);
    this.halo.alpha = (0.06 + lv * lv * 0.32) * ctx.intensity;
    this.core.alpha = (0.1 + lv * 0.4) * ctx.intensity;
  }
}

function hex(color: number): string {
  return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
}