import React, { useState, useEffect } from 'react';
import { useStore } from '../store/CircuitStore';
import { ICType, IC_LIBRARY, ICComponent, ResistorComponent, CapacitorComponent, LEDComponent, LEDColor, DiodeComponent } from '../model/types';
import { DAQ_PIN_METADATA } from '../model/breadboard';
import { solveCircuitPhysics } from '../simulation/circuitPhysics';

interface PropertiesPanelProps {
  onToggle?: (open: boolean) => void;
}

// ─── Resistor Color Band Calculator Helper ────────────────────────────────────

interface ResistorBandColors {
  band1: string;
  band2: string;
  multiplier: string;
  tolerance: string;
  bandNames: string[];
}

const DIGIT_COLORS: Record<number, { hex: string; name: string }> = {
  0: { hex: '#000000', name: 'Black' },
  1: { hex: '#78350F', name: 'Brown' },
  2: { hex: '#DC2626', name: 'Red' },
  3: { hex: '#EA580C', name: 'Orange' },
  4: { hex: '#CA8A04', name: 'Yellow' },
  5: { hex: '#16A34A', name: 'Green' },
  6: { hex: '#2563EB', name: 'Blue' },
  7: { hex: '#9333EA', name: 'Violet' },
  8: { hex: '#4B5563', name: 'Gray' },
  9: { hex: '#FFFFFF', name: 'White' },
};

const TOLERANCE_COLORS: Record<string, { hex: string; name: string }> = {
  '1%': { hex: '#78350F', name: 'Brown' },
  '2%': { hex: '#DC2626', name: 'Red' },
  '5%': { hex: '#D4AF37', name: 'Gold' },
  '10%': { hex: '#94A3B8', name: 'Silver' },
  '20%': { hex: '#CBD5E1', name: 'None' },
};

function calculateResistorBands(rawOhms: number, tolerance = '5%'): ResistorBandColors {
  const ohms = Math.max(1, rawOhms);
  const str = ohms.toExponential();
  const [mantissaStr, expStr] = str.split('e');
  const exp = parseInt(expStr, 10);
  const mantissa = parseFloat(mantissaStr);

  const normalized = Math.round(mantissa * 10);
  const d1 = Math.floor(normalized / 10);
  const d2 = normalized % 10;
  const multExp = Math.max(0, exp - 1);

  const b1 = DIGIT_COLORS[d1] || DIGIT_COLORS[1];
  const b2 = DIGIT_COLORS[d2] || DIGIT_COLORS[0];
  const bm = DIGIT_COLORS[multExp % 10] || DIGIT_COLORS[2];
  const bt = TOLERANCE_COLORS[tolerance] || TOLERANCE_COLORS['5%'];

  return {
    band1: b1.hex,
    band2: b2.hex,
    multiplier: bm.hex,
    tolerance: bt.hex,
    bandNames: [b1.name, b2.name, bm.name, bt.name],
  };
}

// ─── Capacitor EIA 3-Digit Code Helper ────────────────────────────────────────

function calculateCapacitorEiaCode(val: number, unit: 'pF' | 'nF' | 'µF'): string {
  let picofarads = val;
  if (unit === 'nF') picofarads = val * 1000;
  else if (unit === 'µF') picofarads = val * 1000000;

  if (picofarads < 100) {
    return `${Math.round(picofarads)}p`;
  }
  const exp = Math.floor(Math.log10(picofarads));
  const mult = exp - 1;
  const sig = Math.round(picofarads / Math.pow(10, mult));
  return `${sig}${mult}`;
}

// ─── Human-Readable Contact Formatting for Connection Log ───────────────────

function formatContactLabel(id?: string): string {
  if (!id) return 'Unconnected';
  if (id.startsWith('daq-')) {
    const meta = DAQ_PIN_METADATA[id];
    return meta ? `DAQ ${meta.name}` : `DAQ ${id.replace('daq-', '').toUpperCase()}`;
  }
  if (id.startsWith('r-')) {
    const parts = id.split('-');
    const railIdx = parseInt(parts[1], 10);
    const col = parts[2];
    if (railIdx === 0) return `Top Rail +V (Col ${col})`;
    if (railIdx === 1) return `Top Rail GND (Col ${col})`;
    if (railIdx === 2) return `Bottom Rail +V (Col ${col})`;
    if (railIdx === 3) return `Bottom Rail GND (Col ${col})`;
    return `Rail ${railIdx} (Col ${col})`;
  }
  if (id.startsWith('t-')) {
    const parts = id.split('-');
    const row = parts[1]?.toUpperCase();
    const col = parts[2];
    return `Row ${row}, Col ${col}`;
  }
  return id;
}

