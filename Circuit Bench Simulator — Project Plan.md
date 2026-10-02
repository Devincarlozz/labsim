# Circuit Bench Simulator — Project Plan

## 1. Goal

Plan a browser-based, Tinkercad-style starter circuit simulator/workbench. The user asked for a **top-view-only** circuit workspace with an **840-point breadboard**, named IC logic gates, resistors, capacitors, a DAC header matching the supplied pinout image, and separate Oscillator, Function Generator, and Clock windows in the style of the signal controls associated with NI myDAQ.

This document is the requested deliverable. **No simulator interface or application code is being implemented in this scope.**

## 2. Requirements

### Required workspace and components

- Show every component from an overhead/top view; do not use perspective or 3D placement.
- Show a breadboard with exactly **840 visible contact holes**. Proposed breakdown:
  - 64 columns × 10 terminal-strip contacts = 640 holes.
  - Four power-rail rows × 50 contacts = 200 holes.
  - Total = **840**.
- Provide a component palette and top-view representations for:
  - Named IC logic-gate packages, with the IC name printed on the package. Initial library: 74HC00 (NAND), 74HC02 (NOR), 74HC04 (inverter), 74HC08 (AND), and 74HC32 (OR).
  - Resistors with editable resistance.
  - Capacitors with editable capacitance.
- Provide a DAC/header area with pins labeled exactly as in the supplied wiring callout: **Vcc**, **Vo**, and **Gnd**. The image shows these names and wire associations, but does not establish a DAC model, voltage range, or numeric header pin numbers; do not invent those as reference facts.
- Provide distinct Oscillator, Function Generator, and Clock control windows/panels modeled on the requested MyDAQ-style workflow. Include clear output/status and editable signal settings.

### Interaction goals

- Place, select, move, rotate in the plane, and remove parts using a 2D top-view editor.
- Connect breadboard contacts and component pins with wires; make connected electrical nodes apparent.
- Edit resistor/capacitor values and IC identity from the selection/properties area.
- Configure and start/stop the Oscillator, Function Generator, and Clock.
- Display signal output in a compact waveform/readout area. Generator controls should expose frequency and amplitude; the function generator should offer at least sine, square, and triangle waveforms. The clock should expose frequency/period and run/pause state.

## 3. Product boundary and assumptions

- This is a **starter interactive circuit editor and educational simulator**, not a SPICE replacement. The first implementation should support breadboard node/wire connectivity, basic digital logic behavior for the listed ICs, and generated signal waveforms. A physically accurate continuous-time model of all analog circuits is outside this initial scope.
- The reference image supplies only the three DAC labels **Vcc / Vo / Gnd**. Voltage limits, DAC resolution, output impedance, and the full NI myDAQ I/O pin map remain unspecified and must not be presented as verified details.
- The provided picture is a physical connector/wiring reference, not a screenshot of the MyDAQ software window. The generator panels should therefore follow the requested instrument-control concept without claiming pixel-perfect replication of a software UI that was not supplied.
- Keep project persistence local to the browser for the first version (for example, browser storage plus an optional JSON export/import). No account, server API, database, cloud save, or external-device connection is required by the current request.

## 4. Interface plan

Use a single-page editor organized around the circuit canvas:

1. **Top toolbar:** project title, select/wire modes, undo/redo, zoom controls, run/pause, and clear simulation status.
2. **Component palette:** breadboard parts, IC gates, resistor, capacitor, DAC/header, and signal sources.
3. **Central canvas:** orthographic top view of the 840-hole breadboard, snap-aligned components, wires, and connection indicators. Keep canvas panning/zooming separate from component movement.
4. **Properties inspector:** context-sensitive values, pin names, IC label, and electrical settings for the selected item.
5. **Instrument area:** distinct Oscillator, Function Generator, and Clock panels, plus an output waveform/readout view. Panels should be usable without hiding the central circuit workspace.

The canvas and parts should remain legible at reduced zoom: use stable hole/column labels, recognizable component silhouettes, and selected/connected state styling. Do not depend on color alone to communicate wire identity or logic state.

## 5. Simulation and state approach

