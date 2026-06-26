"""Generate a deterministic demo WAV so the whole pipeline runs end-to-end with
NO external audio file (useful for CI + first-run verification). It synthesises a
simple 3-section track: calm intro -> build -> energetic drop, with a kick, a
bassline, a pad, and a pentatonic melody.
"""
from __future__ import annotations

import numpy as np

SR = 22050


def _sine(freq: float, t: np.ndarray, amp: float = 0.3) -> np.ndarray:
    return amp * np.sin(2 * np.pi * freq * t)


def _adsr_kick(sr: int, dur: float = 0.18) -> np.ndarray:
    n = int(sr * dur)
    t = np.arange(n) / sr
    f = 120 * np.exp(-t * 30) + 45  # pitch drop
    env = np.exp(-t * 22)
    return (np.sin(2 * np.pi * np.cumsum(f) / sr) * env).astype(np.float32)


def synth_demo(seconds: float = 18.0, sr: int = SR) -> tuple[np.ndarray, int]:
    n = int(seconds * sr)
    t = np.arange(n) / sr
    y = np.zeros(n, dtype=np.float32)

    # Section energy envelope: intro(0-6) calm, build(6-12), drop(12-18) loud.
    def sec_gain(ti: float) -> float:
        if ti < 6:
            return 0.35
        if ti < 12:
            return 0.6
        return 1.0

    gain = np.array([sec_gain(x) for x in t], dtype=np.float32)

    # Pad chord (A minor-ish) - harmonic content for key detection.
    for f in (220.0, 261.63, 329.63):
        y += _sine(f, t, 0.05) * gain

    # Bassline on the root, pulsing with the beat (120 BPM -> 0.5s).
    beat = 0.5
    bass = _sine(55.0, t, 0.18)
    bass *= np.exp(-((t % beat)) * 6)  # decay each beat
    y += bass * gain

    # Kick on every beat (4-on-the-floor).
    kick = _adsr_kick(sr)
    for i in range(int(seconds / beat)):
        s = int(i * beat * sr)
        e = min(s + len(kick), n)
        y[s:e] += kick[: e - s] * (0.6 + 0.4 * sec_gain(i * beat))

    # Hi-hat-ish noise bursts on off-beats during build+drop.
    rng = np.random.default_rng(42)
    for i in range(int(seconds / beat)):
        ti = i * beat
        if ti >= 6 and i % 2 == 1:
            s = int((ti + beat / 2) * sr)
            hat = rng.standard_normal(int(0.04 * sr)).astype(np.float32)
            hat *= np.exp(-np.arange(len(hat)) / (0.01 * sr))
            e = min(s + len(hat), n)
            y[s:e] += hat[: e - s] * 0.12 * sec_gain(ti)

    # Pentatonic melody during the drop (12s+) for the ribbon.
    penta = [440.0, 523.25, 587.33, 659.25, 783.99]
    for i in range(12):
        ti = 12 + i * 0.5
        if ti >= seconds:
            break
        s = int(ti * sr)
        dur = int(0.45 * sr)
        seg = np.arange(dur) / sr
        note = _sine(penta[i % len(penta)], seg, 0.18) * np.exp(-seg * 2.5)
        e = min(s + dur, n)
        y[s:e] += note[: e - s]

    peak = float(np.max(np.abs(y))) or 1.0
    return (y / peak * 0.9).astype(np.float32), sr


def write_demo(path: str, seconds: float = 18.0, sr: int = SR) -> str:
    import soundfile as sf

    y, sr = synth_demo(seconds, sr)
    sf.write(path, y, sr)
    return path
