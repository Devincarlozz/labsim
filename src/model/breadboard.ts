import {
  BreadboardModel,
  BreadboardContact,
  ContactId,
  Point,
  StripRow,
} from './types';

// ─── Layout Constants ────────────────────────────────────────────────────────

export const HOLE_SPACING = 14;          // px between hole centers
export const HOLE_RADIUS = 3.2;          // px draw radius
export const BOARD_PADDING = 40;         // px from board edge to first hole
export const CENTER_GAP = 28;            // px gap between rows e/f (DIP channel)
export const RAIL_GAP = 18;              // px between rail and terminal strip
export const RAIL_SECTION_GAP = 4;       // px gap every 5 holes in rail markings

export const TERMINAL_COLS = 64;
export const TERMINAL_ROWS: StripRow[] = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
export const RAIL_COLS = 64;
export const RAIL_COUNT = 4;             // 2 top (power+ground) + 2 bottom

export const TOP_ROWS: StripRow[] = ['a', 'b', 'c', 'd', 'e'];
export const BOTTOM_ROWS: StripRow[] = ['f', 'g', 'h', 'i', 'j'];

// ─── NI myDAQ Terminal Contacts (Single Horizontal Row of 20 Terminals) ───────
export const DAQ_HORIZONTAL_PINS = [
  'daq-p15v',   // 1: +15V
  'daq-n15v',   // 2: -15V
  'daq-agnd1',  // 3: AGND
  'daq-ao0',    // 4: AO 0
  'daq-ao1',    // 5: AO 1
  'daq-agnd2',  // 6: AGND
  'daq-ai0_p',  // 7: AI 0+
  'daq-ai0_m',  // 8: AI 0-
  'daq-ai1_p',  // 9: AI 1+
  'daq-ai1_m',  // 10: AI 1-
  'daq-dio0',   // 11: DIO 0
  'daq-dio1',   // 12: DIO 1
  'daq-dio2',   // 13: DIO 2
  'daq-dio3',   // 14: DIO 3
  'daq-dio4',   // 15: DIO 4
  'daq-dio5',   // 16: DIO 5
  'daq-dio6',   // 17: DIO 6
  'daq-dio7',   // 18: DIO 7
  'daq-dgnd',   // 19: DGND
  'daq-v5v',    // 20: 5V
] as const;

// Backward-compatible row slices
export const DAQ_ROW1_PINS = DAQ_HORIZONTAL_PINS.slice(0, 10);
export const DAQ_ROW2_PINS = DAQ_HORIZONTAL_PINS.slice(10, 20);

export const DAQ_PIN_IDS = DAQ_HORIZONTAL_PINS;

export function isDaqPin(id: string): boolean {
  return id.startsWith('daq-');
}

// Board dimensions - perfectly symmetrical margins
export const BOARD_WIDTH = BOARD_PADDING * 2 + (TERMINAL_COLS - 1) * HOLE_SPACING + 40; // 1002px
export const BOARD_HEIGHT = 326; // generous margins for complete comfort

// ─── Contact ID Format ───────────────────────────────────────────────────────
// Terminal: "t-<row>-<col>"   e.g., "t-a-1", "t-j-64"
// Rail:     "r-<index>-<col>" e.g., "r-0-1" (top power rail, col 1)

export function makeTerminalId(row: StripRow, col: number): ContactId {
  return `t-${row}-${col}`;
}

export function makeRailId(railIndex: number, col: number): ContactId {
  return `r-${railIndex}-${col}`;
}

// ─── Node Groups (internal connectivity) ─────────────────────────────────────
// Terminal strip: columns within same half share a node
//   Top half (a-e): "node-top-<col>"
//   Bottom half (f-j): "node-bot-<col>"
// Rails: each rail row is one continuous node
//   "node-rail-<railIndex>"

function terminalNodeGroup(row: StripRow, col: number): string {
  const isTop = TOP_ROWS.includes(row);
  return `node-${isTop ? 'top' : 'bot'}-${col}`;
}

function railNodeGroup(railIndex: number): string {
  return `node-rail-${railIndex}`;
}

// ─── Position Calculations ───────────────────────────────────────────────────

function terminalPosition(row: StripRow, col: number): Point {
  const colIndex = col - 1;
  const rowIndex = TERMINAL_ROWS.indexOf(row);
  
  const x = BOARD_PADDING + 20 + colIndex * HOLE_SPACING;
  
  // Top rails take up space above
  let y = BOARD_PADDING + (2 * HOLE_SPACING) + RAIL_GAP;
  
  if (rowIndex <= 4) {
    // Top half (a–e)
    y += rowIndex * HOLE_SPACING;
  } else {
    // Bottom half (f–j): add center gap
    y += 4 * HOLE_SPACING + CENTER_GAP + (rowIndex - 5) * HOLE_SPACING;
  }
  
  return { x, y };
}

