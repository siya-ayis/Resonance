interface GlobalControlsProps {
  intensity: number;
  onIntensity: (v: number) => void;
  hapticsOn: boolean;
  onHaptics: (on: boolean) => void;
}

/**
 * GlobalControls — shared chrome shown across every pillar (top-right). Keeps the
 * two settings that apply everywhere — motion/haptic intensity and the haptics
 * on/off toggle — in one consistent, keyboard-operable place.
 */
export default function GlobalControls({
  intensity,
  onIntensity,
  hapticsOn,
  onHaptics,
}: GlobalControlsProps) {
  return (
    <div className="global-controls" role="group" aria-label="Global settings">
      <label className="gc-item">
        <span className="gc-label">Intensity</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={intensity}
          onChange={(e) => onIntensity(Number(e.target.value))}
          aria-label="Motion and haptic intensity"
          aria-valuetext={`${Math.round(intensity * 100)} percent`}
        />
      </label>
      <button
        className={`gc-toggle${hapticsOn ? ' on' : ''}`}
        aria-pressed={hapticsOn}
        onClick={() => onHaptics(!hapticsOn)}
      >
        <span aria-hidden="true">{hapticsOn ? '〜' : '✕'}</span> Haptics
      </button>
    </div>
  );
}
