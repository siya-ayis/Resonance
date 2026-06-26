# Resonance offline pipeline (Python)
#
# Turns an audio file into an Experience Manifest (+ optional per-stem audio)
# that the on-device renderer plays deterministically. This is the OFFLINE half
# of the architecture in Resonance_Design_Doc.md: heavy/AI work happens once,
# here, and emits a static manifest.json the app renders at 60fps.

__version__ = "1.0.0"
