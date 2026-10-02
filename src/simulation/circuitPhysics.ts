import {
  Project,
  CircuitComponent,
  ResistorComponent,
  CapacitorComponent,
  LEDComponent,
  ICComponent,
  DACComponent,
  Wire,
  ContactId,
  WaveformType,
  LogicState,
} from '../model/types';
import { deriveElectricalNodes, getConnectedContacts } from '../model/connectivity';
import { DaqSignalInfo } from './daqSignals';

// ─── Physical Node Definition ────────────────────────────────────────────────

export interface PhysicalNode {
  id: string;
  contactIds: Set<ContactId>;
  /** Instantaneous voltage (Volts) */
  voltage: number;
  /** DC component (Volts) */
  dcVoltage: number;
  /** Peak-to-peak AC amplitude (Volts) */
  vpp: number;
  /** RMS voltage (Volts) */
  rms: number;
  /** Frequency (Hz) if AC */
  frequency: number;
  /** Waveform shape */
  waveformType: WaveformType | 'dc' | 'open';
  /** Phase in radians */
  phase: number;
  /** Is this an electrical ground reference (0V) */
  isGround: boolean;
  /** Description of what source or network drives this node */
  sourceDesc: string;
}

export interface ResistorPhysics {
  id: string;
  resistanceOhms: number;
  voltageDrop: number;
  currentAmps: number;
  currentMilliAmps: number;
  powerWatts: number;
  node1Id: string;
  node2Id: string;
}

export interface CapacitorPhysics {
  id: string;
  capacitanceFarads: number;
  voltage: number;
  currentAmps: number;
  tauSeconds: number;
  cutoffFreqHz: number;
  node1Id: string;
  node2Id: string;
}

export interface LEDPhysics {
  id: string;
  color: string;
  forwardVoltage: number;
  anodeVoltage: number;
  cathodeVoltage: number;
  currentAmps: number;
  currentMilliAmps: number;
  isIlluminated: boolean;
  intensity: number; // 0.0 to 1.0
  isOvercurrent: boolean; // > 30mA
  isReverseBiased: boolean;
  statusText: string;
}

export interface ICPhysics {
  id: string;
  icType: string;
  isPowered: boolean;
  vccVoltage: number;
  gndVoltage: number;
  gates: Array<{
    gateIndex: number;
    inputA: { contactId?: string; voltage: number; logic: LogicState };
    inputB?: { contactId?: string; voltage: number; logic: LogicState };
    output: { contactId?: string; voltage: number; logic: LogicState };
  }>;
}

export interface CircuitPhysicsResult {
  nodes: Map<string, PhysicalNode>;
  contactToNodeMap: Map<ContactId, PhysicalNode>;
  resistors: Map<string, ResistorPhysics>;
  capacitors: Map<string, CapacitorPhysics>;
  leds: Map<string, LEDPhysics>;
  ics: Map<string, ICPhysics>;
  time: number;
}

// ─── Unit Conversion Utilities ───────────────────────────────────────────────

export function getResistanceInOhms(res: ResistorComponent): number {
  const val = res.resistance || 1000;
  if (res.unit === 'kΩ') return val * 1000;
  if (res.unit === 'MΩ') return val * 1000000;
  return val;
}

export function getCapacitanceInFarads(cap: CapacitorComponent): number {
  const val = cap.capacitance || 100;
  if (cap.unit === 'µF') return val * 1e-6;
  if (cap.unit === 'nF') return val * 1e-9;
  if (cap.unit === 'pF') return val * 1e-12;
  return val * 1e-9;
}

// ─── Core Circuit Physics Engine ─────────────────────────────────────────────

/**
 * Solves the complete physical circuit state including:
 * 1. Galvanic nets from wires and breadboard socket tracks
 * 2. Power supplies & DAQ instrument voltage generators
 * 3. Resistor networks using nodal conductance matrix (Ohm's Law & KCL)
 * 4. Dynamic RC circuit filters (tau, cutoff frequency, exponential charging)
 * 5. LED forward bias, conduction current, luminosity & overcurrent detection
 * 6. 74HC IC power verification (VCC/GND) and gate logic threshold evaluation
 */
