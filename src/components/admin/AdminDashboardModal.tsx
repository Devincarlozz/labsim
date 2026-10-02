import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext';
import { subscribeToActiveUsers } from '../../services/firebase';
import { UserPresence } from '../../types/auth';

export function AdminDashboardModal() {
  const { isAdminModalOpen, setAdminModalOpen, user, isAdmin } = useAuth();
  const [users, setUsers] = useState<UserPresence[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'simulating' | 'admins'>('all');
  const [selectedUser, setSelectedUser] = useState<UserPresence | null>(null);

  // Subscribe to real-time users presence
  useEffect(() => {
    if (!isAdminModalOpen || !isAdmin) return;

    const unsubscribe = subscribeToActiveUsers((activeList) => {
      setUsers(activeList);
    });

    return () => unsubscribe();
  }, [isAdminModalOpen, isAdmin]);

  // Derived KPIs
  const stats = useMemo(() => {
    const totalUsers = users.length;
    const onlineCount = users.filter((u) => u.status === 'online').length;
    const simulatingCount = users.filter((u) => u.activeProject?.isSimulating).length;
    const totalProjects = users.filter((u) => !!u.activeProject).length;
    const daqActiveCount = users.filter((u) => u.activeProject?.daqEnabled).length;

    return { totalUsers, onlineCount, simulatingCount, totalProjects, daqActiveCount };
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
        (u.activeProject && u.activeProject.name.toLowerCase().includes(q));

      if (!matchQuery) return false;

      // Status tab filter
      if (statusFilter === 'online') return u.status === 'online';
      if (statusFilter === 'simulating') return u.activeProject?.isSimulating;
      if (statusFilter === 'admins') return u.role === 'admin';
      return true;
    });
  }, [users, searchQuery, statusFilter]);

  // STRICT GUARD: Only authorized admin can ever render the admin dashboard modal
  if (!isAdminModalOpen || !isAdmin || !user) return null;

  const formatTimeAgo = (timestamp: number) => {
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
                  Admin Center — Live User & Project Monitor
                </h2>
                <span className="live-pulse-badge">
                  <span className="pulse-dot" />
                  LIVE REALTIME
                </span>
              </div>
              <p className="admin-modal-subtitle">
                Authorized Lab Administrator Access: <strong>{user.email}</strong>
              </p>
            </div>
          </div>

          <div className="admin-top-actions">
            <button
              className="modal-close-btn"
              onClick={() => setAdminModalOpen(false)}
              aria-label="Close Admin Modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* KPI Stats Row */}
        <div className="admin-kpi-grid">
          <div className="kpi-card">
            <div className="kpi-icon-wrap blue">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <div className="kpi-info">
              <span className="kpi-value">{stats.onlineCount}</span>
              <span className="kpi-label">Active Users Online</span>
            </div>
            <span className="kpi-tag-sub">of {stats.totalUsers} registered</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon-wrap emerald">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
            <div className="kpi-info">
              <span className="kpi-value">{stats.simulatingCount}</span>
              <span className="kpi-label">Live Simulating</span>
            </div>
            <span className="kpi-tag-sub">interactive circuits</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon-wrap purple">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <div className="kpi-info">
              <span className="kpi-value">{stats.totalProjects}</span>
              <span className="kpi-label">Active Projects</span>
            </div>
            <span className="kpi-tag-sub">in workspace sessions</span>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon-wrap amber">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="4" width="16" height="16" rx="2" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <div className="kpi-info">
              <span className="kpi-value">{stats.daqActiveCount}</span>
              <span className="kpi-label">DAQ Benches ON</span>
            </div>
            <span className="kpi-tag-sub">powered hardware</span>
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
              placeholder="Search user by name, email, or active project..."
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
              🛡 Admins
            </button>
          </div>
        </div>

        {/* Users & Active Projects List */}
        <div className="admin-users-list-container">
          {filteredUsers.length === 0 ? (
            <div className="admin-empty-state">
              <div className="empty-icon">🔍</div>
              <p className="empty-title">No matching active users found</p>
              <p className="empty-desc">Try clearing your search query or switching filter tabs.</p>
            </div>
          ) : (
            <div className="admin-user-cards-grid">
              {filteredUsers.map((u) => {
                const isOnline = u.status === 'online';
                const isIdle = u.status === 'idle';
                const proj = u.activeProject;

                return (
                  <div
                    key={u.uid}
                    className={`admin-user-card ${isOnline ? 'online' : ''} ${selectedUser?.uid === u.uid ? 'selected' : ''}`}
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
                          title={`Status: ${u.status}`}
                        />
                      </div>

                      <div className="user-identity-col">
                        <div className="user-name-role-row">
                          <span className="user-display-name">{u.displayName || 'Anonymous User'}</span>
                          <span className={`user-role-badge ${u.role}`}>{u.role.toUpperCase()}</span>
                        </div>
                        <span className="user-email-text">{u.email || 'No email associated'}</span>
                      </div>

                      <div className="user-last-seen-badge">
                        <span>{formatTimeAgo(u.lastSeen)}</span>
                      </div>
                    </div>

                    {/* Active Project Card Details */}
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
                        <span>No active project currently opened</span>
                      </div>
                    )}

                    {/* Footer with Device & Quick Info */}
                    <div className="user-card-footer">
                      <span className="device-info-text">
                        💻 {u.browserInfo || 'Web Browser'}
                      </span>
                      <span className="uid-truncate" title={u.uid}>
                        UID: {u.uid.slice(0, 10)}...
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
