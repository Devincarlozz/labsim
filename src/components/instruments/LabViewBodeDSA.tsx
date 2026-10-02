import React, { useRef, useEffect, useState } from 'react';

export function LabViewBodeDSA() {
  const [mode, setMode] = useState<'bode' | 'dsa' | 'curve'>('bode');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [startFreq, setStartFreq] = useState(10);
  const [stopFreq, setStopFreq] = useState(100000);
  const [curveComp, setCurveComp] = useState('Diode (1N4148)');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.clientWidth * dpr;
    canvas.height = canvas.clientHeight * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    // Dark screen
    ctx.fillStyle = '#050D0A';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = '#143825';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += w / 10) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y <= h; y += h / 8) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    if (mode === 'bode') {
      // Bode Gain plot (Yellow) & Phase plot (Cyan)
      ctx.beginPath();
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 2;
      const pts = 120;
      for (let i = 0; i < pts; i++) {
        const x = (i / (pts - 1)) * w;
        // Low-pass filter frequency response (f0 at 60% of width)
        const fNorm = (i / pts) * 3;
        const gainDb = -10 * Math.log10(1 + Math.pow(fNorm, 2));
        const y = 30 - (gainDb / 30) * (h / 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Phase plot
      ctx.beginPath();
      ctx.strokeStyle = '#06B6D4';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 2]);
      for (let i = 0; i < pts; i++) {
        const x = (i / (pts - 1)) * w;
        const fNorm = (i / pts) * 3;
        const phaseDeg = -Math.atan(fNorm) * (180 / Math.PI);
        const y = h / 2 - (phaseDeg / 90) * (h / 3);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    } else if (mode === 'dsa') {
      // FFT spectrum spikes (Magenta)
      ctx.beginPath();
      ctx.strokeStyle = '#EC4899';
      ctx.lineWidth = 2;
      const pts = 100;
      for (let i = 0; i < pts; i++) {
        const x = (i / (pts - 1)) * w;
        let pwr = 10;
        if (i === 20) pwr = 140; // Fundamental 100 Hz
        else if (i === 40) pwr = 45; // 2nd harmonic
        else pwr = 10 + ((i % 5) * 1.5); // Deterministic floor pattern per plan.md Section 10

        const y = h - 10 - pwr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    } else {
      // IV Curve Tracer (Green)
      ctx.beginPath();
      ctx.strokeStyle = '#22C55E';
      ctx.lineWidth = 2.5;
      ctx.moveTo(10, h - 20);
      ctx.lineTo(w * 0.6, h - 20); // 0V to 0.7V
      ctx.quadraticCurveTo(w * 0.65, h - 20, w * 0.7, h - 50);
      ctx.lineTo(w * 0.75, 20); // Exponential turn on
      ctx.stroke();
    }
  }, [mode, startFreq, stopFreq]);

  return (
    <div className="labview-bode-panel">
      {/* Top Banner */}
      <div className="fgen-top-row">
        <div className="labview-badge">
          <div className="labview-badge-inner">
            <span className="labview-badge-sub">POWERED BY</span>
            <span className="labview-badge-main">LabVIEW</span>
          </div>
        </div>

        <div className="bode-mode-selector">
          <button className={`bode-tab ${mode === 'bode' ? 'active' : ''}`} onClick={() => setMode('bode')}>
            Bode Analyzer
          </button>
          <button className={`bode-tab ${mode === 'dsa' ? 'active' : ''}`} onClick={() => setMode('dsa')}>
            DSA (FFT)
          </button>
          <button className={`bode-tab ${mode === 'curve' ? 'active' : ''}`} onClick={() => setMode('curve')}>
            IV Curve Tracer
          </button>
        </div>
      </div>

      {/* Screen */}
      <div className="bode-screen-box">
        <canvas ref={canvasRef} className="bode-canvas" />
      </div>

      {/* Parameters */}
      <div className="bode-footer-row">
        {mode === 'bode' && (
          <>
            <div className="bode-field">
              <span className="ctrl-tiny-label">Start Frequency</span>
              <input type="number" className="labview-num-input" value={startFreq} onChange={(e) => setStartFreq(parseFloat(e.target.value))} />
              <span className="unit-label">Hz</span>
            </div>
            <div className="bode-field">
              <span className="ctrl-tiny-label">Stop Frequency</span>
              <input type="number" className="labview-num-input" value={stopFreq} onChange={(e) => setStopFreq(parseFloat(e.target.value))} />
              <span className="unit-label">Hz</span>
            </div>
            <div className="bode-legend-tags">
              <span style={{ color: '#F59E0B' }}>■ Gain (dB)</span>
              <span style={{ color: '#06B6D4' }}>┅ Phase (deg)</span>
            </div>
          </>
        )}

        {mode === 'dsa' && (
          <div className="bode-field">
            <span className="ctrl-tiny-label">Span: 0 Hz - 20 kHz | Peak Freq: 100 Hz | THD: 0.12%</span>
          </div>
        )}

        {mode === 'curve' && (
          <div className="bode-field">
            <span className="ctrl-tiny-label">Device Under Test:</span>
            <select className="labview-dropdown" value={curveComp} onChange={(e) => setCurveComp(e.target.value)}>
              <option value="Diode (1N4148)">Diode (1N4148)</option>
              <option value="Zener Diode (5.1V)">Zener Diode (5.1V)</option>
              <option value="NPN BJT (2N3904)">NPN BJT (2N3904)</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
}
