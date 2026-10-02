# plan.md: Virtual DAQ simulator, task-based and deterministic, with digital I/O logic

> For the Antigravity agent. Read this whole file first. **Do Phase 0 (audit) and show the findings before changing any code.** Do not redesign the UI. Examples are TypeScript-style; adapt them to the project's real language and framework.

## 1. Problem and goal

The simulator has a virtual DAQ plus functions (logic gates, oscilloscope, function generator, counter). When the DAQ is turned on it should connect to those functions and talk to them **only through its pins**. Today the results look random and do not follow that design.

The fix is to model the DAQ the way NI's software and driver model one: instruments are clients of **tasks**, tasks use **hardware-style clocks and buffers**, and all signals travel through **pins and nets** on **one deterministic clock**.

### Acceptance examples (these must work exactly, every run)

1. **AND gate.** DAQ `DO0` drives gate input A. `DO1` drives input B. Gate output Y goes to `DI0`. `DI0` reads `1` only when `DO0=1` and `DO1=1`.
2. **Gate chain.** `DO0` and `DO1` into an AND gate, its output into an inverter, the inverter output into `DI0`. This gives NAND behavior. Settles within one tick.
3. **Sequential.** `DO0` drives the clock of a D flip-flop, `DO1` drives D, Q goes to `DI0`. Q changes only on the rising edge of `DO0`.
4. **Mixed signal.** Function generator on `AO0` (1 kHz sine) wired to `AI0`. The scope shows the sine. A digital gate output wired to `AI1` shows as a voltage (about 0 V or the logic high level).

## 2. Likely root causes (verify each in Phase 0)

1. Several modules each run their own loop or timer, so update order races.
2. State is duplicated. Gate, DAQ and UI each keep their own copy of pin values.
3. Functions call each other directly instead of connecting through pins and nets.
4. Unseeded randomness (`Math.random`, jitter, noise) sits in the logic path.
5. DAQ "on" does not gate anything. Functions run without a connection.
6. Gate models are not pure functions of their input pins (stale inputs, ignoring VCC/GND).
7. Pin direction is not enforced. Outputs get read as inputs, or two outputs drive one net.
8. The UI mutates simulation state.
9. Instruments read the circuit directly instead of reading DAQ buffers.

## 3. Phase 0: Audit (no code changes)

Produce `AUDIT.md` with:

- Every loop or timer in the codebase and who owns it.
- Every place that holds pin or signal state, and whether it is duplicated.
- Every use of randomness, and whether it feeds logic results.
- How DAQ "on" currently connects to functions (file and function names).
- How the gate computes its output today.
- Which items in section 2 are confirmed, with file and line references.

Stop and show `AUDIT.md` before Phase 1.

## 4. Architecture

One engine owns all state. Everything else is a client.

```
UI (board, instrument panels)   reads snapshots, sends commands only
          |
      SimEngine   single clock, single tick()
          |
  +-------+-----------------------------+
  |       |                             |
Netlist   DAQ device model              Component models
          (tasks, channels, buffers)    (gates, flip-flops, sources, loads)
          |
 Instruments (scope, funcgen, logic analyzer, counter) use DAQ tasks only
```

Rules:

- **One clock.** Only `SimEngine.tick()` advances simulated time. No other timer may change simulation state.
- **Pins and nets.** Components never call each other. They read and write pins. Nets connect pins.
- **Pure models.** A component's outputs depend only on its input pins, its internal state, and `dt`.
- **Instruments never touch the circuit.** They create DAQ tasks and read or write task buffers.
- **UI is read-only.** User actions enter as commands (`powerDaq`, `wire`, `setDigitalOut`, `startTask`).

## 5. Core data contracts

A net carries both a **voltage** (for analog and mixed-signal behavior) and a **logic level** derived from it.

```ts
type Level = 0 | 1 | 'X' | 'Z';   // X = undefined (between thresholds, or contention), Z = undriven

interface Drive {                 // what one pin is doing to a net
  mode: 'push-pull' | 'open-drain' | 'analog' | 'none';
  volts: number;                  // used when mode != 'none'
  level?: 0 | 1;                  // digital drivers
}

interface Pin {
  id: string;                     // "daq.DO0", "U1.A", "U1.Y"
  owner: string;
  dir: 'in' | 'out' | 'inout' | 'power';
}

interface Net {
  id: string;
  pins: string[];
  volts: number | null;           // null = undriven (floating)
  level: Level;                   // derived using the logic family thresholds
  error?: 'contention';
}

interface Component {
  id: string;
  pins: Pin[];
  reset(): void;
  step(dt: number, io: PinIO): void;
}

interface PinIO {
  read(pinId: string): { volts: number | null; level: Level };
  drive(pinId: string, d: Drive): void;      // components drive nets, they never set net levels directly
}
```

