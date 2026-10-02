import React, { useState } from 'react';
import { useSimEngine } from '../../simulation/engine/useSimEngine';
import {
  LabViewPoweredLogo,
} from './LabViewCommonIcons';

type Tab = 'log' | 'inspector' | 'clock';

export function SimEngineDebugWindow() {
  const { snapshot, engine, runner } = useSimEngine();
  const [activeTab, setActiveTab] = useState<Tab>('log');
  const [selectedNetId, setSelectedNetId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'error' | 'warn' | 'info'>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [noiseSeed, setNoiseSeed] = useState<number>(12345);

  const handleStepOnce = () => {
    runner.stepOnce();
  };

  const handleToggleNoise = () => {
    const nextNoise = !engine.noiseEnabled;
    engine.setNoise(nextNoise, noiseSeed);
    runner.stepOnce();
  };

  const handleApplySeed = (seed: number) => {
    setNoiseSeed(seed);
    engine.setNoise(engine.noiseEnabled, seed);
  };

  // Filter events
  const filteredEvents = snapshot.events.filter((e) => {
    if (filterType !== 'all' && e.type !== filterType) return false;
    if (filterCategory !== 'all' && e.category !== filterCategory) return false;
    return true;
  });

  const netEntries = Object.entries(snapshot.nets);

  const selectedNet = selectedNetId ? snapshot.nets[selectedNetId] : null;

  return (
    <div className="labview-debug-panel" style={{
      background: '#0F172A',
      color: '#E2E8F0',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '12px',
      display: 'flex',
      flexDirection: 'column',
      height: '420px',
      userSelect: 'none',
    }}>
      {/* Top Header & Clock Bar */}
      <div style={{
        background: '#1E293B',
        padding: '8px 12px',
        borderBottom: '1px solid #334155',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <LabViewPoweredLogo />
          <span style={{ fontWeight: 'bold', color: '#38BDF8', fontSize: '13px' }}>
            SimEngine Diagnostic Monitor
          </span>
          <span style={{
            fontSize: '10px',
            padding: '2px 6px',
            borderRadius: '4px',
            background: snapshot.daqState === 'RUNNING' ? '#065F46' : '#7F1D1D',
            color: snapshot.daqState === 'RUNNING' ? '#34D399' : '#F87171',
            fontWeight: 'bold',
            textTransform: 'uppercase',
          }}>
            DAQ {snapshot.daqState}
          </span>
        </div>

        {/* Master Clock / Step Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            background: '#090D16',
            padding: '3px 8px',
            borderRadius: '4px',
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: '11px',
            color: '#A5F3FC',
            border: '1px solid #1E293B',
          }}>
            T: <strong style={{ color: '#38BDF8' }}>{snapshot.time.toFixed(3)}s</strong> | Tick: <strong style={{ color: '#FCD34D' }}>{snapshot.tick}</strong>
          </div>

          <button
            onClick={handleStepOnce}
            style={{
              background: '#2563EB',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 8px',
              fontSize: '11px',
              fontWeight: 'bold',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
            title="Advance exactly 1 tick (1 ms dt)"
          >
            ⏭ Step 1ms
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        background: '#090D16',
        borderBottom: '1px solid #1E293B',
      }}>
        <button
          onClick={() => setActiveTab('log')}
          style={{
            padding: '6px 14px',
            background: activeTab === 'log' ? '#1E293B' : 'transparent',
            color: activeTab === 'log' ? '#38BDF8' : '#94A3B8',
            border: 'none',
            borderBottom: activeTab === 'log' ? '2px solid #38BDF8' : '2px solid transparent',
            fontWeight: activeTab === 'log' ? 'bold' : 'normal',
            cursor: 'pointer',
          }}
        >
          Event Log ({snapshot.events.length})
        </button>
        <button
          onClick={() => setActiveTab('inspector')}
          style={{
            padding: '6px 14px',
            background: activeTab === 'inspector' ? '#1E293B' : 'transparent',
            color: activeTab === 'inspector' ? '#38BDF8' : '#94A3B8',
            border: 'none',
            borderBottom: activeTab === 'inspector' ? '2px solid #38BDF8' : '2px solid transparent',
            fontWeight: activeTab === 'inspector' ? 'bold' : 'normal',
            cursor: 'pointer',
          }}
        >
          Pin & Net Inspector ({netEntries.length} nets)
        </button>
        <button
          onClick={() => setActiveTab('clock')}
          style={{
            padding: '6px 14px',
            background: activeTab === 'clock' ? '#1E293B' : 'transparent',
            color: activeTab === 'clock' ? '#38BDF8' : '#94A3B8',
            border: 'none',
            borderBottom: activeTab === 'clock' ? '2px solid #38BDF8' : '2px solid transparent',
            fontWeight: activeTab === 'clock' ? 'bold' : 'normal',
            cursor: 'pointer',
          }}
        >
          Clock & Noise Config
        </button>
      </div>

      {/* Tab Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* 1. EVENT LOG TAB */}
        {activeTab === 'log' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Filter toolbar */}
            <div style={{
              padding: '6px 10px',
              background: '#131D31',
              borderBottom: '1px solid #1E293B',
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
            }}>
              <span>Filter:</span>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                style={{ background: '#0F172A', color: '#E2E8F0', border: '1px solid #334155', borderRadius: '3px', padding: '2px 4px' }}
              >
                <option value="all">All Levels</option>
                <option value="error">Errors</option>
                <option value="warn">Warnings</option>
                <option value="info">Info</option>
              </select>

              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                style={{ background: '#0F172A', color: '#E2E8F0', border: '1px solid #334155', borderRadius: '3px', padding: '2px 4px' }}
              >
                <option value="all">All Categories</option>
                <option value="contention">Contention</option>
                <option value="daq">DAQ</option>
                <option value="oscillation">Oscillation</option>
                <option value="net">Net</option>
                <option value="component">Component</option>
              </select>
            </div>

            {/* Log list */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '11px',
              padding: '6px',
            }}>
              {filteredEvents.length === 0 ? (
                <div style={{ color: '#64748B', textAlign: 'center', padding: '20px' }}>
                  No events logged yet. (All simulation operations normal)
                </div>
              ) : (
                filteredEvents.slice().reverse().map((ev, idx) => {
                  const isError = ev.type === 'error';
                  const isWarn = ev.type === 'warn';
                  const bg = isError ? 'rgba(239, 68, 68, 0.15)' : isWarn ? 'rgba(245, 158, 11, 0.12)' : 'transparent';
                  const color = isError ? '#F87171' : isWarn ? '#FBBF24' : '#94A3B8';
                  return (
                    <div
                      key={idx}
                      style={{
                        padding: '4px 6px',
                        borderBottom: '1px solid #1E293B',
                        background: bg,
                        display: 'flex',
                        gap: '8px',
                        alignItems: 'baseline',
                      }}
                    >
                      <span style={{ color: '#64748B', minWidth: '55px' }}>{ev.timestamp.toFixed(3)}s</span>
                      <span style={{
                        padding: '1px 4px',
                        borderRadius: '2px',
                        background: isError ? '#7F1D1D' : isWarn ? '#78350F' : '#1E293B',
                        color,
                        fontWeight: 'bold',
                        fontSize: '9px',
                        textTransform: 'uppercase',
                        minWidth: '40px',
                        textAlign: 'center',
                      }}>
                        {ev.type}
                      </span>
                      <span style={{ color: '#38BDF8', minWidth: '70px' }}>[{ev.category}]</span>
                      <span style={{ color: '#E2E8F0', flex: 1 }}>{ev.message}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* 2. PIN & NET INSPECTOR TAB */}
        {activeTab === 'inspector' && (
          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* Left: Nets list */}
            <div style={{ width: '45%', borderRight: '1px solid #1E293B', overflowY: 'auto', padding: '6px' }}>
              <div style={{ fontWeight: 'bold', color: '#94A3B8', marginBottom: '6px', fontSize: '11px' }}>
                ELECTRICAL NETS ({netEntries.length})
              </div>
              {netEntries.map(([netId, net]) => {
                const isSelected = selectedNetId === netId;
                const isContested = net.isContested;
                return (
                  <div
                    key={netId}
                    onClick={() => setSelectedNetId(netId)}
                    style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      marginBottom: '2px',
                      cursor: 'pointer',
                      background: isSelected ? '#1E293B' : isContested ? 'rgba(239, 68, 68, 0.2)' : '#0F172A',
                      border: isContested ? '1px solid #EF4444' : isSelected ? '1px solid #38BDF8' : '1px solid #1E293B',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'bold', color: isContested ? '#F87171' : '#F1F5F9' }}>
                        {netId}
                      </div>
                      <div style={{ fontSize: '10px', color: '#64748B' }}>
                        {net.pins.length} pin{net.pins.length === 1 ? '' : 's'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontFamily: '"JetBrains Mono", monospace' }}>
                      <span style={{
                        padding: '1px 5px',
                        borderRadius: '3px',
                        fontWeight: 'bold',
                        background: net.level === 1 ? '#065F46' : net.level === 0 ? '#1E293B' : '#78350F',
                        color: net.level === 1 ? '#34D399' : net.level === 0 ? '#94A3B8' : '#FBBF24',
                      }}>
                        {net.level}
                      </span>
                      <div style={{ fontSize: '10px', color: '#94A3B8' }}>{(net.volts ?? 0).toFixed(2)}V</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right: Net Details & Connected Pins */}
            <div style={{ flex: 1, padding: '10px', overflowY: 'auto' }}>
              {selectedNet ? (
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#38BDF8', marginBottom: '8px' }}>
                    Net Details: {selectedNetId}
                  </div>
                  {selectedNet.isContested && (
                    <div style={{
                      background: '#7F1D1D',
                      color: '#FECACA',
                      padding: '6px 8px',
                      borderRadius: '4px',
                      marginBottom: '8px',
                      fontWeight: 'bold',
                    }}>
                      ⚠️ BUS CONTENTION: Multiple output pins driving opposing levels!
                    </div>
                  )}
                  <div style={{ marginBottom: '12px' }}>
                    <strong>Resolved Level:</strong> {selectedNet.level} ({(selectedNet.volts ?? 0).toFixed(2)} V)
                  </div>
                  <div style={{ fontWeight: 'bold', color: '#94A3B8', marginBottom: '6px' }}>
                    CONNECTED PINS ({selectedNet.pins.length}):
                  </div>
                  {selectedNet.pins.map((pId) => {
                    const pin = snapshot.pins[pId];
                    return (
                      <div
                        key={pId}
                        style={{
                          background: '#1E293B',
                          padding: '6px 8px',
                          borderRadius: '4px',
                          marginBottom: '4px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontFamily: '"JetBrains Mono", monospace',
                        }}
                      >
                        <div>
                          <div style={{ color: '#F1F5F9', fontWeight: 'bold' }}>{pId}</div>
                          <div style={{ fontSize: '10px', color: '#64748B' }}>
                            Owner: {pin?.owner || 'unknown'} | Dir: <span style={{ color: pin?.dir === 'out' ? '#F59E0B' : '#38BDF8' }}>{pin?.dir}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{
                            padding: '1px 4px',
                            borderRadius: '2px',
                            background: pin?.level === 1 ? '#065F46' : pin?.level === 0 ? '#0F172A' : '#78350F',
                            color: pin?.level === 1 ? '#34D399' : pin?.level === 0 ? '#94A3B8' : '#FBBF24',
                          }}>
                            {pin?.level ?? 'Z'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ color: '#64748B', textAlign: 'center', paddingTop: '40px' }}>
                  Select an electrical net on the left to inspect its drivers and pins.
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. CLOCK & NOISE CONFIG TAB */}
        {activeTab === 'clock' && (
          <div style={{ padding: '16px', overflowY: 'auto' }}>
            <h4 style={{ margin: '0 0 12px 0', color: '#38BDF8' }}>Simulation Clock Configuration</h4>
            <div style={{ background: '#1E293B', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
              <div style={{ marginBottom: '8px' }}>
                <strong>Timestep (dt):</strong> 0.001 s (1 ms fixed timestep / 1,000 Hz master rate)
              </div>
              <div style={{ marginBottom: '8px' }}>
                <strong>Determinism Policy:</strong> 100% Single-Clock Pure State Machine
              </div>
              <div>
                <strong>Simulation State:</strong> {snapshot.daqState}
              </div>
            </div>

            <h4 style={{ margin: '0 0 12px 0', color: '#38BDF8' }}>Real-World Analog Noise Policy (plan.md Section 10)</h4>
            <div style={{ background: '#1E293B', padding: '12px', borderRadius: '6px' }}>
              <p style={{ margin: '0 0 10px 0', color: '#94A3B8', fontSize: '11px' }}>
                Per Section 10: Digital logic is strictly 100% deterministic with zero randomness. Optional seeded PRNG noise can be added only to analog AI samples.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={engine.noiseEnabled}
                    onChange={handleToggleNoise}
                  />
                  <span>Enable Seeded Analog Noise (AI samples only)</span>
                </label>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>PRNG Seed:</span>
                <input
                  type="number"
                  value={noiseSeed}
                  onChange={(e) => handleApplySeed(parseInt(e.target.value, 10) || 1)}
                  style={{
                    background: '#0F172A',
                    color: '#F1F5F9',
                    border: '1px solid #334155',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    width: '100px',
                    fontFamily: '"JetBrains Mono", monospace',
                  }}
                />
                <button
                  onClick={() => handleApplySeed(Math.floor(Math.random() * 100000))}
                  style={{
                    background: '#334155',
                    color: '#F1F5F9',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                  }}
                >
                  Randomize Seed
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
