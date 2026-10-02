import React, { createContext, useContext, useReducer, useCallback, useRef, useState, useEffect } from 'react';
import {
  BreadboardModel,
  BreadboardContact,
  Project,
  CircuitComponent,
  Wire,
  ComponentId,
  WireId,
  ContactId,
  EditorMode,
  PlacingComponent,
  ViewTransform,
  SimulationStatus,
  InstrumentState,
  ICComponent,
  ResistorComponent,
  CapacitorComponent,
  DACComponent,
  LEDComponent,
  LEDColor,
  ComponentPin,
  Point,
  ICType,
  IC_LIBRARY,
  LogicState,
  WaveformType,
  HistoryEntry,
  SerializedProject,
  WorkspaceTab,
} from '../model/types';
import {
  saveWebcontentToCookies,
  loadWebcontentFromCookies,
} from '../utils/cookieStorage';
import {
  createBreadboardModel,
  BOARD_PADDING,
  HOLE_SPACING,
  TERMINAL_COLS,
} from '../model/breadboard';
import { deriveElectricalNodes } from '../model/connectivity';
import { propagateLogic } from '../simulation/logic';
import { simEngine } from '../simulation/engine/SimEngine';
import { simRunner } from '../simulation/engine/SimRunner';
import { syncNetlistToEngine } from '../simulation/engine/netlistSync';

// ─── Helpers ─────────────────────────────────────────────────────────────────

