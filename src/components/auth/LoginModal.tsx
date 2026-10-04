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

        {/* Creator Credit & Social Section */}
        <div className="login-creator-section">
          <div className="creator-byline">
            Engineered & Designed by <span className="creator-highlight">Bhagath Krishnan</span>
          </div>
          <div className="creator-social-btns-row">
            <a
              href="https://www.instagram.com/b_k.dev"
              target="_blank"
              rel="noopener noreferrer"
              className="creator-social-btn instagram"
              title="Instagram: @b_k.dev"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              <span>b_k.dev</span>
            </a>
            <a
              href="https://github.com/Devincarlozz"
              target="_blank"
              rel="noopener noreferrer"
              className="creator-social-btn github"
              title="GitHub: https://github.com/Devincarlozz"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
              </svg>
              <span>GitHub</span>
            </a>
            <a
              href="https://www.linkedin.com/in/bhagathdev/"
              target="_blank"
              rel="noopener noreferrer"
              className="creator-social-btn linkedin"
              title="LinkedIn: https://www.linkedin.com/in/bhagathdev/"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
              </svg>
              <span>LinkedIn</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
