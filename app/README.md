# Resonance — see and feel music

> We don't visualize music. We translate it into a language you can **feel**.

Resonance turns a song into a multi-sensory experience for Deaf / hard-of-hearing users: **bass & drums in the body** (haptics), **emotion, melody & instruments in light** (visuals), and **meaning in words** (kinetic lyrics) — at 60fps on a phone. AI splits a song into its instruments, and each instrument gets its own colour, shape, and touch.

One React + TypeScript + PIXI v8 + Web Audio engine, runnable as a PWA in the browser and wrapped in an **Expo** shell for **real device haptics on Android/iOS** (incl. iOS, where the browser Vibration API does nothing).

## The four pillars (+ SENSE)
All pillars speak the **same cross-modal language** through one shared, persistent engine:

| | what it is | input |
|---|---|---|
| **FEEL** | Play a baked song and feel every separated instrument; kinetic word-level lyrics + an emotional-arc section map. | offline manifest |
| **SENSE** | Point your phone at *any* live melody — real-time mic DSP (pitch / onset / bands) → light + touch, on-device. Every note shows as its **own colour + Indian swara name** (Sa Re Ga Ma…) and a distinct per-register pulse. | **live microphone** |
| **PLAY** | Tap instrument pads; each fires its own light burst + haptic signature (doc §8.3 fingerprints). | touch / keys `a s d f g h` |
| **CREATE** | A 16-step sequencer you can feel; build a loop, press play. | touch / keyboard grid |

The cross-modal mapping is consistent everywhere: **bass = orbs `●` + buzz**, **drums = sparks `✦`**, **melody = ribbons `〜` (hue follows pitch)**, **vocals = aura `◎`**.

## Architecture — the Manifest pattern (FEEL) + live DSP (SENSE)
Heavy/AI work for baked songs happens **once, offline** (`pipeline/`, Python) and emits a static **Experience Manifest** (`manifest.json`) + stem audio. The app is a **deterministic real-time renderer** of that manifest — 60fps, reproducible, offline. SENSE adds a **live** path: on-device Web Audio analysis (no recording, nothing sent) drives the same engine in real time.

```
[Python pipeline, offline] --emits--> manifest.json + stems/*.mp3   --+
                                                                      +-> [shared engine] -> sight + touch + words
[device microphone, live]  --on-device DSP (pitch/onset/bands)--------+
```

### Source map (`app/src/`)
- `SharedEngine.ts` — **one persistent** `VisualEngine` + `HapticEngine` for the whole app. All pillars drive it; the WebGL context is never churned on navigation (avoids mobile context-loss crashes).
- `ui/` — `AppShell` (persistent canvas host, nav, start gate, focus management) + one screen per pillar. Accessible chrome (ARIA, roving-tabindex grid, reduced-motion, safe-area).
- `manifest/` — zod schema (`types.ts`), semantic validator, loader. The data contract.
- `audio/AudioEngine.ts` — `AudioContext.currentTime` master clock + multi-stem playback; **silent-clock** fallback so the pipeline runs before real stems exist; `destroy()` releases the context.
- `audio/LiveAudioEngine.ts` + `audio/dsp/{pitch,onset}.ts` — SENSE mic capture + per-frame features: YIN pitch, whitened spectral-flux onsets, band energies, asymmetric smoothing.
- `audio/Synth.ts` + `play/` + `create/` — hand-rolled Web Audio synth, PLAY instruments, CREATE look-ahead scheduler (Chris Wilson "two clocks").
- `sync/Scheduler.ts` — look-ahead event scheduler + section tracker + binary-search seek.
- `visual/` — PIXI v8 scene: emotion field, bass orbs, drum sparks, **melody ribbons** (`MeshRope`), **vocal aura**, a render-texture **`DyeFluid`** "ink-in-water" hero layer (note-coloured blooms that drift/diffuse/decay), kinetic lyrics, on-screen haptic proxy; the cross-modal **`colorEngine`** maps each pitch class to a perceptually-distinct **OKLCH** colour + **swara/western** name (so all 12 notes are clearly tellable apart), plus palettes, pooled particles, and a **pre-emptive WCAG 2.3.1 photosensitivity limiter** that damps the dye too.
- `haptics/` — `HapticEngine` + swappable backends: `WebViewBridge` (Expo), `Capacitor`, `WebVibration`. Auto-selected at runtime.
- `FeelController` / `SenseController` / `PlayController` / `CreateController` — per-pillar brains that attach to the shared engine and fully release their resources on unmount.

