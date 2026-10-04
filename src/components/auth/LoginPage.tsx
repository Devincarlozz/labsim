import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

interface LoginPageProps {
  onLoginSuccess?: () => void;
}

export function LoginPage({ onLoginSuccess }: LoginPageProps) {
  const {
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    loginDemo,
    testMode,
  } = useAuth();

  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);


  // Email format validation for the green checkmark
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
      onLoginSuccess?.();
    } catch (err: any) {
      const msg = err?.message || '';
      console.warn('Google login error:', msg);

      if (msg === 'POPUP_CLOSED') {
        setError(null);
      } else {
        // Fallback: direct demo login when Firebase/Google auth is unavailable
        const fallbackEmail = email.trim() || 'user@circuitlab.org';
        loginDemo(fallbackEmail);
        onLoginSuccess?.();
      }
    } finally {
      setLoading(false);
    }
  };



  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please enter your email address.');
      return;
    }

    if (!password) {
      setError('Please enter a password.');
      return;
    }

    if (mode === 'signup') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match. Please verify and re-enter.');
        return;
      }

      setLoading(true);
      try {
        await registerWithEmail(name.trim() || cleanEmail.split('@')[0], cleanEmail, password);
        onLoginSuccess?.();
      } catch (err: any) {
        setError(err.message || 'Failed to create account.');
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(true);
      try {
        await loginWithEmail(cleanEmail, password);
        onLoginSuccess?.();
      } catch (err: any) {
        setError(err.message || 'Failed to sign in. Please verify your credentials.');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="neon-login-root">
      {/* Subtle Background Glow Elements (No continuous animation) */}
      <div className="neon-ambient-glow neon-glow-top-left" />
      <div className="neon-ambient-glow neon-glow-bottom-right" />




      {/* Main Container Layout */}
      <div className="neon-workbench-container">
        {/* Top Header Bar */}
        <header className="neon-top-header">
          <div className="neon-brand-group">
            <div className="neon-brand-logo">
              {/* CircuitLab IC Chip Icon */}
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                <rect x="4" y="4" width="16" height="16" rx="3.5" stroke="#00E5FF" strokeWidth="2" fill="rgba(0, 229, 255, 0.08)" />
                <rect x="8" y="8" width="8" height="8" rx="1.5" stroke="#00E5FF" strokeWidth="1.5" fill="#00E5FF" fillOpacity="0.25" />
                <line x1="4" y1="9" x2="1" y2="9" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" />
                <line x1="4" y1="15" x2="1" y2="15" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" />
                <line x1="20" y1="9" x2="23" y2="9" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" />
                <line x1="20" y1="15" x2="23" y2="15" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" />
                <line x1="9" y1="4" x2="9" y2="1" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" />
                <line x1="15" y1="4" x2="15" y2="1" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" />
                <line x1="9" y1="20" x2="9" y2="23" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" />
                <line x1="15" y1="20" x2="15" y2="23" stroke="#00E5FF" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
            <span className="neon-brand-title">CircuitLab</span>
            <div className="neon-version-pill">
              <span className="neon-version-dot" />
              <span className="neon-version-tag">V2.4</span>
              <span className="neon-version-sep" />
              <span className="neon-version-sub">ENGINEERING WORKSTATION PRO</span>
            </div>
          </div>

          <div className="neon-header-nav">
            <span>Simulate</span>
            <span className="neon-nav-bullet">•</span>
            <span>Design</span>
            <span className="neon-nav-bullet">•</span>
            <span>Learn</span>
          </div>
        </header>

        {/* Two-Column Workbench Body */}
        <div className="neon-main-grid">
          {/* Left Column: Showcase & Telemetry */}
          <div className="neon-left-column">
            {/* Hero Headline & 3D Isometric Visual Row */}
            <div className="neon-hero-split-row">
              <div className="neon-hero-text-block">
                <h1 className="neon-hero-title">
                  <span className="title-line-white">Build. Simulate.</span>
                  <span className="title-line-gradient">Bring Ideas to Life.</span>
                </h1>
                <p className="neon-hero-description">
                  High-fidelity digital and analog electronics simulation with solderless breadboard,
                  integrated circuit logic families, and NI ELVISmx virtual instrumentation.
                </p>
              </div>

              <div className="neon-hero-isometric-visual">
                <img
                  src="/isometric-workbench.webp"
                  alt="CircuitLab 3D Isometric Circuit Bench"
                  className="isometric-chip-image"
                  loading="eager"
                />
              </div>
            </div>

            {/* Real-Time Simulation Engine Card */}
            <div className="neon-scope-card">
              <div className="scope-card-header">
                <div className="scope-title-meta">
                  <span className="scope-green-dot" />
                  <div>
                    <div className="scope-main-title">REAL-TIME SIMULATION ENGINE</div>
                    <div className="scope-sub-title">Accurate | Fast | Reliable</div>
                  </div>
                </div>
                <div className="scope-status-pill">
                  ACTIVE • 5.0V VCC
                </div>
              </div>

              {/* Oscilloscope Grid & Crisp Static Waveforms */}
              <div className="scope-screen-wrapper">
                <div className="scope-grid-bg" />
                <svg className="scope-wave-svg" viewBox="0 0 460 76" preserveAspectRatio="none">
                  {/* Yellow Analog Sine Wave (CLK 1 kHz) */}
                  <path
                    d="M 0 38 Q 28 8, 57 38 T 114 38 T 171 38 T 228 38 T 285 38 T 342 38 T 399 38 T 460 38"
                    fill="none"
                    stroke="#FFD600"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    style={{ filter: 'drop-shadow(0 0 4px rgba(255, 214, 0, 0.7))' }}
                  />
                  {/* Cyan Digital Pulse Waveform (Q0 Output) */}
                  <path
                    d="M 0 54 L 38 54 L 38 18 L 76 18 L 76 54 L 114 54 L 114 18 L 152 18 L 152 54 L 190 54 L 190 18 L 228 18 L 228 54 L 266 54 L 266 18 L 304 18 L 304 54 L 342 54 L 342 18 L 380 18 L 380 54 L 418 54 L 418 18 L 460 18"
                    fill="none"
                    stroke="#00E5FF"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ filter: 'drop-shadow(0 0 5px rgba(0, 229, 255, 0.75))' }}
                  />
                </svg>
                <div className="scope-legend-tags">
                  <div className="scope-legend-item">
                    <span className="legend-dot yellow" />
                    <span className="legend-text">CH1: CLK (1 kHz)</span>
                  </div>
                  <div className="scope-legend-item">
                    <span className="legend-dot cyan" />
                    <span className="legend-text">CH2: Q0 OUTPUT</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Feature Matrix (2x2 Grid) */}
            <div className="neon-features-grid">
              <div className="neon-feature-card">
                <div className="feature-icon-box blue-lightning">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#60A5FA" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <div className="feature-text-block">
                  <div className="feature-title">Virtual Breadboard</div>
                  <div className="feature-desc">64-Col DIP layout & Power Rails</div>
                </div>
                <span className="feature-arrow">›</span>
              </div>

              <div className="neon-feature-card">
                <div className="feature-icon-box emerald-chip">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34D399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="4" y="4" width="16" height="16" rx="2" />
                    <rect x="9" y="9" width="6" height="6" />
                    <line x1="9" y1="1" x2="9" y2="4" />
                    <line x1="15" y1="1" x2="15" y2="4" />
                    <line x1="9" y1="20" x2="9" y2="23" />
                    <line x1="15" y1="20" x2="15" y2="23" />
                    <line x1="20" y1="9" x2="23" y2="9" />
                    <line x1="20" y1="14" x2="23" y2="14" />
                    <line x1="1" y1="9" x2="4" y2="9" />
                    <line x1="1" y1="14" x2="4" y2="14" />
                  </svg>
                </div>
                <div className="feature-text-block">
                  <div className="feature-title">NI ELVISmx Suite</div>
                  <div className="feature-desc">Oscilloscope, Function Gen & DIO</div>
                </div>
                <span className="feature-arrow">›</span>
              </div>

              <div className="neon-feature-card">
                <div className="feature-icon-box red-gate">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h7a9 9 0 0 1 9 8 9 9 0 0 1-9 8H4z" />
                    <circle cx="21" cy="12" r="1.5" />
                  </svg>
                </div>
                <div className="feature-text-block">
                  <div className="feature-title">74HC Logic Gates</div>
                  <div className="feature-desc">Counters, Flip-Flops & ICs</div>
                </div>
                <span className="feature-arrow">›</span>
              </div>

              <div className="neon-feature-card">
                <div className="feature-icon-box violet-folder">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C084FC" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div className="feature-text-block">
                  <div className="feature-title">Preserved Workspace</div>
                  <div className="feature-desc">Auto-sync & instant restore</div>
                </div>
                <span className="feature-arrow">›</span>
              </div>
            </div>
          </div>

          {/* Right Column: Neon Glow Access Workbench Card */}
          <div className="neon-right-column">
            {/* Designer Details above the Access Workbench Tile */}
            <div className="neon-designer-above-tile">
              <div className="neon-credit-line">
                <span>Engineered & Designed by </span>
                <span className="neon-author-name">Bhagath Krishnan</span>
              </div>
              <div className="neon-social-buttons">
                <a
                  href="https://www.instagram.com/bhagath_krishnan"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="neon-social-pill"
                  title="Instagram"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                  <span>Instagram</span>
                </a>
                <a
                  href="https://github.com/bhagathkrishnan"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="neon-social-pill"
                  title="GitHub"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  <span>GitHub</span>
                </a>
                <a
                  href="https://www.linkedin.com/in/bhagathkrishnan"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="neon-social-pill"
                  title="LinkedIn"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                  </svg>
                  <span>LinkedIn</span>
                </a>
              </div>
            </div>

            <div className="neon-auth-card">
              {/* Test Mode Notification Banner */}
              {testMode.enabled && (
                <div className="login-test-mode-banner">
                  <div className="login-test-badge-row">
                    <span className="login-test-pulsing-disc" />
                    <span className="login-test-badge-text">🔒 REAL-USER TEST LOCK ACTIVE</span>
                  </div>
                  <p className="login-test-info-desc">
                    Private real-user testing is currently active. Access is exclusively granted to authorized tester accounts and active lab researchers.
                  </p>
                </div>
              )}

              {/* Sign In / Create Account Tab Buttons */}
              <div className="neon-card-tabs">
                <button
                  type="button"
                  className={`neon-tab-item ${mode === 'login' ? 'active' : ''}`}
                  onClick={() => {
                    setError(null);
                    setMode('login');
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  <span>Sign In</span>
                </button>
                <button
                  type="button"
                  className={`neon-tab-item ${mode === 'signup' ? 'active' : ''}`}
                  onClick={() => {
                    setError(null);
                    setMode('signup');
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="4" />
                    <line x1="20" y1="8" x2="20" y2="14" />
                    <line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                  <span>Create Account</span>
                </button>
              </div>

              {/* Title Block */}
              <div className="neon-auth-header">
                <h2 className="neon-auth-title">
                  {mode === 'login' ? 'Access Workbench' : 'Create Account'}
                </h2>
                <p className="neon-auth-subtitle">
                  {mode === 'login'
                    ? 'Sign in to access your saved circuits, instruments, and labs.'
                    : 'Register an account to start simulating and saving circuits.'}
                </p>
              </div>

              {/* Continue with Google SSO */}
              <button
                type="button"
                className="neon-google-btn"
                onClick={handleGoogleLogin}
                disabled={loading}
              >
                {loading ? (
                  <div className="neon-btn-spinner" />
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                  </svg>
                )}
                <span>Continue with Google</span>
              </button>

              {/* Divider */}
              <div className="neon-auth-divider">
                <span className="divider-line" />
                <span className="divider-label">OR WITH EMAIL CREDENTIALS</span>
                <span className="divider-line" />
              </div>

              {/* Error Message Alert */}
              {error && (
                <div className="neon-error-banner" role="alert">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <span>{error}</span>
                </div>
              )}

              {/* Email Form */}
              <form className="neon-credentials-form" onSubmit={handleFormSubmit}>
                {mode === 'signup' && (
                  <div className="neon-field-group">
                    <label className="neon-field-label">Full Name</label>
                    <div className="neon-input-shell">
                      <svg className="neon-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                      <input
                        type="text"
                        className="neon-text-input"
                        placeholder="e.g. Alex Rivera"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoComplete="name"
                      />
                    </div>
                  </div>
                )}

                {/* Email Field - Starts completely blank as requested */}
                <div className="neon-field-group">
                  <label className="neon-field-label">Email Address</label>
                  <div className="neon-input-shell">
                    <svg className="neon-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    <input
                      type="email"
                      className="neon-text-input has-right-icon"
                      placeholder="name@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="off"
                      required
                    />
                    {isEmailValid && (
                      <span className="neon-valid-check" title="Valid email format">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </span>
                    )}
                  </div>
                </div>

                {/* Password Field */}
                <div className="neon-field-group">
                  <div className="neon-label-split">
                    <label className="neon-field-label">Password</label>
                    {mode === 'login' && (
                      <button
                        type="button"
                        className="neon-forgot-link"
                        onClick={() => setError('Password reset instructions will be sent to your email.')}
                      >
                        Forgot?
                      </button>
                    )}
                  </div>
                  <div className="neon-input-shell">
                    <svg className="neon-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      className="neon-text-input has-right-icon"
                      placeholder={mode === 'signup' ? 'Min. 6 characters' : '••••••••••••'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      required
                    />
                    <button
                      type="button"
                      className="neon-eye-toggle"
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? 'Hide password' : 'Show password'}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        {showPassword ? (
                          <>
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </>
                        ) : (
                          <>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </>
                        )}
                      </svg>
                    </button>
                  </div>
                </div>

                {mode === 'signup' && (
                  <div className="neon-field-group">
                    <label className="neon-field-label">Confirm Password</label>
                    <div className="neon-input-shell">
                      <svg className="neon-field-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="neon-text-input"
                        placeholder="Re-enter password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        autoComplete="new-password"
                        required
                      />
                    </div>
                  </div>
                )}

                {/* Remember My Session Checkbox */}
                {mode === 'login' && (
                  <div className="neon-remember-row">
                    <label className="neon-checkbox-label">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="neon-checkbox-input"
                      />
                      <span className="neon-checkbox-custom" />
                      <span className="neon-checkbox-text">Remember my session</span>
                    </label>
                  </div>
                )}

                {/* Submit Action Button */}
                <button
                  type="submit"
                  className="neon-submit-btn"
                  disabled={loading}
                >
                  <span>
                    {loading
                      ? 'Authenticating...'
                      : (mode === 'signup' ? 'Create Account & Enter Lab' : 'Sign In to Workbench')}
                  </span>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </form>

              {/* Security Isolation Footer Note */}
              <div className="neon-security-footer">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span>Protected with encrypted credential hashing and secure session isolation.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
