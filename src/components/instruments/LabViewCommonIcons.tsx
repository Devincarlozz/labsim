import React from 'react';

/**
 * Authentic LabVIEW Powered Badge matching NI ELVISmx instrument headers.
 */
export function LabViewPoweredLogo() {
  return (
    <div className="elvis-labview-badge">
      <div className="elvis-badge-top-bar">
        <span className="elvis-badge-powered">POWERED BY</span>
      </div>
      <div className="elvis-badge-body">
        {/* LabVIEW running arrow on grid icon */}
        <div className="elvis-badge-icon-box">
          <svg width="22" height="18" viewBox="0 0 22 18">
            <rect width="22" height="18" fill="#000000" />
            {/* Oscilloscope green grid */}
            <line x1="0" y1="4.5" x2="22" y2="4.5" stroke="#22c55e" strokeWidth="0.5" strokeDasharray="1,1" opacity="0.7" />
            <line x1="0" y1="9" x2="22" y2="9" stroke="#22c55e" strokeWidth="0.5" strokeDasharray="1,1" opacity="0.7" />
            <line x1="0" y1="13.5" x2="22" y2="13.5" stroke="#22c55e" strokeWidth="0.5" strokeDasharray="1,1" opacity="0.7" />
            <line x1="5.5" y1="0" x2="5.5" y2="18" stroke="#22c55e" strokeWidth="0.5" strokeDasharray="1,1" opacity="0.7" />
            <line x1="11" y1="0" x2="11" y2="18" stroke="#22c55e" strokeWidth="0.5" strokeDasharray="1,1" opacity="0.7" />
            <line x1="16.5" y1="0" x2="16.5" y2="18" stroke="#22c55e" strokeWidth="0.5" strokeDasharray="1,1" opacity="0.7" />
            {/* LabVIEW Arrow */}
            <polygon points="4,3 17,9 4,15" fill="#facc15" stroke="#ca8a04" strokeWidth="0.7" />
            <path d="M4 9h4l3-5 3 10 3-5h3" fill="none" stroke="#3b82f6" strokeWidth="0.8" strokeLinecap="round" />
          </svg>
        </div>
        <div className="elvis-badge-text-group">
          <span className="elvis-badge-natinst">NATIONAL INSTRUMENTS</span>
          <span className="elvis-badge-labview">LabVIEW<span className="elvis-tm">™</span></span>
        </div>
      </div>
    </div>
  );
}

/**
 * Miniature NI ELVISmx Digital Instrument icon for the window titlebar.
 */
export function ElvisInstrumentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <rect x="0.5" y="1.5" width="15" height="13" rx="1.5" fill="#2d3748" stroke="#1a202c" strokeWidth="1" />
      {/* Upper LEDs */}
      <circle cx="3.5" cy="4.5" r="1.1" fill="#00E5FF" />
      <circle cx="6.5" cy="4.5" r="1.1" fill="#00E5FF" />
      <circle cx="9.5" cy="4.5" r="1.1" fill="#00E5FF" />
      <circle cx="12.5" cy="4.5" r="1.1" fill="#00E5FF" />
      {/* Lower switches / lines */}
      <line x1="2.5" y1="9" x2="4.5" y2="9" stroke="#E2E8F0" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="5.5" y1="11" x2="7.5" y2="11" stroke="#E2E8F0" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="8.5" y1="9" x2="10.5" y2="9" stroke="#E2E8F0" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="11.5" y1="11" x2="13.5" y2="11" stroke="#E2E8F0" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * 3D Spherical Blue Indicator LED matching NI ELVISmx Line States.
 */
export function BlueLedIndicator({
  active,
  inactive = false,
  size = 20,
}: {
  active: boolean;
  inactive?: boolean;
  size?: number;
}) {
  return (
    <div
      className={`elvis-blue-led ${active ? 'lit' : 'unlit'} ${inactive ? 'inactive' : ''}`}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      <div className="elvis-led-reflection" />
    </div>
  );
}

/**
 * Classic Purple Book with Yellow '?' Help Icon.
 */
export function HelpBookIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path
        d="M4 2.5h10.5a2 2 0 0 1 2 2V16a1 1 0 0 1-1 1H4.5a2 2 0 0 1-2-2V4a1.5 1.5 0 0 1 1.5-1.5z"
        fill="#7C3AED"
        stroke="#5B21B6"
        strokeWidth="1.2"
      />
      <path
        d="M5 16h11a1 1 0 0 0 1-1V5a1 1 0 0 0-1-1H5"
        stroke="#FEF08A"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <line x1="3" y1="15.5" x2="5.5" y2="15.5" stroke="#4C1D95" strokeWidth="1.5" />
      <text
        x="9.5"
        y="12"
        fill="#FACC15"
        fontSize="8.5"
        fontWeight="bold"
        fontFamily="sans-serif"
        textAnchor="middle"
      >
        ?
      </text>
    </svg>
  );
}

/**
 * Green right-arrow Run Icon.
 */
export function RunArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" fill="none">
      <path
        d="M4 3.5l11 5.5-11 5.5V3.5z"
        fill="#22C55E"
        stroke="#16A34A"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Red square Stop Icon.
 */
export function StopSquareIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect
        x="2.5"
        y="2.5"
        width="11"
        height="11"
        rx="1.5"
        fill="#EF4444"
        stroke="#DC2626"
        strokeWidth="1"
      />
    </svg>
  );
}

/**
 * Small cascade / duplicate window icon in Reader header.
 */
export function CascadeWindowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
      <rect x="1.5" y="4.5" width="9" height="9" rx="1" fill="#000" stroke="#71717A" strokeWidth="1" />
      <path d="M5.5 4.5V2.5a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-2" stroke="#A1A1AA" strokeWidth="1" />
    </svg>
  );
}
