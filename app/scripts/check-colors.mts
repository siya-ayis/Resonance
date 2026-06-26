import { pitchClassColor, WESTERN_NAMES, SWARA_SHORT } from '../src/visual/colorEngine.ts';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

// crude perceptual distance via luma+channel spread, just to sanity-check separation
function rgb(n: number) {
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function dist(a: number, b: number) {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.round(Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2));
}

const cols: number[] = [];
for (let pc = 0; pc < 12; pc++) {
  const c = pitchClassColor(60 + pc);
  cols.push(c);
  console.log(WESTERN_NAMES[pc].padEnd(3), SWARA_SHORT[pc].padEnd(5), hex(c));
}
let min = Infinity;
for (let i = 0; i < 12; i++) {
  const d = dist(cols[i], cols[(i + 1) % 12]);
  min = Math.min(min, d);
}
console.log('min adjacent RGB distance:', min);
