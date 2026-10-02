import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/CircuitStore';
import { useAuth } from '../context/AuthContext';

interface ToolbarProps {
  leftSidebarOpen?: boolean;
  onToggleLeft?: (open: boolean) => void;
  rightSidebarOpen?: boolean;
  onToggleRight?: (open: boolean) => void;
}

export function Toolbar({
  leftSidebarOpen = true,
  onToggleLeft,
  rightSidebarOpen = true,
  onToggleRight,
}: ToolbarProps) {
  const {
    state,
    dispatch,
    undo,
    redo,
    canUndo,
    canRedo,
    workspaces,
    activeWorkspaceId,
    switchWorkspace,
    addWorkspace,
  } = useStore();
  const { editor } = state;

  const {
    user,
    isAdmin,
    setLoginModalOpen,
    setAdminModalOpen,
    logout,
  } = useAuth();

  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  const activeWs = workspaces.find((w) => w.id === activeWorkspaceId);
  const currentWorkspaceName = activeWs?.name || state.name || 'Workspace 1';

  const zoomPercent = Math.round(editor.viewTransform.scale * 100);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setWorkspaceMenuOpen(false);
      }
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    if (workspaceMenuOpen || profileMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [workspaceMenuOpen, profileMenuOpen]);

  const handleZoomIn = () => {
    dispatch({
      type: 'ZOOM',
      delta: 0.15,
      center: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    });
  };

  const handleZoomOut = () => {
    dispatch({
      type: 'ZOOM',
      delta: -0.15,
      center: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    });
  };

  const handleResetZoom = () => {
    dispatch({
      type: 'SET_VIEW',
      transform: {
        offsetX: editor.viewTransform.offsetX,
        offsetY: editor.viewTransform.offsetY,
        scale: 1,
      },
    });
  };

  return (
    <div className="app-header-container">
      <header className="app-header" role="banner">
        {/* Left Section: Brand & Workspace Selector */}
        <div className="header-left-cluster">
          {/* Brand block with glowing blue chip badge and CircuitLab name */}
          <div className="brand-block" title="CircuitLab — Design • Simulate • Learn">
            <div className="brand-icon" aria-label="CircuitLab Logo">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="5" width="14" height="14" rx="2.5" />
                <rect x="8.5" y="8.5" width="7" height="7" rx="1" fill="rgba(255,255,255,0.12)" />
                <path d="M8.5 12h1.5l1-2 1.5 4 1-2h2" stroke="#FFFFFF" strokeWidth="1.8" />
                <path d="M5 9H2.5M5 15H2.5M19 9h2.5M19 15h2.5M9 5V2.5M15 5V2.5M9 19v2.5M15 19v2.5" stroke="#FFFFFF" strokeWidth="1.7" />
              </svg>
            </div>
            <div className="brand-titles">
              <h1 className="brand-title">
                <span className="brand-title-main">Circuit</span>
                <span className="brand-title-accent">Lab</span>
              </h1>
              <span className="brand-subtitle">Design • Simulate • Learn</span>
            </div>
          </div>

          <div className="header-vertical-divider" />

          {/* Workspace selector dropdown pill */}
          <div className="workspace-selector-dropdown-wrapper" ref={dropdownRef}>
            <button
              className="workspace-selector-pill"
              onClick={() => setWorkspaceMenuOpen(!workspaceMenuOpen)}
              aria-expanded={workspaceMenuOpen}
              aria-label="Select Workspace"
              title="Switch Workspace"
            >
              <svg className="ws-folder-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="ws-name-text">{currentWorkspaceName}</span>
              <svg className={`ws-chevron-icon ${workspaceMenuOpen ? 'open' : ''}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {workspaceMenuOpen && (
              <div className="workspace-dropdown-menu">
                <div className="ws-dropdown-header">Switch Workspace</div>
                <div className="ws-dropdown-list">
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      className={`ws-dropdown-item ${ws.id === activeWorkspaceId ? 'active' : ''}`}
                      onClick={() => {
                        switchWorkspace(ws.id);
                        setWorkspaceMenuOpen(false);
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      <span>{ws.name}</span>
                      {ws.id === activeWorkspaceId && <span className="ws-active-bullet" />}
                    </button>
                  ))}
                </div>
                <div className="ws-dropdown-footer">
                  <button
                    className="ws-new-tab-btn"
                    onClick={() => {
                      addWorkspace();
                      setWorkspaceMenuOpen(false);
                    }}
                  >
                    + New Workspace
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: Tool Mode Buttons (Select, Move, Wire) */}
        <div className="tool-mode-group" role="toolbar" aria-label="Editor Tools">
          <button
            className={`tool-mode-btn ${editor.mode === 'select' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_MODE', mode: 'select' })}
            aria-label="Select mode"
            title="Select tool (V)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 3 7 18 3-7 7-3L3 3z" />
            </svg>
            <span>Select</span>
          </button>

          <button
            className={`tool-mode-btn ${editor.mode === 'move' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_MODE', mode: 'move' })}
            aria-label="Move mode"
            title="Move tool (M)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="5 9 2 12 5 15" />
              <polyline points="9 5 12 2 15 5" />
              <polyline points="15 19 12 22 9 19" />
              <polyline points="19 9 22 12 19 15" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <line x1="12" y1="2" x2="12" y2="22" />
            </svg>
            <span>Move</span>
          </button>

          <button
            className={`tool-mode-btn ${editor.mode === 'wire' ? 'active' : ''}`}
            onClick={() => dispatch({ type: 'SET_MODE', mode: 'wire' })}
            aria-label="Wire mode"
            title="Wire tool (W)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="5" cy="19" r="2.2" />
              <circle cx="19" cy="5" r="2.2" />
              <line x1="6.8" y1="17.2" x2="17.2" y2="6.8" />
            </svg>
            <span>Wire</span>
          </button>
        </div>

        {/* Right Section: Undo/Redo, Zoom, Panel Toggles, Admin & Profile */}
        <div className="header-right-cluster">
          {/* Admin Dashboard Quick Access Button (Strictly restricted to authorized admin emails) */}
          {isAdmin && (
            <button
              className="header-admin-btn admin-active"
              onClick={() => setAdminModalOpen(true)}
              title="Open Admin Center (Active Users & Projects)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              <span className="admin-btn-label">Admin</span>
              <span className="admin-btn-live-dot" />
            </button>
          )}

          {/* Undo / Redo capsule */}
          <div className="header-pill-capsule history-capsule">
            <button
              className="capsule-icon-btn"
              onClick={undo}
              disabled={!canUndo}
              aria-label="Undo"
              title="Undo (Ctrl+Z)"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 14 4 9l5-5" />
                <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
              </svg>
            </button>
            <button
              className="capsule-icon-btn"
              onClick={redo}
              disabled={!canRedo}
              aria-label="Redo"
              title="Redo (Ctrl+Y)"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m15 14 5-5-5-5" />
                <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13" />
              </svg>
            </button>
          </div>

          {/* Zoom controls capsule: 61% v + - */}
          <div className="header-pill-capsule zoom-capsule">
            <button
              className="zoom-percent-btn"
              onClick={handleResetZoom}
              title="Reset Zoom to 100%"
            >
              <span>{zoomPercent}%</span>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <button
              className="capsule-icon-btn"
              onClick={handleZoomIn}
              aria-label="Zoom In"
              title="Zoom In (+)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
            <button
              className="capsule-icon-btn"
              onClick={handleZoomOut}
              aria-label="Zoom Out"
              title="Zoom Out (-)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          </div>

          {/* Sidebars toggle capsule */}
          <div className="header-pill-capsule sidebar-capsule">
            {onToggleLeft && (
              <button
                className={`capsule-icon-btn ${leftSidebarOpen ? 'active' : ''}`}
                onClick={() => onToggleLeft(!leftSidebarOpen)}
                title={leftSidebarOpen ? "Hide Components Sidebar ([)" : "Show Components Sidebar ([)"}
                aria-label="Toggle Components Sidebar"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              </button>
            )}
            {onToggleRight && (
              <button
                className={`capsule-icon-btn ${rightSidebarOpen ? 'active' : ''}`}
                onClick={() => onToggleRight(!rightSidebarOpen)}
                title={rightSidebarOpen ? "Hide Properties Sidebar (])" : "Show Properties Sidebar (])"}
                aria-label="Toggle Properties Sidebar"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="15" y1="3" x2="15" y2="21" />
                </svg>
              </button>
            )}
          </div>

          {/* User profile avatar / Login trigger */}
          <div className="header-profile-dropdown-wrapper" ref={profileDropdownRef}>
            <div
              className={`header-profile-avatar ${user ? 'logged-in' : 'anonymous'}`}
              onClick={() => {
                if (user) {
                  setProfileMenuOpen(!profileMenuOpen);
                } else {
                  setLoginModalOpen(true);
                }
              }}
              title={user ? `${user.displayName} (${user.email}) - Click for options` : 'Sign in with Google'}
              role="button"
              tabIndex={0}
            >
              {user?.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || 'User'} className="header-avatar-img" />
              ) : user?.displayName ? (
                <span className="header-avatar-initial">
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
              <span className={`profile-online-dot ${user ? 'online' : 'offline'}`} />
            </div>

            {/* User Profile Popover Menu */}
            {profileMenuOpen && user && (
              <div className="profile-popover-menu">
                <div className="popover-user-header">
                  <div className="popover-avatar-wrap">
                    {user.photoURL ? (
                      <img src={user.photoURL} alt={user.displayName || 'User'} className="popover-avatar-img" />
                    ) : (
                      <div className="popover-avatar-init">
                        {(user.displayName || user.email || 'U').charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="popover-user-details">
                    <span className="popover-user-name">{user.displayName || 'Google User'}</span>
                    <span className="popover-user-email">{user.email || 'No email'}</span>
                    <span className={`popover-role-tag ${user.role}`}>
                      {user.role === 'admin' ? '🛡️ LAB ADMINISTRATOR' : '🎓 LAB ENGINEER'}
                    </span>
                  </div>
                </div>

                <div className="popover-menu-divider" />

                <div className="popover-menu-actions">
                  {isAdmin && (
                    <button
                      className="popover-menu-btn admin-highlight"
                      onClick={() => {
                        setProfileMenuOpen(false);
                        setAdminModalOpen(true);
                      }}
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                      <span>Admin Dashboard (Live Users)</span>
                    </button>
                  )}

                  <button
                    className="popover-menu-btn"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      setLoginModalOpen(true);
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="8.5" cy="7" r="4" />
                      <line x1="20" y1="8" x2="20" y2="14" />
                      <line x1="23" y1="11" x2="17" y2="11" />
                    </svg>
                    <span>Switch Google Account</span>
                  </button>

                  <button
                    className="popover-menu-btn danger"
                    onClick={() => {
                      setProfileMenuOpen(false);
                      logout();
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
    </div>
  );
}
