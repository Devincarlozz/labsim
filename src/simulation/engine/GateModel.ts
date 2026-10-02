/**
 * GateModel.ts: Table-Driven Pure Gate IC Models + Sequential Components
 * Per plan (1).md Sections 9.1, 9.2.
 *
 * Combinational gates: pure truth tables handling X/Z inputs.
 * Sequential (7474 D Flip-Flop): edge-triggered on rising clock edge,
 * sampling D from values at the start of the tick.
 *
 * All output voltages use logic family thresholds (VOL/VOH).
 */

import { Drive, Level, LogicFamily, Pin, PinIO, PinReadResult, SimComponent, TTL_FAMILY } from './types';

// ─── Gate Definitions ───────────────────────────────────────────────────────

export interface GateDef {
  name: string;
  a: string;
  b?: string;
  y: string;
}

export type LogicFn = (a: Level, b?: Level) => Level;

export interface ICDescriptor {
  type: string;
  pinCount: number;
  vccPin: string;
  gndPin: string;
  gates: GateDef[];
  logic: LogicFn;
  family: LogicFamily;
}

// Logic functions handling X and Z per plan (1).md Section 9.1
const AND_LOGIC: LogicFn = (a, b) => {
  if (a === 'X' || a === 'Z' || b === 'X' || b === 'Z') return 'X';
  return (a === 1 && b === 1) ? 1 : 0;
};

const NAND_LOGIC: LogicFn = (a, b) => {
  if (a === 'X' || a === 'Z' || b === 'X' || b === 'Z') return 'X';
  return (a === 1 && b === 1) ? 0 : 1;
};

const OR_LOGIC: LogicFn = (a, b) => {
  if (a === 'X' || a === 'Z' || b === 'X' || b === 'Z') return 'X';
  return (a === 1 || b === 1) ? 1 : 0;
};

const NOR_LOGIC: LogicFn = (a, b) => {
  if (a === 'X' || a === 'Z' || b === 'X' || b === 'Z') return 'X';
  return (a === 0 && b === 0) ? 1 : 0;
};

const NOT_LOGIC: LogicFn = (a) => {
  if (a === 'X' || a === 'Z') return 'X';
  return (a === 1) ? 0 : 1;
};

const XOR_LOGIC: LogicFn = (a, b) => {
  if (a === 'X' || a === 'Z' || b === 'X' || b === 'Z') return 'X';
  return (a !== b) ? 1 : 0;
};

// Standard DIP-14 Quad 2-input pinouts (14=VCC, 7=GND)
const STANDARD_QUAD_GATES: GateDef[] = [
  { name: '1', a: 'pin1', b: 'pin2', y: 'pin3' },
  { name: '2', a: 'pin4', b: 'pin5', y: 'pin6' },
  { name: '3', a: 'pin9', b: 'pin10', y: 'pin8' },
  { name: '4', a: 'pin12', b: 'pin13', y: 'pin11' },
];