Net resolution:

- **One driver:** net volts = driver volts.
- **No driver:** floating. `volts = null`, `level = 'Z'`. A gate input reading `Z` is shown as a warning and treated as undefined. **Never randomize it.**
- **Two or more drivers with different volts:** `error = 'contention'`, `level = 'X'`. Log it, color the net red. Never pick a winner randomly.
- Open-drain drivers pull low only. A pull-up resistor component sets the high level.

## 6. DAQ device model

### 6.1 Power state machine

```
OFF -> CONNECTING -> READY -> RUNNING
```

- `OFF`: every DAQ pin is `Z`. No tasks run. Only the UI updates.
- `CONNECTING` (on power-on, **once**): the DAQ scans the netlist, finds each DAQ channel wired to a component pin, and registers those connections with the engine. This is not repeated every frame.
- `READY`: channels have default configuration and default output states (section 7.3).
- `RUNNING`: tasks may start and the tick loop drives them.

### 6.2 Channel catalog

| Channel | Direction | Typical use |
|---|---|---|
| `AI0..n` | DAQ reads voltage | Scope, voltmeter |
| `AO0..n` | DAQ drives voltage | Function generator, supply |
| `DIO` lines (`P0.0..n`) | per-line direction (in or out) | Gate inputs and outputs, logic analyzer, pattern generator |
| `CTR0..n` | DAQ counts | Frequency counter, edge counter |

### 6.3 Task model (NI-style)

Every instrument gets its own task. A task has:

```ts
interface Task {
  id: string;
  kind: 'AI' | 'AO' | 'DI' | 'DO' | 'CI';
  channels: string[];
  timing: {
    mode: 'on-demand' | 'finite' | 'continuous';
    sampleClock: 'internal' | { pin: string };   // internal = simulated hardware clock
    rate: number;                                // samples/s per channel
    samplesPerChannel: number;
  };
  trigger: { type: 'none' | 'analog-edge' | 'digital-edge';
             source?: string; level?: number; slope?: 'rising' | 'falling'; preSamples?: number };
  buffer: Float64Array | Uint32Array;            // filled/consumed in blocks
  state: 'unreserved' | 'committed' | 'running' | 'done';
}
```

Rules:

- A channel belongs to **one running task at a time**. Starting a second task on the same channel is an error (same as DAQmx resource reservation).
- State order is fixed: `unreserved -> committed -> running -> done`. Configure while `unreserved`, validate on commit, then start.
- The **sample clock is simulated.** It fires based on simulated time, independent of screen frame rate.
- Instruments call `createTask`, `start`, `read` / `write`, `stop`. Nothing else.

## 7. Digital I/O logic (the part that was going wrong)

### 7.1 Line configuration

Each digital line has a direction, set before a task starts and fixed while it runs:

- **Output line (DO):** the DAQ drives the net.
- **Input line (DI):** the DAQ only senses the net and never drives it.

Writing to a line configured as input, or reading a DO line as if it were a circuit signal, is an error with a clear message.

### 7.2 Logic family (thresholds and output levels)

Define logic families as data. Default to TTL-compatible. **Verify against the datasheet of the DAQ you are modeling.**

| Family | VIL max | VIH min | VOL (out low) | VOH (out high) |
|---|---|---|---|---|
| TTL (5 V) | 0.8 V | 2.0 V | 0.4 V | 3.4 V typical |
| LVCMOS 3.3 V | 0.8 V | 2.0 V | 0.4 V | 3.3 V |

Each component (DAQ, gate IC) names its family. Mixing families is allowed; the thresholds apply on the **input side**.

### 7.3 Digital output behavior

- A DO write sets the driven **level**; the engine converts it to a drive voltage: `0 -> VOL`, `1 -> VOH`.
- Before a DO task starts, the line is at its **power-up state**: default `Z` (floating), or a configured `0` / `1`. Make this a visible setting.
- Output drivers are push-pull by default. Open-drain is a per-line option.
- Optional later: output current limit (for LEDs and loads).

