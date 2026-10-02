import React, { useRef, useEffect } from 'react';
import { useStore } from '../../store/CircuitStore';
import { getFunctionGeneratorSamples } from '../../simulation/signals';

export function FunctionGeneratorPanel() {
  const { state, dispatch } = useStore();
  const { functionGenerator } = state.instruments;
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

      // Blue square wave
      const samples = getFunctionGeneratorSamples(functionGenerator, performance.now() / 1000);
      const maxAmp = Math.max(functionGenerator.amplitude, 1);
      ctx.beginPath();
      ctx.strokeStyle = '#1677E8';
      ctx.lineWidth = 2;
      for (let i = 0; i < samples.length; i++) {
        const x = (i / samples.length) * w;
        const y = h / 2 - (samples[i] / maxAmp) * (h / 2 - 6);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();

      if (functionGenerator.enabled && state.simulation.status === 'running') {
        frame = requestAnimationFrame(render);
      }
    };
    render();
    return () => { if (frame) cancelAnimationFrame(frame); };
  }, [functionGenerator, state.simulation.status]);

  return (
    <div className="instrument-card">
      {/* Header row */}
      <div className="inst-header">
        <div className="inst-title-group">
          <div className="inst-icon purple">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 17h4V7h6v10h4V7h4" />
            </svg>
          </div>
          <span className="inst-title">Function Generator</span>
        </div>
        <button
          className={`inst-toggle-btn ${functionGenerator.enabled ? 'on' : ''}`}
          onClick={() => dispatch({ type: 'UPDATE_FUNCTION_GEN', settings: { enabled: !functionGenerator.enabled } })}
          aria-label="Toggle Function Generator"
        >
          <span className="toggle-slider" />
        </button>
      </div>

      {/* Controls */}
      <div className="inst-controls-grid">
        <div className="inst-control-row">
          <span className="inst-control-label">Waveform</span>
          <select className="inst-select full-width" defaultValue="Square">
            <option value="Square">Square</option>
            <option value="Sine">Sine</option>
            <option value="Triangle">Triangle</option>
          </select>
        </div>

        <div className="inst-control-row">
          <span className="inst-control-label">Frequency</span>
          <div className="input-with-unit">
            <input
              type="text"
              className="inst-input"
              value="500"
              readOnly
            />
            <select className="inst-unit-select" defaultValue="Hz">
              <option value="Hz">Hz</option>
              <option value="kHz">kHz</option>
            </select>
          </div>
        </div>

        <div className="inst-control-row split-two">
          <div className="half-field">
            <span className="inst-control-label">Amplitude</span>
            <input type="text" className="inst-input" value="3.30" readOnly />
          </div>
          <div className="half-field">
            <span className="inst-control-label">Offset</span>
            <input type="text" className="inst-input" value="0.00" readOnly />
          </div>
        </div>
      </div>

      {/* Bottom preview box */}
      <div className="inst-preview-box">
        <canvas ref={waveformRef} className="inst-preview-canvas" />
        <div className="inst-preview-footer">
          <span className="footer-val">500 Hz</span>
          <span className="footer-val">3.30 V</span>
        </div>
      </div>
    </div>
  );
}
