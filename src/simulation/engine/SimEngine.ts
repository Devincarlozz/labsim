/**
 * SimEngine.ts: Master Deterministic Simulation Engine
 * Per plan (1).md Sections 4, 5, 7, 8, 12.
 *
 * Rules:
 * 1. Single clock: Only SimEngine.tick() advances simulated time.
 * 2. Pins and nets: Components never call each other. They read/write pins via PinIO.
 * 3. Pure models: A component's outputs depend only on its input pins, internal state, and dt.
 * 4. Instruments never touch the circuit: They use DAQ task buffers.
 * 5. UI is read-only: User actions enter as commands.
 *
 * Deterministic tick sequence (plan (1).md Section 8):
 * 1. Apply queued user commands
 * 2. DAQ output side: apply DO writes, advance AO, drive pins
 * 3. Resolve nets
 * 4. Step all components in fixed order (sorted by component id)
 * 5. Resolve nets again. Repeat 4-5 until no net changes (max 8 passes)
 * 6. DAQ input side: sample AI, DI, counters into task buffers
 * 7. Advance simulated time by dt
 * 8. Publish immutable snapshot for UI
 */

import {
  Drive,
  EngineCommand,
  EngineEventLog,
  Level,
  Net,
  Pin,
  PinIO,
  PinReadResult,
  SimComponent,
  SimSnapshot,
  TTL_FAMILY,
  classifyVoltage,
} from './types';
import { DaqDevice } from './DaqDevice';

export class SimEngine {
  public readonly dt: number = 0.001; // 1 ms fixed timestep (1 kHz simulation clock)
  public time: number = 0;           // Simulated time in seconds
  public tickCount: number = 0;      // Monotonic tick counter

  public daq: DaqDevice;
  public components: Map<string, SimComponent> = new Map();
  public pins: Map<string, Pin> = new Map();
  public nets: Map<string, Net> = new Map();
  public pinToNetMap: Map<string, string> = new Map(); // pinId -> netId

  private commandQueue: EngineCommand[] = [];
  private eventLogs: EngineEventLog[] = [];
  private maxLogs: number = 100;

  // Noise policy per plan (1).md Section 12
  public noiseEnabled: boolean = false;
  public noiseSeed: number = 1337;
  private currentPrngState: number = 1337;

  // Latest published snapshot
  private latestSnapshot!: SimSnapshot;

  constructor() {
    this.daq = new DaqDevice();
    this.registerComponent(this.daq);
    this.publishSnapshot();
  }

  /**
   * Seeded LCG PRNG for reproducible noise (plan (1).md Section 12)
   */
  private nextRandom(): number {
    this.currentPrngState = (this.currentPrngState * 1664525 + 1013904223) % 4294967296;
    return this.currentPrngState / 4294967296;
  }

  public setNoise(enabled: boolean, seed: number = 1337): void {
    this.noiseEnabled = enabled;
    this.noiseSeed = seed;
    this.currentPrngState = seed;
  }

  public registerComponent(comp: SimComponent): void {
    this.components.set(comp.id, comp);
    for (const pin of comp.pins) {
      this.pins.set(pin.id, pin);
    }
  }

  public unregisterComponent(id: string): void {
    const comp = this.components.get(id);
    if (!comp) return;
    for (const pin of comp.pins) {
      this.pins.delete(pin.id);
      this.pinToNetMap.delete(pin.id);
    }
    this.components.delete(id);
  }

  public clearComponentsExceptDaq(): void {
    const ids = Array.from(this.components.keys()).filter((id) => id !== 'daq');
    for (const id of ids) {
      this.unregisterComponent(id);
    }
  }

  /**
   * Defines a net connecting multiple pins.
   */
  public addNet(netId: string, pinIds: string[]): void {
    const net: Net = {
      id: netId,
      pins: [...pinIds],
      volts: null,
      level: 'Z',
    };
    this.nets.set(netId, net);
    for (const pid of pinIds) {
      this.pinToNetMap.set(pid, netId);
    }
  }

