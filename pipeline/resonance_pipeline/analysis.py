"""Audio analysis with librosa: tempo/beats, onsets, sections, key, per-stem
envelopes and a melody line. Pure, deterministic feature extraction — no AI on
the critical path. Stem separation (Demucs) is optional and lives in separate.py;
here we derive per-component envelopes via HPSS + band filtering, which the
renderer actually uses to drive motion even when true stems are unavailable.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np

SR = 22050
HOP = 512
FRAME_MS = 50  # manifest envelope frame size

# Krumhansl-Schmuckler key profiles (major / minor), for key + mode detection.
_MAJOR = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
_MINOR = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
_PITCHES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]


@dataclass
class Analysis:
    duration_ms: int
    bpm: float
    key: str
    mode: str  # "major" | "minor"
    beats: list[dict] = field(default_factory=list)
    onsets: list[dict] = field(default_factory=list)
    sections: list[dict] = field(default_factory=list)
    envelopes: dict = field(default_factory=dict)
    melody: list[dict] = field(default_factory=list)


def load_audio(path: str, sr: int = SR) -> tuple[np.ndarray, int]:
    import librosa

    y, sr = librosa.load(path, sr=sr, mono=True)
    return y.astype(np.float32), sr


def detect_key(y: np.ndarray, sr: int) -> tuple[str, str]:
    import librosa

    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP)
    profile = chroma.mean(axis=1)
    best_corr, best = -2.0, ("C", "major")
    for i in range(12):
        rot = np.roll(profile, -i)
        cmaj = float(np.corrcoef(rot, _MAJOR)[0, 1])
        cmin = float(np.corrcoef(rot, _MINOR)[0, 1])
        if cmaj > best_corr:
            best_corr, best = cmaj, (_PITCHES[i], "major")
        if cmin > best_corr:
            best_corr, best = cmin, (_PITCHES[i], "minor")
    return best


def _norm(x: np.ndarray) -> np.ndarray:
    """Min-max to [0,1] with a small floor so silence -> 0, robust to outliers."""
    if x.size == 0:
        return x
    lo = float(np.percentile(x, 2))
    hi = float(np.percentile(x, 98))
    if hi - lo < 1e-9:
        return np.zeros_like(x)
    return np.clip((x - lo) / (hi - lo), 0.0, 1.0)


def _band_rms(y: np.ndarray, sr: int, low: Optional[float], high: Optional[float]) -> np.ndarray:
    """RMS energy of a Butterworth band, framed at HOP. Returns per-frame array."""
    from scipy.signal import butter, sosfilt
    import librosa

    nyq = sr / 2.0
    if low and high:
        sos = butter(4, [low / nyq, high / nyq], btype="band", output="sos")
    elif high:
        sos = butter(4, high / nyq, btype="low", output="sos")
    elif low:
        sos = butter(4, low / nyq, btype="high", output="sos")
    else:
        sos = None
    yb = sosfilt(sos, y).astype(np.float32) if sos is not None else y
    rms = librosa.feature.rms(y=yb, hop_length=HOP, frame_length=HOP * 2)[0]
    return rms


def compute_envelopes(y: np.ndarray, sr: int, duration_ms: int) -> dict:
    """Per-stem normalized intensity frames at FRAME_MS, from HPSS + band filters."""
    import librosa

    y_harm, y_perc = librosa.effects.hpss(y)
    bass = _band_rms(y_harm, sr, None, 150.0)          # low harmonic -> bass
    drums = librosa.feature.rms(y=y_perc, hop_length=HOP, frame_length=HOP * 2)[0]  # percussive -> drums
    vocals = _band_rms(y_harm, sr, 250.0, 4000.0)      # mid harmonic -> vocals
    other = _band_rms(y_harm, sr, 4000.0, None)        # high harmonic -> other/air

    n_frames = max(1, duration_ms // FRAME_MS)

    def resample_norm(a: np.ndarray) -> list[float]:
        a = _norm(a)
        idx = np.linspace(0, len(a) - 1, n_frames).astype(int) if len(a) > 1 else np.zeros(n_frames, int)
        return [round(float(v), 2) for v in a[idx]]

    return {
        "frameMs": FRAME_MS,
        "bass": resample_norm(bass),
        "drums": resample_norm(drums),
        "vocals": resample_norm(vocals),
        "other": resample_norm(other),
    }


def detect_beats(y: np.ndarray, sr: int, duration_ms: int) -> tuple[float, list[dict]]:
    import librosa

    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    tempo, beat_frames = librosa.beat.beat_track(
        onset_envelope=onset_env, sr=sr, hop_length=HOP, units="frames"
    )
    bpm = float(np.atleast_1d(tempo)[0]) or 120.0
    times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=HOP)
    strengths = _norm(onset_env[beat_frames]) if len(beat_frames) else np.array([])

    bar_types = ["kick", "hat", "snare", "hat"]
    beats: list[dict] = []
    for i, t in enumerate(times):
        t_ms = int(round(t * 1000))
        if t_ms > duration_ms:
            break
        btype = bar_types[i % 4]
        base = 0.95 if btype == "kick" else 0.8 if btype == "snare" else 0.45
        s = float(np.clip(base * (0.55 + 0.9 * (strengths[i] if i < len(strengths) else 0.5)), 0, 1))
        beats.append({"tMs": t_ms, "strength": round(s, 2), "type": btype})
    return bpm, beats


def detect_onsets(y: np.ndarray, sr: int, duration_ms: int) -> list[dict]:
    import librosa

    o_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    frames = librosa.onset.onset_detect(
        onset_envelope=o_env, sr=sr, hop_length=HOP, backtrack=False
    )
    if len(frames) == 0:
        return []
    times = librosa.frames_to_time(frames, sr=sr, hop_length=HOP)
    strengths = _norm(o_env[frames])

    # Band energies for stem assignment (STFT magnitude grouped into bands).
    S = np.abs(librosa.stft(y, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=sr)
    low = S[freqs < 150].sum(axis=0)
    mid = S[(freqs >= 150) & (freqs < 2000)].sum(axis=0)
    high = S[freqs >= 2000].sum(axis=0)

    onsets: list[dict] = []
    for i, t in enumerate(times):
        t_ms = int(round(t * 1000))
        if t_ms > duration_ms:
            break
        f = min(frames[i], low.shape[0] - 1)
        l, m, h = low[f], mid[f], high[f]
        total = l + m + h + 1e-9
        if l / total > 0.5:
            stem = "bass"
        elif h / total > 0.45:
            stem = "drums"
        elif m / total > 0.4:
            stem = "vocals"
        else:
            stem = "other"
        onsets.append({"tMs": t_ms, "stem": stem, "intensity": round(float(strengths[i]), 2)})
    return onsets


def detect_sections(y: np.ndarray, sr: int, duration_ms: int, max_sections: int = 5) -> list[dict]:
    """Segment via agglomerative clustering of beat-synced features; derive
    valence/arousal per segment and resolve a palette name."""
    import librosa
    from .emotion import palette_for_emotion, meaning_for_emotion, label_for_section

    onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    _, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=sr, hop_length=HOP)
    chroma = librosa.feature.chroma_cqt(y=y, sr=sr, hop_length=HOP)
    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    cent = librosa.feature.spectral_centroid(y=y, sr=sr, hop_length=HOP)[0]
    n = chroma.shape[1]
    rms = librosa.util.fix_length(rms, size=n)
    cent = librosa.util.fix_length(cent, size=n)

    # Arousal driver = loudness + brightness (normalized over the whole track).
    arousal_frames = 0.6 * _norm(rms) + 0.4 * _norm(cent)

    feat = np.vstack([chroma, _norm(rms)[None, :], _norm(cent)[None, :]])
    if len(beat_frames) >= 2:
        feat = librosa.util.sync(feat, beat_frames, aggregate=np.mean)
    k = int(np.clip(max_sections, 1, feat.shape[1]))
    if feat.shape[1] <= 1 or k <= 1:
        bounds = np.array([0])
    else:
        bounds = librosa.segment.agglomerative(feat, k)

    # Convert beat-index boundaries -> frame -> time.
    if len(beat_frames) >= 2:
        bound_frames = beat_frames[np.clip(bounds, 0, len(beat_frames) - 1)]
    else:
        bound_frames = np.array([0])
    bound_times = librosa.frames_to_time(bound_frames, sr=sr, hop_length=HOP)
    edges = sorted({0} | {int(round(t * 1000)) for t in bound_times})
    edges = [e for e in edges if 0 <= e < duration_ms]
    if not edges or edges[0] != 0:
        edges = [0] + edges
    edges.append(duration_ms)
    edges = sorted(set(edges))

    sections: list[dict] = []
    total = len(edges) - 1
    for i in range(total):
        start_ms, end_ms = edges[i], edges[i + 1]
        if end_ms <= start_ms:
            continue
        sf = int(start_ms / 1000 * sr / HOP)
        ef = max(sf + 1, int(end_ms / 1000 * sr / HOP))
        seg_arousal = float(np.clip(np.mean(arousal_frames[sf:ef]) if ef <= len(arousal_frames) else 0.4, 0, 1))
        seg_chroma = chroma[:, sf:ef].mean(axis=1) if ef <= chroma.shape[1] else chroma.mean(axis=1)
        cmaj = float(np.corrcoef(seg_chroma, np.roll(_MAJOR, 0))[0, 1]) if seg_chroma.std() > 0 else 0.0
        cmin = float(np.corrcoef(seg_chroma, np.roll(_MINOR, 0))[0, 1]) if seg_chroma.std() > 0 else 0.0
        majorness = np.tanh((cmaj - cmin) * 2.0)  # -1..1 ish
        bright = (np.mean(_norm(cent)[sf:ef]) - 0.5) * 0.6 if ef <= len(cent) else 0.0
        valence = float(np.clip(0.6 * majorness + 0.4 * (2 * bright), -1, 1))
        label = label_for_section(len(sections), total, seg_arousal)
        sections.append({
            "id": len(sections),
            "label": label,
            "startMs": int(start_ms),
            "endMs": int(end_ms),
            "valence": round(valence, 2),
            "arousal": round(seg_arousal, 2),
            "palette": palette_for_emotion(valence, seg_arousal),
            "meaning": meaning_for_emotion(valence, seg_arousal),
            "events": [],
        })
    if not sections:  # degenerate (e.g. silence) -> single calm section
        sections = [{
            "id": 0, "label": "intro", "startMs": 0, "endMs": duration_ms,
            "valence": 0.0, "arousal": 0.2,
            "palette": palette_for_emotion(0.0, 0.2),
            "meaning": meaning_for_emotion(0.0, 0.2), "events": [],
        }]
    return sections


def detect_melody(y: np.ndarray, sr: int, duration_ms: int, max_notes: int = 200) -> list[dict]:
    """pYIN f0 -> grouped MIDI notes for the melody ribbon."""
    import librosa

    try:
        f0, voiced, _ = librosa.pyin(
            y, fmin=float(librosa.note_to_hz("C2")), fmax=float(librosa.note_to_hz("C7")),
            sr=sr, hop_length=HOP,
        )
    except Exception:
        return []
    times = librosa.times_like(f0, sr=sr, hop_length=HOP)
    notes: list[dict] = []
    cur_midi: Optional[int] = None
    cur_start = 0.0
    for i, hz in enumerate(f0):
        midi = int(round(librosa.hz_to_midi(hz))) if (voiced[i] and hz and not np.isnan(hz)) else None
        if midi != cur_midi:
            if cur_midi is not None:
                dur = max(80, int((times[i] - cur_start) * 1000))
                t_ms = int(cur_start * 1000)
                if t_ms <= duration_ms:
                    notes.append({"tMs": t_ms, "midi": cur_midi, "durMs": dur})
            cur_midi = midi
            cur_start = times[i]
    if cur_midi is not None:
        t_ms = int(cur_start * 1000)
        if t_ms <= duration_ms:
            notes.append({"tMs": t_ms, "midi": cur_midi, "durMs": max(80, int((times[-1] - cur_start) * 1000))})
    # Thin to keep manifests small + monotonic.
    notes = [n for n in notes if n["durMs"] >= 120]
    if len(notes) > max_notes:
        step = len(notes) / max_notes
        notes = [notes[int(i * step)] for i in range(max_notes)]
    return notes


def analyze(path: str, sr: int = SR) -> Analysis:
    y, sr = load_audio(path, sr)
    duration_ms = int(round(len(y) / sr * 1000))
    bpm, beats = detect_beats(y, sr, duration_ms)
    key_name, mode = detect_key(y, sr)
    return Analysis(
        duration_ms=duration_ms,
        bpm=round(bpm, 2),
        key=f"{key_name} {mode}",
        mode=mode,
        beats=beats,
        onsets=detect_onsets(y, sr, duration_ms),
        sections=detect_sections(y, sr, duration_ms),
        envelopes=compute_envelopes(y, sr, duration_ms),
        melody=detect_melody(y, sr, duration_ms),
    )
