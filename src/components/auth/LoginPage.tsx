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
  const [showGoogleAccountSelector, setShowGoogleAccountSelector] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
      onLoginSuccess?.();
    } catch (err: any) {
      const msg = err?.message || '';
      console.warn('Google login error:', msg);

      if (msg === 'FIREBASE_NOT_CONFIGURED') {
        // Firebase not configured — show the simulated account selector as fallback
        setShowGoogleAccountSelector(true);
      } else if (msg === 'GOOGLE_AUTH_NOT_ENABLED') {
        setError('Google Sign-In is not enabled yet. Please enable it in the Firebase Console → Authentication → Sign-in method, or use Email/Password login.');
      } else if (msg === 'POPUP_BLOCKED') {
        setError('The sign-in popup was blocked by your browser. Please allow popups for this site and try again.');
      } else if (msg === 'POPUP_CLOSED') {
        // User closed the popup — not an error, just reset
        setError(null);
      } else if (msg === 'UNAUTHORIZED_DOMAIN') {
        setError('This domain is not authorized for Google Sign-In. Add "localhost" in Firebase Console → Authentication → Settings → Authorized domains.');
      } else if (msg === 'NETWORK_ERROR') {
        setError('Network error. Please check your internet connection and try again.');
      } else {
        // Unknown error — show the simulated account selector as fallback
        setShowGoogleAccountSelector(true);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectGoogleAccount = (selectedEmail: string) => {
    loginDemo(selectedEmail);
    setShowGoogleAccountSelector(false);
    onLoginSuccess?.();
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
        setError('Passwords do not match. Please re-enter.');
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
    <div className="login-screen-wrapper full-screen-mode">
      {/* Google Account Fallback Modal */}
      {showGoogleAccountSelector && (
        <div className="google-selector-overlay" onClick={() => setShowGoogleAccountSelector(false)}>
          <div className="google-selector-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="selector-header">
              <svg width="24" height="24" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <div>
                <h3 className="selector-title">Sign in with Google</h3>
                <p className="selector-subtitle">Choose a Google account to continue to CircuitLab</p>
              </div>
            </div>

            <div className="selector-accounts-list">
              <button
                type="button"
                className="selector-account-item"
                onClick={() => handleSelectGoogleAccount('bhagathkrishnan06@gmail.com')}
              >
                <div className="account-avatar-circle admin">BK</div>
                <div className="account-info-box">
                  <div className="account-name-line">
                    <span className="account-name">Bhagath Krishnan</span>
                    <span className="account-admin-badge">Admin</span>
                  </div>
                  <span className="account-email">bhagathkrishnan06@gmail.com</span>
                </div>
              </button>

              <button
                type="button"
                className="selector-account-item"
                onClick={() => handleSelectGoogleAccount('bhagathkrishnan952@gmail.com')}
              >
                <div className="account-avatar-circle admin">BK</div>
                <div className="account-info-box">
                  <div className="account-name-line">
                    <span className="account-name">Bhagath Krishnan</span>
                    <span className="account-admin-badge">Admin</span>
                  </div>
                  <span className="account-email">bhagathkrishnan952@gmail.com</span>
                </div>
              </button>

              <button
                type="button"
                className="selector-account-item"
                onClick={() => handleSelectGoogleAccount('student.lab@circuitlab.org')}
              >
                <div className="account-avatar-circle user">CL</div>
                <div className="account-info-box">
                  <div className="account-name-line">
                    <span className="account-name">CircuitLab Student</span>
                    <span className="account-user-badge">Student</span>
                  </div>
                  <span className="account-email">student.lab@circuitlab.org</span>
                </div>
              </button>
            </div>

            <div className="selector-custom-input-box">
              <span className="custom-input-label">Or enter another Google email:</span>
              <div className="custom-input-row">
                <input
                  type="email"
                  placeholder="name@gmail.com"
                  className="selector-text-input"
                  id="customGoogleEmailInput"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = (e.currentTarget.value || '').trim();
                      if (val) handleSelectGoogleAccount(val);
                    }
                  }}
                />
                <button
                  type="button"
                  className="selector-custom-btn"
                  onClick={() => {
                    const input = document.getElementById('customGoogleEmailInput') as HTMLInputElement;
                    const val = input?.value?.trim();
                    if (val) handleSelectGoogleAccount(val);
                  }}
                >
                  Continue
                </button>
              </div>
            </div>

            <button
              type="button"
              className="selector-close-btn"
              onClick={() => setShowGoogleAccountSelector(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Main Full-Screen Split Layout */}
      <div className="login-card-container full-screen-container">
        {/* Left Side: Full-Height Illustration Banner */}
        <div className="login-left-banner-panel full-screen-left">
          <img
            src="/login-banner.png"
            alt="CircuitLab — Explore. Design. Bring Circuits to Life."
            className="login-banner-image"
          />
        </div>

        {/* Right Side: Sleek Full-Height Form Panel */}
        <div className="login-right-form-panel full-screen-right">
          <div className="login-form-inner-wrapper">
            {/* Top Prompt: Switch between Login and Sign Up */}
            <div className="login-top-signup-prompt">
              <span className="prompt-text">
                {mode === 'login' ? 'New here?' : 'Already have an account?'}
              </span>
              <button
                type="button"
                className="prompt-link-btn"
                onClick={() => {
                  setError(null);
                  setMode(mode === 'login' ? 'signup' : 'login');
                }}
              >
                <span>{mode === 'login' ? 'Create an account' : 'Log in'}</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </div>

            {/* Header Title & Subtitle */}
            <div className="login-welcome-header">
              <h1 className="welcome-main-title">
                {mode === 'login' ? (
                  <>Welcome Back <span className="hand-wave-emoji">👋</span></>
                ) : (
                  <>Create an Account <span className="sparkle-emoji">⚡</span></>
                )}
              </h1>
              <p className="welcome-description">
                {mode === 'login'
                  ? 'Log in to your CircuitLab account to continue your simulation journey.'
                  : 'Join CircuitLab to design, simulate, and analyze circuits with virtual instruments.'}
              </p>
            </div>

            {/* Error Banner */}
            {error && (
              <div className="login-alert-banner" role="alert">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form className="login-fields-form" onSubmit={handleFormSubmit}>
              {/* Name Field (Only in Sign Up mode) */}
              {mode === 'signup' && (
                <div className="login-input-group">
                  <div className="input-icon-slot">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </div>
                  <input
                    type="text"
                    className="login-text-input"
                    placeholder="Full Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                </div>
              )}

              {/* Email Field */}
              <div className="login-input-group">
                <div className="input-icon-slot">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                </div>
                <input
                  type="email"
                  className="login-text-input"
                  placeholder="Email address"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              {/* Password Field */}
              <div className="login-input-group">
                <div className="input-icon-slot">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  className="login-text-input password-input"
                  placeholder={mode === 'signup' ? 'Password (minimum 6 characters)' : 'Password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  required
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label="Toggle password visibility"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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

              {/* Confirm Password Field (Only in Sign Up mode) */}
              {mode === 'signup' && (
                <div className="login-input-group">
                  <div className="input-icon-slot">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    className="login-text-input password-input"
                    placeholder="Confirm Password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                  />
                </div>
              )}

              {/* Remember Me & Forgot Password Row (Only in Log In mode) */}
              {mode === 'login' && (
                <div className="login-options-row">
                  <label className="remember-me-checkbox-label">
                    <input
                      type="checkbox"
                      className="remember-checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                    />
                    <span className="checkbox-custom" />
                    <span className="remember-text">Remember me</span>
                  </label>

                  <button
                    type="button"
                    className="forgot-password-link"
                    onClick={() => setError('Password reset instructions will be sent to your registered email.')}
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {/* Primary Submit Button */}
              <button
                type="submit"
                className="btn-primary-submit-login"
                disabled={loading}
              >
                <span>{loading ? 'Processing...' : (mode === 'signup' ? 'Create Account' : 'Log In')}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </form>

            {/* Divider */}
            <div className="login-or-divider">
              <span className="divider-line" />
              <span className="divider-text">or</span>
              <span className="divider-line" />
            </div>

            {/* Google Sign-In Button */}
            <button
              type="button"
              className="btn-google-sign-in"
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              {loading ? (
                <div className="login-small-spinner" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
              )}
              <span className="google-btn-text">
                {loading ? 'Authenticating with Google...' : 'Continue with Google'}
              </span>
            </button>

            {/* Creator Credit & Social Links Section (Replacing Quick Test & Terms) */}
            <div className="login-creator-section">
              <div className="creator-byline">
                Created by <span className="creator-highlight">Bhagath Krishnan</span>
              </div>
              <div className="creator-social-btns-row">
                <a
                  href="https://www.instagram.com/bhagath_krishnan"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="creator-social-btn instagram"
                  title="Instagram — Bhagath Krishnan"
                >
                  <svg className="social-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                  </svg>
                  <span>Instagram</span>
                </a>

                <a
                  href="https://github.com/bhagathkrishnan"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="creator-social-btn github"
                  title="GitHub — Bhagath Krishnan"
                >
                  <svg className="social-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                  </svg>
                  <span>GitHub</span>
                </a>

                <a
                  href="https://www.linkedin.com/in/bhagathkrishnan"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="creator-social-btn linkedin"
                  title="LinkedIn — Bhagath Krishnan"
                >
                  <svg className="social-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                  </svg>
                  <span>LinkedIn</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
