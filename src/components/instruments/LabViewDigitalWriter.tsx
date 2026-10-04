import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../store/CircuitStore';
import {
  LabViewPoweredLogo,
  BlueLedIndicator,
  RunArrowIcon,
  StopSquareIcon,
  HelpBookIcon,
} from './LabViewCommonIcons';

type LineRange = '0 - 7' | '0 - 3' | '4 - 7';
type PatternMode = 'Manual' | 'Count Up' | 'Count Down' | 'Walking 1s' | 'Walking 0s';
type ShiftDirection = 'Left' | 'Right';
type GenerationMode = 'Run Continuously' | '1 Shot';

export function LabViewDigitalWriter() {
  const { state, dispatch } = useStore();

  // Store's DAQ state
  const storeBits = state.instruments.daq?.dioBits ?? [0, 0, 0, 0, 0, 0, 0, 0];

  // Local state
  const [linesToWrite, setLinesToWrite] = useState<LineRange>('0 - 7');
  const [pattern, setPattern] = useState<PatternMode>('Manual');
  const [direction, setDirection] = useState<ShiftDirection>('Left');
  const [device, setDevice] = useState<string>('Dev1 (NI myDAQ)');
  const [generationMode, setGenerationMode] = useState<GenerationMode>('Run Continuously');
  const [isRunning, setIsRunning] = useState<boolean>(true);
  const [showHelp, setShowHelp] = useState<boolean>(false);

  // Local bits: 8 boolean elements, index 0 is Line 0 (LSB), index 7 is Line 7 (MSB)
  const [bits, setBits] = useState<boolean[]>(() =>
    storeBits.map((b) => b === 1)
  );

  // Sync with store if external changes happen
  useEffect(() => {
    setBits(storeBits.map((b) => b === 1));
  }, [storeBits]);

  // Determine active lines based on selection
  const isLineActive = useCallback(
    (lineIdx: number): boolean => {
      if (linesToWrite === '0 - 7') return true;
      if (linesToWrite === '0 - 3') return lineIdx <= 3;
      if (linesToWrite === '4 - 7') return lineIdx >= 4;
      return true;
    },
    [linesToWrite]
  );

  // Push bit values and direction to CircuitStore so breadboard, TopDAQPanel, and simulation reflect output
  const syncToStore = useCallback(
    (newBits: boolean[]) => {
      const numericBits = newBits.map((b) => (b ? 1 : 0));
      const dioDir = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => isLineActive(i));
      dispatch({
        type: 'UPDATE_DAQ',
        settings: {
          dioBits: numericBits,
          dioDirection: dioDir,
        },
      });
    },
    [dispatch, isLineActive]
  );

  // Sync line direction when linesToWrite changes
  useEffect(() => {
    const dioDir = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => isLineActive(i));
    dispatch({
      type: 'UPDATE_DAQ',
      settings: { dioDirection: dioDir },
    });
  }, [linesToWrite, isLineActive, dispatch]);

  // Toggle a single line switch (lines 7 down to 0)
  const handleToggleSwitch = (lineIdx: number) => {
    if (!isLineActive(lineIdx)) return;
    setBits((prev) => {
      const next = [...prev];
      next[lineIdx] = !next[lineIdx];
      if (isRunning || generationMode === 'Run Continuously') {
        syncToStore(next);
      }
      return next;
    });
  };

  // Action: Toggle (inverts active lines)
  const handleActionToggle = () => {
    setBits((prev) => {
      const next = prev.map((val, idx) => (isLineActive(idx) ? !val : val));
      if (isRunning || generationMode === 'Run Continuously') {
        syncToStore(next);
      }
      return next;
    });
  };

  // Action: Rotate (rotate active bits left or right)
  const handleActionRotate = () => {
    setBits((prev) => {
      const next = [...prev];
      const activeIndices = [0, 1, 2, 3, 4, 5, 6, 7].filter(isLineActive);
      if (activeIndices.length === 0) return prev;

      if (direction === 'Left') {
        // Shift toward higher indices (Left in visual order is 0->1->...->7)
        // Visually: 7 is left, 0 is right. Left means toward 7 (MSB)
        const msbVal = next[activeIndices[activeIndices.length - 1]];
        for (let i = activeIndices.length - 1; i > 0; i--) {
          next[activeIndices[i]] = next[activeIndices[i - 1]];
        }
        next[activeIndices[0]] = msbVal;
      } else {
        // Right means toward 0 (LSB)
        const lsbVal = next[activeIndices[0]];
        for (let i = 0; i < activeIndices.length - 1; i++) {
          next[activeIndices[i]] = next[activeIndices[i + 1]];
        }
        next[activeIndices[activeIndices.length - 1]] = lsbVal;
      }

      if (isRunning || generationMode === 'Run Continuously') {
        syncToStore(next);
      }
      return next;
    });
  };

  // Action: Shift (shift active bits with 0 entering)
  const handleActionShift = () => {
    setBits((prev) => {
      const next = [...prev];
      const activeIndices = [0, 1, 2, 3, 4, 5, 6, 7].filter(isLineActive);
      if (activeIndices.length === 0) return prev;

      if (direction === 'Left') {
        // Shift toward MSB, 0 shifts into LSB
        for (let i = activeIndices.length - 1; i > 0; i--) {
          next[activeIndices[i]] = next[activeIndices[i - 1]];
        }
        next[activeIndices[0]] = false;
      } else {
        // Shift toward LSB, 0 shifts into MSB
        for (let i = 0; i < activeIndices.length - 1; i++) {
          next[activeIndices[i]] = next[activeIndices[i + 1]];
        }
        next[activeIndices[activeIndices.length - 1]] = false;
      }

      if (isRunning || generationMode === 'Run Continuously') {
        syncToStore(next);
      }
      return next;
    });
  };

  // Automated pattern runner (Count Up/Down, Walking 1s/0s)
  const autoPatternRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isRunning || pattern === 'Manual') {
      if (autoPatternRef.current) {
        clearInterval(autoPatternRef.current);
        autoPatternRef.current = null;
      }
      return;
    }

    autoPatternRef.current = window.setInterval(() => {
      setBits((prev) => {
        const next = [...prev];
        const activeIndices = [0, 1, 2, 3, 4, 5, 6, 7].filter(isLineActive);
        const count = activeIndices.length;
        if (count === 0) return prev;

        // Current value of active bits as integer
        let currentInt = 0;
        activeIndices.forEach((lineIdx, i) => {
          if (next[lineIdx]) currentInt |= 1 << i;
        });

        const maxVal = (1 << count) - 1;

        if (pattern === 'Count Up') {
          currentInt = (currentInt + 1) & maxVal;
          activeIndices.forEach((lineIdx, i) => {
            next[lineIdx] = ((currentInt >> i) & 1) === 1;
          });
        } else if (pattern === 'Count Down') {
          currentInt = (currentInt - 1 + (maxVal + 1)) & maxVal;
          activeIndices.forEach((lineIdx, i) => {
            next[lineIdx] = ((currentInt >> i) & 1) === 1;
          });
        } else if (pattern === 'Walking 1s') {
          if (currentInt === 0 || (currentInt & (currentInt - 1)) !== 0) {
            currentInt = 1;
          } else {
            currentInt = direction === 'Left' ? (currentInt << 1) : (currentInt >> 1);
            if (currentInt > maxVal || currentInt === 0) {
              currentInt = direction === 'Left' ? 1 : 1 << (count - 1);
            }
          }
          activeIndices.forEach((lineIdx, i) => {
            next[lineIdx] = ((currentInt >> i) & 1) === 1;
          });
        } else if (pattern === 'Walking 0s') {
          let inverted = ~currentInt & maxVal;
          if (inverted === 0 || (inverted & (inverted - 1)) !== 0) {
            inverted = 1;
          } else {
            inverted = direction === 'Left' ? (inverted << 1) : (inverted >> 1);
            if (inverted > maxVal || inverted === 0) {
              inverted = direction === 'Left' ? 1 : 1 << (count - 1);
            }
          }
          currentInt = ~inverted & maxVal;
          activeIndices.forEach((lineIdx, i) => {
            next[lineIdx] = ((currentInt >> i) & 1) === 1;
          });
        }

        syncToStore(next);
        return next;
      });
    }, 400);

    return () => {
      if (autoPatternRef.current) {
        clearInterval(autoPatternRef.current);
        autoPatternRef.current = null;
      }
    };
  }, [isRunning, pattern, direction, isLineActive, syncToStore]);

  // Run handler
  const handleRun = () => {
    setIsRunning(true);
    syncToStore(bits);
    if (generationMode === '1 Shot') {
      // 1-shot takes single pulse then stops
      setTimeout(() => setIsRunning(false), 200);
    }
  };

  // Stop handler
  const handleStop = () => {
    setIsRunning(false);
  };

  // Calculate hex value of active lines
  const activeBitsValue = bits.reduce((acc, bit, idx) => {
    if (isLineActive(idx)) {
      return acc + (bit ? 1 << idx : 0);
    }
    return acc;
  }, 0);

  // In the NI screenshot: "x 0" format (hexadecimal)
  const hexDisplay = `x ${activeBitsValue.toString(16).toUpperCase()}`;

  // The lines in visual order from left to right: 7, 6, 5, 4, 3, 2, 1, 0
  const visualLines = [7, 6, 5, 4, 3, 2, 1, 0];

  return (
    <div className="elvis-instrument-container elvis-writer-theme">
      {/* ─── Top Black Header ─────────────────────────────────────────── */}
      <div className="elvis-header-black">
        <div className="elvis-header-top-row">
          <LabViewPoweredLogo />
          <div className="elvis-numeric-display">
            <span className="elvis-numeric-label">Numeric Value</span>
            <span className="elvis-numeric-value">{hexDisplay}</span>
          </div>
        </div>

        <div className="elvis-header-lines-row">
          <span className="elvis-linestates-label">Line<br />States</span>
          <div className="elvis-leds-group">
            {visualLines.map((lineIdx) => {
              const active = isLineActive(lineIdx);
              const isLit = active && bits[lineIdx];
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
            <label className="elvis-field-label">Lines to Write</label>
            <select
              className="elvis-select"
              value={linesToWrite}
              onChange={(e) => setLinesToWrite(e.target.value as LineRange)}
            >
              <option value="0 - 7">0 - 7</option>
              <option value="0 - 3">0 - 3</option>
              <option value="4 - 7">4 - 7</option>
            </select>
          </div>

          <div className="elvis-field-row">
            <label className="elvis-field-label">Pattern</label>
            <select
              className="elvis-select"
              value={pattern}
              onChange={(e) => setPattern(e.target.value as PatternMode)}
            >
              <option value="Manual">Manual</option>
              <option value="Count Up">Count Up</option>
              <option value="Count Down">Count Down</option>
              <option value="Walking 1s">Walking 1s</option>
              <option value="Walking 0s">Walking 0s</option>
            </select>
          </div>

          {/* Manual Pattern Switches Bay */}
          <div className="elvis-pattern-section">
            <div className="elvis-pattern-header">
              <span className="elvis-pattern-title">Manual Pattern</span>
              <div className="elvis-pattern-hex-box">{hexDisplay}</div>
            </div>

            <div className="elvis-switches-bay">
              <div className="elvis-switches-inner">
                <div className="elvis-switches-aligned-grid">
                  {/* Left prefix label aligned with numbers */}
                  <div className="elvis-prefix-column">
                    <span className="elvis-lines-prefix">Lines:</span>
                  </div>

                  {/* 8 Switch-and-Number Columns: 7 down to 0 */}
                  {visualLines.map((lineIdx) => {
                    const active = isLineActive(lineIdx);
                    const isHigh = bits[lineIdx];
                    return (
                      <div key={lineIdx} className="elvis-switch-unit-col">
                        <div
                          className={`elvis-toggle-cell ${!active ? 'disabled' : ''}`}
                          onClick={() => handleToggleSwitch(lineIdx)}
                          title={`Line ${lineIdx}: ${isHigh ? 'HI (1)' : 'LO (0)'} - Click to toggle`}
                        >
                          <div className="elvis-switch-track">
                            <div className={`elvis-switch-thumb ${isHigh ? 'pos-hi' : 'pos-lo'}`} />
                          </div>
                        </div>
                        <span className={`elvis-switch-col-label ${!active ? 'dimmed' : ''}`}>
                          {lineIdx}
                        </span>
                      </div>
                    );
                  })}

                  {/* Right HI/LO legend column */}
                  <div className="elvis-hi-lo-column">
                    <span className="elvis-hi-label">HI</span>
                    <span className="elvis-lo-label">LO</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Action Row: Toggle, Rotate, Shift, Direction */}
            <div className="elvis-action-row">
              <div className="elvis-action-btn-group">
                <span className="elvis-action-label">Action</span>
                <div className="elvis-action-buttons">
                  <button
                    type="button"
                    className="elvis-action-btn"
                    onClick={handleActionToggle}
                    title="Invert current pattern"
                  >
                    Toggle
                  </button>
                  <button
                    type="button"
                    className="elvis-action-btn"
                    onClick={handleActionRotate}
                    title="Rotate pattern bits"
                  >
                    Rotate
                  </button>
                  <button
                    type="button"
                    className="elvis-action-btn"
                    onClick={handleActionShift}
                    title="Shift pattern bits"
                  >
                    Shift
                  </button>
                </div>
              </div>

              <div className="elvis-direction-group">
                <span className="elvis-action-label">Direction</span>
                <select
                  className="elvis-select compact"
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as ShiftDirection)}
                >
                  <option value="Left">Left</option>
                  <option value="Right">Right</option>
                </select>
              </div>
            </div>
          </div>
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
              <label className="elvis-field-label">Generation Mode</label>
              <select
                className="elvis-select"
                value={generationMode}
                onChange={(e) => setGenerationMode(e.target.value as GenerationMode)}
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
                title="Start generating pattern"
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
                title="Stop pattern output"
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
                title="Help on Digital Writer"
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
                <strong>Digital Writer — NI ELVISmx</strong>
                <button type="button" className="elvis-help-close" onClick={() => setShowHelp(false)}>
                  ✕
                </button>
              </div>
              <div className="elvis-help-body">
                <p>The <strong>Digital Writer</strong> writes static digital values or dynamic bit patterns to the digital I/O lines (DIO 0 through DIO 7) on the NI ELVIS II station or breadboard.</p>
                <ul>
                  <li><strong>Lines to Write:</strong> Choose between all lines (0 - 7), low nibble (0 - 3), or high nibble (4 - 7).</li>
                  <li><strong>Manual Pattern:</strong> Flip individual toggle switches to set logic High (1) or Low (0).</li>
                  <li><strong>Action buttons:</strong> Invert (Toggle), Rotate, or Shift bits in Left or Right direction.</li>
                  <li><strong>Generation Mode:</strong> Select continuous generation or single-shot output.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