export const IC_DESCRIPTORS: Record<string, ICDescriptor> = {
  '7408': {
    type: '7408', pinCount: 14, vccPin: 'pin14', gndPin: 'pin7',
    gates: STANDARD_QUAD_GATES, logic: AND_LOGIC, family: TTL_FAMILY,
  },
  '74HC08': {
    type: '74HC08', pinCount: 14, vccPin: 'pin14', gndPin: 'pin7',
    gates: STANDARD_QUAD_GATES, logic: AND_LOGIC, family: TTL_FAMILY,
  },
  '7400': {
    type: '7400', pinCount: 14, vccPin: 'pin14', gndPin: 'pin7',
    gates: STANDARD_QUAD_GATES, logic: NAND_LOGIC, family: TTL_FAMILY,
  },
  '74HC00': {
    type: '74HC00', pinCount: 14, vccPin: 'pin14', gndPin: 'pin7',
    gates: STANDARD_QUAD_GATES, logic: NAND_LOGIC, family: TTL_FAMILY,
  },
  '7402': {
    type: '7402', pinCount: 14, vccPin: 'pin14', gndPin: 'pin7',
    gates: [
      { name: '1', y: 'pin1', a: 'pin2', b: 'pin3' },
      { name: '2', y: 'pin4', a: 'pin5', b: 'pin6' },
      { name: '3', y: 'pin10', a: 'pin8', b: 'pin9' },
      { name: '4', y: 'pin13', a: 'pin11', b: 'pin12' },
    ],
    logic: NOR_LOGIC, family: TTL_FAMILY,
  },
  '74HC02': {
    type: '74HC02', pinCount: 14, vccPin: 'pin14', gndPin: 'pin7',
    gates: [
      { name: '1', y: 'pin1', a: 'pin2', b: 'pin3' },
      { name: '2', y: 'pin4', a: 'pin5', b: 'pin6' },
      { name: '3', y: 'pin10', a: 'pin8', b: 'pin9' },
      { name: '4', y: 'pin13', a: 'pin11', b: 'pin12' },
    ],
    logic: NOR_LOGIC, family: TTL_FAMILY,
  },
  '7404': {
    type: '7404', pinCount: 14, vccPin: 'pin14', gndPin: 'pin7',
    gates: [
      { name: '1', a: 'pin1', y: 'pin2' },
      { name: '2', a: 'pin3', y: 'pin4' },
      { name: '3', a: 'pin5', y: 'pin6' },
      { name: '4', a: 'pin9', y: 'pin8' },
      { name: '5', a: 'pin11', y: 'pin10' },
      { name: '6', a: 'pin13', y: 'pin12' },
    ],
    logic: NOT_LOGIC, family: TTL_FAMILY,
  },
  '74HC04': {
    type: '74HC04', pinCount: 14, vccPin: 'pin14', gndPin: 'pin7',
    gates: [
      { name: '1', a: 'pin1', y: 'pin2' },
      { name: '2', a: 'pin3', y: 'pin4' },
      { name: '3', a: 'pin5', y: 'pin6' },
      { name: '4', a: 'pin9', y: 'pin8' },
      { name: '5', a: 'pin11', y: 'pin10' },
      { name: '6', a: 'pin13', y: 'pin12' },
    ],
    logic: NOT_LOGIC, family: TTL_FAMILY,
  },
  '7432': {
    type: '7432', pinCount: 14, vccPin: 'pin14', gndPin: 'pin7',
    gates: STANDARD_QUAD_GATES, logic: OR_LOGIC, family: TTL_FAMILY,
  },
  '74HC32': {
    type: '74HC32', pinCount: 14, vccPin: 'pin14', gndPin: 'pin7',
    gates: STANDARD_QUAD_GATES, logic: OR_LOGIC, family: TTL_FAMILY,
  },
  '7486': {
    type: '7486', pinCount: 14, vccPin: 'pin14', gndPin: 'pin7',
    gates: STANDARD_QUAD_GATES, logic: XOR_LOGIC, family: TTL_FAMILY,
  },
  '74HC86': {
    type: '74HC86', pinCount: 14, vccPin: 'pin14', gndPin: 'pin7',
    gates: STANDARD_QUAD_GATES, logic: XOR_LOGIC, family: TTL_FAMILY,
  },
};

// ─── Helper: create a Drive from a logic level using a logic family ─────────

function levelToDrive(level: Level, family: LogicFamily): Drive {
  if (level === 'X' || level === 'Z') {
    return { mode: 'none', volts: 0 };
  }
  return {
    mode: 'push-pull',
    volts: level === 1 ? family.voh : family.vol,
    level: level,
  };
}

// ─── Combinational Gate IC Component ────────────────────────────────────────

export class GateICComponent implements SimComponent {
  public id: string;
  public name: string;
  public descriptor: ICDescriptor;
  public pins: Pin[];
  public isPowered: boolean = false;
  public outputLevels: Record<string, Level> = {};

