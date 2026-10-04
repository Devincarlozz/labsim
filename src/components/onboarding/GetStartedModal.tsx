import React, { useState, useEffect } from 'react';

interface GetStartedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface SlideData {
  id: string;
  step: string;
  title: string;
  subtitle: string;
  description: string;
  bulletPoints: string[];
  shortcuts: { key: string; label: string }[];
  visualType: 'add_components' | 'wiring' | 'moving' | 'power_daq' | 'deleting';
}

const SLIDES: SlideData[] = [
  {
    id: 'add-components',
    step: 'Step 1 of 5',
    title: 'Adding Components',
    subtitle: 'Populate your solderless breadboard with logic ICs & passive parts',
    description: 'CircuitLab includes an extensive library of DIP-14 TTL/CMOS logic gates, 555 timers, resistors, capacitors, and LEDs.',
    bulletPoints: [
      'Open the Components Palette on the left sidebar (shortcut [).',
      'Click on any component (e.g. 74HC08 AND gate, Resistor, LED) to pick it up.',
      'Hover over the breadboard: components automatically snap to holes.',
      'DIP ICs seamlessly straddle the central trough between Row E and Row F.',
    ],
    shortcuts: [
      { key: '[', label: 'Toggle Palette' },
      { key: 'R', label: 'Rotate Component' },
    ],
    visualType: 'add_components',
  },
  {
    id: 'wiring',
    step: 'Step 2 of 5',
    title: 'Wiring Connections',
    subtitle: 'Point-to-point Manhattan routing with instant selection',
    description: 'Create electrical nets between breadboard holes, IC pins, and myDAQ instruments with clean orthogonal wire routing.',
    bulletPoints: [
      'Press W or select the Wire tool in the top toolbar to enter wiring mode.',
      'Click the starting contact hole or pin, then click the destination contact.',
      'Manhattan routing automatically arranges the wire with color coding.',
      'In Select Mode (V), simply touch or click anywhere along any wire to select it.',
      'Press Esc anytime to cancel an in-progress wire.',
    ],
    shortcuts: [
      { key: 'W', label: 'Wire Tool' },
      { key: 'V', label: 'Select Tool' },
      { key: 'Esc', label: 'Cancel Wire' },
    ],
    visualType: 'wiring',
  },
  {
    id: 'moving',
    step: 'Step 3 of 5',
    title: 'Moving & Panning the Bench',
    subtitle: 'Effortless breadboard navigation and component repositioning',
    description: 'Move freely around your circuit bench without losing your workspace position or disrupting active wiring.',
    bulletPoints: [
      'In Select Mode (V) or Move Mode (M), drag any placed component to reposition it.',
      'Click and drag on any blank canvas area to pan and slide the breadboard.',
      'Right-click + Drag or Middle-click anywhere also pans the workspace.',
      'Use the Arrow keys (Up, Down, Left, Right) to nudge selected components by 1 hole.',
      'Scroll mouse wheel to smoothly zoom in and out.',
    ],
    shortcuts: [
      { key: 'M', label: 'Move Tool' },
      { key: 'Arrow Keys', label: 'Nudge 1 Hole' },
      { key: 'Right Click', label: 'Pan Canvas' },
    ],
    visualType: 'moving',
  },
  {
    id: 'power-daq',
    step: 'Step 4 of 5',
    title: 'Powering with NI myDAQ',
    subtitle: 'Activate live voltage rails & inspect real-time signals',
    description: 'The simulated NI myDAQ provides dual DC power supplies (+15V, -15V, +5V), 8 Digital I/O lines, and integrated oscilloscope inputs.',
    bulletPoints: [
      'Click the green [ON / OFF] toggle switch on the top DAQ module, or press Spacebar.',
      'Connect +5V (Pin 20) and DGND (Pin 19) to the breadboard power rails.',
      'Power your ICs: wire Pin 14 (VCC) to +5V and Pin 7 (GND) to ground.',
      'Press O or click the Scope button in the bottom instrument dock to observe live waveforms.',
      'Digital IO lines (DIO0–DIO7) can be toggled in real time to feed logic inputs.',
    ],
    shortcuts: [
      { key: 'Space', label: 'Toggle Power' },
      { key: 'O', label: 'Oscilloscope' },
    ],
    visualType: 'power_daq',
  },
  {
    id: 'deleting',
    step: 'Step 5 of 5',
    title: 'Deleting Components & Wires',
    subtitle: 'Quickly remove unwanted parts or reroute connections',
    description: 'Clean up or modify your circuit with keyboard shortcuts or the on-screen properties panel.',
    bulletPoints: [
      'Click on any component or touch anywhere on a wire to select it.',
      'Selected items display an electric blue glow and highlight ring.',
      'Press the Delete or Backspace key on your keyboard to immediately delete.',
      'You can also click the Delete button in the right Properties Sidebar (]).',
      'Accidentally deleted? Press Ctrl+Z (or Cmd+Z) to instantly Undo!',
    ],
    shortcuts: [
      { key: 'Delete', label: 'Remove Selected' },
      { key: 'Backspace', label: 'Remove Selected' },
      { key: 'Ctrl + Z', label: 'Undo' },
    ],
    visualType: 'deleting',
  },
];

