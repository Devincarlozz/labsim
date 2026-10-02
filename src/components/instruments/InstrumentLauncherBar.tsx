import React from 'react';

export type InstrumentType =
  | 'Scope'
  | 'FGEN'
  | 'DMM'
  | 'VPS'
  | 'Bode'
  | 'DSA'
  | 'ARB'
  | 'DigIn'
  | 'DigOut'
  | 'Imped'
  | 'TwoWire'
  | 'ThreeWire'
  | 'SimDebug';

interface LauncherBarProps {
  activeInstruments: Record<InstrumentType, boolean>;
  onToggleInstrument: (inst: InstrumentType) => void;
}

export function InstrumentLauncherBar({
  activeInstruments,
  onToggleInstrument,
}: LauncherBarProps) {
  const instruments: { id: InstrumentType; label: string; icon: React.ReactNode }[] = [
    {
      id: 'DMM',
      label: 'DMM',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" fill="#3B82F6" stroke="#1D4ED8" strokeWidth="1.5" />
          <rect x="6" y="6" width="12" height="6" fill="#F8FAFC" rx="1" />
          <text x="12" y="11" fill="#0F172A" fontSize="5" fontWeight="bold" textAnchor="middle">0.00 V</text>
          <circle cx="8" cy="16" r="1.5" fill="#EF4444" />
          <circle cx="16" cy="16" r="1.5" fill="#000000" />
        </svg>
      ),
    },
    {
      id: 'Scope',
      label: 'Scope',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" fill="#1E293B" stroke="#475569" strokeWidth="1.5" />
          <path d="M5 12h2l2-4 3 8 2-6 2 2h3" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      id: 'FGEN',
      label: 'FGEN',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" fill="#475569" stroke="#334155" strokeWidth="1.5" />
          <path d="M5 12c2.5-5 5-5 7 0s4.5 5 7 0" stroke="#38BDF8" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: 'VPS',
      label: 'VPS',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" fill="#E2E8F0" stroke="#94A3B8" strokeWidth="1.5" />
          <text x="7" y="10" fill="#EF4444" fontSize="7" fontWeight="bold">+</text>
          <text x="14" y="10" fill="#3B82F6" fontSize="7" fontWeight="bold">−</text>
          <line x1="5" y1="14" x2="19" y2="14" stroke="#64748B" strokeWidth="1" />
          <circle cx="8" cy="17" r="1.5" fill="#EF4444" />
          <circle cx="16" cy="17" r="1.5" fill="#3B82F6" />
        </svg>
      ),
    },
    {
      id: 'Bode',
      label: 'Bode',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" fill="#0F172A" stroke="#334155" strokeWidth="1.5" />
          <path d="M5 8h6c3 0 5 3 6 8" stroke="#F59E0B" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M5 16h6c3 0 5-3 6-8" stroke="#06B6D4" strokeWidth="1" strokeDasharray="1.5 1.5" />
        </svg>
      ),
    },
    {
      id: 'DSA',
      label: 'DSA',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
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
      id: 'ARB',
      label: 'ARB',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" fill="#334155" stroke="#1E293B" strokeWidth="1.5" />
          <path d="M5 16l3-8 4 6 3-4 4 6" stroke="#A855F7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      id: 'DigIn',
      label: 'DigIn',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="1.5" />
          <circle cx="7" cy="8" r="2" fill="#10B981" />
          <circle cx="12" cy="8" r="2" fill="#94A3B8" />
          <circle cx="17" cy="8" r="2" fill="#10B981" />
          <path d="M7 14v4M12 14v4M17 14v4" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: 'DigOut',
      label: 'DigOut',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" fill="#F1F5F9" stroke="#94A3B8" strokeWidth="1.5" />
          <rect x="6" y="7" width="3" height="6" rx="1" fill="#3B82F6" />
          <rect x="11" y="11" width="3" height="6" rx="1" fill="#64748B" />
          <rect x="16" y="7" width="3" height="6" rx="1" fill="#3B82F6" />
        </svg>
      ),
    },
    {
      id: 'Imped',
      label: 'Imped',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1.5" />
          <text x="12" y="15" fill="#B45309" fontSize="10" fontWeight="bold" fontFamily="serif" textAnchor="middle">Z</text>
        </svg>
      ),
    },
    {
      id: 'TwoWire',
      label: '2-Wire',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.5" />
          <line x1="5" y1="18" x2="19" y2="18" stroke="#94A3B8" strokeWidth="1" />
          <line x1="12" y1="5" x2="12" y2="19" stroke="#94A3B8" strokeWidth="1" />
          <path d="M6 18c6 0 7-1 8-11" stroke="#DC2626" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: 'ThreeWire',
      label: '3-Wire',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.5" />
          <path d="M6 17c4 0 5-2 6-6h7" stroke="#2563EB" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M6 17c4 0 5-4 6-10h7" stroke="#2563EB" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M6 17c4 0 5-1 6-3h7" stroke="#2563EB" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      id: 'SimDebug',
      label: 'Diagnostics',
      icon: (
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="18" height="18" rx="2" fill="#0F172A" stroke="#38BDF8" strokeWidth="1.5" />
          <path d="M7 8h10M7 12h7M7 16h4" stroke="#38BDF8" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="17" cy="15" r="2.5" fill="#10B981" />
        </svg>
      ),
    },
  ];

  return (
    <div className="ni-launcher-bar">
      <div className="launcher-title-strip">
        <span className="launcher-title-text">NI ELVISmx Instrument Launcher</span>
      </div>
      <div className="launcher-icons-row">
        {instruments.map((inst) => {
          const isActive = activeInstruments[inst.id];
          return (
            <button
              key={inst.id}
              className={`launcher-item-btn ${isActive ? 'active' : ''}`}
              onClick={() => onToggleInstrument(inst.id)}
              title={`Open ${inst.label} instrument`}
            >
              <div className="launcher-icon-frame">{inst.icon}</div>
              <span className="launcher-item-label">{inst.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
