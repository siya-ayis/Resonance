# 🎵 Resonance

**Music you can feel. Music you can see.**

Resonance is a free, AI-powered multi-sensory music experience for the **Deaf and hard-of-hearing**. Instead of trying to "fix" hearing, it reimagines music itself — translating any song into **light, motion, and touch** in real time.

Our AI separates a song into its individual instruments — **bass, drums, melody, voice** — and gives each one its own **color, motion, and vibration**, so every instrument has its own identity instead of blurring into one blob.

> Built for the **Microsoft Global Hackathon**.

---

## ✨ The four pillars

| Pillar | What it does |
|---|---|
| **FEEL** | Play a song and experience it as flowing, note-colored "ink-in-water" visuals + distinct per-instrument haptics. Feel the bass drop in your hand. |
| **SENSE** | Live mic mode — hum, sing, or point it at an instrument, and Resonance reads the note in real time and lights up its color + swara (Sa Re Ga Ma Pa Dha Ni). |
| **PLAY** | Tap instrument pads and feel how different each one is — a heavy kick, a sharp hat, a soft swelling pad. |
| **CREATE** | (Future) Compose music through touch, color, and movement. |

---

## 🗂️ Project structure

```
app/        Web app — the Resonance experience (Vite + TypeScript + PIXI.js)
mobile/     Expo wrapper — hosts the web app in a WebView and bridges native iOS haptics
pipeline/   Python audio pipeline — stem separation & analysis
```

---

## 🚀 Running locally

**Web app:**
```powershell
cd app
npm install
npm run dev          # serves on http://localhost:5173
```

**Mobile (Expo Go on a physical phone):**
```powershell
cd mobile
npm install
$env:EXPO_PUBLIC_WEBAPP_URL = "https://<your-public-web-url>"
npx expo start --tunnel
```
Then scan the QR code with **Expo Go**.

> **iOS haptics note:** in-browser vibration is blocked by WebKit on all iOS browsers — native iOS haptics work **only** through the Expo wrapper (`mobile/`). Android Chrome supports the web vibration path directly.

---

*Music was never meant to be heard alone. With Resonance, it can be felt, seen, and lived — by everyone.*
