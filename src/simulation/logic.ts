import {
  ICComponent,
  ICType,
  LogicState,
  ElectricalNode,
  NodeId,
  CircuitComponent,
  ContactId,
} from '../model/types';
import { findNodeForContact } from '../model/connectivity';

// ─── Gate Truth Functions ────────────────────────────────────────────────────

function evaluateAND(a: LogicState, b: LogicState): LogicState {
  if (a === 1 && b === 1) return 1;
  if (a === 0 || b === 0) return 0;
  return 'X';
}

function evaluateOR(a: LogicState, b: LogicState): LogicState {
  if (a === 1 || b === 1) return 1;
  if (a === 0 && b === 0) return 0;
  return 'X';
}

function evaluateNAND(a: LogicState, b: LogicState): LogicState {
  const andResult = evaluateAND(a, b);
  if (andResult === 1) return 0;
  if (andResult === 0) return 1;
  return 'X';
}

function evaluateNOR(a: LogicState, b: LogicState): LogicState {
  const orResult = evaluateOR(a, b);
  if (orResult === 1) return 0;
  if (orResult === 0) return 1;
  return 'X';
}

function evaluateNOT(a: LogicState): LogicState {
  if (a === 1) return 0;
  if (a === 0) return 1;
  return 'X';
}

function evaluateXOR(a: LogicState, b: LogicState): LogicState {
  if (a === 'X' || a === 'Z' || b === 'X' || b === 'Z') return 'X';
  return (a !== b) ? 1 : 0;
}

// ─── Gate Pin Mapping ────────────────────────────────────────────────────────
// For 14-pin DIP packages, pin numbers are 1-indexed.
// VCC = pin 14, GND = pin 7

interface GateConnection {
  inputA: number;   // Pin index (0-based)
  inputB?: number;  // Pin index (0-based), undefined for NOT gates
  output: number;   // Pin index (0-based)
}

const GATE_CONNECTIONS: Partial<Record<ICType, GateConnection[]>> = {
  '74HC00': [ // Quad NAND
    { inputA: 0, inputB: 1, output: 2 },   // 1A, 1B → 1Y
    { inputA: 3, inputB: 4, output: 5 },   // 2A, 2B → 2Y
    { inputA: 8, inputB: 9, output: 7 },   // 3A, 3B → 3Y
    { inputA: 11, inputB: 12, output: 10 }, // 4A, 4B → 4Y
  ],
  '74HC02': [ // Quad NOR
    { inputA: 1, inputB: 2, output: 0 },   // 1A, 1B → 1Y
    { inputA: 4, inputB: 5, output: 3 },   // 2A, 2B → 2Y
    { inputA: 7, inputB: 8, output: 9 },   // 3A, 3B → 3Y
    { inputA: 10, inputB: 11, output: 12 }, // 4A, 4B → 4Y
  ],
  '74HC04': [ // Hex Inverter
    { inputA: 0, output: 1 },   // 1A → 1Y
    { inputA: 2, output: 3 },   // 2A → 2Y
    { inputA: 4, output: 5 },   // 3A → 3Y
    { inputA: 8, output: 7 },   // 4A → 4Y
    { inputA: 10, output: 9 },  // 5A → 5Y
    { inputA: 12, output: 11 }, // 6A → 6Y
  ],
  '74HC08': [ // Quad AND
    { inputA: 0, inputB: 1, output: 2 },
    { inputA: 3, inputB: 4, output: 5 },
    { inputA: 8, inputB: 9, output: 7 },
    { inputA: 11, inputB: 12, output: 10 },
  ],
  '74HC32': [ // Quad OR
    { inputA: 0, inputB: 1, output: 2 },
    { inputA: 3, inputB: 4, output: 5 },
    { inputA: 8, inputB: 9, output: 7 },
    { inputA: 11, inputB: 12, output: 10 },
  ],
  '74HC86': [ // Quad XOR
    { inputA: 0, inputB: 1, output: 2 },
    { inputA: 3, inputB: 4, output: 5 },
    { inputA: 8, inputB: 9, output: 7 },
    { inputA: 11, inputB: 12, output: 10 },
  ],
  '7486': [ // Quad XOR
    { inputA: 0, inputB: 1, output: 2 },
    { inputA: 3, inputB: 4, output: 5 },
    { inputA: 8, inputB: 9, output: 7 },
    { inputA: 11, inputB: 12, output: 10 },
  ],
};

