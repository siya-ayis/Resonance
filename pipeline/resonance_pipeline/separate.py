"""Stem separation.

Real source separation uses Demucs (htdemucs). It is heavy (PyTorch + a model
download) so it is OPTIONAL: if `demucs` isn't installed we fall back to
HPSS + band-filtered *pseudo-stems*. Pseudo-stems are NOT true separation — they
are a transparent approximation so per-stem audio playback and motion still work
end-to-end. The honest distinction matters (design-doc ethics): we never claim
the fallback is real instrument isolation.
"""
from __future__ import annotations

import os
from typing import Optional

import numpy as np


def demucs_available() -> bool:
    try:
        import demucs  # noqa: F401
        import torch  # noqa: F401
        return True
    except Exception:
        return False


def separate_real(path: str, out_dir: str) -> Optional[dict]:
    """Run Demucs if present. Returns {stem: relpath} or None if unavailable."""
    if not demucs_available():
        return None
    import subprocess
    import shutil

    stems_dir = os.path.join(out_dir, "stems")
    os.makedirs(stems_dir, exist_ok=True)
    # Demucs CLI: htdemucs -> bass/drums/vocals/other
    cmd = ["python", "-m", "demucs", "-n", "htdemucs", "-o", stems_dir, path]
    subprocess.run(cmd, check=True)
    # demucs writes <out>/htdemucs/<track>/<stem>.wav
    refs = {}
    base = os.path.splitext(os.path.basename(path))[0]
    src = os.path.join(stems_dir, "htdemucs", base)
    for stem in ("bass", "drums", "vocals", "other"):
        s = os.path.join(src, f"{stem}.wav")
        if os.path.exists(s):
            dst = os.path.join(stems_dir, f"{stem}.wav")
            shutil.move(s, dst)
            refs[stem] = f"stems/{stem}.wav"
    return refs or None


def _band(y: np.ndarray, sr: int, low, high) -> np.ndarray:
    from scipy.signal import butter, sosfilt

    nyq = sr / 2.0
    if low and high:
        sos = butter(4, [low / nyq, high / nyq], btype="band", output="sos")
    elif high:
        sos = butter(4, high / nyq, btype="low", output="sos")
    else:
        sos = butter(4, low / nyq, btype="high", output="sos")
    return sosfilt(sos, y).astype(np.float32)


def separate_pseudo(y: np.ndarray, sr: int, out_dir: str) -> dict:
    """HPSS + band filtering -> approximate per-stem WAVs. Transparent fallback."""
    import librosa
    import soundfile as sf

    stems_dir = os.path.join(out_dir, "stems")
    os.makedirs(stems_dir, exist_ok=True)
    y_harm, y_perc = librosa.effects.hpss(y)
    stems = {
        "bass": _band(y_harm, sr, None, 150.0),
        "drums": y_perc,
        "vocals": _band(y_harm, sr, 250.0, 4000.0),
        "other": _band(y_harm, sr, 4000.0, None),
    }
    refs = {}
    for name, sig in stems.items():
        peak = float(np.max(np.abs(sig))) or 1.0
        sf.write(os.path.join(stems_dir, f"{name}.wav"), (sig / peak * 0.9).astype(np.float32), sr)
        refs[name] = f"stems/{name}.wav"
    return refs


def separate(path: str, y: np.ndarray, sr: int, out_dir: str, use_demucs: bool = True) -> tuple[dict, bool]:
    """Returns (stem refs, used_real_demucs)."""
    if use_demucs:
        real = separate_real(path, out_dir)
        if real:
            return real, True
    return separate_pseudo(y, sr, out_dir), False