## Run — web (browser preview)
```bash
cd app
npm install
npm run gen:manifest     # (re)generate the demo manifest -> public/manifests/song1
npm run check:manifest   # validate the manifest against the schema
npm run dev              # http://localhost:5173  -> "Feel the demo song"
npm run smoke            # headless Playwright: boots, visits all pillars, clock advances
npm run build            # tsc -b && vite build
npm run lint
```
> Browser preview shows visuals + on-screen haptic proxy + `navigator.vibrate`. **Real native haptics need a phone (below).** SENSE needs mic permission and **HTTPS** (works on `localhost` and the tunnel URL; iOS requires HTTPS).

## Run — on your phone via Expo Go (real haptics, no native build)
The Expo app (`mobile/`) hosts the web engine in a WebView and bridges haptics to `expo-haptics`. It also grants the WebView microphone access so **SENSE works on the phone**.

```bash
# 1) serve the web app, then expose it over HTTPS (phone + getUserMedia need HTTPS)
cd app
npm run dev -- --host                                 # http://localhost:5173
#    in another shell:
cloudflared tunnel --url http://localhost:5173        # copy the https URL it prints

# 2) point the Expo app at that URL and start it
cd ../mobile
$env:EXPO_PUBLIC_WEBAPP_URL = "https://<your-tunnel>.trycloudflare.com"
npx expo start --tunnel                               # scan the QR in Expo Go
```
- The phone's **Expo Go SDK must match** the app (currently **SDK 54**). The mic prompt appears on first SENSE use.
- Android mic permission is declared in `app.json` and requested at launch; iOS auto-grants via `mediaCapturePermissionGrantType="grant"` + `NSMicrophoneUsageDescription`.

## Build to a device (native, optional)
Capacitor config (`capacitor.config.ts`, `appId=com.resonance.feel`, `webDir=dist`) is retained for a native build:
```bash
cd app
npm i @capacitor/android        # and/or @capacitor/ios
npx cap add android
npm run cap:sync
npx cap open android
```

## Status
Full multi-pillar product: **FEEL, SENSE, PLAY, CREATE** all built on one shared 60fps engine with a consistent cross-modal language, accessible chrome, and real-time microphone translation (SENSE). Recent overhaul: a **physically-grounded note→colour language** (per-pitch-class OKLCH so every note is distinct) shown with **swara names**, a flowing **ink-in-water dye** hero visual (under the photosensitivity guard), **distinct per-register haptics**, a fixed **mic-start** path (getUserMedia-first + timeout, no hang), and a decluttered SENSE screen. Hardened after a two-reviewer product critique + a Deaf-enjoyment judge pass (verdict: enjoyable): dye now respects the WCAG limiter, note haptics carry a guaranteed visible proxy and can't be truncated by bass, and live pitch uses clarity hysteresis so sung/solo notes stay stable. The offline **Python pipeline** (`../pipeline/`) is built and verified: librosa analysis (beats/key/sections/onsets/envelopes/melody) + deterministic emotion→palette + precomputed haptics → a validated Experience Manifest, with optional Demucs separation (HPSS/band pseudo-stem fallback). Verified: `build`, `lint`, Playwright `smoke` (all pillars) + `check-end`, mobile typecheck, and `pipeline/tests` all green. Pending (hardware-gated): native Android end-to-end haptic gate + real-device haptic/mic confirmation on a physical phone; running real Demucs (PyTorch) to bake true stems for FEEL.
