# Resonance offline pipeline

The **offline half** of Resonance. It turns an audio file into an
**Experience Manifest** (`manifest.json`) — the single data contract the
on-device renderer plays back deterministically at 60fps — plus optional
per-stem audio. Heavy/AI work happens **once, here**; the app never does it on
the critical path.

```
audio.wav ──► [analysis: librosa] ──► sections + beats + onsets + envelopes + melody + key
          └─► [separation: Demucs│pseudo] ──► master.wav + stems/*.wav
                                   └────────► emotion ──► palette + meaning
                                                     └──► haptics precompute
                                                              └──► manifest.json  (validated)
```

## What it computes
| field | how |
|---|---|
| `song.bpm`, `beats` | `librosa.beat.beat_track`; beat type (kick/snare/hat) from bar position + energy |
| `song.key` | Krumhansl–Schmuckler chroma correlation (major/minor profiles) |
| `sections` | agglomerative clustering of beat-synced chroma+RMS+centroid; each gets **valence/arousal → palette + meaning** |
| `onsets` | `onset_detect`; per-onset stem assignment from STFT band energy (low→bass, high→drums, mid→vocals) |
| `envelopes` | HPSS + Butterworth bands → per-stem 0..1 intensity frames @ 50 ms (drives continuous motion) |
| `melody` | `librosa.pyin` f0 → grouped MIDI notes (the melody ribbon) |
| `haptics` | precomputed on/off-ms patterns: bass = solid buzz on kicks, drums = double-tap on snares, accent ticks on strong vocal/other onsets |
| `lyrics` | **not** auto-generated (no ASR; license-sensitive) — pass a sidecar via `--lyrics` |

The **emotion → palette** mapping (`emotion.py`) is a deterministic lookup that
**mirrors `app/src/visual/palette.ts` exactly** — no LLM on the critical path —
so the pipeline and renderer always agree on colour.

## Stem separation
Real separation uses **Demucs** (`htdemucs`). It's heavy (PyTorch + a model
download) so it's **optional**: if `demucs` isn't importable, the pipeline falls
back to **HPSS + band-filtered pseudo-stems**. Pseudo-stems are a transparent
approximation, **not** true isolation — the code and output never claim
otherwise (design-doc ethics rule).

## Setup
```powershell
cd pipeline
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
# optional, for REAL stems:  .venv\Scripts\python.exe -m pip install demucs torch
```

## Run
```powershell
# Built-in synthesised demo — runs end-to-end with no external audio:
.venv\Scripts\python.exe -m resonance_pipeline --demo --out out\demo

# Any audio file (Demucs if installed, else pseudo-stems):
.venv\Scripts\python.exe -m resonance_pipeline song.wav --out out\song2 --title "My Song" --artist "Me"

# Manifest only (skip writing stem audio):
.venv\Scripts\python.exe -m resonance_pipeline song.wav --out out\song2 --no-stems
```
Output: `<out>/manifest.json` (+ `master.wav` and `stems/*.wav`). The pipeline
self-validates (`manifest.validate`, mirroring the renderer's semantic rules).

### Bake a song into the app
```powershell
.venv\Scripts\python.exe -m resonance_pipeline song.wav --out ..\app\public\manifests\song2 --title "..." --artist "..."
```
Then point a manifest URL at `manifests/song2/manifest.json` (FEEL currently
loads `song1`, a curated demo whose hand-written lyrics the pipeline can't
synthesise; a song picker is the documented next step).

## Cross-validation (single source of truth)
The pipeline's output is validated by the **app's own** validator, proving the
contract holds across Python ⇄ TypeScript:
```powershell
cd ..\app
npx tsx scripts\check-manifest.mts ..\pipeline\out\demo\manifest.json   # -> VALID
```

## Tests
```powershell
cd pipeline
.venv\Scripts\python.exe tests\test_pipeline.py        # or: -m pytest tests -q
```
Covers: valid manifest end-to-end, contiguous sections covering the duration,
known palette names, palette mapping identical to the renderer, monotonic timed
arrays.