let idCounter = 0;
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idCounter++}`;
}

const WIRE_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#34495e', '#d35400', '#27ae60',
];
let wireColorIndex = 0;
function nextWireColor(): string {
  const color = WIRE_COLORS[wireColorIndex % WIRE_COLORS.length];
  wireColorIndex++;
  return color;
}

// ─── IC Pin Positions ────────────────────────────────────────────────────────

function createICPins(icType: ICType): ComponentPin[] {
  const info = IC_LIBRARY[icType];
  const pins: ComponentPin[] = [];
  const pinSpacing = 14;
  const halfPins = info.pinCount / 2;

  // Standard DIP layout matching Image 2:
  // Pins 1 to halfPins are on the BOTTOM (left to right, cols 0 to halfPins-1, row f)
  // Pins halfPins+1 to pinCount are on the TOP (right to left, cols halfPins-1 down to 0, row e)
  for (let i = 0; i < info.pinCount; i++) {
    const isBottom = i < halfPins;
    const col = isBottom ? i : (info.pinCount - 1 - i);
    pins[i] = {
      id: genId('pin'),
      label: info.pinLabels[i],
      position: {
        x: col * pinSpacing,
        y: isBottom ? 28 : 0, // row f (+28px) vs row e (0px)
      },
    };
  }
  return pins;
}

function createResistorPins(): ComponentPin[] {
  return [
    { id: genId('pin'), label: '1', position: { x: 0, y: 0 } },
    { id: genId('pin'), label: '2', position: { x: 56, y: 0 } },
  ];
}

function createCapacitorPins(): ComponentPin[] {
  // Two horizontally adjacent pins 14px apart entering adjacent breadboard holes (matching Image 1)
  return [
    { id: genId('pin'), label: '1', position: { x: 0, y: 0 } },
    { id: genId('pin'), label: '2', position: { x: 14, y: 0 } },
  ];
}

function createLEDPins(): ComponentPin[] {
  // Anode (+) at x=0, Cathode (-) at x=14 entering adjacent breadboard holes
  return [
    { id: genId('pin'), label: 'Anode (+)', position: { x: 0, y: 0 } },
    { id: genId('pin'), label: 'Cathode (-)', position: { x: 14, y: 0 } },
  ];
}

function createDACPins(): ComponentPin[] {
  return [
    { id: genId('pin'), label: 'Vcc', position: { x: 0, y: 0 } },
    { id: genId('pin'), label: 'Vo', position: { x: 0, y: 14 } },
    { id: genId('pin'), label: 'Gnd', position: { x: 0, y: 28 } },
  ];
}

// ─── Snapping & Breadboard Binding Helper ────────────────────────────────────

export function snapComponentToBreadboard(
  comp: CircuitComponent,
  bb: BreadboardModel,
  _snapThreshold = 24,
): { snappedComp: CircuitComponent; newContacts: Map<ContactId, BreadboardContact> } {
  const newContacts = new Map(bb.contacts);

  // 1. Free any contacts previously assigned to this component
  for (const [id, c] of newContacts) {
    if (c.componentId === comp.id) {
      newContacts.set(id, {
        ...c,
        occupied: false,
        componentId: undefined,
        pinId: undefined,
      });
    }
  }

  const col1X = BOARD_PADDING + 20; // 60
  let anchorPos = { ...comp.position };
  const rot = ((Math.round(comp.rotation / 90) * 90 % 360) + 360) % 360;

  // 2. Intelligent anchor position calculation
  if (comp.type === 'ic') {
    // 14-pin DIP chip straddling the central DIP channel between Row E and Row F.
    // Row E is at y = 142. Pins 8-14 enter Row E, Pins 1-7 enter Row F (y = 170).
    const info = IC_LIBRARY[comp.icType] || { pinCount: 14 };
    const halfPins = info.pinCount / 2; // 7
    const colIndex = Math.round((comp.position.x - col1X) / HOLE_SPACING);
    const maxColIndex = TERMINAL_COLS - halfPins; // 64 - 7 = 57
    const clampedColIndex = Math.max(0, Math.min(maxColIndex, colIndex));

    anchorPos = {
      x: col1X + clampedColIndex * HOLE_SPACING,
      y: 142, // Row E
    };
  } else {
    // Find closest non-DAQ contact
    let closestC: BreadboardContact | null = null;
    let minD = Infinity;
    for (const c of newContacts.values()) {
      if (c.row === 'daq') continue;
      const d = Math.hypot(comp.position.x - c.position.x, comp.position.y - c.position.y);
      if (d < minD) {
        minD = d;
        closestC = c;
      }
    }

    if (closestC) {
      if (comp.type === 'resistor') {
        // Resistor spans 56px (4 breadboard columns / rows)
        if (rot === 0) {
          // Horizontal rightward: Pin 1 at col, Pin 2 at col + 4
          const clampedCol = Math.max(1, Math.min(60, closestC.col));
          anchorPos = {
            x: col1X + (clampedCol - 1) * HOLE_SPACING,
            y: closestC.position.y,
          };
        } else if (rot === 180) {
          // Horizontal leftward: Pin 1 at col, Pin 2 at col - 4
          const clampedCol = Math.max(5, Math.min(64, closestC.col));
          anchorPos = {
            x: col1X + (clampedCol - 1) * HOLE_SPACING,
            y: closestC.position.y,
          };
        } else if (rot === 90) {
          // Vertical downward: Pin 1 at y, Pin 2 at y + 56
          // Valid anchor rows: Row a (86), Row d (128), Row f (170)
          let targetY = 86; // Row a -> Row e (142)
          if (closestC.position.y >= 115 && closestC.position.y < 155) {
            targetY = 128; // Row d -> Row g (184)
          } else if (closestC.position.y >= 155) {
            targetY = 170; // Row f -> Row j (226)
          }
          anchorPos = {
            x: closestC.position.x,
            y: targetY,
          };
        } else if (rot === 270) {
          // Vertical upward: Pin 1 at y, Pin 2 at y - 56
          // Valid anchor rows: Row e (142), Row g (184), Row j (226)
          let targetY = 142; // Row e -> Row a (86)
          if (closestC.position.y >= 155 && closestC.position.y < 205) {
            targetY = 184; // Row g -> Row d (128)
          } else if (closestC.position.y >= 205) {
            targetY = 226; // Row j -> Row f (170)
          }
          anchorPos = {
            x: closestC.position.x,
            y: targetY,
          };
        } else {
          anchorPos = { x: closestC.position.x, y: closestC.position.y };
        }
      } else if (comp.type === 'capacitor' || comp.type === 'led') {
        // Capacitor / LED spans 14px (1 hole horizontally or vertically)
        if (rot === 0) {
          const clampedCol = Math.max(1, Math.min(63, closestC.col));
          anchorPos = {
            x: col1X + (clampedCol - 1) * HOLE_SPACING,
            y: closestC.position.y,
          };
        } else if (rot === 180) {
          const clampedCol = Math.max(2, Math.min(64, closestC.col));
          anchorPos = {
            x: col1X + (clampedCol - 1) * HOLE_SPACING,
            y: closestC.position.y,
          };
        } else if (rot === 90 && closestC.row === 'e') {
          anchorPos = { x: closestC.position.x, y: 128 }; // Row d so Pin 2 is at Row e
        } else if (rot === 270 && closestC.row === 'f') {
          anchorPos = { x: closestC.position.x, y: 184 }; // Row g so Pin 2 is at Row f
        } else {
          anchorPos = { x: closestC.position.x, y: closestC.position.y };
        }
      } else if (comp.type === 'dac') {
        // 3 pins vertically (28px span). Pins on rows [a,b,c], [b,c,d], [c,d,e], [f,g,h], [g,h,i], or [h,i,j]
        let targetY = closestC.position.y;
        if (closestC.position.y >= 125 && closestC.position.y <= 150) {
          targetY = 114; // Snap to Row c so pins land on c, d, e
        } else if (closestC.position.y >= 205) {
          targetY = 198; // Snap to Row h so pins land on h, i, j
        } else if (closestC.row === 'power' || closestC.row === 'ground') {
          targetY = closestC.position.y < 100 ? 114 : 170;
        }
        anchorPos = { x: closestC.position.x, y: targetY };
      } else {
        anchorPos = { x: closestC.position.x, y: closestC.position.y };
      }
    }
  }

  // 3. Update pin world positions and bind to matching contacts
  const rad = (comp.rotation * Math.PI) / 180;
  const cos = Math.round(Math.cos(rad));
  const sin = Math.round(Math.sin(rad));

  const updatedPins = comp.pins.map((pin) => {
    const wx = anchorPos.x + pin.position.x * cos - pin.position.y * sin;
    const wy = anchorPos.y + pin.position.x * sin + pin.position.y * cos;

    let closestContact: BreadboardContact | null = null;
    let closestDist = 10;
    for (const c of newContacts.values()) {
      if (c.row === 'daq') continue;
      const d = Math.hypot(wx - c.position.x, wy - c.position.y);
      if (d < closestDist) {
        closestDist = d;
        closestContact = c;
      }
    }

    if (closestContact) {
      newContacts.set(closestContact.id, {
        ...closestContact,
        occupied: true,
        componentId: comp.id,
        pinId: pin.id,
      });
      return { ...pin, contactId: closestContact.id };
    }

    return { ...pin, contactId: undefined };
  });

  return {
    snappedComp: { ...comp, position: anchorPos, pins: updatedPins },
    newContacts,
  };
}

// ─── Initial State ───────────────────────────────────────────────────────────

function createInitialState(): Project {
  const bb = createBreadboardModel();
  const components = new Map<ComponentId, CircuitComponent>();
  const wires = new Map<WireId, Wire>();

  // 1. 74HC08 (Horizontal black DIP chip straddling center channel from col 18 to 24)
  const ic08Id = 'ic-74hc08';
  const ic08Pins = createICPins('74HC08');
  const ic08Pos = { x: 298, y: 142 };
  components.set(ic08Id, {
    id: ic08Id,
    type: 'ic',
    icType: '74HC08',
    label: 'U1',
    position: ic08Pos,
    rotation: 0,
    pins: ic08Pins,
    selected: true,
  });

  // 2. 74HC04 (Horizontal black DIP chip straddling center channel from col 36 to 42)
  const ic04Id = 'ic-74hc04';
  const ic04Pins = createICPins('74HC04');
  const ic04Pos = { x: 550, y: 142 };
  components.set(ic04Id, {
    id: ic04Id,
    type: 'ic',
    icType: '74HC04',
    label: 'U2',
    position: ic04Pos,
    rotation: 0,
    pins: ic04Pins,
    selected: false,
  });

  // 3. Resistor (perfectly on Row B holes: Pin 1 at col 11, Pin 2 at col 15)
  const resId = 'res-1';
  const resPins = createResistorPins();
  const resPos = { x: 200, y: 100 };
  components.set(resId, {
    id: resId,
    type: 'resistor',
    label: 'R1',
    position: resPos,
    rotation: 0,
    resistance: 1,
    unit: 'kΩ',
    tolerance: '5%',
    pins: resPins,
    selected: false,
  } as ResistorComponent);

  // 4. Capacitor (blue dipped bulbous ceramic capacitor on Row C, columns 28 and 29)
  const capId = 'cap-1';
  const capPins = createCapacitorPins();
  const capPos = { x: 438, y: 114 };
  components.set(capId, {
    id: capId,
    type: 'capacitor',
    label: 'C1',
    position: capPos,
    rotation: 0,
    capacitance: 100,
    unit: 'nF',
    pins: capPins,
    selected: false,
  });

  // 5. DAC Header (black header on column 54, rows C, D, E)
  const dacId = 'dac-1';
  const dacPins = createDACPins();
  const dacPos = { x: 802, y: 114 };
  components.set(dacId, {
    id: dacId,
    type: 'dac',
    label: 'DAC1',
    position: dacPos,
    rotation: 0,
    pins: dacPins,
    selected: false,
  });

  // Connect all initial components to breadboard contacts
  let currentContacts = bb.contacts;
  for (const [id, comp] of components) {
    const { snappedComp, newContacts } = snapComponentToBreadboard(
      comp,
      { ...bb, contacts: currentContacts },
      15
    );
    components.set(id, snappedComp);
    currentContacts = newContacts;
  }
  bb.contacts = currentContacts;

  // Helper to add wire snapping to breadboard contacts
  const addWire = (id: string, startContactId: ContactId, endContactId: ContactId, color: string) => {
    const s = bb.contacts.get(startContactId);
    const e = bb.contacts.get(endContactId);
    if (!s || !e) return;
    s.occupied = true;
    e.occupied = true;
    wires.set(id, {
      id,
      startContactId,
      endContactId,
      color,
      points: [s.position, e.position],
      selected: false,
    });
  };

  // Pre-populated wires matching Section 4.2:
  // - Red wire from positive rail toward DAC Vcc pin
  addWire('wire-red-vcc', 'r-0-45', 't-c-54', '#EF4444');
  // - Yellow wire toward DAC Vo
  addWire('wire-yellow-vo', 't-d-54', 't-d-44', '#EAB308');
  // - Dark charcoal wire toward DAC Gnd
  addWire('wire-charcoal-gnd', 't-e-54', 'r-1-45', '#334155');
  // - Blue wire connecting lower board region
  addWire('wire-blue-lower', 't-h-20', 't-h-34', '#1677E8');
  // - Green wire crossing center toward right
  addWire('wire-green-center', 't-b-22', 't-g-38', '#10B981');
  // - Black/dark blue signal wires around IC pins
  addWire('wire-signal-1', 't-a-20', 't-c-20', '#1E293B');
  addWire('wire-signal-2', 't-f-21', 't-i-21', '#0F172A');

  return {
    version: 1,
    name: 'My Project',
    components,
    wires,
    breadboard: bb,
    instruments: {
      oscillator: {
        frequency: 1000,
        amplitude: 5.0,
        enabled: true,
      },
      functionGenerator: {
        frequency: 500,
        amplitude: 3.3,
        waveform: 'square',
        dcOffset: 0.0,
        enabled: false,
      },
      clock: {
        frequency: 1000,
        dutyCycle: 0.5,
        running: false,
      },
      daq: {
        enabled: false,
        dioBits: [1, 0, 1, 1, 0, 0, 1, 0],
        dioDirection: [true, true, true, true, false, false, false, false],
        visible: true,
      },
      vps: {
        posVoltage: 5.0,
        negVoltage: 0.0,
        enabled: true,
      },
    },
    editor: {
      mode: 'select',
      placingComponent: null,
      selectedComponentId: ic08Id,
      selectedWireId: null,
      wireStart: null,
      viewTransform: { offsetX: 0, offsetY: 0, scale: 1 },
      showGrid: true,
      snapToGrid: true,
    },
    simulation: {
      status: 'paused',
      tick: 1,
      errors: [],
      warnings: [],
      nodes: deriveElectricalNodes(bb, wires, components),
    },
  };
}

export function createAstableMultivibratorProject(): Project {
  const bb = createBreadboardModel();
  const components = new Map<ComponentId, CircuitComponent>();
  const wires = new Map<WireId, Wire>();

  // 1. NE555 Timer IC straddling center channel at col 22
  const ic555Id = 'ic-ne555';
  const ic555Pins = createICPins('NE555');
  const ic555Pos = { x: 354, y: 142 };
  components.set(ic555Id, {
    id: ic555Id,
    type: 'ic',
    icType: 'NE555',
    label: 'U1',
    position: ic555Pos,
    rotation: 0,
    pins: ic555Pins,
    selected: true,
  });

  // 2. Resistor R1 (1 kΩ): VCC to Pin 7 (DISCH)
  const res1Id = 'res-r1';
  const res1Pins = createResistorPins();
  const res1Pos = { x: 354, y: 100 };
  components.set(res1Id, {
    id: res1Id,
    type: 'resistor',
    label: 'R1',
    position: res1Pos,
    rotation: 0,
    resistance: 1,
    unit: 'kΩ',
    tolerance: '5%',
    pins: res1Pins,
    selected: false,
  } as ResistorComponent);

  // 3. Resistor R2 (10 kΩ): Pin 7 (DISCH) to Pin 6 (THRESH)
  const res2Id = 'res-r2';
  const res2Pins = createResistorPins();
  const res2Pos = { x: 382, y: 100 };
  components.set(res2Id, {
    id: res2Id,
    type: 'resistor',
    label: 'R2',
    position: res2Pos,
    rotation: 0,
    resistance: 10,
    unit: 'kΩ',
    tolerance: '5%',
    pins: res2Pins,
    selected: false,
  } as ResistorComponent);

  // 4. Timing Capacitor C1 (100 nF): Pin 2 (TRIG) to GND
  const capId = 'cap-c1';
  const capPins = createCapacitorPins();
  const capPos = { x: 368, y: 212 };
  components.set(capId, {
    id: capId,
    type: 'capacitor',
    label: 'C1',
    position: capPos,
    rotation: 0,
    capacitance: 100,
    unit: 'nF',
    pins: capPins,
    selected: false,
  });

  // Connect components to breadboard contacts
  let currentContacts = bb.contacts;
  for (const [id, comp] of components) {
    const { snappedComp, newContacts } = snapComponentToBreadboard(
      comp,
      { ...bb, contacts: currentContacts },
      15
    );
    components.set(id, snappedComp);
    currentContacts = newContacts;
  }
  bb.contacts = currentContacts;

  const addWire = (id: string, startContactId: ContactId, endContactId: ContactId, color: string) => {
    const s = bb.contacts.get(startContactId);
    const e = bb.contacts.get(endContactId);
    if (!s || !e) return;
    s.occupied = true;
    e.occupied = true;
    wires.set(id, {
      id,
      startContactId,
      endContactId,
      color,
      points: [s.position, e.position],
      selected: false,
    });
  };

  // DAQ Power: +5V to Rail+ and Pin 8 (VCC), Pin 4 (RESET)
  addWire('w-v5v-rail', 'daq-v5v', 'r-0-22', '#EF4444');
  addWire('w-rail-vcc', 'r-0-22', 't-e-22', '#EF4444');
  addWire('w-rail-reset', 'r-0-25', 't-f-25', '#EF4444');

  // DGND to Rail- and Pin 1 (GND)
  addWire('w-dgnd-rail', 'daq-dgnd', 'r-1-22', '#1E293B');
  addWire('w-rail-gnd', 'r-1-22', 't-f-22', '#1E293B');

  // Astable connections:
  addWire('w-r1-disch', 't-a-23', 't-e-23', '#F59E0B');
  addWire('w-thresh-trig', 't-e-24', 't-f-23', '#3B82F6');
  addWire('w-cap-gnd', 't-h-23', 'r-1-23', '#64748B');

  // Function Generator Clock Sync (AO0 to Pin 2 TRIG)
  addWire('w-fgen-trig', 'daq-ao0', 't-j-23', '#EAB308');

  // Oscilloscope CH0 (AI0+ to Pin 3 OUT of 555)
  addWire('w-scope-ch0', 'daq-ai0_p', 't-j-24', '#10B981');
  addWire('w-scope-ch0-gnd', 'daq-ai0_m', 'daq-agnd1', '#059669');

  // Oscilloscope CH1 (AI1+ to AO0 Clock reference)
  addWire('w-scope-ch1', 'daq-ai1_p', 'daq-ao0', '#06B6D4');
  addWire('w-scope-ch1-gnd', 'daq-ai1_m', 'daq-agnd2', '#0891B2');

  return {
    version: 1,
    name: 'Astable Multivibrator (555 Timer + Clock + Scope)',
    components,
    wires,
    breadboard: bb,
    notes: `# Astable Multivibrator Experiment (555 Timer + FGEN Clock + Oscilloscope)

