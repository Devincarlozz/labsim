import React, { useState, useEffect } from 'react';
import { InstrumentType } from './InstrumentLauncherBar';
import { LabViewWindow } from '../common/LabViewWindow';
import { LabViewFunctionGenerator } from './LabViewFunctionGenerator';
import { LabViewOscilloscope } from './LabViewOscilloscope';
import { LabViewDMM } from './LabViewDMM';
import { LabViewVPS } from './LabViewVPS';
import { LabViewDigitalWriter } from './LabViewDigitalWriter';
import { LabViewDigitalReader } from './LabViewDigitalReader';
import { LabViewBodeDSA } from './LabViewBodeDSA';
import { SimEngineDebugWindow } from './SimEngineDebugWindow';
import { ElvisInstrumentIcon } from './LabViewCommonIcons';
import { useStore } from '../../store/CircuitStore';

const DEFAULT_POSITIONS: Record<InstrumentType, { x: number; y: number }> = {
  FGEN: { x: 25, y: 25 },
  Scope: { x: 70, y: 30 },
  DMM: { x: 100, y: 100 },
  VPS: { x: 150, y: 120 },
  Bode: { x: 140, y: 80 },
  DSA: { x: 170, y: 110 },
  ARB: { x: 130, y: 70 },
  DigIn: { x: 160, y: 120 },
  DigOut: { x: 200, y: 140 },
  Imped: { x: 220, y: 130 },
  TwoWire: { x: 180, y: 105 },
  ThreeWire: { x: 210, y: 135 },
  SimDebug: { x: 90, y: 50 },
};

