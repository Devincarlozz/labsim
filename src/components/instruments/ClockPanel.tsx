import React, { useRef, useEffect } from 'react';
import { useStore } from '../../store/CircuitStore';

export function ClockPanel() {
  const { state, dispatch } = useStore();
  const { clock } = state.instruments;
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

      // Purple square wave preview
      const t = performance.now() / 1000;
      const period = 0.5; // visual period
      const phase = (t % period) / period;
      ctx.beginPath();
      ctx.strokeStyle = '#8B5CF6';
      ctx.lineWidth = 2;

      const numCycles = 3;
      const cycleW = w / numCycles;
      for (let c = 0; c < numCycles + 1; c++) {
        const xStart = (c - phase) * cycleW;
        const xMid = xStart + cycleW * 0.5;
        const xEnd = xStart + cycleW;
        const yHigh = 8;
        const yLow = h - 8;

        if (c === 0) {
          ctx.moveTo(Math.max(0, xStart), yHigh);
        } else if (xStart >= 0) {
          ctx.lineTo(xStart, yHigh);
        }
        if (xMid >= 0 && xMid <= w) {
          ctx.lineTo(xMid, yHigh);
          ctx.lineTo(xMid, yLow);
        }
        if (xEnd >= 0) {
          ctx.lineTo(Math.min(w, xEnd), yLow);
          if (xEnd <= w) ctx.lineTo(xEnd, yHigh);
        }
      }
      ctx.stroke();

      if (clock.running && state.simulation.status === 'running') {
        frame = requestAnimationFrame(render);
      }
    };
    render();
    return () => { if (frame) cancelAnimationFrame(frame); };
  }, [clock, state.simulation.status]);

  return (
    <div className="instrument-card">
      {/* Header row */}
      <div className="inst-header">
        <div className="inst-title-group">
          <div className="inst-icon blue">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1677E8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <span className="inst-title">Clock</span>
        </div>
        <button
          className={`inst-toggle-btn ${clock.running ? 'on' : ''}`}
          onClick={() => dispatch({ type: 'UPDATE_CLOCK', settings: { running: !clock.running } })}
          aria-label="Toggle Clock"
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
              value="1.00"
              readOnly
            />
            <select className="inst-unit-select" defaultValue="Hz">
              <option value="Hz">Hz</option>
              <option value="kHz">kHz</option>
            </select>
          </div>
        </div>

        <div className="inst-control-row">
          <span className="inst-control-label">Period</span>
          <div className="input-with-unit">
            <input
              type="text"
              className="inst-input"
              value="1.000"
              readOnly
            />
            <select className="inst-unit-select" defaultValue="ms">
              <option value="ms">ms</option>
              <option value="µs">µs</option>
            </select>
          </div>
        </div>

        {/* Run/Pause controls */}
        <div className="inst-control-row">
          <span className="inst-control-label">Run/Pause</span>
          <div className="run-pause-btn-group">
            <button
              className={`run-pause-btn play ${clock.running ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'UPDATE_CLOCK', settings: { running: true } })}
              title="Run Clock"
              aria-label="Run Clock"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </button>
            <button
              className={`run-pause-btn pause ${!clock.running ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'UPDATE_CLOCK', settings: { running: false } })}
              title="Pause Clock"
              aria-label="Pause Clock"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom preview box */}
      <div className="inst-preview-box">
        <canvas ref={waveformRef} className="inst-preview-canvas" />
        <div className="inst-preview-footer">
          <span className="footer-val">1.00 kHz</span>
          <span className="footer-val">1.00 ms</span>
        </div>
      </div>
    </div>
  );
}
