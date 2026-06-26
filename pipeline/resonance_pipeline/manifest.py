"""Assemble + validate the Experience Manifest.

The manifest is the single data contract with the renderer
(app/src/manifest/types.ts). `validate()` mirrors the semantic rules in
app/src/manifest/validate.ts so the pipeline catches a bad manifest before it
ever reaches a device. The app's own validator (scripts/check-manifest.mts) is
the authoritative cross-check.
"""
from __future__ import annotations

import json
import os
from typing import Optional

from .analysis import Analysis
from .emotion import KNOWN_PALETTES
from .haptics import build_haptics


def build_manifest(
    analysis: Analysis,
    *,
    title: str,
    artist: str,
    audio_master: str,
    stems: Optional[dict] = None,
    lyrics: Optional[list[dict]] = None,
    seed: int = 42,
) -> dict:
    haptics = build_haptics(analysis.beats, analysis.onsets, analysis.sections)
    manifest = {
        "version": "1.0",
        "song": {
            "title": title,
            "artist": artist,
            "durationMs": analysis.duration_ms,
            "bpm": analysis.bpm,
            "key": analysis.key,
        },
        "audio": {"master": audio_master, **({"stems": stems} if stems else {})},
        "globalStyle": {"particleStyle": "bubbles+sparks", "seed": seed},
        "sections": analysis.sections,
        "beats": analysis.beats,
        "onsets": analysis.onsets,
        "envelopes": analysis.envelopes,
        "melody": analysis.melody,
        "lyrics": lyrics or [],
        "haptics": haptics,
    }
    return manifest


def validate(m: dict) -> list[str]:
    """Returns a list of human-readable errors ([] == valid). Mirrors validate.ts."""
    errors: list[str] = []

    if m.get("version") != "1.0":
        errors.append("version must be '1.0'")
    song = m.get("song", {})
    if not (isinstance(song.get("durationMs"), (int, float)) and song["durationMs"] > 0):
        errors.append("song.durationMs must be positive")
    if not (isinstance(song.get("bpm"), (int, float)) and song["bpm"] > 0):
        errors.append("song.bpm must be positive")
    duration = song.get("durationMs", 0)

    sections = sorted(m.get("sections", []), key=lambda s: s["startMs"])
    if not sections:
        errors.append("sections must be non-empty")
    else:
        if sections[0]["startMs"] != 0:
            errors.append(f"sections must start at 0 (got {sections[0]['startMs']})")
        for i, s in enumerate(sections):
            if s["endMs"] <= s["startMs"]:
                errors.append(f"section {s['id']} ({s['label']}) has endMs <= startMs")
            if i > 0 and s["startMs"] != sections[i - 1]["endMs"]:
                errors.append(
                    f"section {s['id']} ({s['label']}) not contiguous with previous "
                    f"({sections[i - 1]['endMs']} -> {s['startMs']})"
                )
            if not (-1 <= s["valence"] <= 1):
                errors.append(f"section {s['id']} valence out of [-1,1]")
            if not (0 <= s["arousal"] <= 1):
                errors.append(f"section {s['id']} arousal out of [0,1]")
            if s["palette"] not in KNOWN_PALETTES:
                errors.append(f"section {s['id']} palette '{s['palette']}' unknown to renderer")
        last_end = sections[-1]["endMs"]
        if abs(last_end - duration) > 50:
            errors.append(f"sections end at {last_end} but song.durationMs is {duration}")

    def assert_monotonic(name: str, times: list[int]) -> None:
        prev = None
        for i, t in enumerate(times):
            if t < 0 or t > duration + 50:
                errors.append(f"{name}[{i}] tMs={t} out of range [0,{duration}]")
                return
            if prev is not None and t < prev:
                errors.append(f"{name}[{i}] tMs={t} before previous ({prev}); must be sorted")
                return
            prev = t

    assert_monotonic("beats", [b["tMs"] for b in m.get("beats", [])])
    assert_monotonic("onsets", [o["tMs"] for o in m.get("onsets", [])])
    assert_monotonic("melody", [n["tMs"] for n in m.get("melody", [])])
    assert_monotonic("lyrics", [l["tMs"] for l in m.get("lyrics", [])])
    assert_monotonic("haptics", [h["tMs"] for h in m.get("haptics", [])])
    return errors


def write_manifest(m: dict, out_dir: str) -> str:
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, "manifest.json")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(m, f, indent=2)
    return path
