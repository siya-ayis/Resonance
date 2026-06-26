"""End-to-end pipeline test on the synthesised demo (no external audio, no GPU).

Run: pipeline/.venv/Scripts/python.exe -m pytest pipeline/tests -q
 or: pipeline/.venv/Scripts/python.exe pipeline/tests/test_pipeline.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from resonance_pipeline import analysis as A
from resonance_pipeline.emotion import KNOWN_PALETTES, palette_for_emotion
from resonance_pipeline.manifest import build_manifest, validate
from resonance_pipeline.synth_demo import synth_demo


def _full_analysis(y, sr):
    dur = int(round(len(y) / sr * 1000))
    an = A.Analysis(duration_ms=dur, bpm=0, key="", mode="")
    an.bpm, an.beats = A.detect_beats(y, sr, dur)
    k, an.mode = A.detect_key(y, sr)
    an.key = f"{k} {an.mode}"
    an.onsets = A.detect_onsets(y, sr, dur)
    an.sections = A.detect_sections(y, sr, dur)
    an.envelopes = A.compute_envelopes(y, sr, dur)
    an.melody = A.detect_melody(y, sr, dur)
    return an


def test_pipeline_produces_valid_manifest():
    y, sr = synth_demo(seconds=12.0)
    an = _full_analysis(y, sr)
    m = build_manifest(an, title="t", artist="a", audio_master="master.wav",
                       stems={"bass": "stems/bass.wav"})
    errors = validate(m)
    assert errors == [], f"manifest invalid: {errors}"


def test_sections_contiguous_and_cover_duration():
    y, sr = synth_demo(seconds=12.0)
    an = _full_analysis(y, sr)
    secs = sorted(an.sections, key=lambda s: s["startMs"])
    assert secs[0]["startMs"] == 0
    for i in range(1, len(secs)):
        assert secs[i]["startMs"] == secs[i - 1]["endMs"]
    assert abs(secs[-1]["endMs"] - an.duration_ms) <= 50


def test_palette_names_known():
    y, sr = synth_demo(seconds=12.0)
    an = _full_analysis(y, sr)
    for s in an.sections:
        assert s["palette"] in KNOWN_PALETTES


def test_palette_mapping_matches_renderer():
    # Mirror of paletteForEmotion in app/src/visual/palette.ts.
    assert palette_for_emotion(0.5, 0.9) == "vivid-warm-magenta"
    assert palette_for_emotion(0.5, 0.2) == "warm-pastel-peach"
    assert palette_for_emotion(-0.5, 0.9) == "cold-contrast-violet"
    assert palette_for_emotion(-0.5, 0.2) == "cool-muted-indigo"


def test_timed_arrays_monotonic():
    y, sr = synth_demo(seconds=12.0)
    an = _full_analysis(y, sr)
    for arr, key in [(an.beats, "tMs"), (an.onsets, "tMs"), (an.melody, "tMs")]:
        times = [x[key] for x in arr]
        assert times == sorted(times)


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_") and callable(fn):
            fn()
            print(f"PASS {name}")
    print("ALL TESTS PASSED")