  public clearNets(): void {
    this.nets.clear();
    this.pinToNetMap.clear();
  }

  public queueCommand(cmd: EngineCommand): void {
    this.commandQueue.push(cmd);
  }

  public logEvent(
    type: 'info' | 'warn' | 'error',
    category: 'daq' | 'net' | 'contention' | 'oscillation' | 'component' | 'task',
    message: string
  ): void {
    const entry: EngineEventLog = {
      timestamp: this.time,
      tick: this.tickCount,
      type,
      category,
      message,
    };
    this.eventLogs.push(entry);
    if (this.eventLogs.length > this.maxLogs) {
      this.eventLogs.shift();
    }
    if (this.latestSnapshot) {
      this.latestSnapshot.events = [...this.eventLogs];
    }
  }

  /**
   * Resolves net voltages and logic levels per plan (1).md Section 5:
   *
   * Net resolution rules:
   * - One driver: net volts = driver volts, level derived from volts
   * - No driver: floating. volts = null, level = 'Z'. Never randomize.
   * - Two or more drivers with different volts: error = 'contention', level = 'X'
   * - Open-drain drivers pull low only
   */
  public resolveNets(): boolean {
    let anyNetChanged = false;
    const family = TTL_FAMILY; // Default classification family

    for (const net of this.nets.values()) {
      const drivers: Array<{ pinId: string; drive: Drive }> = [];

      for (const pinId of net.pins) {
        const pin = this.pins.get(pinId);
        if (!pin) continue;

        // Only output/inout pins with active drive contribute
        if ((pin.dir === 'out' || pin.dir === 'inout') && pin.drive.mode !== 'none') {
          drivers.push({ pinId, drive: pin.drive });
        }
      }

      let newVolts: number | null = null;
      let newLevel: Level = 'Z';
      let newError: 'contention' | undefined = undefined;

      if (drivers.length === 0) {
        // No driver: floating
        newVolts = null;
        newLevel = 'Z';
      } else if (drivers.length === 1) {
        // Single driver
        newVolts = drivers[0].drive.volts;
        newLevel = classifyVoltage(newVolts, family);
      } else {
        // Multiple drivers — check for contention
        const firstVolts = drivers[0].drive.volts;
        const hasContention = drivers.some((d) => Math.abs(d.drive.volts - firstVolts) > 0.1);

        if (hasContention) {
          newError = 'contention';
          newVolts = drivers.reduce((s, d) => s + d.drive.volts, 0) / drivers.length; // average
          newLevel = 'X';
          if (net.error !== 'contention') {
            this.logEvent(
              'error',
              'contention',
              `Bus contention on net ${net.id}: drivers [${drivers.map((d) => `${d.pinId}=${d.drive.volts.toFixed(2)}V`).join(', ')}]`
            );
          }
        } else {
          // All drivers agree
          newVolts = firstVolts;
          newLevel = classifyVoltage(newVolts, family);
        }
      }

      const changed = net.volts !== newVolts || net.level !== newLevel || net.error !== newError;
      if (changed) {
        net.volts = newVolts;
        net.level = newLevel;
        net.error = newError;
        anyNetChanged = true;
      }
    }

    return anyNetChanged;
  }

  /**
   * Creates a PinIO accessor.
   * Per plan (1).md Section 5:
   * - read(pinId) returns { volts, level } from the connected net
   * - drive(pinId, d) sets the pin's drive (components drive nets, never set net levels directly)
   */
  public createPinIO(): PinIO {
    return {
      read: (pinId: string): PinReadResult => {
        const pin = this.pins.get(pinId);
        if (!pin) return { volts: null, level: 'Z' };

        if (pin.dir === 'in' || pin.dir === 'inout') {
          const netId = this.pinToNetMap.get(pinId);
          if (netId) {
            const net = this.nets.get(netId);
            if (net) {
              return { volts: net.volts, level: net.level };
            }
          }
          // Not connected to any net: floating
          return { volts: null, level: 'Z' };
        }

        // Output pin: read own drive
        if (pin.drive.mode !== 'none') {
          return {
            volts: pin.drive.volts,
            level: classifyVoltage(pin.drive.volts, TTL_FAMILY),
          };
        }
        return { volts: null, level: 'Z' };
      },

      drive: (pinId: string, d: Drive): void => {
        const pin = this.pins.get(pinId);
        if (!pin) return;
        if (pin.dir === 'in') {
          this.logEvent('error', 'daq', `Invalid write to input pin: ${pinId}`);
          return;
        }
        pin.drive = { ...d };
      },
    };
  }