  constructor(id: string, icType: string) {
    this.id = id;
    this.name = icType;
    const desc = IC_DESCRIPTORS[icType] || IC_DESCRIPTORS['74HC08'];
    this.descriptor = desc;

    // Generate pins for this IC
    this.pins = [];
    const outputPinNames = new Set(desc.gates.map((g) => g.y));

    for (let p = 1; p <= desc.pinCount; p++) {
      const pinName = `pin${p}`;
      const isOutput = outputPinNames.has(pinName);

      this.pins.push({
        id: `${this.id}.${pinName}`,
        owner: this.id,
        dir: isOutput ? 'out' : 'in',
        drive: { mode: 'none', volts: 0 },
      });
      if (isOutput) {
        this.outputLevels[pinName] = 'Z';
      }
    }
  }

  public reset(): void {
    this.isPowered = false;
    for (const p of this.pins) {
      if (p.dir === 'out') {
        p.drive = { mode: 'none', volts: 0 };
        this.outputLevels[p.id.split('.')[1]] = 'Z';
      }
    }
  }

  /**
   * Step: evaluate gates as pure truth tables.
   * Per plan (1).md Section 9.1:
   * - Requires VCC high and GND low, else all outputs Z
   * - X/Z inputs -> output X (never randomize)
   * - Output voltages use logic family VOL/VOH
   */
  public step(_dt: number, io: PinIO): void {
    const vccReading = io.read(`${this.id}.${this.descriptor.vccPin}`);
    const gndReading = io.read(`${this.id}.${this.descriptor.gndPin}`);

    // Power check: VCC must be HIGH (>= VIH), GND must be LOW (<= VIL)
    const family = this.descriptor.family;
    const vccOk = vccReading.volts !== null && vccReading.volts >= family.vih;
    const gndOk = gndReading.volts !== null && gndReading.volts <= family.vil;
    this.isPowered = vccOk && gndOk;

    if (!this.isPowered) {
      // Unpowered IC: all outputs Z (high impedance, no drive)
      for (const gate of this.descriptor.gates) {
        io.drive(`${this.id}.${gate.y}`, { mode: 'none', volts: 0 });
        this.outputLevels[gate.y] = 'Z';
      }
      return;
    }

    // Evaluate each gate
    for (const gate of this.descriptor.gates) {
      const a = io.read(`${this.id}.${gate.a}`).level;
      const b = gate.b ? io.read(`${this.id}.${gate.b}`).level : undefined;

      // X/Z inputs => output X (undefined, not randomized)
      // Drive at midpoint voltage (between VIL and VIH) so net resolves as 'X'
      if (a === 'X' || a === 'Z' || (gate.b !== undefined && (b === 'X' || b === 'Z'))) {
        const midV = (family.vil + family.vih) / 2;
        io.drive(`${this.id}.${gate.y}`, { mode: 'push-pull', volts: midV });
        this.outputLevels[gate.y] = 'X';
        continue;
      }

      const outLevel = this.descriptor.logic(a, b);
      const drv = levelToDrive(outLevel, family);
      io.drive(`${this.id}.${gate.y}`, drv);
      this.outputLevels[gate.y] = outLevel;
    }
  }
}

// ─── 7474 D Flip-Flop (Sequential, Edge-Triggered) ─────────────────────────
/**
 * 7474: Dual D-Type Positive-Edge-Triggered Flip-Flop
 * Per plan (1).md Section 9.2:
 * - Rising edge: prevClk === 0 && clk === 1
 * - On the edge, sample D from values at the start of this tick
 * - Q updates only on edge; /Q is complement
 *
 * Pinout (14-pin DIP):
 *   1: /CLR1   2: D1   3: CLK1   4: /PRE1   5: Q1   6: /Q1   7: GND
 *   8: /Q2     9: Q2  10: /PRE2  11: CLK2   12: D2  13: /CLR2  14: VCC
 */
export class DFlipFlopComponent implements SimComponent {
  public id: string;
  public name: string = '7474';
  public pins: Pin[];
  public isPowered: boolean = false;
  public outputLevels: Record<string, Level> = {};

  // Internal state for both flip-flops
  private q: [Level, Level] = [0, 0];
  private prevClk: [Level, Level] = [0, 0];