### 7.4 Digital input behavior

The DAQ samples the **net voltage** and classifies it:

```
volts <= VIL              -> 0
volts >= VIH              -> 1
VIL < volts < VIH         -> X   (undefined, flagged in the log)
net floating (no driver)  -> Z   (reads as the configured pull, or X if none)
```

Optional per-line pull-up or pull-down makes a floating input read 1 or 0.

### 7.5 Digital task modes

| Mode | Behavior |
|---|---|
| **On-demand** (software-timed) | One read or write per call. Takes effect on the next tick boundary. No clock. |
| **Hardware-timed** (clocked) | Samples or updates on the simulated sample clock into or from a buffer. Used for logic analyzer and pattern generator. |
| **Change detection** | A DI task records a sample only when a monitored line changes. Stores the value and the simulated timestamp. |

### 7.6 Ports and buses

Provide helpers: `writePort(portId, value)` and `readPort(portId)` with an integer bitmask, plus per-line access. A bus is just an ordered list of lines (for example `[P0.0..P0.3]` as a nibble).

### 7.7 Timing contract (document it in the code)

- On-demand writes are applied at **step 2** of the next tick. A read returns the value sampled at **step 6** of the latest completed tick.
- Therefore one `write -> read` round trip through combinational logic completes within one tick, because section 8 settles logic before sampling.
- Sequential logic changes only on the clock edge (section 9.2).

## 8. Deterministic tick order

Fixed timestep (for example `dt = 1 µs` of simulated time, adjustable), independent of wall-clock frame rate. The UI may run many ticks per frame. Each tick runs this exact sequence:

1. Apply queued user commands.
2. DAQ output side: apply DO writes, advance AO task output (next table sample on the sample clock) and drive pins.
3. Resolve nets.
4. Step all components in a **fixed order (sorted by component id)**.
5. Resolve nets again. Repeat steps 4 and 5 until no net changes (max 8 passes). If it does not settle, log an oscillation error.
6. DAQ input side: sample `AI`, `DI` and counters into task buffers (on their sample clocks), and evaluate triggers.
7. Advance simulated time by `dt`.
8. Publish an immutable snapshot for the UI.

## 9. Component models

### 9.1 Combinational gate (table-driven)

```ts
// Data, not code: add ICs by adding entries.
const IC_7408 = {
  family: 'TTL', power: { vcc: 14, gnd: 7 },
  gates: [ { a: 1, b: 2, y: 3 }, { a: 4, b: 5, y: 6 }, { a: 9, b: 10, y: 8 }, { a: 12, b: 13, y: 11 } ],
  fn: (a, b) => a & b,
};

function step(io) {
  if (!poweredOK(io)) { releaseAllOutputs(io); return; }   // needs VCC high and GND low, else outputs Z
  for (const g of ic.gates) {
    const a = io.read(g.a).level, b = io.read(g.b).level;
    if (a === 'X' || a === 'Z' || b === 'X' || b === 'Z') { drive(g.y, 'X'); continue; }
    drive(g.y, ic.fn(a, b));                                 // drives VOL or VOH from the family
  }
}
```

Supported by data: 7400, 7402, 7404, 7408, 7432, 7486. Optional propagation delay is a fixed number of ticks, not random.

### 9.2 Sequential (flip-flops, counters)

- Store internal state (`Q`) and the **previous clock level** inside the component.
- Rising edge means `prevClk === 0 && clk === 1`. On the edge, sample D from the **values at the start of this tick**, not values changed during this tick's settling, then update Q.
- This guarantees the D flip-flop example in section 1 changes only on the clock edge.

## 10. Analog instruments through tasks

### 10.1 Oscilloscope (AI task)

- Create an AI task: channel, voltage range, sample rate, samples, trigger.
- **time/div** is converted to `rate` and `samples`. **volts/div** is a display setting.
- Trigger: analog edge (level, slope) with optional pre-trigger samples. If the simulated hardware has no analog trigger, trigger in software by searching the buffer for a level crossing.
- The scope reads buffer blocks and draws them. Autoscale reads min and max of the buffer and adjusts the range.
- It never reads nets directly.

### 10.2 Function generator (AO task)

- Compute one cycle as a table of points. Amplitude and offset are baked into the values.
- Write the table to the AO task buffer and set the update rate.
- **Regeneration:** in continuous mode, the DAQ loops over the table by itself.
- `frequency = update rate / points per cycle` (for example 100 kS/s and 100 points gives 1 kHz).
- Clip to the AO voltage range. The output is a signal source with a limited current, not a power supply.

