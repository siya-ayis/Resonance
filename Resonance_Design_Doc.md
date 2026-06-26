# Resonance — Technical & Experience Design Document

> **A free, AI-powered, multi-sensory music world for the Deaf and hard-of-hearing (DHH).**
> Feel music in your body, see its emotion in light, understand its story, and create your own — on any phone, no special hardware.

**Status:** Design / pre-implementation — **revised after brutal-honesty critique pass** (scope cut to one hero pillar; LLM removed from critical path; demo de-risked). See [§19](#19-scope--build-plan-hackathon) and [§22](#22-open-questions) for locked decisions.
**Audience:** Engineering team + senior engineering reviewers
**Target challenge:** Microsoft Global Intern Hackathon 2026 — *Healthy Future* (accessibility & inclusive experiences); secondary fit: *Social Good*.
**Deliverable deadline:** Thu June 25, 11:59 PM PDT (video + GitHub repo).

---

## Table of Contents
1. [Vision & Problem Statement](#1-vision--problem-statement)
2. [Target Users & Personas](#2-target-users--personas)
3. [Goals & Non-Goals](#3-goals--non-goals)
4. [Research Foundation](#4-research-foundation)
5. [Design Principles](#5-design-principles)
6. [Product Overview — The Four Pillars](#6-product-overview--the-four-pillars)
7. [Pillar 1 — FEEL (Experience a Song)](#7-pillar-1--feel-experience-a-song)
8. [Pillar 2 — PLAY (Explore Instruments)](#8-pillar-2--play-explore-instruments)
9. [Pillar 3 — CREATE (Make Your Own)](#9-pillar-3--create-make-your-own)
9B. [Pillar 4 — SENSE (Live Sound → Sight + Touch)](#9b-pillar-4--sense-live-sound--sight--touch)
10. [Cross-Cutting Visual Design System](#10-cross-cutting-visual-design-system)
10B. [Visual Music Theory Foundation](#10b-visual-music-theory-foundation-the-science-of-sound--sight)
11. [Cross-Cutting Haptics Design](#11-cross-cutting-haptics-design)
12. [System Architecture](#12-system-architecture)
13. [The Experience Manifest (Data Contract)](#13-the-experience-manifest-data-contract)
14. [AI / Audio Processing Pipeline](#14-ai--audio-processing-pipeline)
15. [Real-Time Synchronization Engine](#15-real-time-synchronization-engine)
16. [Technology Stack & Justification](#16-technology-stack--justification)
17. [Accessibility, Safety & Ethics](#17-accessibility-safety--ethics)
18. [Risks & Mitigations](#18-risks--mitigations)
19. [Scope & Build Plan (Hackathon)](#19-scope--build-plan-hackathon)
20. [Demo / Video Plan](#20-demo--video-plan-25-min)
21. [Future Roadmap](#21-future-roadmap)
22. [Open Questions](#22-open-questions)

---

## 1. Vision & Problem Statement

**Problem.** ~1.5 billion people live with some hearing loss (WHO). Music — one of the most universal human experiences — is largely inaccessible to them. Existing solutions fall into three buckets, each with a fatal gap:

- **Haptic hardware** (Music: Not Impossible vests, CuteCircuit SoundShirt, SubPac, vibrating festival floors): immersive but **expensive, location-bound, and not adopted at home**.
- **Apple Music Haptics** (iOS 18): a **rhythm-only buzz** — no melody, emotion, meaning, or visuals; Apple Music only.
- **Generic visualizers**: pretty but **meaning-blind** and not designed for accessibility.

None use AI to translate the **full content** of a song — its emotion, individual instruments, structure, and lyrical meaning — into a synchronized **visual + tactile + textual** experience, for free, on a device people already own.

**What the AI actually does (one honest sentence).** Resonance uses AI to **separate a song into its individual instruments and read its emotional arc**, so it can give each instrument its own light and touch and let you *feel the bass while seeing the melody* — something a generic audio-reactive visualizer (which only sees one undifferentiated waveform) fundamentally cannot do. Everything else (beat/onset/pitch) is classical DSP, and we say so.

**Honest positioning vs. the closest competitor (Apple Music Haptics).** Apple **buzzes the beat** — rhythm-only, on iPhone, inside Apple Music. Resonance **translates the whole song** — emotion, instruments, structure, and meaning — into synchronized sight + touch, **for free in a browser**, on a phone you already own. We win on *depth and breadth of translation*; we openly concede Apple wins on *reach* (native iOS, no web-haptics limitation). That trade is deliberate and is the whole point of attacking the **adoption gap** (see §16).

**Vision.** Resonance gives DHH users the *whole life* of music: to **feel** it in their body, **see** its emotion and structure, **understand** its story, and **create** their own — democratized to any smartphone browser, designed *with* the DHH community rather than imposed upon it.

---

## 2. Target Users & Personas

| Persona | Description | Primary need |
|---|---|---|
| **Maya, 19 — profoundly Deaf since birth** | ASL-first, loves dance & bass, distrusts "hearing fixes." | Feel rhythm/bass; agency to create; cultural respect. |
| **Sam, 34 — late-deafened** | Remembers music, grieves losing it. | Reconnect emotionally with songs they loved. |
| **Priya, 27 — hard-of-hearing** | Hears bass + some sound with aids; misses lyrics/detail. | Comprehension + emotional depth; customization. |
| **Hearing allies / educators** | Friends, family, music teachers. | Shared experiences; teaching tools. |

**Design implication:** the product must serve both *experience* (Sam, Priya) and *agency/creation* (Maya), and be culturally authentic (co-design, no "cure" framing).

---

## 3. Goals & Non-Goals

### Goals
- G1. Translate any user-provided song into a synchronized, emotionally immersive **visual + haptic + lyric** experience.
- G2. Preserve **comprehension** (structure, emotion, meaning, musical events captions omit).
- G3. Provide **interactive agency**: explore instruments (PLAY) and compose (CREATE).
- G4. Run **free, in a browser, no special hardware**.
- G5. Be **customizable** (color, intensity, density) — a top community ask.
- G6. Be **safe** (photosensitivity) and **authentic** (co-designed, respectful).

### Non-Goals (v1)
- N1. **No auto-generated ASL avatar** — expressive ASL requires real Deaf-performer datasets; a poor avatar is inauthentic/offensive. (Deliberate, defensible choice.)
- N2. Not a hearing-aid / not a medical device.
- N3. No real-time separation of arbitrary live audio in v1 (preprocessing model instead).
- N4. Not a streaming-service replacement; user supplies their own audio file.
- N5. **No live upload in the demo.** The upload flow exists in the UI, but the hackathon demo plays **only from pre-baked manifests** (Demucs is too slow to run live on camera). Decision locked in §19/§22.
- N6. **LLM is not on the critical path.** Per-section palettes come from a **deterministic valence/arousal → curated-palette lookup** (§10.2). The LLM "art director" is an *optional enhancement* applied to at most one song if time allows — not a demo dependency. Decision locked in §22.

---

## 4. Research Foundation

Key findings driving the design (sources gathered during discovery):

- **Zhou et al., 2024 — "Exploring the Diversity of Music Experiences for DHH People"** (arXiv 2401.09025): DHH people engage music via sign, visual, and haptic cues; many **prefer bass-heavy, rhythm-centric, instrument-forward** music; existing visual/haptic tech has **low adoption**; strong desire for **customization**.
- **Nakahara et al., 2011:** multi-sensory (**visual + tactile**) music activates brain regions analogous to auditory music perception — scientific basis that combined senses approximate "hearing."
- **Turchet et al., 2019:** mapping **distinct frequency bands to distinct vibration patterns** improves instrument differentiation → validates per-stem haptic/visual channels.
- **Graham et al., 2022:** combining senses **improves emotion recognition** for DHH listeners.
- **Brooks & Rousseau, 2016:** vibrotactile conveys **rhythm well, melody poorly** → carry melody/emotion via **visuals**, rhythm/bass via **haptics**.
- **ASL music interpreting (Amber Galloway Gallego):** great translation "paints" music — rhythm via body, emotion via face, instruments via visual sound-effects — i.e., **expressive, not literal**.
- **First-person (2024–25):** "feeling + movement," want **lights synced to beat**, **bass/drums favorite**, value **community/shared** experiences and **creation**.

**Net design mandates:** bass/drums = hero; visuals carry melody/emotion; expressive not literal; customizable; free & instant (beat the adoption gap); co-designed; social & creative.

---

## 5. Design Principles

1. **Feel first.** The body channel (haptics) and rhythm are primary, not an afterthought.
2. **Expressive, not literal.** Visuals evoke emotion/energy (like an ASL interpreter "painting"), not a clinical spectrogram.
3. **Per-instrument channels.** Each stem gets a distinct visual + haptic identity (research-backed differentiation).
4. **Comprehension without clutter.** Meaning is offered in gentle layers, toggleable (lean-back vs lean-in).
5. **Customizable by default.** Users tune palette, particle density, haptic strength.
6. **Safe & inclusive.** WCAG color contrast; strict photosensitivity limits; reduced-motion support.
7. **Authentic & co-designed.** Built *from* DHH research and, where a DHH collaborator is available, *with* DHH input; celebrates Deaf creativity; never framed as a "cure." **Honesty rule:** we only use the words "co-designed / built *with* the Deaf community" if at least one real DHH person actually contributed or appears in the video. If we cannot secure a DHH voice, every such claim is downgraded to "**research-driven, designed *for* the DHH community**." We do not perform authenticity we didn't earn (see §17, §22).
8. **Private & local-leaning.** Prefer on-device/once-off processing; user audio is theirs.
9. **Decouple heavy AI from real-time rendering** (the *manifest* pattern) — performance + testability.

---

## 6. Product Overview — The Four Pillars

```
                         RESONANCE
   ┌───────────────┬────────────────┬────────────────┐
   │   FEEL        │     PLAY        │    CREATE       │
   │ Experience a  │  Explore what   │  Make your own  │
   │ song: AI →    │  instruments    │  melody; layer  │
   │ visuals +     │  feel/look like │  & loop; feel + │
   │ haptics +     │  (tap to play)  │  see your music │
   │ lyrics/meaning│                 │                 │
   └───────────────┴────────────────┴────────────────┘
        (immersion+depth)  (discovery)     (agency)
   + Pillar 4: SENSE (LIVE) — real-time mic → sight + touch (see §9B)
   Optional 5th pillar: TOGETHER (multi-phone synced playback).
```

All visual/color mapping across pillars is grounded in the **Visual Music Theory Foundation** (§10B) — cross-modal correspondence science plus selectable spectral / circle-of-fifths / emotion color modes.

**Hero decision — LOCKED: FEEL is the single hero.** There is no more hedging across this doc. FEEL is the one pillar we build to a polished, demo-complete, emotionally-finished state and it is what the video sells. Everything else is explicitly secondary:

| Pillar | Status (locked) | Rationale |
|---|---|---|
| **FEEL** | **HERO — build complete** | Most cinematic; carries the full emotion + comprehension story; the thing judges remember. |
| **PLAY** | **Bonus — build only if FEEL core is solid** | Cheap, high-delight, lowest risk; a nice "and they can play it too" beat — but not load-bearing. |
| **SENSE** | **Vision/short live aside — NOT a second hero** | It is architecturally a *different app* (live mic, no stems, no manifest, separate latency/noise tuning). We do **not** split effort building two heroes. If shown at all, it's a brief live aside, not insurance for FEEL. |
| **CREATE** | **Mockup only** (~10s montage) | Demonstrates the creativity answer to the community critique without build cost. |
| **TOGETHER** | **Mockup only** | Vision slide. |

**Why FEEL and not SENSE as the "safe" hero:** the critique correctly noted SENSE is a separate code path, not cheap insurance. Our real insurance is not a second pillar — it's the **Manifest pattern**: FEEL plays from pre-baked, deterministic manifests, so there is *no live pipeline to fail on camera* (§19). That removes the failure mode SENSE was meant to hedge.

---

## 7. Pillar 1 — FEEL (Experience a Song)

### 7.1 Aim
Let a DHH user drop in any song and be immersed in a synchronized, emotionally resonant world they can **feel** (haptics), **see** (expressive visuals), and **understand** (lyrics + meaning + structure). Primary axis: **emotional immersion**; secondary but required: **comprehension/depth**.

### 7.2 User stories
- As Priya, I drop an MP3 and within seconds the screen blooms with color and my phone pulses to the bass, so I feel the song's energy.
- As Sam, I see the chorus "lift" and feel the drop hit, so I re-experience a song I loved.
- As Maya, I toggle "lean-in" to read what the lyrics *mean* and see the song's structure, so I understand its story.
- As any user, I tune the color theme and vibration strength to my taste.

### 7.3 Functional requirements
- FR1. Accept a local audio file (MP3/WAV/M4A) via drag-drop / file picker. (Demo: also a curated library of pre-processed songs.)
- FR2. Produce/load an **Experience Manifest** (see §13) describing the full timeline.
- FR3. Render synchronized: (a) emotional color field, (b) per-instrument particle systems, (c) beat/section accents, (d) kinetic lyrics, (e) haptic pulses.
- FR4. **Lean-back / Lean-in** toggle (immersion vs comprehension overlays).
- FR5. **Pre-play "emotional map"**: a horizontal timeline of the song's mood/energy arc with section labels.
- FR6. **Customization — hackathon cut:** ship **ONE intensity slider** (scales motion + haptic strength together) as the only built control. Palette theme, particle density, and lyric-detail toggles are **designed and mocked** (shown in the drawer, non-functional or stubbed) — full customization is post-hackathon. Rationale: customization matters to real users (research-backed) but is invisible in a 2-minute video; one working slider proves the concept at a fraction of the cost.
- FR7. Transport controls (play/pause/seek) that keep all channels in sync.
- FR8. **UI-chrome accessibility (non-negotiable for an accessibility product):** the file picker, transport, intensity slider, and lean-in toggle must be **keyboard-operable and screen-reader-labelled** (DHH users are not necessarily vision/motor-typical, and judges test this by tabbing through the app). See §17.

### 7.4 Non-functional requirements
- NFR1. **Adaptive-by-default performance.** Target 60 fps on a good phone, but the engine **must degrade gracefully to a guaranteed-smooth 30 fps floor** on the judge's actual device by adaptively capping particle counts, disabling the bloom pass, and thinning layers (§10.5). A stutter-free 30 fps beats a janky 60. Never ship a target that risks a slideshow on unknown hardware.
- NFR2. Audio↔visual sync drift **< 50 ms**; haptic sync best-effort (see §11).
- NFR3. Manifest load + first frame **< 2 s** for pre-processed songs.
- NFR4. Photosensitivity: **never exceed 3 high-contrast luminance flashes/sec** (WCAG 2.3.1).
- NFR5. Respect `prefers-reduced-motion`.
- NFR6. **UI chrome is keyboard-navigable and screen-reader-labelled** (WCAG 2.1 AA for the app controls, not just the canvas).

### 7.5 UX flow
```
[Home] → drop song / pick from library
      → (if new) "Composing your experience…" progress (preprocessing)
      → [Emotional Map preview] → Play
      → [Immersive canvas] (lean-back default)
            ‹ toggle ›→ [Lean-in overlays: lyrics meaning, section labels, color legend]
      → [Customize] drawer
```

### 7.6 Visual design (detailed)
**Layered scene (back → front):**
1. **Emotion field (background).** A slow gradient mesh whose palette is chosen by the AI per section (see §10.2). Transitions cross-fade over ~1–2 s at section boundaries. Subtle large-scale flow (e.g., domain-warped noise) breathes with overall RMS energy.
2. **Bass layer.** Large, soft, low-opacity **bubbles/orbs** that swell and contract on bass energy; on strong bass onsets they "pulse" (scale 1.0→1.3→1.0) — visually echoing the haptic thump. Color: deep, saturated, low in the frame (grounded).
3. **Drum/rhythm layer (HERO).** Sharp, bright **spark bursts** emitted on detected onsets; kick = large central burst, snare = wider scatter, hats = small high-frequency flecks. This is the most prominent, most synchronized element.
4. **Melody layer.** **Flowing ribbons / streaks** whose vertical position maps to pitch (chromesthesia mapping, §10.3) and whose hue follows pitch class; legato notes = continuous ribbons, staccato = dashes.
5. **Vocal layer.** A central **glowing orb / aura** that brightens and expands with vocal presence/intensity; doubles as the anchor for kinetic lyrics.
6. **Lyric layer (front).** Kinetic typography: current line centered; word **scale/opacity/weight** track vocal loudness & emotion; upcoming line ghosted below. Optional meaning chip ("longing") and event captions ("beat drops", "guitar solo").

**Motion language.** Energy → particle count, speed, emission rate. Valence → palette warmth & curvature (warm/rounded = positive; cool/angular = tense). Section change → a visible "scene shift" (palette + density change) so structure is *felt*.

**Layout (mobile-first, portrait):**
```
┌─────────────────────────────┐
│        emotion field        │  ← full-bleed background
│      ✦ drum sparks ✦        │
│     ◯ vocal orb / lyric ◯   │  ← center band
│   ～ melody ribbons ～       │
│    ◌  bass bubbles  ◌       │  ← lower third
│ [emotional map ▸] [⚙ tune]  │  ← bottom bar (auto-hides)
└─────────────────────────────┘
```

### 7.7 Comprehension layer (the "depth")
- **Synced lyrics** with kinetic emphasis (from LRC/word timings).
- **Meaning chips:** AI-generated 1–2 word emotional tags per section + a one-line "what this part is about." **Labeling rule (ethics, M1):** these are presented as a **clearly-labelled interpretation** ("Resonance's read: *longing*"), never as authoritative fact about the song. We never tell a DHH user what a song "really means" — telling someone what their music means is paternalistic if wrong and presumptuous even if right. The artist's actual lyrics are the ground truth; our chip is an optional, fallible lens the user can ignore.
- **Musical-event captions:** "soft piano intro," "beat drops," "guitar solo," "key change" — the info captions normally omit (a documented gap).
- **Color legend (Lean-in):** teaches the visual vocabulary (bass=▢ color, drums=✦, etc.) so users get fluent at *reading* music over repeated plays.
- **Emotional map:** pre-play overview of the arc; also a progress scrubber during play.

### 7.8 Technical design (FEEL)
- **Preprocessing (offline/once per song):** stems (Demucs) → per-stem energy envelopes; beat/onset/tempo (librosa); structural segmentation; pitch/chroma; emotion (**deterministic** valence/arousal from audio features → curated-palette lookup, §10.2 — *not* an LLM on the critical path); lyric alignment → **Experience Manifest** (§13). (Optional: an LLM may *refine* meaning chips/captions for one song as an enhancement, never as a build dependency — see §14.)
- **Runtime:** load manifest + master audio (or stems). Use **Web Audio API** `AudioContext` as master clock; an `AnalyserNode` provides live FFT for organic micro-motion, while **scheduled manifest events** (beats, onsets, sections, lyric lines, haptics) drive precise accents via a look-ahead scheduler (§15).
- **Rendering:** PIXI.js (WebGL) particle systems, one container per stem; a fixed-timestep update reading (a) scheduled events and (b) smoothed analyser bands.

---

## 8. Pillar 2 — PLAY (Explore Instruments)

### 8.1 Aim
Give users **agency and discovery**: tap/drag to trigger instruments, each with a unique **visual + haptic fingerprint**, so they learn "what a drum feels like vs a bass." This is the "museum, play-it-yourself" magic and is cheap to build with high delight.

### 8.2 Functional requirements
- FR1. A pad/board of instruments (kick, snare, hat, bass, pad/chord, pluck/melody).
- FR2. On trigger: emit the instrument's signature visual burst **and** its haptic pattern; play audio sample (for hearing companions / residual hearing).
- FR3. Velocity by tap position/force-proxy (e.g., tap size/hold) → intensity of visual + haptic.
- FR4. A "feel the difference" guided micro-tour highlighting each instrument's fingerprint.

### 8.3 Visual + haptic fingerprints
| Instrument | Visual | Haptic pattern (ms) |
|---|---|---|
| Kick | Large central low-frame burst, deep color | strong single thump `[80]` |
| Snare | Wide bright scatter | sharp double `[30,40,30]` |
| Hat | Small high flecks, top frame | tiny tick `[15]` |
| Bass | Slow swelling orb, sustained glow | long low rumble `[200]` (pattern-simulated) |
| Pad/chord | Soft expanding aura, gradient | gentle wave `[40,60,40,60]` |
| Pluck/melody | Rising ribbon, hue by pitch | light pop `[25]` |

### 8.4 Technical design (PLAY)
- **Tone.js** for samples/synths + precise scheduling; visual + haptic triggered in the same callback for tight coupling.
- Pure client-side; no preprocessing. (Lowest-risk pillar — good fallback hero.)

---

## 9. Pillar 3 — CREATE (Make Your Own)

### 9.1 Aim
Authentic Deaf **creativity**: lay down loops/patterns with the PLAY instruments on a step grid, layer them, and feel + see the result in real time. Answers the community critique of "don't just interpret hearing music."

### 9.2 Functional requirements
- FR1. Step sequencer grid (e.g., 16 steps × N instrument lanes), adjustable tempo.
- FR2. Toggle steps; loop playback drives synchronized visuals + haptics.
- FR3. Save composition (manifest-compatible JSON) + share link / export.
- FR4. Visual feedback shows the playhead and active hits.

### 9.3 Technical design (CREATE)
- **Tone.js `Transport`** + `Sequence` for the loop and scheduling; reuses PLAY fingerprints and the same render/haptic layer.
- Composition serialized as a lightweight manifest (same renderer as FEEL → code reuse).

---

## 9B. Pillar 4 — SENSE (Live Sound → Sight + Touch)

### 9B.1 Aim
Real-time translation of **live/ambient audio** — a friend playing guitar, a piano, a busker, a live band, a room — into **color, shape, and vibration**, so a DHH person can **see and feel sound as it happens**. Turns any live moment into a shared, multi-sensory experience. This is the most immediate "magic" and the strongest *live* demo.

### 9B.2 How it differs from FEEL (this is why it's a separate pillar)
| | **FEEL** | **SENSE** |
|---|---|---|
| Input | Uploaded audio **file** | **Live microphone** stream |
| Processing | Heavy AI, **offline once** | **Real-time**, on every frame |
| Features available | Stems, lyrics, structure, emotion, meaning | Frequency bands, onset, pitch, loudness only |
| Stem separation | Yes (Demucs) | **No** (impossible in real time) |
| Lyrics/meaning | Yes | No |
| Latency | N/A (pre-rendered) | Must be **< ~100 ms** perceived |
| Data artifact | Experience Manifest (§13) | **None** — purely reactive |
| Strength | Depth + immersion | **Immediacy + social/live** |

### 9B.3 Functional requirements
- FR1. Request microphone permission (requires a user gesture).
- FR2. Analyze the live stream in real time and render synchronized visuals + haptics.
- FR3. Map: **frequency bands** (bass/mid/treble) → layered visuals; **pitch** (monophonic) → hue + height; **loudness** → brightness + size; **onset** → spark bursts; **bass/onset** → haptic pulses.
- FR4. Sensitivity controls: input gain, noise floor/threshold (rooms vary).
- FR5. Fully client-side, offline; no upload of audio.

### 9B.4 Technical design (SENSE)
```
getUserMedia({audio}) → MediaStreamAudioSourceNode → AnalyserNode
   ├─ getByteFrequencyData()  → band averaging (bass 0–7, mid 8–31, treble 32+)
   ├─ getByteTimeDomainData() → RMS loudness + autocorrelation pitch (Pitchy/YIN)
   └─ energy-flux onset detector (energy > runningAvg × threshold)
        → drive PIXI visuals (reuse engine) + Haptic Scheduler (§11)
```
- **Bands → channels:** bass→bottom orbs, mid→ribbons, treble→sparks (same visual language as FEEL, §10).
- **Pitch → hue/height** via the Color Engine (§10B.6); reliable for **monophonic** sources (solo voice/instrument); degrades on polyphony/noise.
- **Onset detection:** running-average energy-flux threshold (lightweight, robust).
- **Latency budget:** AnalyserNode read + render ≈ tens of ms; target < 100 ms end-to-end (imperceptible as "lag" for visuals).

### 9B.5 Constraints / honesty
- No stems or lyrics in real time; **pitch detection is monophonic** and noise-sensitive. **Mitigation:** the band-energy → visuals path *always* works (even on noisy polyphonic audio); pitch coloring is an *enhancement* layered on top, auto-disabled when confidence is low.

### 9B.6 Demo value (de-risked role — read this honestly)
- **SENSE is NOT a second hero and NOT FEEL's insurance policy.** The critique correctly flagged that SENSE is architecturally a *different application* (live mic, no stems, no manifest, its own latency budget and room-noise calibration). Building it to demo-quality is a second project, and "build two heroes" is how a 2-day team finishes zero.
- **Our actual insurance against an on-camera pipeline failure is the Manifest pattern**, not SENSE: FEEL plays from pre-baked deterministic manifests, so there is nothing live to crash (§19).
- **If shown at all**, SENSE is a brief, optional *live aside* ("and it works on live sound too") near the end — built only if FEEL + PLAY are already solid. Otherwise it stays a vision slide. Lowest data dependency, yes — but lowest priority for build effort.

---

## 10. Cross-Cutting Visual Design System

### 10.1 Stem → visual channel mapping
| Stem | Form | Spatial zone | Drives |
|---|---|---|---|
| Bass | Orbs/bubbles | lower third | size/pulse |
| Drums | Sparks/bursts | full / center | emission on onset |
| Melody/other | Ribbons/streaks | mid | position=pitch |
| Vocals | Glowing aura | center | brightness, lyric anchor |

### 10.2 Emotion → palette mapping
Derive **valence** (negative↔positive) and **arousal** (calm↔intense) per section (audio features + LLM). Map to a curated palette set (not raw HSV, to guarantee aesthetics + contrast):

| Valence \ Arousal | Calm | Intense |
|---|---|---|
| Positive | warm pastels (peach, gold, mint) | vivid warms (coral, amber, magenta) |
| Negative | cool muted (slate, indigo, teal) | cold high-contrast (steel, violet, crimson) |

**Critical-path implementation — DETERMINISTIC lookup (LLM removed):** the preprocessing pipeline computes **valence** and **arousal** per section from audio features (mode major/minor, tempo, RMS, spectral centroid) and selects a named palette + particle style from this **fixed lookup table**. No network call, no API key, no hallucination, fully reproducible — exactly what a real-time renderer and a reproducible demo need.

**Optional LLM enhancement (NOT a dependency):** if time remains, an LLM "art director" may *refine* the palette/style choice for **one** song to add per-song flavor. This is layered on top of a working deterministic baseline and can be deleted at any moment with zero demo impact. The critique was explicit: the LLM is high-effort, high-risk (latency, cost, non-determinism, hallucination), and low *visible* reward (audiences can't attribute a color choice to "AI"). So it never gates the build.

### 10.3 Pitch → color (chromesthesia-inspired)
Optional melody coloring by pitch class (12-tone → hue wheel), e.g. C→red … B→violet (ROYGBIV-style), modulated by the section palette so it never clashes. Octave → brightness; this is a *secondary* accent, not the main color driver (emotion leads).

### 10.4 Motion & easing
- Global `energy` (smoothed RMS) scales emission/speed.
- Beats trigger eased "pop" envelopes (attack 30–60 ms, decay 150–300 ms).
- Section transitions: 1–2 s cross-fade of palette + density.
- All randomness seeded per-song for reproducible demos.

### 10.5 Rendering approach
- **PIXI.js** (WebGL2) with `ParticleContainer` per stem; pooled sprites (no per-frame allocation).
- Additive blending for glow; a light bloom/post pass if budget allows.
- Fixed-timestep simulation (e.g., 60 Hz) decoupled from render; cap particle counts adaptively by measured FPS.

---

## 10B. Visual Music Theory Foundation (The Science of Sound ↔ Sight)

> This section is the scientific spine of Resonance. It is deliberately **intellectually honest**: it separates what is *empirically supported* from what is *mathematical analogy* from what is *artistic convention*. Reviewers/judges will probe this; clarity here is a strength.

### 10B.1 Historical lineage (credibility)
Translating sound to sight is a 300-year project: **Castel's ocular harpsichord** (c.1725) → 19th-c. **color organs** (Rimington) → **Scriabin's *clavier à lumières*** (Prometheus, 1910) → **Kandinsky's** visual-music abstraction → 20th-c. visual-music film (Fischinger, McLaren) → modern audio-reactive software (MilkDrop, iTunes). Resonance stands in this lineage and brings it to accessibility.

### 10B.2 The legitimate science — Cross-Modal Correspondences (our real foundation)
Independent of any color theory, cognitive science shows **universal, non-arbitrary** associations between sound and vision (not limited to synesthetes):
- **Pitch ↔ brightness/elevation:** high pitch → brighter/higher; low pitch → darker/lower. (Marks, 1974; Spence, 2011, *Attention, Perception, & Psychophysics*.)
- **Loudness ↔ size/brightness:** louder → bigger/brighter.
- **Tempo/rhythm ↔ motion rate.**
- **Timbre ↔ shape/texture:** smooth tone → round/smooth; harsh tone → jagged/spiky.
These are **empirically supported** and are *why* our mapping feels intuitively "right" even to someone who has never heard sound. **This is the foundation we lead with.**

### 10B.3 The frequency-doubling map (spectral mode) — honest framing
A note's frequency raised ~**40 octaves** (×2⁴⁰) lands in the visible-light band; wavelength `λ = c / f` then yields a color. **Verified against the "Musical Colors" chart** (432 Hz tuning): A4 = 432 → 432×2⁴⁰ ≈ 4.75×10¹⁴ Hz → λ ≈ **632 nm → orange** ✓ (B4 486→562 nm, C5 513→532 nm also match).
- **Status:** a *reproducible mathematical analogy* (frequency-ratio), **not** a physical law — sound is a mechanical/longitudinal wave; light is electromagnetic/transverse; there is no physical resonance between them. We present it as a principled, beautiful *aesthetic* mapping, never as "the true color of sound."

### 10B.4 Circle-of-fifths → color wheel (harmonic mode)
The 12 pitch classes arranged by perfect fifths map onto the 12-hue color wheel (Scriabin-style): **harmonically close keys → analogous colors; distant/dissonant → complementary colors.** Consonance renders as blended/analogous palettes; dissonance as clashing/complementary. A music-theory **convention** (useful, not physical).

### 10B.5 Our mapping framework (feature → visual dimension)
Grounded in §10B.2 (Gestalt + cross-modal):
| Audio feature | Visual dimension | Basis |
|---|---|---|
| Pitch | hue + vertical position | cross-modal (pitch↔height/brightness) |
| Loudness | brightness + size + opacity | cross-modal (loudness↔magnitude) |
| Timbre | shape + texture | cross-modal (roughness↔jaggedness) |
| Harmony | color harmony + clustering | Gestalt proximity/similarity |
| Rhythm/tempo | motion + pulsation | cross-modal (tempo↔motion) |
| Melody line | continuous ribbon (figure) | Gestalt continuity/figure-ground |
Gestalt rules organize legibility: **figure/ground** (melody stands out, rhythm/harmony recede), **similarity** (repeated motifs share color/shape), **proximity** (chord tones cluster), **continuity** (melody = smooth path).

### 10B.6 The Color Engine (spec + code)
A pluggable engine with **selectable, labeled modes**. **Hackathon build scope (M4 cut):** only **`emotion` mode is built and shipped** for the demo. `spectral` (frequency-doubling/wavelength) and `fifths` (circle-of-fifths) modes are **fully specified here as documented future "lenses" but NOT built for the hackathon.** Rationale: (a) almost no 2-minute-demo viewer will toggle a color-theory lens; (b) the wavelength/432 Hz tuning work is a genuine time-sink (speed-of-light constants, per-pitch-class octave normalization) for near-zero demo payoff; (c) shipping `spectral` as a headline feature would *contradict* our own honesty stance (§10B.3) that the note→light map is an analogy, not physics. We lead with **cross-modal correspondence** (§10B.2) — the real, empirically-grounded science — and keep the rest as principled, on-paper expressive options.

```ts
type ColorMode = 'spectral' | 'fifths' | 'emotion';

const C = 299_792_458;                 // speed of light, m/s
const VIS_MIN = 380, VIS_MAX = 780;    // visible band, nm

// Spectral mode: pitch class → wavelength → RGB (frequency-doubling analogy).
// Normalize per pitch class: choose octave shift k so λ ∈ visible band → 12 stable hues.
function noteToWavelengthNm(freqHz: number): number {
  let f = freqHz;
  while (C / f * 1e9 > VIS_MAX) f *= 2;   // lift octaves until inside visible
  while (C / f * 1e9 < VIS_MIN) f /= 2;
  return (C / f) * 1e9;                    // nm
}

// Standard visible-spectrum wavelength → RGB approximation (gamma-corrected).
function wavelengthToRgb(nm: number): [number, number, number] { /* see research algo */ }

// Fifths mode: pitchClass (0..11 around circle of fifths) → hue wheel.
function fifthsToHue(pitchClass: number): number {
  const CIRCLE = [0,7,2,9,4,11,6,1,8,3,10,5];          // C G D A E B Gb Db Ab Eb Bb F
  return (CIRCLE.indexOf(pitchClass) / 12) * 360;       // degrees
}

// Emotion mode: section valence/arousal → curated palette (§10.2).
```
- **Cross-modal overlays (all modes):** map **loudness → brightness/size**, **pitch → vertical position**, applied on top of the chosen hue source. This keeps the empirically-grounded cues active regardless of color mode.
- **Tuning note:** spectral mode depends on tuning (440 vs 432 Hz) — expose as a setting; default 440, offer 432 to match the "Musical Colors" reference.

### 10B.7 Positioning statement (for video & judging)
> "We ground Resonance in the science of **cross-modal perception** — the universal way human brains link pitch to brightness and loudness to size — and offer historically-rooted color mappings (spectral and circle-of-fifths) as expressive lenses. We're transparent that the note-to-light map is a frequency analogy, not a physical equivalence — the *perceptual* correspondences are what make it feel real."

---

## 11. Cross-Cutting Haptics Design

### 11.1 Reality check (must read)
- **Web Vibration API (`navigator.vibrate`)** is supported on **Android Chrome/Firefox** and desktop Chrome, but **NOT on iOS Safari** (Apple does not expose it to the web). It requires a prior **user gesture** and provides **pattern only (on/off ms), no amplitude control**, and timing is **best-effort** (can be throttled in background tabs).
- **Implication:** browser haptics are **coarse** and **Android-only** on the open web.

### 11.2 Strategy
- **Primary demo target: Android Chrome** (web app) — full `navigator.vibrate`.
- **Fidelity model:** since amplitude isn't controllable, encode intensity as **pattern density/length** (e.g., stronger bass = longer `[200]`; light hat = `[15]`). Distinguish bass vs drums by **distinct rhythmic patterns** (research shows pattern differentiation aids instrument recognition).
- **Sync:** schedule `vibrate()` calls a few ms ahead via the look-ahead scheduler aligned to beats/onsets; accept that fine sync is approximate. Avoid overlapping calls (a new `vibrate` cancels the previous) — maintain a single haptic scheduler that merges channels into one pattern stream per tick.
- **iOS / richer haptics (stretch):** wrap with **Capacitor** + `@capacitor/haptics` (native `UIImpactFeedbackGenerator`) to get iOS Taptic impacts (still discrete, no continuous amplitude). Document as a packaging option, not v1 web.
- **Graceful degradation:** if no vibration support, the visual layer fully conveys the experience; show a "best on Android / add-to-homescreen" hint.

### 11.3 Haptic channel mixer (pseudocode)
```
// Single scheduler merges per-stem haptic events into one device pattern.
onTick(now):
  events = manifest.hapticEventsBetween(lastTick, now + LOOKAHEAD)
  pattern = mergeToPattern(events)   // bass thumps + drum hits → [ms,...]
  if pattern.length: navigator.vibrate(pattern)
```

### 11.4 Making the buzz *visible* — the camera-friendly haptic layer (CRITICAL for the demo)
The critique flagged an existential demo risk: **the emotional hook is "the phone vibrates to the bass," but vibration barely reads on camera.** If the felt channel is invisible on video, Resonance looks like exactly the "pretty but meaning-blind visualizer" it critiques. We solve this two ways:

1. **On-screen haptic proxy (built into the renderer).** Every haptic pulse fires a *synchronized, unmistakable on-screen cue* at the same instant: a screen-edge bloom / a pulsing "haptic ring" at the bottom of the frame that scales exactly with the vibration pattern. This makes the *felt* event *seen* — both for the live DHH user and for the camera. It is part of the visual language, not a debug overlay, and respects the photosensitivity limiter (§17).
2. **Physical capture technique for filming.** Record the buzz with a second device: place the phone on a resonant surface or rest a light object (e.g., a few grains of rice / a small bead) on it so the vibration is *visibly* shaken on the bass hits, and/or show an on-screen vibration-meter app side-by-side. The close-up should make "the phone is alive" undeniable.

**Net:** the demo never relies on the audience *imagining* a vibration — they always *see* it pulse in sync. This converts the haptic differentiator from a liability into a hero shot. (Tracked as a top demo risk in §18, R10.)

---

## 12. System Architecture

```
┌──────────────────────────── CLIENT (browser, mobile-first) ────────────────────────────┐
│  React + TypeScript (Vite)                                                              │
│  ┌──────────────┐  ┌───────────────────────┐  ┌───────────────┐  ┌───────────────────┐ │
│  │ UI / Router  │  │  Audio Engine         │  │ Visual Engine │  │ Haptic Scheduler  │ │
│  │ (modes,      │  │  Web Audio API        │  │ PIXI.js WebGL │  │ navigator.vibrate │ │
│  │  customize)  │  │  + Tone.js (PLAY/CRT) │  │ particle sys  │  │ (Android)         │ │
│  └──────┬───────┘  └─────────┬─────────────┘  └──────┬────────┘  └────────┬──────────┘ │
│         │                    │  master clock (AudioContext.currentTime)   │            │
│         └──────────── Sync Engine (look-ahead scheduler, §15) ────────────┘            │
│                                   ▲ consumes                                            │
│                          Experience Manifest (JSON, §13)                                │
└───────────────────────────────────┼────────────────────────────────────────────────────┘
                                     │ fetch (pre-processed) / upload (new)
┌──────────────────────── PREPROCESSING SERVICE (Python, offline/Azure) ──────────────────┐
│ FastAPI (or CLI for demo)                                                                │
│  Demucs (stems) → librosa (beat/onset/tempo/structure/chroma) → feature/emotion calc    │
│  → Azure AI Foundry (LLM "art director": palette+style; lyric meaning/emotion; captions) │
│  → Azure Speech / Whisper (lyric transcription+alignment) → emits Experience Manifest    │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

**Key architectural decision — the Manifest pattern.** All heavy/nondeterministic AI work happens **once, offline**, producing a static **Experience Manifest**. The client is a **deterministic real-time renderer** of that manifest. Benefits: 60 fps performance, reproducible demos, testability, offline playback, and clean separation of concerns (senior-review friendly).

**Deployment.** Frontend on **Azure Static Web Apps**; preprocessing as an **Azure Container App / Function** (or run locally in **WSL** for the demo). AI via **Azure AI Foundry** + **Azure Speech**.

---

## 13. The Experience Manifest (Data Contract)

A single JSON document fully describing a song's multi-sensory timeline. Frontend renders purely from this + the audio.

```jsonc
{
  "version": "1.0",
  "song": { "title": "…", "artist": "…", "durationMs": 213000, "bpm": 120, "key": "A minor" },
  "audio": { "master": "song.mp3", "stems": { "bass": "bass.mp3", "drums": "drums.mp3",
              "vocals": "vocals.mp3", "other": "other.mp3" } },
  "globalStyle": { "particleStyle": "bubbles+sparks", "seed": 42 },
  "sections": [
    { "id": 0, "label": "intro", "startMs": 0, "endMs": 16000,
      "valence": 0.2, "arousal": 0.3, "palette": "cool-muted-indigo",
      "meaning": "a quiet, hopeful beginning", "events": ["soft piano intro"] }
    // … verse, chorus, drop, bridge, outro
  ],
  "beats":   [ { "tMs": 500, "strength": 0.9, "type": "kick" }, /* … */ ],
  "onsets":  [ { "tMs": 512, "stem": "drums", "intensity": 0.8 }, /* … */ ],
  "envelopes": {            // 50–100ms frames, normalized 0..1, per stem
    "frameMs": 50,
    "bass":   [0.0, 0.1, 0.7, /* … */],
    "drums":  [/* … */], "vocals": [/* … */], "other": [/* … */]
  },
  "melody": [ { "tMs": 1000, "midi": 69, "durMs": 250 }, /* pitch for color/position */ ],
  "lyrics": [ { "tMs": 8000, "line": "…", "words": [ {"tMs":8000,"w":"…"} ],
               "emotion": "longing" } ],
  "haptics": [ { "tMs": 500, "pattern": [80], "channel": "bass" }, /* precomputed */ ]
}
```

**Notes.** `envelopes` give smooth per-stem intensity for organic motion; `beats`/`onsets` give crisp accents; `haptics` are precomputed from beats+bass to keep runtime cheap; `sections` carry emotion + meaning + **deterministically-chosen** palette (LLM optional, §10.2). Versioned for forward-compat. CREATE mode emits a reduced manifest (beats/onsets/haptics from the sequencer; no stems).

**Copyright rule for committed manifests (M2).** Manifests are committed to a **public** repo, so the `lyrics[]` field (and any `meaning` text derived from lyrics) must contain **only Creative-Commons / user-owned lyric text**. Do not commit a manifest whose `lyrics` embed copyrighted lyric lines, even though the original audio is gone. Demo songs are chosen specifically so their lyrics are CC/owned (§17, §22 OQ#2).

---

## 14. AI / Audio Processing Pipeline

**Stage A — Source separation.** `Demucs (htdemucs)` → 4 stems (bass, drums, vocals, other). PyTorch; GPU ideal, CPU ~ a few× realtime. Run offline per song. (Fallback: Spleeter — faster, lower quality.)

**Stage B — Rhythm & structure.** `librosa`: `beat_track` (bpm + beat times), `onset_detect` per stem, optional `msaf`/novelty-based **segmentation** into sections. Chroma/pitch via `librosa.cqt`/`pyin` for melody coloring.

**Stage C — Features & emotion (deterministic critical path).** Per section compute tempo, RMS energy, spectral centroid, mode (major/minor) → heuristic **valence/arousal** → **fixed curated-palette lookup** (§10.2). This stage requires **no network and no LLM** and is fully reproducible. **Optional enhancement only:** an LLM may refine per-section meaning chips + musical-event captions for *one* demo song (structured JSON mode); this is layered on top and is deletable with zero demo impact. The LLM is never a build gate (see §10.2, N6).

**Honest scope of "AI" (for reviewers/judges).** The load-bearing AI is **source separation (Demucs)** — it's what lets us give each instrument its own light + touch, the thing a generic one-waveform visualizer can't do. Beat/onset/tempo/pitch are **classical DSP** (librosa), not ML, and we say so. Lyric transcription (Whisper/Azure Speech) is ML. Emotion→palette is a **deterministic heuristic**, not a model. We do not inflate "AI-powered." (See the one-sentence statement in §1.)

**Stage D — Lyrics.** Prefer user-provided **LRC** (timed) for demo accuracy; general path: **Whisper / Azure Speech** word-level timestamps on the **vocal stem** (separation improves transcription). Align to time.

**Stage E — Assemble manifest.** Merge all into the §13 schema; precompute haptic patterns from beats + bass envelope.

**Microsoft integration:** lyric transcription (Stage D) via **Azure Speech**; the *optional* meaning/caption enhancement (Stage C) via **Azure AI Foundry** (LLM) when used; pipeline hostable on **Azure Container Apps**; frontend on **Azure Static Web Apps**. (Scores "Microsoft-native" with judges. Note: Foundry/Speech are *additive* integrations, not load-bearing for the core FEEL demo — the deterministic critical path runs without them.)

---

## 15. Real-Time Synchronization Engine

**Master clock:** `AudioContext.currentTime` (high-resolution, audio-thread-backed). Never use `setInterval`/`Date.now()` for musical timing.

**Look-ahead scheduler** (Chris Wilson's "A Tale of Two Clocks" pattern):
```
SCHEDULE_AHEAD = 0.1 s; TICK = 25 ms
schedulerTick():
  while nextEvent.tMs/1000 < audioCtx.currentTime + SCHEDULE_AHEAD:
     dispatch(nextEvent)          // enqueue visual accent + haptic at precise time
     nextEvent = events.next()
  setTimeout(schedulerTick, TICK)
```
- **Visuals:** the render loop (`requestAnimationFrame`) reads (a) smoothed `AnalyserNode` bands for continuous motion and (b) a queue of scheduled accents (beats/onsets/section changes) timestamped to fire on the right frame.
- **Haptics:** scheduled slightly ahead; merged into a single device pattern stream (§11.3).
- **Seek/pause:** reset scheduler pointer by binary-search into event arrays at the new time.
- **Drift target:** audio↔visual < 50 ms (imperceptible); haptics best-effort.

### 15.1 Sync validation harness (makes "testable" real — M5)
The Manifest pattern is sold as *testable*; here is the actual harness so the claim is more than rhetoric:
- **Deterministic seeded playback:** all randomness is seeded per song (§10.4), so a given manifest produces a frame-identical run every time — eyeball-diffable and screen-recordable for the video.
- **Drift probe (dev overlay):** a toggleable overlay logs, for each scheduled beat, `(scheduledTMs − audioCtx.currentTime*1000)` and renders a running max-drift readout. Fail the build/demo-check if max drift > 50 ms on the target device.
- **Manifest schema validation:** validate every manifest against the §13 schema (types, monotonic timestamps, sections covering [0, durationMs]) before it's allowed into the demo set — catches a malformed hand-authored manifest before it crashes on camera.
- **Headless smoke test:** load each demo manifest, run the scheduler for the full duration without rendering, assert no event is dropped/out-of-order. Cheap CI-free guard.

---

## 16. Technology Stack & Justification

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** | Type-safe manifest contract; senior-review friendly. |
| Framework | **React + Vite** | Fast HMR, component modes, large ecosystem. |
| Visuals | **PIXI.js (WebGL2)** | High-performance 2D particles (thousands of sprites), simpler than raw Three.js for this. |
| Audio playback/analysis | **Web Audio API** | Sample-accurate clock + `AnalyserNode` FFT. |
| Synthesis/sequencing | **Tone.js** | Transport/Sequence scheduling for PLAY/CREATE; samples + synths. |
| Audio features (client, real-time) | **Meyda** | Client-side RMS/centroid/onset for SENSE (live). |
| Pitch detection (client, real-time) | **Pitchy** (YIN/autocorrelation) | Monophonic pitch → hue/height for SENSE. |
| Haptics | **Web Vibration API** (+ Capacitor Haptics stretch) | Free, built-in; Capacitor for iOS native. |
| Stems (offline) | **Demucs** (htdemucs) | SOTA separation quality. |
| Rhythm/structure (offline) | **librosa** (+ msaf) | Mature beat/onset/segmentation. |
| Lyrics | **Whisper / Azure Speech** + LRC | Word-level timing; demo via LRC. |
| AI art director / meaning | **Azure AI Foundry (LLM, JSON mode)** — *optional enhancement only* | Per-song palette/meaning refinement for ≤1 song; **not on critical path** (deterministic lookup §10.2 is the baseline). Microsoft-native bonus. |
| Hosting | **Azure Static Web Apps** + **Container Apps/Functions** | Simple deploy; Microsoft-native. |
| Local dev | **WSL** for Demucs/librosa | Per hackathon resources. |

**Why a web app (not native):** zero-install, instant access on any phone = directly attacks the *adoption gap* that sank hardware solutions (the central insight). Trade-off accepted: iOS web haptics unavailable in v1 (mitigations in §11).

**Owning the iOS gap honestly (H4).** This is a real strategic hole, not a footnote: judges demo on whatever phone they're holding, and if it's an iPhone, the haptic channel — half our differentiator — is silent on the open web. We address it head-on instead of hiding it:
- **The visuals + on-screen haptic proxy (§11.4) fully carry the experience with zero vibration**, so an iPhone user still sees a synchronized, emotionally complete world (and *sees* every "buzz" as an on-screen pulse).
- **Demo on a known Android device** we control, so the *felt* channel is guaranteed for the hero shot; treat any iPhone in the room as the graceful-degradation story, not the primary.
- **Capacitor + `@capacitor/haptics`** is the documented path to native iOS Taptic feedback (stretch, not v1 web).
- **Framing line for judges:** "On the open web, only Android exposes vibration — so on iPhone you *see* the touch; install our Capacitor build and you *feel* it natively. We chose the browser because instant, install-free access is exactly what every prior hardware solution lacked." Honesty converts a weakness into the adoption-gap thesis.

---

## 17. Accessibility, Safety & Ethics

- **Photosensitive epilepsy (critical):** enforce WCAG 2.3.1 — **no more than 3 general/red flashes per second**; clamp global luminance-change rate; provide a **"reduce flashing"** mode and honor `prefers-reduced-motion`. Implement a luminance-delta limiter in the render loop. *(Senior reviewers + accessibility judges will check this.)*
- **Color accessibility:** palettes pre-vetted for contrast; never rely on color alone (form + position + motion also encode meaning); colorblind-safe theme option.
- **UI-chrome accessibility (don't be an inaccessible accessibility app).** The app's *controls* — file picker, transport, intensity slider, lean-in toggle, mic-permission prompt — must be **keyboard-operable, focus-visible, and screen-reader-labelled** (ARIA), with adequate touch-target sizes. DHH users are not necessarily vision- or motor-typical, and an accessibility judge will literally tab through the app. The immersive canvas has a text/structural equivalent (the emotional map + section labels) so it isn't an opaque blob to assistive tech. (Tracked as NFR6, FR8.)
- **Cultural authenticity (honesty-gated, H5).** Co-design with ≥1 DHH user **if secured**; quote DHH musicians (e.g., Christine Sun Kim, Mandy Harvey) in the narrative; framing = **access + celebration**, never "fixing" deafness; no auto-ASL avatar (N1). **We only claim "co-designed / built *with* the Deaf community" if a real DHH person actually contributed or appears.** If none is secured by the deadline, all such language is downgraded to "**research-driven, designed *for* the DHH community**" everywhere (doc, README, video). Performing co-design we didn't do is worse than not claiming it — a knowledgeable judge reads it as appropriation. (See §5 principle 7, §22 OQ#5.)
- **Privacy:** user audio processed locally/once; no third-party upload beyond the user's own AI calls; be explicit in UI.
- **Licensing:** demo uses royalty-free / Creative-Commons tracks (or user-owned files); lyrics from user-provided LRC or CC sources to avoid copyright issues in the public repo/video. **Committed manifests must embed only CC/owned lyric text** (§13, M2).
- **Honest claims:** we *approximate* and *complement* music perception; we don't claim to restore hearing.

---

## 18. Risks & Mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | iOS Safari has no web vibration | High | Demo on Android; visuals stand alone; Capacitor wrapper as stretch; clear device guidance. |
| R2 | Demucs too slow / heavy for live upload in demo | High | **Pre-process curated songs**; show "upload" as flow but rely on cached manifests for the video. |
| R3 | Real-time perf (particles) on phones | Med | PIXI WebGL + sprite pooling + adaptive particle caps by measured FPS. |
| R4 | Lyric transcription inaccurate on music | Med | Use **LRC** for demo songs; Whisper on vocal stem as general path. |
| R5 | Haptic↔audio sync imprecise/coarse | Med | Pattern-based differentiation; look-ahead scheduling; set expectations (feel > millisecond precision). |
| R6 | Scope creep across multiple pillars in ~2 days | High | Hero = FEEL; PLAY as working slice; CREATE/TOGETHER mocked. Strict cut-line (§19). |
| R7 | Photosensitivity harm | High | Hard luminance/flash limiter + reduced-motion (§17). |
| R8 | Authenticity criticism | Med | DHH co-design + respectful framing + cite community; **honesty-gated claims** — downgrade to "designed *for*" if no DHH voice (§5/§17/§22). |
| R9 | Copyright in public repo/video | Med | Royalty-free/CC tracks only; **committed manifests embed only CC/owned lyrics** (§13). |
| R10 | **Haptic buzz invisible on camera → looks like a generic visualizer** | **High** | **On-screen haptic proxy** (every buzz = synced on-screen pulse) + physical capture trick (object/rice on phone, vibration-meter side-by-side); never rely on the audience imagining the buzz (§11.4). |
| R11 | **Judge can't tell what the "AI" does in 2 min** | High | Lead with the one-sentence "AI separates instruments + reads emotion" line (§1/§14); make per-instrument light+touch the visible proof; don't oversell DSP as AI. |
| R12 | **Integration-last failure (pieces never meet by hour 47)** | **High** | Manifest JSON defined as the contract in hour 1; hand-authored sample manifest unblocks parallel work; **forced end-to-end integration checkpoint at hour 24** on a real phone (§19). |
| R13 | **Building two heroes (FEEL *and* SENSE) → finishing zero** | High | FEEL is the single locked hero; SENSE demoted to optional live aside; Manifest pattern (not SENSE) is the on-camera insurance (§6/§9B/§19). |
| R14 | Inaccessible UI chrome on an accessibility product | Med | Keyboard + screen-reader + focus-visible pass on all controls; canvas has text/structural equivalent (§17, NFR6). |

---

## 19. Scope & Build Plan (Hackathon)

**Time box:** ~2 days to deadline. **Cut-line philosophy (now actually enforced):** one polished, emotionally complete pillar beats three half-built ones. The previous version of this section *stated* that philosophy and then listed a product-sized MVP — that contradiction is resolved below. **If we reach the hour-24 core and nothing else, we still have a winning demo.**

### Locked decisions driving scope
- **Hero = FEEL only** (§6). PLAY is a bonus; CREATE/TOGETHER are mockups; SENSE is an optional live aside.
- **Pre-baked manifests only; no live upload in the demo** (N5/R2). The upload UI is shown; playback is always from cached manifests.
- **LLM off the critical path** (N6/§10.2). Deterministic palette lookup is the baseline.
- **Manifest JSON is the team contract, defined in hour 1**, so the Python/visual/audio tracks build in parallel against a hand-authored sample manifest.

### Owners (assign NOW — non-negotiable; was Open Question #6)
| Track | Owner | Scope |
|---|---|---|
| **Manifest pipeline (Python)** | Owner A | Demucs + librosa + deterministic emotion → bake manifests for the demo songs. |
| **Visual engine (PIXI/TS)** | Owner B | Emotion field, particle layers, on-screen haptic proxy, photosensitivity limiter, adaptive perf. |
| **Audio-sync + haptics + UI (TS)** | Owner C | Master clock, look-ahead scheduler, `navigator.vibrate`, transport, intensity slider, accessible chrome, landing page. |

*(Single-dev fallback: do the layers in the hour-order below and stop wherever time runs out — every checkpoint is independently demo-able.)*

### MVP — the only must-have (FEEL core)
**FEEL on ONE pre-baked song**, with **3 visual layers** (emotion field + drum sparks + bass bubbles), Android haptics + **on-screen haptic proxy**, look-ahead-scheduled sync, photosensitivity limiter, one intensity slider, and accessible transport. **This is the demo. Everything below is upside.**

### Build order (replaces M0–M8; hour-budgeted)
1. **Hour 0–1:** Lock the §13 manifest schema; **hand-author ONE complete manifest** for ONE song (no pipeline needed yet). Assign owners. Scaffold Vite+React+TS+PIXI+Tone.
2. **Hour 1–12:** Audio engine + `AudioContext` master clock + look-ahead scheduler (§15); visual engine with **3 layers only** (emotion field, drum sparks, bass bubbles) driven by the hand-authored manifest.
3. **Hour 12–24:** Android haptics + **on-screen haptic proxy** (§11.4); **integrate end-to-end on a real phone.** → **HOUR-24 INTEGRATION CHECKPOINT (hard gate):** manifest → audio → visuals → haptics must run together on a physical device, even if ugly. *This is the demo-able core; do not pass this gate late.*
4. **Hour 24–34:** Add melody ribbons + vocal orb + kinetic lyrics + meaning chips (labelled, §7.7); photosensitivity limiter + reduced-motion; the one intensity slider; emotional-map pre-play screen.
5. **Hour 34–40:** Build the *real* preprocessing pipeline (Demucs+librosa+deterministic emotion) and **bake manifests for 2 more songs** (Owner A can start this in parallel from hour 1 if free).
6. **Hour 40–46:** **PLAY pad** (6 instruments + fingerprints) — bonus delight, **only if the FEEL core is solid**; otherwise skip without guilt.
7. **Hour 46–48:** **Record the 2-min video; finalize README + repo. Reserved time — do NOT let it get squeezed.**

### Explicitly CUT for the hackathon (build as documented future only)
- LLM art director (deterministic lookup instead) · spectral & fifths color modes (emotion mode only) · full customization panel (one slider only) · live upload pipeline in the demo (pre-baked only) · CREATE & TOGETHER (mockups) · SENSE as a built pillar (optional aside) · the 6-layer FEEL scene at MVP (3 layers first, add the rest in step 4) · Capacitor iOS build.

### Stretch (only after step 6 is solid)
- Live upload→preprocess end-to-end · CREATE step sequencer · TOGETHER multi-phone sync · SENSE live aside · Capacitor iOS haptics · LLM meaning refinement on one song.

*(Detailed task tracking lives in the session todo DB; this section is the source of truth for scope.)*

---

## 20. Demo / Video Plan (2–5 min)

1. **Hook (0:00–0:25):** "1.5 billion people live with hearing loss — over 400 million with disabling loss. For many, music is silence or a faint echo." Show a flat caption/visualizer — meaningless.
2. **Turn (0:25–0:45):** "Existing fixes cost thousands or live at a festival. Apple buzzes the beat — but only the beat, only on iPhone, only in Apple Music. What if you could feel the *whole song*, free, in a browser?"
3. **FEEL demo (0:45–2:00):** drop a song → world blooms; **phone vibrates to the bass — and you can SEE it**: the on-screen haptic ring pulses in sync (§11.4) and a close-up shows an object visibly shaking on the phone / a vibration meter spiking. Call out the AI legibility line: "AI split this into its instruments — that's why the bass gets its own pulse and the melody its own light. A normal visualizer only sees one waveform." Chorus lifts; drop explodes; lyrics + labelled meaning chip appear. A DHH user reacts (if secured). "They're not being told about the song — they're *feeling* it."
4. **PLAY demo (2:00–2:30):** user taps instruments — color + visible-vibration bloom under fingers. "And they can play it themselves." *(Include only if built — §19 step 6.)*
5. **Vision (2:30–2:50):** quick montage of CREATE + TOGETHER (and optionally a few seconds of SENSE on live sound) mockups.
6. **Close (2:50–3:00):** authenticity line — **"built *with* the Deaf community" only if a DHH person actually contributed; otherwise "designed *for* the DHH community, grounded in their research"** (§17). Microsoft tech badge (Foundry/Speech, private/local), challenge tie-in (Healthy Future). Quote a Deaf musician (Christine Sun Kim / Mandy Harvey).

**Demo non-negotiables:** the audience must (a) *see* the buzz pulse in sync at least twice (R10), and (b) hear/read the one-sentence "what the AI does" line (R11). If either is missing, the video reads as "just a pretty visualizer."

---

## 21. Future Roadmap
- Live concert mode (mic → real-time manifest streaming).
- Wearable/extra-actuator output (BLE) for richer body haptics.
- DHH-led palette/haptic "skins" marketplace; community sharing.
- Music-creation tools tuned for visual/haptic-first composition.
- Partnerships (Sencity, Deafstock, Gallaudet) for co-design & validation.

---

## 22. Open Questions → Resolved Decisions

The critique forced these to closure. Items needing external input are marked ⚠️.

1. **Hero pillar — RESOLVED:** **FEEL** is the single locked hero. No more hedging (§6).
2. **Demo songs — ⚠️ needs selection:** choose **2–3 royalty-free/CC tracks** with strong bass + clear sections + **CC/owned lyrics** (so committed manifests are copyright-clean, §13/§17). Action: Owner A picks by hour 2.
3. **Live upload in demo — RESOLVED:** **No.** Pre-baked manifests only; upload UI shown but not run on camera (N5/R2).
4. **iOS support — RESOLVED:** **Android is the primary demo device**; iPhone is the graceful-degradation story (visuals + on-screen haptic proxy carry it; Capacitor is the documented native path). Owned honestly in §16.
5. **DHH collaborator — ⚠️ action required:** secure **one** real DHH voice (even a 20-min call / a quote / a cameo). **If secured → we may say "co-designed / with the Deaf community." If not → all claims downgrade to "designed *for*"** everywhere (§5/§17/§20). Decide by hour 12 so the video script is honest.
6. **Team ownership — RESOLVED:** three tracks assigned (Manifest pipeline / Visual engine / Audio-sync+haptics+UI) against the manifest contract; see §19.
7. **LLM art director — RESOLVED:** off the critical path; deterministic palette lookup is the baseline; LLM is an optional one-song enhancement (N6/§10.2/§14).
8. **Color modes — RESOLVED:** ship **emotion mode only**; spectral/fifths documented as future lenses (§10B.6).
