/**
 * types.ts: Core Data Contracts for Deterministic Simulation Engine
 * Per plan (1).md Sections 5, 6, 7.
 *
 * Key upgrades from original:
 * - Level now includes 'X' (undefined / between thresholds / contention)
 * - Drive interface models what a pin does to a net (mode, volts, level)
 * - PinIO.read() returns { volts, level } instead of bare Level
 * - Net carries analog voltage (number | null) and derived logic level
 * - Logic family data structures (TTL 5V, LVCMOS 3.3V) with threshold constants
 * - NI-style Task interface with lifecycle states and resource reservation
 */

// ─── Level & Drive ──────────────────────────────────────────────────────────

/** X = undefined (between thresholds, or contention), Z = undriven/floating */
export type Level = 0 | 1 | 'X' | 'Z';

export type DriveMode = 'push-pull' | 'open-drain' | 'analog' | 'none';

/** What one pin is doing to a net */
export interface Drive {
  mode: DriveMode;
  volts: number;       // used when mode != 'none'
  level?: 0 | 1;      // digital drivers set this
}

// ─── Logic Families ─────────────────────────────────────────────────────────

export interface LogicFamily {
  name: string;
  vcc: number;           // Supply voltage (e.g. 5.0)
  vil: number;           // Max input voltage classified as LOW
  vih: number;           // Min input voltage classified as HIGH
  vol: number;           // Output LOW drive voltage
  voh: number;           // Output HIGH drive voltage
}

export const TTL_FAMILY: LogicFamily = {
  name: 'TTL',
  vcc: 5.0,
  vil: 0.8,
  vih: 2.0,
  vol: 0.4,
  voh: 3.4,
};

export const LVCMOS33_FAMILY: LogicFamily = {
  name: 'LVCMOS33',
  vcc: 3.3,
  vil: 0.8,
  vih: 2.0,
  vol: 0.4,
  voh: 3.3,
};

/**
 * Classify an analog voltage into a digital level using a logic family's thresholds.
 * Per plan (1).md Section 7.4:
 *   volts <= VIL → 0
 *   volts >= VIH → 1
 *   VIL < volts < VIH → 'X' (undefined, flagged in log)
 *   net floating (null) → 'Z'
 */
export function classifyVoltage(volts: number | null, family: LogicFamily): Level {
  if (volts === null) return 'Z';
  if (volts <= family.vil) return 0;
  if (volts >= family.vih) return 1;
  return 'X';
}

// ─── Pin, Net, PinIO ────────────────────────────────────────────────────────

export type PinDirection = 'in' | 'out' | 'inout' | 'power';

export interface Pin {
  id: string;          // Fully qualified, e.g. "daq.DO0", "U1.pin1"
  owner: string;       // Component ID or "daq"
  dir: PinDirection;
  drive: Drive;        // What this pin is actively doing to its net
}

export interface Net {
  id: string;
  pins: string[];      // Pin IDs connected to this net
  volts: number | null; // null = undriven (floating)
  level: Level;         // Derived from volts using logic family thresholds
  error?: 'contention';
}

/** Read result from PinIO — always returns both voltage and classified level */
export interface PinReadResult {
  volts: number | null;
  level: Level;
}

/** Components interact with nets exclusively through PinIO */
export interface PinIO {
  read(pinId: string): PinReadResult;
  drive(pinId: string, d: Drive): void;
}

// ─── Component ──────────────────────────────────────────────────────────────

export interface SimComponent {
  id: string;
  name: string;
  pins: Pin[];
  reset(): void;
  step(dt: number, io: PinIO): void;
}

// ─── DAQ State ──────────────────────────────────────────────────────────────

export type DaqState = 'OFF' | 'CONNECTING' | 'READY' | 'RUNNING';

// ─── NI-Style Task Model (plan (1).md Section 6.3) ─────────────────────────

export type TaskKind = 'AI' | 'AO' | 'DI' | 'DO' | 'CI';
export type TaskState = 'unreserved' | 'committed' | 'running' | 'done';
export type TimingMode = 'on-demand' | 'finite' | 'continuous';