### 10.3 Logic analyzer and pattern generator

- Logic analyzer: hardware-timed DI task. Reads the buffer and draws timing diagrams.
- Pattern generator: hardware-timed DO task. Plays a stored list of port values at the sample rate.

### 10.4 Counter

- CI task counts rising edges on a pin per gate time, from simulated time, and reports frequency or duty cycle.

### 10.5 Synchronization

Tasks can share a sample clock or export a start trigger to another task, so the scope can start exactly when the function generator starts.

## 11. Mixed-signal bridge (real-world behavior)

- Digital outputs drive **voltages** (VOL, VOH). The scope on `AI` sees those voltages.
- An analog signal wired to a gate input is classified by the thresholds in 7.2. A slow ramp passing through the undefined zone yields `X`, which is the realistic result.
- Optional later: input capacitance and rise time, so edges are not instantaneous.

## 12. Randomness policy

- Default: **zero randomness.**
- Optional "real-world noise" toggle, off by default. It uses a **seeded PRNG** (seed shown in the UI) and is applied only to `AI` samples after the circuit result is computed. Never to digital logic decisions.
- Same seed and same inputs must produce identical output.

## 13. Implementation phases

| Phase | Work | Done when |
|---|---|---|
| 0 | Audit and `AUDIT.md` | Findings reviewed |
| 1 | `SimEngine`, `Pin` / `Net` with voltage and level, snapshot API | UI renders from snapshots; one clock exists |
| 2 | DAQ state machine and the `Task` model (no instruments yet) | Power-on registers connections once; resource reservation errors work |
| 3 | Digital I/O: line direction, logic families, DO drive, DI classification, on-demand mode | Acceptance example 1 passes |
| 4 | Table-driven gate ICs and sequential models | Examples 2 and 3 pass |
| 5 | AI and AO tasks, scope and function generator on top of them | Example 4 passes |
| 6 | Hardware-timed DI/DO, change detection, counter, trigger sync | Tests 9 to 12 pass |
| 7 | Seeded noise toggle, debug tools | Determinism tests pass |

Remove the old timers and duplicate state **as each part is ported**. Do not leave two code paths running.

## 14. Tests (automated, headless, no UI)

**Digital**

1. AND gate full truth table through `DO0`, `DO1` into `DI0`: 4 cases, each repeated 100 times, identical every time.
2. Gate with no VCC or GND: output `Z`, `DI0` reads undefined, no random value.
3. Gate chain (AND into inverter) gives NAND truth table within one tick.
4. D flip-flop: Q changes only on the rising edge of the clock line, never while the clock is steady.
5. Writing to a DI-configured line is rejected with an error.
6. A floating DI line reads `X`; with pull-up it reads `1`; with pull-down it reads `0`.
7. Two DO lines on one net with different levels: contention logged, net level `X`.
8. An analog ramp from 0 V to 3.3 V into a gate input: output is `0` below VIL, `X` between thresholds, `1` above VIH.

**DAQ and instruments**

9. Power-on from `OFF` registers each wired function exactly once; powering off returns all pins to `Z`.
10. Starting two tasks on the same channel fails with a reservation error.
11. `AO0` to `AI0`, 1 kHz sine: scope buffer matches the expected sine within tolerance, same result every run.
12. Change-detection DI task records exactly the toggles of a line, with correct simulated timestamps.

**Determinism**

13. The same scenario run twice with the same seed gives identical snapshots. With noise off, results are identical for any seed.
14. Run at 30 fps and 144 fps of UI: logic and buffer results are identical.

## 15. Debug tools (build early)

- **Event log:** timestamped DAQ state changes, task state changes, pin drives, contention, oscillation, undefined reads.
- **Step mode:** pause and advance one tick at a time.
- **Pin and net inspector:** click to see driver, voltage, level and history.
- **Task inspector:** channels, rate, trigger, buffer fill, state.

## 16. Definition of done

- All four acceptance examples in section 1 behave exactly as specified, every run.
- Exactly one place advances simulated time.
- No `Math.random()` or unseeded noise in the logic path.
- Instruments only talk to the DAQ through tasks.
- All tests in section 14 pass.
- The UI contains no direct writes to pin, net, or task state.
