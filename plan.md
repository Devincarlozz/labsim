# plan.md: Make the virtual DAQ simulation deterministic and pin-accurate

> For the Antigravity agent. Read this whole file first. Do **Phase 0 (audit) and report findings before changing any code.** Do not redesign the UI. Examples are TypeScript-style; adapt to the project's actual language and framework.

## 1. Problem

The simulator has a virtual DAQ plus several functions (logic gates, scope, function generator, counter, etc.). The intended behavior is that when the DAQ is turned on, it connects to the functions and drives or reads them through its pins. Instead, the simulation produces seemingly random results.

**Target example (must work exactly):**

- A gate IC (e.g. 7408 AND) sits on the board.
- DAQ `DO0` is wired to gate input A. DAQ `DO1` is wired to gate input B.
- Gate output Y is wired to DAQ `DI0`.
- Setting `DO0=1, DO1=1` makes `DI0` read `1`. Any other combination makes `DI0` read `0`. Every time. No exceptions.

## 2. Likely root causes (verify each in Phase 0)

1. Several modules each run their own timer/loop (`setInterval`, `requestAnimationFrame`, threads), so update order is a race.
2. No single source of truth. Each function keeps a private copy of pin or signal state.
3. Functions are not connected through pins and nets. They call each other directly or share globals.
4. Unseeded randomness (`Math.random`, noise, jitter) is mixed into the logic path.
5. The DAQ "on" state does not gate anything. Functions run before or without a connection.
6. The gate model is not a pure truth table of its input pins. It may ignore VCC/GND, read stale inputs, or use stale outputs.
7. Pin direction is not enforced. An output can be read as an input, or two outputs drive the same net.
8. Rendering or UI code mutates simulation state.

## 3. Phase 0: Audit (no code changes)

Produce `AUDIT.md` containing:

- A list of every loop or timer in the codebase and who owns it.
- Every place that holds signal or pin state, and whether it is duplicated.
- Every use of randomness, and whether it feeds into logic results.
- How the DAQ "on" action currently connects to functions (file and function names).
- How the gate IC computes its output today.
- Which items from section 2 are confirmed, with file and line references.

Stop and show `AUDIT.md` before Phase 1.

## 4. Target architecture

One engine owns all state. Everything else is a client of it.

```
UI (instruments, board)  ->  reads state, sends commands only
        |
   SimEngine (single clock, single tick function)
        |
  +-----+--------------------+
  |     |                    |
Netlist  DAQ device model    Component models (gate, scope, funcgen, counter ...)
```

Rules:

- **One clock.** Only `SimEngine.tick()` advances time. No other timer may change simulation state.
- **Pins and nets.** Components never talk to each other. They read pin values and write pin values. Nets connect pins.
- **Pure models.** A component's outputs depend only on its input pins, its internal state, and `dt`. No globals, no `Math.random()` in the logic path.
- **UI is read-only.** Instruments render from engine state. User actions go in as commands (`setDigitalOut`, `powerDaq`, `wire`).

## 5. Data contracts

```ts
type Level = 0 | 1 | 'Z';            // Z = high impedance / undriven

interface Pin {
  id: string;                        // e.g. "daq.DO0", "U1.A"
  owner: string;                     // component id
  dir: 'in' | 'out' | 'inout';
  level: Level;
}

interface Net { id: string; pins: string[]; level: Level; }  // resolved each tick

interface Component {
  id: string;
  pins: Pin[];
  reset(): void;
  step(dt: number, io: PinIO): void; // reads input pins, writes output pins
}

interface PinIO {
  read(pinId: string): Level;
  write(pinId: string, level: Level): void;
}
```

Net resolution rules:

- 1 driver: net takes that level.
- 0 drivers: `Z`. A gate input reading `Z` is treated as undefined and shown as a warning, **not randomized**.
- 2+ drivers with different levels: **contention**. Flag an error in the event log and show the net in red. Never pick a winner randomly.

## 6. DAQ device model

State machine, strictly in this order:

```
OFF -> CONNECTING -> READY -> RUNNING
```

- `OFF`: all DAQ pins `Z`. Functions are inert. Nothing ticks except the UI.
- `CONNECTING` (on power-on): the DAQ enumerates the board, finds each function's pins that are wired to DAQ channels, and registers each function with the engine. This happens once, not every frame.
- `READY`: channels are configured (direction, range, sample rate). Outputs are at their defaults (digital `0`, analog `0 V`).
- `RUNNING`: the tick loop is active.

Channels:

| Channel | Direction | Used by |
|---|---|---|
| `DO0..DOn` | DAQ writes, circuit reads | Gate inputs, pattern generator |
| `DI0..DIn` | DAQ reads, circuit writes | Gate outputs, logic analyzer |
| `AI0..AIn` | DAQ reads | Oscilloscope, voltmeter |
| `AO0..AOn` | DAQ writes | Function generator, supply |
| `CTR0..CTRn` | DAQ reads | Frequency counter |

