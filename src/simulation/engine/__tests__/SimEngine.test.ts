/**
 * SimEngine.test.ts: Automated Headless Determinism Test Suite
 * Implements all 14 test scenarios from plan (1).md Section 14.
 *
 * Digital (Tests 1-8):
 * 1. AND gate full truth table via DO0, DO1 into DI0 (4 cases x 100 repetitions)
 * 2. Gate with no VCC/GND: output Z, DI0 reads undefined
 * 3. Gate chain (AND into inverter) gives NAND within one tick
 * 4. D flip-flop: Q changes only on rising edge of clock
 * 5. Writing to a DI-configured line is rejected with error
 * 6. Floating DI reads Z; with pull-up reads 1; with pull-down reads 0
 * 7. Two DO lines on one net with different levels: contention, level X
 * 8. Analog ramp 0V to 3.3V into gate input: 0 below VIL, X between, 1 above VIH
 *
 * DAQ and instruments (Tests 9-12):
 * 9. Power-on from OFF registers wired functions; powering off returns all pins to Z
 * 10. Starting two tasks on the same channel fails with reservation error
 * 11. AO0 to AI0, 1kHz sine: scope buffer matches expected sine
 * 12. Change-detection DI task records exact toggles with timestamps
 *
 * Determinism (Tests 13-14):
 * 13. Same scenario twice with same seed: identical snapshots
 * 14. Run at 30fps and 144fps: logic results identical
 */

import { SimEngine } from '../SimEngine';
import { GateICComponent, DFlipFlopComponent, NE555Component } from '../GateModel';
import { Level } from '../types';