function railPosition(railIndex: number, col: number): Point {
  const colIndex = col - 1;
  // Rails align directly with terminal columns 1 to 64
  const x = BOARD_PADDING + 20 + colIndex * HOLE_SPACING;
  
  let y: number;
  if (railIndex === 0) {
    // Top power rail
    y = BOARD_PADDING;
  } else if (railIndex === 1) {
    // Top ground rail
    y = BOARD_PADDING + HOLE_SPACING;
  } else if (railIndex === 2) {
    // Bottom power rail
    y = BOARD_PADDING + (2 * HOLE_SPACING) + RAIL_GAP + 
        (4 * HOLE_SPACING) + CENTER_GAP + (5 * HOLE_SPACING) + RAIL_GAP;
  } else {
    // Bottom ground rail
    y = BOARD_PADDING + (2 * HOLE_SPACING) + RAIL_GAP + 
        (4 * HOLE_SPACING) + CENTER_GAP + (5 * HOLE_SPACING) + RAIL_GAP + HOLE_SPACING;
  }
  
  return { x, y };
}

// ─── Build Model ─────────────────────────────────────────────────────────────

export function createBreadboardModel(): BreadboardModel {
  const contacts = new Map<ContactId, BreadboardContact>();
  
  // Terminal strip contacts: 64 cols × 10 rows = 640
  for (const row of TERMINAL_ROWS) {
    for (let col = 1; col <= TERMINAL_COLS; col++) {
      const id = makeTerminalId(row, col);
      contacts.set(id, {
        id,
        col,
        row,
        position: terminalPosition(row, col),
        nodeGroup: terminalNodeGroup(row, col),
        occupied: false,
      });
    }
  }
  
  // Rail contacts: 4 rails × 50 cols = 200
  for (let railIndex = 0; railIndex < RAIL_COUNT; railIndex++) {
    for (let col = 1; col <= RAIL_COLS; col++) {
      const id = makeRailId(railIndex, col);
      const railType = (railIndex % 2 === 0) ? 'power' : 'ground';
      contacts.set(id, {
        id,
        col,
        row: railType,
        position: railPosition(railIndex, col),
        nodeGroup: railNodeGroup(railIndex),
        occupied: false,
      });
    }
  }

  // 3. Horizontal NI myDAQ Terminal Contacts (Single Horizontal Row of 20 Terminals)
  // Centered above the breadboard and aligned with breadboard columns 14 to 52 (pitch 28px)
  const daqStartX = 222;
  const daqPitch = 28;
  const daqY = -22;
  for (let i = 0; i < DAQ_HORIZONTAL_PINS.length; i++) {
    const id = DAQ_HORIZONTAL_PINS[i];
    contacts.set(id, {
      id,
      col: 14 + i * 2, // matches breadboard columns 14, 16, ..., 52 directly!
      row: 'daq',
      position: { x: daqStartX + i * daqPitch, y: daqY },
      nodeGroup: `node-${id}`,
      occupied: false,
    });
  }
  
  return {
    contacts,
    terminalCols: TERMINAL_COLS,
    terminalRows: 10,
    railCols: RAIL_COLS,
    railRows: RAIL_COUNT,
    totalHoles: contacts.size,
  };
}

// ─── Queries ─────────────────────────────────────────────────────────────────

export interface DAQPinInfo {
  id: string;
  name: string;
  pinNumber: number;
  col: number;
  type: 'power' | 'analog' | 'digital' | 'ground';
  description: string;
}