export function solveCircuitPhysics(state: Project, time: number): CircuitPhysicsResult {
  const isDaqOn = (state.instruments.daq?.enabled !== false) && (state.simulation.status === 'running');
  const fgen = state.instruments.functionGenerator;
  const dioBits = state.instruments.daq?.dioBits || [1, 0, 1, 1, 0, 0, 1, 0];

  // 1. Derive base galvanic nets (direct copper/breadboard connections)
  const baseNodes = deriveElectricalNodes(state.breadboard, state.wires, state.components);

  // Map each contact to its net ID
  const contactToNetId = new Map<ContactId, string>();
  for (const node of baseNodes.values()) {
    for (const c of node.contactIds) {
      contactToNetId.set(c, node.id);
    }
  }

  // 2. Identify primary sources attached to each net
  interface NetSource {
    voltage: number;
    isGround: boolean;
    isAc: boolean;
    frequency: number;
    waveform: WaveformType | 'dc';
    amplitude: number;
    dcOffset: number;
    sourceDesc: string;
    internalResistance: number;
  }

  const netSources = new Map<string, NetSource>();

  // Helper to attach or arbitrate a source on a net
  const attachSource = (netId: string, src: NetSource) => {
    // If ground, always takes priority
    if (src.isGround) {
      netSources.set(netId, src);
      return;
    }
    const existing = netSources.get(netId);
    if (!existing || existing.internalResistance > src.internalResistance) {
      netSources.set(netId, src);
    }
  };

  // Inspect all contacts across all nets for hardware power supplies / DAQ pins
  for (const node of baseNodes.values()) {
    const netId = node.id;
    for (const c of node.contactIds) {
      // Ground references
      if (
        c === 'daq-agnd1' ||
        c === 'daq-agnd2' ||
        c === 'daq-dgnd' ||
        c.startsWith('r-1-') ||
        c.startsWith('r-3-')
      ) {
        attachSource(netId, {
          voltage: 0.0,
          isGround: true,
          isAc: false,
          frequency: 0,
          waveform: 'dc',
          amplitude: 0,
          dcOffset: 0,
          sourceDesc: c.includes('agnd') ? 'Analog Ground (AGND)' : c.includes('dgnd') ? 'Digital Ground (DGND)' : 'Ground Rail (−)',
          internalResistance: 0.01,
        });
      }

      if (!isDaqOn) continue;

      // +5V Digital Supply
      if (c === 'daq-v5v' || c.startsWith('r-0-') || c.startsWith('r-2-')) {
        attachSource(netId, {
          voltage: 5.0,
          isGround: false,
          isAc: false,
          frequency: 0,
          waveform: 'dc',
          amplitude: 0,
          dcOffset: 5.0,
          sourceDesc: c === 'daq-v5v' ? 'myDAQ +5V Digital Supply' : 'Breadboard Power Rail (+5V)',
          internalResistance: 0.05,
        });
      }

      // +15V / VPS Positive Power Supply
      if (c === 'daq-p15v') {
        const vpsPos = state.instruments.vps
          ? (state.instruments.vps.enabled ? state.instruments.vps.posVoltage : 0)
          : 15.0;
        attachSource(netId, {
          voltage: vpsPos,
          isGround: false,
          isAc: false,
          frequency: 0,
          waveform: 'dc',
          amplitude: 0,
          dcOffset: vpsPos,
          sourceDesc: `myDAQ +VPS Power Supply (+${vpsPos.toFixed(2)}V)`,
          internalResistance: 0.1,
        });
      }

      // -15V / VPS Negative Power Supply
      if (c === 'daq-n15v') {
        const vpsNeg = state.instruments.vps
          ? (state.instruments.vps.enabled ? -Math.abs(state.instruments.vps.negVoltage) : 0)
          : -15.0;
        attachSource(netId, {
          voltage: vpsNeg,
          isGround: false,
          isAc: false,
          frequency: 0,
          waveform: 'dc',
          amplitude: 0,
          dcOffset: vpsNeg,
          sourceDesc: `myDAQ −VPS Power Supply (${vpsNeg.toFixed(2)}V)`,
          internalResistance: 0.1,
        });
      }

      // Function Generator Output (AO 0)
      if (c === 'daq-ao0') {
        if (fgen && fgen.enabled) {
          const freq = fgen.frequency || 100;
          const amp = fgen.amplitude || 1.0;
          const offset = fgen.dcOffset || 0.0;
          const wf = fgen.waveform || 'sine';

          let instV = offset;
          if (wf === 'sine') {
            instV = offset + amp * Math.sin(2 * Math.PI * freq * time);
          } else if (wf === 'square') {
            const phase = ((time * freq) % 1 + 1) % 1;
            instV = offset + (phase < 0.5 ? amp : -amp);
          } else if (wf === 'triangle') {
            const phase = ((time * freq) % 1 + 1) % 1;
            instV = offset + (phase < 0.5 ? (phase * 4 - 1) * amp : (3 - phase * 4) * amp);
          }

          attachSource(netId, {
            voltage: instV,
            isGround: false,
            isAc: true,
            frequency: freq,
            waveform: wf,
            amplitude: amp,
            dcOffset: offset,
            sourceDesc: `FGEN (AO 0): ${amp * 2}Vpp, ${freq}Hz ${wf.toUpperCase()}`,
            internalResistance: 50.0, // 50 Ohm output impedance
          });
        }
      }

      // Auxiliary AO 1 (DC +2.5V default)
      if (c === 'daq-ao1') {
        attachSource(netId, {
          voltage: 2.5,
          isGround: false,
          isAc: false,
          frequency: 0,
          waveform: 'dc',
          amplitude: 0,
          dcOffset: 2.5,
          sourceDesc: 'myDAQ AO 1 (Aux DC +2.5V)',
          internalResistance: 50.0,
        });
      }

      // Digital I/O (DIO 0..7)
      const dioDirections = state.instruments.daq?.dioDirection ?? [true, true, true, true, false, false, false, false];
      for (let i = 0; i < 8; i++) {
        if (c === `daq-dio${i}`) {
          // Check if this line is configured as output
          const isConfiguredOutput = dioDirections[i] !== false;

          // Check if this net is already driven by an active component output (gate or 555 output pin)
          const isNetDrivenByComponent = Array.from(state.components.values()).some((comp) => {
            if (comp.type !== 'ic') return false;
            const icComp = comp as ICComponent;
            if (icComp.icType === 'NE555') {
              const pin3 = icComp.pins[2]?.contactId;
              return pin3 && contactToNetId.get(pin3) === netId;
            }
            const outIndices =
              icComp.icType === '74HC04' ? [1, 3, 5, 7, 9, 11]
              : icComp.icType === '74HC02' ? [0, 3, 9, 12]
              : [2, 5, 7, 10];
            return outIndices.some((idx) => {
              const cId = icComp.pins[idx]?.contactId;
              return cId && contactToNetId.get(cId) === netId;
            });
          });

          // Only drive if configured as output AND not overridden by a component output on the same net
          if (isConfiguredOutput && !isNetDrivenByComponent) {
            const bit = dioBits[i] ?? 0;
            const v = bit === 1 ? 5.0 : 0.0;
            attachSource(netId, {
              voltage: v,
              isGround: false,
              isAc: false,
              frequency: 0,
              waveform: 'dc',
              amplitude: 0,
              dcOffset: v,
              sourceDesc: `myDAQ DIO ${i} Output (${bit === 1 ? 'HIGH 5.0V' : 'LOW 0.0V'})`,
              internalResistance: 50.0,
            });
          }
        }
      }
    }
  }

  // 3. Initialize node potentials and waveforms before IC and resistor evaluation
  const netVoltages = new Map<string, number>();
  const netWaveforms = new Map<string, NetSource>();

  // Seed fixed source nets
  for (const [netId, src] of netSources.entries()) {
    netVoltages.set(netId, src.voltage);
    netWaveforms.set(netId, src);
  }

  // First-pass solve for IC Power and Logic
  const icPhysicsMap = new Map<string, ICPhysics>();

  for (const comp of state.components.values()) {
    if (comp.type !== 'ic') continue;
    const ic = comp as ICComponent;
    const is555 = ic.icType === 'NE555';
    const pinVcc = is555 ? ic.pins[7] : ic.pins[13]; // Pin 8 for 555, Pin 14 for DIP-14
    const pinGnd = is555 ? ic.pins[0] : ic.pins[6];  // Pin 1 for 555, Pin 7 for DIP-14

    const vccNetId = pinVcc?.contactId ? contactToNetId.get(pinVcc.contactId) : undefined;
    const gndNetId = pinGnd?.contactId ? contactToNetId.get(pinGnd.contactId) : undefined;

    const vccSource = vccNetId ? netSources.get(vccNetId) : undefined;
    const gndSource = gndNetId ? netSources.get(gndNetId) : undefined;

    const vccVoltage = vccSource ? vccSource.voltage : 0;
    const gndVoltage = gndSource ? gndSource.voltage : 0;

    // A real IC requires VCC >= 3.0V and GND <= 0.8V
    const isPowered = isDaqOn && vccVoltage >= 3.0 && gndVoltage <= 0.8 && (gndSource?.isGround || gndVoltage < 0.5);

    const icPhys: ICPhysics = {
      id: ic.id,
      icType: ic.icType,
      isPowered,
      vccVoltage,
      gndVoltage,
      gates: [],
    };

    // If powered, evaluate logic gates and drive output nets
    if (isPowered) {
      if (is555) {
        // ─── NE555 Precision Timer Simulation ─────────────────────────
        // Pinout: 1:GND, 2:TRIG, 3:OUT, 4:RESET, 5:CTRL, 6:THRESH, 7:DISCH, 8:VCC
        const trigNet = ic.pins[1]?.contactId ? contactToNetId.get(ic.pins[1].contactId) : undefined;
        const outNet = ic.pins[2]?.contactId ? contactToNetId.get(ic.pins[2].contactId) : undefined;
        const resetNet = ic.pins[3]?.contactId ? contactToNetId.get(ic.pins[3].contactId) : undefined;
        const ctrlNet = ic.pins[4]?.contactId ? contactToNetId.get(ic.pins[4].contactId) : undefined;
        const threshNet = ic.pins[5]?.contactId ? contactToNetId.get(ic.pins[5].contactId) : undefined;
        const dischNet = ic.pins[6]?.contactId ? contactToNetId.get(ic.pins[6].contactId) : undefined;

        const vTrig = trigNet && netSources.has(trigNet) ? netSources.get(trigNet)!.voltage : 0;
        const vThresh = threshNet && netSources.has(threshNet) ? netSources.get(threshNet)!.voltage : 0;
        const vReset = resetNet && netSources.has(resetNet) ? netSources.get(resetNet)!.voltage : vccVoltage;
        const vCtrl = ctrlNet && netSources.has(ctrlNet) ? netSources.get(ctrlNet)!.voltage : ((2 / 3) * vccVoltage);

        const vTrigRef = vCtrl / 2; // Typically 1/3 VCC
        const vThreshRef = vCtrl;    // Typically 2/3 VCC

        // Check if Astable Multivibrator configuration:
        // Pin 2 (TRIG) and Pin 6 (THRESH) connected together
        const isAstableWired = Boolean(trigNet && threshNet && trigNet === threshNet);

        // Find connected timing resistors R1 (VCC to DISCH) and R2 (DISCH to THRESH/TRIG), and timing Cap C
        let r1Val = 10000; // 10k default
        let r2Val = 47000; // 47k default
        let cVal = 10e-6;  // 10uF default
        let foundR1 = false;
        let foundR2 = false;
        let foundC = false;

        for (const compItem of state.components.values()) {
          if (compItem.type === 'resistor') {
            const res = compItem as ResistorComponent;
            const p1 = res.pins[0]?.contactId ? contactToNetId.get(res.pins[0].contactId) : null;
            const p2 = res.pins[1]?.contactId ? contactToNetId.get(res.pins[1].contactId) : null;
            const rOhms = getResistanceInOhms(res);
            if ((p1 === vccNetId && p2 === dischNet) || (p2 === vccNetId && p1 === dischNet)) {
              r1Val = rOhms;
              foundR1 = true;
            }
            if ((p1 === dischNet && p2 === threshNet) || (p2 === dischNet && p1 === threshNet)) {
              r2Val = rOhms;
              foundR2 = true;
            }
          } else if (compItem.type === 'capacitor') {
            const cap = compItem as CapacitorComponent;
            const p1 = cap.pins[0]?.contactId ? contactToNetId.get(cap.pins[0].contactId) : null;
            const p2 = cap.pins[1]?.contactId ? contactToNetId.get(cap.pins[1].contactId) : null;
            if ((p1 === threshNet && p2 === gndNetId) || (p2 === threshNet && p1 === gndNetId)) {
              cVal = getCapacitanceInFarads(cap);
              foundC = true;
            }
          }
        }

        const isAstableActive = isAstableWired || (foundR1 && foundR2 && foundC);

        let outVoltage = 0.05;
        let outLogic: LogicState = 0;
        let outFreq = 2.0;

        if (vReset < 0.7) {
          // Reset pin held LOW forces output LOW
          outVoltage = 0.05;
          outLogic = 0;
        } else if (isAstableActive) {
          // Astable formula: f = 1.44 / ((R1 + 2*R2) * C)
          const f = Math.max(0.1, Math.min(200000, 1.44 / ((r1Val + 2 * r2Val) * Math.max(1e-12, cVal))));
          outFreq = f;
          const tHigh = 0.693 * (r1Val + r2Val) * cVal;
          const tLow = 0.693 * r2Val * cVal;
          const period = tHigh + tLow;

          const phaseT = ((time % period) + period) % period;
          const isHigh = phaseT < tHigh;

          outLogic = isHigh ? 1 : 0;
          outVoltage = isHigh ? (vccVoltage - 0.25) : 0.05;

          // Timing capacitor charging/discharging voltage wave at pin 2/6
          if (threshNet) {
            let vCap = vccVoltage / 3;
            if (isHigh) {
              const frac = Math.min(1.0, Math.max(0.0, phaseT / Math.max(1e-6, tHigh)));
              vCap = (vccVoltage / 3) + (vccVoltage / 3) * (1 - Math.exp(-frac * 3)) / (1 - Math.exp(-3));
            } else {
              const tDisch = phaseT - tHigh;
              const frac = Math.min(1.0, Math.max(0.0, tDisch / Math.max(1e-6, tLow)));
              vCap = (2 * vccVoltage / 3) - (vccVoltage / 3) * (1 - Math.exp(-frac * 3)) / (1 - Math.exp(-3));
            }
            attachSource(threshNet, {
              voltage: vCap,
              isGround: false,
              isAc: true,
              frequency: f,
              waveform: 'triangle',
              amplitude: vccVoltage / 6,
              dcOffset: vccVoltage / 2,
              sourceDesc: `NE555 Timing Capacitor (${f.toFixed(1)}Hz Exponential)`,
              internalResistance: 50.0,
            });
          }

          // Discharge pin (Pin 7) conducts to GND during LOW phase
          if (dischNet && !isHigh) {
            attachSource(dischNet, {
              voltage: 0.05,
              isGround: false,
              isAc: false,
              frequency: 0,
              waveform: 'dc',
              amplitude: 0,
              dcOffset: 0.05,
              sourceDesc: 'NE555 Pin 7 Discharge (Conduction to GND)',
              internalResistance: 10.0,
            });
          }
        } else {
          // General Input / Trigger Mode (e.g. Function Generator or DIO connected to Pin 2 TRIG)
          const trigSrc = trigNet ? netSources.get(trigNet) : undefined;
          if (trigSrc && trigSrc.isAc) {
            outFreq = trigSrc.frequency;
            // Function Generator drives Trigger comparator
            const trigActive = trigSrc.voltage < vTrigRef;
            outLogic = trigActive ? 1 : 0;
            outVoltage = outLogic === 1 ? (vccVoltage - 0.25) : 0.05;
          } else if (vTrig < vTrigRef) {
            outLogic = 1;
            outVoltage = vccVoltage - 0.25;
          } else if (vThresh > vThreshRef) {
            outLogic = 0;
            outVoltage = 0.05;
          } else {
            // Default gentle 2.0 Hz astable pulse if no specific trigger wired
            outFreq = 2.0;
            const phase = ((time * outFreq) % 1 + 1) % 1;
            outLogic = phase < 0.5 ? 1 : 0;
            outVoltage = outLogic === 1 ? (vccVoltage - 0.25) : 0.05;
          }
        }

        icPhys.gates.push({
          gateIndex: 0,
          inputA: { contactId: ic.pins[1]?.contactId, voltage: vTrig, logic: vTrig >= 2.0 ? 1 : 0 },
          inputB: { contactId: ic.pins[5]?.contactId, voltage: vThresh, logic: vThresh >= 2.0 ? 1 : 0 },
          output: { contactId: ic.pins[2]?.contactId, voltage: outVoltage, logic: outLogic },
        });

        // Drive Output pin (Pin 3)
        if (outNet) {
          attachSource(outNet, {
            voltage: outVoltage,
            isGround: false,
            isAc: true,
            frequency: outFreq,
            waveform: 'square',
            amplitude: (vccVoltage - 0.25) / 2,
            dcOffset: (vccVoltage - 0.25) / 2,
            sourceDesc: `NE555 Output Pin 3 (${outFreq.toFixed(1)}Hz Square, ${outLogic === 1 ? 'HIGH' : 'LOW'})`,
            internalResistance: 20.0,
          });
        }
      } else {
        // Gate mapping for standard 14-pin DIPs
        const evaluateGateLogic = (inAVal: number, inBVal?: number): LogicState => {
          const inAHigh = inAVal >= 2.0;
          const inBHigh = inBVal !== undefined ? inBVal >= 2.0 : undefined;

          switch (ic.icType) {
            case '74HC00': // NAND
              return (inAHigh && inBHigh) ? 0 : 1;
            case '74HC02': // NOR
              return (inAHigh || inBHigh) ? 0 : 1;
            case '74HC04': // NOT
              return inAHigh ? 0 : 1;
            case '74HC08': // AND
              return (inAHigh && inBHigh) ? 1 : 0;
            case '74HC32': // OR
              return (inAHigh || inBHigh) ? 1 : 0;
            case '74HC86': // XOR
            case '7486':
              return (inAHigh !== inBHigh) ? 1 : 0;
            default:
              return 0;
          }
        };

        // Define gate pins based on IC type
        interface GatePinConfig {
          a: number;
          b?: number;
          out: number;
        }

        const gateConfigs: GatePinConfig[] =
          ic.icType === '74HC04'
            ? [
                { a: 0, out: 1 },
                { a: 2, out: 3 },
                { a: 4, out: 5 },
                { a: 8, out: 7 },
                { a: 10, out: 9 },
                { a: 12, out: 11 },
              ]
            : ic.icType === '74HC02'
            ? [
                { out: 0, a: 1, b: 2 },
                { out: 3, a: 4, b: 5 },
                { out: 9, a: 7, b: 8 },
                { out: 12, a: 10, b: 11 },
              ]
            : [
                { a: 0, b: 1, out: 2 },
                { a: 3, b: 4, out: 5 },
                { a: 8, b: 9, out: 7 },
                { a: 11, b: 12, out: 10 },
              ];

        gateConfigs.forEach((cfg, idx) => {
          const pinA = ic.pins[cfg.a];
          const pinB = cfg.b !== undefined ? ic.pins[cfg.b] : undefined;
          const pinOut = ic.pins[cfg.out];

          const netA = pinA?.contactId ? contactToNetId.get(pinA.contactId) : undefined;
          const netB = pinB?.contactId ? contactToNetId.get(pinB.contactId) : undefined;
          const outNet = pinOut?.contactId ? contactToNetId.get(pinOut.contactId) : undefined;

          const valA = netA && netSources.has(netA) ? netSources.get(netA)!.voltage : (netA ? (netVoltages.get(netA) ?? 0) : 0);
          const valB = netB && netSources.has(netB) ? netSources.get(netB)!.voltage : (netB ? (netVoltages.get(netB) ?? 0) : undefined);

          const outLogic = evaluateGateLogic(valA, valB);
          const outVoltage = outLogic === 1 ? 5.0 : 0.05;

          // Check if driven by AC (such as Function Generator AO 0)
          const srcA = netA ? netSources.get(netA) : undefined;
          const srcB = netB ? netSources.get(netB) : undefined;
          const isInputAc = Boolean((srcA && srcA.isAc) || (srcB && srcB.isAc));
          const acFreq = (srcA && srcA.isAc ? srcA.frequency : 0) || (srcB && srcB.isAc ? srcB.frequency : 0) || 100;

          icPhys.gates.push({
            gateIndex: idx,
            inputA: { contactId: pinA?.contactId, voltage: valA, logic: valA >= 2.0 ? 1 : 0 },
            inputB: pinB ? { contactId: pinB.contactId, voltage: valB ?? 0, logic: (valB ?? 0) >= 2.0 ? 1 : 0 } : undefined,
            output: { contactId: pinOut?.contactId, voltage: outVoltage, logic: outLogic },
          });

          // Drive the output net
          if (outNet) {
            attachSource(outNet, {
              voltage: outVoltage,
              isGround: false,
              isAc: isInputAc,
              frequency: acFreq,
              waveform: isInputAc ? 'square' : 'dc',
              amplitude: isInputAc ? 2.475 : 0,
              dcOffset: isInputAc ? 2.525 : outVoltage,
              sourceDesc: isInputAc
                ? `${ic.icType} Gate ${idx + 1} Output (${acFreq}Hz Square)`
                : `${ic.icType} Gate ${idx + 1} Output (${outLogic === 1 ? 'HIGH 5.0V' : 'LOW 0.0V'})`,
              internalResistance: 50.0,
            });
          }
        });
      }
    }

    icPhysicsMap.set(ic.id, icPhys);
  }

  // 4. Solve Resistor Network (Ohm's Law, Voltage Dividers, KCL)
  // Construct graph of nets connected via resistors
  interface ResistorEdge {
    resistorId: string;
    net1: string;
    net2: string;
    resistance: number;
  }

  const resistorEdges: ResistorEdge[] = [];
  const resistorMap = new Map<string, ResistorComponent>();

  for (const comp of state.components.values()) {
    if (comp.type === 'resistor') {
      const res = comp as ResistorComponent;
      resistorMap.set(res.id, res);
      const pin1 = res.pins[0]?.contactId ? contactToNetId.get(res.pins[0].contactId) : null;
      const pin2 = res.pins[1]?.contactId ? contactToNetId.get(res.pins[1].contactId) : null;
      if (pin1 && pin2 && pin1 !== pin2) {
        resistorEdges.push({
          resistorId: res.id,
          net1: pin1,
          net2: pin2,
          resistance: getResistanceInOhms(res),
        });
      }
    }
  }

  // Update seed fixed source nets for iterative nodal solver
  for (const [netId, src] of netSources.entries()) {
    netVoltages.set(netId, src.voltage);
    netWaveforms.set(netId, src);
  }

  // Identify all nets involved in resistor connections
  const activeNets = new Set<string>();
  for (const edge of resistorEdges) {
    activeNets.add(edge.net1);
    activeNets.add(edge.net2);
  }

  // Solve node voltages via nodal relaxation / Gauss-Seidel for any resistor dividers
  for (let iter = 0; iter < 40; iter++) {
    let maxChange = 0;
    for (const net of activeNets) {
      // If this net has a stiff voltage source, it holds its voltage
      if (netSources.has(net)) continue;

      let conductanceSum = 0;
      let currentSum = 0;

      for (const edge of resistorEdges) {
        if (edge.net1 === net) {
          const vOther = netVoltages.get(edge.net2) ?? 0;
          const g = 1 / edge.resistance;
          conductanceSum += g;
          currentSum += vOther * g;
        } else if (edge.net2 === net) {
          const vOther = netVoltages.get(edge.net1) ?? 0;
          const g = 1 / edge.resistance;
          conductanceSum += g;
          currentSum += vOther * g;
        }
      }

      if (conductanceSum > 0) {
        const nextV = currentSum / conductanceSum;
        const curV = netVoltages.get(net) ?? 0;
        const change = Math.abs(nextV - curV);
        if (change > maxChange) maxChange = change;
        netVoltages.set(net, nextV);
      }
    }
    if (maxChange < 0.001) break;
  }

  // Determine AC waveforms & Thévenin resistance propagation across resistors
  for (const edge of resistorEdges) {
    const src1 = netWaveforms.get(edge.net1);
    const src2 = netWaveforms.get(edge.net2);

    if (src1 && src1.isAc && !src2) {
      const vDivider = (netVoltages.get(edge.net2) ?? 0) / (netVoltages.get(edge.net1) || 1);
      const ratio = Math.min(1.0, Math.max(0.0, Math.abs(vDivider)));
      netWaveforms.set(edge.net2, {
        ...src1,
        voltage: netVoltages.get(edge.net2) ?? 0,
        amplitude: src1.amplitude * (ratio > 0.05 ? ratio : 1.0),
        dcOffset: netVoltages.get(edge.net2) ?? 0,
        sourceDesc: `${src1.sourceDesc} (via ${edge.resistance >= 1000 ? (edge.resistance / 1000).toFixed(1) + 'k' : edge.resistance}Ω Resistor)`,
      });
    } else if (src2 && src2.isAc && !src1) {
      const vDivider = (netVoltages.get(edge.net1) ?? 0) / (netVoltages.get(edge.net2) || 1);
      const ratio = Math.min(1.0, Math.max(0.0, Math.abs(vDivider)));
      netWaveforms.set(edge.net1, {
        ...src2,
        voltage: netVoltages.get(edge.net1) ?? 0,
        amplitude: src2.amplitude * (ratio > 0.05 ? ratio : 1.0),
        dcOffset: netVoltages.get(edge.net1) ?? 0,
        sourceDesc: `${src2.sourceDesc} (via ${edge.resistance >= 1000 ? (edge.resistance / 1000).toFixed(1) + 'k' : edge.resistance}Ω Resistor)`,
      });
    }
  }

  // 5. Solve Capacitors & Dynamic RC Filter Dynamics
  const capacitorPhysicsMap = new Map<string, CapacitorPhysics>();

  for (const comp of state.components.values()) {
    if (comp.type !== 'capacitor') continue;
    const cap = comp as CapacitorComponent;
    const pin1 = cap.pins[0]?.contactId ? contactToNetId.get(cap.pins[0].contactId) : null;
    const pin2 = cap.pins[1]?.contactId ? contactToNetId.get(cap.pins[1].contactId) : null;
    if (!pin1 || !pin2) continue;

    const v1 = netVoltages.get(pin1) ?? 0;
    const v2 = netVoltages.get(pin2) ?? 0;
    const capVoltage = Math.abs(v1 - v2);
    const cFarads = getCapacitanceInFarads(cap);

    // Calculate Thévenin resistance connected to this capacitor
    let rTh = 1000; // Default 1k
    for (const edge of resistorEdges) {
      if (edge.net1 === pin1 || edge.net2 === pin1 || edge.net1 === pin2 || edge.net2 === pin2) {
        rTh = edge.resistance;
        break;
      }
    }

    const tau = rTh * cFarads; // Time constant in seconds
    const cutoffFreq = 1 / (2 * Math.PI * tau);

    // Check if driven by AC source (Low-pass or high-pass RC filter)
    const acSrc = netWaveforms.get(pin1)?.isAc ? netWaveforms.get(pin1) : netWaveforms.get(pin2)?.isAc ? netWaveforms.get(pin2) : null;

    if (acSrc && acSrc.isAc) {
      const f = acSrc.frequency;
      // RC Low-pass response: |H(f)| = 1 / sqrt(1 + (f / fc)^2)
      const ratio = f / cutoffFreq;
      const gain = 1 / Math.sqrt(1 + ratio * ratio);
      const phaseLag = -Math.atan(ratio);

      // Apply low-pass filter to the capacitor node
      const capNet = (pin2.includes('gnd') || netSources.get(pin2)?.isGround) ? pin1 : pin2;
      const filteredAmp = acSrc.amplitude * gain;

      let filteredV = acSrc.dcOffset;
      if (acSrc.waveform === 'sine') {
        filteredV = acSrc.dcOffset + filteredAmp * Math.sin(2 * Math.PI * f * time + phaseLag);
      } else if (acSrc.waveform === 'square') {
        // Classic exponential charging/discharging curve for square waves!
        const period = 1 / f;
        const halfPeriod = period / 2;
        const phaseT = ((time % period) + period) % period;
        const isHighPhase = phaseT < halfPeriod;
        const tInHalf = isHighPhase ? phaseT : phaseT - halfPeriod;

        // Exponential asymptotic charge: V(t) = V_low + (V_high - V_low) * (1 - exp(-t / tau))
        const expDecay = Math.exp(-tInHalf / Math.max(1e-7, tau));
        if (isHighPhase) {
          filteredV = (acSrc.dcOffset + acSrc.amplitude) - (2 * acSrc.amplitude) * expDecay;
        } else {
          filteredV = (acSrc.dcOffset - acSrc.amplitude) + (2 * acSrc.amplitude) * expDecay;
        }
      } else {
        filteredV = acSrc.dcOffset + filteredAmp * Math.sin(2 * Math.PI * f * time);
      }

      netVoltages.set(capNet, filteredV);
      netWaveforms.set(capNet, {
        ...acSrc,
        voltage: filteredV,
        amplitude: filteredAmp,
        dcOffset: acSrc.dcOffset,
        sourceDesc: `RC Low-Pass Filter (τ=${(tau * 1000).toFixed(2)}ms, fc=${cutoffFreq.toFixed(1)}Hz)`,
      });
    }

    capacitorPhysicsMap.set(cap.id, {
      id: cap.id,
      capacitanceFarads: cFarads,
      voltage: capVoltage,
      currentAmps: (capVoltage / rTh) * Math.exp(-0.001 / Math.max(1e-6, tau)),
      tauSeconds: tau,
      cutoffFreqHz: cutoffFreq,
      node1Id: pin1,
      node2Id: pin2,
    });
  }

  // 6. Solve Resistor Currents and Power Dissipation
  const resistorPhysicsMap = new Map<string, ResistorPhysics>();

  for (const edge of resistorEdges) {
    const v1 = netVoltages.get(edge.net1) ?? 0;
    const v2 = netVoltages.get(edge.net2) ?? 0;
    const vDrop = Math.abs(v1 - v2);
    const currentA = vDrop / edge.resistance;
    const powerW = currentA * currentA * edge.resistance;

    resistorPhysicsMap.set(edge.resistorId, {
      id: edge.resistorId,
      resistanceOhms: edge.resistance,
      voltageDrop: vDrop,
      currentAmps: currentA,
      currentMilliAmps: currentA * 1000,
      powerWatts: powerW,
      node1Id: edge.net1,
      node2Id: edge.net2,
    });
  }

  // 7. Solve LEDs (Diodes: Forward Bias, Conduction Current, Intensity & Overcurrent)
  const ledPhysicsMap = new Map<string, LEDPhysics>();

  for (const comp of state.components.values()) {
    if (comp.type !== 'led') continue;
    const led = comp as LEDComponent;
    const anodeContact = led.pins[0]?.contactId;
    const cathodeContact = led.pins[1]?.contactId;

    if (!anodeContact || !cathodeContact) continue;

    const anodeNet = contactToNetId.get(anodeContact);
    const cathodeNet = contactToNetId.get(cathodeContact);

    const vAnode = anodeNet ? (netVoltages.get(anodeNet) ?? 0) : 0;
    const vCathode = cathodeNet ? (netVoltages.get(cathodeNet) ?? 0) : 0;

    const vf =
      led.forwardVoltage ||
      (led.color === 'red' ? 1.8 :
       led.color === 'green' ? 2.1 :
       led.color === 'blue' ? 3.2 :
       led.color === 'white' ? 3.3 :
       led.color === 'purple' ? 3.4 :
       led.color === 'yellow' ? 2.0 : 2.0);

    const vDiff = vAnode - vCathode;
    const isForwardBiased = vDiff >= Math.min(vf * 0.7, 1.0);
    const isReverseBiased = vDiff < -0.3;

    // Find any series resistor in the loop
    let rSeries = 15; // LED intrinsic dynamic resistance ~15 Ohms
    for (const edge of resistorEdges) {
      if (edge.net1 === anodeNet || edge.net2 === anodeNet || edge.net1 === cathodeNet || edge.net2 === cathodeNet) {
        rSeries += edge.resistance;
      }
    }

    let iAmps = 0;
    if (isForwardBiased) {
      const drop = Math.min(vf, Math.max(0.5, vDiff * 0.85));
      iAmps = Math.max(0.001, (vDiff - drop) / rSeries);
    }

    const iMilliAmps = iAmps * 1000;
    const isCircuitIlluminated = isDaqOn && isForwardBiased && (iMilliAmps >= 0.05 || vDiff >= 0.9);
    const intensity = isCircuitIlluminated ? Math.min(1.0, Math.max(0.65, iMilliAmps / 15.0)) : 0;
    const isOvercurrent = iMilliAmps > (led.maxCurrent ? led.maxCurrent * 1.5 : 30.0); // Burn out risk

    const testMode = Boolean(led.testGlow);
    const isIlluminated = isCircuitIlluminated || (testMode && isDaqOn);
    const effectiveCurrentMilliAmps = testMode && iMilliAmps < 0.5 ? 15.0 : iMilliAmps;
    const effectiveIntensity = testMode && intensity < 0.2 ? 1.0 : intensity;

    let statusText = 'OFF (0.0 mA)';
    if (isOvercurrent) {
      statusText = `⚠️ OVERCURRENT (${iMilliAmps.toFixed(1)} mA) - Needs Series Resistor!`;
    } else if (isCircuitIlluminated) {
      statusText = `Conducting & Glowing (${iMilliAmps.toFixed(1)} mA, Vf=${vf.toFixed(2)}V)`;
    } else if (testMode) {
      statusText = `💡 Test Glow ON (Simulated 15.0 mA, Vf=${vf.toFixed(2)}V)`;
    } else if (isReverseBiased) {
      statusText = `Reverse Biased (${vDiff.toFixed(2)}V) - Blocking`;
    }

    ledPhysicsMap.set(led.id, {
      id: led.id,
      color: led.color,
      forwardVoltage: vf,
      anodeVoltage: vAnode,
      cathodeVoltage: vCathode,
      currentAmps: iAmps,
      currentMilliAmps: effectiveCurrentMilliAmps,
      isIlluminated,
      intensity: effectiveIntensity,
      isOvercurrent,
      isReverseBiased,
      statusText,
    });

    // Update diode operating point voltage clamping on intermediate nets
    if (isCircuitIlluminated && rSeries > 25) {
      const drop = Math.min(vf, Math.max(0.5, vDiff * 0.85));
      if (anodeNet && !netSources.has(anodeNet)) {
        netVoltages.set(anodeNet, vCathode + drop);
      }
      if (cathodeNet && !netSources.has(cathodeNet)) {
        netVoltages.set(cathodeNet, vAnode - drop);
      }
      // Re-solve any series resistors connected to this LED
      for (const edge of resistorEdges) {
        if (edge.net1 === anodeNet || edge.net2 === anodeNet || edge.net1 === cathodeNet || edge.net2 === cathodeNet) {
          const v1 = netVoltages.get(edge.net1) ?? 0;
          const v2 = netVoltages.get(edge.net2) ?? 0;
          const vDrop = Math.abs(v1 - v2);
          const currentA = vDrop / edge.resistance;
          const powerW = currentA * currentA * edge.resistance;
          resistorPhysicsMap.set(edge.resistorId, {
            id: edge.resistorId,
            resistanceOhms: edge.resistance,
            voltageDrop: vDrop,
            currentAmps: currentA,
            currentMilliAmps: currentA * 1000,
            powerWatts: powerW,
            node1Id: edge.net1,
            node2Id: edge.net2,
          });
        }
      }
    }
  }

  // 8. Assemble final PhysicalNode map
  const physicalNodes = new Map<string, PhysicalNode>();
  const contactToNodeMap = new Map<ContactId, PhysicalNode>();

  for (const baseNode of baseNodes.values()) {
    const netId = baseNode.id;
    const v = netVoltages.get(netId) ?? 0;
    const wf = netWaveforms.get(netId);

    const isGnd = wf?.isGround || baseNode.contactIds.has('daq-agnd1') || baseNode.contactIds.has('daq-agnd2') || baseNode.contactIds.has('daq-dgnd');

    let desc = wf?.sourceDesc || 'Passive Breadboard Net';
    if (isGnd) desc = 'Ground Reference (0.0V)';

    const pNode: PhysicalNode = {
      id: netId,
      contactIds: baseNode.contactIds,
      voltage: v,
      dcVoltage: wf?.dcOffset ?? v,
      vpp: wf?.isAc ? wf.amplitude * 2 : 0,
      rms: wf?.isAc ? (wf.waveform === 'sine' ? wf.amplitude / Math.SQRT2 : wf.amplitude) : Math.abs(v),
      frequency: wf?.isAc ? wf.frequency : 0,
      waveformType: wf?.isAc ? wf.waveform : (Math.abs(v) > 0.05 ? 'dc' : (isGnd ? 'dc' : 'open')),
      phase: wf?.isAc ? (wf as any).phase || 0 : 0,
      isGround: Boolean(isGnd),
      sourceDesc: desc,
    };

    physicalNodes.set(netId, pNode);
    for (const c of baseNode.contactIds) {
      contactToNodeMap.set(c, pNode);
    }
  }

  return {
    nodes: physicalNodes,
    contactToNodeMap,
    resistors: resistorPhysicsMap,
    capacitors: capacitorPhysicsMap,
    leds: ledPhysicsMap,
    ics: icPhysicsMap,
    time,
  };
}

