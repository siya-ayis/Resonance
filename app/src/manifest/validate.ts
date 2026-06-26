import { Manifest } from './types';
import type { Manifest as ManifestT } from './types';

export interface ValidationResult {
  ok: boolean;
  manifest?: ManifestT;
  errors: string[];
}

/**
 * Parse + semantically validate a manifest. Beyond zod's structural check this
 * enforces the §15.1 harness invariants so a malformed (often hand-authored)
 * manifest is caught before it crashes on camera.
 */
export function validateManifest(raw: unknown): ValidationResult {
  const parsed = Manifest.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }
  const m = parsed.data;
  const errors: string[] = [];

  // Sections must be ordered and contiguous, covering [0, durationMs].
  const sections = [...m.sections].sort((a, b) => a.startMs - b.startMs);
  if (sections[0].startMs !== 0) {
    errors.push(`sections must start at 0 (got ${sections[0].startMs})`);
  }
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    if (s.endMs <= s.startMs) {
      errors.push(`section ${s.id} (${s.label}) has endMs <= startMs`);
    }
    if (i > 0 && s.startMs !== sections[i - 1].endMs) {
      errors.push(
        `section ${s.id} (${s.label}) not contiguous with previous (${sections[i - 1].endMs} -> ${s.startMs})`,
      );
    }
  }
  const lastEnd = sections[sections.length - 1].endMs;
  if (Math.abs(lastEnd - m.song.durationMs) > 50) {
    errors.push(`sections end at ${lastEnd} but song.durationMs is ${m.song.durationMs}`);
  }

  // Timed arrays must be monotonic non-decreasing and within the song.
  assertMonotonic('beats', m.beats.map((b) => b.tMs), m.song.durationMs, errors);
  assertMonotonic('onsets', m.onsets.map((o) => o.tMs), m.song.durationMs, errors);
  assertMonotonic('melody', m.melody.map((n) => n.tMs), m.song.durationMs, errors);
  assertMonotonic('lyrics', m.lyrics.map((l) => l.tMs), m.song.durationMs, errors);
  assertMonotonic('haptics', m.haptics.map((h) => h.tMs), m.song.durationMs, errors);

  return { ok: errors.length === 0, manifest: errors.length === 0 ? m : undefined, errors };
}

function assertMonotonic(name: string, times: number[], durationMs: number, errors: string[]): void {
  for (let i = 0; i < times.length; i++) {
    if (times[i] < 0 || times[i] > durationMs + 50) {
      errors.push(`${name}[${i}] tMs=${times[i]} out of range [0, ${durationMs}]`);
      break;
    }
    if (i > 0 && times[i] < times[i - 1]) {
      errors.push(`${name}[${i}] tMs=${times[i]} is before previous (${times[i - 1]}); must be sorted`);
      break;
    }
  }
}
