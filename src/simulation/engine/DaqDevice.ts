/**
 * DaqDevice.ts: Virtual DAQ Hardware Model with NI-Style Task Model
 * Per plan (1).md Sections 6, 7.
 *
 * Power state machine: OFF -> CONNECTING -> READY -> RUNNING
 * Task lifecycle: unreserved -> committed -> running -> done
 * Digital I/O with logic family thresholds (TTL default)
 * Strict resource reservation: one running task per channel
 */

import {
  DaqBuffers,
  DaqState,
  Drive,
  Level,
  LogicFamily,
  Pin,
  PinIO,
  SimComponent,
  Task,
  TaskKind,
  TaskState,
  TTL_FAMILY,
  classifyVoltage,
} from './types';

export class DaqDevice implements SimComponent {
  public id: string = 'daq';
  public name: string = 'NI myDAQ';
  public state: DaqState = 'OFF';
  public pins: Pin[] = [];
  public family: LogicFamily = TTL_FAMILY;

  // Tasks (NI-style)
  public tasks: Map<string, Task> = new Map();
  private nextTaskId: number = 0;

  // Pull configuration per DI line: null = no pull, 'up' = pull-up, 'down' = pull-down
  public diPulls: Array<null | 'up' | 'down'> = [null, null, null, null, null, null, null, null];

  // Buffers (legacy compat)
  public buffers: DaqBuffers = {
    di: ['Z', 'Z', 'Z', 'Z', 'Z', 'Z', 'Z', 'Z'],
    do: [0, 0, 0, 0, 0, 0, 0, 0],
    ai0: new Array(1000).fill(0),
    ai1: new Array(1000).fill(0),
    ao0: 0,
    ao0_buffer: new Array(1000).fill(0),
    ao1: 0,
    vpsPos: 12.0,
    vpsNeg: 0.0,
    counter: 0,
    isAi0Connected: false,
    isAi1Connected: false,
  };

  public isAi0Connected = false;
  public isAi1Connected = false;
  private aiBufferIndex = 0;
  private aoBufferIndex = 0;
  private lastCtrLevel: Level = 'Z';

  // FGEN settings
  public fgen = {
    waveform: 'sine' as 'sine' | 'square' | 'triangle',
    frequency: 1000,
    amplitude: 1.0,
    dcOffset: 0.0,
    enabled: true,
  };

  // VPS settings
  public vps = {
    posVoltage: 12.0,
    negVoltage: 0.0,
    enabled: true,
  };

  constructor() {
    this.initPins();
  }

  private initPins(): void {
    this.pins = [];

    // Digital Outputs DO 0..7 (push-pull drivers)
    for (let i = 0; i < 8; i++) {
      this.pins.push({
        id: `daq.DO${i}`,
        owner: 'daq',
        dir: 'out',
        drive: { mode: 'none', volts: 0 },
      });
    }

    // Digital Inputs DI 0..7 (sense only)
    for (let i = 0; i < 8; i++) {
      this.pins.push({
        id: `daq.DI${i}`,
        owner: 'daq',
        dir: 'in',
        drive: { mode: 'none', volts: 0 },
      });
    }

    // Counter pin CTR0
    this.pins.push({
      id: 'daq.CTR0',
      owner: 'daq',
      dir: 'in',
      drive: { mode: 'none', volts: 0 },
    });

    // Analog Outputs (AO 0, AO 1)
    this.pins.push({ id: 'daq.AO0', owner: 'daq', dir: 'out', drive: { mode: 'none', volts: 0 } });
    this.pins.push({ id: 'daq.AO1', owner: 'daq', dir: 'out', drive: { mode: 'none', volts: 0 } });

    // Analog Inputs (Differential AI0+, AI0-, AI1+, AI1-)
    this.pins.push({ id: 'daq.AI0_P', owner: 'daq', dir: 'in', drive: { mode: 'none', volts: 0 } });
    this.pins.push({ id: 'daq.AI0_M', owner: 'daq', dir: 'in', drive: { mode: 'none', volts: 0 } });
    this.pins.push({ id: 'daq.AI1_P', owner: 'daq', dir: 'in', drive: { mode: 'none', volts: 0 } });
    this.pins.push({ id: 'daq.AI1_M', owner: 'daq', dir: 'in', drive: { mode: 'none', volts: 0 } });

    // Constant Power & Ground Rails
    this.pins.push({ id: 'daq.V5V', owner: 'daq', dir: 'out', drive: { mode: 'none', volts: 0 } });
    this.pins.push({ id: 'daq.P15V', owner: 'daq', dir: 'out', drive: { mode: 'none', volts: 0 } });
    this.pins.push({ id: 'daq.N15V', owner: 'daq', dir: 'out', drive: { mode: 'none', volts: 0 } });
    this.pins.push({ id: 'daq.DGND', owner: 'daq', dir: 'out', drive: { mode: 'push-pull', volts: 0, level: 0 } });
    this.pins.push({ id: 'daq.AGND1', owner: 'daq', dir: 'out', drive: { mode: 'push-pull', volts: 0, level: 0 } });
    this.pins.push({ id: 'daq.AGND2', owner: 'daq', dir: 'out', drive: { mode: 'push-pull', volts: 0, level: 0 } });
  }

