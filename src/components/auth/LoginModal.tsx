import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { FirebaseCustomConfig } from '../../services/firebase';

export function LoginModal() {
  const {
    isLoginModalOpen,
    setLoginModalOpen,
    loginWithGoogle,
    loginDemo,
    isFirebaseReady,
    firebaseConfig,
    saveConfig,
  } = useAuth();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(!isFirebaseReady);

  // Form state for Firebase credentials
  const [apiKey, setApiKey] = useState(firebaseConfig?.apiKey || '');
  const [authDomain, setAuthDomain] = useState(firebaseConfig?.authDomain || '');
  const [projectId, setProjectId] = useState(firebaseConfig?.projectId || '');
  const [configSuccess, setConfigSuccess] = useState(false);

  if (!isLoginModalOpen) return null;

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      const msg = err?.message || '';
      if (msg === 'FIREBASE_NOT_CONFIGURED') {
        setError('Firebase is not yet configured. Please enter your Firebase API credentials below, or click "Quick Demo Login" to explore immediately!');
        setShowConfig(true);
      } else if (msg === 'GOOGLE_AUTH_NOT_ENABLED') {
        setError('Google Sign-In is not enabled. Please enable it in Firebase Console → Authentication → Sign-in method.');
        setShowConfig(true);
      } else if (msg === 'POPUP_BLOCKED') {
        setError('Sign-in popup was blocked. Please allow popups for this site.');
      } else if (msg === 'POPUP_CLOSED') {
        // User closed popup — not an error
      } else if (msg === 'UNAUTHORIZED_DOMAIN') {
        setError('This domain is not authorized. Add "localhost" in Firebase Console → Auth → Authorized domains.');
      } else if (msg === 'NETWORK_ERROR') {
        setError('Network error. Check your internet connection.');
      } else {
        setError(err.message || 'Failed to authenticate with Google.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSaveFirebaseConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim() || !projectId.trim()) {
      setError('Please provide at least API Key and Project ID.');
      return;
    }

    const cfg: FirebaseCustomConfig = {
      apiKey: apiKey.trim(),
      authDomain: authDomain.trim() || `${projectId.trim()}.firebaseapp.com`,
      projectId: projectId.trim(),
    };

    const ok = saveConfig(cfg);
    if (ok) {
      setConfigSuccess(true);
      setError(null);
      setTimeout(() => setConfigSuccess(false), 3000);
    } else {
      setError('Invalid Firebase configuration values.');
    }
  };

  return (
    <div className="circuitlab-modal-backdrop" onClick={() => setLoginModalOpen(false)}>
      <div
        className="circuitlab-modal-dialog login-modal-content"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="login-modal-title"
      >
        {/* Modal Header */}
        <div className="modal-header-row">
          <div className="modal-header-brand">
            <div className="brand-icon small">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2">
                <rect x="5" y="5" width="14" height="14" rx="2.5" />
                <path d="M8.5 12h1.5l1-2 1.5 4 1-2h2" stroke="#FFFFFF" strokeWidth="1.8" />
              </svg>
            </div>
            <div>
              <h2 id="login-modal-title" className="modal-title">Sign in to CircuitLab</h2>
              <p className="modal-subtitle">Sync your active projects & live circuit simulations</p>
            </div>
          </div>
          <button
            className="modal-close-btn"
            onClick={() => setLoginModalOpen(false)}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="modal-alert-box error">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {configSuccess && (
          <div className="modal-alert-box success">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>Firebase configuration connected successfully! You can now sign in with Google.</span>
          </div>
        )}

        {/* Primary Action: Google Login */}
        <div className="login-actions-container">
          <button
            className="btn-google-login"
            onClick={handleGoogleLogin}
            disabled={loading}
          >
            {/* Google official SVG logo */}
            <svg width="18" height="18" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.34 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.34 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span>{loading ? 'Opening Google Auth...' : 'Continue with Google'}</span>
          </button>

          {/* Quick Demo Logins */}
          <div className="login-divider-line">
            <span>or instant test access</span>
          </div>

          <div className="demo-login-grid">
            <button
              className="btn-demo-login"
              onClick={() => loginDemo('student.lab@circuitlab.org')}
              title="Sign in as a standard student/engineer user"
            >
              <span className="demo-role-badge user">User</span>
              <div className="demo-login-info">
                <span className="demo-user-name">Sarah Chen</span>
                <span className="demo-user-desc">Student / Lab Engineer</span>
              </div>
            </button>

            <button
              className="btn-demo-login admin-accent"
              onClick={() => loginDemo('bhagathkrishnan06@gmail.com')}
              title="Sign in as authorized administrator Bhagath Krishnan"
            >
              <span className="demo-role-badge admin">Admin</span>
              <div className="demo-login-info">
                <span className="demo-user-name">Bhagath Krishnan</span>
                <span className="demo-user-desc">Administrator</span>
              </div>
            </button>
          </div>
        </div>

        {/* Firebase Config Accordion */}
        <div className="firebase-config-accordion">
          <button
            type="button"
            className="config-toggle-btn"
            onClick={() => setShowConfig(!showConfig)}
          >
            <div className="config-toggle-status">
              <span className={`status-indicator-dot ${isFirebaseReady ? 'green' : 'amber'}`} />
              <span>
                {isFirebaseReady ? 'Firebase Auth Connected' : 'Configure Custom Firebase Project (Optional)'}
              </span>
            </div>
            <span className="config-arrow">{showConfig ? '▲' : '▼'}</span>
          </button>

          {showConfig && (
            <form onSubmit={handleSaveFirebaseConfig} className="firebase-config-form">
              <p className="config-helper-text">
                Enter your Firebase Project credentials to authenticate real Google accounts.
                Values are stored in your local browser session.
              </p>

              <div className="form-group-field">
                <label>Firebase API Key</label>
                <input
                  type="text"
                  placeholder="AIzaSy..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  spellCheck={false}
                />
              </div>

              <div className="form-group-field">
                <label>Firebase Project ID</label>
                <input
                  type="text"
                  placeholder="my-circuit-lab-app"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                  spellCheck={false}
                />
              </div>

              <div className="form-group-field">
                <label>Auth Domain (Optional)</label>
                <input
                  type="text"
                  placeholder="my-circuit-lab-app.firebaseapp.com"
                  value={authDomain}
                  onChange={(e) => setAuthDomain(e.target.value)}
                  spellCheck={false}
                />
              </div>

              <button type="submit" className="btn-save-config">
                Save & Initialize Firebase
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