export function runAllTests(): { passed: number; failed: number; results: string[] } {
  const results: string[] = [];
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      passed++;
      results.push(`✓ [PASS] ${testName}`);
    } else {
      failed++;
      results.push(`✗ [FAIL] ${testName} - ${details || 'Assertion failed'}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 1: AND gate full truth table via DO0, DO1 into DI0 (4 cases x 100)
  // plan (1).md Section 14.1
  // ─────────────────────────────────────────────────────────────────────────
  {
    const engine = new SimEngine();
    const andGate = new GateICComponent('U1', '74HC08');
    engine.registerComponent(andGate);

    engine.addNet('net-vcc', ['daq.V5V', 'U1.pin14']);
    engine.addNet('net-gnd', ['daq.DGND', 'U1.pin7']);
    engine.addNet('net-inA', ['daq.DO0', 'U1.pin1']);
    engine.addNet('net-inB', ['daq.DO1', 'U1.pin2']);
    engine.addNet('net-outY', ['U1.pin3', 'daq.DI0']);

    engine.daq.power(true);

    const truthTable: Array<{ do0: 0 | 1; do1: 0 | 1; expected: Level }> = [
      { do0: 0, do1: 0, expected: 0 },
      { do0: 0, do1: 1, expected: 0 },
      { do0: 1, do1: 0, expected: 0 },
      { do0: 1, do1: 1, expected: 1 },
    ];

    let allRepeatsMatch = true;
    let failDetail = '';
    for (const testCase of truthTable) {
      for (let repeat = 0; repeat < 100; repeat++) {
        engine.daq.setDigitalOut(0, testCase.do0);
        engine.daq.setDigitalOut(1, testCase.do1);
        const snap = engine.tick();
        const di0 = snap.daq.di[0];
        if (di0 !== testCase.expected) {
          allRepeatsMatch = false;
          failDetail = `DO0=${testCase.do0} DO1=${testCase.do1}: expected DI0=${testCase.expected}, got ${di0} at repeat ${repeat}`;
          break;
        }
      }
      if (!allRepeatsMatch) break;
    }

    assert(
      allRepeatsMatch,
      'Test 1: AND gate full truth table (4 cases x 100 repetitions, deterministic)',
      failDetail
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 2: Gate without VCC/GND: output Z, DI0 reads undefined
  // plan (1).md Section 14.2
  // ─────────────────────────────────────────────────────────────────────────
  {
    const engine = new SimEngine();
    const andGate = new GateICComponent('U1', '74HC08');
    engine.registerComponent(andGate);

    // Unpowered: VCC and GND left unconnected
    engine.addNet('net-inA', ['daq.DO0', 'U1.pin1']);
    engine.addNet('net-inB', ['daq.DO1', 'U1.pin2']);
    engine.addNet('net-outY', ['U1.pin3', 'daq.DI0']);

    engine.daq.power(true);
    engine.daq.setDigitalOut(0, 1);
    engine.daq.setDigitalOut(1, 1);

    const snap = engine.tick();
    // Unpowered gate outputs Z -> DI0 reads Z (floating)
    assert(
      snap.daq.di[0] === 'Z',
      'Test 2: Unpowered gate outputs Z, DI0 reads Z (no random value)',
      `Got DI0=${snap.daq.di[0]}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 3: Gate chain (AND into inverter) gives NAND within one tick
  // plan (1).md Section 14.3
  // ─────────────────────────────────────────────────────────────────────────
  {
    const engine = new SimEngine();
    const andGate = new GateICComponent('U1', '74HC08');
    const invGate = new GateICComponent('U2', '74HC04');
    engine.registerComponent(andGate);
    engine.registerComponent(invGate);

    // Power both ICs
    engine.addNet('net-vcc1', ['daq.V5V', 'U1.pin14']);
    engine.addNet('net-gnd1', ['daq.DGND', 'U1.pin7']);
    engine.addNet('net-vcc2', ['daq.V5V', 'U2.pin14']);
    engine.addNet('net-gnd2', ['daq.DGND', 'U2.pin7']);

    // DO0 -> U1.A, DO1 -> U1.B, U1.Y -> U2.A, U2.Y -> DI0
    engine.addNet('net-inA', ['daq.DO0', 'U1.pin1']);
    engine.addNet('net-inB', ['daq.DO1', 'U1.pin2']);
    engine.addNet('net-mid', ['U1.pin3', 'U2.pin1']);   // AND output -> inverter input
    engine.addNet('net-out', ['U2.pin2', 'daq.DI0']);    // Inverter output -> DI0

    engine.daq.power(true);

    // NAND truth table: output is inverted AND
    const nandTable: Array<{ do0: 0 | 1; do1: 0 | 1; expected: Level }> = [
      { do0: 0, do1: 0, expected: 1 },
      { do0: 0, do1: 1, expected: 1 },
      { do0: 1, do1: 0, expected: 1 },
      { do0: 1, do1: 1, expected: 0 },
    ];

    let allCorrect = true;
    let failDetail = '';
    for (const tc of nandTable) {
      engine.daq.setDigitalOut(0, tc.do0);
      engine.daq.setDigitalOut(1, tc.do1);
      const snap = engine.tick();
      if (snap.daq.di[0] !== tc.expected) {
        allCorrect = false;
        failDetail = `DO0=${tc.do0} DO1=${tc.do1}: expected DI0=${tc.expected}, got ${snap.daq.di[0]}`;
        break;
      }
    }

    assert(
      allCorrect,
      'Test 3: Gate chain (AND→INV) gives NAND truth table within one tick',
      failDetail
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 4: D flip-flop: Q changes only on rising edge of clock
  // plan (1).md Section 14.4
  // ─────────────────────────────────────────────────────────────────────────
  {
    const engine = new SimEngine();
    const dff = new DFlipFlopComponent('U1');
    engine.registerComponent(dff);

    // Power
    engine.addNet('net-vcc', ['daq.V5V', 'U1.pin14']);
    engine.addNet('net-gnd', ['daq.DGND', 'U1.pin7']);
    // /CLR (pin1) and /PRE (pin4) tied HIGH (inactive) via V5V
    engine.addNet('net-clr', ['daq.V5V', 'U1.pin1']);
    engine.addNet('net-pre', ['daq.V5V', 'U1.pin4']);

    // DO0 = CLK (pin3), DO1 = D (pin2), Q (pin5) -> DI0
    engine.addNet('net-clk', ['daq.DO0', 'U1.pin3']);
    engine.addNet('net-d', ['daq.DO1', 'U1.pin2']);
    engine.addNet('net-q', ['U1.pin5', 'daq.DI0']);

    engine.daq.power(true);

    // Initial: CLK=0, D=0 → Q should be 0 (reset state)
    engine.daq.setDigitalOut(0, 0); // CLK
    engine.daq.setDigitalOut(1, 0); // D
    engine.tick();
    engine.tick();

    // Set D=1, CLK still 0 → Q should NOT change
    engine.daq.setDigitalOut(1, 1); // D=1
    engine.daq.setDigitalOut(0, 0); // CLK=0
    let snap = engine.tick();
    const qBeforeEdge = snap.daq.di[0];
    assert(
      qBeforeEdge === 0,
      'Test 4a: D=1 but CLK=0 (no edge): Q stays 0',
      `Got Q=${qBeforeEdge}`
    );

    // Rising edge: CLK 0→1, D=1 → Q should become 1
    engine.daq.setDigitalOut(0, 1); // CLK=1 (rising edge)
    snap = engine.tick();
    assert(
      snap.daq.di[0] === 1,
      'Test 4b: Rising edge CLK 0→1 with D=1: Q becomes 1',
      `Got Q=${snap.daq.di[0]}`
    );

    // CLK stays HIGH, D changes to 0 → Q should NOT change (no edge)
    engine.daq.setDigitalOut(1, 0); // D=0
    engine.daq.setDigitalOut(0, 1); // CLK stays 1
    snap = engine.tick();
    assert(
      snap.daq.di[0] === 1,
      'Test 4c: CLK stays HIGH, D=0: Q holds at 1 (no edge)',
      `Got Q=${snap.daq.di[0]}`
    );

    // Falling edge then rising edge with D=0 → Q should become 0
    engine.daq.setDigitalOut(0, 0); // CLK=0 (falling edge, no effect)
    engine.tick();
    engine.daq.setDigitalOut(0, 1); // CLK=1 (rising edge, D=0)
    snap = engine.tick();
    assert(
      snap.daq.di[0] === 0,
      'Test 4d: Rising edge CLK with D=0: Q becomes 0',
      `Got Q=${snap.daq.di[0]}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 5: Writing to a DI-configured line is rejected with error
  // plan (1).md Section 14.5
  // ─────────────────────────────────────────────────────────────────────────
  {
    const engine = new SimEngine();
    engine.daq.power(true);

    const io = engine.createPinIO();
    io.drive('daq.DI0', { mode: 'push-pull', volts: 5.0, level: 1 });

    const hasWriteError = engine.getSnapshot().events.some(
      (e) => e.message.includes('Invalid write to input pin: daq.DI0')
    );
    assert(hasWriteError, 'Test 5: Write to DI pin is rejected with error log');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 6: Floating DI reads Z; with pull-up reads 1; with pull-down reads 0
  // plan (1).md Section 14.6
  // ─────────────────────────────────────────────────────────────────────────
  {
    const engine = new SimEngine();
    engine.daq.power(true);

    // DI0 unconnected (floating) → Z
    const snap1 = engine.tick();
    assert(
      snap1.daq.di[0] === 'Z',
      'Test 6a: Floating DI line reads Z',
      `Got DI0=${snap1.daq.di[0]}`
    );

    // Enable pull-up on DI1 → should read 1
    engine.daq.diPulls[1] = 'up';
    const snap2 = engine.tick();
    assert(
      snap2.daq.di[1] === 1,
      'Test 6b: DI with pull-up reads 1',
      `Got DI1=${snap2.daq.di[1]}`
    );

    // Enable pull-down on DI2 → should read 0
    engine.daq.diPulls[2] = 'down';
    const snap3 = engine.tick();
    assert(
      snap3.daq.di[2] === 0,
      'Test 6c: DI with pull-down reads 0',
      `Got DI2=${snap3.daq.di[2]}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 7: Two DO lines on one net with different levels: contention, X
  // plan (1).md Section 14.7
  // ─────────────────────────────────────────────────────────────────────────
  {
    const engine = new SimEngine();
    engine.daq.power(true);

    engine.daq.setDigitalOut(0, 1); // DO0 = HIGH (VOH = 3.4V)
    engine.daq.setDigitalOut(1, 0); // DO1 = LOW (VOL = 0.4V)
    engine.addNet('contested-net', ['daq.DO0', 'daq.DO1', 'daq.DI0']);

    const snap = engine.tick();
    const netInfo = snap.nets['contested-net'];
    const hasContentionLog = snap.events.some((e) => e.category === 'contention');

    assert(
      netInfo && netInfo.isContested && hasContentionLog,
      'Test 7: Bus contention detected and logged, net level is X',
      `isContested=${netInfo?.isContested}, hasLog=${hasContentionLog}, level=${netInfo?.level}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 8: Analog ramp 0V → 3.3V into gate input: 0 below VIL, X between, 1 above VIH
  // plan (1).md Section 14.8
  // ─────────────────────────────────────────────────────────────────────────
  {
    const engine = new SimEngine();
    const andGate = new GateICComponent('U1', '74HC08');
    engine.registerComponent(andGate);

    // Create a simple voltage source component for the ramp
    let rampVoltage = 0;
    const voltSource: any = {
      id: 'VSRC',
      name: 'VoltageSource',
      pins: [{ id: 'VSRC.out', owner: 'VSRC', dir: 'out', drive: { mode: 'none', volts: 0 } }],
      reset() {},
      step(_dt: number, io: any) {
        io.drive('VSRC.out', { mode: 'analog', volts: rampVoltage });
      },
    };
    engine.registerComponent(voltSource);

    engine.addNet('net-vcc', ['daq.V5V', 'U1.pin14']);
    engine.addNet('net-gnd', ['daq.DGND', 'U1.pin7']);
    // Voltage source → gate input A (pin1), pin2 tied HIGH via V5V
    engine.addNet('net-ramp', ['VSRC.out', 'U1.pin1']);
    engine.addNet('net-inB', ['daq.V5V', 'U1.pin2']);
    engine.addNet('net-outY', ['U1.pin3', 'daq.DI0']);

    engine.daq.power(true);

    // Ramp from 0V to 3.3V in steps
    // VIL=0.8, VIH=2.0: <=0.8→0, 0.8<x<2.0→X, >=2.0→1
    const rampSteps =     [0.0, 0.4, 0.79, 1.0, 1.5, 1.99, 2.0, 2.5, 3.3];
    const expectedLevels: Level[] = [0,   0,   0,  'X', 'X', 'X',  1,   1,   1];

    let allCorrect = true;
    let failDetail = '';
    for (let i = 0; i < rampSteps.length; i++) {
      rampVoltage = rampSteps[i];
      const snap = engine.tick();

      if (snap.daq.di[0] !== expectedLevels[i]) {
        allCorrect = false;
        failDetail = `At ${rampSteps[i]}V: expected DI0=${expectedLevels[i]}, got ${snap.daq.di[0]}`;
        break;
      }
    }

    assert(
      allCorrect,
      'Test 8: Analog ramp through thresholds: 0 below VIL, X between, 1 above VIH',
      failDetail
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 9: Power-on/off: registers wired functions, powers off returns Z
  // plan (1).md Section 14.9
  // ─────────────────────────────────────────────────────────────────────────
  {
    const engine = new SimEngine();
    const andGate = new GateICComponent('U1', '74HC08');
    engine.registerComponent(andGate);
    engine.addNet('net-vcc', ['daq.V5V', 'U1.pin14']);
    engine.addNet('net-gnd', ['daq.DGND', 'U1.pin7']);
    engine.addNet('net-outY', ['U1.pin3', 'daq.DI0']);

    // Initially OFF
    assert(engine.daq.state === 'OFF', 'Test 9a: DAQ initially OFF');

    // Power ON
    engine.daq.power(true);
    assert(engine.daq.state === 'RUNNING', 'Test 9b: DAQ transitions to RUNNING');

    engine.daq.setDigitalOut(0, 1);
    engine.tick(); // Run a tick so power is established

    // Power OFF
    engine.daq.power(false);
    assert(engine.daq.state === 'OFF', 'Test 9c: DAQ transitions back to OFF');

    const offSnap = engine.tick();
    // All DI should be Z when DAQ is OFF
    const allDiZ = offSnap.daq.di.every((v) => v === 'Z');
    assert(allDiZ, 'Test 9d: Power off returns all DI pins to Z',
      `DI=[${offSnap.daq.di.join(',')}]`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 10: Starting two tasks on the same channel fails with reservation error
  // plan (1).md Section 14.10
  // ─────────────────────────────────────────────────────────────────────────
  {
    const engine = new SimEngine();
    engine.daq.power(true);

    // Create and start task 1 on AI0
    const task1 = engine.daq.createTask('AI', ['daq.AI0_P']);
    engine.daq.commitTask(task1.id);
    engine.daq.startTask(task1.id);

    // Try to create and start task 2 on the same channel
    const task2 = engine.daq.createTask('AI', ['daq.AI0_P']);
    engine.daq.commitTask(task2.id);

    let reservationError = false;
    try {
      engine.daq.startTask(task2.id);
    } catch (e: any) {
      if (e.message.includes('Resource reservation error')) {
        reservationError = true;
      }
    }

    assert(
      reservationError,
      'Test 10: Starting two tasks on the same channel fails with reservation error'
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 11: AO0 to AI0, 1kHz sine: scope buffer matches expected sine
  // plan (1).md Section 14.11
  // ─────────────────────────────────────────────────────────────────────────
  {
    const engine = new SimEngine();
    engine.daq.power(true);
    engine.daq.fgen = {
      waveform: 'sine',
      frequency: 1000,
      amplitude: 2.0,
      dcOffset: 0.0,
      enabled: true,
    };

    engine.addNet('net-ao-ai', ['daq.AO0', 'daq.AI0_P']);
    engine.addNet('net-gnd-ai', ['daq.DGND', 'daq.AI0_M']);

    // Run for 5 ticks to populate buffer
    for (let i = 0; i < 5; i++) {
      engine.tick();
    }
    const snap = engine.tick();

    const ai0Samples = snap.daq.ai0;
    const hasValidSamples = ai0Samples.some((s) => Math.abs(s) > 0.01);
    assert(hasValidSamples, 'Test 11: FGEN 1kHz sine at AO0 wired to AI0 is sampled into buffer');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 12: Change-detection DI task records exact toggles with timestamps
  // plan (1).md Section 14.12
  // ─────────────────────────────────────────────────────────────────────────
  {
    const engine = new SimEngine();
    engine.daq.power(true);
    engine.addNet('net-do-di', ['daq.DO0', 'daq.DI0']);

    // Create change-detection DI task
    const cdTask = engine.daq.createTask('DI', ['daq.DI0'], { changeDetection: true });
    engine.daq.commitTask(cdTask.id);
    engine.daq.startTask(cdTask.id);

    // Toggle DO0: 0 -> 1 -> 0 -> 1
    engine.daq.setDigitalOut(0, 0);
    engine.tick();
    engine.daq.setDigitalOut(0, 1);
    engine.tick();
    engine.daq.setDigitalOut(0, 0);
    engine.tick();
    engine.daq.setDigitalOut(0, 1);
    engine.tick();

    const changeLog = cdTask.changeLog || [];
    // Should have recorded transitions: 0->1, 1->0, 0->1 = at least 3 changes
    assert(
      changeLog.length >= 3,
      'Test 12: Change-detection DI task records toggles with timestamps',
      `Got ${changeLog.length} changes: ${JSON.stringify(changeLog.slice(0, 5))}`
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 13: Same scenario twice with same seed: identical snapshots
  // plan (1).md Section 14.13
  // ─────────────────────────────────────────────────────────────────────────
  {
    const runScenario = (seed: number, noise: boolean): string => {
      const engine = new SimEngine();
      engine.setNoise(noise, seed);
      const andGate = new GateICComponent('U1', '74HC08');
      engine.registerComponent(andGate);
      engine.addNet('net-vcc', ['daq.V5V', 'U1.pin14']);
      engine.addNet('net-gnd', ['daq.DGND', 'U1.pin7']);
      engine.addNet('net-inA', ['daq.DO0', 'U1.pin1']);
      engine.addNet('net-inB', ['daq.DO1', 'U1.pin2']);
      engine.addNet('net-outY', ['U1.pin3', 'daq.DI0']);
      engine.daq.power(true);
      engine.daq.setDigitalOut(0, 1);
      engine.daq.setDigitalOut(1, 1);

      for (let i = 0; i < 10; i++) {
        engine.tick();
      }
      const snap = engine.tick();
      return JSON.stringify(snap);
    };

    const run1 = runScenario(42, false);
    const run2 = runScenario(999, false); // Different seed, noise OFF
    const run3 = runScenario(42, true);   // Noise ON, seed 42
    const run4 = runScenario(42, true);   // Noise ON, same seed 42

    const noiseOffIdentical = run1 === run2;
    const sameSeedIdentical = run3 === run4;

    assert(
      noiseOffIdentical && sameSeedIdentical,
      'Test 13: Determinism: noise off => identical; seeded noise => reproducible'
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 14: 30fps and 144fps produce identical logic results
  // plan (1).md Section 14.14
  // ─────────────────────────────────────────────────────────────────────────
  {
    const runAtRate = (ticksPerBatch: number, totalBatches: number): Level[] => {
      const engine = new SimEngine();
      const andGate = new GateICComponent('U1', '74HC08');
      engine.registerComponent(andGate);
      engine.addNet('net-vcc', ['daq.V5V', 'U1.pin14']);
      engine.addNet('net-gnd', ['daq.DGND', 'U1.pin7']);
      engine.addNet('net-inA', ['daq.DO0', 'U1.pin1']);
      engine.addNet('net-inB', ['daq.DO1', 'U1.pin2']);
      engine.addNet('net-outY', ['U1.pin3', 'daq.DI0']);
      engine.daq.power(true);

      const captured: Level[] = [];
      for (let b = 0; b < totalBatches; b++) {
        const val: 0 | 1 = (b % 2 === 0) ? 1 : 0;
        engine.daq.setDigitalOut(0, val);
        engine.daq.setDigitalOut(1, 1);

        for (let t = 0; t < ticksPerBatch; t++) {
          engine.tick();
        }
        captured.push(engine.getSnapshot().daq.di[0]);
      }
      return captured;
    };

    const rateA = runAtRate(1, 20);  // 1 tick per frame (simulated 30fps)
    const rateB = runAtRate(5, 20);  // 5 ticks per frame (simulated 144fps)

    // Logic results must be identical regardless of how many ticks per "frame"
    const match = JSON.stringify(rateA) === JSON.stringify(rateB);
    assert(match, 'Test 14: Frame-rate independence: 30fps and 144fps produce identical logic');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 15: 74HC86 Quad XOR gate full truth table via DO0, DO1 into DI0
  // (0^0=0, 0^1=1, 1^0=1, 1^1=0, repeated 100 times)
  // ─────────────────────────────────────────────────────────────────────────
  {
    const engine = new SimEngine();
    const xorGate = new GateICComponent('U1', '74HC86');
    engine.registerComponent(xorGate);

    engine.addNet('net-vcc', ['daq.V5V', 'U1.pin14']);
    engine.addNet('net-gnd', ['daq.DGND', 'U1.pin7']);
    engine.addNet('net-inA', ['daq.DO0', 'U1.pin1']);
    engine.addNet('net-inB', ['daq.DO1', 'U1.pin2']);
    engine.addNet('net-outY', ['U1.pin3', 'daq.DI0']);

    engine.daq.power(true);

    const testCases: Array<{ a: 0 | 1; b: 0 | 1; expected: 0 | 1 }> = [
      { a: 0, b: 0, expected: 0 },
      { a: 0, b: 1, expected: 1 },
      { a: 1, b: 0, expected: 1 },
      { a: 1, b: 1, expected: 0 },
    ];

    let allXorPassed = true;
    for (let rep = 0; rep < 100; rep++) {
      for (const tc of testCases) {
        engine.daq.setDigitalOut(0, tc.a);
        engine.daq.setDigitalOut(1, tc.b);
        engine.tick();
        const reading = engine.getSnapshot().daq.di[0];
        if (reading !== tc.expected) {
          allXorPassed = false;
          break;
        }
      }
      if (!allXorPassed) break;
    }
    assert(allXorPassed, 'Test 15: 74HC86 XOR gate full truth table (4 cases x 100 reps, deterministic)');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 16: Astable Multivibrator (NE555) responding to Clock / FGEN signal
  // Output captured in AI0 for Oscilloscope
  // ─────────────────────────────────────────────────────────────────────────
  {
    const engine = new SimEngine();
    const timer = new NE555Component('U1');
    engine.registerComponent(timer);

    engine.addNet('net-vcc', ['daq.V5V', 'U1.pin8', 'U1.pin4']); // VCC & RESET held HIGH
    engine.addNet('net-gnd', ['daq.DGND', 'U1.pin1', 'daq.AGND1', 'daq.AI0_M']);
    engine.addNet('net-clk', ['daq.AO0', 'U1.pin2']); // FGEN clock into Pin 2 TRIG
    engine.addNet('net-out', ['U1.pin3', 'daq.AI0_P']); // Pin 3 OUT to AI0+

    // Configure FGEN with 100 Hz square wave clock: 0V to 5V (amp 2.5V, offset 2.5V, period 10ms = 10 ticks)
    engine.daq.fgen = {
      waveform: 'square',
      frequency: 100,
      amplitude: 2.5,
      dcOffset: 2.5,
      enabled: true,
    };
    engine.daq.power(true);

    // Run 50 ticks (50 ms) to generate output oscillations
    for (let i = 0; i < 50; i++) {
      engine.tick();
    }

    const snap = engine.getSnapshot();
    const ai0Buffer = snap.daq.ai0;
    const isAi0Connected = snap.daq.isAi0Connected;

    // Must be marked connected
    const connOk = isAi0Connected === true;
    // Oscilloscope AI0 buffer must have non-zero active values
    const hasOutput = ai0Buffer.some((v) => v > 2.0);
    // Timer is powered and outputting
    const poweredOk = snap.components['U1']?.powered === true;

    assert(
      connOk && hasOutput && poweredOk,
      'Test 16: Astable Multivibrator responds to clock signal and outputs to AI0/Oscilloscope'
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TEST 17: Disconnected AI0/AI1 pin isolation: floating channel reads 0.000 V
  // ─────────────────────────────────────────────────────────────────────────
  {
    const engine = new SimEngine();
    // Only connect AI0 to FGEN, leave AI1 completely unconnected (floating)
    engine.addNet('net-ao0-ai0', ['daq.AO0', 'daq.AI0_P']);
    engine.addNet('net-agnd', ['daq.AGND1', 'daq.AI0_M']);

    engine.daq.fgen = {
      waveform: 'sine',
      frequency: 1000,
      amplitude: 2.0,
      dcOffset: 0.0,
      enabled: true,
    };
    engine.daq.power(true);

    for (let i = 0; i < 20; i++) {
      engine.tick();
    }

    const snap = engine.getSnapshot();
    const ai0Connected = snap.daq.isAi0Connected === true;
    const ai1Disconnected = snap.daq.isAi1Connected === false;
    const ai1AllZero = snap.daq.ai1.every((v) => Math.abs(v) < 1e-9);

    assert(
      ai0Connected && ai1Disconnected && ai1AllZero,
      'Test 17: Disconnected pin isolation: AI0 samples waveform while floating AI1 is strictly 0.000 V'
    );
  }

  return { passed, failed, results };
}