Enforce direction: a `DO` pin may only drive nets. A `DI` pin may only read. Writing to a `DI` pin is an error.

## 7. Deterministic tick order

Fixed timestep (e.g. `dt = 1 ms` simulated, independent of wall-clock frame rate). Each tick runs this exact sequence:

1. Apply queued user commands (set DO, change AO waveform, etc.).
2. DAQ writes `DO`/`AO` values to its output pins.
3. Resolve nets.
4. Step all components in **a fixed order (sorted by component id)**.
5. Resolve nets again. Repeat steps 4 and 5 until no net changes (max 8 iterations, to settle combinational logic). If it does not settle, log an oscillation error.
6. DAQ samples `DI`, `AI`, and counters into its buffers.
7. Advance simulated time by `dt`.
8. Publish an immutable snapshot for the UI.

The UI reads the latest snapshot. It never reads live pin objects.

## 8. Gate IC model (reference implementation)

Model each IC as a table, never as ad-hoc code per gate.

```ts
// 7408: quad 2-input AND, pins per datasheet
// gate1: A=1, B=2, Y=3 ; VCC=14, GND=7
function step(io) {
  if (!powered(io)) { writeAllOutputs(io, 'Z'); return; }  // needs VCC=1 and GND=0
  for (const g of gates) {
    const a = io.read(g.a), b = io.read(g.b);
    if (a === 'Z' || b === 'Z') { io.write(g.y, 'Z'); continue; }
    io.write(g.y, (a & b) as Level);
  }
}
```

- Support more ICs by data (pin map and truth table), not by new code paths: 7400, 7402, 7404, 7432, 7486.
- Optional propagation delay (e.g. 10 ns equivalent) must be a fixed number of ticks, not random.

## 9. Other functions: how they hook into the DAQ

- **Oscilloscope / voltmeter:** reads `AI` sample buffer from the DAQ. It never reads the circuit directly. Scope trigger and time/div are display settings applied to the buffer.
- **Function generator:** writes waveform samples to `AO` at the DAQ update rate. Waveform is computed from `t` (simulated time), so it is repeatable.
- **Logic analyzer / pattern generator:** reads `DI` / writes `DO` history from the DAQ buffers.
- **Counter:** counts rising edges on a `CTR` pin per gate time, from simulated time.

## 10. Randomness policy

- Default: **zero randomness.**
- Optional "real-world noise" toggle, off by default. It uses a **seeded PRNG** (seed shown in the UI) and is applied only to `AI` samples after the circuit result is computed. Never on digital logic.
- Same seed + same inputs must produce identical output. Add a test for this.

## 11. Implementation phases

| Phase | Work | Done when |
|---|---|---|
| 0 | Audit and `AUDIT.md` | Findings reviewed |
| 1 | `SimEngine` with one clock, `Pin`/`Net`, snapshot API | Existing UI renders from snapshots |
| 2 | DAQ state machine and channel direction rules | Power-on registers functions once; `DI` writes rejected |
| 3 | Port the gate IC to the table model | Section 1 example passes |
| 4 | Port scope, funcgen, counter to DAQ buffers | Each passes its test below |
| 5 | Seeded noise toggle, debug tools | Determinism test passes |

Remove old timers and duplicate state **as each part is ported**. Do not leave two code paths running.

## 12. Tests (add as automated tests, run headless, no UI)

1. AND gate full truth table via `DO0`, `DO1` into `DI0`: 4 cases, each repeated 100 times, identical every time.
2. Gate without VCC or GND: output is `Z`, `DI0` reports undefined, no random value.
3. DAQ `OFF`: all pins `Z`; turning on registers each function exactly once.
4. Two outputs on one net with different levels: contention error logged.
5. Writing to a `DI` pin: rejected with an error.
6. Function generator 1 kHz sine at `AO0` wired to `AI0`: scope buffer matches the expected sine within tolerance, same result on every run.
7. Run the same scenario twice with the same seed: byte-identical snapshots. With noise off: identical regardless of seed.
8. Frame-rate independence: run at simulated 30 fps and 144 fps; the logic results are identical.

## 13. Debug tools (build these early, they will save time)

- **Event log:** timestamped entries for DAQ state changes, pin writes, contention, oscillation.
- **Step mode:** pause and advance one tick at a time.
- **Pin inspector:** click a pin or net to see its driver, level, and history.

## 14. Definition of done

- The section 1 example behaves exactly as specified, every run.
- There is exactly one place that advances simulation time.
- No `Math.random()` or unseeded noise anywhere in the logic path.
- All tests in section 12 pass.
- UI contains no direct writes to pin or net state.
