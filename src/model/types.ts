// ─── Core Identifiers ────────────────────────────────────────────────────────

export type ComponentId = string;
export type PinId = string;
export type WireId = string;
export type NodeId = string;
export type ContactId = string;

// ─── 2D Geometry ─────────────────────────────────────────────────────────────

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Breadboard ──────────────────────────────────────────────────────────────

export type RailType = 'power' | 'ground';
export type StripRow = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h' | 'i' | 'j';

export interface BreadboardContact {
  id: ContactId;
  col: number;          // 1–64 for terminal strip, 1–50 for rails, 1-20 for DAQ
  row: StripRow | RailType | 'daq';
  position: Point;      // Canvas position
  nodeGroup: string;    // Internal connectivity group (e.g., "col3-top" or "rail-power-1")
  occupied: boolean;
  componentId?: ComponentId;
  pinId?: PinId;
}

export interface BreadboardModel {
  contacts: Map<ContactId, BreadboardContact>;
  terminalCols: number;   // 64
  terminalRows: number;   // 10 (a–j)
  railCols: number;       // 50
  railRows: number;       // 4
  totalHoles: number;     // 840
}

// ─── Component Definitions ───────────────────────────────────────────────────

export type ComponentType = 'ic' | 'resistor' | 'capacitor' | 'dac' | 'led';

export type ICType = '74HC00' | '74HC02' | '74HC04' | '74HC08' | '74HC32' | '74HC86' | '74HC74' | '7400' | '7402' | '7404' | '7408' | '7432' | '7486' | '7474' | 'NE555';

export interface ICGateInfo {
  type: ICType;
  name: string;
  gateFunction: 'NAND' | 'NOR' | 'NOT' | 'AND' | 'OR' | 'XOR' | 'D-FF' | 'TIMER';
  pinCount: number;
  pinLabels: string[];
  gateCount: number;     // Number of gates in package (e.g., 4 for quad gates, 6 for hex inverter)
}

export const IC_LIBRARY: Record<ICType, ICGateInfo> = {
  '74HC00': {
    type: '74HC00',
    name: '74HC00 Quad NAND',
    gateFunction: 'NAND',
    pinCount: 14,
    pinLabels: ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'],
    gateCount: 4,
  },
  '74HC02': {
    type: '74HC02',
    name: '74HC02 Quad NOR',
    gateFunction: 'NOR',
    pinCount: 14,
    pinLabels: ['1Y', '1A', '1B', '2Y', '2A', '2B', 'GND', '3A', '3B', '3Y', '4A', '4B', '4Y', 'VCC'],
    gateCount: 4,
  },
  '74HC04': {
    type: '74HC04',
    name: '74HC04 Hex Inverter',
    gateFunction: 'NOT',
    pinCount: 14,
    pinLabels: ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC'],
    gateCount: 6,
  },
  '74HC08': {
    type: '74HC08',
    name: '74HC08 Quad AND',
    gateFunction: 'AND',
    pinCount: 14,
    pinLabels: ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'],
    gateCount: 4,
  },
  '74HC32': {
    type: '74HC32',
    name: '74HC32 Quad OR',
    gateFunction: 'OR',
    pinCount: 14,
    pinLabels: ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'],
    gateCount: 4,
  },
  'NE555': {
    type: 'NE555',
    name: 'NE555 Precision Timer',
    gateFunction: 'TIMER',
    pinCount: 8,
    pinLabels: ['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THRESH', 'DISCH', 'VCC'],
    gateCount: 1,
  },
  '74HC86': {
    type: '74HC86',
    name: '74HC86 Quad XOR',
    gateFunction: 'XOR',
    pinCount: 14,
    pinLabels: ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'],
    gateCount: 4,
  },
  '74HC74': {
    type: '74HC74',
    name: '74HC74 Dual D Flip-Flop',
    gateFunction: 'D-FF',
    pinCount: 14,
    pinLabels: ['/CLR1', 'D1', 'CLK1', '/PRE1', 'Q1', '/Q1', 'GND', '/Q2', 'Q2', '/PRE2', 'CLK2', 'D2', '/CLR2', 'VCC'],
    gateCount: 2,
  },
  '7400': {
    type: '7400',
    name: '7400 Quad NAND',
    gateFunction: 'NAND',
    pinCount: 14,
    pinLabels: ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'],
    gateCount: 4,
  },
  '7402': {
    type: '7402',
    name: '7402 Quad NOR',
    gateFunction: 'NOR',
    pinCount: 14,
    pinLabels: ['1Y', '1A', '1B', '2Y', '2A', '2B', 'GND', '3A', '3B', '3Y', '4A', '4B', '4Y', 'VCC'],
    gateCount: 4,
  },
  '7404': {
    type: '7404',
    name: '7404 Hex Inverter',
    gateFunction: 'NOT',
    pinCount: 14,
    pinLabels: ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC'],
    gateCount: 6,
  },
  '7408': {
    type: '7408',
    name: '7408 Quad AND',
    gateFunction: 'AND',
    pinCount: 14,
    pinLabels: ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'],
    gateCount: 4,
  },
  '7432': {
    type: '7432',
    name: '7432 Quad OR',
    gateFunction: 'OR',
    pinCount: 14,
    pinLabels: ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'],
    gateCount: 4,
  },
  '7486': {
    type: '7486',
    name: '7486 Quad XOR',
    gateFunction: 'XOR',
    pinCount: 14,
    pinLabels: ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'],
    gateCount: 4,
  },
  '7474': {
    type: '7474',
    name: '7474 Dual D Flip-Flop',
    gateFunction: 'D-FF',
    pinCount: 14,
    pinLabels: ['/CLR1', 'D1', 'CLK1', '/PRE1', 'Q1', '/Q1', 'GND', '/Q2', 'Q2', '/PRE2', 'CLK2', 'D2', '/CLR2', 'VCC'],
    gateCount: 2,
  },
};