- Maintain a typed project model for the breadboard, parts, wires, instrument configuration, and simulation state.
- Give each breadboard contact and component pin a stable identifier. Derive electrical nodes from contact membership and wire connections rather than from screen coordinates.
- For the first logic simulation, evaluate the listed gate truth functions from connected input nodes and expose output states in the canvas/inspector.
- Generate oscillator/function-generator and clock samples from their configured settings and render the resulting waveform/readout locally in the browser.
- Keep editable component values and instrument settings in application state. Persist a versioned project snapshot locally so malformed or older saved state can be handled safely.
- Use explicit simulation limitations/status when a circuit contains unsupported, floating, conflicting, or incomplete connections; do not imply electrical accuracy beyond the implemented model.

## 6. Proposed project structure

The initialized Webdev project uses the flexible template and currently contains no application source or dependencies. The following is a proposed structure for a later implementation:

```text
circuitsim/
├── plan.md
├── package.json
├── index.html
├── public/
│   └── manus-routes.json
└── src/
    ├── main.tsx                 # App bootstrap
    ├── App.tsx                  # Editor shell and major regions
    ├── components/
    │   ├── Toolbar.tsx
    │   ├── ComponentPalette.tsx
    │   ├── BreadboardCanvas.tsx # Top-view board and contact grid
    │   ├── Parts.tsx             # IC, resistor, capacitor, DAC symbols
    │   ├── WireLayer.tsx
    │   ├── PropertiesPanel.tsx
    │   └── instruments/
    │       ├── OscillatorPanel.tsx
    │       ├── FunctionGeneratorPanel.tsx
    │       ├── ClockPanel.tsx
    │       └── WaveformView.tsx
    ├── model/
    │   ├── types.ts              # Circuit, part, pin, wire, instrument types
    │   ├── breadboard.ts         # Exact 840-contact topology
    │   └── connectivity.ts       # Node/connectivity derivation
    ├── simulation/
    │   ├── logic.ts              # Initial supported digital gates
    │   └── signals.ts            # Oscillator, function generator, clock
    └── styles/
        └── app.css
```

## 7. Technical and delivery approach

- **Application type:** client-side single-page Web app using React and TypeScript with Vite, subject to confirming the available toolchain when implementation begins. The managed project was initialized with the flexible template and with server/database disabled.
- **Serving:** publish the compiled frontend as static output (`dist`). There are no dynamic API paths in the planned first version; do not add a server or database without a new requirement.
- **Routes:** the initial application has one page at `/`. Before the first development server start, create the required root-served `public/manus-routes.json` listing `/` and keep it synchronized with any later page routes.
- **Caching:** keep HTML able to pick up releases (no-cache/revalidation as appropriate); versioned build assets may use immutable caching. There are no user-specific or private server responses in this frontend-only scope.
- **Dependencies:** keep the initial stack lean. Use the framework and a suitable 2D canvas/SVG approach for the interactive top-view editor; select any additional rendering or waveform library only if it materially simplifies the needed interactions.
- **Validation for a future implementation:** use project diagnostics and existing typecheck/build commands, plus code inspection of the contact-count/top-view definitions, component pin labels, gate definitions, and instrument state flow. This plan does not prescribe browser screenshots or a new acceptance-test harness.

## 8. Implementation milestones (future work)

1. Establish the source scaffold and typed circuit data model; define and render the exact 840-hole board.
2. Build the top-view editor shell, palette, selection/properties behavior, and part placement.
3. Add wires and graph-based connectivity; model named IC packages, editable resistors/capacitors, and DAC Vcc/Vo/Gnd pins.
4. Implement supported logic-gate state propagation and the three independent instrument controls with waveform/readout output.
5. Add local project persistence/export, clear simulation limitations in the UI, and complete type/build diagnostics.

## 9. Open details for a later iteration

- Exact DAC part/model, output voltage range, resolution, and whether it should provide stepped output or only a named Vo terminal.
- Whether additional MyDAQ pins beyond Vcc, Vo, and Gnd are needed; none are legible or identified in the supplied callout as DAC pins.
- Preferred default values and units/ranges for generator frequency/amplitude and resistor/capacitor entry.
- Whether a later version should add analog circuit analysis, more IC families, or hardware/device integration.
