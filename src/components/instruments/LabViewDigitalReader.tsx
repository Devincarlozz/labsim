import React, { useState, useCallback, useMemo } from 'react';
import { useSimEngine } from '../../simulation/engine/useSimEngine';
import {
  LabViewPoweredLogo,
  BlueLedIndicator,
  RunArrowIcon,
  StopSquareIcon,
  HelpBookIcon,
  CascadeWindowIcon,
} from './LabViewCommonIcons';

import { useStore } from '../../store/CircuitStore';

type LineRange = '0 - 7' | '0 - 3' | '4 - 7';
type AcquisitionMode = 'Run Continuously' | '1 Shot';

export function LabViewDigitalReader() {
  const { state } = useStore();
  const { snapshot } = useSimEngine();

  // Hardware DAQ power state from store
  const isDaqHardwareOn = state.instruments.daq?.enabled !== false && state.simulation.status === 'running';

  // Settings
  const [linesToRead, setLinesToRead] = useState<LineRange>('0 - 7'); // Default 0-7 so all active lines are accessible
  const [device, setDevice] = useState<string>('Dev1 (NI myDAQ)');
  const [acquisitionMode, setAcquisitionMode] = useState<AcquisitionMode>('Run Continuously');
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [showHelp, setShowHelp] = useState<boolean>(false);

  // Determine which lines are active according to linesToRead
  const isLineActive = useCallback(
    (lineIdx: number): boolean => {
      if (linesToRead === '0 - 7') return true;
      if (linesToRead === '0 - 3') return lineIdx <= 3;
      if (linesToRead === '4 - 7') return lineIdx >= 4;
      return true;
    },
    [linesToRead]
  );

  // Deterministically computed from SimEngine snapshot - strictly all OFF when DAQ is not running/powered
  const readBits = useMemo(() => {
    if (!isDaqHardwareOn || !isRunning || snapshot.daqState !== 'RUNNING') {
      return [false, false, false, false, false, false, false, false];
    }
    const sampled: boolean[] = [];
    for (let i = 0; i < 8; i++) {
      if (!isLineActive(i)) {
        sampled.push(false);
        continue;
      }
      const diLvl = snapshot.daq.di[i];
      // Only lit when DI receives digital HIGH (1)
      const isHigh = diLvl === 1;
      sampled.push(isHigh);
    }
    return sampled;
  }, [isDaqHardwareOn, isRunning, snapshot, isLineActive]);

  // Run handler
  const handleRun = () => {
    setIsRunning(true);
    if (acquisitionMode === '1 Shot') {
      setTimeout(() => setIsRunning(false), 200);
    }
  };

  // Stop handler
  const handleStop = () => {
    setIsRunning(false);
  };

  // Calculate hex value of active lines
  const hexDisplay = useMemo(() => {
    let numericValue = 0;
    let bitOffset = 0;

    for (let i = 0; i < 8; i++) {
      if (isLineActive(i)) {
        if (readBits[i]) {
          numericValue |= 1 << bitOffset;
        }
        bitOffset++;
      }
    }

    return `x ${numericValue.toString(16).toUpperCase()}`;
  }, [readBits, isLineActive]);

  // Visual lines left to right: 7, 6, 5, 4, 3, 2, 1, 0
  const visualLines = [7, 6, 5, 4, 3, 2, 1, 0];

  return (
    <div className="elvis-instrument-container elvis-reader-theme">
      {/* ─── Top Black Header ─────────────────────────────────────────── */}
      <div className="elvis-header-black">
        <div className="elvis-header-top-row">
          <LabViewPoweredLogo />
          <div className="elvis-header-right-tools">
            <button
              type="button"
              className="elvis-header-icon-btn"
              title="Duplicate / Cascade"
              onClick={() => {}}
            >
              <CascadeWindowIcon />
            </button>
            <div className="elvis-numeric-display">
              <span className="elvis-numeric-label">Numeric Value</span>
              <span className="elvis-numeric-value">{hexDisplay}</span>
            </div>
          </div>
        </div>

        <div className="elvis-header-lines-row">
          <span className="elvis-linestates-label">Line<br />States</span>
          <div className="elvis-leds-group">
            {visualLines.map((lineIdx) => {
              const active = isLineActive(lineIdx);
              const isLit = active && readBits[lineIdx];
              return (
                <div key={lineIdx} className="elvis-led-column">
                  <BlueLedIndicator active={isLit} inactive={!active} size={22} />
                  <span className={`elvis-led-num ${!active ? 'dimmed' : ''}`}>{lineIdx}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Instrument Body ─────────────────────────────────────────── */}
      <div className="elvis-body-panel">
        {/* Group 1: Configuration Settings */}
        <fieldset className="elvis-fieldset">
          <legend className="elvis-legend">Configuration Settings</legend>

          <div className="elvis-field-row">
            <label className="elvis-field-label">Lines to Read</label>
            <select
              className="elvis-select"
              value={linesToRead}
              onChange={(e) => setLinesToRead(e.target.value as LineRange)}
            >
              <option value="0 - 7">0 - 7</option>
              <option value="0 - 3">0 - 3</option>
              <option value="4 - 7">4 - 7</option>
            </select>
          </div>

          {/* Clean space below matching screenshot */}
          <div className="elvis-reader-empty-space" />
        </fieldset>

        {/* Group 2: Instrument Control */}
        <fieldset className="elvis-fieldset">
          <legend className="elvis-legend">Instrument Control</legend>

          <div className="elvis-control-grid">
            <div className="elvis-control-col">
              <label className="elvis-field-label">Device</label>
              <select
                className="elvis-select"
                value={device}
                onChange={(e) => setDevice(e.target.value)}
              >
                <option value="Dev1 (NI myDAQ)">Dev1 (NI myDAQ)</option>
                <option value="Dev1 (NI ELVIS II)">Dev1 (NI ELVIS II)</option>
                <option value="No Supported Devices">No Supported Devices</option>
              </select>
            </div>

            <div className="elvis-control-col">
              <label className="elvis-field-label">Acquisition Mode</label>
              <select
                className="elvis-select"
                value={acquisitionMode}
                onChange={(e) => setAcquisitionMode(e.target.value as AcquisitionMode)}
              >
                <option value="Run Continuously">Run Continuously</option>
                <option value="1 Shot">1 Shot</option>
              </select>
            </div>
          </div>

          <div className="elvis-instrument-buttons-row">
            <div className="elvis-btn-col">
              <span className="elvis-btn-top-label">Run</span>
              <button
                type="button"
                className={`elvis-inst-btn ${isRunning ? 'active-run' : ''}`}
                onClick={handleRun}
                title="Start reading inputs"
              >
                <RunArrowIcon />
              </button>
            </div>

            <div className="elvis-btn-col">
              <span className="elvis-btn-top-label">Stop</span>
              <button
                type="button"
                className={`elvis-inst-btn ${!isRunning ? 'active-stop' : ''}`}
                onClick={handleStop}
                title="Stop reading inputs"
              >
                <StopSquareIcon />
              </button>
            </div>

            <div className="elvis-inst-divider" />

            <div className="elvis-btn-col">
              <span className="elvis-btn-top-label">Help</span>
              <button
                type="button"
                className="elvis-inst-btn elvis-help-btn"
                onClick={() => setShowHelp(!showHelp)}
                title="Help on Digital Reader"
              >
                <HelpBookIcon />
              </button>
            </div>
          </div>
        </fieldset>

        {/* Optional Help popup modal */}
        {showHelp && (
          <div className="elvis-help-modal" onClick={() => setShowHelp(false)}>
            <div className="elvis-help-content" onClick={(e) => e.stopPropagation()}>
              <div className="elvis-help-header">
                <strong>Digital Reader — NI ELVISmx</strong>
                <button type="button" className="elvis-help-close" onClick={() => setShowHelp(false)}>
                  ✕
                </button>
              </div>
              <div className="elvis-help-body">
                <p>The <strong>Digital Reader</strong> acquires and displays digital logic levels from the digital I/O lines (DIO 0 through DIO 7) on the NI ELVIS II station or breadboard.</p>
                <ul>
                  <li><strong>Lines to Read:</strong> Select lines 0 - 7, 0 - 3, or 4 - 7 to read.</li>
                  <li><strong>Line States:</strong> Glowing blue LEDs indicate a logic HIGH state (5V TTL). Unlit LEDs indicate a logic LOW (0V GND).</li>
                  <li><strong>Numeric Value:</strong> Displays the corresponding hexadecimal integer value of the active lines.</li>
                  <li><strong>Acquisition Mode:</strong> Continuous or single-shot acquisition.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
