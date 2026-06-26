"""Precompute haptic events from beats + onsets.

`pattern` is on/off milliseconds (Web Vibration style); native backends
translate it to Taptic/Vibrator calls. We give each channel a recognisable
signature so the body can tell instruments apart (design doc cross-modal
language: bass = a solid buzz, drums = a quick double tap).
"""
from __future__ import annotations


def build_haptics(beats: list[dict], onsets: list[dict], sections: list[dict]) -> list[dict]:
    def section_at(t_ms: int) -> dict:
        for s in sections:
            if s["startMs"] <= t_ms < s["endMs"]:
                return s
        return sections[-1]

    events: list[dict] = []
    for b in beats:
        t = b["tMs"]
        sec = section_at(t)
        intense = sec["arousal"] >= 0.7
        if b["type"] == "kick":
            dur = 120 if intense else 90
            events.append({"tMs": t, "pattern": [dur], "channel": "bass", "intensity": round(b["strength"], 2)})
        elif b["type"] == "snare":
            events.append({"tMs": t, "pattern": [30, 40, 30], "channel": "drums", "intensity": round(b["strength"], 2)})

    # Accent strong non-drum onsets (e.g. a vocal/melody hit) with a light tick,
    # but never within 60ms of an existing beat haptic (avoid actuator overlap).
    beat_times = {e["tMs"] for e in events}
    for o in onsets:
        if o["stem"] in ("vocals", "other") and o["intensity"] >= 0.7:
            t = o["tMs"]
            if all(abs(t - bt) > 60 for bt in beat_times):
                events.append({"tMs": t, "pattern": [25], "channel": "accent", "intensity": round(o["intensity"], 2)})
                beat_times.add(t)

    events.sort(key=lambda e: e["tMs"])
    return events