// ─── Component Instances ─────────────────────────────────────────────────────

export interface ComponentPin {
  id: PinId;
  label: string;
  position: Point;      // Relative to component origin
  contactId?: ContactId; // Breadboard contact this pin occupies
  state?: LogicState;
}

export type LogicState = 0 | 1 | 'Z' | 'X'; // High, Low, High-Z, Unknown/Conflict

export interface ComponentBase {
  id: ComponentId;
  type: ComponentType;
  label?: string;
  position: Point;       // Canvas position (top-left)
  rotation: number;      // Degrees, multiples of 90
  pins: ComponentPin[];
  selected: boolean;
}

export interface ICComponent extends ComponentBase {
  type: 'ic';
  icType: ICType;
}

export interface ResistorComponent extends ComponentBase {
  type: 'resistor';
  resistance: number;    // Ohms
  unit: 'Ω' | 'kΩ' | 'MΩ';
  tolerance?: string;    // e.g. "5%"
  powerRating?: string;  // e.g. "1/4 W"
}

export interface CapacitorComponent extends ComponentBase {
  type: 'capacitor';
  capacitance: number;   // Base value
  unit: 'pF' | 'nF' | 'µF';
  tolerance?: string;    // e.g. "±10%"
  voltageRating?: string; // e.g. "50V"
  dielectric?: string;   // e.g. "Ceramic Dipped"
}

export interface DACComponent extends ComponentBase {
  type: 'dac';
  // DAC has exactly 3 pins: Vcc, Vo, Gnd
}

export type LEDColor = 'red' | 'green' | 'blue' | 'yellow' | 'orange' | 'white' | 'purple';

export interface LEDComponent extends ComponentBase {
  type: 'led';
  color: LEDColor;
  forwardVoltage?: number; // e.g. 1.8V, 2.1V, 3.2V
  maxCurrent?: number;     // Rated current in mA (e.g. 20mA)
  testGlow?: boolean;      // Manual test glow toggle from properties
  illuminated?: boolean;   // Active illumination flag
}

