import React, { useRef, useState, useCallback, useEffect } from 'react';

interface RotaryKnobProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  label?: string;
  unit?: string;
  ticks?: { value: number; label: string }[];
  size?: number;
  displayValue?: string;
  onChange: (val: number) => void;
}

export function RotaryKnob({
  value,
  min,
  max,
  step = 1,
  label,
  unit,
  ticks = [],
  size = 64,
  displayValue,
  onChange,
}: RotaryKnobProps) {
  const knobRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startY = useRef(0);
  const startVal = useRef(value);

  // Map value to angle (-135deg to +135deg = 270deg total range)
  const minAngle = -135;
  const maxAngle = 135;
  const clampedVal = Math.min(max, Math.max(min, value));
  const fraction = (clampedVal - min) / (max - min || 1);
  const angle = minAngle + fraction * (maxAngle - minAngle);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    startY.current = e.clientY;
    startVal.current = clampedVal;
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    const dy = startY.current - e.clientY;
    const range = max - min;
    const deltaVal = (dy / 100) * range;
    let newVal = startVal.current + deltaVal;
    if (step) {
      newVal = Math.round(newVal / step) * step;
    }
    newVal = Math.min(max, Math.max(min, newVal));
    onChange(newVal);
  }, [isDragging, min, max, step, onChange]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div className="rotary-knob-wrapper">
      {label && <div className="knob-label">{label}</div>}

      <div
        className="rotary-knob-container"
        style={{ width: size + 24, height: size + 20 }}
      >
        {/* Tick labels */}
        {ticks.map((t, idx) => {
          const tFrac = (t.value - min) / (max - min || 1);
          const tAngle = minAngle + tFrac * (maxAngle - minAngle);
          const rad = (tAngle * Math.PI) / 180;
          const r = size / 2 + 10;
          const tx = (size + 24) / 2 + r * Math.sin(rad);
          const ty = (size + 20) / 2 - r * Math.cos(rad);
          return (
            <span
              key={idx}
              className="knob-tick-text"
              style={{
                left: `${tx}px`,
                top: `${ty}px`,
                transform: 'translate(-50%, -50%)',
              }}
            >
              {t.label}
            </span>
          );
        })}

        {/* Dial Face */}
        <div
          ref={knobRef}
          className="knob-dial-body"
          onMouseDown={handleMouseDown}
          style={{
            width: size,
            height: size,
          }}
          title={`${label || ''}: ${displayValue || value} ${unit || ''}`}
        >
          {/* Shadow & outer ring */}
          <div className="knob-dial-outer">
            {/* Rotating dial face */}
            <div
              className="knob-dial-inner"
              style={{
                transform: `rotate(${angle}deg)`,
              }}
            >
              {/* Indicator pointer notch */}
              <div className="knob-indicator-pointer" />
            </div>
          </div>
        </div>
      </div>

      {displayValue !== undefined && (
        <div className="knob-value-display">
          {displayValue} {unit}
        </div>
      )}
    </div>
  );
}