export function GetStartedModal({ isOpen, onClose }: GetStartedModalProps) {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        setCurrentSlideIndex((prev) => Math.min(SLIDES.length - 1, prev + 1));
      } else if (e.key === 'ArrowLeft') {
        setCurrentSlideIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const currentSlide = SLIDES[currentSlideIndex];
  const isFirstSlide = currentSlideIndex === 0;
  const isLastSlide = currentSlideIndex === SLIDES.length - 1;

  const renderVisual = (type: SlideData['visualType']) => {
    switch (type) {
      case 'add_components':
        return (
          <div className="getstarted-visual-box visual-add">
            <div className="vis-circuit-chip">
              <div className="vis-chip-body">
                <span className="vis-chip-notch" />
                <span className="vis-chip-label">74HC08</span>
                <span className="vis-chip-sub">QUAD 2-IN AND</span>
              </div>
              <div className="vis-chip-pins left">
                <span /><span /><span /><span /><span /><span /><span />
              </div>
              <div className="vis-chip-pins right">
                <span /><span /><span /><span /><span /><span /><span />
              </div>
            </div>
            <div className="vis-breadboard-ghost">
              <div className="vis-bb-row"><span /><span /><span /><span /><span /><span /></div>
              <div className="vis-bb-row"><span /><span /><span /><span /><span /><span /></div>
              <div className="vis-snap-arrow">⬇ SNAP TO HOLES</div>
            </div>
          </div>
        );

      case 'wiring':
        return (
          <div className="getstarted-visual-box visual-wire">
            <svg className="vis-wire-svg" viewBox="0 0 280 140">
              {/* Start hole */}
              <circle cx="40" cy="90" r="7" fill="#1E293B" stroke="#38BDF8" strokeWidth="2.5" />
              <circle cx="40" cy="90" r="3" fill="#38BDF8" />
              <text x="40" y="115" fill="#94A3B8" fontSize="10" textAnchor="middle" fontFamily="monospace">Pin 1</text>

              {/* Wire Path */}
              <path d="M 40 90 L 140 90 L 140 40 L 240 40" fill="none" stroke="#38BDF8" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M 40 90 L 140 90 L 140 40 L 240 40" fill="none" stroke="rgba(56, 189, 248, 0.4)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />

              {/* End hole */}
              <circle cx="240" cy="40" r="7" fill="#1E293B" stroke="#38BDF8" strokeWidth="2.5" />
              <circle cx="240" cy="40" r="3" fill="#38BDF8" />
              <text x="240" y="24" fill="#94A3B8" fontSize="10" textAnchor="middle" fontFamily="monospace">Pin 14 (VCC)</text>

              {/* Touch anywhere badge */}
              <rect x="95" y="58" width="90" height="22" rx="6" fill="#0F172A" stroke="#38BDF8" strokeWidth="1" />
              <text x="140" y="73" fill="#38BDF8" fontSize="9.5" fontWeight="bold" textAnchor="middle">✓ Touch to Select</text>
            </svg>
          </div>
        );

      case 'moving':
        return (
          <div className="getstarted-visual-box visual-move">
            <div className="vis-pan-canvas-demo">
              <div className="vis-compass-rose">
                <span className="compass-dir n">▲ Nudge</span>
                <div className="compass-mid">
                  <span className="compass-dir w">◄</span>
                  <div className="compass-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2">
                      <path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" />
                    </svg>
                  </div>
                  <span className="compass-dir e">►</span>
                </div>
                <span className="compass-dir s">▼ Nudge</span>
              </div>
              <div className="vis-pan-tag">Drag empty canvas or Right-Click to pan</div>
            </div>
          </div>
        );

      case 'power_daq':
        return (
          <div className="getstarted-visual-box visual-daq">
            <div className="vis-daq-switch-card">
              <div className="vis-switch-row">
                <span className="vis-daq-label">myDAQ POWER</span>
                <div className="vis-pill-switch active">
                  <span className="vis-knob">ON</span>
                </div>
              </div>
              <div className="vis-scope-mini">
                <div className="vis-sine-wave" />
                <span className="vis-voltage-tag">+5.00 V ACTIVE</span>
              </div>
            </div>
          </div>
        );

      case 'deleting':
        return (
          <div className="getstarted-visual-box visual-delete">
            <div className="vis-delete-card">
              <div className="vis-selected-item">
                <span className="vis-item-icon">🗑️</span>
                <div className="vis-item-text">
                  <span className="item-name">Selected Component / Wire</span>
                  <span className="item-status">Electric Blue Highlighted</span>
                </div>
              </div>
              <div className="vis-delete-action">
                <span className="del-btn-badge">Press DELETE</span>
                <span className="or-text">or Backspace</span>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="getstarted-modal-overlay" onClick={onClose}>
      <div className="getstarted-modal-dialog" onClick={(e) => e.stopPropagation()}>
        {/* Top Header */}
        <div className="getstarted-header">
          <div className="header-meta-left">
            <div className="header-icon-box">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <div className="header-badge-row">
                <span className="guide-pill">Interactive Quick-Start Guide</span>
                <span className="slide-step-pill">{currentSlide.step}</span>
              </div>
              <h2 className="guide-title">{currentSlide.title}</h2>
            </div>
          </div>

          <button
            type="button"
            className="guide-close-btn"
            onClick={onClose}
            title="Close Guide (Esc)"
            aria-label="Close Guide"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Slide Body: Split Layout with Interactive Visual + Explanatory Text */}
        <div className="getstarted-body-split">
          {/* Left: Graphic Illustration Box */}
          <div className="getstarted-visual-col">
            {renderVisual(currentSlide.visualType)}

            {/* Quick Keyboard Shortcuts Capsule */}
            <div className="shortcuts-capsule">
              <span className="shortcuts-title">KEYBOARD SHORTCUTS</span>
              <div className="shortcuts-row">
                {currentSlide.shortcuts.map((sc, i) => (
                  <div key={i} className="sc-item">
                    <kbd className="sc-key">{sc.key}</kbd>
                    <span className="sc-label">{sc.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Instructions & Steps */}
          <div className="getstarted-text-col">
            <h3 className="slide-subtitle">{currentSlide.subtitle}</h3>
            <p className="slide-desc">{currentSlide.description}</p>

            <div className="slide-bullets-card">
              <span className="bullets-heading">HOW TO USE:</span>
              <ul className="bullets-list">
                {currentSlide.bulletPoints.map((bp, i) => (
                  <li key={i} className="bullet-item">
                    <span className="bullet-bullet">✓</span>
                    <span className="bullet-text">{bp}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Navigation & Controls */}
        <div className="getstarted-footer">
          {/* Step Dots Indicators */}
          <div className="slide-dots-container">
            {SLIDES.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                className={`slide-dot ${idx === currentSlideIndex ? 'active' : ''}`}
                onClick={() => setCurrentSlideIndex(idx)}
                title={`Go to ${s.title}`}
                aria-label={`Slide ${idx + 1}`}
              />
            ))}
          </div>

          {/* Previous / Next Controls */}
          <div className="slide-nav-buttons">
            <button
              type="button"
              className="btn-slide-nav secondary"
              onClick={() => setCurrentSlideIndex((prev) => Math.max(0, prev - 1))}
              disabled={isFirstSlide}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              <span>Back</span>
            </button>

            {!isLastSlide ? (
              <button
                type="button"
                className="btn-slide-nav primary"
                onClick={() => setCurrentSlideIndex((prev) => Math.min(SLIDES.length - 1, prev + 1))}
              >
                <span>Next Slide</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                className="btn-slide-nav success"
                onClick={onClose}
              >
                <span>Enter CircuitLab Workspace</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
