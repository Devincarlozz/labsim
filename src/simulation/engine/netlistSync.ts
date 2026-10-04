/**
 * netlistSync.ts: Synchronizes Breadboard & Wires to the SimEngine Netlist
 * Maps physical breadboard contacts, wires, and placed IC components into
 * discrete engine pins, pure components, and nets.
 */

import { Project, ICComponent } from '../../model/types';
import { deriveElectricalNodes } from '../../model/connectivity';
import { SimEngine } from './SimEngine';
import { GateICComponent, NE555Component, DFlipFlopComponent, OpAmp741Component } from './GateModel';

/**
 * Recompiles the complete netlist into the SimEngine from current project state.
 */
export function syncNetlistToEngine(engine: SimEngine, project: Project): void {
  // 1. Sync DAQ power state and settings
  const daqOn = (project.instruments.daq?.enabled !== false) && (project.simulation.status === 'running');
  engine.daq.power(daqOn);

  // Sync FGEN settings
  if (project.instruments.functionGenerator) {
    const fgen = project.instruments.functionGenerator;
    engine.daq.fgen = {
      waveform: (fgen.waveform as 'sine' | 'square' | 'triangle') || 'sine',
      frequency: fgen.frequency || 1000,
      amplitude: fgen.amplitude || 1.0,
      dcOffset: fgen.dcOffset || 0.0,
      enabled: fgen.enabled !== false,
    };
  }

  // Sync VPS settings
  if (project.instruments.vps) {
    const vps = project.instruments.vps;
    engine.daq.vps = {
      posVoltage: vps.posVoltage ?? 12.0,
      negVoltage: vps.negVoltage ?? 0.0,
      enabled: vps.enabled !== false,
    };
  }

  // Sync DO bits from store
  const dioBits = project.instruments.daq?.dioBits || [0, 0, 0, 0, 0, 0, 0, 0];
  const dioDirections = project.instruments.daq?.dioDirection || [true, true, true, true, false, false, false, false];

  for (let i = 0; i < 8; i++) {
    engine.daq.setDigitalOut(i, dioBits[i] === 1 ? 1 : 0);
  }

  // 2. Clear old circuit components from engine (retaining DAQ)
  engine.clearComponentsExceptDaq();
  engine.clearNets();

  // 3. Register all IC components placed on the breadboard
  const contactToComponentPinMap = new Map<string, string>(); // contactId -> pinId (e.g. "t-e10" -> "U1.pin1")

  for (const comp of project.components.values()) {
    if (comp.type === 'ic') {
      const ic = comp as ICComponent;
      let simComp;
      if (ic.icType === 'NE555') {
        simComp = new NE555Component(ic.id);
      } else if (ic.icType === 'LM741' || ic.icType === '741') {
        simComp = new OpAmp741Component(ic.id);
      } else if (ic.icType === '7474' || ic.icType === '74HC74') {
        simComp = new DFlipFlopComponent(ic.id);
      } else {
        simComp = new GateICComponent(ic.id, ic.icType);
      }
      engine.registerComponent(simComp);

      // Map placed pin contacts
      for (let pIdx = 0; pIdx < ic.pins.length; pIdx++) {
        const pin = ic.pins[pIdx];
        if (pin && pin.contactId) {
          const pinNumber = pIdx + 1;
          contactToComponentPinMap.set(pin.contactId, `${ic.id}.pin${pinNumber}`);
        }
      }
    }
  }

  // 4. Derive base electrical nets from wires and breadboard socket tracks
  const electricalNodes = deriveElectricalNodes(
    project.breadboard,
    project.wires,
    project.components
  );

  // 5. Connect pins to nets
  for (const [nodeId, elNode] of electricalNodes.entries()) {
    const connectedPinIds: string[] = [];
    const addPin = (pinId: string) => {
      if (!connectedPinIds.includes(pinId)) {
        connectedPinIds.push(pinId);
      }
    };

    // First collect all component pins on this electrical node and check for active output drivers
    let hasComponentOutputDriver = false;
    for (const cId of elNode.contactIds) {
      const compPinId = contactToComponentPinMap.get(cId);
      if (compPinId) {
        addPin(compPinId);
        const pObj = engine.pins.get(compPinId);
        if (pObj && (pObj.dir === 'out' || pObj.dir === 'inout')) {
          hasComponentOutputDriver = true;
        }
      }
    }

    for (const cId of elNode.contactIds) {
      // Check for DAQ Terminals
      if (cId.startsWith('daq-')) {
        if (cId === 'daq-v5v') addPin('daq.V5V');
        else if (cId === 'daq-p15v') addPin('daq.P15V');
        else if (cId === 'daq-n15v') addPin('daq.N15V');
        else if (cId === 'daq-dgnd') addPin('daq.DGND');
        else if (cId === 'daq-agnd1') addPin('daq.AGND1');
        else if (cId === 'daq-agnd2') addPin('daq.AGND2');
        else if (cId === 'daq-ao0') addPin('daq.AO0');
        else if (cId === 'daq-ao1') addPin('daq.AO1');
        else if (cId === 'daq-ai0_p') addPin('daq.AI0_P');
        else if (cId === 'daq-ai0_m') addPin('daq.AI0_M');
        else if (cId === 'daq-ai1_p') addPin('daq.AI1_P');
        else if (cId === 'daq-ai1_m') addPin('daq.AI1_M');
        else {
          for (let i = 0; i < 8; i++) {
            if (cId === `daq-dio${i}`) {
              // When a component output is driving this net, or DIO is configured as input, use DI only
              const isOutput = !hasComponentOutputDriver && (dioDirections[i] !== false);
              if (isOutput) {
                addPin(`daq.DO${i}`);
              }
              // Always add DI for reading back the net voltage
              addPin(`daq.DI${i}`);
            }
          }
        }
      }

      // Check for Breadboard Power/Ground Rails
      if (cId.startsWith('r-0-') || cId.startsWith('r-2-')) {
        // Top and bottom +5V power rails
        addPin('daq.V5V');
      } else if (cId.startsWith('r-1-') || cId.startsWith('r-3-')) {
        // Top and bottom GND rails
        addPin('daq.DGND');
      }
    }

    if (connectedPinIds.length > 0) {
      engine.addNet(nodeId, connectedPinIds);
    }
  }

  // 6. Connect isolated DAQ output pins into nets so they hold their voltages
  for (let i = 0; i < 8; i++) {
    const doPinId = `daq.DO${i}`;
    if (!engine.pinToNetMap.has(doPinId)) {
      engine.addNet(`net-do${i}`, [doPinId]);
    }
    const diPinId = `daq.DI${i}`;
    if (!engine.pinToNetMap.has(diPinId)) {
      engine.addNet(`net-di${i}`, [diPinId]);
    }
  }

  if (!engine.pinToNetMap.has('daq.V5V')) engine.addNet('net-v5v', ['daq.V5V']);
  if (!engine.pinToNetMap.has('daq.P15V')) engine.addNet('net-p15v', ['daq.P15V']);
  if (!engine.pinToNetMap.has('daq.N15V')) engine.addNet('net-n15v', ['daq.N15V']);
  if (!engine.pinToNetMap.has('daq.DGND')) engine.addNet('net-dgnd', ['daq.DGND']);
  if (!engine.pinToNetMap.has('daq.AO0')) engine.addNet('net-ao0', ['daq.AO0']);
}
