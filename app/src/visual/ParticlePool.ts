import { Container, Sprite, Texture } from 'pixi.js';

export interface SpawnOptions {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Diameter in px (texture is normalized to 1.0 scale = textureSize). */
  size: number;
  /** Lifetime in seconds. */
  life: number;
  tint: number;
  alpha: number;
  /** Drag per second (0 = none, 1 = stops in ~1s). */
  drag?: number;
  /** Growth multiplier per second applied to scale (1 = constant). */
  grow?: number;
  additive?: boolean;
}

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  baseAlpha: number;
  drag: number;
  grow: number;
  active: boolean;
}

/**
 * Pooled additive sprite system. Sprites are allocated once and recycled — no
 * per-frame allocation (the §10.5 perf rule). Capacity is adjustable so the
 * VisualEngine can throttle particle counts adaptively by measured FPS.
 */
export class ParticlePool {
  readonly container = new Container();
  private particles: Particle[] = [];
  private free: number[] = [];
  private readonly texSize: number;

  constructor(private texture: Texture, capacity: number, texSize = 64) {
    this.texSize = texSize;
    this.grow(capacity);
  }

  get activeCount(): number {
    return this.particles.length - this.free.length;
  }

  setCapacity(n: number): void {
    if (n > this.particles.length) this.grow(n - this.particles.length);
  }

  private grow(by: number): void {
    for (let i = 0; i < by; i++) {
      const sprite = new Sprite(this.texture);
      sprite.anchor.set(0.5);
      sprite.visible = false;
      this.container.addChild(sprite);
      const idx = this.particles.length;
      this.particles.push({ sprite, vx: 0, vy: 0, life: 0, maxLife: 1, baseAlpha: 1, drag: 0, grow: 1, active: false });
      this.free.push(idx);
    }
  }

  spawn(opts: SpawnOptions): void {
    const idx = this.free.pop();
    if (idx === undefined) return; // pool exhausted — drop silently (adaptive cap)
    const p = this.particles[idx];
    const s = p.sprite;
    s.visible = true;
    s.x = opts.x;
    s.y = opts.y;
    s.scale.set(opts.size / this.texSize);
    s.tint = opts.tint;
    s.alpha = opts.alpha;
    s.blendMode = opts.additive === false ? 'normal' : 'add';
    p.vx = opts.vx;
    p.vy = opts.vy;
    p.life = opts.life;
    p.maxLife = opts.life;
    p.baseAlpha = opts.alpha;
    p.drag = opts.drag ?? 0;
    p.grow = opts.grow ?? 1;
    p.active = true;
  }

  update(dt: number): void {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.sprite.visible = false;
        this.free.push(i);
        continue;
      }
      const dragF = p.drag > 0 ? Math.max(0, 1 - p.drag * dt) : 1;
      p.vx *= dragF;
      p.vy *= dragF;
      p.sprite.x += p.vx * dt;
      p.sprite.y += p.vy * dt;
      if (p.grow !== 1) p.sprite.scale.set(p.sprite.scale.x * (1 + (p.grow - 1) * dt));
      // Ease-out fade over lifetime.
      const t = p.life / p.maxLife;
      p.sprite.alpha = p.baseAlpha * t * t;
    }
  }

  clear(): void {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (p.active) {
        p.active = false;
        p.sprite.visible = false;
        this.free.push(i);
      }
    }
  }
}

/** Generate a soft radial-gradient dot texture (white, tinted per particle). */
export function makeSoftDotTexture(size = 64): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(canvas);
}

/**
 * Larger, many-stop radial gradient for the vocal aura. More stops + a faint
 * dither reduce banding when scaled up and blended additively (SME guidance).
 */
export function makeAuraTexture(size = 512): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  const g = ctx.createRadialGradient(r, r, 0, r, r, r);
  g.addColorStop(0.0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.22)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.06)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  // Subtle dither to break up gradient banding on cheap panels.
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 3; i < d.length; i += 4) {
    d[i] = Math.max(0, Math.min(255, d[i] + ((Math.random() * 6) | 0) - 3));
  }
  ctx.putImageData(img, 0, 0);
  return Texture.from(canvas);
}

/**
 * Soft horizontal strip texture for melody ribbons (MeshRope). Bright core that
 * fades at the long edges so overlapping ribbons blend organically.
 */
export function makeRibbonTexture(w = 128, h = 32): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0.0, 'rgba(255,255,255,0)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  return Texture.from(canvas);
}
