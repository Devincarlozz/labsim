import React, { useState, useMemo, useRef } from 'react';
import { useStore } from '../store/CircuitStore';
import { ICType, PlacingComponent } from '../model/types';

interface ComponentItem {
  id: string;
  category: 'resistors' | 'capacitors' | 'diodes' | 'leds' | 'logic' | 'hardware';
  categoryLabel: string;
  name: string;
  label: string;
  desc: string;
  keywords: string[];
  placingType: PlacingComponent;
}

const ALL_COMPONENTS: ComponentItem[] = [
  // Resistors
  {
    id: 'comp-resistor',
    category: 'resistors',
    categoryLabel: 'Resistors',
    name: 'Resistor',
    label: 'Resistor (Through-Hole)',
    desc: 'Through-hole 1/4W axial resistor with color bands',
    keywords: ['resistor', 'res', 'ohm', 'resistance', 'passive', '1k', '10k', 'axial'],
    placingType: 'resistor',
  },
  // Capacitors
  {
    id: 'comp-capacitor',
    category: 'capacitors',
    categoryLabel: 'Capacitors',
    name: 'Capacitor',
    label: 'Capacitor (Ceramic Dipped)',
    desc: 'Radial ceramic dipped capacitor (100nF decoupling)',
    keywords: ['capacitor', 'cap', 'ceramic', 'dipped', '100nf', 'passive', 'filter', 'eia'],
    placingType: 'capacitor',
  },
  // LED (Light Emitting Diode)
  {
    id: 'comp-led',
    category: 'leds',
    categoryLabel: 'LEDs',
    name: 'LED',
    label: 'LED (5mm Diode)',
    desc: '5mm Through-Hole LED with configurable color, forward voltage & glow',
    keywords: ['led', 'light', 'diode', '5mm', 'indicator', 'optics', 'glow', 'red', 'green', 'blue', 'yellow', 'white', 'purple', 'orange'],
    placingType: 'led',
  },
  // Diodes
  {
    id: 'comp-diode-1n4001',
    category: 'diodes',
    categoryLabel: 'Diodes',
    name: '1N4001',
    label: '1N4001 Silicon Rectifier Diode',
    desc: '1A 50V general-purpose silicon rectifier diode (DO-41)',
    keywords: ['diode', '1n4001', 'in4001', 'in-4001', '1n-4001', 'in 4001', '1n 4001', 'in4001 diode', '1n4001 diode', 'diode 1n4001', 'rectifier', 'silicon', 'do-41', 'do41', '1a', '50v', 'bridge', 'pn junction', 'passive'],
    placingType: '1N4001',
  },
  // ICs (74HC Series)
  {
    id: 'comp-74hc08',
    category: 'logic',
    categoryLabel: 'ICs',
    name: '74HC08',
    label: '74HC08 Quad 2-Input AND',
    desc: 'Quad 2-input positive-AND gates (DIP-14)',
    keywords: ['74hc08', '7408', 'and', 'gate', 'quad and', 'logic', 'ic', 'chip', 'dip14', 'dip-14', '74 08', '74-08'],
    placingType: '74HC08',
  },
  {
    id: 'comp-74hc00',
    category: 'logic',
    categoryLabel: 'ICs',
    name: '74HC00',
    label: '74HC00 Quad 2-Input NAND',
    desc: 'Quad 2-input NAND gates (DIP-14)',
    keywords: ['74hc00', '7400', 'nand', 'gate', 'quad nand', 'logic', 'ic', 'chip', 'dip14', 'dip-14', '74 00', '74-00'],
    placingType: '74HC00',
  },
  {
    id: 'comp-74hc02',
    category: 'logic',
    categoryLabel: 'ICs',
    name: '74HC02',
    label: '74HC02 Quad 2-Input NOR',
    desc: 'Quad 2-input NOR gates (DIP-14)',
    keywords: ['74hc02', '7402', 'nor', 'gate', 'quad nor', 'logic', 'ic', 'chip', 'dip14', 'dip-14', '74 02', '74-02'],
    placingType: '74HC02',
  },
  {
    id: 'comp-74hc04',
    category: 'logic',
    categoryLabel: 'ICs',
    name: '74HC04',
    label: '74HC04 Hex Inverter',
    desc: 'Six independent inverting logic gates (DIP-14)',
    keywords: ['74hc04', '7404', 'not', 'inverter', 'hex inverter', 'gate', 'logic', 'ic', 'chip', 'dip14', 'dip-14', '74 04', '74-04'],
    placingType: '74HC04',
  },
  {
    id: 'comp-74hc32',
    category: 'logic',
    categoryLabel: 'ICs',
    name: '74HC32',
    label: '74HC32 Quad 2-Input OR',
    desc: 'Quad 2-input positive-OR gates (DIP-14)',
    keywords: ['74hc32', '7432', 'or', 'gate', 'quad or', 'logic', 'ic', 'chip', 'dip14', 'dip-14', '74 32', '74-32'],
    placingType: '74HC32',
  },
  {
    id: 'comp-74hc86',
    category: 'logic',
    categoryLabel: 'ICs',
    name: '74HC86',
    label: '74HC86 Quad 2-Input XOR',
    desc: 'Quad 2-input positive Exclusive-OR gates (DIP-14)',
    keywords: ['74hc86', '7486', 'xor', 'gate', 'quad xor', 'exclusive or', 'logic', 'ic', 'chip', 'dip14', 'dip-14', '74 86', '74-86'],
    placingType: '74HC86',
  },
  {
    id: 'comp-ne555',
    category: 'logic',
    categoryLabel: 'ICs',
    name: 'NE555',
    label: 'NE555 Precision Timer',
    desc: 'Precision timer / pulse generator IC (DIP-8)',
    keywords: ['ne555', '555', 'timer', 'oscillator', 'pulse', 'astable', 'monostable', 'ic', 'chip', 'dip8', 'dip-8', 'clock', '555 timer'],
    placingType: 'NE555',
  },
  {
    id: 'comp-741',
    category: 'logic',
    categoryLabel: 'ICs',
    name: 'LM741',
    label: 'LM741 / IC 741 Operational Amplifier',
    desc: 'General-purpose single operational amplifier (DIP-8)',
    keywords: ['741', 'ic 741', 'ic741', '741 ic', 'ic-741', '741-ic', 'ic 741 op amp', '741 opamp', 'lm741', 'ua741', 'opamp', 'op-amp', 'operational amplifier', 'analog', 'ic', 'chip', 'dip8', 'dip-8', 'inverting', 'non-inverting', 'comparator'],
    placingType: 'LM741',
  },
  // Hardware & DAQ
  {
    id: 'comp-mydaq',
    category: 'hardware',
    categoryLabel: 'Hardware & DAQ',
    name: 'NI myDAQ',
    label: 'NI myDAQ Terminal Strip',
    desc: 'Compact 20-terminal DAQ breakout strip',
    keywords: ['ni', 'mydaq', 'daq', 'hardware', 'terminal', 'strip', 'breakout', 'analog', 'digital'],
    placingType: null,
  },
];