export function PropertiesPanel({ onToggle }: PropertiesPanelProps) {
  const { state, dispatch } = useStore();
  const { editor, components } = state;
  const [activeTab, setActiveTab] = useState<'properties' | 'notes'>('properties');

  const selectedComp = editor.selectedComponentId
    ? components.get(editor.selectedComponentId)
    : null;

  // Selected IC info
  const isIC = selectedComp?.type === 'ic';
  const icComp = isIC ? (selectedComp as ICComponent) : null;
  const icType: ICType = icComp?.icType || '74HC08';
  const icInfo = IC_LIBRARY[icType] || IC_LIBRARY['74HC08'];
  const compLabel = selectedComp?.label || (isIC ? 'U1' : selectedComp?.id || 'Comp');

  // Selected Resistor info
  const isResistor = selectedComp?.type === 'resistor';
  const resistorComp = isResistor ? (selectedComp as ResistorComponent) : null;

  // Resistor local state (synced with selected component or standard default)
  const currentResistance = resistorComp?.resistance ?? 1;
  const currentResUnit = resistorComp?.unit ?? 'kΩ';
  const currentResTolerance = resistorComp?.tolerance ?? '5%';
  const currentResPower = resistorComp?.powerRating ?? '1/4 W';

  // Local input for typing resistor value manually
  const [resistorValInput, setResistorValInput] = useState<string>(String(currentResistance));

  useEffect(() => {
    setResistorValInput(String(currentResistance));
  }, [resistorComp?.id, currentResistance]);

  // Real-world circuit physics operating point
  const physics = React.useMemo(() => {
    return solveCircuitPhysics(state, performance.now() / 1000);
  }, [state]);

  // Compute raw ohms for color bands
  const rawOhms = currentResUnit === 'MΩ'
    ? currentResistance * 1000000
    : currentResUnit === 'kΩ'
    ? currentResistance * 1000
    : currentResistance;

  const resistorBands = calculateResistorBands(rawOhms, currentResTolerance);

  // Selected Capacitor info
  const isCapacitor = selectedComp?.type === 'capacitor';
  const capComp = isCapacitor ? (selectedComp as CapacitorComponent) : null;

  // Capacitor local state (synced with selected component or standard default)
  const currentCapacitance = capComp?.capacitance ?? 100;
  const currentCapUnit = capComp?.unit ?? 'nF';

  // Local input for typing capacitor value manually
  const [capValInput, setCapValInput] = useState<string>(String(currentCapacitance));

  useEffect(() => {
    setCapValInput(String(currentCapacitance));
  }, [capComp?.id, currentCapacitance]);

  const capacitorEiaCode = calculateCapacitorEiaCode(currentCapacitance, currentCapUnit);

  // Selected LED info
  const isLED = selectedComp?.type === 'led';
  const ledComp = isLED ? (selectedComp as LEDComponent) : null;
  const currentLEDColor: LEDColor = ledComp?.color ?? 'red';
  const currentLEDVf =
    ledComp?.forwardVoltage ??
    (currentLEDColor === 'red' ? 1.8 :
     currentLEDColor === 'green' ? 2.1 :
     currentLEDColor === 'blue' ? 3.2 :
     currentLEDColor === 'white' ? 3.3 :
     currentLEDColor === 'purple' ? 3.4 : 2.0);
  const currentLEDTestGlow = Boolean(ledComp?.testGlow);
  const currentLEDMaxCurrent = ledComp?.maxCurrent ?? 20;

  // Handler for LED changes
  const handleLEDChange = (updates: {
    color?: LEDColor;
    forwardVoltage?: number;
    testGlow?: boolean;
    maxCurrent?: number;
  }) => {
    if (ledComp) {
      dispatch({
        type: 'UPDATE_LED',
        id: ledComp.id,
        color: updates.color ?? ledComp.color,
        forwardVoltage: updates.forwardVoltage !== undefined ? updates.forwardVoltage : ledComp.forwardVoltage,
        testGlow: updates.testGlow !== undefined ? updates.testGlow : ledComp.testGlow,
        maxCurrent: updates.maxCurrent !== undefined ? updates.maxCurrent : ledComp.maxCurrent,
      });
    }
  };

  // Selected Diode info
  const isDiode = selectedComp?.type === 'diode';
  const diodeComp = isDiode ? (selectedComp as DiodeComponent) : null;
  const currentDiodeModel = diodeComp?.model ?? '1N4001';
  const currentDiodeVf = diodeComp?.forwardVoltage ?? 0.7;

  // Handler for Diode changes
  const handleDiodeChange = (updates: {
    model?: string;
    forwardVoltage?: number;
    reverseBreakdown?: number;
    maxCurrent?: number;
  }) => {
    if (diodeComp) {
      dispatch({
        type: 'UPDATE_DIODE',
        id: diodeComp.id,
        model: updates.model ?? diodeComp.model,
        forwardVoltage: updates.forwardVoltage !== undefined ? updates.forwardVoltage : diodeComp.forwardVoltage,
        reverseBreakdown: updates.reverseBreakdown !== undefined ? updates.reverseBreakdown : diodeComp.reverseBreakdown,
        maxCurrent: updates.maxCurrent !== undefined ? updates.maxCurrent : diodeComp.maxCurrent,
      });
    }
  };

  // Compile active connections for the dynamic Connection Log
  const wireEntries = Array.from(state.wires.values()).map((w, idx) => ({
    id: w.id,
    index: idx + 1,
    color: w.color,
    from: formatContactLabel(w.startContactId),
    to: formatContactLabel(w.endContactId),
  }));

  const componentPinEntries: Array<{
    id: string;
    compLabel: string;
    pinLabel: string;
    contactLabel: string;
  }> = [];

  for (const comp of components.values()) {
    const label = comp.label || (comp.type === 'ic' ? (comp as ICComponent).icType : comp.id);
    for (const pin of comp.pins) {
      if (pin.contactId) {
        componentPinEntries.push({
          id: `${comp.id}-${pin.id}`,
          compLabel: label,
          pinLabel: pin.label,
          contactLabel: formatContactLabel(pin.contactId),
        });
      }
    }
  }

  const totalConnections = wireEntries.length + componentPinEntries.length;

  // Handler for resistor changes
  const handleResistorChange = (updates: {
    resistance?: number;
    unit?: 'Ω' | 'kΩ' | 'MΩ';
    tolerance?: string;
    powerRating?: string;
  }) => {
    if (resistorComp) {
      dispatch({
        type: 'UPDATE_RESISTOR',
        id: resistorComp.id,
        resistance: updates.resistance ?? resistorComp.resistance,
        unit: updates.unit ?? resistorComp.unit,
        tolerance: updates.tolerance ?? resistorComp.tolerance,
        powerRating: updates.powerRating ?? resistorComp.powerRating,
      });
    }
  };

  // Handler for capacitor changes (only capacitance and unit are editable)
  const handleCapacitorChange = (updates: {
    capacitance?: number;
    unit?: 'pF' | 'nF' | 'µF';
  }) => {
    if (capComp) {
      dispatch({
        type: 'UPDATE_CAPACITOR',
        id: capComp.id,
        capacitance: updates.capacitance ?? capComp.capacitance,
        unit: updates.unit ?? capComp.unit,
      });
    }
  };

  return (
    <aside className="right-sidebar">
      {/* Sidebar Tabs */}
      <div className="sidebar-tabs">
        <button
          className={`sidebar-tab ${activeTab === 'properties' ? 'active' : ''}`}
          onClick={() => setActiveTab('properties')}
        >
          Properties
        </button>
        <button
          className={`sidebar-tab ${activeTab === 'notes' ? 'active' : ''}`}
          onClick={() => setActiveTab('notes')}
        >
          Notes
        </button>

        {onToggle && (
          <button
            className="sidebar-collapse-btn"
            onClick={() => onToggle(false)}
            title="Hide Properties Sidebar (])"
            aria-label="Hide Properties Sidebar"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}
      </div>

      <div className="sidebar-scrollable">
        {activeTab === 'notes' ? (
          <div className="notes-container">
            <textarea
              className="notes-textarea"
              value={state.notes ?? ''}
              onChange={(e) => dispatch({ type: 'SET_NOTES', notes: e.target.value })}
              placeholder="Add project notes, circuit equations, or pin connections..."
              rows={16}
            />
          </div>
        ) : (
          <div className="properties-container">
            {/* 1. Selected Component block */}
            <div className="prop-block">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <h3 className="prop-block-title" style={{ margin: 0 }}>Selected Component</h3>
                {selectedComp && (
                  <button
                    className="prop-header-delete-btn"
                    onClick={() => dispatch({ type: 'DELETE_COMPONENT', id: selectedComp.id })}
                    title={`Delete ${compLabel} (Del / Backspace)`}
                    aria-label={`Delete ${compLabel}`}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                    <span>Delete</span>
                  </button>
                )}
              </div>

              {/* Selected chip preview */}
              <div className="selected-preview-card">
                <div className="preview-chip-dip">
                  <div className="chip-notch" />
                  <span className="chip-label">{isIC ? icType : compLabel}</span>
                </div>
                <div className="preview-chip-meta">
                  <span className="preview-chip-name">
                    {isIC ? icType : isLED ? `${currentLEDColor.toUpperCase()} LED (${compLabel})` : selectedComp ? `${selectedComp.type.toUpperCase()} (${compLabel})` : 'No Selection'}
                  </span>
                  <span className="preview-chip-desc">
                    {isIC
                      ? (icType === '74HC08' ? 'AND Gate (Quad)' : icType === '74HC86' ? 'XOR Gate (Quad)' : icInfo.gateFunction)
                      : isResistor
                      ? `Resistor ${currentResistance} ${currentResUnit}`
                      : isCapacitor
                      ? `Capacitor ${currentCapacitance} ${currentCapUnit}`
                      : isLED
                      ? `${currentLEDColor.toUpperCase()} LED`
                      : isDiode
                      ? `Diode ${currentDiodeModel} (Vf=${currentDiodeVf}V)`
                      : selectedComp ? selectedComp.type : 'Select an element on breadboard'}
                  </span>
                </div>
              </div>

              {/* Form controls */}
              {isIC && (
                <div className="prop-field">
                  <label className="prop-field-label">IC Type</label>
                  <div className="select-wrapper">
                    <select
                      className="prop-select-field"
                      value={icType}
                      onChange={(e) => {
                        if (selectedComp && selectedComp.type === 'ic') {
                          dispatch({
                            type: 'UPDATE_IC_TYPE',
                            id: selectedComp.id,
                            icType: e.target.value as ICType,
                          });
                        }
                      }}
                    >
                      <option value="74HC08">74HC08 (Quad 2-Input AND)</option>
                      <option value="74HC00">74HC00 (Quad 2-Input NAND)</option>
                      <option value="74HC02">74HC02 (Quad 2-Input NOR)</option>
                      <option value="74HC04">74HC04 (Hex Inverter)</option>
                      <option value="74HC32">74HC32 (Quad 2-Input OR)</option>
                      <option value="74HC86">74HC86 (Quad 2-Input XOR)</option>
                      <option value="NE555">NE555 (Precision Timer - DIP-8)</option>
                      <option value="LM741">LM741 (Operational Amplifier - DIP-8)</option>
                    </select>
                    <svg className="select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>
              )}

              <div className="prop-field">
                <label className="prop-field-label">Label</label>
                <input
                  className="prop-input-field"
                  value={compLabel}
                  readOnly
                  placeholder="U1"
                />
              </div>

              <div className="prop-field">
                <label className="prop-field-label">Orientation</label>
                <div className="orientation-btn-group">
                  <button
                    className="orientation-btn active"
                    onClick={() => {
                      if (selectedComp) dispatch({ type: 'ROTATE_COMPONENT', id: selectedComp.id });
                    }}
                    title="Rotate Counter-Clockwise (R)"
                    aria-label="Rotate Counter-Clockwise"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                      <path d="M3 3v5h5" />
                    </svg>
                  </button>
                  <button
                    className="orientation-btn"
                    onClick={() => {
                      if (selectedComp) dispatch({ type: 'ROTATE_COMPONENT', id: selectedComp.id });
                    }}
                    title="Rotate Clockwise (R)"
                    aria-label="Rotate Clockwise"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                      <path d="M21 3v5h-5" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Move & Nudge Component */}
              <div className="prop-field">
                <label className="prop-field-label">Move Component</label>
                <div className="move-action-row">
                  <button
                    className={`move-tool-btn ${editor.mode === 'move' ? 'active' : ''}`}
                    onClick={() => dispatch({ type: 'SET_MODE', mode: editor.mode === 'move' ? 'select' : 'move' })}
                    title={editor.mode === 'move' ? 'Move Mode Active (Drag to reposition)' : 'Activate Move Tool (M)'}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="5 9 2 12 5 15" />
                      <polyline points="9 5 12 2 15 5" />
                      <polyline points="15 19 12 22 9 19" />
                      <polyline points="19 9 22 12 19 15" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <line x1="12" y1="2" x2="12" y2="22" />
                    </svg>
                    <span>{editor.mode === 'move' ? 'Move Active' : 'Drag to Move'}</span>
                  </button>

                  {/* Nudge Arrow Controls */}
                  <div className="nudge-cluster">
                    <button
                      className="nudge-btn"
                      onClick={() => {
                        if (selectedComp) {
                          dispatch({
                            type: 'MOVE_COMPONENT',
                            id: selectedComp.id,
                            position: { x: selectedComp.position.x, y: selectedComp.position.y - 14 },
                          });
                        }
                      }}
                      title="Nudge Up 1 row (14px)"
                    >
                      ▲
                    </button>
                    <div className="nudge-mid-row">
                      <button
                        className="nudge-btn"
                        onClick={() => {
                          if (selectedComp) {
                            dispatch({
                              type: 'MOVE_COMPONENT',
                              id: selectedComp.id,
                              position: { x: selectedComp.position.x - 14, y: selectedComp.position.y },
                            });
                          }
                        }}
                        title="Nudge Left 1 col (14px)"
                      >
                        ◀
                      </button>
                      <button
                        className="nudge-btn"
                        onClick={() => {
                          if (selectedComp) {
                            dispatch({
                              type: 'MOVE_COMPONENT',
                              id: selectedComp.id,
                              position: { x: selectedComp.position.x + 14, y: selectedComp.position.y },
                            });
                          }
                        }}
                        title="Nudge Right 1 col (14px)"
                      >
                        ▶
                      </button>
                    </div>
                    <button
                      className="nudge-btn"
                      onClick={() => {
                        if (selectedComp) {
                          dispatch({
                            type: 'MOVE_COMPONENT',
                            id: selectedComp.id,
                            position: { x: selectedComp.position.x, y: selectedComp.position.y + 14 },
                          });
                        }
                      }}
                      title="Nudge Down 1 row (14px)"
                    >
                      ▼
                    </button>
                  </div>
                </div>
              </div>

              {/* Delete Component Button */}
              {selectedComp && (
                <div className="prop-field" style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(226, 232, 240, 0.7)' }}>
                  <button
                    className="prop-delete-action-btn"
                    onClick={() => dispatch({ type: 'DELETE_COMPONENT', id: selectedComp.id })}
                    title={`Delete ${compLabel} from circuit (Del / Backspace)`}
                    aria-label={`Delete ${compLabel}`}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                    <span>Delete Component</span>
                  </button>
                </div>
              )}
            </div>

            {/* 2. DEDICATED RESISTOR SECTION - Only when a resistor is selected */}
            {isResistor && (
              <div className="prop-block active-component-block">
                <div className="prop-block-header-row">
                  <div className="prop-title-with-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 12h4l2.5-6 5 12 5-12 2.5 6h4" />
                    </svg>
                    <h3 className="prop-block-title">Resistors</h3>
                  </div>
                  <span className="prop-badge-active">
                    Selected ({resistorComp?.label || resistorComp?.id})
                  </span>
                </div>

                {/* Realistic Resistor Color Band Card */}
                <div className="resistor-preview-card">
                  <svg width="100%" height="48" viewBox="0 0 220 48" className="resistor-svg-preview">
                    {/* Lead wires */}
                    <line x1="10" y1="24" x2="52" y2="24" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />
                    <line x1="168" y1="24" x2="210" y2="24" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" />

                    {/* Resistor ceramic body */}
                    <rect x="52" y="10" width="116" height="28" rx="8" fill="#F4D5A6" stroke="#C59B63" strokeWidth="1.5" />
                    <path d="M 52 14 Q 58 10 70 10 L 150 10 Q 162 10 168 14" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="1.5" />

                    {/* 4-Band Color Bands */}
                    <rect x="74" y="10" width="7" height="28" fill={resistorBands.band1} />
                    <rect x="94" y="10" width="7" height="28" fill={resistorBands.band2} />
                    <rect x="114" y="10" width="7" height="28" fill={resistorBands.multiplier} />
                    <rect x="142" y="10" width="7" height="28" fill={resistorBands.tolerance} />
                  </svg>

                  {/* Color Bands Legend */}
                  <div className="resistor-band-legend">
                    <span className="resistor-band-chip" style={{ backgroundColor: resistorBands.band1 }}>{resistorBands.bandNames[0]}</span>
                    <span className="resistor-band-chip" style={{ backgroundColor: resistorBands.band2 }}>{resistorBands.bandNames[1]}</span>
                    <span className="resistor-band-chip" style={{ backgroundColor: resistorBands.multiplier }}>{resistorBands.bandNames[2]}</span>
                    <span className="resistor-band-chip tolerance" style={{ backgroundColor: resistorBands.tolerance }}>{resistorBands.bandNames[3]}</span>
                  </div>
                </div>

                {/* Resistance Value: Manual Typing with Unit Dropdown */}
                <div className="prop-field">
                  <label className="prop-field-label">Resistance Value</label>
                  <div className="prop-value-unit-row">
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      className="prop-input-field value-input"
                      value={resistorValInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setResistorValInput(val);
                        const num = parseFloat(val);
                        if (!isNaN(num) && num > 0) {
                          handleResistorChange({ resistance: num, unit: currentResUnit });
                        }
                      }}
                      placeholder="e.g. 10, 4.7"
                      aria-label="Resistance Value"
                    />
                    <div className="select-wrapper unit-select-wrapper">
                      <select
                        className="prop-select-field unit-select"
                        value={currentResUnit}
                        onChange={(e) => {
                          const unit = e.target.value as 'Ω' | 'kΩ' | 'MΩ';
                          handleResistorChange({ resistance: currentResistance, unit });
                        }}
                        aria-label="Resistance Unit"
                      >
                        <option value="Ω">Ω</option>
                        <option value="kΩ">kΩ</option>
                        <option value="MΩ">MΩ</option>
                      </select>
                      <svg className="select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </div>
                </div>

                {/* Tolerance Selector */}
                <div className="prop-field">
                  <label className="prop-field-label">Tolerance</label>
                  <div className="select-wrapper">
                    <select
                      className="prop-select-field"
                      value={currentResTolerance}
                      onChange={(e) => handleResistorChange({ tolerance: e.target.value })}
                    >
                      <option value="1%">1% (Brown - Precision Metal Film)</option>
                      <option value="2%">2% (Red)</option>
                      <option value="5%">5% (Gold - Standard Carbon Film)</option>
                      <option value="10%">10% (Silver)</option>
                      <option value="20%">20% (None)</option>
                    </select>
                    <svg className="select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>

                {/* Power Rating Selector */}
                <div className="prop-field">
                  <label className="prop-field-label">Power Rating</label>
                  <div className="select-wrapper">
                    <select
                      className="prop-select-field"
                      value={currentResPower}
                      onChange={(e) => handleResistorChange({ powerRating: e.target.value })}
                    >
                      <option value="1/8 W">1/8 W (0.125 W - Miniature)</option>
                      <option value="1/4 W">1/4 W (0.25 W - Standard Breadboard)</option>
                      <option value="1/2 W">1/2 W (0.5 W)</option>
                      <option value="1 W">1 W (Power)</option>
                      <option value="2 W">2 W (High Power)</option>
                    </select>
                    <svg className="select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>
              </div>
            )}

            {/* 3. DEDICATED CAPACITOR SECTION - Only when a capacitor is selected */}
            {isCapacitor && (
              <div className="prop-block active-component-block">
                <div className="prop-block-header-row">
                  <div className="prop-title-with-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0284C7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="3" y1="12" x2="9" y2="12" />
                      <line x1="9" y1="5" x2="9" y2="19" />
                      <line x1="15" y1="5" x2="15" y2="19" />
                      <line x1="15" y1="12" x2="21" y2="12" />
                    </svg>
                    <h3 className="prop-block-title">Capacitors</h3>
                  </div>
                  <span className="prop-badge-active cap">
                    Selected ({capComp?.label || capComp?.id})
                  </span>
                </div>

                {/* Realistic Capacitor Preview Card */}
                <div className="capacitor-preview-card">
                  <div className="capacitor-graphic-wrap">
                    <svg width="60" height="48" viewBox="0 0 60 48">
                      <line x1="22" y1="36" x2="22" y2="47" stroke="#94A3B8" strokeWidth="2.2" strokeLinecap="round" />
                      <line x1="38" y1="36" x2="38" y2="47" stroke="#94A3B8" strokeWidth="2.2" strokeLinecap="round" />
                      <path
                        d="M 20 36 Q 30 32 40 36 C 45 36 49 22 49 17 C 50 7 43 2 30 2 C 17 2 10 7 11 17 C 11 22 15 36 20 36 Z"
                        fill="url(#capGradProp)"
                        stroke="#0E3A70"
                        strokeWidth="1.2"
                      />
                      <path
                        d="M 23 5 C 19 7 16 11 16 18"
                        stroke="rgba(255, 255, 255, 0.85)"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        fill="none"
                      />
                      <circle cx="25" cy="5" r="1.6" fill="rgba(255, 255, 255, 0.85)" />
                      <defs>
                        <radialGradient id="capGradProp" cx="40%" cy="30%" r="60%">
                          <stop offset="0%" stopColor="#38BDF8" />
                          <stop offset="40%" stopColor="#1E6CB8" />
                          <stop offset="85%" stopColor="#0F4C8A" />
                          <stop offset="100%" stopColor="#082F58" />
                        </radialGradient>
                      </defs>
                    </svg>
                  </div>

                  <div className="capacitor-spec-badge">
                    <span className="cap-eia-code">{capacitorEiaCode}</span>
                    <span className="cap-spec-sub">{currentCapacitance} {currentCapUnit}</span>
                  </div>
                </div>

                {/* Capacitance Value: Manual Typing with Unit Dropdown */}
                <div className="prop-field">
                  <label className="prop-field-label">Capacitance Value</label>
                  <div className="prop-value-unit-row">
                    <input
                      type="number"
                      step="any"
                      min="0.001"
                      className="prop-input-field value-input"
                      value={capValInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCapValInput(val);
                        const num = parseFloat(val);
                        if (!isNaN(num) && num > 0) {
                          handleCapacitorChange({ capacitance: num, unit: currentCapUnit });
                        }
                      }}
                      placeholder="e.g. 100, 10, 0.1"
                      aria-label="Capacitance Value"
                    />
                    <div className="select-wrapper unit-select-wrapper">
                      <select
                        className="prop-select-field unit-select"
                        value={currentCapUnit}
                        onChange={(e) => {
                          const unit = e.target.value as 'pF' | 'nF' | 'µF';
                          handleCapacitorChange({ capacitance: currentCapacitance, unit });
                        }}
                        aria-label="Capacitance Unit"
                      >
                        <option value="pF">pF</option>
                        <option value="nF">nF</option>
                        <option value="µF">µF</option>
                      </select>
                      <svg className="select-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 4. DEDICATED LED SECTION - Only LED Color Option */}
            {isLED && (
              <div className="prop-block active-component-block">
                <div className="prop-block-header-row">
                  <div className="prop-title-with-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="6" />
                      <line x1="12" y1="2" x2="12" y2="6" />
                      <line x1="12" y1="18" x2="12" y2="22" />
                      <line x1="4.93" y1="4.93" x2="7.76" y2="7.76" />
                      <line x1="16.24" y1="16.24" x2="19.07" y2="19.07" />
                      <line x1="2" y1="12" x2="6" y2="12" />
                      <line x1="18" y1="12" x2="22" y2="12" />
                    </svg>
                    <h3 className="prop-block-title">LED Color</h3>
                  </div>
                  <span className="prop-badge-active led" style={{ textTransform: 'capitalize' }}>
                    {currentLEDColor}
                  </span>
                </div>

                {/* Color Selection Palette Swatches */}
                <div className="prop-field">
                  <label className="prop-field-label">Diode Color Selection</label>
                  <div className="led-color-swatches-grid">
                    {(['red', 'green', 'blue', 'yellow', 'orange', 'white', 'purple'] as LEDColor[]).map((c) => {
                      const colorRgbMap: Record<LEDColor, { mid: string; defaultVf: number }> = {
                        red:    { mid: '#EF4444', defaultVf: 1.8 },
                        green:  { mid: '#22C55E', defaultVf: 2.1 },
                        blue:   { mid: '#3B82F6', defaultVf: 3.2 },
                        yellow: { mid: '#EAB308', defaultVf: 2.0 },
                        orange: { mid: '#F97316', defaultVf: 2.0 },
                        white:  { mid: '#E2E8F0', defaultVf: 3.3 },
                        purple: { mid: '#C084FC', defaultVf: 3.4 },
                      };
                      const theme = colorRgbMap[c] || colorRgbMap.red;
                      const isSelected = currentLEDColor === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          className={`led-color-swatch-chip ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            handleLEDChange({
                              color: c,
                              forwardVoltage: theme.defaultVf,
                            });
                          }}
                          title={`${c.toUpperCase()} LED`}
                        >
                          <span className="swatch-color-dot" style={{ backgroundColor: theme.mid }} />
                          <span className="swatch-name">{c}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Color Dropdown Alternative */}
                <div className="prop-field">
                  <label className="prop-field-label">Color Preset Dropdown</label>
                  <div className="select-wrapper">
                    <select
                      className="prop-select-field"
                      value={currentLEDColor}
                      onChange={(e) => {
                        const color = e.target.value as LEDColor;
                        const defaultVfMap: Record<LEDColor, number> = {
                          red: 1.8, green: 2.1, blue: 3.2, yellow: 2.0, orange: 2.0, white: 3.3, purple: 3.4
                        };
                        handleLEDChange({ color, forwardVoltage: defaultVfMap[color] || 2.0 });
                      }}
                    >
                      <option value="red">Red</option>
                      <option value="green">Green</option>
                      <option value="blue">Blue</option>
                      <option value="yellow">Yellow</option>
                      <option value="orange">Orange</option>
                      <option value="white">White</option>
                      <option value="purple">Purple</option>
                    </select>
                    <svg className="select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>
              </div>
            )}

            {/* 5. DEDICATED DIODE SECTION - Only when a diode is selected */}
            {isDiode && (
              <div className="prop-block active-component-block">
                <div className="prop-block-header-row">
                  <div className="prop-title-with-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polygon points="6 4 18 12 6 20 6 4" fill="rgba(100, 116, 139, 0.25)" />
                      <line x1="18" y1="4" x2="18" y2="20" stroke="#64748B" strokeWidth="2.5" />
                      <line x1="2" y1="12" x2="6" y2="12" stroke="#64748B" strokeWidth="2" />
                      <line x1="18" y1="12" x2="22" y2="12" stroke="#64748B" strokeWidth="2" />
                    </svg>
                    <h3 className="prop-block-title">Diode (Rectifier)</h3>
                  </div>
                  <span className="prop-badge-active diode">
                    Selected ({diodeComp?.label || currentDiodeModel})
                  </span>
                </div>

                {/* Realistic Diode DO-41 Package Preview Card */}
                <div className="diode-preview-card" style={{ display: 'flex', alignItems: 'center', gap: '14px', background: '#0F172A', padding: '10px 14px', borderRadius: '8px', margin: '8px 0 12px' }}>
                  <svg width="68" height="26" viewBox="0 0 68 26">
                    {/* Anode Lead */}
                    <line x1="4" y1="13" x2="18" y2="13" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" />
                    {/* Diode body DO-41 */}
                    <rect x="18" y="5" width="32" height="16" rx="3.5" fill="#1E293B" stroke="#334155" strokeWidth="1" />
                    {/* Cathode silver band */}
                    <rect x="42" y="5" width="5" height="16" rx="0.5" fill="#E2E8F0" />
                    {/* Cathode Lead */}
                    <line x1="50" y1="13" x2="64" y2="13" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" />
                  </svg>
                  <div>
                    <div style={{ color: '#F8FAFC', fontWeight: 600, fontSize: '13px' }}>{currentDiodeModel}</div>
                    <div style={{ color: '#94A3B8', fontSize: '11px' }}>Vf ≈ {currentDiodeVf}V (Cathode at Silver Band)</div>
                  </div>
                </div>

                {/* Model Selector */}
                <div className="prop-field">
                  <label className="prop-field-label">Diode Model</label>
                  <div className="select-wrapper">
                    <select
                      className="prop-select-field"
                      value={currentDiodeModel}
                      onChange={(e) => {
                        const m = e.target.value;
                        const vfMap: Record<string, number> = {
                          '1N4001': 0.7,
                          '1N4007': 0.7,
                          '1N4148': 0.72,
                          '1N5819 (Schottky)': 0.35,
                        };
                        handleDiodeChange({ model: m, forwardVoltage: vfMap[m] || 0.7 });
                      }}
                    >
                      <option value="1N4001">1N4001 (50V 1A Silicon Rectifier)</option>
                      <option value="1N4007">1N4007 (1000V 1A Silicon Rectifier)</option>
                      <option value="1N4148">1N4148 (100V 300mA Fast Signal)</option>
                      <option value="1N5819 (Schottky)">1N5819 (40V 1A Schottky Low-Vf)</option>
                    </select>
                    <svg className="select-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </div>
                </div>

                {/* Forward Voltage */}
                <div className="prop-field">
                  <label className="prop-field-label">Forward Voltage (Vf)</label>
                  <div className="prop-value-unit-row">
                    <input
                      type="number"
                      step="0.05"
                      min="0.1"
                      max="3.0"
                      className="prop-input-field value-input"
                      value={currentDiodeVf}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val > 0) {
                          handleDiodeChange({ forwardVoltage: val });
                        }
                      }}
                    />
                    <span style={{ padding: '0 8px', color: '#64748B', fontSize: '13px', display: 'flex', alignItems: 'center' }}>V</span>
                  </div>
                </div>
              </div>
            )}



            <div className="prop-block connection-log-block">
              <div className="prop-block-header-row">
                <div className="prop-title-with-icon">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                  <h3 className="prop-block-title">Connection Log</h3>
                </div>
                <span className="prop-badge-active conn-count">
                  {totalConnections} {totalConnections === 1 ? 'Connection' : 'Connections'}
                </span>
              </div>

              {totalConnections === 0 ? (
                <div className="conn-log-empty">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                  </svg>
                  <span className="empty-title">No connections recorded</span>
                  <small className="empty-sub">Draw a wire (W) or place components on the breadboard</small>
                </div>
              ) : (
                <div className="conn-log-list">
                  {/* Active Wires */}
                  {wireEntries.map((w) => (
                    <div
                      key={w.id}
                      className={`conn-log-item wire-item ${editor.selectedWireId === w.id ? 'selected' : ''}`}
                      onClick={() => dispatch({ type: 'SELECT_WIRE', id: w.id })}
                      title="Click to select this wire"
                    >
                      <div className="conn-item-header">
                        <span className="conn-color-dot" style={{ backgroundColor: w.color }} />
                        <span className="conn-item-tag">Wire #{w.index}</span>
                        <button
                          className="conn-delete-wire-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            dispatch({ type: 'DELETE_WIRE', id: w.id });
                          }}
                          title="Delete Wire"
                          aria-label={`Delete Wire ${w.index}`}
                        >
                          ×
                        </button>
                      </div>
                      <div className="conn-route-text">
                        <span className="conn-endpoint from">{w.from}</span>
                        <span className="conn-arrow">➔</span>
                        <span className="conn-endpoint to">{w.to}</span>
                      </div>
                    </div>
                  ))}

                  {/* Component Pins */}
                  {componentPinEntries.map((p) => (
                    <div key={p.id} className="conn-log-item pin-item">
                      <div className="conn-item-header">
                        <span className="conn-pin-badge">{p.compLabel}</span>
                        <span className="conn-pin-label">Pin {p.pinLabel}</span>
                      </div>
                      <div className="conn-route-text">
                        <span className="conn-endpoint">Contact:</span>
                        <span className="conn-arrow">➔</span>
                        <span className="conn-endpoint to">{p.contactLabel}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
