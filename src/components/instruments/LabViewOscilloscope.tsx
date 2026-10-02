import React, { useRef, useEffect, useState, useCallback } from 'react';
import { RotaryKnob } from '../common/RotaryKnob';
import { useStore } from '../../store/CircuitStore';
import { getOscillatorSamples, getFunctionGeneratorSamples } from '../../simulation/signals';
import { getDaqSignal } from '../../simulation/daqSignals';
import { simEngine } from '../../simulation/engine/SimEngine';

export function LabViewOscilloscope() {
  const { state, dispatch } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Channel 0 Settings
  const [ch0Enabled, setCh0Enabled] = useState(true);
  const [ch0Source, setCh0Source] = useState('AI 0');
  const [ch0Probe, setCh0Probe] = useState('1x');
  const [ch0Coupling, setCh0Coupling] = useState('DC');
  const [ch0VoltsDiv, setCh0VoltsDiv] = useState(1.0);
  const [ch0VertPos, setCh0VertPos] = useState(0.0);

  // Channel 1 Settings
  const [ch1Enabled, setCh1Enabled] = useState(false);
  const [ch1Source, setCh1Source] = useState('AI 1');
  const [ch1Probe, setCh1Probe] = useState('1x');
  const [ch1Coupling, setCh1Coupling] = useState('DC');
  const [ch1VoltsDiv, setCh1VoltsDiv] = useState(1.0);
  const [ch1VertPos, setCh1VertPos] = useState(0.0);

  // Timebase
  const [timeDiv, setTimeDiv] = useState(5.0); // 5 ms
  const [timeUnit, setTimeUnit] = useState<'ms' | 'µs' | 's'>('ms');

  // Trigger
  const [triggerType, setTriggerType] = useState('Immediate');
  const [triggerSlope, setTriggerSlope] = useState<'positive' | 'negative'>('positive');
  const [triggerSource, setTriggerSource] = useState('CH 0');
  const [triggerLevel, setTriggerLevel] = useState(0.0);
  const [horizPos, setHorizPos] = useState(50);

  // Cursors & Measurements
  const [cursorsOn, setCursorsOn] = useState(false);
  const [cursor1X, setCursor1X] = useState(25);
  const [cursor2X, setCursor2X] = useState(75);
  const [measCh0, setMeasCh0] = useState(true);
  const [measCh1, setMeasCh1] = useState(false);

  // Instrument Control
  const [device, setDevice] = useState('Dev1 (NI myDAQ)');
  const [acqMode, setAcqMode] = useState('Run Continuously');
  const [isRunning, setIsRunning] = useState(true);
  const [activeTab, setActiveTab] = useState<'basic' | 'advanced'>('basic');

  // Live measurements
  const [measRms, setMeasRms] = useState('0.00 mV');
  const [measFreq, setMeasFreq] = useState('0.000 Hz');
  const [measVpp, setMeasVpp] = useState('0.000 V');

  // Autoscale handler
  const handleAutoscale = () => {
    setCh0VoltsDiv(1.0);
    setCh0VertPos(0.0);
    setTimeDiv(5.0);
    setTimeUnit('ms');
    setTriggerType('Immediate');
    setHorizPos(50);
  };

  // Render loop for oscilloscope screen
  const lastCanvasSizeRef = useRef({ w: 0, h: 0 });
  const measFrameCounter = useRef(0);
  const lastMeasRef = useRef({ rms: '', freq: '', vpp: '' });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame: number;
    const dpr = window.devicePixelRatio || 1;

    const render = () => {
      const clientW = canvas.clientWidth;
      const clientH = canvas.clientHeight;

      // Only resize the backing buffer when CSS dimensions actually changed
      if (lastCanvasSizeRef.current.w !== clientW || lastCanvasSizeRef.current.h !== clientH) {
        lastCanvasSizeRef.current = { w: clientW, h: clientH };
        canvas.width = clientW * dpr;
        canvas.height = clientH * dpr;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = clientW;
      const h = clientH;

      // Dark CRT Background
      ctx.fillStyle = '#050D0A';
      ctx.fillRect(0, 0, w, h);

      // CRT Grid (10 horizontal divisions, 8 vertical divisions) — batched into single path
      const cols = 10;
      const rows = 8;
      const divW = w / cols;
      const divH = h / rows;

      ctx.strokeStyle = '#143825';
      ctx.lineWidth = 1;
      ctx.beginPath();

      // Vertical grid lines with minor ticks — single batched path
      for (let c = 0; c <= cols; c++) {
        const x = c * divW;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);

        // Minor ticks along center horizontal line
        if (c < cols) {
          for (let m = 1; m < 5; m++) {
            const tx = x + (m / 5) * divW;
            ctx.moveTo(tx, h / 2 - 3);
            ctx.lineTo(tx, h / 2 + 3);
          }
        }
      }

      // Horizontal grid lines with minor ticks — same batched path
      for (let r = 0; r <= rows; r++) {
        const y = r * divH;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);

        // Minor ticks along center vertical line
        if (r < rows) {
          for (let m = 1; m < 5; m++) {
            const ty = y + (m / 5) * divH;
            ctx.moveTo(w / 2 - 3, ty);
            ctx.lineTo(w / 2 + 3, ty);
          }
        }
      }
      ctx.stroke();

      // Center crosshairs
      ctx.strokeStyle = '#225B3C';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();

      const snap = simEngine.getSnapshot();
      const isDaqRunning = isRunning && snap.daqState === 'RUNNING';

      // Check if channels are actively wired or connected to live sources
      const isCh0Connected = ch0Source === 'AO 0'
        ? (snap.daqState === 'RUNNING' && Boolean(snap.daq.ao0_buffer))
        : ch0Source === 'AI 1'
        ? Boolean(snap.daq.isAi1Connected)
        : Boolean(snap.daq.isAi0Connected);

      const isCh1Connected = ch1Source === 'AO 1'
        ? false
        : ch1Source === 'AI 0'
        ? Boolean(snap.daq.isAi0Connected)
        : Boolean(snap.daq.isAi1Connected);

      // Resolve Channel 0 & Channel 1 source buffers from DAQ
      const getSourceBuffer = (src: string, isConn: boolean): number[] => {
        if (!isDaqRunning || !isConn) return new Array(1000).fill(0);
        if (src === 'AI 1') return snap.daq.ai1;
        if (src === 'AO 0') {
          // Linearized AO0 high-resolution signal based on FGEN buffer/voltage
          if (snap.daq.ao0_buffer && snap.daq.ao0_buffer.length === 1000) {
            return snap.daq.ao0_buffer;
          }
          const ao0V = snap.daq.ao0;
          return new Array(1000).fill(ao0V);
        }
        return snap.daq.ai0;
      };

      const ch0Buf = getSourceBuffer(ch0Source, isCh0Connected);
      const ch1Buf = getSourceBuffer(ch1Source, isCh1Connected);

      // On-screen Phosphor Channel Status
      const ch0Desc = !isDaqRunning
        ? 'myDAQ Power is OFF (Click Run to start)'
        : !isCh0Connected
        ? `${ch0Source} (Disconnected / 0.00 V)`
        : `${ch0Source} Active (10 kS/s ADC)`;
      const ch1Desc = !isDaqRunning
        ? 'myDAQ Power is OFF (Click Run to start)'
        : !isCh1Connected
        ? `${ch1Source} (Disconnected / 0.00 V)`
        : `${ch1Source} Active (10 kS/s ADC)`;

      ctx.font = '10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#22C55E';
      ctx.fillText(`CH0 (${ch0Source}): ${ch0Desc}`, 14, 20);
      if (ch1Enabled) {
        ctx.fillStyle = '#06B6D4';
        ctx.fillText(`CH1 (${ch1Source}): ${ch1Desc}`, 14, 34);
      }

      // Update Live Measurements directly from buffer — debounced every 10 frames
      measFrameCounter.current++;
      if (measFrameCounter.current >= 10) {
        measFrameCounter.current = 0;
        const activeBuf = measCh1 && ch1Enabled ? ch1Buf : ch0Buf;
        const activeConnected = measCh1 && ch1Enabled ? isCh1Connected : isCh0Connected;
        let newRms: string, newFreq: string, newVpp: string;

        if (!isDaqRunning || !activeConnected) {
          newRms = '0.00 mV'; newFreq = '0.000 Hz'; newVpp = '0.000 V';
        } else {
          let minV = Infinity;
          let maxV = -Infinity;
          let sumSq = 0;
          for (let i = 0; i < activeBuf.length; i++) {
            const v = activeBuf[i];
            if (v < minV) minV = v;
            if (v > maxV) maxV = v;
            sumSq += v * v;
          }
          const vpp = maxV - minV;
          const rms = Math.sqrt(sumSq / activeBuf.length);

          // Zero / mean-crossing frequency detection
          const mean = (minV + maxV) / 2;
          let crossings = 0;
          for (let i = 1; i < activeBuf.length; i++) {
            if (activeBuf[i - 1] < mean && activeBuf[i] >= mean) {
              crossings++;
            }
          }
          const sampleDurationSec = activeBuf.length / 10000;
          const freq = crossings > 1 ? crossings / sampleDurationSec : 0;

          if (vpp < 0.015) {
            newRms = `${(Math.abs(mean) * 1000).toFixed(1)} mV`;
            newFreq = '0.000 Hz';
            newVpp = '0.000 V';
          } else {
            newRms = `${(rms * 1000).toFixed(2)} mV`;
            newFreq = `${freq.toFixed(3)} Hz`;
            newVpp = `${vpp.toFixed(3)} V`;
          }
        }

        const last = lastMeasRef.current;
        if (last.rms !== newRms) { setMeasRms(newRms); last.rms = newRms; }
        if (last.freq !== newFreq) { setMeasFreq(newFreq); last.freq = newFreq; }
        if (last.vpp !== newVpp) { setMeasVpp(newVpp); last.vpp = newVpp; }
      }

      // Compute display time span across 10 divisions
      const timeMultiplier = timeUnit === 'µs' ? 0.000001 : timeUnit === 'ms' ? 0.001 : 1;
      const totalTime = timeDiv * timeMultiplier * 10;
      const pts = 240;

      // Find trigger sample index in active buffer for steady waveform display
      const trigBuf = triggerSource === 'CH 1' && ch1Enabled ? ch1Buf : ch0Buf;
      let trigIdx = 0;
      if (isDaqRunning) {
        for (let i = 1; i < trigBuf.length - 1; i++) {
          if (triggerSlope === 'positive') {
            if (trigBuf[i - 1] < triggerLevel && trigBuf[i] >= triggerLevel) {
              trigIdx = i;
              break;
            }
          } else {
            if (trigBuf[i - 1] > triggerLevel && trigBuf[i] <= triggerLevel) {
              trigIdx = i;
              break;
            }
          }
        }
      }

      // Draw Channel 0 Trace (Bright Green Phosphor)
      if (ch0Enabled) {
        ctx.beginPath();
        ctx.strokeStyle = '#22C55E';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#22C55E';
        ctx.shadowBlur = 4;

        // Mean for AC coupling
        let ch0Mean = 0;
        if (ch0Coupling === 'AC' && isDaqRunning) {
          ch0Mean = ch0Buf.reduce((a, b) => a + b, 0) / ch0Buf.length;
        }

        for (let i = 0; i < pts; i++) {
          const xFrac = i / (pts - 1);
          const timeAtPoint = (xFrac - horizPos / 100) * totalTime;
          const sampleOffset = Math.round(timeAtPoint * 10000); // 10 kS/s
          const rawIdx = trigIdx + sampleOffset;
          const bufIdx = ((rawIdx % ch0Buf.length) + ch0Buf.length) % ch0Buf.length;
          let val = isDaqRunning ? ch0Buf[bufIdx] - ch0Mean : 0;
          if (ch0Probe === '10x') val *= 10;

          const x = xFrac * w;
          const ySpanVolts = ch0VoltsDiv * 8;
          const y = h / 2 - ((val / ySpanVolts) * h) - (ch0VertPos * divH);

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Draw Channel 1 Trace (Cyan Phosphor)
      if (ch1Enabled) {
        ctx.beginPath();
        ctx.strokeStyle = '#06B6D4';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#06B6D4';
        ctx.shadowBlur = 4;

        let ch1Mean = 0;
        if (ch1Coupling === 'AC' && isDaqRunning) {
          ch1Mean = ch1Buf.reduce((a, b) => a + b, 0) / ch1Buf.length;
        }

        for (let i = 0; i < pts; i++) {
          const xFrac = i / (pts - 1);
          const timeAtPoint = (xFrac - horizPos / 100) * totalTime;
          const sampleOffset = Math.round(timeAtPoint * 10000);
          const rawIdx = trigIdx + sampleOffset;
          const bufIdx = ((rawIdx % ch1Buf.length) + ch1Buf.length) % ch1Buf.length;
          let val = isDaqRunning ? ch1Buf[bufIdx] - ch1Mean : 0;
          if (ch1Probe === '10x') val *= 10;

          const x = xFrac * w;
          const ySpanVolts = ch1VoltsDiv * 8;
          const y = h / 2 - ((val / ySpanVolts) * h) - (ch1VertPos * divH);

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Cursors overlay
      if (cursorsOn) {
        const c1X = (cursor1X / 100) * w;
        const c2X = (cursor2X / 100) * w;

        // Cursor 1
        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 2]);
        ctx.beginPath(); ctx.moveTo(c1X, 0); ctx.lineTo(c1X, h); ctx.stroke();

        // Cursor 2
        ctx.strokeStyle = '#EC4899';
        ctx.beginPath(); ctx.moveTo(c2X, 0); ctx.lineTo(c2X, h); ctx.stroke();
        ctx.setLineDash([]);

        // Delta label
        ctx.fillStyle = '#F59E0B';
        ctx.font = '9px "JetBrains Mono", monospace';
        ctx.fillText('C1', c1X + 4, 14);
        ctx.fillStyle = '#EC4899';
        ctx.fillText('C2', c2X + 4, 14);
      }

      if (isRunning) {
        frame = requestAnimationFrame(render);
      }
    };

    render();
    return () => { if (frame) cancelAnimationFrame(frame); };
  }, [
    isRunning, ch0Enabled, ch0Source, ch0VoltsDiv, ch0VertPos, ch1Enabled, ch1Source, ch1VoltsDiv, ch1VertPos,
    timeDiv, timeUnit, horizPos, cursorsOn, cursor1X, cursor2X, measCh0, measCh1,
    state.instruments, state.wires, state.breadboard, state.components
  ]);

  return (
    <div className="labview-scope-panel">
      {/* Top Banner & Sample Rate */}
      <div className="scope-top-row">
        <div className="labview-badge">
          <div className="labview-badge-inner">
            <span className="labview-badge-sub">POWERED BY</span>
            <span className="labview-badge-main">LabVIEW</span>
          </div>
        </div>

        <div className="scope-sample-rate">
          <span>Sample Rate: 50.00 kS/s</span>
        </div>
      </div>

      {/* Main Grid: Left CRT Screen + Right Controls Panel */}
      <div className="scope-main-content">
        {/* CRT Screen Column */}
        <div className="scope-display-column">
          <div className="scope-crt-container">
            <canvas ref={canvasRef} className="scope-crt-canvas" />
            
            {/* Live Measurements Bar & Timeout indicator */}
            <div className="scope-screen-footer">
              <div className="screen-meas-text">
                <span className="meas-label">CH 0 Meas:</span>
                <span className="meas-data">RMS: {measRms}</span>
                <span className="meas-data">Freq: {measFreq}</span>
                <span className="meas-data">Vp-p: {measVpp}</span>
              </div>
              <div className="timeout-status">
                <span className={`led-dot ${isRunning ? 'active' : ''}`} />
                <span className="timeout-label">Timeout</span>
              </div>
            </div>
          </div>

          {/* Under-screen row: Cursors Settings & Display Measurements */}
          <div className="scope-screen-subbar">
            <div className="subbar-group">
              <span className="subbar-title">Cursors Settings</span>
              <label className="subbar-check">
                <input
                  type="checkbox"
                  checked={cursorsOn}
                  onChange={(e) => setCursorsOn(e.target.checked)}
                />
                <span>Cursors On</span>
              </label>
              <span className="cursor-tag">C1: CH 0</span>
              <span className="cursor-tag">C2: CH 0</span>
            </div>

            <div className="subbar-group">
              <span className="subbar-title">Display Measurements</span>
              <label className="subbar-check">
                <input
                  type="checkbox"
                  checked={measCh0}
                  onChange={(e) => setMeasCh0(e.target.checked)}
                />
                <span>CH 0</span>
              </label>
              <label className="subbar-check">
                <input
                  type="checkbox"
                  checked={measCh1}
                  onChange={(e) => setMeasCh1(e.target.checked)}
                />
                <span>CH 1</span>
              </label>
            </div>
          </div>
        </div>

        {/* Right Controls Column */}
        <div className="scope-controls-column">
          {/* Settings Tabs */}
          <div className="scope-settings-tabs">
            <button
              className={`scope-tab-btn ${activeTab === 'basic' ? 'active' : ''}`}
              onClick={() => setActiveTab('basic')}
            >
              Basic Settings
            </button>
            <button
              className={`scope-tab-btn ${activeTab === 'advanced' ? 'active' : ''}`}
              onClick={() => setActiveTab('advanced')}
            >
              Advanced Settings
            </button>
          </div>

          <div className="scope-settings-scroll">
            {/* Dual Channel Settings Row */}
            <div className="dual-channel-row">
              {/* Channel 0 Settings (Green) */}
              <fieldset className="labview-fieldset ch-fieldset">
                <legend className="labview-legend ch0-legend">
                  <span className="ch-color-box green" />
                  <span>Channel 0 Settings</span>
                </legend>

                <div className="ch-field-row">
                  <span className="ch-label">Source</span>
                  <select className="labview-dropdown tiny" value={ch0Source} onChange={(e) => setCh0Source(e.target.value)}>
                    <option value="AI 0">AI 0</option>
                    <option value="AI 1">AI 1</option>
                    <option value="AO 0">AO 0</option>
                  </select>
                </div>

                <div className="ch-options-row">
                  <label className="labview-checkbox-label">
                    <input type="checkbox" checked={ch0Enabled} onChange={(e) => setCh0Enabled(e.target.checked)} />
                    <span>Enabled</span>
                  </label>
                </div>

                <div className="ch-dual-selectors">
                  <div className="half-sel">
                    <span className="ctrl-tiny-label">Probe</span>
                    <select className="labview-dropdown tiny" value={ch0Probe} onChange={(e) => setCh0Probe(e.target.value)}>
                      <option value="1x">1x</option>
                      <option value="10x">10x</option>
                    </select>
                  </div>
                  <div className="half-sel">
                    <span className="ctrl-tiny-label">Coupling</span>
                    <select className="labview-dropdown tiny" value={ch0Coupling} onChange={(e) => setCh0Coupling(e.target.value)}>
                      <option value="DC">DC</option>
                      <option value="AC">AC</option>
                      <option value="GND">GND</option>
                    </select>
                  </div>
                </div>

                <div className="ch-knobs-row">
                  <RotaryKnob
                    label="Scale Volts/Div"
                    value={ch0VoltsDiv}
                    min={0.1}
                    max={10}
                    step={0.1}
                    size={38}
                    onChange={(v) => setCh0VoltsDiv(Math.round(v * 10) / 10)}
                  />
                  <RotaryKnob
                    label="Vertical Position (Div)"
                    value={ch0VertPos}
                    min={-4}
                    max={4}
                    step={0.5}
                    size={38}
                    onChange={(v) => setCh0VertPos(Math.round(v * 2) / 2)}
                  />
                </div>

                <div className="ch-knob-inputs-row">
                  <div className="unit-box">
                    <select className="labview-dropdown tiny" value={ch0VoltsDiv} onChange={(e) => setCh0VoltsDiv(parseFloat(e.target.value))}>
                      <option value="0.1">100 mV</option>
                      <option value="0.5">500 mV</option>
                      <option value="1">1 V</option>
                      <option value="2">2 V</option>
                      <option value="5">5 V</option>
                    </select>
                  </div>
                  <div className="unit-box">
                    <input type="text" className="labview-num-input tiny" value={ch0VertPos} readOnly />
                  </div>
                </div>
              </fieldset>

              {/* Channel 1 Settings (Cyan) */}
              <fieldset className="labview-fieldset ch-fieldset">
                <legend className="labview-legend ch1-legend">
                  <span className="ch-color-box cyan" />
                  <span>Channel 1 Settings</span>
                </legend>

                <div className="ch-field-row">
                  <span className="ch-label">Source</span>
                  <select className="labview-dropdown tiny" value={ch1Source} onChange={(e) => setCh1Source(e.target.value)}>
                    <option value="AI 1">AI 1</option>
                    <option value="AI 0">AI 0</option>
                    <option value="AO 1">AO 1</option>
                  </select>
                </div>

                <div className="ch-options-row">
                  <label className="labview-checkbox-label">
                    <input type="checkbox" checked={ch1Enabled} onChange={(e) => setCh1Enabled(e.target.checked)} />
                    <span>Enabled</span>
                  </label>
                </div>

                <div className="ch-dual-selectors">
                  <div className="half-sel">
                    <span className="ctrl-tiny-label">Probe</span>
                    <select className="labview-dropdown tiny" value={ch1Probe} onChange={(e) => setCh1Probe(e.target.value)}>
                      <option value="1x">1x</option>
                      <option value="10x">10x</option>
                    </select>
                  </div>
                  <div className="half-sel">
                    <span className="ctrl-tiny-label">Coupling</span>
                    <select className="labview-dropdown tiny" value={ch1Coupling} onChange={(e) => setCh1Coupling(e.target.value)}>
                      <option value="DC">DC</option>
                      <option value="AC">AC</option>
                      <option value="GND">GND</option>
                    </select>
                  </div>
                </div>

                <div className="ch-knobs-row">
                  <RotaryKnob
                    label="Scale Volts/Div"
                    value={ch1VoltsDiv}
                    min={0.1}
                    max={10}
                    step={0.1}
                    size={38}
                    onChange={(v) => setCh1VoltsDiv(Math.round(v * 10) / 10)}
                  />
                  <RotaryKnob
                    label="Vertical Position (Div)"
                    value={ch1VertPos}
                    min={-4}
                    max={4}
                    step={0.5}
                    size={38}
                    onChange={(v) => setCh1VertPos(Math.round(v * 2) / 2)}
                  />
                </div>

                <div className="ch-knob-inputs-row">
                  <div className="unit-box">
                    <select className="labview-dropdown tiny" value={ch1VoltsDiv} onChange={(e) => setCh1VoltsDiv(parseFloat(e.target.value))}>
                      <option value="0.1">100 mV</option>
                      <option value="0.5">500 mV</option>
                      <option value="1">1 V</option>
                      <option value="2">2 V</option>
                      <option value="5">5 V</option>
                    </select>
                  </div>
                  <div className="unit-box">
                    <input type="text" className="labview-num-input tiny" value={ch1VertPos} readOnly />
                  </div>
                </div>
              </fieldset>
            </div>

            {/* Timebase & Trigger Row */}
            <div className="timebase-trigger-row">
              {/* Timebase Fieldset */}
              <fieldset className="labview-fieldset timebase-fieldset">
                <legend className="labview-legend">Timebase</legend>
                <div className="timebase-knob-box">
                  <RotaryKnob
                    label="Time/Div"
                    value={timeDiv}
                    min={0.1}
                    max={50}
                    step={0.5}
                    size={46}
                    onChange={(v) => setTimeDiv(Math.round(v * 10) / 10)}
                  />
                  <div className="timebase-select-box">
                    <select
                      className="labview-dropdown tiny"
                      value={timeDiv}
                      onChange={(e) => setTimeDiv(parseFloat(e.target.value))}
                    >
                      <option value="0.5">500 µs</option>
                      <option value="1">1 ms</option>
                      <option value="2">2 ms</option>
                      <option value="5">5 ms</option>
                      <option value="10">10 ms</option>
                      <option value="20">20 ms</option>
                    </select>
                  </div>
                </div>
              </fieldset>

              {/* Trigger Fieldset */}
              <fieldset className="labview-fieldset trigger-fieldset">
                <legend className="labview-legend">Trigger</legend>
                <div className="trigger-grid">
                  <div className="trig-item">
                    <span className="ctrl-tiny-label">Type</span>
                    <select className="labview-dropdown tiny" value={triggerType} onChange={(e) => setTriggerType(e.target.value)}>
                      <option value="Immediate">Immediate</option>
                      <option value="Edge">Edge</option>
                      <option value="Digital">Digital</option>
                    </select>
                  </div>

                  <div className="trig-item">
                    <span className="ctrl-tiny-label">Slope</span>
                    <button
                      className="trig-slope-btn"
                      onClick={() => setTriggerSlope(triggerSlope === 'positive' ? 'negative' : 'positive')}
                      title={`Slope: ${triggerSlope}`}
                    >
                      {triggerSlope === 'positive' ? '📈 Rising' : '📉 Falling'}
                    </button>
                  </div>

                  <div className="trig-item">
                    <span className="ctrl-tiny-label">Source</span>
                    <select className="labview-dropdown tiny" value={triggerSource} onChange={(e) => setTriggerSource(e.target.value)}>
                      <option value="CH 0">CH 0</option>
                      <option value="CH 1">CH 1</option>
                      <option value="TRIG">TRIG</option>
                    </select>
                  </div>

                  <div className="trig-item">
                    <span className="ctrl-tiny-label">Level (V)</span>
                    <input
                      type="number"
                      step="0.1"
                      className="labview-num-input tiny"
                      value={triggerLevel}
                      onChange={(e) => setTriggerLevel(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>

                <div className="horiz-pos-slider-box">
                  <span className="ctrl-tiny-label">Horizontal Position (%)</span>
                  <div className="slider-row">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={horizPos}
                      onChange={(e) => setHorizPos(parseInt(e.target.value))}
                      className="labview-slider"
                    />
                    <input type="text" className="labview-num-input tiny" value={horizPos} readOnly style={{ width: '32px' }} />
                  </div>
                </div>
              </fieldset>
            </div>

            {/* Instrument Control Fieldset */}
            <fieldset className="labview-fieldset inst-ctrl-fieldset">
              <legend className="labview-legend">Instrument Control</legend>
              <div className="scope-ctrl-grid">
                <div className="ctrl-col">
                  <span className="ctrl-tiny-label">Device</span>
                  <select className="labview-dropdown" value={device} onChange={(e) => setDevice(e.target.value)}>
                    <option value="Dev1 (NI myDAQ)">Dev1 (NI myDAQ)</option>
                    <option value="Dev2 (Virtual ELVIS)">Dev2 (Virtual ELVIS)</option>
                  </select>
                </div>

                <div className="ctrl-col">
                  <span className="ctrl-tiny-label">Acquisition Mode</span>
                  <select className="labview-dropdown" value={acqMode} onChange={(e) => setAcqMode(e.target.value)}>
                    <option value="Run Continuously">Run Continuously</option>
                    <option value="Single">Single</option>
                  </select>
                </div>
              </div>

              <div className="scope-action-buttons-row">
                <button
                  className="scope-btn autoscale-btn"
                  onClick={handleAutoscale}
                  title="Autoscale Volts/Div and Timebase"
                >
                  Autoscale
                </button>

                <button
                  className={`scope-btn run-btn ${isRunning ? 'active' : ''}`}
                  onClick={() => {
                    setIsRunning(true);
                    if (state.simulation.status !== 'running' || state.instruments.daq?.enabled === false) {
                      dispatch({ type: 'RUN_SIMULATION' });
                      dispatch({ type: 'UPDATE_DAQ', settings: { enabled: true } });
                      window.dispatchEvent(new CustomEvent('daq-power-change', { detail: { enabled: true } }));
                    }
                  }}
                  title="Run Acquisition & Start Simulation"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#10B981">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>Run</span>
                </button>

                <button
                  className={`scope-btn stop-btn ${!isRunning ? 'active' : ''}`}
                  onClick={() => setIsRunning(false)}
                  title="Stop Acquisition"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#EF4444">
                    <rect x="4" y="4" width="16" height="16" />
                  </svg>
                  <span>Stop</span>
                </button>

                <button className="scope-btn log-btn" title="Log Data">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                  <span>Log</span>
                </button>

                <button className="scope-btn help-btn" title="Help">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#8B5CF6">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                </button>
              </div>
            </fieldset>
          </div>
        </div>
      </div>
    </div>
  );
}