interface ComponentPaletteProps {
  onToggle?: (open: boolean) => void;
}

export function ComponentPalette({ onToggle }: ComponentPaletteProps) {
  const { state, dispatch } = useStore();
  const { editor } = state;

  const [searchQuery, setSearchQuery] = useState('');
  // Common sections expanded by default so components are immediately discoverable
  const [resistorsOpen, setResistorsOpen] = useState(true);
  const [capacitorsOpen, setCapacitorsOpen] = useState(true);
  const [ledsOpen, setLedsOpen] = useState(true);
  const [diodesOpen, setDiodesOpen] = useState(true);
  const [logicOpen, setLogicOpen] = useState(true);
  const [hardwareOpen, setHardwareOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const isDaqVisible = state.instruments.daq?.visible !== false;

  // Filter components with smart token-based matching and alias recognition (e.g. "in4001 diode", "ic 741", "7400")
  const filteredComponents = useMemo(() => {
    const rawQ = searchQuery.trim().toLowerCase();
    if (!rawQ) return ALL_COMPONENTS;

    const tokens = rawQ.split(/\s+/).filter(Boolean);

    // Normalize string by stripping letters sandwiched between numbers (e.g. "74HC00" -> "7400")
    const normalizeIc = (s: string) =>
      s.toLowerCase().replace(/(\d+)[a-z]+(\d+)/g, '$1$2').replace(/[^a-z0-9]/g, '');

    return ALL_COMPONENTS.filter((item) => {
      const itemName = item.name.toLowerCase();
      const itemLabel = item.label.toLowerCase();
      const itemDesc = item.desc.toLowerCase();
      const itemCat = item.category.toLowerCase();
      const itemCatLabel = item.categoryLabel.toLowerCase();
      const itemKeywords = item.keywords.map((k) => k.toLowerCase());
      const normName = normalizeIc(item.name);
      const normLabel = normalizeIc(item.label);
      const itemDigits = item.name.replace(/\D/g, '');

      return tokens.every((tok) => {
        // Direct match
        if (
          itemName.includes(tok) ||
          itemLabel.includes(tok) ||
          itemDesc.includes(tok) ||
          itemCat.includes(tok) ||
          itemCatLabel.includes(tok) ||
          itemKeywords.some((k) => k.includes(tok))
        ) {
          return true;
        }

        // 1N4001 alias (in4001 <-> 1n4001)
        if (
          (tok === 'in4001' || tok === 'in-4001' || tok === '1n4001' || tok === '1n-4001' || tok === 'in4001diode') &&
          (item.id.includes('1n4001') || item.placingType === '1N4001')
        ) {
          return true;
        }

        // 741 / IC 741 alias
        if (
          (tok === '741' || tok === 'ic741' || tok === 'lm741' || tok === 'opamp' || tok === 'op-amp') &&
          (item.id.includes('741') || item.placingType === 'LM741')
        ) {
          return true;
        }

        // Generic 'ic' token matches logic category
        if (tok === 'ic' || tok === 'chip') {
          if (item.category === 'logic') return true;
        }

        // Generic 'diode' token matches diodes and LEDs
        if (tok === 'diode') {
          if (item.category === 'diodes' || item.category === 'leds') return true;
        }

        // Pure digits match (e.g. "08", "7408", "7400", "741", "555")
        const digitsOnly = tok.replace(/\D/g, '');
        if (digitsOnly.length >= 2) {
          if (itemDigits.includes(digitsOnly)) return true;
          const labelDigits = item.label.replace(/\D/g, '');
          if (labelDigits.includes(digitsOnly)) return true;
        }

        // Normalized IC match
        const normTok = normalizeIc(tok);
        if (normTok.length >= 2 && (normName.includes(normTok) || normLabel.includes(normTok))) {
          return true;
        }

        return false;
      });
    });
  }, [searchQuery]);

  const hasSearch = searchQuery.trim().length > 0;

  // Group filtered components by category
  const resistorItems = filteredComponents.filter((c) => c.category === 'resistors');
  const capacitorItems = filteredComponents.filter((c) => c.category === 'capacitors');
  const ledItems = filteredComponents.filter((c) => c.category === 'leds');
  const diodeItems = filteredComponents.filter((c) => c.category === 'diodes');
  const logicItems = filteredComponents.filter((c) => c.category === 'logic');
  const hardwareItems = filteredComponents.filter((c) => c.category === 'hardware');

  /**
   * One-per-selection component placing:
   * Clicking an unselected item arms placing for ONE component.
   * Clicking the currently armed item cancels placement.
   * Once placed on canvas, placing mode resets to 'select' and requires clicking again.
   */
  const handleSelectPlacing = (comp: PlacingComponent) => {
    if (editor.placingComponent === comp) {
      dispatch({ type: 'SET_MODE', mode: 'select' });
    } else {
      dispatch({ type: 'SET_PLACING', component: comp });
    }
  };

  const handleSearchButtonClick = () => {
    searchInputRef.current?.focus();
  };

  return (
    <aside className="left-sidebar unified-palette">
      {/* Sidebar Header — Unified Components Section */}
      <div className="palette-header">
        <div className="palette-title-group">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
          <h2 className="palette-main-title">Components</h2>
          <span className="palette-total-badge">
            {hasSearch ? `${filteredComponents.length} found` : `${ALL_COMPONENTS.length}`}
          </span>
        </div>

        {onToggle && (
          <button
            className="sidebar-collapse-btn"
            onClick={() => onToggle(false)}
            title="Hide Components Sidebar ([)"
            aria-label="Hide Components Sidebar"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
      </div>

      {/* Component Search Bar with Search Button */}
      <div className="palette-search-container">
        <div className="palette-search-input-wrapper">
          <svg className="palette-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={searchInputRef}
            className="palette-search-input"
            type="text"
            placeholder="Search components..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search components"
          />
          {searchQuery && (
            <button
              className="palette-search-clear-btn"
              onClick={() => setSearchQuery('')}
              title="Clear search"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <button
          className="palette-search-btn"
          onClick={handleSearchButtonClick}
          title="Search a specific component"
          aria-label="Search"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span>Search</span>
        </button>
      </div>

      {/* Armed Placement Banner (Helps user understand one-per-selection) */}
      {editor.placingComponent && (
        <div className="placement-armed-banner">
          <span className="armed-indicator-dot" />
          <span className="armed-text">
            Armed: <strong>{String(editor.placingComponent).toUpperCase()}</strong>
          </span>
          <button
            className="armed-cancel-btn"
            onClick={() => dispatch({ type: 'SET_MODE', mode: 'select' })}
            title="Cancel placement (Esc)"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Unified Classified Components Scrollable Body */}
      <div className="sidebar-scrollable">
        {filteredComponents.length === 0 ? (
          <div className="palette-empty-state">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <p className="empty-text">No components match "{searchQuery}"</p>
            <button className="empty-clear-btn" onClick={() => setSearchQuery('')}>
              Clear Search
            </button>
          </div>
        ) : (
          <>
            {/* Category 1: Resistors */}
            {resistorItems.length > 0 && (
              <div className="sidebar-section">
                <div
                  className="section-header"
                  onClick={() => setResistorsOpen(!resistorsOpen)}
                >
                  <div className="section-title-wrap">
                    <span className="section-title">Resistors</span>
                    <span className="section-count-badge">Passive</span>
                  </div>
                  <svg
                    className={`collapse-chevron ${resistorsOpen || (hasSearch && resistorItems.length > 0) ? 'open' : ''}`}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#64748B"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </div>

                {(resistorsOpen || (hasSearch && resistorItems.length > 0)) && (
                  <div className="breadboard-parts-grid">
                    {resistorItems.map((item) => {
                      const isArmed = editor.placingComponent === item.placingType;
                      return (
                        <div
                          key={item.id}
                          className={`part-card ${isArmed ? 'active' : ''}`}
                          onClick={() => handleSelectPlacing(item.placingType)}
                          title={`${item.label} — Click once to place on breadboard`}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="part-card-preview">
                            <svg width="60" height="24" viewBox="0 0 60 24">
                              <line x1="2" y1="12" x2="16" y2="12" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
                              <rect x="16" y="6" width="28" height="12" rx="3" fill="#D4A373" stroke="#B08154" strokeWidth="1" />
                              <rect x="21" y="6" width="2.5" height="12" fill="#8B4513" />
                              <rect x="26" y="6" width="2.5" height="12" fill="#000000" />
                              <rect x="31" y="6" width="2.5" height="12" fill="#FF0000" />
                              <rect x="38" y="6" width="2.5" height="12" fill="#C8A600" />
                              <line x1="44" y1="12" x2="58" y2="12" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          </div>
                          <span className="part-card-label">{item.name}</span>
                          <span className="part-card-sublabel">Through-Hole</span>
                          {isArmed && <span className="part-card-armed-tag">Click board</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Category 2: Capacitors */}
            {capacitorItems.length > 0 && (
              <div className="sidebar-section">
                <div
                  className="section-header"
                  onClick={() => setCapacitorsOpen(!capacitorsOpen)}
                >
                  <div className="section-title-wrap">
                    <span className="section-title">Capacitors</span>
                    <span className="section-count-badge cap">Passive</span>
                  </div>
                  <svg
                    className={`collapse-chevron ${capacitorsOpen || (hasSearch && capacitorItems.length > 0) ? 'open' : ''}`}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#64748B"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </div>

                {(capacitorsOpen || (hasSearch && capacitorItems.length > 0)) && (
                  <div className="breadboard-parts-grid">
                    {capacitorItems.map((item) => {
                      const isArmed = editor.placingComponent === item.placingType;
                      return (
                        <div
                          key={item.id}
                          className={`part-card ${isArmed ? 'active' : ''}`}
                          onClick={() => handleSelectPlacing(item.placingType)}
                          title={`${item.label} — Click once to place on breadboard`}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="part-card-preview">
                            <svg width="40" height="34" viewBox="0 0 40 34">
                              <line x1="14" y1="24" x2="14" y2="33" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
                              <line x1="26" y1="24" x2="26" y2="33" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
                              <path
                                d="M 14 25 Q 20 22 26 25 C 29 25 31 16 31 13 C 32 6 28 2 20 2 C 12 2 8 6 9 13 C 9 16 11 25 14 25 Z"
                                fill="url(#capGradPalUnified)"
                                stroke="#0E3A70"
                                strokeWidth="0.8"
                              />
                              <path
                                d="M 16 4 C 13 5 11 8 11 13"
                                stroke="rgba(255, 255, 255, 0.85)"
                                strokeWidth="1.8"
                                strokeLinecap="round"
                                fill="none"
                              />
                              <circle cx="17" cy="4" r="1.2" fill="rgba(255, 255, 255, 0.8)" />
                              <defs>
                                <radialGradient id="capGradPalUnified" cx="40%" cy="30%" r="60%">
                                  <stop offset="0%" stopColor="#2579D7" />
                                  <stop offset="35%" stopColor="#1D63B2" />
                                  <stop offset="80%" stopColor="#154F94" />
                                  <stop offset="100%" stopColor="#0E396D" />
                                </radialGradient>
                              </defs>
                            </svg>
                          </div>
                          <span className="part-card-label">{item.name}</span>
                          <span className="part-card-sublabel">Ceramic Dipped</span>
                          {isArmed && <span className="part-card-armed-tag">Click board</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Category: LEDs (5mm Indicator Diodes) */}
            {ledItems.length > 0 && (
              <div className="sidebar-section">
                <div
                  className="section-header"
                  onClick={() => setLedsOpen(!ledsOpen)}
                >
                  <div className="section-title-wrap">
                    <span className="section-title">LEDs</span>
                    <span className="section-count-badge led">Diodes</span>
                  </div>
                  <svg
                    className={`collapse-chevron ${ledsOpen || (hasSearch && ledItems.length > 0) ? 'open' : ''}`}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#64748B"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </div>

                {(ledsOpen || (hasSearch && ledItems.length > 0)) && (
                  <div className="breadboard-parts-grid">
                    {ledItems.map((item) => {
                      const isArmed = editor.placingComponent === item.placingType;

                      return (
                        <div
                          key={item.id}
                          className={`part-card ${isArmed ? 'active' : ''}`}
                          onClick={() => handleSelectPlacing(item.placingType)}
                          title={`${item.label} — Click once to place on breadboard, configure color in Properties`}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="part-card-preview">
                            <svg width="40" height="36" viewBox="0 0 40 36">
                              <defs>
                                <radialGradient id="palLedGrad-unified" cx="40%" cy="30%" r="70%">
                                  <stop offset="0%" stopColor="#FCA5A5" />
                                  <stop offset="45%" stopColor="#EF4444" />
                                  <stop offset="100%" stopColor="#B91C1C" />
                                </radialGradient>
                                <radialGradient id="palLedGlow-unified" cx="50%" cy="50%" r="50%">
                                  <stop offset="0%" stopColor="rgba(239, 68, 68, 0.4)" />
                                  <stop offset="100%" stopColor="rgba(239, 68, 68, 0)" />
                                </radialGradient>
                              </defs>
                              {/* Ambient halo glow */}
                              <circle cx="20" cy="14" r="14" fill="url(#palLedGlow-unified)" />
                              {/* Metallic Leads entering holes */}
                              <line x1="16" y1="26" x2="16" y2="35" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
                              <line x1="24" y1="26" x2="24" y2="35" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
                              {/* Base Flange with cathode flat rim */}
                              <rect x="12" y="23" width="16" height="3" rx="1" fill="#991B1B" />
                              {/* 5mm Rounded Dome */}
                              <path
                                d="M 13 23 L 13 14 C 13 8 16 3 20 3 C 24 3 27 8 27 14 L 27 23 Z"
                                fill="url(#palLedGrad-unified)"
                                stroke="#7F1D1D"
                                strokeWidth="0.8"
                              />
                              {/* Specular gloss glint */}
                              <path
                                d="M 16 6 C 15 9 15 14 15 18"
                                stroke="rgba(255, 255, 255, 0.85)"
                                strokeWidth="1.5"
                                strokeLinecap="round"
                                fill="none"
                              />
                              <circle cx="17.5" cy="6.5" r="1.2" fill="rgba(255, 255, 255, 0.8)" />
                            </svg>
                          </div>
                          <span className="part-card-label">{item.name}</span>
                          <span className="part-card-sublabel">5mm Multi-Color</span>
                          {isArmed && <span className="part-card-armed-tag">Click board</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Category: Diodes (1N4001 etc.) */}
            {diodeItems.length > 0 && (
              <div className="sidebar-section">
                <div
                  className="section-header"
                  onClick={() => setDiodesOpen(!diodesOpen)}
                >
                  <div className="section-title-wrap">
                    <span className="section-title">Diodes</span>
                    <span className="section-count-badge">Rectifier</span>
                  </div>
                  <svg
                    className={`collapse-chevron ${diodesOpen || (hasSearch && diodeItems.length > 0) ? 'open' : ''}`}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#64748B"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </div>

                {(diodesOpen || (hasSearch && diodeItems.length > 0)) && (
                  <div className="breadboard-parts-grid">
                    {diodeItems.map((item) => {
                      const isArmed = editor.placingComponent === item.placingType;
                      return (
                        <div
                          key={item.id}
                          className={`part-card ${isArmed ? 'active' : ''}`}
                          onClick={() => handleSelectPlacing(item.placingType)}
                          title={`${item.label} — Click once to place on breadboard`}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="part-card-preview">
                            <svg width="60" height="24" viewBox="0 0 60 24">
                              {/* Anode lead */}
                              <line x1="2" y1="12" x2="16" y2="12" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
                              {/* Diode body */}
                              <rect x="16" y="5" width="28" height="14" rx="3" fill="#1E293B" stroke="#0F172A" strokeWidth="0.8" />
                              {/* Cathode band */}
                              <rect x="38" y="5" width="4" height="14" rx="0.5" fill="#94A3B8" />
                              {/* Cathode lead */}
                              <line x1="44" y1="12" x2="58" y2="12" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
                            </svg>
                          </div>
                          <span className="part-card-label">{item.name}</span>
                          <span className="part-card-sublabel">Rectifier DO-41</span>
                          {isArmed && <span className="part-card-armed-tag">Click board</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Category 3: Logic Gates (74HC Series) — Classified in Single Section */}
            {logicItems.length > 0 && (
              <div className="sidebar-section">
                <div
                  className="section-header"
                  onClick={() => setLogicOpen(!logicOpen)}
                >
                  <div className="section-title-wrap">
                    <span className="section-title">ICs</span>
                    <span className="section-count-badge logic">DIP-14 & DIP-8</span>
                  </div>
                  <svg
                    className={`collapse-chevron ${logicOpen || (hasSearch && logicItems.length > 0) ? 'open' : ''}`}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#64748B"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </div>

                {(logicOpen || (hasSearch && logicItems.length > 0)) && (
                  <div className="ic-cards-list">
                    {logicItems.map((item) => {
                      const isArmed = editor.placingComponent === item.placingType;
                      const icType = item.placingType as ICType;
                      return (
                        <div
                          key={item.id}
                          className={`ic-card ${isArmed ? 'active' : ''}`}
                          onClick={() => handleSelectPlacing(icType)}
                          title={`${item.label} — Click once to place on breadboard`}
                          role="button"
                          tabIndex={0}
                        >
                          <div className="ic-chip-preview">
                            <div className="ic-chip-body">
                              <div className="ic-chip-notch" />
                              <span className="ic-chip-text">{item.name}</span>
                            </div>
                          </div>
                          <div className="ic-card-info">
                            <span className="ic-card-part">{item.name === 'LM741' ? 'LM741 (IC 741)' : item.name}</span>
                            <span className="ic-card-desc">
                              {item.name === '74HC08' ? 'Quad AND' :
                               item.name === '74HC00' ? 'Quad NAND' :
                               item.name === '74HC02' ? 'Quad NOR' :
                               item.name === '74HC04' ? 'Hex Invert' :
                               item.name === '74HC32' ? 'Quad OR' :
                               item.name === '74HC86' ? 'Quad XOR' :
                               item.name === 'NE555' ? 'Timer (DIP-8)' :
                               item.name === 'LM741' ? 'Op-Amp (DIP-8)' : 'Logic IC'}
                            </span>
                          </div>
                          {isArmed && <span className="ic-card-armed-tag">Click board</span>}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Category 4: Hardware & DAQ */}
            {hardwareItems.length > 0 && (
              <div className="sidebar-section">
                <div
                  className="section-header"
                  onClick={() => setHardwareOpen(!hardwareOpen)}
                >
                  <div className="section-title-wrap">
                    <span className="section-title">Hardware & DAQ</span>
                  </div>
                  <svg
                    className={`collapse-chevron ${hardwareOpen || (hasSearch && hardwareItems.length > 0) ? 'open' : ''}`}
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#64748B"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                </div>

                {(hardwareOpen || (hasSearch && hardwareItems.length > 0)) && (
                  <div className="breadboard-parts-grid">
                    <div
                      className={`part-card daq-part-card ${isDaqVisible ? 'active daq-visible' : 'daq-hidden'}`}
                      onClick={() => dispatch({ type: 'TOGGLE_DAQ_VISIBILITY' })}
                      title={isDaqVisible ? 'Click to hide NI myDAQ on workspace' : 'Click to show NI myDAQ on workspace'}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="part-card-preview">
                        <svg width="46" height="30" viewBox="0 0 46 30">
                          <rect x="2" y="2" width="42" height="26" rx="3.5" fill="#0A101D" stroke={isDaqVisible ? "#38BDF8" : "#334155"} strokeWidth="1.2" />
                          <rect x="4.5" y="4.5" width="16" height="2" rx="0.5" fill="#38BDF8" />
                          <rect x="25.5" y="4.5" width="16" height="2" rx="0.5" fill="#818CF8" />
                          <circle cx="6" cy="11" r="1.4" fill="#EF4444" />
                          <circle cx="10" cy="11" r="1.4" fill="#38BDF8" />
                          <circle cx="14" cy="11" r="1.4" fill="#FACC15" />
                          <circle cx="18" cy="11" r="1.4" fill="#10B981" />
                          <circle cx="27" cy="11" r="1.4" fill="#F1F5F9" />
                          <circle cx="31" cy="11" r="1.4" fill="#F1F5F9" />
                          <circle cx="35" cy="11" r="1.4" fill="#38BDF8" />
                          <circle cx="39" cy="11" r="1.4" fill="#EF4444" />
                          <rect x="4.8" y="14.5" width="2.4" height="2.4" rx="0.4" fill="#1E293B" />
                          <rect x="8.8" y="14.5" width="2.4" height="2.4" rx="0.4" fill="#1E293B" />
                          <rect x="12.8" y="14.5" width="2.4" height="2.4" rx="0.4" fill="#1E293B" />
                          <rect x="16.8" y="14.5" width="2.4" height="2.4" rx="0.4" fill="#1E293B" />
                          <rect x="25.8" y="14.5" width="2.4" height="2.4" rx="0.4" fill="#1E293B" />
                          <rect x="29.8" y="14.5" width="2.4" height="2.4" rx="0.4" fill="#1E293B" />
                          <rect x="33.8" y="14.5" width="2.4" height="2.4" rx="0.4" fill="#1E293B" />
                          <rect x="37.8" y="14.5" width="2.4" height="2.4" rx="0.4" fill="#1E293B" />
                          <rect x="12" y="20.5" width="22" height="5" rx="2.5" fill={isDaqVisible ? "#052E16" : "#1E293B"} stroke={isDaqVisible ? "#22C55E" : "#475569"} strokeWidth="0.6" />
                          <circle cx="15.5" cy="23" r="1.2" fill={isDaqVisible ? "#22C55E" : "#64748B"} />
                          <text x="24.5" y="24.5" textAnchor="middle" fontSize="3.8" fontWeight="bold" fill={isDaqVisible ? "#4ADE80" : "#94A3B8"} fontFamily="sans-serif">
                            {isDaqVisible ? 'DAQ ON' : 'DAQ OFF'}
                          </text>
                        </svg>
                      </div>
                      <span className="part-card-label">NI myDAQ</span>
                      <span className={`daq-badge-status ${isDaqVisible ? 'is-visible' : 'is-hidden'}`}>
                        {isDaqVisible ? '● Shown' : '○ Hidden'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
