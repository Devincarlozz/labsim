import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { RotaryKnob } from '../common/RotaryKnob';
import { useStore } from '../../store/CircuitStore';

interface FunctionGeneratorProps {
  onSignalChange?: (params: { waveform: string; frequency: number; amplitude: number; offset: number }) => void;
}

type FgenTab = 'waveform' | 'sweep' | 'control';

export function LabViewFunctionGenerator({ onSignalChange }: FunctionGeneratorProps) {
  const { state, dispatch } = useStore();
  const [activeTab, setActiveTab] = useState<FgenTab>('waveform');
  const [waveform, setWaveform] = useState<'sine' | 'triangle' | 'square'>('sine');
  const [frequency, setFrequency] = useState(100.0);
  const [freqUnit, setFreqUnit] = useState<'Hz' | 'kHz'>('Hz');
  const [amplitude, setAmplitude] = useState(1.0);
  const [dcOffset, setDcOffset] = useState(0.0);
  const [dutyCycle, setDutyCycle] = useState(50);
  const [modulationType, setModulationType] = useState('None');

  // Sweep Settings
  const [startFreq, setStartFreq] = useState(100.0);
  const [stopFreq, setStopFreq] = useState(1000.0);
  const [stepFreq, setStepFreq] = useState(100.0);
  const [stepInterval, setStepInterval] = useState(1000);
  const [isSweeping, setIsSweeping] = useState(false);

  // Instrument Control
  const [device, setDevice] = useState('Dev1 (NI myDAQ)');
  const [signalRoute, setSignalRoute] = useState('AO 0');
  const [isRunning, setIsRunning] = useState(true);
  const [manualMode, setManualMode] = useState(false);

  const actualFreq = useMemo(
    () => (freqUnit === 'kHz' ? frequency * 1000 : frequency),
    [frequency, freqUnit]
  );

  // Sync with global store
  useEffect(() => {
    dispatch({
      type: 'UPDATE_FUNCTION_GEN',
      settings: {
        waveform,
        frequency: actualFreq,
        amplitude,
        dcOffset,
        enabled: isRunning,
      },
    });
    if (onSignalChange) {
      onSignalChange({
        waveform,
        frequency: actualFreq,
        amplitude,
        offset: dcOffset,
      });
    }
  }, [waveform, actualFreq, amplitude, dcOffset, isRunning]);

  // Sweep execution timer
  useEffect(() => {
    if (!isSweeping || !isRunning) return;
    const interval = setInterval(() => {
      setFrequency((prev) => {
        let next = prev + stepFreq;
        if (next > stopFreq) next = startFreq;
        return Math.round(next * 100) / 100;
      });
    }, stepInterval);
    return () => clearInterval(interval);
  }, [isSweeping, isRunning, startFreq, stopFreq, stepFreq, stepInterval]);

  const formattedDigitalFreq = `${frequency.toFixed(4)} ${freqUnit}`;

  const tabs: { id: FgenTab; label: string }[] = [
    { id: 'waveform', label: 'Waveform' },
    { id: 'sweep', label: 'Sweep' },
    { id: 'control', label: 'Control' },
  ];

  return (
    <div className="labview-fgen-panel fgen-optimized">
      {/* Top Banner & Digital 7-Segment Readout */}
      <div className="fgen-top-row">
        <div className="labview-badge">
          <div className="labview-badge-inner">
            <span className="labview-badge-sub">POWERED BY</span>
            <span className="labview-badge-main">LabVIEW</span>
          </div>
        </div>

        <div className="fgen-digital-display">
          <span className="fgen-digital-text">{formattedDigitalFreq}</span>
        </div>

        {/* Compact action buttons inline with readout */}
        <div className="fgen-quick-actions">
          <button
            className={`fgen-qa-btn run ${isRunning && !isSweeping ? 'active' : ''}`}
            onClick={() => { setIsRunning(true); setIsSweeping(false); }}
            title="Run Continuous"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#10B981">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </button>
          <button
            className={`fgen-qa-btn sweep ${isSweeping ? 'active' : ''}`}
            onClick={() => { setIsSweeping(true); setIsRunning(true); }}
            title="Run Sweep"
          >
            <svg width="14" height="12" viewBox="0 0 24 14" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round">
              <path d="M1 7c2-5 3-5 5 0s3 5 5 0 2-4 4 0 2 4 4 0 2-3 4 0" />
            </svg>
          </button>
          <button
            className={`fgen-qa-btn stop ${!isRunning ? 'active' : ''}`}
            onClick={() => { setIsRunning(false); setIsSweeping(false); }}
            title="Stop"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="#EF4444">
              <rect x="4" y="4" width="16" height="16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tab Row */}
      <div className="fgen-tab-row">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`fgen-tab-btn ${activeTab === t.id ? 'active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="fgen-tab-content">
        {/* ─── Waveform Tab ─────────────────────────────────────────────── */}
        {activeTab === 'waveform' && (
          <div className="fgen-waveform-tab">
            <div className="waveform-settings-grid">
              {/* Waveform Selector Buttons */}
              <div className="waveform-buttons-col">
                <button
                  className={`wf-select-btn ${waveform === 'sine' ? 'active' : ''}`}
                  onClick={() => setWaveform('sine')}
                  title="Sine Wave"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M2 12c3-8 5-8 8 0s5 8 8 0" />
                  </svg>
                </button>
                <button
                  className={`wf-select-btn ${waveform === 'triangle' ? 'active' : ''}`}
                  onClick={() => setWaveform('triangle')}
                  title="Triangle Wave"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 16l5-10 6 12 5-10 4 8" />
                  </svg>
                </button>
                <button
                  className={`wf-select-btn ${waveform === 'square' ? 'active' : ''}`}
                  onClick={() => setWaveform('square')}
                  title="Square Wave"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 16h4V8h6v8h4V8h6" />
                  </svg>
                </button>
              </div>

              {/* Rotary Knobs */}
              <div className="fgen-knobs-area">
                {/* Frequency Knob */}
                <div className="fgen-knob-cell">
                  <RotaryKnob
                    label="Frequency"
                    value={frequency}
                    min={1}
                    max={1000}
                    step={1}
                    size={52}
                    ticks={[
                      { value: 1, label: '200m' },
                      { value: 1000, label: '20k' },
                    ]}
                    onChange={(val) => setFrequency(Math.round(val))}
                  />
                  <div className="fgen-numeric-box">
                    <input
                      type="number"
                      className="labview-num-input"
                      value={frequency}
                      onChange={(e) => setFrequency(parseFloat(e.target.value) || 1)}
                    />
                    <select
                      className="labview-unit-select"
                      value={freqUnit}
                      onChange={(e) => setFreqUnit(e.target.value as any)}
                    >
                      <option value="Hz">Hz</option>
                      <option value="kHz">kHz</option>
                    </select>
                  </div>
                </div>

                {/* Amplitude Knob */}
                <div className="fgen-knob-cell">
                  <RotaryKnob
                    label="Amplitude"
                    value={amplitude}
                    min={0}
                    max={10}
                    step={0.1}
                    size={40}
                    ticks={[
                      { value: 0, label: '0.0' },
                      { value: 10, label: '10.0' },
                    ]}
                    onChange={(val) => setAmplitude(Math.round(val * 100) / 100)}
                  />
                  <div className="fgen-numeric-box">
                    <input
                      type="number"
                      step="0.01"
                      className="labview-num-input small"
                      value={amplitude.toFixed(2)}
                      onChange={(e) => setAmplitude(parseFloat(e.target.value) || 0)}
                    />
                    <span className="unit-label">Vpp</span>
                  </div>
                </div>

                {/* DC Offset Knob */}
                <div className="fgen-knob-cell">
                  <RotaryKnob
                    label="DC Offset"
                    value={dcOffset}
                    min={-5}
                    max={5}
                    step={0.1}
                    size={40}
                    ticks={[
                      { value: -5, label: '-5.0' },
                      { value: 5, label: '5.0' },
                    ]}
                    onChange={(val) => setDcOffset(Math.round(val * 100) / 100)}
                  />
                  <div className="fgen-numeric-box">
                    <input
                      type="number"
                      step="0.01"
                      className="labview-num-input small"
                      value={dcOffset.toFixed(2)}
                      onChange={(e) => setDcOffset(parseFloat(e.target.value) || 0)}
                    />
                    <span className="unit-label">V</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Compact params row */}
            <div className="waveform-aux-row">
              <div className="aux-field">
                <span className="aux-label">Duty Cycle</span>
                <div className="fgen-numeric-box inline">
                  <input
                    type="number"
                    min="1"
                    max="99"
                    className="labview-num-input tiny"
                    value={dutyCycle}
                    onChange={(e) => setDutyCycle(parseInt(e.target.value) || 50)}
                  />
                  <span className="unit-label">%</span>
                </div>
              </div>

              <div className="aux-field">
                <span className="aux-label">Modulation</span>
                <select
                  className="labview-dropdown"
                  value={modulationType}
                  onChange={(e) => setModulationType(e.target.value)}
                >
                  <option value="None">None</option>
                  <option value="AM">AM</option>
                  <option value="FM">FM</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* ─── Sweep Tab ────────────────────────────────────────────────── */}
        {activeTab === 'sweep' && (
          <div className="fgen-sweep-tab">
            <div className="sweep-fields-grid">
              <div className="sweep-field">
                <span className="sweep-label">Start Frequency</span>
                <div className="fgen-numeric-box">
                  <input
                    type="number"
                    className="labview-num-input"
                    value={startFreq}
                    onChange={(e) => setStartFreq(parseFloat(e.target.value) || 1)}
                  />
                  <span className="unit-label">Hz</span>
                </div>
              </div>

              <div className="sweep-field">
                <span className="sweep-label">Stop Frequency</span>
                <div className="fgen-numeric-box">
                  <input
                    type="number"
                    className="labview-num-input"
                    value={stopFreq}
                    onChange={(e) => setStopFreq(parseFloat(e.target.value) || 1000)}
                  />
                  <span className="unit-label">Hz</span>
                </div>
              </div>

              <div className="sweep-field">
                <span className="sweep-label">Step</span>
                <div className="fgen-numeric-box">
                  <input
                    type="number"
                    className="labview-num-input"
                    value={stepFreq}
                    onChange={(e) => setStepFreq(parseFloat(e.target.value) || 10)}
                  />
                  <span className="unit-label">Hz</span>
                </div>
              </div>

              <div className="sweep-field">
                <span className="sweep-label">Step Interval</span>
                <div className="fgen-numeric-box">
                  <input
                    type="number"
                    className="labview-num-input"
                    value={stepInterval}
                    onChange={(e) => setStepInterval(parseInt(e.target.value) || 1000)}
                  />
                  <span className="unit-label">ms</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Control Tab ──────────────────────────────────────────────── */}
        {activeTab === 'control' && (
          <div className="fgen-control-tab">
            <div className="inst-control-row-labview">
              <div className="device-route-group">
                <div className="control-item">
                  <span className="ctrl-label">Device</span>
                  <select className="labview-dropdown" value={device} onChange={(e) => setDevice(e.target.value)}>
                    <option value="Dev1 (NI myDAQ)">Dev1 (NI myDAQ)</option>
                    <option value="Dev2 (Virtual)">Dev2 (Virtual ELVIS)</option>
                  </select>
                </div>

                <div className="control-item">
                  <span className="ctrl-label">Signal Route</span>
                  <select className="labview-dropdown" value={signalRoute} onChange={(e) => setSignalRoute(e.target.value)}>
                    <option value="AO 0">AO 0</option>
                    <option value="AO 1">AO 1</option>
                    <option value="FGEN OUT">FGEN OUT</option>
                  </select>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="inst-action-buttons">
                <button
                  className={`labview-action-btn run-btn ${isRunning && !isSweeping ? 'active' : ''}`}
                  onClick={() => { setIsRunning(true); setIsSweeping(false); }}
                  title="Run Continuous"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#10B981">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>Run</span>
                </button>

                <button
                  className={`labview-action-btn sweep-btn ${isSweeping ? 'active' : ''}`}
                  onClick={() => { setIsSweeping(true); setIsRunning(true); }}
                  title="Run Sweep"
                >
                  <svg width="18" height="14" viewBox="0 0 24 14" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round">
                    <path d="M1 7c2-5 3-5 5 0s3 5 5 0 2-4 4 0 2 4 4 0 2-3 4 0" />
                  </svg>
                  <span>Sweep</span>
                </button>

                <button
                  className={`labview-action-btn stop-btn ${!isRunning ? 'active' : ''}`}
                  onClick={() => { setIsRunning(false); setIsSweeping(false); }}
                  title="Stop"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#EF4444">
                    <rect x="4" y="4" width="16" height="16" />
                  </svg>
                  <span>Stop</span>
                </button>

                <button className="labview-action-btn help-btn" title="Help">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#8B5CF6">
                    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="manual-mode-check">
              <label className="labview-checkbox-label">
                <input
                  type="checkbox"
                  checked={manualMode}
                  onChange={(e) => setManualMode(e.target.checked)}
                />
                <span>Manual Mode</span>
              </label>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