// ─── Logic Evaluation ────────────────────────────────────────────────────────

function getPinState(
  component: ICComponent,
  pinIndex: number,
  nodes: Map<NodeId, ElectricalNode>,
): LogicState {
  const pin = component.pins[pinIndex];
  if (!pin || !pin.contactId) return 'Z';
  
  const node = findNodeForContact(nodes, pin.contactId);
  if (!node) return 'Z';
  return node.state;
}

function evaluateGate(
  icType: ICType,
  gate: GateConnection,
  inputA: LogicState,
  inputB: LogicState | undefined,
): LogicState {
  switch (icType) {
    case '74HC00': return evaluateNAND(inputA, inputB ?? 'X');
    case '74HC02': return evaluateNOR(inputA, inputB ?? 'X');
    case '74HC04': return evaluateNOT(inputA);
    case '74HC08': return evaluateAND(inputA, inputB ?? 'X');
    case '74HC32': return evaluateOR(inputA, inputB ?? 'X');
    case '74HC86':
    case '7486':
      return evaluateXOR(inputA, inputB ?? 'X');
    default:
      void gate;
      return 'X';
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface LogicUpdate {
  contactId: ContactId;
  state: LogicState;
}

export function evaluateAllGates(
  components: Map<string, CircuitComponent>,
  nodes: Map<NodeId, ElectricalNode>,
): LogicUpdate[] {
  const updates: LogicUpdate[] = [];

  for (const component of components.values()) {
    if (component.type !== 'ic') continue;
    
    const ic = component as ICComponent;
    const gates = GATE_CONNECTIONS[ic.icType];
    if (!gates) continue;

    // Check VCC and GND
    const is555 = ic.icType === 'NE555';
    const vccPin = is555 ? ic.pins[7] : ic.pins[13]; // Pin 8 for 555, Pin 14 for 14-pin DIP
    const gndPin = is555 ? ic.pins[0] : ic.pins[6];  // Pin 1 for 555, Pin 7 for 14-pin DIP
    
    const vccState = vccPin?.contactId ? findNodeForContact(nodes, vccPin.contactId)?.state : 'Z';
    const gndState = gndPin?.contactId ? findNodeForContact(nodes, gndPin.contactId)?.state : 'Z';
    
    // IC needs power to function
    const hasPower = vccState === 1 && gndState === 0;
    
    for (const gate of gates) {
      const inputA = getPinState(ic, gate.inputA, nodes);
      const inputB = gate.inputB !== undefined ? getPinState(ic, gate.inputB, nodes) : undefined;
      
      let output: LogicState;
      if (!hasPower) {
        output = 'X'; // Unpowered IC
      } else {
        output = evaluateGate(ic.icType, gate, inputA, inputB);
      }
      
      const outputPin = ic.pins[gate.output];
      if (outputPin) {
        outputPin.state = output;
        if (outputPin.contactId) {
          updates.push({ contactId: outputPin.contactId, state: output });
        }
      }
    }
  }

  return updates;
}

/**
 * Run iterative logic propagation until stable or max iterations reached.
 * Returns true if the circuit reached a stable state.
 */
export function propagateLogic(
  components: Map<string, CircuitComponent>,
  nodes: Map<NodeId, ElectricalNode>,
  maxIterations = 100,
): { stable: boolean; iterations: number } {
  let iterations = 0;
  let changed = true;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;
    
    const updates = evaluateAllGates(components, nodes);
    
    for (const update of updates) {
      const node = findNodeForContact(nodes, update.contactId);
      if (node && node.state !== update.state) {
        node.state = update.state;
        changed = true;
      }
    }
  }

  return { stable: !changed, iterations };
}
