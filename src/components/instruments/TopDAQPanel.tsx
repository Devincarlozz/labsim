import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/CircuitStore';
import { InstrumentType } from './InstrumentLauncherBar';
import { Wire } from '../../model/types';
import { DAQ_ROW1_PINS, DAQ_ROW2_PINS } from '../../model/breadboard';
import { useSimEngine } from '../../simulation/engine/useSimEngine';

export interface TopDAQPanelProps {
  onOpenInstrument?: (inst: InstrumentType) => void;
}

export interface DAQPinConfig {
  id: string;             // ContactId matching breadboard.ts, e.g. 'daq-p15v'
  name: string;           // Display label e.g. '+15V', 'AI0+', '5V'
  subLabel?: string;
  group: 'pwr' | 'ao' | 'ai' | 'dio' | 'gnd';
  type: string;
  defaultWireColor: string;
  description: string;
}

// ─── Dual-Row Configuration (Maximum Reduced Length: 10 columns × 2 rows) ─────
// Row 1: Analog & ±15V Power (10 terminals)
export const ROW1_TERMINALS: DAQPinConfig[] = [
  { id: 'daq-p15v', name: '+15V', group: 'pwr', type: 'Analog Power Output (+15V)', defaultWireColor: '#EF4444', description: '+15V Analog Power Supply (32mA max)' },
  { id: 'daq-n15v', name: '-15V', group: 'pwr', type: 'Analog Power Output (-15V)', defaultWireColor: '#8B5CF6', description: '-15V Analog Power Supply (32mA max)' },
  { id: 'daq-agnd1', name: 'AGND', group: 'gnd', type: 'Analog Ground', defaultWireColor: '#2563EB', description: 'Analog Ground Reference (0V)' },
  { id: 'daq-ao0', name: 'AO 0', subLabel: 'AO 0', group: 'ao', type: 'Analog Output 0', defaultWireColor: '#EAB308', description: 'Analog Output 0 — Driven by Function Generator' },
  { id: 'daq-ao1', name: 'AO 1', subLabel: 'AO 1', group: 'ao', type: 'Analog Output 1', defaultWireColor: '#F59E0B', description: 'Analog Output 1 — Auxiliary DC/Arbitrary Voltage' },
  { id: 'daq-agnd2', name: 'AGND', group: 'gnd', type: 'Analog Ground', defaultWireColor: '#2563EB', description: 'Analog Ground Reference (0V)' },
  { id: 'daq-ai0_p', name: 'AI0+', subLabel: 'AI 0+', group: 'ai', type: 'Analog Input 0 (+)', defaultWireColor: '#10B981', description: 'Analog Input 0+ (Feeds Scope CH 0 & DMM)' },
  { id: 'daq-ai0_m', name: 'AI0-', subLabel: 'AI 0-', group: 'ai', type: 'Analog Input 0 (-)', defaultWireColor: '#059669', description: 'Analog Input 0- (Differential GND)' },
  { id: 'daq-ai1_p', name: 'AI1+', subLabel: 'AI 1+', group: 'ai', type: 'Analog Input 1 (+)', defaultWireColor: '#06B6D4', description: 'Analog Input 1+ (Feeds Scope CH 1)' },
  { id: 'daq-ai1_m', name: 'AI1-', subLabel: 'AI 1-', group: 'ai', type: 'Analog Input 1 (-)', defaultWireColor: '#0891B2', description: 'Analog Input 1- (Differential GND)' },
];

// Row 2: Digital I/O & +5V Power (10 terminals)
export const ROW2_TERMINALS: DAQPinConfig[] = [
  { id: 'daq-dio0', name: 'DIO0', subLabel: 'DIO 0', group: 'dio', type: 'Digital I/O line 0', defaultWireColor: '#64748B', description: 'Digital I/O line 0 (0-5V LVTTL)' },
  { id: 'daq-dio1', name: 'DIO1', subLabel: 'DIO 1', group: 'dio', type: 'Digital I/O line 1', defaultWireColor: '#64748B', description: 'Digital I/O line 1 (0-5V LVTTL)' },
  { id: 'daq-dio2', name: 'DIO2', subLabel: 'DIO 2', group: 'dio', type: 'Digital I/O line 2', defaultWireColor: '#64748B', description: 'Digital I/O line 2 (0-5V LVTTL)' },
  { id: 'daq-dio3', name: 'DIO3', subLabel: 'DIO 3', group: 'dio', type: 'Digital I/O line 3', defaultWireColor: '#64748B', description: 'Digital I/O line 3 (0-5V LVTTL)' },
  { id: 'daq-dio4', name: 'DIO4', subLabel: 'DIO 4', group: 'dio', type: 'Digital I/O line 4', defaultWireColor: '#64748B', description: 'Digital I/O line 4 (0-5V LVTTL)' },
  { id: 'daq-dio5', name: 'DIO5', subLabel: 'DIO 5', group: 'dio', type: 'Digital I/O line 5', defaultWireColor: '#64748B', description: 'Digital I/O line 5 (0-5V LVTTL)' },
  { id: 'daq-dio6', name: 'DIO6', subLabel: 'DIO 6', group: 'dio', type: 'Digital I/O line 6', defaultWireColor: '#64748B', description: 'Digital I/O line 6 (0-5V LVTTL)' },
  { id: 'daq-dio7', name: 'DIO7', subLabel: 'DIO 7', group: 'dio', type: 'Digital I/O line 7', defaultWireColor: '#64748B', description: 'Digital I/O line 7 (0-5V LVTTL)' },
  { id: 'daq-dgnd', name: 'DGND', group: 'gnd', type: 'Digital Ground', defaultWireColor: '#1E293B', description: 'Digital Ground Reference (0V)' },
  { id: 'daq-v5v', name: '+5V', subLabel: '+5V', group: 'pwr', type: 'Digital Power (+5V)', defaultWireColor: '#EF4444', description: '+5V Digital Power Supply (100mA max)' },
];