export type CircuitComponent = ICComponent | ResistorComponent | CapacitorComponent | DACComponent | LEDComponent;

// ─── Wires ───────────────────────────────────────────────────────────────────

export interface Wire {
  id: WireId;
  startContactId: ContactId;
  endContactId: ContactId;
  color: string;
  points: Point[];       // Intermediate routing points
  selected: boolean;
}

// ─── Electrical Nodes ────────────────────────────────────────────────────────

export interface ElectricalNode {
  id: NodeId;
  contactIds: Set<ContactId>;
  state: LogicState;
}

// ─── Instruments ─────────────────────────────────────────────────────────────

export type WaveformType = 'sine' | 'square' | 'triangle';

export interface OscillatorSettings {
  frequency: number;     // Hz
  amplitude: number;     // Volts peak
  enabled: boolean;
  outputContactId?: ContactId;
}

export interface FunctionGeneratorSettings {
  frequency: number;     // Hz
  amplitude: number;     // Volts peak
  waveform: WaveformType;
  dcOffset: number;      // Volts
  enabled: boolean;
  outputContactId?: ContactId;
}

export interface ClockSettings {
  frequency: number;     // Hz
  dutyCycle: number;     // 0–1
  running: boolean;
  outputContactId?: ContactId;
}

export interface VPSSettings {
  posVoltage: number;    // Volts (+0 to +15V)
  negVoltage: number;    // Volts (-0 to -15V)
  enabled: boolean;
}

export interface DAQSettings {
  enabled: boolean;
  dioBits: number[];
  dioDirection?: boolean[]; // true = output, false = input
  visible?: boolean;
}

export interface InstrumentState {
  oscillator: OscillatorSettings;
  functionGenerator: FunctionGeneratorSettings;
  clock: ClockSettings;
  daq?: DAQSettings;
  vps?: VPSSettings;
}

// ─── Editor State ────────────────────────────────────────────────────────────

export type EditorMode = 'select' | 'move' | 'wire' | 'place';
export type PlacingComponent =
  | ComponentType
  | ICType
  | 'led-red'
  | 'led-green'
  | 'led-blue'
  | 'led-yellow'
  | null;

export interface ViewTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
}

export interface EditorState {
  mode: EditorMode;
  placingComponent: PlacingComponent;
  selectedComponentId: ComponentId | null;
  selectedWireId: WireId | null;
  wireStart: ContactId | null;
  viewTransform: ViewTransform;
  showGrid: boolean;
  snapToGrid: boolean;
}

// ─── Simulation ──────────────────────────────────────────────────────────────

export type SimulationStatus = 'idle' | 'running' | 'paused' | 'error';

export interface SimulationState {
  status: SimulationStatus;
  tick: number;
  errors: string[];
  warnings: string[];
  nodes: Map<NodeId, ElectricalNode>;
}

// ─── Project ─────────────────────────────────────────────────────────────────

export interface WorkspaceTab {
  id: string;
  name: string;
  project: SerializedProject;
  notes?: string;
  createdAt: number;
}

export interface Project {
  version: number;
  name: string;
  components: Map<ComponentId, CircuitComponent>;
  wires: Map<WireId, Wire>;
  breadboard: BreadboardModel;
  instruments: InstrumentState;
  editor: EditorState;
  simulation: SimulationState;
  notes?: string;
  workspaces?: WorkspaceTab[];
  activeWorkspaceId?: string;
}

// ─── Undo / Redo ─────────────────────────────────────────────────────────────

export interface HistoryEntry {
  timestamp: number;
  description: string;
  snapshot: string; // Serialized project state
}

// ─── Serialization (for JSON export/import) ──────────────────────────────────

export interface SerializedProject {
  version: number;
  name: string;
  components: Array<CircuitComponent & { id: string }>;
  wires: Array<Wire & { id: string }>;
  instruments: InstrumentState;
  notes?: string;
}
