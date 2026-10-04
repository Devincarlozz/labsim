import {
  BreadboardModel,
  CircuitComponent,
  Wire,
  ViewTransform,
  ContactId,
  ICComponent,
  ResistorComponent,
  CapacitorComponent,
  DACComponent,
  LEDComponent,
  DiodeComponent,
  LEDColor,
  LogicState,
  IC_LIBRARY,
  WireId,
  ElectricalNode,
  NodeId,
  DAQSettings,
  PlacingComponent,
  ICType,
  BreadboardContact,
  Point,
} from '../model/types';
import { CircuitPhysicsResult } from '../simulation/circuitPhysics';
import { simEngine } from '../simulation/engine/SimEngine';
import {
  HOLE_RADIUS,
  HOLE_SPACING,
  BOARD_PADDING,
  BOARD_WIDTH,
  BOARD_HEIGHT,
  TERMINAL_COLS,
  TERMINAL_ROWS,
  RAIL_COLS,
  TOP_ROWS,
  CENTER_GAP,
} from '../model/breadboard';

// ─── Engineering Dashboard / White Surfaces Style ────────────────────────────

const C = {
  // Board
  boardBg: '#ffffff',
  boardBgGrad: '#f8fafc',
  boardEdge: '#e2e8f0',
  boardShadow: 'rgba(20, 39, 68, 0.08)',
  
  // Holes
  holeFill: '#0f172a',
  holeInner: '#020617',
  holeRim: '#cbd5e1',
  holeHighlight: '#1677e8',
  holeHover: '#eab308',
  holeOccupied: '#10b981',
  
  // Board features
  channelBg: '#f1f5f9',
  channelLine: '#e2e8f0',
  railPower: '#ef4444',
  railGround: '#1677e8',
  railPowerBg: 'rgba(239, 68, 68, 0.06)',
  railGroundBg: 'rgba(22, 119, 232, 0.06)',
  railSeparator: '#e2e8f0',
  labelText: '#64748b',
  
  // IC - Realistic black DIP
  icBody: '#1e293b',
  icBodyLight: '#334155',
  icBodyDark: '#0f172a',
  icPin: '#cbd5e1',
  icPinShine: '#f1f5f9',
  icText: '#ffffff',
  icNotch: '#475569',
  icDot: '#64748b',
  
  // Resistor - realistic axial banded
  resBody: '#d4a373',
  resBodyLight: '#e6c29c',
  resBodyDark: '#b08154',
  resLead: '#94a3b8',
  resLeadDark: '#64748b',
  
  // Capacitor - blue cylindrical
  capBody: '#1677e8',
  capBodyLight: '#3b82f6',
  capBodyDark: '#1d4ed8',
  capLead: '#94a3b8',
  capText: '#ffffff',
  
  // DAC header - black connector
  dacBody: '#18181b',
  dacBodyLight: '#27272a',
  dacPin: '#facc15',
  dacText: '#f8fafc',
  
  // Wires
  wireColors: [
    '#ef4444', '#1677e8', '#10b981', '#eab308', '#8b5cf6',
    '#334155', '#06b6d4', '#f97316', '#64748b', '#059669',
  ],
  wireGlow: 'rgba(22, 119, 232, 0.25)',
  wireSelected: '#1677e8',
  
  // Selection
  selBorder: '#1677e8',
  selFill: 'rgba(22, 119, 232, 0.08)',
  
  // Logic states
  high: '#10b981',
  low: '#ef4444',
  hiZ: '#94a3b8',
  unknown: '#eab308',
  
  // Canvas
  canvasBg: '#f7f9fc',
  canvasGrid: 'rgba(100, 116, 139, 0.06)',
};

// ─── Renderer ────────────────────────────────────────────────────────────────

export class CanvasRenderer {
  private ctx: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private dpr: number;

  // ─── Offscreen caches for static content ──────────────────────────
  private boardCache: OffscreenCanvas | null = null;
  private boardCacheCtx: OffscreenCanvasRenderingContext2D | null = null;
  private boardCacheDirty = true;
  private boardCacheKey = ''; // tracks breadboard identity to invalidate