  constructor(id: string) {
    this.id = id;

    // 14 pins
    this.pins = [];
    const outputPins = new Set(['pin5', 'pin6', 'pin8', 'pin9']); // Q1, /Q1, /Q2, Q2
    for (let p = 1; p <= 14; p++) {
      const pinName = `pin${p}`;
      this.pins.push({
        id: `${id}.${pinName}`,
        owner: id,
        dir: outputPins.has(pinName) ? 'out' : 'in',
        drive: { mode: 'none', volts: 0 },
      });
    }

    this.outputLevels = { pin5: 'Z', pin6: 'Z', pin8: 'Z', pin9: 'Z' };
  }

  public reset(): void {
    this.isPowered = false;
    this.q = [0, 0];
    this.prevClk = [0, 0];
    for (const p of this.pins) {
      if (p.dir === 'out') {
        p.drive = { mode: 'none', volts: 0 };
      }
    }
    this.outputLevels = { pin5: 'Z', pin6: 'Z', pin8: 'Z', pin9: 'Z' };
  }

  public step(_dt: number, io: PinIO): void {
    const family = TTL_FAMILY;
    const vccReading = io.read(`${this.id}.pin14`);
    const gndReading = io.read(`${this.id}.pin7`);

    const vccOk = vccReading.volts !== null && vccReading.volts >= family.vih;
    const gndOk = gndReading.volts !== null && gndReading.volts <= family.vil;
    this.isPowered = vccOk && gndOk;

    if (!this.isPowered) {
      for (const pin of ['pin5', 'pin6', 'pin8', 'pin9']) {
        io.drive(`${this.id}.${pin}`, { mode: 'none', volts: 0 });
        this.outputLevels[pin] = 'Z';
      }
      return;
    }

    // FF1: /CLR1=pin1, D1=pin2, CLK1=pin3, /PRE1=pin4, Q1=pin5, /Q1=pin6
    this.stepFF(io, 0, 'pin1', 'pin2', 'pin3', 'pin4', 'pin5', 'pin6', family);

    // FF2: /CLR2=pin13, D2=pin12, CLK2=pin11, /PRE2=pin10, Q2=pin9, /Q2=pin8
    this.stepFF(io, 1, 'pin13', 'pin12', 'pin11', 'pin10', 'pin9', 'pin8', family);
  }

  private stepFF(
    io: PinIO, idx: 0 | 1,
    clrPin: string, dPin: string, clkPin: string, prePin: string,
    qPin: string, qBarPin: string,
    family: LogicFamily
  ): void {
    const clr = io.read(`${this.id}.${clrPin}`).level;
    const pre = io.read(`${this.id}.${prePin}`).level;
    const clk = io.read(`${this.id}.${clkPin}`).level;
    const d = io.read(`${this.id}.${dPin}`).level;

    // Asynchronous resets (active LOW)
    if (clr === 0 && pre === 0) {
      // Both active: Q=1, /Q=1 (invalid but deterministic)
      this.q[idx] = 1;
    } else if (clr === 0) {
      this.q[idx] = 0;
    } else if (pre === 0) {
      this.q[idx] = 1;
    } else {
      // Normal clocked operation: rising edge detection
      // prevClk === 0 && clk === 1 => sample D
      const prevC = this.prevClk[idx];
      if (prevC === 0 && clk === 1) {
        // Sample D at the rising edge
        if (d === 1) this.q[idx] = 1;
        else if (d === 0) this.q[idx] = 0;
        // else (X/Z): hold previous Q
      }
    }

    // Update prevClk for next tick's edge detection
    this.prevClk[idx] = (clk === 1) ? 1 : (clk === 0) ? 0 : this.prevClk[idx];

    // Drive Q and /Q outputs
    const qLevel = this.q[idx] as (0 | 1);
    const qBarLevel: 0 | 1 = qLevel === 1 ? 0 : 1;

    io.drive(`${this.id}.${qPin}`, levelToDrive(qLevel, family));
    io.drive(`${this.id}.${qBarPin}`, levelToDrive(qBarLevel, family));
    this.outputLevels[qPin] = qLevel;
    this.outputLevels[qBarPin] = qBarLevel;
  }
}

