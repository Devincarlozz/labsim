import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '../../store/CircuitStore';
import { getOscillatorSamples, getFunctionGeneratorSamples } from '../../simulation/signals';

type WaveformSource = 'oscillator' | 'functionGen' | 'clock';

export function OutputWaveformPanel() {
  const { state } = useStore();
  const [activeSource, setActiveSource] = useState<WaveformSource>('oscillator');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame: number;
    const dpr = window.devicePixelRatio || 1;

    const render = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const padLeft = 32;
      const padBottom = 20;
      const plotW = w - padLeft - 10;
      const plotH = h - padBottom - 10;
      const plotTop = 10;

      // White plotting area
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);

      // Faint grid lines
      ctx.strokeStyle = '#e5eaf1';
      ctx.lineWidth = 1;

      // 5 horizontal divisions
      const yTicks = [
        { label: '5V', y: plotTop },
        { label: '0V', y: plotTop + plotH / 2 },
        { label: '-5V', y: plotTop + plotH },
      ];

      for (let i = 0; i <= 4; i++) {
        const gy = plotTop + (i / 4) * plotH;
        ctx.beginPath();
        ctx.moveTo(padLeft, gy);
        ctx.lineTo(padLeft + plotW, gy);
        ctx.stroke();
      }

      // Vertical grid lines (6 divisions: 0ms to 5ms)
      const xLabels = ['0ms', '1ms', '2ms', '3ms', '4ms', '5ms'];
      for (let i = 0; i < 6; i++) {
        const gx = padLeft + (i / 5) * plotW;
        ctx.beginPath();
        ctx.moveTo(gx, plotTop);
        ctx.lineTo(gx, plotTop + plotH);
        ctx.stroke();

        // Horizontal axis labels
        ctx.fillStyle = '#64748B';
        ctx.font = '500 9px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(xLabels[i], gx, plotTop + plotH + 4);
      }

      // Vertical axis labels
      ctx.fillStyle = '#64748B';
      ctx.font = '600 9px "Inter", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (const yt of yTicks) {
        ctx.fillText(yt.label, padLeft - 6, yt.y);
      }

      // Center baseline
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, plotTop + plotH / 2);
      ctx.lineTo(padLeft + plotW, plotTop + plotH / 2);
      ctx.stroke();

      // Waveform trace
      const t = performance.now() / 1000;
      ctx.beginPath();
      ctx.strokeStyle = '#1677E8';
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';

      const points = 120;
      if (activeSource === 'oscillator') {
        const samples = getOscillatorSamples(state.instruments.oscillator, t);
        for (let i = 0; i < points; i++) {
          const sampleIdx = Math.floor((i / points) * samples.length);
          const val = samples[sampleIdx] ?? Math.sin((i / 20) + t * 4) * 4.8;
          const x = padLeft + (i / (points - 1)) * plotW;
          const y = (plotTop + plotH / 2) - (val / 5.5) * (plotH / 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      } else if (activeSource === 'functionGen') {
        const samples = getFunctionGeneratorSamples(state.instruments.functionGenerator, t);
        for (let i = 0; i < points; i++) {
          const sampleIdx = Math.floor((i / points) * samples.length);
          const val = samples[sampleIdx] ?? ((Math.sin((i / 20) + t * 4) > 0 ? 3.3 : -3.3));
          const x = padLeft + (i / (points - 1)) * plotW;
          const y = (plotTop + plotH / 2) - (val / 5.5) * (plotH / 2);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      } else {
        // Clock digital wave
        const periodPx = plotW / 5;
        const phase = (t * 2) % 1;
        for (let i = 0; i < points; i++) {
          const x = padLeft + (i / (points - 1)) * plotW;
          const cyc = ((x - padLeft) / periodPx + phase) % 1;
          const isHigh = cyc < 0.5;
          const y = isHigh ? plotTop + 8 : plotTop + plotH - 8;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();

      if (state.simulation.status === 'running') {
        frame = requestAnimationFrame(render);
      }
    };

    render();
    return () => { if (frame) cancelAnimationFrame(frame); };
  }, [activeSource, state.instruments, state.simulation.status]);

  return (
    <div className="instrument-card output-waveform-card">
      {/* Header with segmented source tabs */}
      <div className="output-card-header">
        <span className="inst-title">Output / Waveform</span>
        <div className="segmented-source-tabs">
          <button
            className={`source-tab-btn ${activeSource === 'oscillator' ? 'active' : ''}`}
            onClick={() => setActiveSource('oscillator')}
          >
            Oscillator
          </button>
          <button
            className={`source-tab-btn ${activeSource === 'functionGen' ? 'active' : ''}`}
            onClick={() => setActiveSource('functionGen')}
          >
            Function Gen...
          </button>
          <button
            className={`source-tab-btn ${activeSource === 'clock' ? 'active' : ''}`}
            onClick={() => setActiveSource('clock')}
          >
            Clock
          </button>
        </div>
      </div>

      {/* Large plotting chart */}
      <div className="waveform-chart-container">
        <canvas ref={canvasRef} className="output-waveform-canvas" />
      </div>
    </div>
  );
}