  private gridCache: OffscreenCanvas | null = null;
  private gridCacheCtx: OffscreenCanvasRenderingContext2D | null = null;
  private gridCacheW = 0;
  private gridCacheH = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.dpr = window.devicePixelRatio || 1;
  }

  /** Call to force board cache rebuild (e.g. after component placement changes hole occupancy) */
  invalidateBoardCache() {
    this.boardCacheDirty = true;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    const canvas = this.ctx.canvas;
    canvas.width = width * this.dpr;
    canvas.height = height * this.dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Invalidate grid cache on resize
    this.gridCache = null;
  }

  render(
    breadboard: BreadboardModel,
    components: Map<string, CircuitComponent>,
    wires: Map<WireId, Wire>,
    transform: ViewTransform,
    hoveredContact: ContactId | null,
    wireStartContact: ContactId | null,
    mousePos: { x: number; y: number } | null,
    nodes: Map<NodeId, ElectricalNode>,
    selectedComponentId: string | null,
    daqSettings?: DAQSettings,
    placingComponent?: PlacingComponent | null,
    isCircuitActive?: boolean,
    physicsResult?: CircuitPhysicsResult,
  ) {
    const ctx = this.ctx;
    const { offsetX, offsetY, scale } = transform;
    const isDaqVisible = daqSettings?.visible !== false;

    // Clear with light canvas BG (#F7F9FC)
    ctx.fillStyle = C.canvasBg;
    ctx.fillRect(0, 0, this.width, this.height);

    // Dot grid — rendered into a cached offscreen canvas and blitted
    this.drawCachedGrid(ctx);

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    this.drawCachedBoard(ctx, breadboard);
    if (isDaqVisible) {
      this.drawDAQModule(ctx, breadboard, wires, daqSettings, isCircuitActive ?? (daqSettings?.enabled !== false));
    }
    this.drawWires(ctx, wires, breadboard, isDaqVisible);
    if (wireStartContact && mousePos) {
      this.drawActiveWire(ctx, breadboard, wireStartContact, mousePos, transform);
    }
    this.drawComponents(ctx, components, nodes, selectedComponentId, physicsResult, isCircuitActive ?? (daqSettings?.enabled !== false));
    if (placingComponent && mousePos) {
      this.drawPlacementPreview(ctx, breadboard, placingComponent, mousePos, transform);
    }
    this.drawContactHighlights(ctx, breadboard, hoveredContact, wireStartContact, isDaqVisible);

    ctx.restore();
  }

  // ─── Board ───────────────────────────────────────────────────────────────

  private drawBoard(ctx: CanvasRenderingContext2D, bb: BreadboardModel) {
    // 1. Board outer shadow
    ctx.save();
    ctx.shadowColor = C.boardShadow;
    ctx.shadowBlur = 18;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;

    // Board body - clean ABS off-white rounded card
    const grad = ctx.createLinearGradient(0, 0, 0, BOARD_HEIGHT);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, '#fafbfd');
    grad.addColorStop(1, '#f1f4f8');
    ctx.fillStyle = grad;
    this.roundRect(ctx, 0, 0, BOARD_WIDTH, BOARD_HEIGHT, 10);
    ctx.fill();

    // Side interlocking tabs (Tinkercad signature realism)
    // Left notch cutouts (inward dovetails)
    ctx.fillStyle = '#f1f4f8';
    this.roundRect(ctx, -1, 65, 7, 22, 2);
    ctx.fill();
    this.roundRect(ctx, -1, 225, 7, 22, 2);
    ctx.fill();

    // Right protruding tabs (outward dovetails)
    ctx.fillStyle = '#f8fafc';
    this.roundRect(ctx, BOARD_WIDTH - 3, 65, 9, 22, 3);
    ctx.fill();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    this.roundRect(ctx, BOARD_WIDTH - 3, 65, 9, 22, 3);
    ctx.stroke();

    this.roundRect(ctx, BOARD_WIDTH - 3, 225, 9, 22, 3);
    ctx.fill();
    this.roundRect(ctx, BOARD_WIDTH - 3, 225, 9, 22, 3);
    ctx.stroke();

    // Board outer border
    ctx.restore();
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1.2;
    this.roundRect(ctx, 0, 0, BOARD_WIDTH, BOARD_HEIGHT, 10);
    ctx.stroke();

    // 2. Modular strip seam lines (separating upper rail, terminal, and lower rail modules)
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    // Top seam
    ctx.beginPath();
    ctx.moveTo(12, 70);
    ctx.lineTo(BOARD_WIDTH - 12, 70);
    ctx.stroke();
    // Bottom seam
    ctx.beginPath();
    ctx.moveTo(12, 242);
    ctx.lineTo(BOARD_WIDTH - 12, 242);
    ctx.stroke();

    // 3. Center DIP Channel / Divider Strip (encompassing Row F)
    const topE = this.rowY('e');
    const botF = this.rowY('f');
    if (topE !== null && botF !== null) {
      const col1X = BOARD_PADDING + 20; // 60
      const col64X = col1X + (TERMINAL_COLS - 1) * HOLE_SPACING; // 942

      // Channel starts below Row E (y=150) and encompasses Row F (y=170) down to y=177
      const chY = topE + 8; // 150
      const chH = (botF - topE) + 7; // 35px -> spans y=150 to y=177 (Row F is at 170)
      
      const startX = 26;
      const endX = BOARD_WIDTH - 26;
      const spanW = endX - startX;

      // Recessed trough base encompassing Row F
      ctx.fillStyle = '#f1f5f9';
      this.roundRect(ctx, startX, chY, spanW, chH, 3);
      ctx.fill();

      // Top divider line (between Row E and Row F)
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(startX, chY);
      ctx.lineTo(endX, chY);
      ctx.stroke();

      // Bottom border line (between Row F and Row G)
      ctx.beginPath();
      ctx.moveTo(startX, chY + chH);
      ctx.lineTo(endX, chY + chH);
      ctx.stroke();

      // Center divider groove line between row E and row F
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(col1X - 6, 156);
      ctx.lineTo(col64X + 6, 156);
      ctx.stroke();

      // Molded mounting screw sockets in center channel (at col 16 and col 49)
      const screwCols = [16, 49];
      for (const sc of screwCols) {
        const sx = col1X + (sc - 1) * HOLE_SPACING;
        ctx.beginPath();
        ctx.arc(sx, 156, 3.8, 0, Math.PI * 2);
        ctx.fillStyle = '#cbd5e1';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(sx, 156, 2.6, 0, Math.PI * 2);
        ctx.fillStyle = '#94a3b8';
        ctx.fill();
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(sx - 1.2, 156);
        ctx.lineTo(sx + 1.2, 156);
        ctx.stroke();
      }

      // Subtle embossed text at right end of center trough
      ctx.font = '600 6.5px "Inter", sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText('830 TIE-POINTS', col64X, 156);
    }

    // 4. Power & Ground Rail Markings (+ and − continuous guide lines)
    this.drawRailStripes(ctx, bb);

    // 5. Column Numbers: 1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 64
    const specCols = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 64];
    ctx.font = '600 8.5px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const col of specCols) {
      const x = BOARD_PADDING + 20 + (col - 1) * HOLE_SPACING;
      // Top numbers (above Row A)
      const topY = this.rowY('a');
      if (topY !== null) ctx.fillText(String(col), x, topY - 11);
      // Bottom numbers (below Row J)
      const botY = this.rowY('j');
      if (botY !== null) ctx.fillText(String(col), x, botY + 11);
    }

    // 6. Row labels: A B C D E and F G H I J on BOTH left and right sides!
    ctx.font = 'bold 9px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textBaseline = 'middle';
    const col1X = BOARD_PADDING + 20;
    const col64X = col1X + (TERMINAL_COLS - 1) * HOLE_SPACING;
    const leftLabelX = col1X - 16;
    const rightLabelX = col64X + 16;

    for (const row of TERMINAL_ROWS) {
      const y = this.rowY(row);
      if (y !== null) {
        ctx.textAlign = 'center';
        ctx.fillText(row.toUpperCase(), leftLabelX, y);
        ctx.fillText(row.toUpperCase(), rightLabelX, y);
      }
    }

    // 7. Draw all holes (excluding DAQ terminals)
    for (const c of bb.contacts.values()) {
      if (c.row === 'daq') continue;
      this.drawHole(ctx, c.position.x, c.position.y, c.occupied,
        c.row === 'power' ? 'power' : c.row === 'ground' ? 'ground' : 'normal');
    }
  }

  // ─── Direct Board Interface (Single Horizontal Row matching User Design) ───

  private drawDAQModule(
    ctx: CanvasRenderingContext2D,
    bb: BreadboardModel,
    wires?: Map<WireId, Wire>,
    daqSettings?: DAQSettings,
    isCircuitActive: boolean = true,
  ) {
    const daqStartX = 222;
    const daqPitch = 28;
    const blockX = daqStartX - 24;
    const blockY = -62;
    const blockW = 19 * daqPitch + 48; // 580px
    const blockH = 58;

    // 1. Module Outer Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;

    // 2. Chassis Background (#060B14)
    ctx.fillStyle = '#060B14';
    this.roundRect(ctx, blockX, blockY, blockW, blockH, 6);
    ctx.fill();
    ctx.restore();

    // 3. Chassis Border (#1E293B)
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 1.5;
    this.roundRect(ctx, blockX, blockY, blockW, blockH, 6);
    ctx.stroke();

    // 4. Header Bar
    // Left: ANALOG & ±15V (1-10) in #38BDF8
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.fillStyle = '#38BDF8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('ANALOG & ±15V (1-10)', blockX + 10, blockY + 6);

    // Right: DIGITAL I/O & +5V (11-20) in #818CF8
    ctx.fillStyle = '#818CF8';
    ctx.textAlign = 'right';
    ctx.fillText('DIGITAL I/O & +5V (11-20)', blockX + blockW - 10, blockY + 6);

    // Center: Circuit Power Activation Toggle Switch (NI Hardware Bench Rocker)
    const toggleW = 160;
    const toggleH = 14;
    const toggleX = blockX + Math.round((blockW - toggleW) / 2);
    const toggleY = blockY + 3.5;

    // Toggle Bezel
    ctx.save();
    if (isCircuitActive) {
      ctx.shadowColor = 'rgba(34, 197, 94, 0.45)';
      ctx.shadowBlur = 8;
    }
    ctx.fillStyle = '#080E1A';
    this.roundRect(ctx, toggleX, toggleY, toggleW, toggleH, 3.5);
    ctx.fill();

    ctx.strokeStyle = isCircuitActive ? '#16A34A' : '#334155';
    ctx.lineWidth = 1;
    this.roundRect(ctx, toggleX, toggleY, toggleW, toggleH, 3.5);
    ctx.stroke();
    ctx.restore();

    // Power Indicator LED
    const ledX = toggleX + 9;
    const ledY = toggleY + toggleH / 2;
    ctx.save();
    ctx.beginPath();
    ctx.arc(ledX, ledY, 3, 0, Math.PI * 2);
    if (isCircuitActive) {
      ctx.shadowColor = '#22C55E';
      ctx.shadowBlur = 6;
      ctx.fillStyle = '#4ADE80';
    } else {
      ctx.fillStyle = '#EF4444';
    }
    ctx.fill();
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();

    // Label: "CIRCUIT POWER"
    ctx.font = 'bold 7.5px "JetBrains Mono", monospace';
    ctx.fillStyle = isCircuitActive ? '#F0FDF4' : '#94A3B8';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('CIRCUIT POWER', toggleX + 16, toggleY + toggleH / 2);

    // Pill Switch: [ ON / OFF ]
    const pillW = 34;
    const pillH = 10;
    const pillX = toggleX + toggleW - pillW - 3;
    const pillY = toggleY + 2;

    ctx.fillStyle = isCircuitActive ? '#14532D' : '#1E293B';
    this.roundRect(ctx, pillX, pillY, pillW, pillH, 2.5);
    ctx.fill();
    ctx.strokeStyle = isCircuitActive ? '#22C55E' : '#475569';
    ctx.lineWidth = 0.6;
    this.roundRect(ctx, pillX, pillY, pillW, pillH, 2.5);
    ctx.stroke();

    // Switch slider knob & text
    const knobW = 16;
    const knobH = 8;
    const knobX = isCircuitActive ? (pillX + pillW - knobW - 1) : (pillX + 1);
    const knobY = pillY + 1;

    ctx.fillStyle = isCircuitActive ? '#22C55E' : '#64748B';
    this.roundRect(ctx, knobX, knobY, knobW, knobH, 2);
    ctx.fill();

    ctx.font = 'bold 6.5px "JetBrains Mono", monospace';
    ctx.fillStyle = isCircuitActive ? '#052E16' : '#F1F5F9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isCircuitActive ? 'ON' : 'OFF', knobX + knobW / 2, knobY + knobH / 2);

    // Terminal Pin Labels & Groups (Exact 1:1 match)
    const pinLabels: Record<string, { label: string; color: string; num: number; isDio?: boolean; dioIdx?: number }> = {
      'daq-p15v':  { label: '+15V', color: '#FF4D6D', num: 1 },
      'daq-n15v':  { label: '-15V', color: '#FF4D6D', num: 2 },
      'daq-agnd1': { label: 'AGND', color: '#38BDF8', num: 3 },
      'daq-ao0':   { label: 'AO 0', color: '#FACC15', num: 4 },
      'daq-ao1':   { label: 'AO 1', color: '#FACC15', num: 5 },
      'daq-agnd2': { label: 'AGND', color: '#38BDF8', num: 6 },
      'daq-ai0_p': { label: 'AI0+', color: '#22C55E', num: 7 },
      'daq-ai0_m': { label: 'AI0-', color: '#22C55E', num: 8 },
      'daq-ai1_p': { label: 'AI1+', color: '#22C55E', num: 9 },
      'daq-ai1_m': { label: 'AI1-', color: '#22C55E', num: 10 },
      'daq-dio0':  { label: 'DIO0', color: '#F1F5F9', num: 11, isDio: true, dioIdx: 0 },
      'daq-dio1':  { label: 'DIO1', color: '#F1F5F9', num: 12, isDio: true, dioIdx: 1 },
      'daq-dio2':  { label: 'DIO2', color: '#F1F5F9', num: 13, isDio: true, dioIdx: 2 },
      'daq-dio3':  { label: 'DIO3', color: '#F1F5F9', num: 14, isDio: true, dioIdx: 3 },
      'daq-dio4':  { label: 'DIO4', color: '#F1F5F9', num: 15, isDio: true, dioIdx: 4 },
      'daq-dio5':  { label: 'DIO5', color: '#F1F5F9', num: 16, isDio: true, dioIdx: 5 },
      'daq-dio6':  { label: 'DIO6', color: '#F1F5F9', num: 17, isDio: true, dioIdx: 6 },
      'daq-dio7':  { label: 'DIO7', color: '#F1F5F9', num: 18, isDio: true, dioIdx: 7 },
      'daq-dgnd':  { label: 'DGND', color: '#38BDF8', num: 19 },
      'daq-v5v':   { label: '+5V',  color: '#FF4D6D', num: 20 },
    };

    // DIO states matching current store pattern
    const currentDioStates = daqSettings?.dioBits ?? [0, 0, 0, 0, 0, 0, 0, 0];

    // 5. Draw 20 Terminal Cards
    for (const c of bb.contacts.values()) {
      if (c.row !== 'daq') continue;
      const x = c.position.x;
      const y = c.position.y;
      const info = pinLabels[c.id] || { label: 'PIN', color: '#94A3B8', num: 0 };

      // Find wire connected to this pin (if any)
      let connectedWire: Wire | undefined;
      if (wires) {
        for (const w of wires.values()) {
          if (w.startContactId === c.id || w.endContactId === c.id) {
            connectedWire = w;
            break;
          }
        }
      }
      const isWired = Boolean(connectedWire || c.occupied);
      const wireColor = connectedWire ? connectedWire.color : (c.id === 'daq-p15v' ? '#F59E0B' : '#0284C7');

      // Find other end label for badge
      let targetLabel: string | null = null;
      if (connectedWire) {
        const otherId = connectedWire.startContactId === c.id ? connectedWire.endContactId : connectedWire.startContactId;
        if (otherId.startsWith('r-0-')) targetLabel = 'Rail+...';
        else if (otherId.startsWith('r-1-')) targetLabel = 'Rail−...';
        else if (otherId.startsWith('t-')) targetLabel = otherId.replace('t-', '');
        else targetLabel = otherId.replace('daq-', '');
      }

      // Card Background (#0A101D with subtle border #1A2333)
      const cardW = 25;
      const cardH = 38;
      const cardX = x - cardW / 2;
      const cardY = blockY + 17;

      ctx.fillStyle = '#0A101D';
      this.roundRect(ctx, cardX, cardY, cardW, cardH, 4);
      ctx.fill();

      ctx.strokeStyle = isWired ? '#1E2D4A' : '#1A2333';
      ctx.lineWidth = 1;
      this.roundRect(ctx, cardX, cardY, cardW, cardH, 4);
      ctx.stroke();

      // Pin Name text (top of card)
      ctx.font = 'bold 7.5px "JetBrains Mono", monospace';
      ctx.fillStyle = info.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(info.label, x, cardY + 2.5);

      // Metallic Phillips Cross Screw Head
      const screwY = cardY + 13.5;
      const screwR = 4.8;

      ctx.save();
      const screwGrad = ctx.createRadialGradient(x - 1, screwY - 1, 0.5, x, screwY, screwR);
      screwGrad.addColorStop(0, '#F1F5F9');
      screwGrad.addColorStop(0.55, '#94A3B8');
      screwGrad.addColorStop(1, '#475569');
      ctx.fillStyle = screwGrad;
      ctx.beginPath();
      ctx.arc(x, screwY, screwR, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 0.5;
      ctx.stroke();

      // Phillips cross groove (+)
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 2.8, screwY);
      ctx.lineTo(x + 2.8, screwY);
      ctx.moveTo(x, screwY - 2.8);
      ctx.lineTo(x, screwY + 2.8);
      ctx.stroke();
      ctx.restore();

      // Clamp Socket Port
      const clampW = 11;
      const clampH = 7.5;
      const clampX = x - clampW / 2;
      const clampY = cardY + 20;

      ctx.fillStyle = '#030712';
      this.roundRect(ctx, clampX, clampY, clampW, clampH, 1.8);
      ctx.fill();

      // Glowing socket border when connected
      ctx.strokeStyle = isWired ? wireColor : '#24314C';
      ctx.lineWidth = isWired ? 1.2 : 0.8;
      this.roundRect(ctx, clampX, clampY, clampW, clampH, 1.8);
      ctx.stroke();

      // Solid color dot inside socket when connected
      if (isWired) {
        ctx.fillStyle = wireColor;
        this.roundRect(ctx, x - 1.8, clampY + 2, 3.6, 3.6, 1);
        ctx.fill();
      }

      // Bottom Element (Badge / DIO pill / Terminal number)
      const botY = cardY + 29.5;
      if (isWired && targetLabel && !info.isDio) {
        // Green badge with destination text (e.g. Rail+...)
        const bgW = 21;
        const bgH = 7;
        const bgX = x - bgW / 2;

        ctx.fillStyle = '#022C22';
        this.roundRect(ctx, bgX, botY, bgW, bgH, 2);
        ctx.fill();

        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 0.5;
        this.roundRect(ctx, bgX, botY, bgW, bgH, 2);
        ctx.stroke();

        ctx.font = 'bold 5.5px "JetBrains Mono", monospace';
        ctx.fillStyle = '#34D399';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(targetLabel, x, botY + 3.5);
      } else if (info.isDio && info.dioIdx !== undefined) {
        // Digital 0 / 1 Logic State Pill
        const snap = simEngine.getSnapshot();
        const dioDirections = daqSettings?.dioDirection ?? [true, true, true, true, false, false, false, false];
        const isDaqEnabled = daqSettings?.enabled !== false;
        const isInput = dioDirections[info.dioIdx] === false;
        const bit = !isDaqEnabled ? 0 : isInput
          ? (snap.daq.di[info.dioIdx] === 1 ? 1 : 0)
          : (currentDioStates[info.dioIdx] === 1 ? 1 : 0);
        const isHigh = bit === 1;
        const pillW = 10;
        const pillH = 7;
        const pillX = x - pillW / 2;

        ctx.fillStyle = isHigh ? '#22C55E' : '#1E293B';
        this.roundRect(ctx, pillX, botY, pillW, pillH, 1.8);
        ctx.fill();

        ctx.font = 'bold 6.5px "JetBrains Mono", monospace';
        ctx.fillStyle = isHigh ? '#052E16' : '#94A3B8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(bit.toString(), x, botY + 3.5);
      } else {
        // Muted pin index number
        ctx.font = 'bold 6.5px "JetBrains Mono", monospace';
        ctx.fillStyle = '#475569';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(info.num.toString(), x, botY + 0.5);
      }
    }
  }

  private drawRailStripes(ctx: CanvasRenderingContext2D, _bb: BreadboardModel) {
    const col1X = BOARD_PADDING + 20;
    const col64X = col1X + (TERMINAL_COLS - 1) * HOLE_SPACING;
    const startX = col1X - 10;
    const endX = col64X + 10;

    // Y positions of rail contact rows:
    // Rail 0 (top power): y = 40
    // Rail 1 (top ground): y = 54
    // Rail 2 (bottom power): y = 258
    // Rail 3 (bottom ground): y = 272
    const topPowerY = BOARD_PADDING; // 40
    const topGroundY = BOARD_PADDING + HOLE_SPACING; // 54
    const botPowerY = 258;
    const botGroundY = 272;

    const redColor = '#ef4444';
    const blueColor = '#2563eb';

    // Helper to draw a crisp continuous guide line with terminal + / − symbols
    const drawRailLine = (y: number, color: string, symbol: string) => {
      // Continuous solid line
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(startX, y);
      ctx.lineTo(endX, y);
      ctx.stroke();

      // Bold + / − markings at both ends
      ctx.font = 'bold 12px "Inter", sans-serif';
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(symbol, startX - 12, y);
      ctx.fillText(symbol, endX + 12, y);
    };

    // Top rails:
    // Red line ABOVE top power holes (y = 40 - 9 = 31)
    drawRailLine(topPowerY - 9, redColor, '+');
    // Blue line BELOW top ground holes (y = 54 + 9 = 63)
    drawRailLine(topGroundY + 9, blueColor, '−');

    // Bottom rails:
    // Red line ABOVE bottom power holes (y = 258 - 9 = 249)
    drawRailLine(botPowerY - 9, redColor, '+');
    // Blue line BELOW bottom ground holes (y = 272 + 9 = 281)
    drawRailLine(botGroundY + 9, blueColor, '−');
  }

  private drawHole(ctx: CanvasRenderingContext2D, x: number, y: number, occupied: boolean, _type: 'normal' | 'power' | 'ground') {
    // 1. Outer square socket indentation (chamfered socket recessed in ABS plastic)
    const sw = 7.6;
    const sh = 7.6;
    const sx = x - sw / 2;
    const sy = y - sh / 2;

    ctx.fillStyle = '#e5e9f0';
    this.roundRect(ctx, sx, sy, sw, sh, 1.2);
    ctx.fill();

    // Subtle recessed socket bevel shadow (top/left) and highlight (bottom/right)
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(sx + sw, sy);
    ctx.lineTo(sx, sy);
    ctx.lineTo(sx, sy + sh);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.moveTo(sx + sw, sy);
    ctx.lineTo(sx + sw, sy + sh);
    ctx.lineTo(sx, sy + sh);
    ctx.stroke();

    // 2. Inner hole socket cavity (the dark rectangular opening)
    const hw = 4.4;
    const hh = 4.4;
    const hx = x - hw / 2;
    const hy = y - hh / 2;

    // Dark cavity background
    ctx.fillStyle = '#141822';
    this.roundRect(ctx, hx, hy, hw, hh, 0.8);
    ctx.fill();

    // Cavity top shadow
    ctx.fillStyle = '#090c12';
    ctx.fillRect(hx + 0.3, hy, hw - 0.6, 1.5);

    // 3. Internal phosphor-bronze / nickel spring clips or seated component pin
    if (occupied) {
      // Metallic component lead firmly plugged into the socket hole
      const pinGrad = ctx.createRadialGradient(x - 0.6, y - 0.6, 0.4, x, y, 1.9);
      pinGrad.addColorStop(0, '#f8fafc');
      pinGrad.addColorStop(0.45, '#cbd5e1');
      pinGrad.addColorStop(1, '#475569');
      ctx.fillStyle = pinGrad;
      ctx.beginPath();
      ctx.arc(x, y, 1.7, 0, Math.PI * 2);
      ctx.fill();

      // Subtle metallic highlight ring around seated pin lead
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    } else {
      ctx.fillStyle = '#64748b';
      ctx.fillRect(x - 1.4, y - 1.3, 0.65, 2.6);
      ctx.fillRect(x + 0.75, y - 1.3, 0.65, 2.6);

      // Metallic specular glint on contact leaf
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(x - 1.4, y - 0.5, 0.65, 0.9);
      ctx.fillRect(x + 0.75, y - 0.5, 0.65, 0.9);
    }
  }

  // ─── Placement Preview (Ghost component + target socket highlights) ────────

  private drawPlacementPreview(
    ctx: CanvasRenderingContext2D,
    bb: BreadboardModel,
    placingComponent: PlacingComponent,
    mousePos: { x: number; y: number },
    transform: ViewTransform,
  ) {
    const { offsetX, offsetY, scale } = transform;
    const canvasX = (mousePos.x - offsetX) / scale;
    const canvasY = (mousePos.y - offsetY) / scale;

    const col1X = BOARD_PADDING + 20; // 60
    const is8Pin = placingComponent === 'NE555' || placingComponent === 'LM741' || placingComponent === '741' || (placingComponent as string) === 'IC741';
    const isIC = ['74HC00', '74HC02', '74HC04', '74HC08', '74HC32', '74HC86', '74HC74', '7400', '7402', '7404', '7408', '7432', '7486', '7474', 'NE555', 'LM741', '741', 'IC741'].includes(placingComponent as string);
    const isDiode = placingComponent === 'diode' || placingComponent === '1N4001' || placingComponent === 'IN4001';

    let anchorPos: Point;
    const targetContacts: BreadboardContact[] = [];

    if (isIC) {
      const colIndex = Math.round((canvasX - col1X) / HOLE_SPACING);
      const halfPins = is8Pin ? 4 : 7;
      const clampedCol = Math.max(0, Math.min(TERMINAL_COLS - halfPins, colIndex));
      anchorPos = { x: col1X + clampedCol * HOLE_SPACING, y: 142 }; // Row E

      // Collect target contacts for bottom row (Row F) and top row (Row E)
      for (let i = 0; i < halfPins; i++) {
        const topHole = bb.contacts.get(`t-e-${clampedCol + 1 + i}`);
        const botHole = bb.contacts.get(`t-f-${clampedCol + 1 + i}`);
        if (topHole) targetContacts.push(topHole);
        if (botHole) targetContacts.push(botHole);
      }
    } else {
      // Find nearest contact
      let closestC: BreadboardContact | null = null;
      let minD = Infinity;
      for (const c of bb.contacts.values()) {
        if (c.row === 'daq') continue;
        const d = Math.hypot(canvasX - c.position.x, canvasY - c.position.y);
        if (d < minD) {
          minD = d;
          closestC = c;
        }
      }

      if (!closestC) return;

      const isLED = placingComponent === 'led' || (typeof placingComponent === 'string' && placingComponent.startsWith('led-'));
      if (placingComponent === 'resistor' || isDiode) {
        const clampedCol = Math.max(1, Math.min(60, closestC.col));
        anchorPos = { x: col1X + (clampedCol - 1) * HOLE_SPACING, y: closestC.position.y };
        const h1 = closestC;
        const h2 = bb.contacts.get(closestC.id.startsWith('r-') ? `r-${closestC.id.split('-')[1]}-${clampedCol + 4}` : `t-${closestC.row}-${clampedCol + 4}`);
        if (h1) targetContacts.push(h1);
        if (h2) targetContacts.push(h2);
      } else if (placingComponent === 'capacitor' || isLED) {
        const clampedCol = Math.max(1, Math.min(63, closestC.col));
        anchorPos = { x: col1X + (clampedCol - 1) * HOLE_SPACING, y: closestC.position.y };
        const h1 = closestC;
        const h2 = bb.contacts.get(closestC.id.startsWith('r-') ? `r-${closestC.id.split('-')[1]}-${clampedCol + 1}` : `t-${closestC.row}-${clampedCol + 1}`);
        if (h1) targetContacts.push(h1);
        if (h2) targetContacts.push(h2);
      } else if (placingComponent === 'dac') {
        let targetY = closestC.position.y;
        if (closestC.position.y >= 125 && closestC.position.y <= 150) targetY = 114;
        else if (closestC.position.y >= 205) targetY = 198;
        anchorPos = { x: closestC.position.x, y: targetY };
        for (let i = 0; i < 3; i++) {
          const cy = targetY + i * 14;
          for (const c of bb.contacts.values()) {
            if (c.row === 'daq') continue;
            if (Math.abs(c.position.x - anchorPos.x) < 2 && Math.abs(c.position.y - cy) < 2) {
              targetContacts.push(c);
            }
          }
        }
      } else {
        anchorPos = { x: closestC.position.x, y: closestC.position.y };
      }
    }

    // 1. Highlight target breadboard contacts with glowing green rings
    ctx.save();
    for (const c of targetContacts) {
      ctx.beginPath();
      ctx.arc(c.position.x, c.position.y, HOLE_RADIUS + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 2.2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(c.position.x, c.position.y, HOLE_RADIUS + 1, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(16, 185, 129, 0.35)';
      ctx.fill();
    }

    // 2. Draw ghost component preview
    ctx.globalAlpha = 0.72;
    ctx.translate(anchorPos.x, anchorPos.y);

    const isLEDPreview = placingComponent === 'led' || (typeof placingComponent === 'string' && placingComponent.startsWith('led-'));

    if (isIC) {
      this.drawIC(ctx, {
        id: 'preview',
        type: 'ic',
        icType: placingComponent as ICType,
        position: anchorPos,
        rotation: 0,
        pins: [],
        selected: false,
      }, false);
    } else if (placingComponent === 'resistor') {
      this.drawResistor(ctx, {
        id: 'preview',
        type: 'resistor',
        position: anchorPos,
        rotation: 0,
        resistance: 1000,
        unit: 'Ω',
        pins: [],
        selected: false,
      }, false);
    } else if (isDiode) {
      this.drawDiode(ctx, {
        id: 'preview',
        type: 'diode',
        position: anchorPos,
        rotation: 0,
        pins: [],
        selected: false,
        model: '1N4001',
      } as DiodeComponent, false);
    } else if (placingComponent === 'capacitor') {
      this.drawCapacitor(ctx, {
        id: 'preview',
        type: 'capacitor',
        position: anchorPos,
        rotation: 0,
        capacitance: 100,
        unit: 'nF',
        pins: [],
        selected: false,
      }, false);
    } else if (isLEDPreview) {
      let color: LEDColor = 'red';
      const compStr = placingComponent as string;
      if (compStr === 'led-green') color = 'green';
      else if (compStr === 'led-blue') color = 'blue';
      else if (compStr === 'led-yellow') color = 'yellow';
      else if (compStr === 'led-purple' || compStr === 'led-violet') color = 'violet';

      const defaultVf = color === 'red' ? 1.8 : color === 'green' ? 2.1 : color === 'blue' ? 3.2 : color === 'violet' ? 3.4 : 2.0;

      this.drawLED(ctx, {
        id: 'preview',
        type: 'led',
        color,
        label: `${color.toUpperCase()} LED`,
        forwardVoltage: defaultVf,
        position: anchorPos,
        rotation: 0,
        pins: [],
        selected: false,
      }, false);
    } else if (placingComponent === 'dac') {
      this.drawDAC(ctx, {
        id: 'preview',
        type: 'dac',
        position: anchorPos,
        rotation: 0,
        pins: [],
        selected: false,
      }, false);
    }

    ctx.restore();
  }

  private drawContactHighlights(
    ctx: CanvasRenderingContext2D,
    bb: BreadboardModel,
    hovered: ContactId | null,
    wireStart: ContactId | null,
    isDaqVisible: boolean = true,
  ) {
    if (hovered) {
      const c = bb.contacts.get(hovered);
      if (c && (isDaqVisible || c.row !== 'daq')) {
        // Hover ring
        ctx.beginPath();
        ctx.arc(c.position.x, c.position.y, HOLE_RADIUS + 4, 0, Math.PI * 2);
        ctx.strokeStyle = C.holeHover;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Highlight same node group
        for (const other of bb.contacts.values()) {
          if (other.nodeGroup === c.nodeGroup && other.id !== hovered) {
            if (!isDaqVisible && other.row === 'daq') continue;
            ctx.beginPath();
            ctx.arc(other.position.x, other.position.y, HOLE_RADIUS + 2.5, 0, Math.PI * 2);
            ctx.strokeStyle = C.holeHighlight;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.35;
            ctx.stroke();
            ctx.globalAlpha = 1;
          }
        }
      }
    }

    if (wireStart) {
      const c = bb.contacts.get(wireStart);
      if (c && (isDaqVisible || c.row !== 'daq')) {
        // Pulsing glow
        ctx.beginPath();
        ctx.arc(c.position.x, c.position.y, HOLE_RADIUS + 6, 0, Math.PI * 2);
        ctx.strokeStyle = C.holeHighlight;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.4;
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.beginPath();
        ctx.arc(c.position.x, c.position.y, HOLE_RADIUS + 3, 0, Math.PI * 2);
        ctx.strokeStyle = C.holeHighlight;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }
  }

  // ─── Wires ───────────────────────────────────────────────────────────────

  private drawWires(
    ctx: CanvasRenderingContext2D,
    wires: Map<WireId, Wire>,
    bb: BreadboardModel,
    isDaqVisible: boolean = true,
  ) {
    for (const wire of wires.values()) {
      const s = bb.contacts.get(wire.startContactId);
      const e = bb.contacts.get(wire.endContactId);
      if (!s || !e) continue;

      if (!isDaqVisible && (s.row === 'daq' || e.row === 'daq')) {
        continue;
      }

      const sp = s.position, ep = e.position;
      const dx = ep.x - sp.x, dy = ep.y - sp.y;

      // Wire shadow
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.15)';
      ctx.shadowBlur = 3;
      ctx.shadowOffsetY = 2;

      // Manhattan routing
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      if (Math.abs(dx) > Math.abs(dy)) {
        const mx = sp.x + dx / 2;
        ctx.lineTo(mx, sp.y);
        ctx.lineTo(mx, ep.y);
      } else {
        const my = sp.y + dy / 2;
        ctx.lineTo(sp.x, my);
        ctx.lineTo(ep.x, my);
      }
      ctx.lineTo(ep.x, ep.y);

      // Thick colored wire with rounded ends
      ctx.strokeStyle = wire.selected ? C.wireSelected : wire.color;
      ctx.lineWidth = wire.selected ? 3.5 : 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();

      // Solder blobs at endpoints
      for (const p of [sp, ep]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = wire.selected ? C.wireSelected : wire.color;
        ctx.fill();
        // Shine
        ctx.beginPath();
        ctx.arc(p.x - 0.8, p.y - 0.8, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fill();
      }

      // Selection glow
      if (wire.selected) {
        ctx.beginPath();
        ctx.moveTo(sp.x, sp.y);
        if (Math.abs(dx) > Math.abs(dy)) {
          const mx = sp.x + dx / 2;
          ctx.lineTo(mx, sp.y); ctx.lineTo(mx, ep.y);
        } else {
          const my = sp.y + dy / 2;
          ctx.lineTo(sp.x, my); ctx.lineTo(ep.x, my);
        }
        ctx.lineTo(ep.x, ep.y);
        ctx.strokeStyle = C.wireGlow;
        ctx.lineWidth = 10;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
    }
  }

  private drawActiveWire(
    ctx: CanvasRenderingContext2D,
    bb: BreadboardModel,
    startId: ContactId,
    mousePos: { x: number; y: number },
    transform: ViewTransform,
  ) {
    const sc = bb.contacts.get(startId);
    if (!sc) return;
    const endX = (mousePos.x - transform.offsetX) / transform.scale;
    const endY = (mousePos.y - transform.offsetY) / transform.scale;

    ctx.beginPath();
    ctx.moveTo(sc.position.x, sc.position.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = C.holeHighlight;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 5]);
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // ─── Components ──────────────────────────────────────────────────────────

  private drawComponents(
    ctx: CanvasRenderingContext2D,
    comps: Map<string, CircuitComponent>,
    nodes: Map<NodeId, ElectricalNode>,
    selectedId: string | null,
    physicsResult?: CircuitPhysicsResult,
    isCircuitActive: boolean = true,
  ) {
    for (const comp of comps.values()) {
      ctx.save();
      ctx.translate(comp.position.x, comp.position.y);
      ctx.rotate((comp.rotation * Math.PI) / 180);

      const sel = comp.id === selectedId;
      switch (comp.type) {
        case 'ic':       this.drawIC(ctx, comp as ICComponent, sel); break;
        case 'resistor': this.drawResistor(ctx, comp as ResistorComponent, sel); break;
        case 'capacitor':this.drawCapacitor(ctx, comp as CapacitorComponent, sel); break;
        case 'dac':      this.drawDAC(ctx, comp as DACComponent, sel); break;
        case 'led':      this.drawLED(ctx, comp as LEDComponent, sel, nodes, physicsResult, isCircuitActive); break;
        case 'diode':    this.drawDiode(ctx, comp as DiodeComponent, sel, physicsResult, isCircuitActive); break;
      }
      ctx.restore();
    }
  }

  // ─── IC (Tinkercad Realistic Horizontal DIP Package matching Image 2) ───

  private drawIC(ctx: CanvasRenderingContext2D, ic: ICComponent, sel: boolean) {
    const info = IC_LIBRARY[ic.icType] || { pinCount: 14, gateFunction: 'Gate' };
    const half = info.pinCount / 2;
    const pinSpacing = HOLE_SPACING; // 14px
    
    // Body dimensions:
    // Top row of pins enters row e at y = 0, bottom row enters row f at y = 28
    // Body is centered vertically between the two pin rows (y = 3.5 to y = 24.5)
    const bodyY = 3.5;
    const bodyH = 21;
    const bodyMargin = 8;
    const bodyX = -bodyMargin;
    const bodyW = (half - 1) * pinSpacing + bodyMargin * 2;

    // 1. Draw Metallic DIP Leads (Behind Body)
    for (let i = 0; i < half; i++) {
      const px = i * pinSpacing;
      // Top pin (leads from bodyY up to y = 0 hole)
      this.drawDIPPin(ctx, px, bodyY, 0, 'top');
      // Bottom pin (leads from bodyY + bodyH down to y = 28 hole)
      this.drawDIPPin(ctx, px, bodyY + bodyH, 28, 'bottom');
    }

    // 2. Chip Drop Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.42)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 3;

    // 3. Chip Body (Matte dark charcoal plastic with subtle gradient)
    const bodyGrad = ctx.createLinearGradient(bodyX, bodyY, bodyX, bodyY + bodyH);
    bodyGrad.addColorStop(0, '#2b313a');
    bodyGrad.addColorStop(0.15, '#22272e');
    bodyGrad.addColorStop(0.85, '#191d22');
    bodyGrad.addColorStop(1, '#14171a');
    ctx.fillStyle = bodyGrad;
    this.roundRect(ctx, bodyX, bodyY, bodyW, bodyH, 3);
    ctx.fill();
    ctx.restore();

    // 4. Subtle top and edge bevel highlights
    ctx.strokeStyle = '#383f4a';
    ctx.lineWidth = 0.8;
    this.roundRect(ctx, bodyX, bodyY, bodyW, bodyH, 3);
    ctx.stroke();

    // Top surface sheen line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(bodyX + 3, bodyY + 1);
    ctx.lineTo(bodyX + bodyW - 3, bodyY + 1);
    ctx.stroke();

    // 5. Orientation Notch on left edge
    const notchR = 3.5;
    const notchY = bodyY + bodyH / 2;
    ctx.beginPath();
    ctx.arc(bodyX, notchY, notchR, -Math.PI / 2, Math.PI / 2, false);
    ctx.fillStyle = '#14171a';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // 6. Injection Moulding Dimples (as seen in Image 2)
    const dimpleR = 3.2;
    const leftDimpleX = bodyX + 11;
    const rightDimpleX = bodyX + bodyW - 11;
    
    // Left dimple
    ctx.beginPath();
    ctx.arc(leftDimpleX, notchY, dimpleR, 0, Math.PI * 2);
    ctx.fillStyle = '#181c21';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // Right dimple
    ctx.beginPath();
    ctx.arc(rightDimpleX, notchY, dimpleR, 0, Math.PI * 2);
    ctx.fillStyle = '#181c21';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 0.6;
    ctx.stroke();

    // 7. IC Type Label ("74HC08" in clean bold white, centered)
    ctx.font = '700 11px "Inter", "Segoe UI", -apple-system, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(ic.icType, bodyX + bodyW / 2, notchY);

    // 8. Pin Numbers (Bottom: 1..half, Top: pinCount..half+1)
    ctx.font = 'bold 5.5px "JetBrains Mono", monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < half; i++) {
      const px = i * pinSpacing;
      const bottomPinNum = i + 1;
      const topPinNum = info.pinCount - i;

      // Bottom pin number (Pins 1..7 for DIP-14)
      ctx.fillText(String(bottomPinNum), px, bodyY + bodyH - 3.8);

      // Top pin number (Pins 14..8 for DIP-14)
      ctx.fillText(String(topPinNum), px, bodyY + 3.8);
    }

    // 9. Selection Outline
    if (sel) {
      ctx.strokeStyle = C.selBorder;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      this.roundRect(ctx, bodyX - 4, -4, bodyW + 8, 36, 4);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.selFill;
      this.roundRect(ctx, bodyX - 4, -4, bodyW + 8, 36, 4);
      ctx.fill();
    }
  }

  private drawDIPPin(ctx: CanvasRenderingContext2D, px: number, startY: number, endY: number, side: 'top' | 'bottom') {
    const shoulderW = 5.2;
    const pinW = 3.2;
    const shoulderH = side === 'top' ? -2.2 : 2.2;
    
    ctx.save();
    
    // Pin shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;

    // Pin body polygon (wider shoulder emerging from body, tapering into tip entering hole)
    ctx.beginPath();
    if (side === 'top') {
      ctx.moveTo(px - shoulderW / 2, startY);
      ctx.lineTo(px - shoulderW / 2, startY + shoulderH);
      ctx.lineTo(px - pinW / 2, endY - 0.5);
      ctx.arc(px, endY - 0.5, pinW / 2, Math.PI, 0, false);
      ctx.lineTo(px + shoulderW / 2, startY + shoulderH);
      ctx.lineTo(px + shoulderW / 2, startY);
    } else {
      ctx.moveTo(px - shoulderW / 2, startY);
      ctx.lineTo(px - shoulderW / 2, startY + shoulderH);
      ctx.lineTo(px - pinW / 2, endY + 0.5);
      ctx.arc(px, endY + 0.5, pinW / 2, 0, Math.PI, false);
      ctx.lineTo(px + shoulderW / 2, startY + shoulderH);
      ctx.lineTo(px + shoulderW / 2, startY);
    }
    ctx.closePath();

    // Metallic gradient across pin
    const pGrad = ctx.createLinearGradient(px - shoulderW / 2, 0, px + shoulderW / 2, 0);
    pGrad.addColorStop(0, '#94a3b8');
    pGrad.addColorStop(0.3, '#f8fafc');
    pGrad.addColorStop(0.6, '#cbd5e1');
    pGrad.addColorStop(1, '#64748b');
    ctx.fillStyle = pGrad;
    ctx.fill();

    ctx.restore();

    // Pin contour outline
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  // ─── Resistor (Tinkercad Realistic Axial Dumbbell matching Breadboard Sockets) ──

  private drawResistor(ctx: CanvasRenderingContext2D, res: ResistorComponent, sel: boolean) {
    const span = 56; // 4 breadboard columns = 56px exactly
    const bodyW = 28; // body width
    const bodyX = (span - bodyW) / 2; // centered at x = 14 to 42
    const bulbW = 6.5;
    const bulbH = 12.5;
    const waistH = 9.5;
    const waistW = bodyW - bulbW * 2; // 15px

    // 1. Metallic Lead Wires (entering breadboard holes at (0, 0) and (span, 0))
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1.5;

    // Specular lead wire gradient
    const leadGrad = ctx.createLinearGradient(0, -1, 0, 1);
    leadGrad.addColorStop(0, '#cbd5e1');
    leadGrad.addColorStop(0.5, '#f8fafc');
    leadGrad.addColorStop(1, '#64748b');

    ctx.strokeStyle = leadGrad;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';

    // Left lead from hole (0, 0) into resistor body (bodyX, 0)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(bodyX + 2, 0);
    ctx.stroke();

    // Right lead from resistor body (bodyX + bodyW, 0) into hole (span, 0)
    ctx.beginPath();
    ctx.moveTo(bodyX + bodyW - 2, 0);
    ctx.lineTo(span, 0);
    ctx.stroke();

    // 2. Resistor Body Drop Shadow
    ctx.shadowColor = 'rgba(15, 23, 42, 0.35)';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2.5;

    // 3. Dumbbell / Dog-Bone Axial Resistor Body Shape
    ctx.beginPath();
    // Left bulb end cap
    ctx.arc(bodyX + bulbW / 2, 0, bulbH / 2, Math.PI / 2, (3 * Math.PI) / 2);
    // Upper taper to waist
    ctx.quadraticCurveTo(bodyX + bulbW + 1, -waistH / 2, bodyX + bulbW + 3, -waistH / 2);
    // Upper waist
    ctx.lineTo(bodyX + bulbW + waistW - 3, -waistH / 2);
    // Upper flare to right bulb
    ctx.quadraticCurveTo(bodyX + bodyW - bulbW - 1, -waistH / 2, bodyX + bodyW - bulbW / 2, -bulbH / 2);
    // Right bulb end cap
    ctx.arc(bodyX + bodyW - bulbW / 2, 0, bulbH / 2, (3 * Math.PI) / 2, Math.PI / 2);
    // Lower flare from right bulb to waist
    ctx.quadraticCurveTo(bodyX + bodyW - bulbW - 1, waistH / 2, bodyX + bulbW + waistW - 3, waistH / 2);
    // Lower waist
    ctx.lineTo(bodyX + bulbW + 3, waistH / 2);
    // Lower taper to left bulb
    ctx.quadraticCurveTo(bodyX + bulbW + 1, waistH / 2, bodyX + bulbW / 2, bulbH / 2);
    ctx.closePath();

    // Warm ceramic tan gradient
    const bodyGrad = ctx.createLinearGradient(0, -bulbH / 2, 0, bulbH / 2);
    bodyGrad.addColorStop(0, '#f5e5cf');
    bodyGrad.addColorStop(0.18, '#ebd0ab');
    bodyGrad.addColorStop(0.55, '#d6b080');
    bodyGrad.addColorStop(0.85, '#ba8d59');
    bodyGrad.addColorStop(1, '#9c7140');
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    ctx.restore(); // remove shadow

    // Body subtle border stroke
    ctx.strokeStyle = '#9c7344';
    ctx.lineWidth = 0.65;
    ctx.stroke();

    // Cylindrical specular shine line along upper waist
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bodyX + 4, -bulbH / 2 + 2);
    ctx.lineTo(bodyX + bodyW - 4, -bulbH / 2 + 2);
    ctx.stroke();

    // 4. Color Bands (accurate 4-band code)
    const bands = this.resistorBands(res.resistance, res.unit);
    const bandPositions = [
      bodyX + 4.2,                  // Band 1 (on left bulb)
      bodyX + bulbW + 2.5,          // Band 2 (on center waist)
      bodyX + bulbW + 8.5,          // Band 3 (multiplier, on center waist)
      bodyX + bodyW - 4.5,          // Band 4 (tolerance, on right bulb)
    ];

    for (let i = 0; i < bands.length && i < 4; i++) {
      const bx = bandPositions[i];
      const isBulb = i === 0 || i === 3;
      const bH = isBulb ? bulbH - 0.8 : waistH - 0.8;
      const bY = -bH / 2;
      const bW = 2.8;

      ctx.save();
      ctx.fillStyle = bands[i];
      this.roundRect(ctx, bx - bW / 2, bY, bW, bH, 0.8);
      ctx.fill();

      // Band upper cylindrical shine
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.fillRect(bx - bW / 2, bY, bW, bH * 0.35);

      // Band lower shadow
      ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.fillRect(bx - bW / 2, bY + bH * 0.65, bW, bH * 0.35);
      ctx.restore();
    }

    // 5. Clean lead entry into breadboard holes (0, 0) and (span, 0)
    for (const px of [0, span]) {
      ctx.beginPath();
      ctx.arc(px, 0, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = '#64748b';
      ctx.fill();
    }

    // 6. Value label below
    ctx.font = '600 8.5px "Inter", "JetBrains Mono", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${res.resistance} ${res.unit}`, span / 2, bulbH / 2 + 5);

    // 7. Selection Outline
    if (sel) {
      ctx.strokeStyle = C.selBorder;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 3]);
      this.roundRect(ctx, -5, -bulbH / 2 - 4, span + 10, bulbH + 22, 5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.selFill;
      this.roundRect(ctx, -5, -bulbH / 2 - 4, span + 10, bulbH + 22, 5);
      ctx.fill();
    }
  }

  // ─── Diode (1N4001 DO-41 Silicon Rectifier Diode) ─────────────────────────

  private drawDiode(
    ctx: CanvasRenderingContext2D,
    diode: DiodeComponent,
    sel: boolean,
    physicsResult?: CircuitPhysicsResult,
    isCircuitActive: boolean = true,
  ) {
    const span = 56; // 4 breadboard columns = 56px exactly
    const bodyW = 26; // DO-41 cylindrical body width
    const bodyH = 11; // DO-41 height
    const bodyX = (span - bodyW) / 2; // centered at x = 15 to 41
    const bodyY = -bodyH / 2;

    const dPhys = physicsResult?.diodes.get(diode.id);
    const isConducting = isCircuitActive && (dPhys ? dPhys.isConducting : false);

    // 1. Metallic Lead Wires (entering holes at (0, 0) and (span, 0))
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.22)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1.5;

    const leadGrad = ctx.createLinearGradient(0, -1, 0, 1);
    leadGrad.addColorStop(0, '#cbd5e1');
    leadGrad.addColorStop(0.5, '#f8fafc');
    leadGrad.addColorStop(1, '#64748b');

    ctx.strokeStyle = leadGrad;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';

    // Left lead (Anode) from hole (0,0) to body (bodyX + 2, 0)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(bodyX + 2, 0);
    ctx.stroke();

    // Right lead (Cathode) from body (bodyX + bodyW - 2, 0) to hole (span, 0)
    ctx.beginPath();
    ctx.moveTo(bodyX + bodyW - 2, 0);
    ctx.lineTo(span, 0);
    ctx.stroke();

    // 2. Diode Body Drop Shadow
    ctx.shadowColor = 'rgba(15, 23, 42, 0.42)';
    ctx.shadowBlur = 7;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2.5;

    // 3. Cylindrical Body (DO-41 package: sleek matte black obsidian)
    const bodyGrad = ctx.createLinearGradient(0, bodyY, 0, bodyY + bodyH);
    bodyGrad.addColorStop(0, '#2d333b');
    bodyGrad.addColorStop(0.2, '#1e232a');
    bodyGrad.addColorStop(0.65, '#121519');
    bodyGrad.addColorStop(1, '#0a0d10');
    ctx.fillStyle = bodyGrad;

    this.roundRect(ctx, bodyX, bodyY, bodyW, bodyH, 2.5);
    ctx.fill();
    ctx.restore();

    // 4. Subtle body outline & specular highlight along upper crest
    ctx.strokeStyle = '#383f4a';
    ctx.lineWidth = 0.7;
    this.roundRect(ctx, bodyX, bodyY, bodyW, bodyH, 2.5);
    ctx.stroke();

    // Upper specular sheen line
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(bodyX + 2, bodyY + 1.8);
    ctx.lineTo(bodyX + bodyW - 2, bodyY + 1.8);
    ctx.stroke();
    ctx.restore();

    // 5. Silver Cathode Band Stripe (characteristic silver cathode ring near Pin 2 at the right end)
    const bandW = 4.2;
    const bandX = bodyX + bodyW - bandW - 2.5; // right side
    const bandGrad = ctx.createLinearGradient(0, bodyY, 0, bodyY + bodyH);
    bandGrad.addColorStop(0, '#f1f5f9');
    bandGrad.addColorStop(0.3, '#cbd5e1');
    bandGrad.addColorStop(0.7, '#94a3b8');
    bandGrad.addColorStop(1, '#64748b');

    ctx.fillStyle = bandGrad;
    ctx.fillRect(bandX, bodyY + 0.5, bandW, bodyH - 1);

    // Cathode band sheen
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(bandX, bodyY + 1.8);
    ctx.lineTo(bandX + bandW, bodyY + 1.8);
    ctx.stroke();

    // 6. Model Text ("1N4001" printed in crisp white micro-font)
    ctx.save();
    ctx.font = '700 6px "JetBrains Mono", monospace';
    ctx.fillStyle = isConducting ? '#38bdf8' : '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 0.5;
    ctx.fillText(diode.model || '1N4001', bodyX + (bodyW - bandW) / 2 + 1, 0.5);
    ctx.restore();

    // 7. Dynamic Conduction Glow Accent when forward biased & conducting!
    if (isConducting) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(bandX + bandW / 2, 0, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.restore();
    }

    // 8. Lead hole contact dots
    for (const px of [0, span]) {
      ctx.beginPath();
      ctx.arc(px, 0, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = '#64748b';
      ctx.fill();
    }

    // 9. Label below
    ctx.font = '600 8px "Inter", "JetBrains Mono", sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(diode.label || diode.model || '1N4001', span / 2, bodyH / 2 + 5);

    // 10. Selection Outline
    if (sel) {
      ctx.strokeStyle = C.selBorder;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 3]);
      this.roundRect(ctx, -5, bodyY - 4, span + 10, bodyH + 20, 5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.selFill;
      this.roundRect(ctx, -5, bodyY - 4, span + 10, bodyH + 20, 5);
      ctx.fill();
    }
  }

  // ─── Capacitor (Tinkercad Realistic Blue Dipped Ceramic matching Image 1) ──

  private drawCapacitor(ctx: CanvasRenderingContext2D, cap: CapacitorComponent, sel: boolean) {
    // Two leads enter horizontally adjacent breadboard holes at (0, 0) and (14, 0)
    const leadBottomY = 0;
    const bodyBottomY = -9.5;
    const cx = 7; // midpoint between pins (0 and 14)

    // 1. Draw Metallic Leads
    ctx.save();
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    
    // Left lead
    const leadGrad = ctx.createLinearGradient(0, bodyBottomY, 0, leadBottomY);
    leadGrad.addColorStop(0, '#94a3b8');
    leadGrad.addColorStop(0.5, '#f1f5f9');
    leadGrad.addColorStop(1, '#64748b');
    ctx.strokeStyle = leadGrad;

    ctx.beginPath();
    ctx.moveTo(0, bodyBottomY);
    ctx.lineTo(0, leadBottomY);
    ctx.stroke();

    // Right lead
    ctx.beginPath();
    ctx.moveTo(14, bodyBottomY);
    ctx.lineTo(14, leadBottomY);
    ctx.stroke();

    // Lead tips in holes
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.arc(0, leadBottomY, 1.2, 0, Math.PI * 2);
    ctx.arc(14, leadBottomY, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Bulbous Blue Dipped Body Contour
    // The dipped ceramic capacitor shape from Image 1:
    // Bulbous teardrop, arched cleft between the two legs, rounded dome on top
    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.4)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 4;

    ctx.beginPath();
    // Start at left lead exit
    ctx.moveTo(0, bodyBottomY);
    // Arch upward between the two leads
    ctx.quadraticCurveTo(cx, bodyBottomY - 3, 14, bodyBottomY);
    // Right bottom lobe
    ctx.bezierCurveTo(16.5, bodyBottomY - 0.5, 18.5, -12, 19, -15);
    // Right waist and shoulder
    ctx.bezierCurveTo(20.5, -23, 20, -32, 16, -37);
    // Top dome
    ctx.bezierCurveTo(13, -41, 1, -41, -2, -37);
    // Left waist and shoulder
    ctx.bezierCurveTo(-6, -32, -6.5, -23, -5, -15);
    // Left bottom lobe back to start
    ctx.bezierCurveTo(-4.5, -12, -2.5, -0.5, 0, bodyBottomY);
    ctx.closePath();

    // 3. Rich Glossy Blue Radial Gradient
    const bodyGrad = ctx.createRadialGradient(cx - 3, -31, 3, cx, -25, 18);
    bodyGrad.addColorStop(0, '#2779d7');
    bodyGrad.addColorStop(0.3, '#1d63b2');
    bodyGrad.addColorStop(0.7, '#154f94');
    bodyGrad.addColorStop(1, '#0e396d');
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.restore();

    // 4. Body outline rim
    ctx.strokeStyle = '#0e3a70';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    // 5. Characteristic Specular Highlights (matching Image 1!)
    // Curved bright crescent highlight along upper-left crest:
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(3, -37);
    ctx.bezierCurveTo(-1, -36, -3.5, -31, -3.5, -23);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Soft top glow accent
    ctx.beginPath();
    ctx.arc(cx - 3, -36.5, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.fill();
    ctx.restore();

    // 6. Printed Value Text (matching capacitor markings e.g. 100nF)
    ctx.save();
    ctx.font = '700 7px "Inter", "JetBrains Mono", sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetY = 1;
    ctx.fillText(`${cap.capacitance}${cap.unit}`, cx + 0.5, -23);
    ctx.restore();

    // 7. Selection Outline
    if (sel) {
      ctx.strokeStyle = C.selBorder;
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      this.roundRect(ctx, -8, -45, 30, 48, 4);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.selFill;
      this.roundRect(ctx, -8, -45, 30, 48, 4);
      ctx.fill();
    }
  }

  // ─── LED (Realistic 5mm Indicator Diode with Anode/Cathode & Glow) ─────────

  private drawLED(
    ctx: CanvasRenderingContext2D,
    led: LEDComponent,
    sel: boolean,
    nodes?: Map<NodeId, ElectricalNode>,
    physicsResult?: CircuitPhysicsResult,
    isCircuitActive: boolean = true,
  ) {
    // Two leads enter breadboard holes at Anode (0, 0) and Cathode (14, 0)
    const leadBottomY = 0;
    const bodyBottomY = -7;
    const cx = 7; // midpoint between pins (0 and 14)
    const domeCy = -18;

    // Check physics result for real forward bias & closed-loop conduction current
    const ledPhys = physicsResult?.leds.get(led.id);
    let isLit = false;
    let isOvercurrent = false;

    if (isCircuitActive) {
      if (ledPhys) {
        // Authoritative physical circuit engine: requires closed path between VCC and GND
        isLit = ledPhys.isIlluminated;
        isOvercurrent = ledPhys.isOvercurrent;
      } else if (Boolean(led.illuminated)) {
        isLit = true;
      } else if (nodes && led.pins && led.pins.length >= 2) {
        // Fallback only when physicsResult is unavailable: verify cathode is grounded!
        const anodePin = led.pins[0];
        const cathodePin = led.pins[1];
        if (anodePin?.contactId && cathodePin?.contactId) {
          let anodeHigh = false;
          let cathodeGrounded = false;
          for (const node of nodes.values()) {
            if (node.contactIds.has(anodePin.contactId) && node.state === 1) {
              anodeHigh = true;
            }
            if (node.contactIds.has(cathodePin.contactId) && node.state === 0) {
              // Ensure cathode node is actually wired to GND or return sink
              const hasGndContact = Array.from(node.contactIds).some((c) =>
                c === 'daq-agnd1' || c === 'daq-agnd2' || c === 'daq-dgnd' || c.startsWith('r-1-') || c.startsWith('r-3-')
              );
              if (hasGndContact) {
                cathodeGrounded = true;
              }
            }
          }
          if (anodeHigh && cathodeGrounded) {
            isLit = true;
          }
        }
      }
    }

    // Color definitions with dedicated glow, spread, and ambient halo for each LED color
    const colorThemes: Record<LEDColor, {
      dark: string;
      mid: string;
      bright: string;
      core: string;
      glow: string;
      glowMid: string;
      spread: string;
      ambient: string;
      leadframe: string;
    }> = {
      red: {
        dark: '#7F1D1D',
        mid: '#DC2626',
        bright: '#EF4444',
        core: '#FEE2E2',
        glow: 'rgba(239, 68, 68, 0.95)',
        glowMid: 'rgba(239, 68, 68, 0.6)',
        spread: 'rgba(239, 68, 68, 0.35)',
        ambient: 'rgba(239, 68, 68, 0.12)',
        leadframe: '#B91C1C',
      },
      green: {
        dark: '#14532D',
        mid: '#16A34A',
        bright: '#22C55E',
        core: '#DCFCE7',
        glow: 'rgba(34, 197, 94, 0.95)',
        glowMid: 'rgba(34, 197, 94, 0.6)',
        spread: 'rgba(34, 197, 94, 0.35)',
        ambient: 'rgba(34, 197, 94, 0.12)',
        leadframe: '#15803D',
      },
      blue: {
        dark: '#1E3A8A',
        mid: '#2563EB',
        bright: '#3B82F6',
        core: '#DBEAFE',
        glow: 'rgba(59, 130, 246, 0.95)',
        glowMid: 'rgba(59, 130, 246, 0.6)',
        spread: 'rgba(59, 130, 246, 0.35)',
        ambient: 'rgba(59, 130, 246, 0.12)',
        leadframe: '#1D4ED8',
      },
      yellow: {
        dark: '#78350F',
        mid: '#D97706',
        bright: '#FACC15',
        core: '#FEF9C3',
        glow: 'rgba(250, 204, 21, 0.95)',
        glowMid: 'rgba(250, 204, 21, 0.6)',
        spread: 'rgba(234, 179, 8, 0.35)',
        ambient: 'rgba(234, 179, 8, 0.12)',
        leadframe: '#B45309',
      },
      orange: {
        dark: '#7C2D12',
        mid: '#EA580C',
        bright: '#F97316',
        core: '#FFEDD5',
        glow: 'rgba(249, 115, 22, 0.95)',
        glowMid: 'rgba(249, 115, 22, 0.6)',
        spread: 'rgba(249, 115, 22, 0.35)',
        ambient: 'rgba(249, 115, 22, 0.12)',
        leadframe: '#C2410C',
      },
      white: {
        dark: '#334155',
        mid: '#94A3B8',
        bright: '#F8FAFC',
        core: '#FFFFFF',
        glow: 'rgba(255, 255, 255, 0.98)',
        glowMid: 'rgba(226, 232, 240, 0.65)',
        spread: 'rgba(203, 213, 225, 0.35)',
        ambient: 'rgba(148, 163, 184, 0.12)',
        leadframe: '#64748B',
      },
      purple: {
        dark: '#4C1D95',
        mid: '#7C3AED',
        bright: '#A855F7',
        core: '#FAF5FF',
        glow: 'rgba(168, 85, 247, 0.95)',
        glowMid: 'rgba(147, 51, 234, 0.6)',
        spread: 'rgba(139, 92, 246, 0.38)',
        ambient: 'rgba(124, 58, 237, 0.14)',
        leadframe: '#6D28D9',
      },
      violet: {
        dark: '#4C1D95',
        mid: '#7C3AED',
        bright: '#A855F7',
        core: '#FAF5FF',
        glow: 'rgba(168, 85, 247, 0.95)',
        glowMid: 'rgba(147, 51, 234, 0.6)',
        spread: 'rgba(139, 92, 246, 0.38)',
        ambient: 'rgba(124, 58, 237, 0.14)',
        leadframe: '#6D28D9',
      },
    };

    const ledColorKey = (led.color as string) === 'violet' ? 'violet' : led.color;
    const theme = colorThemes[ledColorKey] || colorThemes.red;

    // 1. Draw Radial Radiant Halo if Lit (using LED's dedicated spread color!)
    if (isLit) {
      ctx.save();
      const haloRadius = isOvercurrent ? 46 : 38;
      const haloGrad = ctx.createRadialGradient(cx, domeCy, 1, cx, domeCy, haloRadius);
      haloGrad.addColorStop(0, '#FFFFFF'); // Hot emitter die
      haloGrad.addColorStop(0.18, theme.glow); // Concentrated primary LED bloom
      haloGrad.addColorStop(0.45, theme.glowMid); // Intermediate radiant dispersion
      haloGrad.addColorStop(0.72, theme.spread); // Dedicated LED color spread (violet for violet, etc.)
      haloGrad.addColorStop(0.92, theme.ambient); // Fading ambient halo
      haloGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(cx, domeCy, haloRadius, 0, Math.PI * 2);
      ctx.fill();

      // If overcurrent (>30mA), show a distinct outer warning ring without overriding the LED's optical spread
      if (isOvercurrent) {
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.85)';
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.arc(cx, domeCy, haloRadius + 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.restore();
    }

    // 2. Metallic Leads entering breadboard holes at (0, 0) and (14, 0)
    ctx.save();
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';

    const leadGrad = ctx.createLinearGradient(0, bodyBottomY, 0, leadBottomY);
    leadGrad.addColorStop(0, '#94A3B8');
    leadGrad.addColorStop(0.5, '#F1F5F9');
    leadGrad.addColorStop(1, '#64748B');
    ctx.strokeStyle = leadGrad;

    // Anode lead (+) on left
    ctx.beginPath();
    ctx.moveTo(0, bodyBottomY);
    ctx.lineTo(0, leadBottomY);
    ctx.stroke();

    // Cathode lead (-) on right
    ctx.beginPath();
    ctx.moveTo(14, bodyBottomY);
    ctx.lineTo(14, leadBottomY);
    ctx.stroke();

    // Lead tips in holes
    ctx.fillStyle = '#64748B';
    ctx.beginPath();
    ctx.arc(0, leadBottomY, 1.2, 0, Math.PI * 2);
    ctx.arc(14, leadBottomY, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 3. LED 5mm Epoxy Body Shadow
    ctx.save();
    ctx.shadowColor = isLit ? theme.glow : 'rgba(15, 23, 42, 0.35)';
    ctx.shadowBlur = isLit ? 14 : 7;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = isLit ? 0 : 3;

    // 4. Epoxy Base Flange (with flat edge on Cathode/right side)
    const flangeW = 19;
    const flangeH = 4;
    const flangeX = cx - flangeW / 2; // -2.5
    const flangeY = bodyBottomY - flangeH; // -11

    ctx.beginPath();
    // Rounded bottom left flange
    ctx.moveTo(flangeX, flangeY + flangeH);
    ctx.lineTo(flangeX + flangeW - 2, flangeY + flangeH);
    // Cathode flat edge notch (vertical straight cutoff on right)
    ctx.lineTo(flangeX + flangeW, flangeY + 1);
    ctx.lineTo(flangeX + flangeW - 1, flangeY);
    // Across top of flange to left
    ctx.lineTo(flangeX, flangeY);
    ctx.closePath();

    const flangeGrad = ctx.createLinearGradient(flangeX, flangeY, flangeX + flangeW, flangeY);
    flangeGrad.addColorStop(0, theme.dark);
    flangeGrad.addColorStop(0.4, theme.mid);
    flangeGrad.addColorStop(1, theme.dark);
    ctx.fillStyle = flangeGrad;
    ctx.fill();

    // 5. 5mm Cylindrical Dome Body
    const domeW = 15;
    const domeH = 17;
    const domeLeft = cx - domeW / 2; // -0.5
    const domeRight = cx + domeW / 2; // 14.5
    const domeTop = flangeY - domeH; // -28

    ctx.beginPath();
    // Start at bottom left of dome
    ctx.moveTo(domeLeft, flangeY);
    // Left vertical wall
    ctx.lineTo(domeLeft, domeTop + domeW / 2);
    // Hemispherical rounded dome top
    ctx.arc(cx, domeTop + domeW / 2, domeW / 2, Math.PI, 0, false);
    // Right vertical wall
    ctx.lineTo(domeRight, flangeY);
    ctx.closePath();

    // Body Fill: radiant if lit, glossy epoxy if unlit
    const bodyGrad = ctx.createRadialGradient(cx - 2, domeTop + 6, 2, cx, domeCy, 12);
    if (isLit) {
      bodyGrad.addColorStop(0, '#FFFFFF');
      bodyGrad.addColorStop(0.25, theme.core);
      bodyGrad.addColorStop(0.65, theme.bright);
      bodyGrad.addColorStop(1, theme.mid);
    } else {
      bodyGrad.addColorStop(0, theme.bright);
      bodyGrad.addColorStop(0.4, theme.mid);
      bodyGrad.addColorStop(0.85, theme.dark);
      bodyGrad.addColorStop(1, theme.dark);
    }
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.restore(); // remove shadow

    // 6. Internal Leadframe / Luminous Core
    if (isLit) {
      // Brilliant inner luminous semiconductor die
      ctx.save();
      const coreGrad = ctx.createRadialGradient(cx, domeCy - 1, 0.5, cx, domeCy - 1, 6.5);
      coreGrad.addColorStop(0, '#FFFFFF');
      coreGrad.addColorStop(0.4, theme.core);
      coreGrad.addColorStop(0.8, theme.bright);
      coreGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, domeCy - 1, 6.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = 'rgba(203, 213, 225, 0.45)';
      ctx.strokeStyle = 'rgba(241, 245, 249, 0.6)';
      ctx.lineWidth = 0.8;

      // Anode post (slender pin on left x=3.5)
      ctx.fillRect(3, flangeY - 10, 1.6, 10);

      // Cathode anvil (wider reflective cup on right x=8 to 11)
      ctx.beginPath();
      ctx.moveTo(8.5, flangeY);
      ctx.lineTo(8.5, flangeY - 8);
      ctx.lineTo(11.5, flangeY - 11);
      ctx.lineTo(11.5, flangeY);
      ctx.closePath();
      ctx.fill();

      // Tiny LED semiconductor die in anvil cup
      ctx.fillStyle = theme.leadframe;
      ctx.fillRect(9.2, flangeY - 8.5, 1.8, 1.2);
      ctx.restore();
    }

    // 7. Specular Gloss Highlights (Curved epoxy surface reflections)
    ctx.save();
    // Curved highlight along upper-left crest
    ctx.beginPath();
    ctx.moveTo(cx - 4.5, domeTop + 2.5);
    ctx.quadraticCurveTo(cx - 6, domeTop + 6, cx - 5.5, domeTop + 12);
    ctx.strokeStyle = isLit ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.7)';
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.stroke();

    // Top glint dot
    ctx.beginPath();
    ctx.arc(cx - 3, domeTop + 3.5, 1.3, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();

    // Subtle edge rim outline
    ctx.strokeStyle = isLit ? theme.bright : theme.dark;
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.restore();

    // 8. Lead Polarity Indicators (+ and - subtle beneath holes)
    ctx.save();
    ctx.font = 'bold 7px "Inter", "JetBrains Mono", sans-serif';
    ctx.fillStyle = isLit ? theme.bright : '#64748B';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('+', 0, 4);
    ctx.fillText('−', 14, 4);
    ctx.restore();

    // 9. Selection Outline
    if (sel) {
      ctx.strokeStyle = C.selBorder;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 3]);
      this.roundRect(ctx, -7, -33, 28, 42, 5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.selFill;
      this.roundRect(ctx, -7, -33, 28, 42, 5);
      ctx.fill();
    }
  }

  // ─── DAC Header (Black connector style) ───────────────────────────

  private drawDAC(ctx: CanvasRenderingContext2D, dac: DACComponent, sel: boolean) {
    const pl = 8;

    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 3;

    const bw = 50;
    const bh = 42;
    const bodyX = 4;
    const bodyY = -7;

    // Black connector body
    const pcbGrad = ctx.createLinearGradient(bodyX, bodyY, bodyX + bw, bodyY + bh);
    pcbGrad.addColorStop(0, '#27272a');
    pcbGrad.addColorStop(0.5, '#18181b');
    pcbGrad.addColorStop(1, '#09090b');
    ctx.fillStyle = pcbGrad;
    this.roundRect(ctx, bodyX, bodyY, bw, bh, 4);
    ctx.fill();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // Connector edge
    ctx.strokeStyle = '#3f3f46';
    ctx.lineWidth = 1;
    this.roundRect(ctx, bodyX, bodyY, bw, bh, 4);
    ctx.stroke();

    // Solder pads / pin housings
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(bodyX + 4, i * 14 - 5, bw - 8, 10);
    }

    // Title
    ctx.font = 'bold 8px "Inter", sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('DAC Header', bodyX + bw / 2, bodyY + 3);

    // Pins
    const labels = ['Vcc', 'Vo', 'Gnd'];
    const colors = [C.railPower, '#dd8800', C.railGround];
    ctx.font = 'bold 7.5px "JetBrains Mono", monospace';

    for (let i = 0; i < 3; i++) {
      const py = i * 14; // y = 0, 14, 28 matching breadboard rows!

      // Gold pin lead extending from body to hole at x = 0
      const pinGrad = ctx.createLinearGradient(0, py - 1.2, 0, py + 1.2);
      pinGrad.addColorStop(0, '#fde047');
      pinGrad.addColorStop(0.5, '#eab308');
      pinGrad.addColorStop(1, '#ca8a04');
      ctx.fillStyle = pinGrad;
      ctx.fillRect(0, py - 1.2, bodyX, 2.4);

      // Pin collar inserted into breadboard hole at (0, py)
      ctx.beginPath();
      ctx.arc(0, py, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = colors[i];
      ctx.fill();

      ctx.beginPath();
      ctx.arc(-0.5, py - 0.5, 0.7, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();

      // Label inside header body
      ctx.fillStyle = C.dacText;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[i], bodyX + 6, py);
    }

    if (sel) {
      ctx.strokeStyle = C.selBorder;
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 3]);
      this.roundRect(ctx, -3, bodyY - 3, bw + bodyX + 5, bh + 6, 5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = C.selFill;
      this.roundRect(ctx, -3, bodyY - 3, bw + bodyX + 5, bh + 6, 5);
      ctx.fill();
    }
  }

  // ─── Utility ─────────────────────────────────────────────────────────────

  // ─── Cached Grid (dot grid drawn once into offscreen canvas) ──────────────

  private drawCachedGrid(ctx: CanvasRenderingContext2D) {
    const w = this.width;
    const h = this.height;
    if (!this.gridCache || this.gridCacheW !== w || this.gridCacheH !== h) {
      this.gridCacheW = w;
      this.gridCacheH = h;
      this.gridCache = new OffscreenCanvas(w, h);
      const gctx = this.gridCache.getContext('2d')!;
      this.gridCacheCtx = gctx;
      // Draw all dots as a single batched path
      gctx.fillStyle = C.canvasGrid;
      gctx.beginPath();
      const gridSize = 24;
      for (let gx = 0; gx < w; gx += gridSize) {
        for (let gy = 0; gy < h; gy += gridSize) {
          gctx.moveTo(gx + 0.75, gy);
          gctx.arc(gx, gy, 0.75, 0, Math.PI * 2);
        }
      }
      gctx.fill();
    }
    ctx.drawImage(this.gridCache!, 0, 0);
  }

  // ─── Cached Board (static board drawn once into offscreen canvas) ─────────

  private drawCachedBoard(ctx: CanvasRenderingContext2D, bb: BreadboardModel) {
    // Build a simple cache key from contact count + occupied contacts
    let occupiedKey = '';
    for (const c of bb.contacts.values()) {
      if (c.occupied) occupiedKey += c.id + ',';
    }
    const cacheKey = `${bb.totalHoles}:${occupiedKey}`;
    if (cacheKey !== this.boardCacheKey) {
      this.boardCacheDirty = true;
      this.boardCacheKey = cacheKey;
    }

    if (this.boardCacheDirty || !this.boardCache) {
      // Size the cache to fit the board with some margin
      const cw = BOARD_WIDTH + 40;
      const ch = BOARD_HEIGHT + 40;
      if (!this.boardCache || this.boardCache.width !== cw || this.boardCache.height !== ch) {
        this.boardCache = new OffscreenCanvas(cw, ch);
        this.boardCacheCtx = this.boardCache.getContext('2d')!;
      }
      const bctx = this.boardCacheCtx!;
      bctx.clearRect(0, 0, cw, ch);
      this.drawBoard(bctx as unknown as CanvasRenderingContext2D, bb);
      this.boardCacheDirty = false;
    }
    ctx.drawImage(this.boardCache!, 0, 0);
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  private stateColor(s?: LogicState): string {
    switch (s) {
      case 1:   return C.high;
      case 0:   return C.low;
      case 'Z': return C.hiZ;
      case 'X': return C.unknown;
      default:  return C.hiZ;
    }
  }

  private resistorBands(value: number, unit: string): string[] {
    const mult = unit === 'kΩ' ? 1000 : unit === 'MΩ' ? 1e6 : 1;
    const ohms = value * mult;
    const palette = [
      '#000000', '#8b4513', '#ff0000', '#ff8c00', '#ffd700',
      '#008800', '#0000ff', '#8b008b', '#808080', '#ffffff',
    ];
    const s = Math.round(ohms).toString();
    const b: string[] = [];
    if (s.length >= 1) b.push(palette[parseInt(s[0])] || '#000');
    if (s.length >= 2) b.push(palette[parseInt(s[1])] || '#000');
    b.push(palette[Math.min(Math.max(0, s.length - 2), 9)]);
    b.push('#c8a600'); // tolerance gold
    return b;
  }

  private rowY(row: string): number | null {
    const rows = ['a','b','c','d','e','f','g','h','i','j'];
    const idx = rows.indexOf(row);
    if (idx < 0) return null;
    let y = BOARD_PADDING + 2 * HOLE_SPACING + 18;
    if (idx <= 4) { y += idx * HOLE_SPACING; }
    else { y += 4 * HOLE_SPACING + CENTER_GAP + (idx - 5) * HOLE_SPACING; }
    return y;
  }

  // ─── Hit Testing ─────────────────────────────────────────────────────────

  hitTestComponent(comps: Map<string, CircuitComponent>, cx: number, cy: number): string | null {
    const entries = Array.from(comps.entries()).reverse();
    for (const [id, comp] of entries) {
      // Transform (cx, cy) into component's local coordinate system
      const dx = cx - comp.position.x;
      const dy = cy - comp.position.y;
      const rad = -(comp.rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;

      const m = 10; // generous grab margin around components
      let minX = -m, maxX = m, minY = -m, maxY = m;

      switch (comp.type) {
        case 'ic': {
          const info = IC_LIBRARY[(comp as ICComponent).icType] || { pinCount: 14 };
          const half = info.pinCount / 2;
          const bw = (half - 1) * HOLE_SPACING + 16;
          minX = -8 - m;
          maxX = bw - 8 + m;
          minY = -m;
          maxY = 28 + m;
          break;
        }
        case 'resistor':
        case 'diode': {
          const totalW = 56;
          minX = -m;
          maxX = totalW + m;
          minY = -8 - m;
          maxY = 16 + m;
          break;
        }
        case 'capacitor': {
          minX = -8 - m;
          maxX = 22 + m;
          minY = -44 - m;
          maxY = 4 + m;
          break;
        }
        case 'dac': {
          const bw = 50;
          const bh = 42;
          minX = -4 - m;
          maxX = bw + 6 + m;
          minY = -8 - m;
          maxY = bh - 6 + m;
          break;
        }
        case 'led': {
          minX = -8 - m;
          maxX = 22 + m;
          minY = -34 - m;
          maxY = 4 + m;
          break;
        }
        default:
          continue;
      }

      if (lx >= minX && lx <= maxX && ly >= minY && ly <= maxY) {
        return id;
      }
    }
    return null;
  }

  hitTestWire(wires: Map<WireId, Wire>, bb: BreadboardModel, cx: number, cy: number, threshold = 10): WireId | null {
    for (const wire of wires.values()) {
      const s = bb.contacts.get(wire.startContactId);
      const e = bb.contacts.get(wire.endContactId);
      if (!s || !e) continue;
      const sp = s.position;
      const ep = e.position;
      const dx = ep.x - sp.x;
      const dy = ep.y - sp.y;

      let d1 = Infinity, d2 = Infinity, d3 = Infinity;
      if (Math.abs(dx) > Math.abs(dy)) {
        const mx = sp.x + dx / 2;
        d1 = this.ptSegDist(cx, cy, sp.x, sp.y, mx, sp.y);
        d2 = this.ptSegDist(cx, cy, mx, sp.y, mx, ep.y);
        d3 = this.ptSegDist(cx, cy, mx, ep.y, ep.x, ep.y);
      } else {
        const my = sp.y + dy / 2;
        d1 = this.ptSegDist(cx, cy, sp.x, sp.y, sp.x, my);
        d2 = this.ptSegDist(cx, cy, sp.x, my, ep.x, my);
        d3 = this.ptSegDist(cx, cy, ep.x, my, ep.x, ep.y);
      }

      const minD = Math.min(d1, d2, d3, this.ptSegDist(cx, cy, sp.x, sp.y, ep.x, ep.y));
      if (minD < threshold) {
        return wire.id;
      }
    }
    return null;
  }

  private ptSegDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }
}