export function BottomInstrumentSuite() {
  const { state, dispatch } = useStore();
  const daqActive = (state.instruments.daq?.enabled !== false) && (state.simulation.status === 'running');

  // State for all 12 instrument windows (Scope false by default so it does not open automatically)
  const [openWindows, setOpenWindows] = useState<Record<InstrumentType, boolean>>({
    Scope: false,
    FGEN: false,
    DMM: false,
    VPS: false,
    Bode: false,
    DSA: false,
    ARB: false,
    DigIn: false,
    DigOut: false,
    Imped: false,
    TwoWire: false,
    ThreeWire: false,
    SimDebug: false,
  });

  // State for launcher menu bar (expanded by default so all 12 instruments are visible)
  const [isExpanded, setIsExpanded] = useState(true);

  const [windowPositions, setWindowPositions] = useState<Record<InstrumentType, { x: number; y: number }>>(DEFAULT_POSITIONS);

  const [windowZIndexes, setWindowZIndexes] = useState<Record<InstrumentType, number>>({
    FGEN: 101,
    Scope: 102,
    DMM: 100,
    VPS: 100,
    Bode: 100,
    DSA: 100,
    ARB: 100,
    DigIn: 100,
    DigOut: 100,
    Imped: 100,
    TwoWire: 100,
    ThreeWire: 100,
    SimDebug: 100,
  });

  const [highestZ, setHighestZ] = useState(105);
  const [focusedWindow, setFocusedWindow] = useState<InstrumentType | null>('Scope');

  // Focus a window and bring it to front
  const handleFocusWindow = (inst: InstrumentType) => {
    const nextZ = highestZ + 1;
    setHighestZ(nextZ);
    setWindowZIndexes((prev) => ({ ...prev, [inst]: nextZ }));
    setFocusedWindow(inst);
  };

  // Toggle or focus instrument from launcher menu
  const handleToggleInstrument = (inst: InstrumentType) => {
    if (!openWindows[inst]) {
      const nextZ = highestZ + 1;
      setHighestZ(nextZ);
      setWindowZIndexes((prev) => ({ ...prev, [inst]: nextZ }));
      setOpenWindows((prev) => ({ ...prev, [inst]: true }));
      setFocusedWindow(inst);

      // Clamp position so window is always within visible viewport on small landscape screens
      setWindowPositions((prev) => {
        const cur = prev[inst] || DEFAULT_POSITIONS[inst];
        const maxX = Math.max(10, window.innerWidth - 420);
        const maxY = Math.max(10, window.innerHeight - 300);
        return {
          ...prev,
          [inst]: {
            x: Math.min(Math.max(10, cur.x), maxX),
            y: Math.min(Math.max(10, cur.y), maxY),
          },
        };
      });
    } else {
      // Bring existing window to front and clamp into view
      handleFocusWindow(inst);
      setWindowPositions((prev) => {
        const cur = prev[inst] || DEFAULT_POSITIONS[inst];
        const maxX = Math.max(10, window.innerWidth - 420);
        const maxY = Math.max(10, window.innerHeight - 300);
        return {
          ...prev,
          [inst]: {
            x: Math.min(Math.max(10, cur.x), maxX),
            y: Math.min(Math.max(10, cur.y), maxY),
          },
        };
      });
    }
  };

  // Listen to open-instrument custom events
  useEffect(() => {
    const handleOpenInst = (e: Event) => {
      const customEvent = e as CustomEvent<{ inst: InstrumentType }>;
      if (customEvent.detail?.inst) {
        setIsExpanded(true);
        handleToggleInstrument(customEvent.detail.inst);
      }
    };

    window.addEventListener('open-instrument', handleOpenInst);
    return () => {
      window.removeEventListener('open-instrument', handleOpenInst);
    };
  }, [openWindows, highestZ]);

  // Close an instrument window
  const handleCloseWindow = (inst: InstrumentType) => {
    setOpenWindows((prev) => ({ ...prev, [inst]: false }));
    if (focusedWindow === inst) {
      setFocusedWindow(null);
    }
  };

  // Cascade all open windows diagonally
  const handleCascade = () => {
    let offset = 0;
    const newPositions = { ...windowPositions };
    const order: InstrumentType[] = [
      'FGEN', 'Scope', 'DMM', 'VPS', 'Bode', 'DSA', 'ARB',
      'DigIn', 'DigOut', 'Imped', 'TwoWire', 'ThreeWire', 'SimDebug'
    ];
    order.forEach((k) => {
      if (openWindows[k]) {
        newPositions[k] = { x: 20 + (offset % 8) * 32, y: 20 + (offset % 8) * 28 };
        offset++;
      }
    });
    setWindowPositions(newPositions);
    setIsExpanded(true);
  };

  // Preset: Tile Dual View (FGEN on left, Scope on right)
  const handleTileDual = () => {
    const vw = window.innerWidth;
    const scopeW = Math.min(890, Math.max(480, Math.floor(vw * 0.52)));
    const scopeX = Math.max(20, vw - scopeW - 24);

    setOpenWindows((prev) => ({ ...prev, FGEN: true, Scope: true }));
    setWindowPositions((prev) => ({
      ...prev,
      FGEN: { x: 16, y: 16 },
      Scope: { x: scopeX, y: 16 },
    }));
    const nextZ = highestZ + 2;
    setHighestZ(nextZ);
    setWindowZIndexes((prev) => ({
      ...prev,
      FGEN: nextZ - 1,
      Scope: nextZ,
    }));
    setFocusedWindow('Scope');
    setIsExpanded(true);
  };

  // Close all windows
  const handleCloseAll = () => {
    setOpenWindows({
      Scope: false,
      FGEN: false,
      DMM: false,
      VPS: false,
      Bode: false,
      DSA: false,
      ARB: false,
      DigIn: false,
      DigOut: false,
      Imped: false,
      TwoWire: false,
      ThreeWire: false,
      SimDebug: false,
    });
    setFocusedWindow(null);
  };

  const openCount = Object.values(openWindows).filter(Boolean).length;

  return (
    <>
      {/* ─── Floating Overlapping Instruments Layer ───────────────────────────── */}
      <div className="floating-windows-layer">
        {/* 1. Function Generator */}
        <LabViewWindow
          title="Function Generator - NI ELVISmx"
          isOpen={openWindows.FGEN}
          onClose={() => handleCloseWindow('FGEN')}
          defaultPosition={windowPositions.FGEN}
          width={520}
          zIndex={windowZIndexes.FGEN}
          isFocused={focusedWindow === 'FGEN'}
          onFocus={() => handleFocusWindow('FGEN')}
        >
          <LabViewFunctionGenerator />
        </LabViewWindow>

        {/* 2. Oscilloscope */}
        <LabViewWindow
          title="Oscilloscope - NI ELVISmx"
          isOpen={openWindows.Scope}
          onClose={() => handleCloseWindow('Scope')}
          defaultPosition={windowPositions.Scope}
          width={890}
          zIndex={windowZIndexes.Scope}
          isFocused={focusedWindow === 'Scope'}
          onFocus={() => handleFocusWindow('Scope')}
        >
          <LabViewOscilloscope />
        </LabViewWindow>

        {/* 3. Digital Multimeter (DMM) */}
        <LabViewWindow
          title="Digital Multimeter (DMM) - NI ELVISmx"
          isOpen={openWindows.DMM}
          onClose={() => handleCloseWindow('DMM')}
          defaultPosition={windowPositions.DMM}
          width={400}
          zIndex={windowZIndexes.DMM}
          isFocused={focusedWindow === 'DMM'}
          onFocus={() => handleFocusWindow('DMM')}
        >
          <LabViewDMM />
        </LabViewWindow>

        {/* 4. Variable Power Supply (VPS) */}
        <LabViewWindow
          title="Variable Power Supply (VPS) - NI ELVISmx"
          isOpen={openWindows.VPS}
          onClose={() => handleCloseWindow('VPS')}
          defaultPosition={windowPositions.VPS}
          width={460}
          zIndex={windowZIndexes.VPS}
          isFocused={focusedWindow === 'VPS'}
          onFocus={() => handleFocusWindow('VPS')}
        >
          <LabViewVPS />
        </LabViewWindow>

        {/* 5. Digital Reader (DigIn) */}
        <LabViewWindow
          title="Digital Reader - NI ELVISmx"
          isOpen={openWindows.DigIn}
          onClose={() => handleCloseWindow('DigIn')}
          defaultPosition={windowPositions.DigIn}
          width={390}
          zIndex={windowZIndexes.DigIn}
          isFocused={focusedWindow === 'DigIn'}
          onFocus={() => handleFocusWindow('DigIn')}
          icon={<ElvisInstrumentIcon />}
        >
          <LabViewDigitalReader />
        </LabViewWindow>

        {/* 6. Digital Writer (DigOut) */}
        <LabViewWindow
          title="Digital Writer - NI ELVISmx"
          isOpen={openWindows.DigOut}
          onClose={() => handleCloseWindow('DigOut')}
          defaultPosition={windowPositions.DigOut}
          width={390}
          zIndex={windowZIndexes.DigOut}
          isFocused={focusedWindow === 'DigOut'}
          onFocus={() => handleFocusWindow('DigOut')}
          icon={<ElvisInstrumentIcon />}
        >
          <LabViewDigitalWriter />
        </LabViewWindow>

        {/* 7. Bode Analyzer */}
        <LabViewWindow
          title="Bode Analyzer - NI ELVISmx"
          isOpen={openWindows.Bode}
          onClose={() => handleCloseWindow('Bode')}
          defaultPosition={windowPositions.Bode}
          width={560}
          zIndex={windowZIndexes.Bode}
          isFocused={focusedWindow === 'Bode'}
          onFocus={() => handleFocusWindow('Bode')}
        >
          <LabViewBodeDSA />
        </LabViewWindow>

        {/* 8. Dynamic Signal Analyzer (DSA) */}
        <LabViewWindow
          title="Dynamic Signal Analyzer (DSA) - NI ELVISmx"
          isOpen={openWindows.DSA}
          onClose={() => handleCloseWindow('DSA')}
          defaultPosition={windowPositions.DSA}
          width={560}
          zIndex={windowZIndexes.DSA}
          isFocused={focusedWindow === 'DSA'}
          onFocus={() => handleFocusWindow('DSA')}
        >
          <LabViewBodeDSA />
        </LabViewWindow>

        {/* 9. Arbitrary Waveform Generator (ARB) */}
        <LabViewWindow
          title="Arbitrary Waveform Generator (ARB) - NI ELVISmx"
          isOpen={openWindows.ARB}
          onClose={() => handleCloseWindow('ARB')}
          defaultPosition={windowPositions.ARB}
          width={540}
          zIndex={windowZIndexes.ARB}
          isFocused={focusedWindow === 'ARB'}
          onFocus={() => handleFocusWindow('ARB')}
        >
          <LabViewBodeDSA />
        </LabViewWindow>

        {/* 10. Impedance Analyzer (Imped) */}
        <LabViewWindow
          title="Impedance Analyzer (Imped) - NI ELVISmx"
          isOpen={openWindows.Imped}
          onClose={() => handleCloseWindow('Imped')}
          defaultPosition={windowPositions.Imped}
          width={500}
          zIndex={windowZIndexes.Imped}
          isFocused={focusedWindow === 'Imped'}
          onFocus={() => handleFocusWindow('Imped')}
        >
          <LabViewBodeDSA />
        </LabViewWindow>

        {/* 11. Two-Wire Current-Voltage Analyzer */}
        <LabViewWindow
          title="Two-Wire Current-Voltage Analyzer - NI ELVISmx"
          isOpen={openWindows.TwoWire}
          onClose={() => handleCloseWindow('TwoWire')}
          defaultPosition={windowPositions.TwoWire}
          width={520}
          zIndex={windowZIndexes.TwoWire}
          isFocused={focusedWindow === 'TwoWire'}
          onFocus={() => handleFocusWindow('TwoWire')}
        >
          <LabViewBodeDSA />
        </LabViewWindow>

        {/* 12. Three-Wire Current-Voltage Analyzer */}
        <LabViewWindow
          title="Three-Wire Transistor Analyzer - NI ELVISmx"
          isOpen={openWindows.ThreeWire}
          onClose={() => handleCloseWindow('ThreeWire')}
          defaultPosition={windowPositions.ThreeWire}
          width={520}
          zIndex={windowZIndexes.ThreeWire}
          isFocused={focusedWindow === 'ThreeWire'}
          onFocus={() => handleFocusWindow('ThreeWire')}
        >
          <LabViewBodeDSA />
        </LabViewWindow>

        {/* 13. SimEngine Diagnostic Monitor (plan.md Section 13) */}
        <LabViewWindow
          title="SimEngine Diagnostic Monitor & Net Inspector"
          isOpen={openWindows.SimDebug}
          onClose={() => handleCloseWindow('SimDebug')}
          defaultPosition={windowPositions.SimDebug}
          width={620}
          zIndex={windowZIndexes.SimDebug}
          isFocused={focusedWindow === 'SimDebug'}
          onFocus={() => handleFocusWindow('SimDebug')}
          icon={<ElvisInstrumentIcon />}
        >
          <SimEngineDebugWindow />
        </LabViewWindow>
      </div>

      {/* ─── NI ELVISmx Instrument Menu Container (Bottom Area) ───────────── */}
      <div className={`bottom-instruments-container compact-menu ${isExpanded ? 'is-expanded' : 'is-collapsed'}`}>
        <div className="bottom-launcher-bar-container">
          {/* Header Strip with Presets & Collapse Toggle */}
          <div
            className="bottom-launcher-header-strip"
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Click header to collapse launcher' : 'Click header to expand 12-instrument launcher'}
          >
            <div className="launcher-title-left">
              <button
                type="button"
                className="launcher-toggle-arrow-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                title={isExpanded ? 'Collapse instrument launcher' : 'Expand instrument launcher'}
                aria-label={isExpanded ? 'Collapse instrument launcher' : 'Expand instrument launcher'}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#F8FAFC"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`launcher-expand-chevron ${isExpanded ? 'open' : ''}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <span className="launcher-title-caption">NI ELVISmx Instrument Launcher</span>
              <div
                className={`launcher-connection-badge interactive ${daqActive ? 'active' : 'standby'}`}
                onClick={(e) => {
                  e.stopPropagation();
                  const nextActive = !daqActive;
                  if (nextActive) {
                    dispatch({ type: 'RUN_SIMULATION' });
                    dispatch({ type: 'UPDATE_DAQ', settings: { enabled: true } });
                    window.dispatchEvent(new CustomEvent('daq-power-change', { detail: { enabled: true } }));
                  } else {
                    dispatch({ type: 'SET_SIMULATION_STATUS', status: 'paused' });
                    dispatch({ type: 'UPDATE_DAQ', settings: { enabled: false } });
                    window.dispatchEvent(new CustomEvent('daq-power-change', { detail: { enabled: false } }));
                  }
                }}
                title={daqActive ? 'Circuit Power is ON — Click to pause' : 'Circuit Power is STANDBY (OFF) — Click to activate circuit & connect instruments'}
              >
                <span className={`live-dot ${daqActive ? 'pulsing' : 'dim'}`} />
                <span>{daqActive ? 'NI myDAQ Connected & Active' : 'NI myDAQ in Standby (OFF)'}</span>
              </div>
            </div>

            {/* Quick Window Management Presets */}
            <div className="launcher-actions-right" onClick={(e) => e.stopPropagation()}>
              <span className="window-count-badge">
                {openCount} {openCount === 1 ? 'window' : 'windows'} open
              </span>

              <button
                className="preset-action-btn"
                onClick={handleTileDual}
                title="Arrange Function Generator and Oscilloscope side-by-side"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="8" height="18" rx="1" />
                  <rect x="13" y="3" width="8" height="18" rx="1" />
                </svg>
                <span>Tile Dual</span>
              </button>

              <button
                className="preset-action-btn"
                onClick={handleCascade}
                title="Cascade open windows diagonally"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="12" height="12" rx="1" />
                  <rect x="8" y="8" width="12" height="12" rx="1" />
                </svg>
                <span>Cascade</span>
              </button>

              {openCount > 0 && (
                <button
                  className="preset-action-btn close-all"
                  onClick={handleCloseAll}
                  title="Close all floating instrument windows"
                >
                  <span>Close All</span>
                </button>
              )}
            </div>
          </div>

          {/* 12 Instrument Launcher Menu Buttons */}
          <div className="bottom-launcher-menu-items">
            {[
              {
                id: 'DMM' as InstrumentType,
                label: 'DMM',
                title: 'Digital Multimeter (DMM)',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="2" fill="#2563EB" stroke="#1D4ED8" strokeWidth="1.5" />
                    <rect x="6" y="6" width="12" height="6" fill="#F8FAFC" rx="1" />
                    <text x="12" y="11" fill="#0F172A" fontSize="5" fontWeight="bold" textAnchor="middle">0.00 V</text>
                    <circle cx="8" cy="16" r="1.5" fill="#EF4444" />
                    <circle cx="16" cy="16" r="1.5" fill="#000000" />
                  </svg>
                ),
              },
              {
                id: 'Scope' as InstrumentType,
                label: 'Scope',
                title: 'Oscilloscope',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="2" fill="#1E293B" stroke="#475569" strokeWidth="1.5" />
                    <path d="M5 12h2l2-4 3 8 2-6 2 2h3" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ),
              },
              {
                id: 'FGEN' as InstrumentType,
                label: 'FGEN',
                title: 'Function Generator',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="2" fill="#334155" stroke="#1E293B" strokeWidth="1.5" />
                    <path d="M5 12c2.5-5 5-5 7 0s4.5 5 7 0" stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                ),
              },
              {
                id: 'VPS' as InstrumentType,
                label: 'VPS',
                title: 'Variable Power Supply',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="2" fill="#E2E8F0" stroke="#94A3B8" strokeWidth="1.5" />
                    <text x="7" y="10" fill="#EF4444" fontSize="7" fontWeight="bold">+</text>
                    <text x="14" y="10" fill="#2563EB" fontSize="7" fontWeight="bold">−</text>
                    <line x1="5" y1="14" x2="19" y2="14" stroke="#64748B" strokeWidth="1" />
                  </svg>
                ),
              },
              {
                id: 'Bode' as InstrumentType,
                label: 'Bode',
                title: 'Bode Analyzer',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="2" fill="#0F172A" stroke="#334155" strokeWidth="1.5" />
                    <path d="M5 8h6c3 0 5 3 6 8" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
                    <path d="M5 16h6c3 0 5-3 6-8" stroke="#06B6D4" strokeWidth="1" strokeDasharray="1.5 1.5" />
                  </svg>
                ),
              },
              {
                id: 'DSA' as InstrumentType,
                label: 'DSA',
                title: 'Dynamic Signal Analyzer',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="2" fill="#1E1E24" stroke="#475569" strokeWidth="1.5" />
                    <line x1="6" y1="18" x2="6" y2="14" stroke="#EC4899" strokeWidth="1.5" />
                    <line x1="9" y1="18" x2="9" y2="7" stroke="#EC4899" strokeWidth="1.5" />
                    <line x1="12" y1="18" x2="12" y2="15" stroke="#EC4899" strokeWidth="1.5" />
                    <line x1="15" y1="18" x2="15" y2="11" stroke="#EC4899" strokeWidth="1.5" />
                    <line x1="18" y1="18" x2="18" y2="16" stroke="#EC4899" strokeWidth="1.5" />
                  </svg>
                ),
              },
              {
                id: 'ARB' as InstrumentType,
                label: 'ARB',
                title: 'Arbitrary Waveform Generator',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="2" fill="#334155" stroke="#1E293B" strokeWidth="1.5" />
                    <path d="M5 16l3-8 4 6 3-4 4 6" stroke="#A855F7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ),
              },
              {
                id: 'DigIn' as InstrumentType,
                label: 'DigIn',
                title: 'Digital Reader (Input)',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="2" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="1.5" />
                    <circle cx="7" cy="8" r="2" fill="#10B981" />
                    <circle cx="12" cy="8" r="2" fill="#94A3B8" />
                    <circle cx="17" cy="8" r="2" fill="#10B981" />
                    <path d="M7 14v4M12 14v4M17 14v4" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                ),
              },
              {
                id: 'DigOut' as InstrumentType,
                label: 'DigOut',
                title: 'Digital Writer (Output)',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="2" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="1.5" />
                    <rect x="6" y="7" width="3" height="6" rx="1" fill="#2563EB" />
                    <rect x="11" y="11" width="3" height="6" rx="1" fill="#64748B" />
                    <rect x="16" y="7" width="3" height="6" rx="1" fill="#2563EB" />
                  </svg>
                ),
              },
              {
                id: 'Imped' as InstrumentType,
                label: 'Imped',
                title: 'Impedance Analyzer',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1.5" />
                    <text x="12" y="15" fill="#B45309" fontSize="10" fontWeight="bold" fontFamily="serif" textAnchor="middle">Z</text>
                  </svg>
                ),
              },
              {
                id: 'TwoWire' as InstrumentType,
                label: '2-Wire',
                title: 'Two-Wire Current-Voltage Analyzer',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="2" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.5" />
                    <line x1="5" y1="18" x2="19" y2="18" stroke="#94A3B8" strokeWidth="1" />
                    <path d="M6 18c6 0 7-1 8-11" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                ),
              },
              {
                id: 'ThreeWire' as InstrumentType,
                label: '3-Wire',
                title: 'Three-Wire Current-Voltage Analyzer',
                icon: (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="18" height="18" rx="2" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.5" />
                    <path d="M6 17c4 0 5-2 6-6h7" stroke="#2563EB" strokeWidth="1.2" strokeLinecap="round" />
                    <path d="M6 17c4 0 5-4 6-10h7" stroke="#2563EB" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                ),
              },
            ].map((item) => {
              const isOpen = openWindows[item.id];
              const isFocused = focusedWindow === item.id;
              return (
                <button
                  key={item.id}
                  className={`menu-inst-btn ${isOpen ? 'active-open' : ''} ${isFocused ? 'focused-inst' : ''}`}
                  onClick={() => handleToggleInstrument(item.id)}
                  title={`${item.title} — ${isOpen ? 'Click to focus window' : 'Click to open window'}`}
                >
                  <div className="menu-btn-icon-box">{item.icon}</div>
                  <span className="menu-btn-label">{item.label}</span>
                  {isOpen && <span className="open-window-indicator" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