## Circuit Overview
This circuit implements an Astable Multivibrator using the **NE555 Precision Timer**, synchronized with a **Function Generator clock signal (AO 0)** and measured in real-time on the **Oscilloscope (AI 0 & AI 1)**.

### Component Values:
- **Timer IC**: NE555 (U1)
- **R1**: 1.0 kΩ (VCC to Pin 7 DISCH)
- **R2**: 10.0 kΩ (Pin 7 DISCH to Pin 6 THRESH)
- **C1**: 100.0 nF (Pin 2/6 to Ground)
- **Calculated Free-Running Frequency**:
  $$f = \\frac{1.44}{(R_1 + 2R_2) \\times C_1} \\approx \\frac{1.44}{(1\\text{k} + 20\\text{k}) \\times 100\\text{n}} \\approx 685.7\\text{ Hz}$$
- **Duty Cycle**:
  $$D = \\frac{R_1 + R_2}{R_1 + 2R_2} \\approx \\frac{11}{21} \\approx 52.4\\%$$

### Instrument Routing:
- **Function Generator (AO 0)**: 1.000 kHz Clock Signal (Square Wave, 2.5V Amplitude, 2.5V DC Offset) -> Pin 2 (TRIG).
- **Oscilloscope CH 0 (AI 0+)**: Monitored on Pin 3 (OUT) — High-fidelity 0V to 4.75V square wave output!
- **Oscilloscope CH 1 (AI 1+)**: Monitored on AO 0 — Reference clock waveform for synchronization comparison.
- **Both Channels Referenced to AGND**: Differential inputs AI0- & AI1- tied cleanly to AGND to eliminate ground loop noise.`,
    instruments: {
      oscillator: { frequency: 1000, amplitude: 5.0, enabled: true },
      functionGenerator: {
        frequency: 1000,
        amplitude: 2.5,
        waveform: 'square',
        dcOffset: 2.5,
        enabled: true,
      },
      clock: { frequency: 1000, dutyCycle: 0.5, running: true },
      daq: {
        enabled: true,
        dioBits: [1, 0, 1, 1, 0, 0, 1, 0],
        dioDirection: [true, true, true, true, false, false, false, false],
        visible: true,
      },
      vps: { posVoltage: 5.0, negVoltage: 0.0, enabled: true },
    },
    editor: {
      mode: 'select',
      placingComponent: null,
      selectedComponentId: ic555Id,
      selectedWireId: null,
      wireStart: null,
      viewTransform: { offsetX: 0, offsetY: 0, scale: 1 },
      showGrid: true,
      snapToGrid: true,
    },
    simulation: {
      status: 'running',
      tick: 1,
      errors: [],
      warnings: [],
      nodes: deriveElectricalNodes(bb, wires, components),
    },
  };
}

export function createXORGateProject(): Project {
  const bb = createBreadboardModel();
  const components = new Map<ComponentId, CircuitComponent>();
  const wires = new Map<WireId, Wire>();

  // 1. 74HC86 Quad XOR IC straddling center channel at col 22
  const ic86Id = 'ic-74hc86';
  const ic86Pins = createICPins('74HC86');
  const ic86Pos = { x: 354, y: 142 };
  components.set(ic86Id, {
    id: ic86Id,
    type: 'ic',
    icType: '74HC86',
    label: 'U1',
    position: ic86Pos,
    rotation: 0,
    pins: ic86Pins,
    selected: true,
  });

  // Connect components to breadboard contacts
  let currentContacts = bb.contacts;
  for (const [id, comp] of components) {
    const { snappedComp, newContacts } = snapComponentToBreadboard(
      comp,
      { ...bb, contacts: currentContacts },
      15
    );
    components.set(id, snappedComp);
    currentContacts = newContacts;
  }
  bb.contacts = currentContacts;

  const addWire = (id: string, startContactId: ContactId, endContactId: ContactId, color: string) => {
    const s = bb.contacts.get(startContactId);
    const e = bb.contacts.get(endContactId);
    if (!s || !e) return;
    s.occupied = true;
    e.occupied = true;
    wires.set(id, {
      id,
      startContactId,
      endContactId,
      color,
      points: [s.position, e.position],
      selected: false,
    });
  };

  // VCC (+5V) to Pin 14 (t-e-22)
  addWire('w-vcc', 'daq-v5v', 't-e-22', '#EF4444');
  // GND to Pin 7 (t-f-28)
  addWire('w-gnd', 'daq-dgnd', 't-f-28', '#1E293B');

  // Input A (Pin 1, t-f-22) driven by Function Generator AO0 Clock
  addWire('w-in-a', 'daq-ao0', 't-f-22', '#EAB308');
  // Input B (Pin 2, t-f-23) driven by Digital Output DO0
  addWire('w-in-b', 'daq-dio0', 't-f-23', '#8B5CF6');
  // Output Y (Pin 3, t-f-24) to Oscilloscope CH0 AI0+
  addWire('w-out-y', 'daq-ai0_p', 't-f-24', '#10B981');
  addWire('w-scope-gnd', 'daq-ai0_m', 'daq-agnd1', '#059669');

  // Reference Clock to Oscilloscope CH1 AI1+
  addWire('w-ref-clk', 'daq-ai1_p', 'daq-ao0', '#06B6D4');
  addWire('w-ref-gnd', 'daq-ai1_m', 'daq-agnd2', '#0891B2');

  return {
    version: 1,
    name: 'XOR Gate Logic (74HC86 + FGEN Clock + Scope)',
    components,
    wires,
    breadboard: bb,
    notes: `# 74HC86 Quad 2-Input Exclusive-OR (XOR) Gate Circuit

## Circuit Overview
Demonstrates the **74HC86 Quad XOR Gate** responding to a dynamic clock signal from the **Function Generator (AO 0)** and static/toggle control from **DIO 0**, measured on the **Oscilloscope (AI 0 & AI 1)**.