// ─── NE555 Precision Timer (8-pin DIP) ──────────────────────────────────────
/**
 * Pinout: 1:GND, 2:TRIG, 3:OUT, 4:RESET, 5:CTRL, 6:THRESH, 7:DISCH, 8:VCC
 */
export class NE555Component implements SimComponent {
  public id: string;
  public name: string = 'NE555';
  public pins: Pin[];
  public isPowered: boolean = false;
  public state: Level = 0;
  public outputLevels: Record<string, Level> = { pin3: 'Z', pin7: 'Z' };

  constructor(id: string) {
    this.id = id;
    this.pins = [
      { id: `${id}.pin1`, owner: id, dir: 'in', drive: { mode: 'none', volts: 0 } },  // GND
      { id: `${id}.pin2`, owner: id, dir: 'in', drive: { mode: 'none', volts: 0 } },  // TRIG
      { id: `${id}.pin3`, owner: id, dir: 'out', drive: { mode: 'none', volts: 0 } }, // OUT
      { id: `${id}.pin4`, owner: id, dir: 'in', drive: { mode: 'none', volts: 0 } },  // RESET
      { id: `${id}.pin5`, owner: id, dir: 'in', drive: { mode: 'none', volts: 0 } },  // CTRL
      { id: `${id}.pin6`, owner: id, dir: 'in', drive: { mode: 'none', volts: 0 } },  // THRESH
      { id: `${id}.pin7`, owner: id, dir: 'out', drive: { mode: 'none', volts: 0 } }, // DISCH
      { id: `${id}.pin8`, owner: id, dir: 'in', drive: { mode: 'none', volts: 0 } },  // VCC
    ];
  }

  public reset(): void {
    this.isPowered = false;
    this.state = 0;
    this.outputLevels.pin3 = 'Z';
    this.outputLevels.pin7 = 'Z';
    for (const p of this.pins) {
      if (p.dir === 'out') {
        p.drive = { mode: 'none', volts: 0 };
      }
    }
  }

  public step(_dt: number, io: PinIO): void {
    const family = TTL_FAMILY;
    const vcc = io.read(`${this.id}.pin8`);
    const gnd = io.read(`${this.id}.pin1`);

    const vccOk = vcc.volts !== null && vcc.volts >= family.vih;
    const gndOk = gnd.volts !== null && gnd.volts <= family.vil;
    this.isPowered = vccOk && gndOk;

    if (!this.isPowered) {
      io.drive(`${this.id}.pin3`, { mode: 'none', volts: 0 });
      io.drive(`${this.id}.pin7`, { mode: 'none', volts: 0 });
      this.outputLevels.pin3 = 'Z';
      this.outputLevels.pin7 = 'Z';
      return;
    }

    const resetLevel = io.read(`${this.id}.pin4`).level;
    const trigLevel = io.read(`${this.id}.pin2`).level;
    const threshLevel = io.read(`${this.id}.pin6`).level;

    // Reset active LOW overrides
    if (resetLevel === 0) {
      this.state = 0;
    } else if (trigLevel === 0) {
      this.state = 1;
    } else if (threshLevel === 1) {
      this.state = 0;
    }

    const outDrive = this.state === 1
      ? { mode: 'push-pull' as const, volts: family.voh, level: 1 as const }
      : { mode: 'push-pull' as const, volts: family.vol, level: 0 as const };

    io.drive(`${this.id}.pin3`, outDrive);
    // Pin 7 (discharge): conducts to GND when state is 0, open when state is 1
    io.drive(`${this.id}.pin7`, this.state === 0
      ? { mode: 'push-pull', volts: 0, level: 0 }
      : { mode: 'none', volts: 0 }
    );
    this.outputLevels.pin3 = this.state;
    this.outputLevels.pin7 = this.state === 0 ? 0 : 'Z';
  }
}
