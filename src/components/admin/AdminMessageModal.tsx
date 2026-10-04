import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import {
  AdminMessage,
  fetchAdminMessages,
  broadcastAdminMessage,
  deleteAdminMessage,
  getReadMessageIds,
  markMessageAsRead,
} from '../../services/serverLogService';

interface AdminMessageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminMessageModal({ isOpen, onClose }: AdminMessageModalProps) {
  const { user, isAdmin } = useAuth();
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [readIds, setReadIds] = useState<string[]>(getReadMessageIds());

  // Composer state for admins
  const [showComposer, setShowComposer] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<'announcement' | 'assignment' | 'lab_notice' | 'safety'>('lab_notice');
  const [newPriority, setNewPriority] = useState<'normal' | 'important' | 'urgent'>('important');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchAdminMessages()
      .then((msgs) => {
        setMessages(msgs);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
      });

    const handleUpdate = () => {
      fetchAdminMessages().then(setMessages).catch(() => {});
    };

    window.addEventListener('circuitlab-admin-messages-update', handleUpdate);
    return () => {
      window.removeEventListener('circuitlab-admin-messages-update', handleUpdate);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleMarkAllRead = () => {
    messages.forEach((m) => markMessageAsRead(m.id));
    setReadIds(messages.map((m) => m.id));
    onClose();
  };

  const handlePostMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;

    setSubmitting(true);
    try {
      const added = await broadcastAdminMessage({
        title: newTitle.trim(),
        content: newContent.trim(),
        sender: user?.displayName || 'Bhagath Krishnan (Admin)',
        senderEmail: user?.email || 'bhagathkrishnan06@gmail.com',
        priority: newPriority,
        category: newCategory,
        active: true,
      });

      setMessages((prev) => [added, ...prev]);
      setNewTitle('');
      setNewContent('');
      setShowComposer(false);
    } catch (err) {
      console.error('Failed to post admin message:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteMessage = async (id: string) => {
    await deleteAdminMessage(id);
    setMessages((prev) => prev.filter((m) => m.id !== id));
  };

  const formatTimestamp = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getPriorityBadgeClass = (priority: AdminMessage['priority']) => {
    switch (priority) {
      case 'urgent': return 'badge-urgent';
      case 'important': return 'badge-important';
      default: return 'badge-normal';
    }
  };

  const getCategoryIcon = (category: AdminMessage['category']) => {
    switch (category) {
      case 'assignment': return '📝';
      case 'safety': return '⚠️';
      case 'lab_notice': return '🔬';
      default: return '📢';
    }
  };

  return (
    <div className="admin-msg-modal-overlay" onClick={onClose}>
      <div className="admin-msg-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Modal Top Header */}
        <div className="admin-msg-modal-header">
          <div className="header-icon-badge">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#38BDF8" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <div className="header-text-block">
            <div className="header-title-row">
              <h2 className="header-title">Lab Admin Message & Notice Board</h2>
              <span className="live-bulletin-tag">Official Notice</span>
            </div>
            <p className="header-subtitle">
              Official bulletins, experiment instructions, and announcements from Lab Administration
            </p>
          </div>

          <button className="admin-msg-close-btn" onClick={onClose} aria-label="Close Notice Board" title="Close Notice Board">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Admin Composer Action (Only visible to verified admins) */}
        {isAdmin && (
          <div className="admin-composer-bar">
            {!showComposer ? (
              <button
                type="button"
                className="btn-open-composer"
                onClick={() => setShowComposer(true)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                <span>Broadcast New Announcement to Students</span>
              </button>
            ) : (
              <form className="admin-composer-form" onSubmit={handlePostMessage}>
                <div className="composer-form-title-row">
                  <span className="composer-heading">New Broadcast Message</span>
                  <button
                    type="button"
                    className="composer-cancel-btn"
                    onClick={() => setShowComposer(false)}
                  >
                    Cancel
                  </button>
                </div>

                <div className="composer-inputs-grid">
                  <div className="composer-field">
                    <label>Title</label>
                    <input
                      type="text"
                      className="composer-text-input"
                      placeholder="e.g., Lab Session Notice: Experiment 4 Modulo Counters"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="composer-row-duo">
                    <div className="composer-field">
                      <label>Category</label>
                      <select
                        className="composer-select-input"
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value as any)}
                      >
                        <option value="lab_notice">🔬 Lab Notice</option>
                        <option value="assignment">📝 Assignment</option>
                        <option value="safety">⚠️ Safety Advisory</option>
                        <option value="announcement">📢 General Announcement</option>
                      </select>
                    </div>

                    <div className="composer-field">
                      <label>Priority</label>
                      <select
                        className="composer-select-input"
                        value={newPriority}
                        onChange={(e) => setNewPriority(e.target.value as any)}
                      >
                        <option value="important">⭐ Important</option>
                        <option value="urgent">🚨 Urgent / Action Required</option>
                        <option value="normal">ℹ️ Standard Information</option>
                      </select>
                    </div>
                  </div>

                  <div className="composer-field">
                    <label>Message Content</label>
                    <textarea
                      className="composer-textarea-input"
                      placeholder="Write your announcement or instructions for students..."
                      rows={3}
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      required
                    />
                  </div>

                  <div className="composer-actions-row">
                    <button
                      type="submit"
                      className="btn-submit-broadcast"
                      disabled={submitting || !newTitle.trim() || !newContent.trim()}
                    >
                      {submitting ? 'Broadcasting...' : '📢 Broadcast Announcement'}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Messages List Area */}
        <div className="admin-msg-content-scroll">
          {loading ? (
            <div className="admin-msg-loading-state">
              <div className="admin-msg-spinner" />
              <span>Loading laboratory notices...</span>
            </div>
          ) : messages.length === 0 ? (
            <div className="admin-msg-empty-state">
              <div className="empty-icon">✓</div>
              <p>No active announcements. You are completely up to date!</p>
            </div>
          ) : (
            <div className="admin-msg-cards-stack">
              {messages.map((msg) => {
                const isRead = readIds.includes(msg.id);
                return (
                  <article
                    key={msg.id}
                    className={`admin-msg-card ${!isRead ? 'unread' : 'read'}`}
                  >
                    <div className="card-top-meta-row">
                      <div className="card-meta-left">
                        <span className={`msg-priority-chip ${getPriorityBadgeClass(msg.priority)}`}>
                          {msg.priority.toUpperCase()}
                        </span>
                        <span className="msg-category-chip">
                          {getCategoryIcon(msg.category)} {msg.category.replace('_', ' ').toUpperCase()}
                        </span>
                        {!isRead && <span className="new-badge-dot">NEW</span>}
                      </div>

                      <div className="card-meta-right">
                        <span className="msg-timestamp">{formatTimestamp(msg.createdAt)}</span>
                        {isAdmin && (
                          <button
                            type="button"
                            className="msg-delete-btn"
                            onClick={() => handleDeleteMessage(msg.id)}
                            title="Delete this message"
                            aria-label="Delete this message"
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    <h3 className="msg-card-title">{msg.title}</h3>
                    <p className="msg-card-content">{msg.content}</p>

                    <div className="card-author-footer">
                      <div className="author-info">
                        <div className="author-avatar-small">BK</div>
                        <span className="author-name">
                          {msg.sender} <span className="author-verified-tag">✓ Lead Admin</span>
                        </span>
                      </div>
                      <span className="author-email">{msg.senderEmail}</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Bottom Footer */}
        <div className="admin-msg-modal-footer">
          <div className="footer-left-info">
            <span className="footer-bullet-dot" />
            <span>Logged in as: <strong>{user?.displayName || user?.email || 'Student'}</strong></span>
          </div>

          <div className="footer-actions-right">
            <button
              type="button"
              className="btn-acknowledge-enter"
              onClick={handleMarkAllRead}
            >
              <span>Acknowledge & Continue to Lab Workspace</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
