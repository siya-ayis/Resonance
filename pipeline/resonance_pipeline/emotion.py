"""Deterministic emotion -> palette + meaning (NO LLM on the critical path).

This MIRRORS app/src/visual/palette.ts `paletteForEmotion` exactly so the
pipeline and the renderer agree on palette names. The renderer falls back to
the same mapping if a manifest omits an explicit palette name, so the two MUST
stay in sync. Keep this table identical to the TS one.
"""
from __future__ import annotations

# The six pre-vetted palette names known to the renderer (app/src/visual/palette.ts).
KNOWN_PALETTES = {
    "cool-muted-indigo",
    "cool-muted-teal",
    "cold-contrast-violet",
    "warm-pastel-peach",
    "vivid-warm-amber",
    "vivid-warm-magenta",
}


def palette_for_emotion(valence: float, arousal: float) -> str:
    """valence in [-1,1], arousal in [0,1] -> palette name.

    Identical logic to `paletteForEmotion` in app/src/visual/palette.ts.
    """
    positive = valence >= 0
    intense = arousal >= 0.5
    if positive and intense:
        return "vivid-warm-magenta"
    if positive and not intense:
        return "warm-pastel-peach"
    if not positive and intense:
        return "cold-contrast-violet"
    return "cool-muted-indigo"


# A small, deterministic interpretation lookup. Per the ethics rule (design doc),
# meaning is ALWAYS clearly-labelled interpretation, never authoritative.
def meaning_for_emotion(valence: float, arousal: float) -> str:
    positive = valence >= 0
    if arousal >= 0.8:
        return "release and momentum" if positive else "tension at its peak"
    if arousal >= 0.5:
        return "energy gathering" if positive else "unsettled, building"
    if arousal >= 0.25:
        return "a warm, steady groove" if positive else "a pensive, low ebb"
    return "a quiet, hopeful beginning" if positive else "stillness, holding back"


def label_for_section(index: int, total: int, arousal: float) -> str:
    """A human-friendly section label from position + energy (heuristic)."""
    if index == 0:
        return "intro"
    if index == total - 1:
        return "outro" if arousal < 0.5 else "drop"
    if arousal >= 0.78:
        return "drop"
    if arousal >= 0.55:
        return "build"
    if arousal >= 0.35:
        return "verse"
    return "bridge"
