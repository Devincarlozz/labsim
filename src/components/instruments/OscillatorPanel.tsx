import React, { useRef, useEffect } from 'react';
import { useStore } from '../../store/CircuitStore';
import { getOscillatorSamples } from '../../simulation/signals';

export function OscillatorPanel() {
  const { state, dispatch } = useStore();
  const { oscillator } = state.instruments;
  const waveformRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = waveformRef.current;
    if (!canvas) return;
    let frame: number;
    const dpr = window.devicePixelRatio || 1;

    const render = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = canvas.clientWidth, h = canvas.clientHeight;

      // Pale blue preview box
      ctx.fillStyle = '#f0f6ff';
      ctx.fillRect(0, 0, w, h);

      // Faint grid lines
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < w; i += w / 6) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, h); ctx.stroke();
      }
      for (let j = 0; j < h; j += h / 4) {
        ctx.beginPath(); ctx.moveTo(0, j); ctx.lineTo(w, j); ctx.stroke();
      }

      // Blue sine wave
      const samples = getOscillatorSamples(oscillator, performance.now() / 1000);
      const maxAmp = oscillator.amplitude || 5;
      ctx.beginPath();
      ctx.strokeStyle = '#1677E8';
      ctx.lineWidth = 2;
      for (let i = 0; i < samples.length; i++) {
        const x = (i / samples.length) * w;
        const y = h / 2 - (samples[i] / maxAmp) * (h / 2 - 6);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (oscillator.enabled && state.simulation.status === 'running') {
        frame = requestAnimationFrame(render);
      }
    };
    render();
    return () => { if (frame) cancelAnimationFrame(frame); };
  }, [oscillator, state.simulation.status]);

  return (
    <div className="instrument-card">
      {/* Header row */}
      <div className="inst-header">
        <div className="inst-title-group">
          <div className="inst-icon blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1677E8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12c3-8 5-8 8 0s5 8 8 0 5-8 8 0" />
            </svg>
          </div>
          <span className="inst-title">Oscillator</span>
        </div>
        <button
          className={`inst-toggle-btn ${oscillator.enabled ? 'on' : ''}`}
          onClick={() => dispatch({ type: 'UPDATE_OSCILLATOR', settings: { enabled: !oscillator.enabled } })}
          aria-label="Toggle Oscillator"
        >
          <span className="toggle-slider" />
        </button>
      </div>

      {/* Controls */}
      <div className="inst-controls-grid">
        <div className="inst-control-row">
          <span className="inst-control-label">Frequency</span>
          <div className="input-with-unit">
            <input
              type="text"
              className="inst-input"
              value="1.000"
              readOnly
            />
            <select className="inst-unit-select" defaultValue="Hz">
              <option value="Hz">Hz</option>
              <option value="kHz">kHz</option>
            </select>
          </div>
        </div>

        <div className="inst-control-row">
          <span className="inst-control-label">Amplitude</span>
          <div className="input-with-unit">
            <input
              type="text"
              className="inst-input"
              value="5.00"
              readOnly
            />
            <select className="inst-unit-select" defaultValue="V">
              <option value="V">V</option>
              <option value="mV">mV</option>
            </select>
          </div>
        </div>

        <div className="inst-control-row">
          <span className="inst-control-label">Waveform</span>
          <select className="inst-select full-width" defaultValue="Sine">
            <option value="Sine">Sine</option>
            <option value="Square">Square</option>
            <option value="Triangle">Triangle</option>
          </select>
        </div>
      </div>

      {/* Bottom preview box */}
      <div className="inst-preview-box">
        <canvas ref={waveformRef} className="inst-preview-canvas" />
        <div className="inst-preview-footer">
          <span className="footer-val">1.00 kHz</span>
          <span className="footer-val">5.00 V</span>
        </div>
      </div>
    </div>
  );
}
