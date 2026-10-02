# AUDIT.md: Virtual DAQ & Simulation Architecture Audit

> **Phase 0 Audit Report** in accordance with `plan.md`.  
> Completed prior to any code modifications.

---

## 1. Inventory of Every Loop and Timer in the Codebase

There is currently **no single master simulation clock**. Instead, multiple independent components, instruments, and renderers run unsynchronized loops driven by wall-clock time (`performance.now()` / `Date.now()`):

| File | Owner | Type | Interval / Cadence | Purpose / Action |
| :--- | :--- | :--- | :--- | :--- |
| [`src/components/instruments/LabViewOscilloscope.tsx:77`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/LabViewOscilloscope.tsx#L77) | `LabViewOscilloscope` | `requestAnimationFrame` | Screen refresh (~60Hz / 144Hz) | Calls `getDaqSignal(ch0ContactId, state, t)` using wall-clock `performance.now() / 1000` as $t$. Runs every frame. |
| [`src/components/instruments/LabViewDMM.tsx:23`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/LabViewDMM.tsx#L23) | `LabViewDMM` | `setInterval` | 150 ms | Directly calls `getDaqSignal('daq-ai0_p', state, t)` and `solveCircuitPhysics(state, t)`. |
| [`src/components/instruments/LabViewDigitalReader.tsx:72`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/LabViewDigitalReader.tsx#L72) | `LabViewDigitalReader` | `setInterval` | 100 ms | Iterates pins `daq-dio0`..`daq-dio7`, calling `getDaqSignal` on each to update local `readBits`. |
| [`src/components/instruments/LabViewDigitalWriter.tsx:171`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/LabViewDigitalWriter.tsx#L171) | `LabViewDigitalWriter` | `setInterval` | User variable (`updateInterval`) | Generates automatic output patterns (Count Up/Down, Walking 1s/0s) and writes to store. |
| [`src/components/instruments/LabViewFunctionGenerator.tsx:65`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/LabViewFunctionGenerator.tsx#L65) | `LabViewFunctionGenerator` | `setInterval` | User variable (`stepInterval`) | Steps sweep frequencies across time and dispatches `UPDATE_FUNCTION_GEN`. |
| [`src/components/BreadboardCanvas.tsx:160`](file:///c:/Users/Jk/Documents/labsim/src/components/BreadboardCanvas.tsx#L160) | `BreadboardCanvas` | `requestAnimationFrame` | Screen refresh (~60Hz) | Main canvas render loop; calls `CanvasRenderer.render`, which in turn solves circuit physics. |
| [`src/components/BreadboardCanvas.tsx:278`](file:///c:/Users/Jk/Documents/labsim/src/components/BreadboardCanvas.tsx#L278) | `BreadboardCanvas` | `requestAnimationFrame` | On pointer move | Throttles contact hover detection. |
| [`src/components/instruments/ClockPanel.tsx:71`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/ClockPanel.tsx#L71) | `ClockPanel` | `requestAnimationFrame` | Screen refresh | Renders digital clock trace. |
| [`src/components/instruments/FunctionGeneratorPanel.tsx:52`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/FunctionGeneratorPanel.tsx#L52) | `FunctionGeneratorPanel` | `requestAnimationFrame` | Screen refresh | Renders function generator preview waveform. |
| [`src/components/instruments/OscillatorPanel.tsx:52`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/OscillatorPanel.tsx#L52) | `OscillatorPanel` | `requestAnimationFrame` | Screen refresh | Renders oscillator preview. |
| [`src/components/instruments/OutputWaveformPanel.tsx:135`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/OutputWaveformPanel.tsx#L135) | `OutputWaveformPanel` | `requestAnimationFrame` | Screen refresh | Renders output waveform preview. |
| [`src/context/AuthContext.tsx:185`](file:///c:/Users/Jk/Documents/labsim/src/context/AuthContext.tsx#L185) | `AuthContext` | `setInterval` | 20,000 ms | Heartbeat / presence ping. |

---

## 2. Pin and Signal State Ownership & Duplication

Signal and pin state is fragmented and duplicated across at least six distinct locations:

1. **`CircuitStore.tsx` (`Project.simulation.nodes` & `Project.instruments.daq`)**:
   - Holds `state.simulation.nodes` (`Map<NodeId, ElectricalNode>`), where each node has a `state: LogicState` (`0 | 1 | 'Z' | 'X'`).
   - Holds `state.instruments.daq.dioBits: number[]` (8 integers, 0 or 1).
   - Holds `state.instruments.daq.dioDirection: boolean[]` (8 booleans).
   - Holds `state.instruments.functionGenerator` and `state.instruments.vps`.
2. **`LabViewDigitalWriter.tsx`**:
   - Holds private state `bits: boolean[]` (line 46) representing line output switches.
   - Synchronizes back to `CircuitStore` via a `useEffect` dispatching `UPDATE_DAQ`, introducing a multi-render React synchronization delay.
3. **`LabViewDigitalReader.tsx`**:
   - Holds private state `readBits: boolean[]` (line 27).
   - Sampled periodically every 100ms via `getDaqSignal`. Stale with respect to real-time simulation events.
4. **`circuitPhysics.ts` (`solveCircuitPhysics`)**:
   - Ignores `ElectricalNode.state` from `CircuitStore` and `logic.ts`.
   - On every call, instantiates a local `netSources` map and local `netVoltages` map.
   - Computes temporary logic states inside an unexported `icPhysicsMap` that is discarded after the function returns.
5. **`logic.ts` (`propagateLogic`)**:
   - Mutates `ElectricalNode.state` in-place when called by `RUN_SIMULATION` or `UPDATE_DAQ`.
   - Its output values are **never referenced** by `CanvasRenderer`, `LabViewOscilloscope`, `LabViewDigitalReader`, or `LabViewDMM`.
6. **`TopDAQPanel.tsx`**:
   - Directly re-computes `getDaqSignal` inside `renderTerminalCell` for every terminal during React rendering passes.

---

## 3. Inventory of Randomness in the Codebase

Searched for all instances of `Math.random()` across the `src` directory:

1. **`src/components/instruments/LabViewDMM.tsx` (Line 27)**:
   ```ts
   const jitter = (Math.random() - 0.5) * 0.001;
   ```
   - **Impact**: Injects unseeded non-deterministic jitter into every DMM readout: `vdc`, `vac`, `idc`, `iac`, `ohms`, and `diode`. Every 150ms interval produces a different, non-reproducible number.
2. **`src/components/instruments/LabViewBodeDSA.tsx` (Line 81)**:
   ```ts
   else pwr = 10 + Math.random() * 8;
   ```
   - **Impact**: Adds unseeded noise to the FFT noise floor.
3. **`src/store/CircuitStore.tsx` (Lines 1568, 1716)**:
   ```ts
   const newId = `ws-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
   ```
   - **Impact**: UUID generation for workspace IDs. Does not affect circuit simulation.

**Conclusion**: The logic path itself does not call `Math.random()`, but the measurement pipeline (`LabViewDMM`) mixes unseeded random jitter into instrument values.

---

## 4. Current DAQ "ON" Action and Connection Mechanism

Tracing the DAQ power toggle:

1. **UI Triggers**:
   - [`TopDAQPanel.tsx:76`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/TopDAQPanel.tsx#L76): `handleTogglePower` toggles `daqOn`.
   - [`BottomInstrumentSuite.tsx:405`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/BottomInstrumentSuite.tsx#L405): `handleTogglePower`.
   - [`BreadboardCanvas.tsx:318`](file:///c:/Users/Jk/Documents/labsim/src/components/BreadboardCanvas.tsx#L318): clicking the physical DAQ rocker on the canvas.
2. **Dispatched Actions**:
   - Dispatches `dispatch({ type: 'UPDATE_DAQ', settings: { enabled: nextOn } })`.
   - If turning ON: dispatches `dispatch({ type: 'RUN_SIMULATION' })`.
   - If turning OFF: dispatches `dispatch({ type: 'SET_SIMULATION_STATUS', status: 'paused' })`.
   - Dispatches `window.dispatchEvent(new CustomEvent('daq-power-change', { detail: { enabled: nextOn } }))`.
3. **Event Listener Check**:
   - **Zero listeners** exist for `'daq-power-change'` anywhere in the codebase.
4. **Simulation Reaction**:
   - `UPDATE_DAQ` in [`CircuitStore.tsx:1063`](file:///c:/Users/Jk/Documents/labsim/src/store/CircuitStore.tsx#L1063) calls `deriveElectricalNodes` and `propagateLogic` once.
   - In [`circuitPhysics.ts:132`](file:///c:/Users/Jk/Documents/labsim/src/simulation/circuitPhysics.ts#L132):
     ```ts
     const isDaqOn = (state.instruments.daq?.enabled !== false) && (state.simulation.status === 'running');
     ```
     If false, voltage sources (`5V`, `±15V`, `AO0`, `DIO0..7`) are not attached to nets.
   - In [`daqSignals.ts:35`](file:///c:/Users/Jk/Documents/labsim/src/simulation/daqSignals.ts#L35): returns zero/open signal if `!isDaqOn`.
5. **No State Machine or Enumeration**:
   - There is no `OFF -> CONNECTING -> READY -> RUNNING` lifecycle.
   - When the DAQ turns on, it does not discover connected functions, register pins, or establish a handshake.

---

## 5. Current Gate IC Evaluation Architecture

There are **two conflicting gate evaluation paths** in the codebase:

### Path A: `src/simulation/logic.ts` (`evaluateAllGates` & `propagateLogic`)
- Runs only when `RUN_SIMULATION` or `UPDATE_DAQ` is dispatched.
- Checks VCC = Pin 14 (`state === 1`) and GND = Pin 7 (`state === 0`).
- Evaluates truth tables (e.g. `evaluateAND`, `evaluateOR`, `evaluateNAND`, `evaluateNOR`, `evaluateNOT`).
- Writes to `outputPin.state` and `ElectricalNode.state`.
- **Disconnect**: This output state is completely decoupled from the rendering and instrument measurement systems.

### Path B: `src/simulation/circuitPhysics.ts` (`solveCircuitPhysics`)
- Runs continuously on every frame/timer tick from the UI.
- Lines 354–367: Checks $V_{CC} \ge 3.0\text{ V}$ and $V_{GND} \le 0.8\text{ V}$ via `netSources`.
- Lines 544–562: Uses hardcoded switch logic:
  ```ts
  const inAHigh = inAVal >= 2.0;
  const inBHigh = inBVal !== undefined ? inBVal >= 2.0 : undefined;
  switch (ic.icType) {
    case '74HC08': return (inAHigh && inBHigh) ? 1 : 0;
    ...
  }
  ```
- Lines 604–605: Reads input voltages from `netSources` (or `netVoltages`).
- Lines 624–638: Attaches a `NetSource` of `5.0V` or `0.05V` to the output net.
- **Critical Flaws**:
  1. **Evaluation Order Glitch with Resistors**: Gate ICs are evaluated at **Step 3** (lines 350–644), while the nodal resistor conductance network is solved at **Step 4** (lines 646–725). If a gate input is pulled up to 5V via a resistor, the gate reads 0V because the resistor network has not been solved yet!
  2. **No Feedback Settling / Single Pass**: Loops over `state.components` once in array iteration order. Cannot settle feedback loops (e.g. cross-coupled NAND latch, ring oscillators).
  3. **Floating Inputs (`Z`) Treated as 0**: Undriven pins default to 0.0V, so `valA >= 2.0` evaluates to `false` (LOW) instead of high-impedance / undefined (`'Z'`).

---

## 6. Verification of Root Causes from `plan.md` Section 2

| # | Root Cause Hypothesis | Status | File & Line Evidence |
| :---: | :--- | :---: | :--- |
| **1** | Several modules run their own timer/loop (`setInterval`, `requestAnimationFrame`), causing update races. | **CONFIRMED** | [`LabViewOscilloscope.tsx:77`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/LabViewOscilloscope.tsx#L77) (RAF), [`LabViewDMM.tsx:23`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/LabViewDMM.tsx#L23) (150ms), [`LabViewDigitalReader.tsx:72`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/LabViewDigitalReader.tsx#L72) (100ms), [`BreadboardCanvas.tsx:160`](file:///c:/Users/Jk/Documents/labsim/src/components/BreadboardCanvas.tsx#L160) (RAF). No unified clock. |
| **2** | No single source of truth; functions keep private copies of pin/signal state. | **CONFIRMED** | [`CircuitStore.tsx:1020`](file:///c:/Users/Jk/Documents/labsim/src/store/CircuitStore.tsx#L1020) (`dioBits`), [`LabViewDigitalWriter.tsx:46`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/LabViewDigitalWriter.tsx#L46) (`bits`), [`LabViewDigitalReader.tsx:27`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/LabViewDigitalReader.tsx#L27) (`readBits`). `logic.ts` and `circuitPhysics.ts` maintain separate logic worlds. |
| **3** | Functions are not connected through pins and nets; they call each other directly or share globals. | **CONFIRMED** | Instruments directly call `getDaqSignal(pinId, state, time)` and inspect raw objects instead of interfacing with formal DAQ channel buffers. |
| **4** | Unseeded randomness (`Math.random`, noise, jitter) is mixed into the logic path. | **CONFIRMED** (Measurement) | [`LabViewDMM.tsx:27`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/LabViewDMM.tsx#L27) adds `(Math.random() - 0.5) * 0.001` directly to voltage and resistance readings. |
| **5** | The DAQ "on" state does not gate anything; functions run before or without a connection. | **CONFIRMED** | Digital Reader and Scope run continuously even when DAQ is OFF. `'daq-power-change'` has zero subscribers. |
| **6** | Gate model is not a pure truth table of input pins; ignores VCC/GND or reads stale state. | **CONFIRMED** | Single-pass evaluation in [`circuitPhysics.ts:544`](file:///c:/Users/Jk/Documents/labsim/src/simulation/circuitPhysics.ts#L544) runs prior to resistor network resolution. Floating inputs are clamped to `0` rather than `'Z'`. |
| **7** | Pin direction is not enforced; an output can be read as an input, or two outputs drive the same net. | **CONFIRMED** | [`circuitPhysics.ts:170`](file:///c:/Users/Jk/Documents/labsim/src/simulation/circuitPhysics.ts#L170) silently arbitrates multi-source nets based on internal resistance without reporting bus contention. |
| **8** | Rendering or UI code mutates simulation state. | **CONFIRMED** | [`logic.ts:168`](file:///c:/Users/Jk/Documents/labsim/src/simulation/logic.ts#L168) mutates `outputPin.state`. Canvas render loop runs circuit physics directly on every frame. |
| **9** | Instruments read the circuit directly instead of reading DAQ buffers. | **CONFIRMED** | [`LabViewOscilloscope.tsx:77`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/LabViewOscilloscope.tsx#L77) calls `getDaqSignal(ch0ContactId, state, t)` inspecting raw circuit wires; [`LabViewDMM.tsx:23`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/LabViewDMM.tsx#L23) calls `solveCircuitPhysics(state, t)`; [`LabViewDigitalReader.tsx:72`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/LabViewDigitalReader.tsx#L72) queries `getDaqSignal` directly; [`TopDAQPanel.tsx:112`](file:///c:/Users/Jk/Documents/labsim/src/components/instruments/TopDAQPanel.tsx#L112) evaluates signals during render. Instruments bypass DAQ task buffers entirely. |

---

## 7. Target Implementation Strategy (Phases 1–7 per plan (1).md)

To achieve 100% deterministic, pin-accurate, NI task-modeled behavior:

1. **Phase 1: Upgrade Core Contracts (`types.ts`)**:
   - `type Level = 0 | 1 | 'X' | 'Z'` (introducing `'X'` for undefined/contention).
   - `Drive`: `{ mode: 'push-pull' | 'open-drain' | 'analog' | 'none', volts: number, level?: 0 | 1 }`.
   - `PinIO`: `read(pinId): { volts: number | null, level: Level }`, `drive(pinId, d: Drive): void`.
   - `Net`: carries `volts: number | null`, `level: Level`, `error?: 'contention'`.
2. **Phase 2: DAQ State Machine & Task Model (`DaqDevice.ts`)**:
   - `OFF -> CONNECTING -> READY -> RUNNING` power lifecycle with one-time function registration.
   - Formal `Task` interface (`AI`, `AO`, `DI`, `DO`, `CI`) with states (`unreserved -> committed -> running -> done`).
   - Strict resource reservation: throwing reservation errors when two running tasks claim the same channel.
3. **Phase 3: Digital I/O Logic & Classification**:
   - Digital line direction enforcement (DO vs DI).
   - Logic families (TTL 5V with $V_{IL}=0.8\text{V}, V_{IH}=2.0\text{V}$, LVCMOS 3.3V).
   - Input voltage classification: $\le V_{IL} \to 0$, $\ge V_{IH} \to 1$, in-between $\to 'X'$, floating $\to 'Z'$.
   - Digital output drive conversion: $0 \to V_{OL}$, $1 \to V_{OH}$.
4. **Phase 4: Component Models (Combinational & Sequential)**:
   - Pure table-driven gate models (7400, 7402, 7404, 7408, 7432, 7486) handling `'X'`/`'Z'`.
   - Sequential models: 7474 D Flip-Flop with edge-triggered sampling (`prevClk === 0 && clk === 1`) using initial tick values.
5. **Phase 5: Analog Instruments on Tasks**:
   - Oscilloscope: hardware AI task with sampling rates and analog-edge triggering, reading task buffers.
   - Function Generator: AO task with table regeneration and continuous mode looping.
6. **Phase 6: Hardware-Timed Tasks & Change Detection**:
   - Change-detection DI task capturing line transitions and simulated timestamps.
   - Counter (CI) task counting rising edges.
7. **Phase 7: Headless Verification Suite (14 Tests) & Determinism**:
   - Implement and pass all 14 tests in `plan (1).md` Section 14.
   - Verify 100% determinism across frame rates and seeded PRNG.