export const TERMINAL_CONFIGS: DAQPinConfig[] = [...ROW1_TERMINALS, ...ROW2_TERMINALS];

export function TopDAQPanel() {
  const { state, dispatch } = useStore();
  const { snapshot } = useSimEngine();
  const { editor, wires } = state;

  // DAQ Hardware Activation "ON" state and DIO bit values from store
  const daqOn = state.instruments.daq?.enabled ?? true;
  const dioBits = state.instruments.daq?.dioBits ?? [1, 0, 1, 1, 0, 0, 1, 0];
  const dioDirections = state.instruments.daq?.dioDirection ?? [true, true, true, true, false, false, false, false];

  // Hovered terminal
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);

  // Synchronize DAQ power state globally
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('daq-power-change', {
        detail: {
          enabled: daqOn,
          dioBits,
        },
      })
    );
  }, [daqOn, dioBits]);

  // Toggle DAQ power ON/OFF
  const handleTogglePower = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextOn = !daqOn;
    dispatch({
      type: 'UPDATE_DAQ',
      settings: { enabled: nextOn },
    });
    if (nextOn) {
      dispatch({ type: 'RUN_SIMULATION' });
      window.dispatchEvent(new CustomEvent('daq-power-change', { detail: { enabled: true } }));
    } else {
      dispatch({ type: 'SET_SIMULATION_STATUS', status: 'paused' });
      window.dispatchEvent(new CustomEvent('daq-power-change', { detail: { enabled: false } }));
    }
  };

  // Find wires connected to a given DAQ terminal
  const getWiresForTerminal = (pinId: string): Wire[] => {
    const list: Wire[] = [];
    for (const w of wires.values()) {
      if (w.startContactId === pinId || w.endContactId === pinId) {
        list.push(w);
      }
    }
    return list;
  };

  // Handle clicking a terminal: Takes wire directly to breadboard!
  const handleTerminalClick = (pin: DAQPinConfig, e: React.MouseEvent) => {
    e.stopPropagation();

    // If currently routing a wire, finish wire to this DAQ pin
    if (editor.wireStart) {
      if (editor.wireStart !== pin.id) {
        dispatch({ type: 'FINISH_WIRE', contactId: pin.id });
      } else {
        dispatch({ type: 'CANCEL_WIRE' });
      }
      return;
    }

    // Otherwise start wire from this DAQ pin directly toward breadboard
    dispatch({ type: 'SET_MODE', mode: 'wire' });
    dispatch({ type: 'START_WIRE', contactId: pin.id });
  };

  // Toggle DIO bit
  const handleToggleDioBit = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!daqOn) return;
    const next = [...dioBits];
    next[idx] = next[idx] === 1 ? 0 : 1;
    dispatch({
      type: 'UPDATE_DAQ',
      settings: { dioBits: next },
    });
  };

  const renderTerminalCell = (pin: DAQPinConfig, terminalNumber: number) => {
    const isHovered = hoveredPinId === pin.id;
    const isWiringThis = editor.wireStart === pin.id;
    const connectedWires = getWiresForTerminal(pin.id);
    const isWired = connectedWires.length > 0;
    const wireColor = isWired ? connectedWires[0].color : pin.defaultWireColor;

    const otherEnd = isWired
      ? (connectedWires[0].startContactId === pin.id ? connectedWires[0].endContactId : connectedWires[0].startContactId)
      : null;
    const shortOtherEnd = otherEnd
      ? (otherEnd.startsWith('r-0-') ? 'Rail+...' : otherEnd.startsWith('r-1-') ? 'Rail−...' : otherEnd.replace('daq-', '').replace('t-', ''))
      : null;

    const isDio = pin.group === 'dio';
    const dioIndex = isDio ? parseInt(pin.name.replace('DIO', ''), 10) : -1;
    const isInput = isDio && dioIndex >= 0 && dioDirections[dioIndex] === false;

    let currentBit = 0;
    if (isDio && dioIndex >= 0) {
      if (isInput) {
        currentBit = snapshot.daq.di[dioIndex] === 1 ? 1 : 0;
      } else {
        currentBit = (snapshot.daq.do[dioIndex] === 1 || dioBits[dioIndex] === 1) ? 1 : 0;
      }
    }

    return (
      <div
        key={pin.id}
        className={`compact-pin-cell ${pin.group} ${isHovered ? 'hover' : ''} ${
          isWiringThis ? 'is-routing-wire' : ''
        } ${isWired ? 'is-connected' : ''}`}
        onMouseEnter={() => setHoveredPinId(pin.id)}
        onMouseLeave={() => setHoveredPinId(null)}
        onClick={(e) => handleTerminalClick(pin, e)}
        title={`${pin.type} (${pin.name})\n${
          isWired ? `Directly connected to: ${otherEnd}` : 'Click to route wire directly to breadboard'
        }\n${pin.description}`}
      >
        {/* Terminal Name */}
        <span className={`cell-pin-name ${pin.group}`}>{pin.name}</span>

        {/* Realistic Metallic Screw Head */}
        <div className="cell-screw">
          <span className="screw-h" />
          <span className="screw-v" />
        </div>

        {/* Square Clamp Socket */}
        <div
          className="cell-clamp"
          style={{
            borderColor: isWired ? wireColor : isWiringThis ? '#3B82F6' : undefined,
            boxShadow: isWired
              ? `0 0 5px ${wireColor}`
              : isWiringThis
              ? '0 0 7px #3B82F6'
              : undefined,
          }}
        >
          {isWired && (
            <span className="cell-wire-dot" style={{ background: wireColor }} />
          )}
        </div>

        {/* DIO bit toggle (0/1), connected target badge, or terminal number */}
        {isDio && dioIndex >= 0 ? (
          <button
            className={`cell-dio-toggle ${currentBit ? 'high' : 'low'} ${isInput ? 'is-input' : 'is-output'}`}
            onClick={(e) => {
              if (!isInput) {
                handleToggleDioBit(dioIndex, e);
              }
            }}
            title={
              isInput
                ? `DIO ${dioIndex} [INPUT]: ${currentBit ? 'HIGH (5V)' : 'LOW (0V)'}${isWired ? ` (Wired to ${shortOtherEnd})` : ' (Floating)'}`
                : `DIO ${dioIndex} [OUTPUT]: ${currentBit ? 'HIGH (5V)' : 'LOW (0V)'} - Click to toggle bit${isWired ? ` (Wired to ${shortOtherEnd})` : ''}`
            }
          >
            {currentBit}
          </button>
        ) : isWired && shortOtherEnd ? (
          <span className="cell-conn-target" title={`Connected to ${otherEnd}`}>
            {shortOtherEnd}
          </span>
        ) : (
          <span className="cell-pin-num">{terminalNumber}</span>
        )}
      </div>
    );
  };

  return (
    <div className="compact-daq-device horizontal-layout">
      {/* ─── Single Horizontal Row of 20 Terminals ───────────────────────── */}
      <div className={`horizontal-daq-terminals ${daqOn ? 'power-active' : 'power-standby'}`}>
        <div className="daq-row-labels">
          <div className="daq-labels-left">
            <span className="daq-brand-badge mini">NI myDAQ</span>
            <span className="daq-tag-analog">ANALOG & ±15V (1-10)</span>
          </div>

          {/* Small Sleek ON Button */}
          <button
            className={`compact-daq-power-btn mini ${daqOn ? 'is-on' : 'is-off'}`}
            onClick={handleTogglePower}
            title={daqOn ? 'myDAQ is ON (Click to turn OFF)' : 'myDAQ is OFF (Click to turn ON)'}
          >
            <span className={`daq-mini-led ${daqOn ? 'active' : ''}`} />
            <span className="power-btn-text">{daqOn ? 'ON' : 'OFF'}</span>
          </button>

          <div className="daq-labels-right">
            <span className="daq-tag-digital">DIGITAL I/O & +5V (11-20)</span>
          </div>
        </div>

        <div className="daq-horizontal-cells">
          {TERMINAL_CONFIGS.map((pin, idx) => renderTerminalCell(pin, idx + 1))}
        </div>
      </div>
    </div>
  );
}

// Named alias export as DAQComponent
export const DAQComponent = TopDAQPanel;
