import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { fetchTestModeSettings } from '../../services/firebase';

export function TestModeLockScreen() {
  const { user, logout, testMode, isCurrentSessionAuthorized, setLoginModalOpen } = useAuth();
  const [isChecking, setIsChecking] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const handleCheckAgain = async () => {
    setIsChecking(true);
    setStatusNotice(null);
    try {
      await fetchTestModeSettings();
      if (isCurrentSessionAuthorized) {
        setStatusNotice('✓ Access Granted! Reloading workspace...');
        window.location.reload();
      } else {
        setStatusNotice('Your account is still not on the whitelist. Please verify with the administrator.');
      }
    } catch {
      setStatusNotice('Failed to connect to verification server. Please retry in a moment.');
    } finally {
      setTimeout(() => setIsChecking(false), 600);
    }
  };

  const adminEmail = 'bhagathkrishnan06@gmail.com';
  const mailtoSubject = encodeURIComponent('CircuitLab Test Mode Whitelist Request');
  const mailtoBody = encodeURIComponent(
    `Hello Administrator,\n\nPlease whitelist my email address (${user?.email || 'my account'}) for the current CircuitLab real-user testing session.\n\nThank you!`
  );
  const mailtoUrl = `mailto:${adminEmail}?subject=${mailtoSubject}&body=${mailtoBody}`;

  return (
    <div className="test-lockout-backdrop">
      {/* Subtle circuit background grid */}
      <div className="test-lockout-grid-overlay" />

      <div className="test-lockout-card" role="alertdialog" aria-modal="true" aria-labelledby="lockout-title">
        {/* Pulsing Lock Icon Emblem */}
        <div className="test-lockout-emblem-wrap">
          <div className="test-lockout-beacon-ring" />
          <div className="test-lockout-icon-box">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              <circle cx="12" cy="16" r="1.5" fill="#F59E0B" />
            </svg>
          </div>
        </div>

        {/* Live Badge */}
        <div className="test-lockout-badge-row">
          <span className="test-lockout-status-badge">
            <span className="lockout-pulse-dot" />
            PRIVATE TEST LOCK ACTIVE
          </span>
        </div>

        <h1 id="lockout-title" className="test-lockout-heading">
          CircuitLab Real-User Testing Mode
        </h1>

        <p className="test-lockout-description">
          The laboratory simulation platform is currently locked for an exclusive private testing session with real users.
          Only authorized administrators, laboratory participants, and approved tester accounts may access the workspace.
        </p>

        {/* Account Info Box */}
        {user ? (
          <div className="test-lockout-user-box">
            <div className="lockout-user-avatar">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || 'User'} />
              ) : (
                <span>{(user.displayName || user.email || 'U').charAt(0).toUpperCase()}</span>
              )}
            </div>

            <div className="lockout-user-details">
              <div className="lockout-user-name-row">
                <span className="lockout-user-name">{user.displayName || 'Visitor'}</span>
                <span className="lockout-unauthorized-pill">Not Whitelisted</span>
              </div>
              <span className="lockout-user-email">{user.email || 'No email associated'}</span>
            </div>
          </div>
        ) : (
          <div className="test-lockout-guest-box">
            <span>👤 You are currently browsing as an unregistered visitor. Sign in with an approved tester account to continue.</span>
          </div>
        )}

        {statusNotice && (
          <div className="test-lockout-status-notice">
            {statusNotice}
          </div>
        )}

        {/* Action Buttons */}
        <div className="test-lockout-actions">
          {user ? (
            <>
              <button
                className="lockout-btn primary"
                onClick={handleCheckAgain}
                disabled={isChecking}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={isChecking ? 'spinning' : ''}>
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                </svg>
                <span>{isChecking ? 'Checking Authorization...' : 'Check Access Status'}</span>
              </button>

              <a
                href={mailtoUrl}
                className="lockout-btn secondary"
                target="_blank"
                rel="noreferrer"
              >
                ✉️ Request Whitelist Access
              </a>

              <button
                className="lockout-btn ghost"
                onClick={logout}
              >
                Sign In with Different Account
              </button>
            </>
          ) : (
            <button
              className="lockout-btn primary"
              onClick={() => setLoginModalOpen(true)}
            >
              Sign In with Authorized Account
            </button>
          )}
        </div>

        {/* Footer info */}
        <div className="test-lockout-footer">
          <span>Lead Lab Administrator: <strong>{adminEmail}</strong></span>
          <span>Security Protocol: Firebase Role & Whitelist Gate</span>
        </div>
      </div>
    </div>
  );
}