  // ─── Power State Machine ────────────────────────────────────────────────

  public power(on: boolean): void {
    if (!on) {
      this.state = 'OFF';
      this.reset();
      // Stop all running tasks
      for (const task of this.tasks.values()) {
        task.state = 'done';
      }
      this.tasks.clear();
      return;
    }
    // Transition: OFF -> CONNECTING -> READY -> RUNNING
    // CONNECTING: scan netlist, register connections (done once)
    this.state = 'CONNECTING';
    // READY: channels have default configuration
    this.state = 'READY';
    // RUNNING: tasks may start, tick loop drives them
    this.state = 'RUNNING';
  }

  public reset(): void {
    // All pins to high-impedance (no drive) except GND which stays at 0V
    for (const p of this.pins) {
      if (p.id.includes('GND')) {
        p.drive = { mode: 'push-pull', volts: 0, level: 0 };
      } else {
        p.drive = { mode: 'none', volts: 0 };
      }
    }
    this.buffers.di.fill('Z');
    this.buffers.ai0.fill(0);
    this.buffers.ai1.fill(0);
    this.buffers.counter = 0;
    this.lastCtrLevel = 'Z';
  }

  // ─── Digital Output API ─────────────────────────────────────────────────

  /**
   * Set digital output level. Converts to drive voltage using logic family.
   * Per plan (1).md Section 7.3: 0 -> VOL, 1 -> VOH
   */
  public setDigitalOut(index: number, level: 0 | 1 | Level): void {
    if (index < 0 || index >= 8) throw new Error(`Invalid DO index: ${index}`);
    // Normalize: treat 'Z' and 'X' as 0 for DO buffer
    const normalizedLevel: 0 | 1 = (level === 1) ? 1 : 0;
    this.buffers.do[index] = normalizedLevel;
  }

  public setAllDigitalOut(levels: (0 | 1 | Level)[]): void {
    for (let i = 0; i < 8 && i < levels.length; i++) {
      this.setDigitalOut(i, levels[i]);
    }
  }

  // ─── NI-Style Task Management (plan (1).md Section 6.3) ─────────────────

  /**
   * Create a new task. Channel belongs to one running task at a time.
   * State order: unreserved -> committed -> running -> done
   */
  public createTask(
    kind: TaskKind,
    channels: string[],
    options?: {
      rate?: number;
      samplesPerChannel?: number;
      mode?: 'on-demand' | 'finite' | 'continuous';
      changeDetection?: boolean;
    }
  ): Task {
    const taskId = `task-${kind}-${this.nextTaskId++}`;
    const task: Task = {
      id: taskId,
      kind,
      channels: [...channels],
      timing: {
        mode: options?.mode || 'on-demand',
        sampleClock: 'internal',
        rate: options?.rate || 1000,
        samplesPerChannel: options?.samplesPerChannel || 1000,
      },
      trigger: { type: 'none' },
      buffer: kind === 'CI' ? new Uint32Array(options?.samplesPerChannel || 1000) : new Float64Array(options?.samplesPerChannel || 1000),
      state: 'unreserved',
      bufferIndex: 0,
      sampleAccum: 0,
    };
    if (options?.changeDetection) {
      task.changeLog = [];
      task.prevValues = channels.map(() => -1);
    }
    this.tasks.set(taskId, task);
    return task;
  }