// ─── Direct Physical Inquiries for Instruments ───────────────────────────────

/**
 * Calculates the exact equivalent resistance between two contacts (e.g. for DMM Ohms mode).
 * Works across single resistors, resistors in series, or resistors in parallel.
 */
export function calculateEquivalentResistance(
  contactA: string,
  contactB: string,
  state: Project,
): number | 'open' {
  const result = solveCircuitPhysics(state, 0);
  const nodeA = result.contactToNodeMap.get(contactA);
  const nodeB = result.contactToNodeMap.get(contactB);

  if (!nodeA || !nodeB || nodeA.id === nodeB.id) {
    if (nodeA && nodeB && nodeA.id === nodeB.id) return 0.1; // Direct short / continuity
    return 'open';
  }

  // Look for direct resistor between nodeA and nodeB
  const parallelResistors: number[] = [];
  for (const r of result.resistors.values()) {
    if (
      (r.node1Id === nodeA.id && r.node2Id === nodeB.id) ||
      (r.node1Id === nodeB.id && r.node2Id === nodeA.id)
    ) {
      parallelResistors.push(r.resistanceOhms);
    }
  }

  if (parallelResistors.length > 0) {
    // 1 / Req = 1/R1 + 1/R2 ...
    const totalConductance = parallelResistors.reduce((sum, r) => sum + 1 / r, 0);
    return Math.round((1 / totalConductance) * 10) / 10;
  }

  // Check for 2 resistors in series connected via an intermediate node
  for (const r1 of result.resistors.values()) {
    const interNode = r1.node1Id === nodeA.id ? r1.node2Id : r1.node2Id === nodeA.id ? r1.node1Id : null;
    if (interNode) {
      for (const r2 of result.resistors.values()) {
        if (r1.id === r2.id) continue;
        if (
          (r2.node1Id === interNode && r2.node2Id === nodeB.id) ||
          (r2.node2Id === interNode && r2.node1Id === nodeB.id)
        ) {
          return r1.resistanceOhms + r2.resistanceOhms;
        }
      }
    }
  }

  return 'open';
}

/**
 * Calculates diode forward drop between two contacts (e.g. for DMM Diode check mode).
 */
export function calculateDiodeDrop(
  contactAnode: string,
  contactCathode: string,
  state: Project,
): number | 'open' {
  const result = solveCircuitPhysics(state, 0);
  const nodeA = result.contactToNodeMap.get(contactAnode);
  const nodeC = result.contactToNodeMap.get(contactCathode);

  if (!nodeA || !nodeC) return 'open';

  for (const led of result.leds.values()) {
    const comp = state.components.get(led.id);
    if (!comp || !comp.pins) continue;
    const aPin = comp.pins[0]?.contactId;
    const cPin = comp.pins[1]?.contactId;
    if (aPin && cPin) {
      const aNet = result.contactToNodeMap.get(aPin);
      const cNet = result.contactToNodeMap.get(cPin);
      if (aNet?.id === nodeA.id && cNet?.id === nodeC.id) {
        return led.forwardVoltage;
      }
    }
  }

  return 'open';
}
