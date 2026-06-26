/**
 * Seeded pseudo-random generator (mulberry32). All per-song randomness is
 * seeded from manifest.globalStyle.seed so a given manifest renders identically
 * every run — eyeball-diffable and screen-recordable for the demo (§10.4).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  /** float in [0, 1) */
  float(): number {
    return this.next();
  }
  /** float in [min, max) */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  /** int in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }
  /** -spread … +spread */
  jitter(spread: number): number {
    return (this.next() * 2 - 1) * spread;
  }
}