export const DAQ_PIN_METADATA: Record<string, DAQPinInfo> = {
  'daq-p15v':  { id: 'daq-p15v',  name: '+15V', pinNumber: 1,  col: 14, type: 'power',   description: '+15V Analog Power Supply' },
  'daq-n15v':  { id: 'daq-n15v',  name: '-15V', pinNumber: 2,  col: 16, type: 'power',   description: '-15V Analog Power Supply' },
  'daq-agnd1': { id: 'daq-agnd1', name: 'AGND', pinNumber: 3,  col: 18, type: 'ground',  description: 'Analog Ground Reference (0V)' },
  'daq-ao0':   { id: 'daq-ao0',   name: 'AO 0', pinNumber: 4,  col: 20, type: 'analog',  description: 'Analog Output 0 (Function Generator)' },
  'daq-ao1':   { id: 'daq-ao1',   name: 'AO 1', pinNumber: 5,  col: 22, type: 'analog',  description: 'Analog Output 1 (DC/Arbitrary)' },
  'daq-agnd2': { id: 'daq-agnd2', name: 'AGND', pinNumber: 6,  col: 24, type: 'ground',  description: 'Analog Ground Reference (0V)' },
  'daq-ai0_p': { id: 'daq-ai0_p', name: 'AI0+', pinNumber: 7,  col: 26, type: 'analog',  description: 'Analog Input 0+ (Scope CH0 & DMM)' },
  'daq-ai0_m': { id: 'daq-ai0_m', name: 'AI0-', pinNumber: 8,  col: 28, type: 'analog',  description: 'Analog Input 0- (Differential GND)' },
  'daq-ai1_p': { id: 'daq-ai1_p', name: 'AI1+', pinNumber: 9,  col: 30, type: 'analog',  description: 'Analog Input 1+ (Scope CH1)' },
  'daq-ai1_m': { id: 'daq-ai1_m', name: 'AI1-', pinNumber: 10, col: 32, type: 'analog',  description: 'Analog Input 1- (Differential GND)' },
  'daq-dio0':  { id: 'daq-dio0',  name: 'DIO0', pinNumber: 11, col: 34, type: 'digital', description: 'Digital I/O line 0 (0-5V LVTTL)' },
  'daq-dio1':  { id: 'daq-dio1',  name: 'DIO1', pinNumber: 12, col: 36, type: 'digital', description: 'Digital I/O line 1 (0-5V LVTTL)' },
  'daq-dio2':  { id: 'daq-dio2',  name: 'DIO2', pinNumber: 13, col: 38, type: 'digital', description: 'Digital I/O line 2 (0-5V LVTTL)' },
  'daq-dio3':  { id: 'daq-dio3',  name: 'DIO3', pinNumber: 14, col: 40, type: 'digital', description: 'Digital I/O line 3 (0-5V LVTTL)' },
  'daq-dio4':  { id: 'daq-dio4',  name: 'DIO4', pinNumber: 15, col: 42, type: 'digital', description: 'Digital I/O line 4 (0-5V LVTTL)' },
  'daq-dio5':  { id: 'daq-dio5',  name: 'DIO5', pinNumber: 16, col: 44, type: 'digital', description: 'Digital I/O line 5 (0-5V LVTTL)' },
  'daq-dio6':  { id: 'daq-dio6',  name: 'DIO6', pinNumber: 17, col: 46, type: 'digital', description: 'Digital I/O line 6 (0-5V LVTTL)' },
  'daq-dio7':  { id: 'daq-dio7',  name: 'DIO7', pinNumber: 18, col: 48, type: 'digital', description: 'Digital I/O line 7 (0-5V LVTTL)' },
  'daq-dgnd':  { id: 'daq-dgnd',  name: 'DGND', pinNumber: 19, col: 50, type: 'ground',  description: 'Digital Ground Reference (0V)' },
  'daq-v5v':   { id: 'daq-v5v',   name: '+5V',  pinNumber: 20, col: 52, type: 'power',   description: '+5V Digital Power Supply (100mA max)' },
};

export function getDaqPinInfo(id: string): DAQPinInfo | undefined {
  return DAQ_PIN_METADATA[id];
}

export function getContactAt(
  model: BreadboardModel,
  canvasX: number,
  canvasY: number,
  threshold = HOLE_SPACING / 2,
  includeDaq = true,
): BreadboardContact | null {
  let closest: BreadboardContact | null = null;
  let minDist = Infinity;
  
  for (const contact of model.contacts.values()) {
    const dx = canvasX - contact.position.x;
    const dy = canvasY - contact.position.y;
    
    if (contact.row === 'daq') {
      if (!includeDaq) continue;
      // DAQ pin card is ~26px wide by ~48px tall centered at (contact.position.x, contact.position.y)
      if (Math.abs(dx) <= 14 && Math.abs(dy) <= 24) {
        const dist = Math.hypot(dx, dy);
        if (dist < minDist) {
          minDist = dist;
          closest = contact;
        }
      }
    } else {
      // Fast bounding-box rejection — skip contacts clearly outside threshold
      const adx = dx < 0 ? -dx : dx;
      const ady = dy < 0 ? -dy : dy;
      if (adx > threshold || ady > threshold) continue;
      const dist = Math.hypot(dx, dy);
      if (dist <= threshold && dist < minDist) {
        minDist = dist;
        closest = contact;
      }
    }
  }
  
  return closest;
}

export function getContactsInNodeGroup(model: BreadboardModel, nodeGroup: string): BreadboardContact[] {
  const result: BreadboardContact[] = [];
  for (const contact of model.contacts.values()) {
    if (contact.nodeGroup === nodeGroup) {
      result.push(contact);
    }
  }
  return result;
}

export function getColumnLabel(col: number): string {
  return col.toString();
}

export function getRailLabel(railIndex: number): string {
  return railIndex % 2 === 0 ? '+' : '−';
}