  /**
   * Deterministic Tick Sequence per plan (1).md Section 8:
   * 1. Apply queued user commands
   * 2. DAQ output side: apply DO/AO drives
   * 3. Resolve nets
   * 4. Step all components in fixed order (sorted by component id)
   * 5. Resolve nets again. Repeat 4-5 until no net changes (max 8 passes)
   * 6. DAQ input side: sample AI, DI, counters into buffers
   * 7. Advance simulated time by dt
   * 8. Publish immutable snapshot for UI
   */
  public tick(): SimSnapshot {
    const io = this.createPinIO();

    // 1. Apply queued user commands
    while (this.commandQueue.length > 0) {
      const cmd = this.commandQueue.shift()!;
      this.applyCommand(cmd);
    }

    // 2. DAQ writes DO/AO values to its output pins
    this.daq.writeOutputs(this.time, io);

    // 3. Resolve nets
    this.resolveNets();

    // 4 & 5. Step components in sorted order, repeating until settled (max 8 iterations)
    const sortedComponents = Array.from(this.components.values())
      .filter((c) => c.id !== 'daq')
      .sort((a, b) => a.id.localeCompare(b.id));

    let settled = false;
    let iteration = 0;
    const maxIterations = 8;

    while (!settled && iteration < maxIterations) {
      iteration++;

      // Step each component
      for (const comp of sortedComponents) {
        comp.step(this.dt, io);
      }

      // Resolve nets again
      const netChanged = this.resolveNets();
      if (!netChanged) {
        settled = true;
      }
    }

    if (!settled && sortedComponents.length > 0) {
      this.logEvent(
        'warn',
        'oscillation',
        `Combinational logic did not settle after ${maxIterations} iterations at t=${this.time.toFixed(4)}s`
      );
    }

    // 6. DAQ samples DI, AI, and counters into its buffers
    this.daq.sampleInputs(io, this.time, this.dt);

    // Optional seeded noise applied ONLY to connected AI samples (plan (1).md Section 12)
    if (this.noiseEnabled) {
      const noiseAmp = 0.005; // 5mV noise
      const lastIdx = (this.daq.buffers.ai0.length - 1);
      if (this.daq.isAi0Connected) {
        this.daq.buffers.ai0[lastIdx] += (this.nextRandom() - 0.5) * noiseAmp;
      }
      if (this.daq.isAi1Connected) {
        this.daq.buffers.ai1[lastIdx] += (this.nextRandom() - 0.5) * noiseAmp;
      }
    }

    // 7. Advance simulated time by dt
    this.time += this.dt;
    this.tickCount++;

    // 8. Publish an immutable snapshot for the UI
    this.publishSnapshot();
    return this.latestSnapshot;
  }