export interface TaskTiming {
  mode: TimingMode;
  sampleClock: 'internal' | { pin: string };
  rate: number;                // samples/s per channel
  samplesPerChannel: number;
}

export interface TaskTrigger {
  type: 'none' | 'analog-edge' | 'digital-edge';
  source?: string;
  level?: number;
  slope?: 'rising' | 'falling';
  preSamples?: number;
}

export interface Task {
  id: string;
  kind: TaskKind;
  channels: string[];
  timing: TaskTiming;
  trigger: TaskTrigger;
  buffer: Float64Array | Uint32Array;
  state: TaskState;
  /** For change-detection DI: stored transitions with timestamps */
  changeLog?: Array<{ time: number; value: number }>;
  /** Internal: buffer write position */
  bufferIndex: number;
  /** Internal: accumulated time since last sample */
  sampleAccum: number;
  /** Internal: previous DI values for change detection */
  prevValues?: number[];
}

// ─── DAQ Buffers (legacy compat + extended) ─────────────────────────────────

export interface DaqBuffers {
  di: Level[];              // DI0..DI7 sampled levels
  do: Level[];              // DO0..DO7 driven levels
  ai0: number[];            // AI0 circular sample buffer (V)
  ai1: number[];            // AI1 circular sample buffer (V)
  ao0: number;              // Current AO0 voltage
  ao0_buffer?: number[];    // AO0 circular sample buffer (10 kS/s)
  ao1: number;              // Current AO1 voltage
  vpsPos: number;           // Current +VPS voltage
  vpsNeg: number;           // Current -VPS voltage
  counter: number;          // CTR0 edge counter
  isAi0Connected?: boolean; // Whether AI0 has any physical connection
  isAi1Connected?: boolean; // Whether AI1 has any physical connection
}

// ─── Event Log ──────────────────────────────────────────────────────────────

export interface EngineEventLog {
  timestamp: number;  // Simulated time in seconds
  tick: number;
  type: 'info' | 'warn' | 'error';
  category: 'daq' | 'net' | 'contention' | 'oscillation' | 'component' | 'task';
  message: string;
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

export interface SimSnapshot {
  time: number;       // Simulated time in seconds
  tick: number;       // Tick count
  dt: number;         // Fixed timestep
  daqState: DaqState;
  nets: Record<string, {
    level: Level;
    volts: number | null;
    pins: string[];
    isContested: boolean;
  }>;
  pins: Record<string, {
    level: Level;
    volts: number | null;
    dir: PinDirection;
    owner: string;
  }>;
  daq: DaqBuffers;
  components: Record<string, {
    id: string;
    powered: boolean;
    outputLevels: Record<string, Level>;
  }>;
  tasks: Record<string, {
    id: string;
    kind: TaskKind;
    state: TaskState;
    channels: string[];
  }>;
  events: EngineEventLog[];
}

// ─── Engine Commands ────────────────────────────────────────────────────────

export type EngineCommand =
  | { type: 'POWER_DAQ'; enabled: boolean }
  | { type: 'SET_DIGITAL_OUT'; pinIndex: number; level: 0 | 1 }
  | { type: 'SET_ALL_DIGITAL_OUT'; levels: (0 | 1)[] }
  | { type: 'SET_FGEN'; waveform: 'sine' | 'square' | 'triangle'; frequency: number; amplitude: number; dcOffset: number; enabled: boolean }
  | { type: 'SET_VPS'; posVoltage: number; negVoltage: number; enabled: boolean }
  | { type: 'SET_NOISE'; enabled: boolean; seed?: number }
  | { type: 'UPDATE_NETLIST'; wires: Array<{ from: string; to: string }>; components: any[] }
  | { type: 'CREATE_TASK'; task: Omit<Task, 'state' | 'bufferIndex' | 'sampleAccum'> }
  | { type: 'START_TASK'; taskId: string }
  | { type: 'STOP_TASK'; taskId: string };
