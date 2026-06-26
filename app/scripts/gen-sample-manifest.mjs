/**
 * Generates a deterministic, hand-authored Experience Manifest for the demo
 * song so app development is unblocked before the Python pipeline exists.
 * Output: public/manifests/song1/manifest.json
 *
 * Lyrics here are ORIGINAL/placeholder text (CC-clean) — safe to commit.
 * Run: node scripts/gen-sample-manifest.mjs
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../public/manifests/song1/manifest.json');

const DURATION_MS = 24000;
const BPM = 120;
const BEAT_MS = (60 / BPM) * 1000; // 500ms
const N_BEATS = Math.floor(DURATION_MS / BEAT_MS); // 48
const FRAME_MS = 50;
const N_FRAMES = Math.floor(DURATION_MS / FRAME_MS); // 480

const sections = [
  { id: 0, label: 'intro', startMs: 0, endMs: 8000, valence: 0.2, arousal: 0.3,
    palette: 'cool-muted-indigo', meaning: 'a quiet, hopeful beginning', events: ['soft pad intro'] },
  { id: 1, label: 'build', startMs: 8000, endMs: 16000, valence: 0.4, arousal: 0.62,
    palette: 'vivid-warm-amber', meaning: 'energy gathering', events: ['rising tension'] },
  { id: 2, label: 'drop', startMs: 16000, endMs: 24000, valence: 0.6, arousal: 0.95,
    palette: 'vivid-warm-magenta', meaning: 'release and momentum', events: ['beat drops'] },
];

const sectionAt = (tMs) => sections.find((s) => tMs >= s.startMs && tMs < s.endMs) ?? sections[sections.length - 1];

// --- Beats: 4-on-the-floor with kick/hat/snare/hat per bar ---
const BAR_TYPES = ['kick', 'hat', 'snare', 'hat'];
const beats = [];
const onsets = [];
const haptics = [];
for (let i = 0; i < N_BEATS; i++) {
  const tMs = Math.round(i * BEAT_MS);
  const type = BAR_TYPES[i % 4];
  const sec = sectionAt(tMs);
  const energy = 0.5 + sec.arousal * 0.5; // louder in higher-arousal sections
  let strength = type === 'kick' ? 0.95 : type === 'snare' ? 0.8 : 0.4;
  strength = Math.min(1, strength * energy);
  beats.push({ tMs, strength: round2(strength), type });

  // Drum onset on every beat.
  onsets.push({ tMs, stem: 'drums', intensity: round2(strength) });
  // Bass onset + haptic on kicks; double-tap haptic on snares.
  if (type === 'kick') {
    onsets.push({ tMs, stem: 'bass', intensity: round2(0.85 * energy) });
    const dur = sec.label === 'drop' ? 120 : 90;
    haptics.push({ tMs, pattern: [dur], channel: 'bass', intensity: round2(strength) });
  } else if (type === 'snare') {
    haptics.push({ tMs, pattern: [30, 40, 30], channel: 'drums', intensity: round2(strength) });
  }
}

// --- Envelopes: per-stem normalized intensity frames (organic continuous motion) ---
const env = { frameMs: FRAME_MS, bass: [], drums: [], vocals: [], other: [] };
for (let f = 0; f < N_FRAMES; f++) {
  const tMs = f * FRAME_MS;
  const sec = sectionAt(tMs);
  const beatPhase = (tMs % BEAT_MS) / BEAT_MS; // 0..1 within a beat
  const pulse = Math.exp(-beatPhase * 6); // sharp decay each beat
  const arousal = sec.arousal;
  env.bass.push(round2(clamp(0.25 + 0.7 * pulse * arousal)));
  env.drums.push(round2(clamp(0.15 + 0.85 * pulse * arousal)));
  // vocals fade in across build + drop
  const vocalBase = sec.label === 'intro' ? 0.0 : sec.label === 'build' ? 0.4 : 0.75;
  env.vocals.push(round2(clamp(vocalBase + 0.15 * Math.sin(tMs / 800))));
  env.other.push(round2(clamp(0.3 + 0.2 * Math.sin(tMs / 1500) + 0.2 * arousal)));
}

// --- Melody: a simple pentatonic line during the drop (for ribbon coloring) ---
const PENTA = [69, 72, 74, 76, 79]; // A minor pentatonic-ish (MIDI)
const melody = [];
for (let i = 0; i < 16; i++) {
  const tMs = 16000 + i * 500;
  if (tMs >= DURATION_MS) break;
  melody.push({ tMs, midi: PENTA[i % PENTA.length], durMs: 450 });
}

// --- Lyrics: ORIGINAL placeholder text (CC-clean) ---
const lyrics = [
  { tMs: 8000, line: 'feel the low end start to rise', emotion: 'anticipation',
    words: words('feel the low end start to rise', 8000, 1600) },
  { tMs: 12000, line: 'let the color move your eyes', emotion: 'wonder',
    words: words('let the color move your eyes', 12000, 1500) },
  { tMs: 16000, line: 'now the whole room comes alive', emotion: 'joy',
    words: words('now the whole room comes alive', 16000, 1400) },
  { tMs: 20000, line: 'every pulse a place to thrive', emotion: 'release',
    words: words('every pulse a place to thrive', 20000, 1400) },
];

const manifest = {
  version: '1.0',
  song: { title: 'Resonance Demo One', artist: 'Resonance (synthesized)', durationMs: DURATION_MS, bpm: BPM, key: 'A minor' },
  audio: { master: 'master.mp3', stems: { bass: 'stems/bass.mp3', drums: 'stems/drums.mp3', vocals: 'stems/vocals.mp3', other: 'stems/other.mp3' } },
  globalStyle: { particleStyle: 'bubbles+sparks', seed: 42 },
  sections,
  beats,
  onsets,
  envelopes: env,
  melody,
  lyrics,
  haptics,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(manifest, null, 2));
console.log(`Wrote ${OUT}`);
console.log(`  ${beats.length} beats, ${onsets.length} onsets, ${haptics.length} haptics, ${melody.length} melody notes, ${env.bass.length} frames/stem`);

// --- helpers ---
function round2(n) { return Math.round(n * 100) / 100; }
function clamp(n) { return Math.max(0, Math.min(1, n)); }
function words(line, startMs, spanMs) {
  const ws = line.split(' ');
  const step = spanMs / ws.length;
  return ws.map((w, i) => ({ tMs: Math.round(startMs + i * step), w }));
}
