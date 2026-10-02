import { Project, WaveformType } from '../model/types';
import { solveCircuitPhysics, PhysicalNode } from './circuitPhysics';

export interface DaqSignalInfo {
  /** Instantaneous voltage at time t (Volts) */
  voltage: number;
  /** Peak-to-peak voltage (Volts) */
  vpp: number;
  /** RMS voltage (Volts) */
  rms: number;
  /** Frequency (Hz) */
  freq: number;
  /** Signal category */
  type: 'open' | 'dc' | 'ac';
  /** Waveform type if AC */
  waveform?: WaveformType;
  /** DC Offset (Volts) */
  dcOffset?: number;
  /** Peak amplitude (Volts) */
  amplitude?: number;
  /** Human-readable description of what signal source is driving this pin */
  sourceDescription: string;
}

/**
 * Calculates the exact instantaneous signal and waveform measurements for any
 * DAQ terminal (or breadboard contact) using the real-world circuit physics engine.
 */
export function getDaqSignal(
  targetContactId: string,
  state: Project,
  time: number
): DaqSignalInfo {
  // If myDAQ hardware is powered off, all DAQ terminals are de-energized
  const isDaqOn = state.instruments.daq ? state.instruments.daq.enabled : true;
  if (!isDaqOn) {
    return {
      voltage: 0,
      vpp: 0,
      rms: 0,
      freq: 0,
      type: 'open',
      sourceDescription: 'myDAQ Power is OFF (De-energized)',
    };
  }

  // Solve the complete physical circuit network
  const physics = solveCircuitPhysics(state, time);

  // Handle Differential Analog Inputs: AI 0 (+/-) and AI 1 (+/-)
  if (targetContactId === 'daq-ai0_p') {
    const nodePlus = physics.contactToNodeMap.get('daq-ai0_p');
    const nodeMinus = physics.contactToNodeMap.get('daq-ai0_m');

    const vPlus = nodePlus ? nodePlus.voltage : 0;
    const vMinus = nodeMinus ? nodeMinus.voltage : 0;
    const diffV = vPlus - vMinus;

    if (!nodePlus && !nodeMinus) {
      return {
        voltage: 0,
        vpp: 0,
        rms: 0,
        freq: 0,
        type: 'open',
        sourceDescription: 'AI 0 (Floating / Not Wired)',
      };
    }

    const activeNode = nodePlus || nodeMinus!;
    const isAc = activeNode.waveformType !== 'dc' && activeNode.waveformType !== 'open';

    return {
      voltage: diffV,
      vpp: isAc ? activeNode.vpp : 0,
      rms: isAc ? activeNode.rms : Math.abs(diffV),
      freq: isAc ? activeNode.frequency : 0,
      type: isAc ? 'ac' : (Math.abs(diffV) > 0.02 ? 'dc' : 'open'),
      waveform: isAc ? (activeNode.waveformType as WaveformType) : undefined,
      dcOffset: activeNode.dcVoltage - vMinus,
      amplitude: isAc ? activeNode.vpp / 2 : 0,
      sourceDescription: `AI 0 [Diff]: ${activeNode.sourceDesc}`,
    };
  }

  if (targetContactId === 'daq-ai1_p') {
    const nodePlus = physics.contactToNodeMap.get('daq-ai1_p');
    const nodeMinus = physics.contactToNodeMap.get('daq-ai1_m');

    const vPlus = nodePlus ? nodePlus.voltage : 0;
    const vMinus = nodeMinus ? nodeMinus.voltage : 0;
    const diffV = vPlus - vMinus;

    if (!nodePlus && !nodeMinus) {
      return {
        voltage: 0,
        vpp: 0,
        rms: 0,
        freq: 0,
        type: 'open',
        sourceDescription: 'AI 1 (Floating / Not Wired)',
      };
    }

    const activeNode = nodePlus || nodeMinus!;
    const isAc = activeNode.waveformType !== 'dc' && activeNode.waveformType !== 'open';

    return {
      voltage: diffV,
      vpp: isAc ? activeNode.vpp : 0,
      rms: isAc ? activeNode.rms : Math.abs(diffV),
      freq: isAc ? activeNode.frequency : 0,
      type: isAc ? 'ac' : (Math.abs(diffV) > 0.02 ? 'dc' : 'open'),
      waveform: isAc ? (activeNode.waveformType as WaveformType) : undefined,
      dcOffset: activeNode.dcVoltage - vMinus,
      amplitude: isAc ? activeNode.vpp / 2 : 0,
      sourceDescription: `AI 1 [Diff]: ${activeNode.sourceDesc}`,
    };
  }

  // Lookup target contact in solved physical nodes
  const node = physics.contactToNodeMap.get(targetContactId);
  if (!node) {
    return {
      voltage: 0,
      vpp: 0,
      rms: 0,
      freq: 0,
      type: 'open',
      sourceDescription: 'Floating Contact (Open Circuit)',
    };
  }

  const isAc = node.waveformType !== 'dc' && node.waveformType !== 'open';

  return {
    voltage: node.voltage,
    vpp: isAc ? node.vpp : 0,
    rms: isAc ? node.rms : Math.abs(node.voltage),
    freq: isAc ? node.frequency : 0,
    type: isAc ? 'ac' : (Math.abs(node.voltage) > 0.02 ? 'dc' : 'open'),
    waveform: isAc ? (node.waveformType as WaveformType) : undefined,
    dcOffset: node.dcVoltage,
    amplitude: isAc ? node.vpp / 2 : 0,
    sourceDescription: node.sourceDesc,
  };
}
