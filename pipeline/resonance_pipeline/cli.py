"""Resonance pipeline CLI.

Examples:
  # Build a manifest from any audio file (Demucs if installed, else pseudo-stems):
  python -m resonance_pipeline song.wav --out out/song2 --title "My Song" --artist "Me"

  # Run end-to-end on a built-in synthesised demo (no external audio needed):
  python -m resonance_pipeline --demo --out out/demo

Outputs: <out>/manifest.json  (+ <out>/master.wav and <out>/stems/*.wav)
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="resonance_pipeline", description="Build a Resonance Experience Manifest from audio.")
    p.add_argument("audio", nargs="?", help="input audio file (wav/mp3/flac/...)")
    p.add_argument("--demo", action="store_true", help="synthesise a built-in demo track instead of reading a file")
    p.add_argument("--out", required=True, help="output directory")
    p.add_argument("--title", default="Untitled")
    p.add_argument("--artist", default="Unknown")
    p.add_argument("--no-demucs", action="store_true", help="skip Demucs even if installed (force pseudo-stems)")
    p.add_argument("--no-stems", action="store_true", help="don't write per-stem audio (manifest only)")
    p.add_argument("--lyrics", help="optional sidecar lyrics JSON (list of LyricLine)")
    args = p.parse_args(argv)

    from . import analysis as A
    from .manifest import build_manifest, validate, write_manifest
    from . import separate as SEP

    os.makedirs(args.out, exist_ok=True)

    if args.demo:
        from .synth_demo import write_demo
        audio_path = os.path.join(args.out, "_demo_src.wav")
        write_demo(audio_path)
        if args.title == "Untitled":
            args.title = "Resonance Demo (synthesised)"
            args.artist = "Resonance pipeline"
        print(f"[demo] synthesised {audio_path}")
    elif args.audio:
        audio_path = args.audio
        if not os.path.exists(audio_path):
            print(f"error: no such file: {audio_path}", file=sys.stderr)
            return 2
    else:
        p.error("provide an audio file or --demo")
        return 2

    print(f"[analyze] {audio_path}")
    y, sr = A.load_audio(audio_path)
    an = A.Analysis(
        duration_ms=int(round(len(y) / sr * 1000)),
        bpm=0, key="", mode="",
    )
    # Full analysis (reuse the loaded signal for envelopes/sections to avoid re-decoding).
    an.bpm, an.beats = A.detect_beats(y, sr, an.duration_ms)
    key_name, an.mode = A.detect_key(y, sr)
    an.key = f"{key_name} {an.mode}"
    an.onsets = A.detect_onsets(y, sr, an.duration_ms)
    an.sections = A.detect_sections(y, sr, an.duration_ms)
    an.envelopes = A.compute_envelopes(y, sr, an.duration_ms)
    an.melody = A.detect_melody(y, sr, an.duration_ms)
    an.bpm = round(an.bpm, 2)
    print(f"  duration={an.duration_ms}ms bpm={an.bpm} key={an.key} "
          f"sections={len(an.sections)} beats={len(an.beats)} onsets={len(an.onsets)} melody={len(an.melody)}")

    # Master audio: copy/convert into the output dir as master.wav.
    import soundfile as sf
    master_rel = "master.wav"
    sf.write(os.path.join(args.out, master_rel), y, sr)

    stems = None
    if not args.no_stems:
        stems, real = SEP.separate(audio_path, y, sr, args.out, use_demucs=not args.no_demucs)
        print(f"[separate] {'Demucs (real)' if real else 'pseudo-stems (HPSS+bands fallback)'}: {list(stems)}")

    lyrics = None
    if args.lyrics and os.path.exists(args.lyrics):
        import json
        with open(args.lyrics, encoding="utf-8") as f:
            lyrics = json.load(f)

    manifest = build_manifest(
        an, title=args.title, artist=args.artist,
        audio_master=master_rel, stems=stems, lyrics=lyrics,
    )

    errors = validate(manifest)
    if errors:
        print("[validate] INVALID:", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    path = write_manifest(manifest, args.out)
    print(f"[validate] OK")
    print(f"[write] {path}")

    # Clean up the temp demo source.
    demo_src = os.path.join(args.out, "_demo_src.wav")
    if args.demo and os.path.exists(demo_src):
        os.remove(demo_src)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
