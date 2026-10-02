import React, { useMemo } from 'react';
import { RotaryKnob } from '../common/RotaryKnob';
import { useStore } from '../../store/CircuitStore';
import { solveCircuitPhysics } from '../../simulation/circuitPhysics';

export function LabViewVPS() {
  const { state, dispatch } = useStore();

  const vps = state.instruments.vps || {
    enabled: true,
    posVoltage: 12.0,
    negVoltage: 0.0,
  };

  const posVoltage = vps.posVoltage;
  const negVoltage = vps.negVoltage;
  const outputEnabled = vps.enabled;

  const setPosVoltage = (v: number) => {
    dispatch({
      type: 'UPDATE_VPS',
      settings: { posVoltage: Math.round(v * 10) / 10 },
    });
  };

  const setNegVoltage = (v: number) => {
    dispatch({
      type: 'UPDATE_VPS',
      settings: { negVoltage: Math.round(v * 10) / 10 },
    });
  };

  const setOutputEnabled = (enabled: boolean) => {
    dispatch({
      type: 'UPDATE_VPS',
      settings: { enabled },
    });
  };

  // Calculate actual circuit load currents on +VPS and -VPS
  const { posCurrentMa, negCurrentMa } = useMemo(() => {
    if (!outputEnabled || state.instruments.daq?.enabled === false || state.simulation.status !== 'running') {
      return { posCurrentMa: 0, negCurrentMa: 0 };
    }

    const physics = solveCircuitPhysics(state, performance.now() / 1000);
    const posNode = physics.contactToNodeMap.get('daq-p15v');
    const negNode = physics.contactToNodeMap.get('daq-n15v');

    let pCurrent = 0;
    let nCurrent = 0;

    if (posNode) {
      for (const r of physics.resistors.values()) {
        const comp = state.components.get(r.id);
        if (comp && comp.type === 'resistor') {
          const c1 = comp.pins[0]?.contactId;
          const c2 = comp.pins[1]?.contactId;
          if (c1 && c2) {
            const n1 = physics.contactToNodeMap.get(c1);
            const n2 = physics.contactToNodeMap.get(c2);
            if (n1 === posNode || n2 === posNode) {
              pCurrent += Math.abs(r.currentMilliAmps);
            }
          }
        }
      }
      for (const led of physics.leds.values()) {
        const comp = state.components.get(led.id);
        if (comp && comp.type === 'led') {
          const cAnode = comp.pins[0]?.contactId;
          const cCathode = comp.pins[1]?.contactId;
          if (cAnode && cCathode) {
            const n1 = physics.contactToNodeMap.get(cAnode);
            const n2 = physics.contactToNodeMap.get(cCathode);
            if (n1 === posNode || n2 === posNode) {
              pCurrent += led.currentMilliAmps;
            }
          }
        }
      }
      for (const ic of physics.ics.values()) {
        if (ic.isPowered) {
          const comp = state.components.get(ic.id);
          if (comp && comp.type === 'ic') {
            const is555 = (comp as any).icType === 'NE555';
            const vccPin = is555 ? comp.pins[7]?.contactId : comp.pins[13]?.contactId;
            if (vccPin && physics.contactToNodeMap.get(vccPin) === posNode) {
              pCurrent += is555 ? 10 : 8;
            }
          }
        }
      }
    }

    if (negNode) {
      for (const r of physics.resistors.values()) {
        const comp = state.components.get(r.id);
        if (comp && comp.type === 'resistor') {
          const c1 = comp.pins[0]?.contactId;
          const c2 = comp.pins[1]?.contactId;
          if (c1 && c2) {
            const n1 = physics.contactToNodeMap.get(c1);
            const n2 = physics.contactToNodeMap.get(c2);
            if (n1 === negNode || n2 === negNode) {
              nCurrent += Math.abs(r.currentMilliAmps);
            }
          }
        }
      }
    }

    return { posCurrentMa: pCurrent, negCurrentMa: nCurrent };
  }, [state, outputEnabled]);

  return (
    <div className="labview-vps-panel">
      {/* Top Banner */}
      <div className="fgen-top-row">
        <div className="labview-badge">
          <div className="labview-badge-inner">
            <span className="labview-badge-sub">POWERED BY</span>
            <span className="labview-badge-main">LabVIEW</span>
          </div>
        </div>
        <div className="vps-status-tag">
          <span className={`led-dot ${outputEnabled ? 'active' : ''}`} />
          <span>Output: {outputEnabled ? 'ACTIVE' : 'DISABLED'}</span>
        </div>
      </div>

      <div className="vps-channels-grid">
        {/* Positive Supply (+0 to +12V) */}
        <fieldset className="labview-fieldset vps-pos-fieldset">
          <legend className="labview-legend">
            <span className="ch-color-box red" />
            <span>+ Positive Supply (0 to +12V)</span>
          </legend>

          <div className="vps-channel-body">
            <div className="vps-digital-display red">
              <span>+{posVoltage.toFixed(2)} V</span>
            </div>

            <div className="vps-knob-wrapper">
              <RotaryKnob
                label="Voltage (V)"
                value={posVoltage}
                min={0}
                max={12}
                step={0.1}
                size={54}
                ticks={[
                  { value: 0, label: '0V' },
                  { value: 6, label: '6V' },
                  { value: 12, label: '12V' },
                ]}
                onChange={(v) => setPosVoltage(v)}
              />
            </div>

            <div className="vps-meas-row">
              <span className="meas-label">Current:</span>
              <span className="meas-val">{posCurrentMa.toFixed(1)} mA</span>
            </div>
          </div>
        </fieldset>

        {/* Negative Supply (-0 to -12V) */}
        <fieldset className="labview-fieldset vps-neg-fieldset">
          <legend className="labview-legend">
            <span className="ch-color-box blue" />
            <span>− Negative Supply (0 to −12V)</span>
          </legend>

          <div className="vps-channel-body">
            <div className="vps-digital-display blue">
              <span>-{negVoltage.toFixed(2)} V</span>
            </div>

            <div className="vps-knob-wrapper">
              <RotaryKnob
                label="Voltage (V)"
                value={negVoltage}
                min={0}
                max={12}
                step={0.1}
                size={54}
                ticks={[
                  { value: 0, label: '0V' },
                  { value: 6, label: '-6V' },
                  { value: 12, label: '-12V' },
                ]}
                onChange={(v) => setNegVoltage(v)}
              />
            </div>

            <div className="vps-meas-row">
              <span className="meas-label">Current:</span>
              <span className="meas-val">{negCurrentMa.toFixed(1)} mA</span>
            </div>
          </div>
        </fieldset>
      </div>

      {/* Enable switch */}
      <div className="vps-footer-controls">
        <button
          className={`labview-action-btn vps-power-btn ${outputEnabled ? 'active' : ''}`}
          onClick={() => setOutputEnabled(!outputEnabled)}
        >
          {outputEnabled ? 'POWER ON' : 'POWER OFF'}
        </button>
      </div>
    </div>
  );
}