  /**
   * Commit a task — validate configuration.
   */
  public commitTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.state !== 'unreserved') throw new Error(`Task ${taskId} is not in 'unreserved' state (current: ${task.state})`);
    task.state = 'committed';
  }

  /**
   * Start a task — enforce resource reservation.
   * A channel belongs to one running task at a time (DAQmx rule).
   */
  public startTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    if (task.state !== 'committed' && task.state !== 'unreserved') {
      throw new Error(`Task ${taskId} cannot start from state '${task.state}'`);
    }

    // Check for channel reservation conflicts
    for (const ch of task.channels) {
      for (const [otherId, otherTask] of this.tasks) {
        if (otherId === taskId) continue;
        if (otherTask.state === 'running' && otherTask.channels.includes(ch)) {
          throw new Error(`Resource reservation error: channel '${ch}' is already reserved by running task '${otherId}'`);
        }
      }
    }

    task.state = 'running';
  }

  /**
   * Stop a task and release its channel reservations.
   */
  public stopTask(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task) return;
    task.state = 'done';
  }

  // ─── Tick Step 2: Write Outputs ─────────────────────────────────────────

  /**
   * Step 2 of tick: DAQ drives DO, AO, power pins.
   * Digital outputs use logic family thresholds for voltage conversion.
   */
  public writeOutputs(t: number, io: PinIO): void {
    if (this.state !== 'RUNNING') {
      // Inactive: all output pins no-drive
      for (const p of this.pins) {
        if (p.id.includes('GND')) {
          io.drive(p.id, { mode: 'push-pull', volts: 0, level: 0 });
        } else {
          io.drive(p.id, { mode: 'none', volts: 0 });
        }
      }
      return;
    }

    // 1. Digital Power Rail (+5V) — always driven when RUNNING
    io.drive('daq.V5V', { mode: 'push-pull', volts: 5.0, level: 1 });

    // 2. Variable Power Supplies
    const posV = this.vps.enabled ? this.vps.posVoltage : 0;
    const negV = this.vps.enabled ? -Math.abs(this.vps.negVoltage) : 0;
    this.buffers.vpsPos = posV;
    this.buffers.vpsNeg = negV;
    io.drive('daq.P15V', { mode: 'analog', volts: posV });
    io.drive('daq.N15V', { mode: 'analog', volts: negV });

    // 3. Ground References (0V)
    io.drive('daq.DGND', { mode: 'push-pull', volts: 0, level: 0 });
    io.drive('daq.AGND1', { mode: 'push-pull', volts: 0, level: 0 });
    io.drive('daq.AGND2', { mode: 'push-pull', volts: 0, level: 0 });

    // 4. Digital Outputs (DO 0..7)
    // Per plan (1).md Section 7.3: 0 -> VOL, 1 -> VOH (push-pull)
    for (let i = 0; i < 8; i++) {
      const lvl = this.buffers.do[i] as (0 | 1);
      const volts = lvl === 1 ? this.family.voh : this.family.vol;
      io.drive(`daq.DO${i}`, { mode: 'push-pull', volts, level: lvl });
    }

    // 5. Analog Function Generator Output (AO 0)
    let ao0V = 0;
    const samplesPerTick = 10;
    const dt = 0.001; // 1 ms tick
    if (this.fgen.enabled) {
      const f = this.fgen.frequency;
      const amp = this.fgen.amplitude;
      const offset = this.fgen.dcOffset;
      const wf = this.fgen.waveform;

      if (wf === 'sine') {
        ao0V = offset + amp * Math.sin(2 * Math.PI * f * t);
      } else if (wf === 'square') {
        const phase = ((t * f) % 1 + 1) % 1;
        ao0V = offset + (phase < 0.5 ? amp : -amp);
      } else if (wf === 'triangle') {
        const phase = ((t * f) % 1 + 1) % 1;
        ao0V = offset + (phase < 0.25 ? phase * 4 * amp : phase < 0.75 ? (2 - phase * 4) * amp : (phase * 4 - 4) * amp);
      }

      // Populate high-resolution ao0_buffer
      if (this.buffers.ao0_buffer) {
        for (let s = 0; s < samplesPerTick; s++) {
          const subT = t + (s / samplesPerTick) * dt;
          let subAo0 = 0;
          if (wf === 'sine') {
            subAo0 = offset + amp * Math.sin(2 * Math.PI * f * subT);
          } else if (wf === 'square') {
            const phase = ((subT * f) % 1 + 1) % 1;
            subAo0 = offset + (phase < 0.5 ? amp : -amp);
          } else if (wf === 'triangle') {
            const phase = ((subT * f) % 1 + 1) % 1;
            subAo0 = offset + (phase < 0.25 ? phase * 4 * amp : phase < 0.75 ? (2 - phase * 4) * amp : (phase * 4 - 4) * amp);
          }
          this.buffers.ao0_buffer[this.aoBufferIndex] = subAo0;
          this.aoBufferIndex = (this.aoBufferIndex + 1) % this.buffers.ao0_buffer.length;
        }
      }
    } else {
      if (this.buffers.ao0_buffer) {
        this.buffers.ao0_buffer.fill(0);
      }
    }
    this.buffers.ao0 = ao0V;
    io.drive('daq.AO0', { mode: 'analog', volts: ao0V });

    // 6. Auxiliary AO 1
    io.drive('daq.AO1', { mode: 'none', volts: 0 });
  }

  // ─── Tick Step 6: Sample Inputs ─────────────────────────────────────────

  /**
   * Step 6 of tick: DAQ samples DI, AI, counters.
   * Per plan (1).md Section 7.4: classify net voltage with thresholds.
   */
  public sampleInputs(io: PinIO, t: number = 0, dt: number = 0.001): void {
    if (this.state !== 'RUNNING') {
      this.buffers.di.fill('Z');
      return;
    }

    // 1. Digital Inputs DI 0..7
    // Per plan (1).md Section 7.4: classify using logic family thresholds
    for (let i = 0; i < 8; i++) {
      const reading = io.read(`daq.DI${i}`);
      let level: Level;
      if (reading.volts === null) {
        // Floating — apply pull configuration
        const pull = this.diPulls[i];
        if (pull === 'up') level = 1;
        else if (pull === 'down') level = 0;
        else level = 'Z';  // No pull: reads as 'Z'
      } else {
        level = classifyVoltage(reading.volts, this.family);
      }
      this.buffers.di[i] = level;
    }

    // 2. Frequency Counter Pin CTR0
    const ctrReading = io.read('daq.CTR0');
    const ctrLevel = ctrReading.level;
    if (this.lastCtrLevel === 0 && ctrLevel === 1) {
      this.buffers.counter++;
    }
    this.lastCtrLevel = ctrLevel;

    // 3. Analog Inputs (AI0, AI1 differential)
    const ai0P = io.read('daq.AI0_P');
    const ai0M = io.read('daq.AI0_M');
    // Channel is connected ONLY if at least one terminal is connected to an active net
    const isAi0Connected = ai0P.volts !== null || ai0M.volts !== null;
    this.isAi0Connected = isAi0Connected;
    this.buffers.isAi0Connected = isAi0Connected;

    const ai1P = io.read('daq.AI1_P');
    const ai1M = io.read('daq.AI1_M');
    const isAi1Connected = ai1P.volts !== null || ai1M.volts !== null;
    this.isAi1Connected = isAi1Connected;
    this.buffers.isAi1Connected = isAi1Connected;

    const diff0 = isAi0Connected ? (ai0P.volts ?? 0) - (ai0M.volts ?? 0) : 0;
    const diff1 = isAi1Connected ? (ai1P.volts ?? 0) - (ai1M.volts ?? 0) : 0;

    // Oversample within the tick for waveform fidelity
    const samplesPerTick = 10;
    for (let s = 0; s < samplesPerTick; s++) {
      let subDiff0 = diff0;
      let subDiff1 = diff1;

      if (!isAi0Connected) {
        // Disconnected / floating AI0: clean flatline 0V, NO random bursts or noise
        subDiff0 = 0.0;
      } else if (this.fgen.enabled && Math.abs(diff0 - this.buffers.ao0) < 0.001) {
        const subT = t + (s / samplesPerTick) * dt;
        const f = this.fgen.frequency;
        const amp = this.fgen.amplitude;
        const offset = this.fgen.dcOffset;
        const wf = this.fgen.waveform;
        if (wf === 'sine') {
          subDiff0 = offset + amp * Math.sin(2 * Math.PI * f * subT) - (ai0M.volts ?? 0);
        } else if (wf === 'square') {
          const phase = ((subT * f) % 1 + 1) % 1;
          subDiff0 = offset + (phase < 0.5 ? amp : -amp) - (ai0M.volts ?? 0);
        } else if (wf === 'triangle') {
          const phase = ((subT * f) % 1 + 1) % 1;
          subDiff0 = offset + (phase < 0.25 ? phase * 4 * amp : phase < 0.75 ? (2 - phase * 4) * amp : (phase * 4 - 4) * amp) - (ai0M.volts ?? 0);
        }
      }

      if (!isAi1Connected) {
        subDiff1 = 0.0;
      }

      this.buffers.ai0[this.aiBufferIndex] = subDiff0;
      this.buffers.ai1[this.aiBufferIndex] = subDiff1;
      this.aiBufferIndex = (this.aiBufferIndex + 1) % this.buffers.ai0.length;
    }

    // 4. Process running tasks (change detection, hardware-timed sampling)
    for (const task of this.tasks.values()) {
      if (task.state !== 'running') continue;

      if (task.kind === 'DI' && task.changeLog) {
        // Change-detection DI task
        for (let ci = 0; ci < task.channels.length; ci++) {
          const ch = task.channels[ci];
          const reading = io.read(ch);
          const currentVal = reading.level === 1 ? 1 : 0;
          if (task.prevValues && task.prevValues[ci] !== currentVal) {
            task.changeLog.push({ time: t, value: currentVal });
            task.prevValues[ci] = currentVal;
          }
        }
      }
    }
  }

  public step(_dt: number, _io: PinIO): void {
    // Stepped via writeOutputs and sampleInputs inside SimEngine tick sequence
  }
}
