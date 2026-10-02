import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToActiveUsers, getLocalActiveUsers, fetchAllFirebaseUsers } from '../../services/firebase';
import { UserPresence } from '../../types/auth';

type FilterTab = 'all' | 'online' | 'simulating' | 'admins' | 'registered' | 'projects';

export function AdminDashboardModal() {
  const { isAdminModalOpen, setAdminModalOpen, user, isAdmin } = useAuth();
  const [users, setUsers] = useState<UserPresence[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<FilterTab>('all');
  const [selectedUser, setSelectedUser] = useState<UserPresence | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedNotice, setCopiedNotice] = useState<string | null>(null);

  // Subscribe to real-time users from Firebase Firestore database
  useEffect(() => {
    if (!isAdminModalOpen || !isAdmin) return;

    // Fetch initial list directly from Firebase Firestore database
    fetchAllFirebaseUsers().then((list) => {
      setUsers(list);
    }).catch(() => {});

    // Real-time listener on Firestore 'users' collection
    const unsubscribe = subscribeToActiveUsers((activeList) => {
      setUsers(activeList);
    });

    return () => unsubscribe();
  }, [isAdminModalOpen, isAdmin]);

  // Derived KPIs
  const stats = useMemo(() => {
    const totalUsers = users.length;
    const onlineCount = users.filter((u) => u.status === 'online').length;
    const simulatingCount = users.filter((u) => Boolean(u.activeProject?.isSimulating)).length;
    const totalProjects = users.filter((u) => Boolean(u.activeProject)).length;
    const daqActiveCount = users.filter((u) => Boolean(u.activeProject?.daqEnabled)).length;
    const adminCount = users.filter((u) => u.role === 'admin').length;
    const registeredCount = users.filter((u) => u.authProvider === 'email' || Boolean(u.createdAt)).length;

    return { totalUsers, onlineCount, simulatingCount, totalProjects, daqActiveCount, adminCount, registeredCount };
  }, [users]);

  // Filtered users list
  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      // Query filter
      const q = searchQuery.toLowerCase().trim();
      const matchQuery =
        !q ||
        (u.displayName && u.displayName.toLowerCase().includes(q)) ||
        (u.email && u.email.toLowerCase().includes(q)) ||
        (u.uid && u.uid.toLowerCase().includes(q)) ||
        (u.activeProject && u.activeProject.name.toLowerCase().includes(q));

      if (!matchQuery) return false;

      // Status tab filter
      if (statusFilter === 'online') return u.status === 'online';
      if (statusFilter === 'simulating') return Boolean(u.activeProject?.isSimulating);
      if (statusFilter === 'admins') return u.role === 'admin';
      if (statusFilter === 'registered') return u.authProvider === 'email' || Boolean(u.createdAt);
      if (statusFilter === 'projects') return Boolean(u.activeProject);
      return true;
    });
  }, [users, searchQuery, statusFilter]);

  // STRICT GUARD: Only authorized admin can ever render the admin dashboard modal
  if (!isAdminModalOpen || !isAdmin || !user) return null;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const fresh = await fetchAllFirebaseUsers();
      setUsers(fresh);
    } catch {
      setUsers(getLocalActiveUsers());
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedNotice(label);
    setTimeout(() => setCopiedNotice(null), 2000);
  };

  const formatTimeAgo = (timestamp?: number) => {
    if (!timestamp) return 'Recently';
    const diff = Math.max(0, Date.now() - timestamp);
    const sec = Math.floor(diff / 1000);
    if (sec < 10) return 'Just now';
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  };

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Account Active';
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const renderProviderBadge = (u: UserPresence) => {
    if (u.role === 'admin') {
      return (
        <span className="user-provider-chip admin-chip" title="Authorized Administrator Account">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L3 7v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-9-5z"/>
          </svg>
          ADMIN
        </span>
      );
    }
    if (u.authProvider === 'google') {
      return (
        <span className="user-provider-chip google-chip" title="Google Verified Account">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335"/>
          </svg>
          Google
        </span>
      );
    }
    if (u.authProvider === 'email' || u.createdAt) {
      return (
        <span className="user-provider-chip email-chip" title="Direct Email/Password Registration">
          ✉️ Email
        </span>
      );
    }
    return (
      <span className="user-provider-chip email-chip" title="Firebase User Account">
        👤 User
      </span>
    );
  };

  return (
    <div className="circuitlab-modal-backdrop" onClick={() => setAdminModalOpen(false)}>
      <div
        className="circuitlab-modal-dialog admin-dashboard-dialog"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-dialog-title"
      >
        {/* Top Header */}
        <div className="admin-modal-top-bar">
          <div className="admin-header-title-group">
            <div className="admin-shield-icon">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <div className="admin-title-badge-row">
                <h2 id="admin-dialog-title" className="admin-modal-title">
                  Admin Center — Live User & Project Directory
                </h2>
                <span className="live-pulse-badge">
                  <span className="pulse-dot" />
                  LIVE REALTIME
                </span>
                {copiedNotice && (
                  <span className="copied-toast-badge">
                    ✓ Copied {copiedNotice}
                  </span>
                )}
              </div>
              <p className="admin-modal-subtitle">
                Authorized Lab Administrator: <strong>{user.email}</strong> • Connected to Firebase Firestore Database (<strong>{users.length}</strong> {users.length === 1 ? 'user' : 'users'})
              </p>
            </div>
          </div>

          <div className="admin-top-actions">
            <button
              className={`admin-refresh-action-btn ${isRefreshing ? 'spinning' : ''}`}
              onClick={handleRefresh}
              title="Refresh User Presence"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
              </svg>
              <span>Refresh</span>
            </button>
            <button
              className="modal-close-btn"
              onClick={() => setAdminModalOpen(false)}
              aria-label="Close Admin Modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* KPI Stats Row (5 cards) */}
        <div className="admin-kpi-grid">
          <div className="kpi-card" onClick={() => setStatusFilter('all')} style={{ cursor: 'pointer' }}>
            <div className="kpi-icon-wrap blue">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="kpi-info">
              <span className="kpi-value">{stats.totalUsers}</span>
              <span className="kpi-label">Total Accounts</span>
            </div>
            <span className="kpi-tag-sub">{stats.registeredCount} email registered</span>
          </div>

          <div className="kpi-card" onClick={() => setStatusFilter('online')} style={{ cursor: 'pointer' }}>
            <div className="kpi-icon-wrap emerald">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" />
              </svg>
            </div>
            <div className="kpi-info">
              <span className="kpi-value">{stats.onlineCount}</span>
              <span className="kpi-label">Active Online</span>
            </div>
            <span className="kpi-tag-sub">real-time presence</span>
          </div>

          <div className="kpi-card" onClick={() => setStatusFilter('simulating')} style={{ cursor: 'pointer' }}>
            <div className="kpi-icon-wrap amber">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            </div>
            <div className="kpi-info">
              <span className="kpi-value">{stats.simulatingCount}</span>
              <span className="kpi-label">Simulating</span>
            </div>
            <span className="kpi-tag-sub">interactive circuits</span>
          </div>

          <div className="kpi-card" onClick={() => setStatusFilter('projects')} style={{ cursor: 'pointer' }}>
            <div className="kpi-icon-wrap purple">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div className="kpi-info">
              <span className="kpi-value">{stats.totalProjects}</span>
              <span className="kpi-label">Lab Projects</span>
            </div>
            <span className="kpi-tag-sub">workspace designs</span>
          </div>

          <div className="kpi-card" onClick={() => setStatusFilter('admins')} style={{ cursor: 'pointer' }}>
            <div className="kpi-icon-wrap cyan">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div className="kpi-info">
              <span className="kpi-value">{stats.adminCount}</span>
              <span className="kpi-label">Lab Admins</span>
            </div>
            <span className="kpi-tag-sub">authorized access</span>
          </div>
        </div>

        {/* Filter and Search Bar */}
        <div className="admin-toolbar-row">
          <div className="admin-search-box">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              placeholder="Search by name, email, project, or UID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              spellCheck={false}
            />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery('')}>
                ✕
              </button>
            )}
          </div>

          <div className="admin-filter-tabs">
            <button
              className={`filter-tab-btn ${statusFilter === 'all' ? 'active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All Users ({users.length})
            </button>
            <button
              className={`filter-tab-btn ${statusFilter === 'online' ? 'active' : ''}`}
              onClick={() => setStatusFilter('online')}
            >
              🟢 Online ({stats.onlineCount})
            </button>
            <button
              className={`filter-tab-btn ${statusFilter === 'simulating' ? 'active' : ''}`}
              onClick={() => setStatusFilter('simulating')}
            >
              ⚡ Simulating ({stats.simulatingCount})
            </button>
            <button
              className={`filter-tab-btn ${statusFilter === 'admins' ? 'active' : ''}`}
              onClick={() => setStatusFilter('admins')}
            >
              🛡 Admins ({stats.adminCount})
            </button>
            <button
              className={`filter-tab-btn ${statusFilter === 'registered' ? 'active' : ''}`}
              onClick={() => setStatusFilter('registered')}
            >
              📝 Registered ({stats.registeredCount})
            </button>
            <button
              className={`filter-tab-btn ${statusFilter === 'projects' ? 'active' : ''}`}
              onClick={() => setStatusFilter('projects')}
            >
              📂 Projects ({stats.totalProjects})
            </button>
          </div>
        </div>

        {/* Users & Active Projects List */}
        <div className="admin-users-list-container">
          {filteredUsers.length === 0 ? (
            <div className="admin-empty-state">
              <div className="empty-icon">🔍</div>
              <p className="empty-title">No matching accounts found</p>
              <p className="empty-desc">Try clearing your search query or switching to the "All Users" tab.</p>
              <button className="empty-reset-btn" onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}>
                Reset Filters
              </button>
            </div>
          ) : (
            <div className="admin-user-cards-grid">
              {filteredUsers.map((u) => {
                const isOnline = u.status === 'online';
                const isIdle = u.status === 'idle';
                const proj = u.activeProject;
                const isSelected = selectedUser?.uid === u.uid;

                return (
                  <div
                    key={u.uid}
                    className={`admin-user-card ${isOnline ? 'online' : ''} ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedUser(u)}
                  >
                    {/* User Profile Header */}
                    <div className="user-card-header">
                      <div className="user-avatar-wrap">
                        {u.photoURL ? (
                          <img src={u.photoURL} alt={u.displayName || 'User'} className="user-avatar-img" />
                        ) : (
                          <div className="user-avatar-placeholder">
                            {(u.displayName || u.email || 'U').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span
                          className={`presence-dot ${isOnline ? 'online' : isIdle ? 'idle' : 'offline'}`}
                          title={`Status: ${u.status.toUpperCase()} • Last seen ${formatTimeAgo(u.lastSeen)}`}
                        />
                      </div>

                      <div className="user-identity-col">
                        <div className="user-name-role-row">
                          <span className="user-display-name" title={u.displayName || 'User'}>
                            {u.displayName || 'Anonymous User'}
                          </span>
                          {renderProviderBadge(u)}
                        </div>
                        <span className="user-email-text" title={u.email || ''}>
                          {u.email || 'No email associated'}
                        </span>
                      </div>

                      <div className="user-last-seen-badge">
                        <span>{u.status === 'online' ? '🟢 Online' : formatTimeAgo(u.lastSeen)}</span>
                      </div>
                    </div>

                    {/* Active Project Card Details or Registration Details */}
                    {proj ? (
                      <div className="user-active-project-box">
                        <div className="active-proj-header">
                          <div className="proj-folder-title">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2">
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                            <span className="proj-name-bold">{proj.name}</span>
                          </div>

                          <div className="proj-status-badges">
                            {proj.isSimulating ? (
                              <span className="sim-badge running">
                                <span className="sim-pulse-dot" />
                                Simulating
                              </span>
                            ) : (
                              <span className="sim-badge paused">Paused</span>
                            )}
                            {proj.daqEnabled && (
                              <span className="daq-badge-on">DAQ ON</span>
                            )}
                          </div>
                        </div>

                        {/* Project Statistics Pills */}
                        <div className="proj-stats-metrics-row">
                          <div className="proj-metric-chip">
                            <span className="metric-chip-icon">🧩</span>
                            <span className="metric-chip-label">{proj.componentCount} Components</span>
                          </div>

                          <div className="proj-metric-chip">
                            <span className="metric-chip-icon">〰️</span>
                            <span className="metric-chip-label">{proj.wireCount} Wires</span>
                          </div>

                          <div className="proj-metric-chip">
                            <span className="metric-chip-icon">⏱</span>
                            <span className="metric-chip-label">Updated {formatTimeAgo(proj.lastUpdated)}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="no-project-banner">
                        <div className="no-project-icon">📂</div>
                        <div className="no-project-info">
                          <span className="no-project-title">Registered Account • Ready for Workspace</span>
                          <span className="no-project-sub">
                            {u.createdAt ? `Joined on ${formatDate(u.createdAt)}` : 'Canvas currently idle'}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Footer with Device & Quick Info */}
                    <div className="user-card-footer">
                      <span className="device-info-text" title={u.browserInfo}>
                        💻 {u.browserInfo || 'Web Browser'}
                      </span>
                      <div className="user-footer-actions">
                        <button
                          className="quick-inspect-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUser(u);
                          }}
                          title="Inspect user details"
                        >
                          Inspect 🔍
                        </button>
                        <span
                          className="uid-truncate clickable-uid"
                          title="Click to copy UID"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopy(u.uid, 'User ID');
                          }}
                        >
                          UID: {u.uid.slice(0, 10)}...
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected User Detail Modal / Inspector Drawer */}
        {selectedUser && (
          <div className="user-inspector-overlay" onClick={() => setSelectedUser(null)}>
            <div className="user-inspector-dialog" onClick={(e) => e.stopPropagation()}>
              <div className="inspector-header">
                <div className="inspector-user-info">
                  <div className="inspector-avatar">
                    {selectedUser.photoURL ? (
                      <img src={selectedUser.photoURL} alt={selectedUser.displayName || 'User'} />
                    ) : (
                      <span>{(selectedUser.displayName || selectedUser.email || 'U').charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <div>
                    <h3 className="inspector-name">{selectedUser.displayName || 'Anonymous User'}</h3>
                    <p className="inspector-email">{selectedUser.email || 'No email associated'}</p>
                  </div>
                </div>
                <button className="inspector-close-btn" onClick={() => setSelectedUser(null)}>✕</button>
              </div>

              <div className="inspector-body">
                <div className="inspector-meta-grid">
                  <div className="meta-item">
                    <span className="meta-label">Account Role</span>
                    <span className={`meta-value badge-role ${selectedUser.role}`}>
                      {selectedUser.role.toUpperCase()}
                    </span>
                  </div>

                  <div className="meta-item">
                    <span className="meta-label">Auth Provider</span>
                    <span className="meta-value">
                      {selectedUser.authProvider === 'google' ? 'Google Auth' : selectedUser.authProvider === 'email' ? 'Email / Password' : 'Firebase Database'}
                    </span>
                  </div>

                  <div className="meta-item">
                    <span className="meta-label">Current Status</span>
                    <span className={`meta-value status-${selectedUser.status}`}>
                      {selectedUser.status === 'online' ? '🟢 Online' : selectedUser.status === 'idle' ? '🟡 Idle' : '⚪ Offline'}
                    </span>
                  </div>

                  <div className="meta-item">
                    <span className="meta-label">Last Active</span>
                    <span className="meta-value">{formatTimeAgo(selectedUser.lastSeen)}</span>
                  </div>
                </div>

                <div className="inspector-section">
                  <h4 className="inspector-section-title">Unique Identifier (UID)</h4>
                  <div className="inspector-uid-box">
                    <code>{selectedUser.uid}</code>
                    <button
                      className="copy-field-btn"
                      onClick={() => handleCopy(selectedUser.uid, 'User ID')}
                    >
                      Copy UID
                    </button>
                  </div>
                </div>

                <div className="inspector-section">
                  <h4 className="inspector-section-title">System & Browser Environment</h4>
                  <div className="inspector-device-box">
                    <span className="device-chip">💻 {selectedUser.browserInfo || 'Standard Web Browser'}</span>
                  </div>
                </div>

                <div className="inspector-section">
                  <h4 className="inspector-section-title">Active Circuit Simulation Workspace</h4>
                  {selectedUser.activeProject ? (
                    <div className="inspector-project-card">
                      <div className="inspect-proj-title-row">
                        <strong>{selectedUser.activeProject.name}</strong>
                        <span className={`inspect-sim-badge ${selectedUser.activeProject.isSimulating ? 'sim-on' : 'sim-off'}`}>
                          {selectedUser.activeProject.isSimulating ? '⚡ Live Simulating' : '⏸ Paused'}
                        </span>
                      </div>
                      <div className="inspect-proj-stats">
                        <span>🧩 {selectedUser.activeProject.componentCount} Components</span>
                        <span>〰️ {selectedUser.activeProject.wireCount} Wires</span>
                        <span>🔌 DAQ Bench: {selectedUser.activeProject.daqEnabled ? 'ON' : 'OFF'}</span>
                      </div>
                      <span className="inspect-updated-time">
                        Last workspace edit: {formatTimeAgo(selectedUser.activeProject.lastUpdated)}
                      </span>
                    </div>
                  ) : (
                    <div className="inspector-empty-project">
                      <span>No active project currently opened by this user.</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="inspector-footer">
                {selectedUser.email && (
                  <button
                    className="inspector-action-btn primary"
                    onClick={() => handleCopy(selectedUser.email!, 'Email Address')}
                  >
                    Copy Email Address
                  </button>
                )}
                <button
                  className="inspector-action-btn secondary"
                  onClick={() => setSelectedUser(null)}
                >
                  Close Inspection
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