### Truth Table (1Y = 1A ⊕ 1B):
| Input A (FGEN Clock) | Input B (DIO 0) | Output 1Y (Scope CH0) | Description |
| :---: | :---: | :---: | :--- |
| **0** | **0** | **0** | In-phase (Low) |
| **1** | **0** | **1** | Pass-through non-inverting buffer |
| **0** | **1** | **1** | Inverted High |
| **1** | **1** | **0** | Controlled Inverter (180° phase inversion) |

When **DIO 0 = 0**, the output strictly tracks the clock in-phase.
When **DIO 0 = 1**, the output acts as an inverter, reversing the phase of the clock!`,
    instruments: {
      oscillator: { frequency: 1000, amplitude: 5.0, enabled: true },
      functionGenerator: {
        frequency: 1000,
        amplitude: 2.5,
        waveform: 'square',
        dcOffset: 2.5,
        enabled: true,
      },
      clock: { frequency: 1000, dutyCycle: 0.5, running: true },
      daq: {
        enabled: true,
        dioBits: [0, 0, 0, 0, 0, 0, 0, 0],
        dioDirection: [true, true, true, true, false, false, false, false],
        visible: true,
      },
      vps: { posVoltage: 5.0, negVoltage: 0.0, enabled: true },
    },
    editor: {
      mode: 'select',
      placingComponent: null,
      selectedComponentId: ic86Id,
      selectedWireId: null,
      wireStart: null,
      viewTransform: { offsetX: 0, offsetY: 0, scale: 1 },
      showGrid: true,
      snapToGrid: true,
    },
    simulation: {
      status: 'running',
      tick: 1,
      errors: [],
      warnings: [],
      nodes: deriveElectricalNodes(bb, wires, components),
    },
  };
}

// ─── Actions ─────────────────────────────────────────────────────────────────

type Action =
  | { type: 'SET_MODE'; mode: EditorMode }
  | { type: 'SET_PLACING'; component: PlacingComponent }
  | { type: 'PLACE_COMPONENT'; componentType: PlacingComponent; position: Point; contactId?: ContactId }
  | { type: 'SELECT_COMPONENT'; id: ComponentId | null }
  | { type: 'SELECT_WIRE'; id: WireId | null }
  | { type: 'MOVE_COMPONENT'; id: ComponentId; position: Point; snap?: boolean }
  | { type: 'ROTATE_COMPONENT'; id: ComponentId }
  | { type: 'DELETE_COMPONENT'; id: ComponentId }
  | { type: 'DELETE_WIRE'; id: WireId }
  | { type: 'UPDATE_RESISTOR'; id: ComponentId; resistance: number; unit: 'Ω' | 'kΩ' | 'MΩ'; tolerance?: string; powerRating?: string }
  | { type: 'UPDATE_CAPACITOR'; id: ComponentId; capacitance: number; unit: 'pF' | 'nF' | 'µF'; tolerance?: string; voltageRating?: string; dielectric?: string }
  | { type: 'UPDATE_LED'; id: ComponentId; color?: LEDColor; forwardVoltage?: number; testGlow?: boolean; maxCurrent?: number; illuminated?: boolean }
  | { type: 'UPDATE_IC_TYPE'; id: ComponentId; icType: ICType }
  | { type: 'START_WIRE'; contactId: ContactId }
  | { type: 'FINISH_WIRE'; contactId: ContactId }
  | { type: 'CANCEL_WIRE' }
  | { type: 'SET_VIEW'; transform: ViewTransform }
  | { type: 'ZOOM'; delta: number; center: Point }
  | { type: 'PAN'; dx: number; dy: number }
  | { type: 'SET_SIMULATION_STATUS'; status: SimulationStatus }
  | { type: 'RUN_SIMULATION' }
  | { type: 'UPDATE_OSCILLATOR'; settings: Partial<InstrumentState['oscillator']> }
  | { type: 'UPDATE_FUNCTION_GEN'; settings: Partial<InstrumentState['functionGenerator']> }
  | { type: 'UPDATE_CLOCK'; settings: Partial<InstrumentState['clock']> }
  | { type: 'UPDATE_DAQ'; settings: Partial<NonNullable<InstrumentState['daq']>> }
  | { type: 'UPDATE_VPS'; settings: Partial<NonNullable<InstrumentState['vps']>> }
  | { type: 'TOGGLE_DAQ_VISIBILITY' }
  | { type: 'SET_PROJECT_NAME'; name: string }
  | { type: 'SET_NOTES'; notes: string }
  | { type: 'CLEAR_ALL' }
  | { type: 'LOAD_PROJECT'; project: SerializedProject }
  | { type: 'SNAP_COMPONENT_TO_CONTACT'; componentId: ComponentId; pinIndex: number; contactId: ContactId }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'DELETE_SELECTED' };

// ─── Reducer ─────────────────────────────────────────────────────────────────

function createComponent(componentType: PlacingComponent, position: Point): CircuitComponent | null {
  if (!componentType) return null;

  const icTypes: ICType[] = ['74HC00', '74HC02', '74HC04', '74HC08', '74HC32', '74HC86', '74HC74', '7400', '7402', '7404', '7408', '7432', '7486', '7474', 'NE555'];

  if (icTypes.includes(componentType as ICType)) {
    const icType = componentType as ICType;
    const comp: ICComponent = {
      id: genId('ic'),
      type: 'ic',
      icType,
      position,
      rotation: 0,
      pins: createICPins(icType),
      selected: false,
    };
    return comp;
  }

  switch (componentType) {
    case 'resistor': {
      const comp: ResistorComponent = {
        id: genId('res'),
        type: 'resistor',
        position,
        rotation: 0,
        resistance: 1000,
        unit: 'Ω',
        tolerance: '5%',
        powerRating: '1/4 W',
        pins: createResistorPins(),
        selected: false,
      };
      return comp;
    }
    case 'capacitor': {
      const comp: CapacitorComponent = {
        id: genId('cap'),
        type: 'capacitor',
        position,
        rotation: 0,
        capacitance: 100,
        unit: 'nF',
        tolerance: '±10%',
        voltageRating: '50V',
        dielectric: 'Ceramic Dipped',
        pins: createCapacitorPins(),
        selected: false,
      };
      return comp;
    }
    case 'dac': {
      const comp: DACComponent = {
        id: genId('dac'),
        type: 'dac',
        position,
        rotation: 0,
        pins: createDACPins(),
        selected: false,
      };
      return comp;
    }
    case 'led':
    case 'led-red':
    case 'led-green':
    case 'led-blue':
    case 'led-yellow': {
      let color: LEDColor = 'red';
      if (componentType === 'led-green') color = 'green';
      else if (componentType === 'led-blue') color = 'blue';
      else if (componentType === 'led-yellow') color = 'yellow';

      const vfTable: Record<LEDColor, number> = {
        red: 1.8,
        green: 2.1,
        blue: 3.2,
        yellow: 2.0,
        orange: 2.0,
        white: 3.3,
        purple: 3.4,
      };
      const defaultVf = vfTable[color] ?? 2.0;

      const comp: LEDComponent = {
        id: genId('led'),
        type: 'led',
        color,
        label: `${color.charAt(0).toUpperCase() + color.slice(1)} LED`,
        forwardVoltage: defaultVf,
        maxCurrent: 20,
        testGlow: false,
        position,
        rotation: 0,
        pins: createLEDPins(),
        selected: false,
      };
      return comp;
    }
    default:
      return null;
  }
}

function reducer(state: Project, action: Action): Project {
  switch (action.type) {
    case 'SET_MODE':
      return {
        ...state,
        editor: { ...state.editor, mode: action.mode, wireStart: null, placingComponent: null },
      };

    case 'SET_PLACING':
      return {
        ...state,
        editor: {
          ...state.editor,
          mode: 'place',
          placingComponent: action.component,
          selectedComponentId: null,
          selectedWireId: null,
        },
      };

    case 'PLACE_COMPONENT': {
      const comp = createComponent(action.componentType, action.position);
      if (!comp) return state;

      // Snap newly created component to breadboard and bind its pins to contacts
      const { snappedComp, newContacts } = snapComponentToBreadboard(
        comp,
        state.breadboard
      );

      const newComponents = new Map(state.components);
      for (const [id, c] of newComponents) {
        if (c.selected) newComponents.set(id, { ...c, selected: false });
      }
      snappedComp.selected = true;
      newComponents.set(snappedComp.id, snappedComp);

      const newBreadboard = { ...state.breadboard, contacts: newContacts };
      const nodes = deriveElectricalNodes(newBreadboard, state.wires, newComponents);
      propagateLogic(newComponents, nodes);

      return {
        ...state,
        components: newComponents,
        breadboard: newBreadboard,
        simulation: {
          ...state.simulation,
          nodes,
        },
        editor: {
          ...state.editor,
          mode: 'select',
          placingComponent: null,
          selectedComponentId: snappedComp.id,
          selectedWireId: null,
        },
      };
    }

    case 'SELECT_COMPONENT': {
      const newComponents = new Map(state.components);
      // Deselect all
      for (const [id, c] of newComponents) {
        if (c.selected) newComponents.set(id, { ...c, selected: false });
      }
      // Select target
      if (action.id) {
        const target = newComponents.get(action.id);
        if (target) newComponents.set(action.id, { ...target, selected: true });
      }
      // Deselect wires
      const newWires = new Map(state.wires);
      for (const [id, w] of newWires) {
        if (w.selected) newWires.set(id, { ...w, selected: false });
      }
      return {
        ...state,
        components: newComponents,
        wires: newWires,
        editor: { ...state.editor, selectedComponentId: action.id, selectedWireId: null },
      };
    }

    case 'SELECT_WIRE': {
      const newWires = new Map(state.wires);
      for (const [id, w] of newWires) {
        if (w.selected) newWires.set(id, { ...w, selected: false });
      }
      if (action.id) {
        const target = newWires.get(action.id);
        if (target) newWires.set(action.id, { ...target, selected: true });
      }
      const newComponents = new Map(state.components);
      for (const [id, c] of newComponents) {
        if (c.selected) newComponents.set(id, { ...c, selected: false });
      }
      return {
        ...state,
        wires: newWires,
        components: newComponents,
        editor: { ...state.editor, selectedWireId: action.id, selectedComponentId: null },
      };
    }

    case 'MOVE_COMPONENT': {
      const newComponents = new Map(state.components);
      const comp = newComponents.get(action.id);
      if (comp) {
        if (action.snap) {
          const { snappedComp, newContacts } = snapComponentToBreadboard(
            { ...comp, position: action.position },
            state.breadboard
          );
          newComponents.set(action.id, snappedComp);
          const newBreadboard = { ...state.breadboard, contacts: newContacts };
          const nodes = deriveElectricalNodes(newBreadboard, state.wires, newComponents);
          propagateLogic(newComponents, nodes);
          return {
            ...state,
            components: newComponents,
            breadboard: newBreadboard,
            simulation: { ...state.simulation, nodes },
          };
        } else {
          newComponents.set(action.id, { ...comp, position: action.position });
        }
      }
      return { ...state, components: newComponents };
    }

    case 'ROTATE_COMPONENT': {
      const newComponents = new Map(state.components);
      const comp = newComponents.get(action.id);
      if (comp) {
        const rotated = {
          ...comp,
          rotation: (comp.rotation + 90) % 360,
        };
        const { snappedComp, newContacts } = snapComponentToBreadboard(rotated, state.breadboard);
        newComponents.set(action.id, snappedComp);
        const newBreadboard = { ...state.breadboard, contacts: newContacts };
        const nodes = deriveElectricalNodes(newBreadboard, state.wires, newComponents);
        propagateLogic(newComponents, nodes);
        return {
          ...state,
          components: newComponents,
          breadboard: newBreadboard,
          simulation: { ...state.simulation, nodes },
        };
      }
      return { ...state, components: newComponents };
    }

    case 'DELETE_COMPONENT': {
      const newComponents = new Map(state.components);
      const comp = newComponents.get(action.id);
      if (comp) {
        // Free breadboard contacts
        const newBreadboard = { ...state.breadboard, contacts: new Map(state.breadboard.contacts) };
        for (const pin of comp.pins) {
          if (pin.contactId) {
            const contact = newBreadboard.contacts.get(pin.contactId);
            if (contact) {
              newBreadboard.contacts.set(pin.contactId, {
                ...contact,
                occupied: false,
                componentId: undefined,
                pinId: undefined,
              });
            }
          }
        }
        newComponents.delete(action.id);
        // Remove connected wires
        const newWires = new Map(state.wires);
        for (const [wireId, wire] of newWires) {
          const pinContactIds = comp.pins.map(p => p.contactId).filter(Boolean);
          if (pinContactIds.includes(wire.startContactId) || pinContactIds.includes(wire.endContactId)) {
            newWires.delete(wireId);
          }
        }
        const nodes = deriveElectricalNodes(newBreadboard, newWires, newComponents);
        propagateLogic(newComponents, nodes);
        return {
          ...state,
          components: newComponents,
          wires: newWires,
          breadboard: newBreadboard,
          simulation: { ...state.simulation, nodes },
          editor: {
            ...state.editor,
            selectedComponentId: state.editor.selectedComponentId === action.id ? null : state.editor.selectedComponentId,
          },
        };
      }
      return state;
    }

    case 'DELETE_WIRE': {
      const newWires = new Map(state.wires);
      newWires.delete(action.id);
      const newNodes = deriveElectricalNodes(state.breadboard, newWires, state.components);
      return {
        ...state,
        wires: newWires,
        simulation: {
          ...state.simulation,
          nodes: newNodes,
        },
        editor: {
          ...state.editor,
          selectedWireId: state.editor.selectedWireId === action.id ? null : state.editor.selectedWireId,
        },
      };
    }

    case 'DELETE_SELECTED': {
      if (state.editor.selectedComponentId) {
        return reducer(state, { type: 'DELETE_COMPONENT', id: state.editor.selectedComponentId });
      }
      if (state.editor.selectedWireId) {
        return reducer(state, { type: 'DELETE_WIRE', id: state.editor.selectedWireId });
      }
      return state;
    }

    case 'UPDATE_RESISTOR': {
      const newComponents = new Map(state.components);
      const comp = newComponents.get(action.id);
      if (comp && comp.type === 'resistor') {
        newComponents.set(action.id, {
          ...comp,
          resistance: action.resistance,
          unit: action.unit,
          tolerance: action.tolerance !== undefined ? action.tolerance : comp.tolerance,
          powerRating: action.powerRating !== undefined ? action.powerRating : comp.powerRating,
        } as ResistorComponent);
      }
      return { ...state, components: newComponents };
    }

    case 'UPDATE_CAPACITOR': {
      const newComponents = new Map(state.components);
      const comp = newComponents.get(action.id);
      if (comp && comp.type === 'capacitor') {
        newComponents.set(action.id, {
          ...comp,
          capacitance: action.capacitance,
          unit: action.unit,
          tolerance: action.tolerance !== undefined ? action.tolerance : comp.tolerance,
          voltageRating: action.voltageRating !== undefined ? action.voltageRating : comp.voltageRating,
          dielectric: action.dielectric !== undefined ? action.dielectric : comp.dielectric,
        } as CapacitorComponent);
      }
      return { ...state, components: newComponents };
    }

    case 'UPDATE_LED': {
      const newComponents = new Map(state.components);
      const comp = newComponents.get(action.id);
      if (comp && comp.type === 'led') {
        const nextColor = action.color ?? comp.color;
        newComponents.set(action.id, {
          ...comp,
          color: nextColor,
          label: `${nextColor.charAt(0).toUpperCase() + nextColor.slice(1)} LED`,
          forwardVoltage: action.forwardVoltage !== undefined ? action.forwardVoltage : comp.forwardVoltage,
          testGlow: action.testGlow !== undefined ? action.testGlow : comp.testGlow,
          maxCurrent: action.maxCurrent !== undefined ? action.maxCurrent : comp.maxCurrent,
          illuminated: action.illuminated !== undefined ? action.illuminated : comp.illuminated,
        } as LEDComponent);
      }
      return { ...state, components: newComponents };
    }

    case 'UPDATE_IC_TYPE': {
      const newComponents = new Map(state.components);
      const comp = newComponents.get(action.id);
      if (comp && comp.type === 'ic') {
        const updatedComp: ICComponent = {
          ...comp,
          icType: action.icType,
          pins: createICPins(action.icType),
        };
        const { snappedComp, newContacts } = snapComponentToBreadboard(
          updatedComp,
          state.breadboard
        );
        newComponents.set(action.id, snappedComp);
        const newBreadboard = { ...state.breadboard, contacts: newContacts };
        const nodes = deriveElectricalNodes(newBreadboard, state.wires, newComponents);
        propagateLogic(newComponents, nodes);
        return {
          ...state,
          components: newComponents,
          breadboard: newBreadboard,
          simulation: { ...state.simulation, nodes },
        };
      }
      return { ...state, components: newComponents };
    }

    case 'START_WIRE':
      return {
        ...state,
        editor: { ...state.editor, wireStart: action.contactId, mode: 'wire' },
      };

    case 'FINISH_WIRE': {
      const startId = state.editor.wireStart;
      if (!startId || startId === action.contactId) {
        return { ...state, editor: { ...state.editor, wireStart: null } };
      }
      // Check for duplicate wire
      for (const wire of state.wires.values()) {
        if (
          (wire.startContactId === startId && wire.endContactId === action.contactId) ||
          (wire.startContactId === action.contactId && wire.endContactId === startId)
        ) {
          return { ...state, editor: { ...state.editor, wireStart: null } };
        }
      }
      const startContact = state.breadboard.contacts.get(startId);
      const endContact = state.breadboard.contacts.get(action.contactId);
      const newWire: Wire = {
        id: genId('wire'),
        startContactId: startId,
        endContactId: action.contactId,
        color: nextWireColor(),
        points: startContact && endContact ? [startContact.position, endContact.position] : [],
        selected: false,
      };
      const newWires = new Map(state.wires);
      newWires.set(newWire.id, newWire);
      const newNodes = deriveElectricalNodes(state.breadboard, newWires, state.components);
      return {
        ...state,
        wires: newWires,
        simulation: {
          ...state.simulation,
          nodes: newNodes,
        },
        editor: { ...state.editor, wireStart: null },
      };
    }

    case 'CANCEL_WIRE':
      return { ...state, editor: { ...state.editor, wireStart: null } };

    case 'SET_VIEW':
      return { ...state, editor: { ...state.editor, viewTransform: action.transform } };

    case 'ZOOM': {
      const { scale, offsetX, offsetY } = state.editor.viewTransform;
      const newScale = Math.max(0.2, Math.min(4, scale + action.delta));
      const scaleChange = newScale / scale;
      const newOffsetX = action.center.x - (action.center.x - offsetX) * scaleChange;
      const newOffsetY = action.center.y - (action.center.y - offsetY) * scaleChange;
      return {
        ...state,
        editor: {
          ...state.editor,
          viewTransform: { offsetX: newOffsetX, offsetY: newOffsetY, scale: newScale },
        },
      };
    }

    case 'PAN':
      return {
        ...state,
        editor: {
          ...state.editor,
          viewTransform: {
            ...state.editor.viewTransform,
            offsetX: state.editor.viewTransform.offsetX + action.dx,
            offsetY: state.editor.viewTransform.offsetY + action.dy,
          },
        },
      };

    case 'SET_SIMULATION_STATUS':
      return {
        ...state,
        simulation: { ...state.simulation, status: action.status },
      };

    case 'RUN_SIMULATION': {
      const nodes = deriveElectricalNodes(state.breadboard, state.wires, state.components);
      const { stable, iterations } = propagateLogic(state.components, nodes);
      const warnings = !stable ? [`Logic did not stabilize after ${iterations} iterations`] : [];
      return {
        ...state,
        instruments: {
          ...state.instruments,
          daq: {
            enabled: true,
            dioBits: state.instruments.daq?.dioBits ?? [1, 0, 1, 1, 0, 0, 1, 0],
            dioDirection: state.instruments.daq?.dioDirection ?? [true, true, true, true, false, false, false, false],
            visible: state.instruments.daq?.visible ?? true,
          },
        },
        simulation: {
          ...state.simulation,
          status: 'running',
          tick: state.simulation.tick + 1,
          nodes,
          warnings,
          errors: [],
        },
      };
    }

    case 'UPDATE_OSCILLATOR':
      return {
        ...state,
        instruments: {
          ...state.instruments,
          oscillator: { ...state.instruments.oscillator, ...action.settings },
        },
      };

    case 'UPDATE_FUNCTION_GEN':
      return {
        ...state,
        instruments: {
          ...state.instruments,
          functionGenerator: { ...state.instruments.functionGenerator, ...action.settings },
        },
      };

    case 'UPDATE_CLOCK':
      return {
        ...state,
        instruments: {
          ...state.instruments,
          clock: { ...state.instruments.clock, ...action.settings },
        },
      };

    case 'UPDATE_DAQ': {
      let nextSim = state.simulation;
      if (action.settings.enabled === true) {
        const nodes = deriveElectricalNodes(state.breadboard, state.wires, state.components);
        const { stable, iterations } = propagateLogic(state.components, nodes);
        const warnings = !stable ? [`Logic did not stabilize after ${iterations} iterations`] : [];
        nextSim = {
          ...state.simulation,
          status: 'running',
          tick: state.simulation.tick + 1,
          nodes,
          warnings,
          errors: [],
        };
      } else if (action.settings.enabled === false) {
        nextSim = {
          ...state.simulation,
          status: 'paused',
        };
      } else if (state.simulation.status === 'running') {
        const nodes = deriveElectricalNodes(state.breadboard, state.wires, state.components);
        propagateLogic(state.components, nodes);
        nextSim = {
          ...state.simulation,
          nodes,
          tick: state.simulation.tick + 1,
        };
      }

      return {
        ...state,
        instruments: {
          ...state.instruments,
          daq: {
            enabled: state.instruments.daq?.enabled ?? true,
            dioBits: state.instruments.daq?.dioBits ?? [1, 0, 1, 1, 0, 0, 1, 0],
            dioDirection: state.instruments.daq?.dioDirection ?? [true, true, true, true, false, false, false, false],
            visible: state.instruments.daq?.visible ?? true,
            ...action.settings,
          },
        },
        simulation: nextSim,
      };
    }

    case 'UPDATE_VPS': {
      const curVPS = state.instruments.vps ?? { posVoltage: 5.0, negVoltage: 0.0, enabled: true };
      return {
        ...state,
        instruments: {
          ...state.instruments,
          vps: { ...curVPS, ...action.settings },
        },
      };
    }

    case 'TOGGLE_DAQ_VISIBILITY': {
      const currentVisible = state.instruments.daq?.visible ?? true;
      return {
        ...state,
        instruments: {
          ...state.instruments,
          daq: {
            enabled: state.instruments.daq?.enabled ?? true,
            dioBits: state.instruments.daq?.dioBits ?? [1, 0, 1, 1, 0, 0, 1, 0],
            visible: !currentVisible,
          },
        },
      };
    }

    case 'SET_PROJECT_NAME':
      return { ...state, name: action.name };

    case 'SET_NOTES':
      return { ...state, notes: action.notes };

    case 'CLEAR_ALL':
      return {
        ...createInitialState(),
        editor: {
          ...createInitialState().editor,
          viewTransform: state.editor.viewTransform,
        },
      };

    case 'SNAP_COMPONENT_TO_CONTACT': {
      const newComponents = new Map(state.components);
      const comp = newComponents.get(action.componentId);
      if (!comp) return state;
      const pin = comp.pins[action.pinIndex];
      if (!pin) return state;
      const newBreadboard = { ...state.breadboard, contacts: new Map(state.breadboard.contacts) };
      // Clear old contact
      if (pin.contactId) {
        const oldContact = newBreadboard.contacts.get(pin.contactId);
        if (oldContact) {
          newBreadboard.contacts.set(pin.contactId, {
            ...oldContact,
            occupied: false,
            componentId: undefined,
            pinId: undefined,
          });
        }
      }
      // Set new contact
      const contact = newBreadboard.contacts.get(action.contactId);
      if (contact) {
        newBreadboard.contacts.set(action.contactId, {
          ...contact,
          occupied: true,
          componentId: action.componentId,
          pinId: pin.id,
        });
      }
      const newPins = [...comp.pins];
      newPins[action.pinIndex] = { ...pin, contactId: action.contactId };
      newComponents.set(action.componentId, { ...comp, pins: newPins });
      const nodes = deriveElectricalNodes(newBreadboard, state.wires, newComponents);
      propagateLogic(newComponents, nodes);
      return {
        ...state,
        components: newComponents,
        breadboard: newBreadboard,
        simulation: { ...state.simulation, nodes },
      };
    }

    case 'LOAD_PROJECT': {
      const newState = createInitialState();
      newState.name = action.project.name || 'Workspace';
      newState.version = action.project.version || 1;
      newState.notes = action.project.notes ?? state.notes ?? '';
      newState.editor = {
        ...newState.editor,
        viewTransform: state.editor.viewTransform,
      };
      newState.components.clear();
      newState.wires.clear();

      // Clean breadboard without any pre-occupied contacts
      const bb = createBreadboardModel();
      let currentContacts = bb.contacts;
      for (const comp of action.project.components) {
        const { snappedComp, newContacts } = snapComponentToBreadboard(
          comp,
          { ...bb, contacts: currentContacts }
        );
        newState.components.set(comp.id, snappedComp);
        currentContacts = newContacts;
      }
      bb.contacts = currentContacts;
      newState.breadboard = bb;

      for (const wire of action.project.wires) {
        newState.wires.set(wire.id, wire);
        const s = currentContacts.get(wire.startContactId);
        const e = currentContacts.get(wire.endContactId);
        if (s) s.occupied = true;
        if (e) e.occupied = true;
      }
      newState.instruments = action.project.instruments || newState.instruments;
      const nodes = deriveElectricalNodes(newState.breadboard, newState.wires, newState.components);
      propagateLogic(newState.components, nodes);
      newState.simulation.nodes = nodes;
      return newState;
    }

    default:
      return state;
  }
}

// ─── Helpers for Workspace Serialization ──────────────────────────────────────

export function serializeProject(project: Project): SerializedProject {
  return {
    version: project.version,
    name: project.name,
    components: Array.from(project.components.values()).map(c => ({ ...c, id: c.id })),
    wires: Array.from(project.wires.values()).map(w => ({ ...w, id: w.id })),
    instruments: project.instruments,
    notes: project.notes,
  };
}

export function createEmptySerializedProject(name = 'Workspace'): SerializedProject {
  return {
    version: 1,
    name,
    components: [],
    wires: [],
    instruments: {
      oscillator: { frequency: 1000, amplitude: 5.0, enabled: true },
      functionGenerator: { frequency: 500, amplitude: 3.3, waveform: 'square', dcOffset: 0.0, enabled: false },
      clock: { frequency: 1000, dutyCycle: 0.5, running: false },
      daq: { enabled: false, dioBits: [1, 0, 1, 1, 0, 0, 1, 0], visible: true },
    },
    notes: `# ${name} Notes\n\nFresh circuit bench workspace ready for components and simulation.`,
  };
}