  private applyCommand(cmd: EngineCommand): void {
    switch (cmd.type) {
      case 'POWER_DAQ':
        this.daq.power(cmd.enabled);
        this.logEvent('info', 'daq', `DAQ power set to ${cmd.enabled ? 'ON' : 'OFF'}`);
        break;
      case 'SET_DIGITAL_OUT':
        this.daq.setDigitalOut(cmd.pinIndex, cmd.level);
        break;
      case 'SET_ALL_DIGITAL_OUT':
        this.daq.setAllDigitalOut(cmd.levels);
        break;
      case 'SET_FGEN':
        this.daq.fgen = {
          waveform: cmd.waveform,
          frequency: cmd.frequency,
          amplitude: cmd.amplitude,
          dcOffset: cmd.dcOffset,
          enabled: cmd.enabled,
        };
        break;
      case 'SET_VPS':
        this.daq.vps = {
          posVoltage: cmd.posVoltage,
          negVoltage: cmd.negVoltage,
          enabled: cmd.enabled,
        };
        break;
      case 'SET_NOISE':
        this.setNoise(cmd.enabled, cmd.seed);
        break;
      case 'UPDATE_NETLIST':
        // Handled via syncFromCircuitModel
        break;
      case 'CREATE_TASK': {
        const t = cmd.task;
        this.daq.createTask(t.kind, t.channels, {
          rate: t.timing.rate,
          samplesPerChannel: t.timing.samplesPerChannel,
          mode: t.timing.mode,
        });
        break;
      }
      case 'START_TASK':
        try {
          this.daq.startTask(cmd.taskId);
        } catch (e: any) {
          this.logEvent('error', 'task', e.message);
        }
        break;
      case 'STOP_TASK':
        this.daq.stopTask(cmd.taskId);
        break;
    }
  }

  private publishSnapshot(): void {
    const netsSnap: Record<string, { level: Level; volts: number | null; pins: string[]; isContested: boolean }> = {};
    for (const [id, n] of this.nets.entries()) {
      netsSnap[id] = {
        level: n.level,
        volts: n.volts,
        pins: [...n.pins],
        isContested: n.error === 'contention',
      };
    }

    const pinsSnap: Record<string, { level: Level; volts: number | null; dir: any; owner: string }> = {};
    for (const [id, p] of this.pins.entries()) {
      const netId = this.pinToNetMap.get(id);
      const net = netId ? this.nets.get(netId) : undefined;
      const volts = p.dir === 'in' && net ? net.volts : (p.drive.mode !== 'none' ? p.drive.volts : null);
      const level = p.dir === 'in' && net ? net.level : (p.drive.mode !== 'none' ? classifyVoltage(p.drive.volts, TTL_FAMILY) : 'Z');
      pinsSnap[id] = {
        level,
        volts,
        dir: p.dir,
        owner: p.owner,
      };
    }

    const compsSnap: Record<string, { id: string; powered: boolean; outputLevels: Record<string, Level> }> = {};
    for (const [id, c] of this.components.entries()) {
      if (id === 'daq') continue;
      const anyComp = c as any;
      compsSnap[id] = {
        id,
        powered: Boolean(anyComp.isPowered),
        outputLevels: { ...(anyComp.outputLevels || {}) },
      };
    }

    const tasksSnap: Record<string, { id: string; kind: any; state: any; channels: string[] }> = {};
    for (const [id, t] of this.daq.tasks.entries()) {
      tasksSnap[id] = {
        id: t.id,
        kind: t.kind,
        state: t.state,
        channels: [...t.channels],
      };
    }

    this.latestSnapshot = {
      time: this.time,
      tick: this.tickCount,
      dt: this.dt,
      daqState: this.daq.state,
      nets: netsSnap,
      pins: pinsSnap,
      daq: {
        di: [...this.daq.buffers.di],
        do: [...this.daq.buffers.do],
        ai0: [...this.daq.buffers.ai0],
        ai1: [...this.daq.buffers.ai1],
        ao0: this.daq.buffers.ao0,
        ao0_buffer: this.daq.buffers.ao0_buffer ? [...this.daq.buffers.ao0_buffer] : undefined,
        ao1: this.daq.buffers.ao1,
        vpsPos: this.daq.buffers.vpsPos,
        vpsNeg: this.daq.buffers.vpsNeg,
        counter: this.daq.buffers.counter,
        isAi0Connected: this.daq.isAi0Connected,
        isAi1Connected: this.daq.isAi1Connected,
      },
      components: compsSnap,
      tasks: tasksSnap,
      events: [...this.eventLogs],
    };
  }

  public getSnapshot(): SimSnapshot {
    return this.latestSnapshot;
  }
}

// Global engine singleton
export const simEngine = new SimEngine();
