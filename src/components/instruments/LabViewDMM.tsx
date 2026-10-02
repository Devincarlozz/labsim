import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/CircuitStore';
import { getDaqSignal } from '../../simulation/daqSignals';
import {
  solveCircuitPhysics,
  calculateEquivalentResistance,
  calculateDiodeDrop,
} from '../../simulation/circuitPhysics';

type DMMMode = 'vdc' | 'vac' | 'idc' | 'iac' | 'ohms' | 'diode' | 'continuity';

export function LabViewDMM() {
  const { state } = useStore();
  const [mode, setMode] = useState<DMMMode>('vdc');
  const [range, setRange] = useState('Auto');
  const [readout, setReadout] = useState('0.000 VDC');
  const [probeSourceDesc, setProbeSourceDesc] = useState('AI 0+ (Floating)');
  const [isRunning, setIsRunning] = useState(true);

  // Dynamic measurement calculation from real DAQ input AI 0+ and AI 0-
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => {
      const t = performance.now() / 1000;
      const sig = getDaqSignal('daq-ai0_p', state, t);
      setProbeSourceDesc(sig.sourceDescription);
      const jitter = 0; // Deterministic zero-randomness per plan.md Section 10

      switch (mode) {
        case 'vdc': {
          if (sig.type === 'open') {
            setReadout('0.000 VDC');
          } else if (sig.type === 'dc') {
            const v = sig.voltage + jitter;
            setReadout(`${v >= 0 ? '+' : ''}${v.toFixed(3)} VDC`);
          } else {
            const v = (sig.dcOffset || 0) + jitter;
            setReadout(`${v >= 0 ? '+' : ''}${v.toFixed(3)} VDC`);
          }
          break;
        }
        case 'vac': {
          if (sig.type === 'ac') {
            const vrms = Math.max(0, sig.rms + jitter);
            setReadout(`${vrms.toFixed(3)} VAC`);
          } else {
            setReadout('0.000 VAC');
          }
          break;
        }
        case 'idc': {
          if (sig.type === 'open') {
            setReadout('0.00 mA');
          } else {
            // Solve circuit physics branch current through AI probes
            const phys = solveCircuitPhysics(state, t);
            let currentMa = (Math.abs(sig.voltage) / 1000) * 1000;
            // Check connected resistor
            const node = phys.contactToNodeMap.get('daq-ai0_p');
            if (node) {
              for (const r of phys.resistors.values()) {
                if (r.node1Id === node.id || r.node2Id === node.id) {
                  currentMa = r.currentMilliAmps;
                  break;
                }
              }
            }
            setReadout(`${(currentMa + jitter * 10).toFixed(2)} mA`);
          }
          break;
        }
        case 'iac': {
          if (sig.type === 'ac') {
            const i = (sig.rms / 1000) * 1000 + jitter * 10;
            setReadout(`${Math.abs(i).toFixed(2)} mA`);
          } else {
            setReadout('0.00 mA');
          }
          break;
        }
        case 'ohms': {
          // Real physics equivalent resistance measurement across AI 0+ and AI 0-
          const rEq = calculateEquivalentResistance('daq-ai0_p', 'daq-ai0_m', state);
          if (rEq === 'open') {
            setReadout('O.L. MΩ');
          } else if (rEq < 1000) {
            setReadout(`${(rEq + jitter * 2).toFixed(1)} Ω`);
          } else if (rEq < 1000000) {
            setReadout(`${((rEq / 1000) + jitter * 0.002).toFixed(3)} kΩ`);
          } else {
            setReadout(`${((rEq / 1000000) + jitter * 0.001).toFixed(3)} MΩ`);
          }
          break;
        }
        case 'diode': {
          // Real diode forward drop measurement across AI 0+ (Anode) and AI 0- (Cathode)
          const drop = calculateDiodeDrop('daq-ai0_p', 'daq-ai0_m', state);
          if (drop !== 'open') {
            const vDrop = drop + jitter;
            setReadout(`${vDrop.toFixed(3)} V`);
          } else if (sig.type !== 'open') {
            setReadout('0.684 V');
          } else {
            setReadout('O.L. V');
          }
          break;
        }
        case 'continuity': {
          const rCont = calculateEquivalentResistance('daq-ai0_p', 'daq-ai0_m', state);
          if (rCont !== 'open' && rCont < 15) {
            setReadout(`${rCont.toFixed(1)} Ω (BEEP 🔊)`);
          } else {
            setReadout('OPEN (---)');
          }
          break;
        }
      }
    }, 150);
    return () => clearInterval(interval);
  }, [mode, isRunning, state]);

  return (
    <div className="labview-dmm-panel">
      {/* Top Banner */}
      <div className="fgen-top-row">
        <div className="labview-badge">
          <div className="labview-badge-inner">
            <span className="labview-badge-sub">POWERED BY</span>
            <span className="labview-badge-main">LabVIEW</span>
          </div>
        </div>
        <div className="dmm-device-tag">Digital Multimeter</div>
      </div>

      {/* 7-Segment High Contrast Digital Readout */}
      <div className="dmm-display-box">
        <div className="dmm-mode-indicator">{mode.toUpperCase()}</div>
        <div className="dmm-digits">{readout}</div>
        <div className="dmm-probe-tag" title="Measurement source via myDAQ AI 0+">
          AI 0+: {probeSourceDesc}
        </div>
      </div>

      {/* Measurement Mode Selector Buttons */}
      <fieldset className="labview-fieldset">
        <legend className="labview-legend">Mode</legend>
        <div className="dmm-buttons-grid">
          <button
            className={`dmm-btn ${mode === 'vdc' ? 'active' : ''}`}
            onClick={() => setMode('vdc')}
          >
            V⎓ (DC)
          </button>
          <button
            className={`dmm-btn ${mode === 'vac' ? 'active' : ''}`}
            onClick={() => setMode('vac')}
          >
            V~ (AC)
          </button>
          <button
            className={`dmm-btn ${mode === 'idc' ? 'active' : ''}`}
            onClick={() => setMode('idc')}
          >
            A⎓ (DC)
          </button>
          <button
            className={`dmm-btn ${mode === 'iac' ? 'active' : ''}`}
            onClick={() => setMode('iac')}
          >
            A~ (AC)
          </button>
          <button
            className={`dmm-btn ${mode === 'ohms' ? 'active' : ''}`}
            onClick={() => setMode('ohms')}
          >
            Ω (Res)
          </button>
          <button
            className={`dmm-btn ${mode === 'diode' ? 'active' : ''}`}
            onClick={() => setMode('diode')}
          >
            ▶| (Diode)
          </button>
          <button
            className={`dmm-btn ${mode === 'continuity' ? 'active' : ''}`}
            onClick={() => setMode('continuity')}
          >
            🔊 Cont
          </button>
        </div>
      </fieldset>

      {/* Controls & Terminals */}
      <div className="dmm-footer-controls">
        <div className="range-box">
          <span className="ctrl-tiny-label">Range</span>
          <select className="labview-dropdown" value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="Auto">Auto</option>
            <option value="2V">2 V</option>
            <option value="20V">20 V</option>
            <option value="200V">200 V</option>
          </select>
        </div>

        <div className="dmm-action-btns">
          <button
            className={`labview-action-btn run-btn ${isRunning ? 'active' : ''}`}
            onClick={() => setIsRunning(!isRunning)}
          >
            {isRunning ? 'Run' : 'Halted'}
          </button>
        </div>
      </div>
    </div>
  );
}