// ─── Context ─────────────────────────────────────────────────────────────────

export interface StoreContextValue {
  state: Project;
  dispatch: React.Dispatch<Action>;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  exportProject: () => SerializedProject;
  importProject: (data: SerializedProject) => void;
  // Multiple workspace management (Photoshop-like tabs)
  workspaces: WorkspaceTab[];
  activeWorkspaceId: string;
  addWorkspace: (name?: string, template?: 'empty' | 'default') => void;
  switchWorkspace: (workspaceId: string) => void;
  closeWorkspace: (workspaceId: string) => void;
  renameWorkspace: (workspaceId: string, newName: string) => void;
  duplicateWorkspace: (workspaceId: string) => void;
  saveToCookies: () => boolean;
  loadFromCookies: () => boolean;
  cookieLastSaved: number | null;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used within StoreProvider');
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function StoreProvider({ children }: { children: React.ReactNode }) {
  // Read saved cookie webcontent on initial boot
  const initialSaved = useRef(loadWebcontentFromCookies());

  const [state, dispatch] = useReducer(reducer, undefined, () => {
    const defaultState = createInitialState();
    defaultState.notes = '# Project Notes\n\nCircuit bench test setup with 74HC08 AND gate, 74HC04 Hex Inverter, and RC filter network.';
    const saved = initialSaved.current;
    if (saved && saved.workspaces && saved.workspaces.length > 0) {
      const activeTab = saved.workspaces.find(w => w.id === saved.activeWorkspaceId) || saved.workspaces[0];
      if (activeTab && activeTab.project) {
        const bb = createBreadboardModel();
        let currentContacts = bb.contacts;
        const comps = new Map<ComponentId, CircuitComponent>();
        for (const comp of activeTab.project.components) {
          const { snappedComp, newContacts } = snapComponentToBreadboard(
            comp,
            { ...bb, contacts: currentContacts }
          );
          comps.set(comp.id, snappedComp);
          currentContacts = newContacts;
        }
        bb.contacts = currentContacts;
        const wires = new Map<WireId, Wire>();
        for (const wire of activeTab.project.wires) {
          wires.set(wire.id, wire);
          const s = currentContacts.get(wire.startContactId);
          const e = currentContacts.get(wire.endContactId);
          if (s) s.occupied = true;
          if (e) e.occupied = true;
        }
        const nodes = deriveElectricalNodes(bb, wires, comps);
        propagateLogic(comps, nodes);
        return {
          ...defaultState,
          name: activeTab.name || defaultState.name,
          components: comps,
          wires,
          breadboard: bb,
          instruments: activeTab.project.instruments || defaultState.instruments,
          notes: activeTab.notes ?? defaultState.notes,
          simulation: { ...defaultState.simulation, nodes },
        };
      }
    }
    return defaultState;
  });

  // Multiple workspaces state (Photoshop tabs)
  const [workspaces, setWorkspaces] = useState<WorkspaceTab[]>(() => {
    const saved = initialSaved.current;
    if (saved && saved.workspaces && saved.workspaces.length > 0) {
      return saved.workspaces;
    }
    const initialProject = serializeProject(createInitialState());
    return [
      {
        id: 'workspace-1',
        name: 'Workspace 1',
        project: initialProject,
        notes: '# Project Notes\n\nCircuit bench test setup with 74HC08 AND gate, 74HC04 Hex Inverter, and RC filter network.',
        createdAt: Date.now(),
      },
    ];
  });

  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>(() => {
    const saved = initialSaved.current;
    if (saved && saved.activeWorkspaceId && saved.workspaces.some(w => w.id === saved.activeWorkspaceId)) {
      return saved.activeWorkspaceId;
    }
    return 'workspace-1';
  });

  const [cookieLastSaved, setCookieLastSaved] = useState<number | null>(() => {
    const saved = initialSaved.current;
    return saved ? saved.lastSaved : null;
  });

  // Undo / Redo history state
  const [history, setHistory] = useState<SerializedProject[]>(() => {
    const saved = initialSaved.current;
    if (saved && saved.workspaces && saved.workspaces.length > 0) {
      const activeTab = saved.workspaces.find(w => w.id === saved.activeWorkspaceId) || saved.workspaces[0];
      if (activeTab && activeTab.project) {
        return [activeTab.project];
      }
    }
    return [serializeProject(createInitialState())];
  });
  const [historyIndex, setHistoryIndex] = useState<number>(0);
  const isUndoingOrRedoing = useRef(false);
  const historyRef = useRef(history);
  historyRef.current = history;
  const historyIndexRef = useRef(historyIndex);
  historyIndexRef.current = historyIndex;

  const UNDOABLE_ACTIONS = useRef(new Set([
    'PLACE_COMPONENT',
    'DELETE_COMPONENT',
    'DELETE_SELECTED',
    'ROTATE_COMPONENT',
    'FINISH_WIRE',
    'DELETE_WIRE',
    'UPDATE_RESISTOR',
    'UPDATE_CAPACITOR',
    'UPDATE_IC_TYPE',
    'CLEAR_ALL',
  ])).current;

  // Wrap dispatch to capture undo snapshots
  const wrappedDispatch = useCallback((action: Action) => {
    if (!isUndoingOrRedoing.current) {
      const isMoveSnap = action.type === 'MOVE_COMPONENT' && action.snap;
      if (UNDOABLE_ACTIONS.has(action.type) || isMoveSnap) {
        const nextState = reducer(stateRef.current, action);
        const snapshot = serializeProject(nextState);

        const currentHist = historyRef.current.slice(0, historyIndexRef.current + 1);
        const updatedHist = [...currentHist, snapshot];
        if (updatedHist.length > 50) updatedHist.shift();

        setHistory(updatedHist);
        const nextIdx = updatedHist.length - 1;
        setHistoryIndex(nextIdx);
        historyIndexRef.current = nextIdx;
        historyRef.current = updatedHist;
      }
    }

    dispatch(action);
  }, [UNDOABLE_ACTIONS]);

  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      const targetIdx = historyIndexRef.current - 1;
      const targetProject = historyRef.current[targetIdx];
      if (targetProject) {
        historyIndexRef.current = targetIdx;
        setHistoryIndex(targetIdx);
        isUndoingOrRedoing.current = true;
        dispatch({ type: 'LOAD_PROJECT', project: targetProject });
        isUndoingOrRedoing.current = false;
      }
    }
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      const targetIdx = historyIndexRef.current + 1;
      const targetProject = historyRef.current[targetIdx];
      if (targetProject) {
        historyIndexRef.current = targetIdx;
        setHistoryIndex(targetIdx);
        isUndoingOrRedoing.current = true;
        dispatch({ type: 'LOAD_PROJECT', project: targetProject });
        isUndoingOrRedoing.current = false;
      }
    }
  }, []);

  const exportProject = useCallback((): SerializedProject => {
    return serializeProject(state);
  }, [state]);

  const importProject = useCallback((data: SerializedProject) => {
    dispatch({ type: 'LOAD_PROJECT', project: data });
  }, []);

  // Sync state.name changes to current workspace tab
  useEffect(() => {
    setWorkspaces((prev: WorkspaceTab[]) => prev.map((w: WorkspaceTab) => {
      if (w.id === activeWorkspaceId && w.name !== state.name) {
        return { ...w, name: state.name, project: { ...w.project, name: state.name } };
      }
      return w;
    }));
  }, [state.name, activeWorkspaceId]);

  // Sync state.notes changes to current workspace tab
  useEffect(() => {
    if (state.notes !== undefined) {
      setWorkspaces((prev: WorkspaceTab[]) => prev.map((w: WorkspaceTab) => {
        if (w.id === activeWorkspaceId && w.notes !== state.notes) {
          return { ...w, notes: state.notes, project: { ...w.project, notes: state.notes } };
        }
        return w;
      }));
    }
  }, [state.notes, activeWorkspaceId]);

  // Helper to snapshot active workspace into a workspaces array
  const snapshotActiveWorkspace = useCallback((currentWorkspaces: WorkspaceTab[], currentState: Project): WorkspaceTab[] => {
    return currentWorkspaces.map(ws => {
      if (ws.id === activeWorkspaceId) {
        return {
          ...ws,
          name: currentState.name,
          project: serializeProject(currentState),
          notes: currentState.notes ?? ws.notes,
        };
      }
      return ws;
    });
  }, [activeWorkspaceId]);

  // Save webcontent to cookies manually or programmatically
  const saveToCookies = useCallback((): boolean => {
    const updatedWorkspaces = snapshotActiveWorkspace(workspaces, state);
    const now = Date.now();
    const success = saveWebcontentToCookies({
      version: 1,
      activeWorkspaceId,
      workspaces: updatedWorkspaces,
      lastSaved: now,
      notes: state.notes,
    });
    if (success) {
      setCookieLastSaved(now);
    }
    return success;
  }, [snapshotActiveWorkspace, workspaces, state, activeWorkspaceId]);

  const loadFromCookies = useCallback((): boolean => {
    const saved = loadWebcontentFromCookies();
    if (saved && saved.workspaces && saved.workspaces.length > 0) {
      setWorkspaces(saved.workspaces);
      const activeTab = saved.workspaces.find(w => w.id === saved.activeWorkspaceId) || saved.workspaces[0];
      setActiveWorkspaceId(activeTab.id);
      dispatch({ type: 'LOAD_PROJECT', project: activeTab.project });
      if (activeTab.notes !== undefined) {
        dispatch({ type: 'SET_NOTES', notes: activeTab.notes });
      }
      setCookieLastSaved(saved.lastSaved);
      return true;
    }
    return false;
  }, []);

  // Synchronize circuit project to deterministic SimEngine and manage master clock
  useEffect(() => {
    syncNetlistToEngine(simEngine, state);
    const daqRunning = (state.instruments.daq?.enabled !== false) && (state.simulation.status === 'running');
    if (daqRunning) {
      simRunner.start();
    } else {
      simRunner.stop();
    }
  }, [
    state.wires,
    state.components,
    state.instruments.daq,
    state.instruments.functionGenerator,
    state.instruments.vps,
    state.simulation.status,
  ]);

  // Auto-save to cookies on debounced changes (500ms)
  const stateRef = useRef(state);
  stateRef.current = state;
  const workspacesRef = useRef(workspaces);
  workspacesRef.current = workspaces;
  const activeIdRef = useRef(activeWorkspaceId);
  activeIdRef.current = activeWorkspaceId;

  useEffect(() => {
    const timer = setTimeout(() => {
      const currentWs = snapshotActiveWorkspace(workspacesRef.current, stateRef.current);
      const now = Date.now();
      const ok = saveWebcontentToCookies({
        version: 1,
        activeWorkspaceId: activeIdRef.current,
        workspaces: currentWs,
        lastSaved: now,
        notes: stateRef.current.notes,
      });
      if (ok) {
        setCookieLastSaved(now);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [state, activeWorkspaceId, snapshotActiveWorkspace]);

  // Add new workspace tab (like on Photoshop)
  const addWorkspace = useCallback((name?: string, template: 'empty' | 'default' = 'empty') => {
    const currentWs = snapshotActiveWorkspace(workspacesRef.current, stateRef.current);
    const newId = `ws-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newName = name || `Workspace ${currentWs.length + 1}`;
    const newProject = template === 'default'
      ? serializeProject(createInitialState())
      : createEmptySerializedProject(newName);
    newProject.name = newName;

    const newTab: WorkspaceTab = {
      id: newId,
      name: newName,
      project: newProject,
      notes: newProject.notes || `# ${newName} Notes\n\nFresh circuit bench ready for components.`,
      createdAt: Date.now(),
    };

    const nextWorkspaces = [...currentWs, newTab];
    setWorkspaces(nextWorkspaces);
    setActiveWorkspaceId(newId);
    dispatch({ type: 'LOAD_PROJECT', project: newProject });
    if (newTab.notes) {
      dispatch({ type: 'SET_NOTES', notes: newTab.notes });
    }

    setTimeout(() => {
      const now = Date.now();
      saveWebcontentToCookies({
        version: 1,
        activeWorkspaceId: newId,
        workspaces: nextWorkspaces,
        lastSaved: now,
        notes: newTab.notes,
      });
      setCookieLastSaved(now);
    }, 50);
  }, [snapshotActiveWorkspace]);

  // Switch between workspace tabs (Photoshop style)
  const switchWorkspace = useCallback((targetId: string) => {
    if (targetId === activeIdRef.current) return;

    const currentWs = snapshotActiveWorkspace(workspacesRef.current, stateRef.current);
    const target = currentWs.find(w => w.id === targetId);
    if (!target) return;

    setWorkspaces(currentWs);
    setActiveWorkspaceId(targetId);
    dispatch({ type: 'LOAD_PROJECT', project: target.project });
    if (target.notes !== undefined) {
      dispatch({ type: 'SET_NOTES', notes: target.notes });
    }
    setHistory([target.project]);
    setHistoryIndex(0);
    historyRef.current = [target.project];
    historyIndexRef.current = 0;

    setTimeout(() => {
      const now = Date.now();
      saveWebcontentToCookies({
        version: 1,
        activeWorkspaceId: targetId,
        workspaces: currentWs,
        lastSaved: now,
        notes: target.notes,
      });
      setCookieLastSaved(now);
    }, 50);
  }, [snapshotActiveWorkspace]);

  // Close a workspace tab
  const closeWorkspace = useCallback((targetId: string) => {
    const currentWs = snapshotActiveWorkspace(workspacesRef.current, stateRef.current);
    if (currentWs.length <= 1) {
      // If only one remains, reset to a fresh blank workspace
      const freshName = 'Workspace 1';
      const freshProject = createEmptySerializedProject(freshName);
      const freshTab: WorkspaceTab = {
        id: `ws-${Date.now()}`,
        name: freshName,
        project: freshProject,
        notes: freshProject.notes,
        createdAt: Date.now(),
      };
      setWorkspaces([freshTab]);
      setActiveWorkspaceId(freshTab.id);
      dispatch({ type: 'LOAD_PROJECT', project: freshProject });
      setHistory([freshProject]);
      setHistoryIndex(0);
      historyRef.current = [freshProject];
      historyIndexRef.current = 0;
      return;
    }

    const targetIdx = currentWs.findIndex(w => w.id === targetId);
    if (targetIdx === -1) return;

    const remaining = currentWs.filter(w => w.id !== targetId);
    let nextActiveId = activeIdRef.current;

    if (targetId === activeIdRef.current) {
      const nextIdx = Math.max(0, targetIdx - 1);
      const nextTab = remaining[nextIdx] || remaining[0];
      nextActiveId = nextTab.id;
      dispatch({ type: 'LOAD_PROJECT', project: nextTab.project });
      if (nextTab.notes !== undefined) {
        dispatch({ type: 'SET_NOTES', notes: nextTab.notes });
      }
      setHistory([nextTab.project]);
      setHistoryIndex(0);
      historyRef.current = [nextTab.project];
      historyIndexRef.current = 0;
    }

    setWorkspaces(remaining);
    setActiveWorkspaceId(nextActiveId);

    setTimeout(() => {
      const now = Date.now();
      saveWebcontentToCookies({
        version: 1,
        activeWorkspaceId: nextActiveId,
        workspaces: remaining,
        lastSaved: now,
      });
      setCookieLastSaved(now);
    }, 50);
  }, [snapshotActiveWorkspace]);

  // Rename workspace
  const renameWorkspace = useCallback((targetId: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setWorkspaces((prev: WorkspaceTab[]) => prev.map((w: WorkspaceTab) => {
      if (w.id === targetId) {
        return { ...w, name: trimmed, project: { ...w.project, name: trimmed } };
      }
      return w;
    }));
    if (targetId === activeIdRef.current) {
      dispatch({ type: 'SET_PROJECT_NAME', name: trimmed });
    }
  }, []);

  // Duplicate workspace
  const duplicateWorkspace = useCallback((targetId: string) => {
    const currentWs = snapshotActiveWorkspace(workspacesRef.current, stateRef.current);
    const target = currentWs.find(w => w.id === targetId);
    if (!target) return;

    const newId = `ws-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const newName = `${target.name} (Copy)`;
    const newProject: SerializedProject = {
      ...JSON.parse(JSON.stringify(target.project)),
      name: newName,
    };

    const newTab: WorkspaceTab = {
      id: newId,
      name: newName,
      project: newProject,
      notes: target.notes,
      createdAt: Date.now(),
    };

    const nextWorkspaces = [...currentWs, newTab];
    setWorkspaces(nextWorkspaces);
    setActiveWorkspaceId(newId);
    dispatch({ type: 'LOAD_PROJECT', project: newProject });
    setHistory([newProject]);
    setHistoryIndex(0);
    historyRef.current = [newProject];
    historyIndexRef.current = 0;

    setTimeout(() => {
      const now = Date.now();
      saveWebcontentToCookies({
        version: 1,
        activeWorkspaceId: newId,
        workspaces: nextWorkspaces,
        lastSaved: now,
      });
      setCookieLastSaved(now);
    }, 50);
  }, [snapshotActiveWorkspace]);

  const value: StoreContextValue = {
    state,
    dispatch: wrappedDispatch,
    undo,
    redo,
    canUndo: historyIndex > 0,
    canRedo: historyIndex < history.length - 1,
    exportProject,
    importProject,
    workspaces,
    activeWorkspaceId,
    addWorkspace,
    switchWorkspace,
    closeWorkspace,
    renameWorkspace,
    duplicateWorkspace,
    saveToCookies,
    loadFromCookies,
    cookieLastSaved,
  };

  return React.createElement(StoreContext.Provider, { value }, children);
}
