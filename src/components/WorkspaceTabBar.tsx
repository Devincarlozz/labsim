import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/CircuitStore';

export function WorkspaceTabBar() {
  const {
    workspaces,
    activeWorkspaceId,
    addWorkspace,
    switchWorkspace,
    closeWorkspace,
    renameWorkspace,
    duplicateWorkspace,
  } = useStore();

  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingTabId]);

  const handleStartRename = (id: string, currentName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTabId(id);
    setEditingName(currentName);
  };

  const handleCommitRename = () => {
    if (editingTabId && editingName.trim()) {
      renameWorkspace(editingTabId, editingName.trim());
    }
    setEditingTabId(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCommitRename();
    } else if (e.key === 'Escape') {
      setEditingTabId(null);
    }
  };

  return (
    <div className="ps-workspace-tab-bar" role="tablist" aria-label="Workspaces">
      {/* Horizontal Tabs List */}
      <div className="ps-tabs-scroll-area">
        <div className="ps-tabs-track">
          {workspaces.map((ws, index) => {
            const isActive = ws.id === activeWorkspaceId;
            const isEditing = editingTabId === ws.id;

            return (
              <div
                key={ws.id}
                role="tab"
                aria-selected={isActive}
                tabIndex={0}
                className={`ps-tab ${isActive ? 'active' : ''}`}
                onClick={() => switchWorkspace(ws.id)}
                onDoubleClick={(e) => handleStartRename(ws.id, ws.name, e)}
                title={`Workspace ${index + 1}: ${ws.name} (Double-click to rename)`}
              >
                {/* Active Top Glow Stripe */}
                {isActive && <div className="ps-tab-active-indicator" />}

                {/* Tab Schematic Icon */}
                <span className="ps-tab-icon" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <path d="M7 8h10" />
                    <path d="M7 12h10" />
                    <path d="M7 16h6" />
                  </svg>
                </span>

                {/* Tab Title or Inline Rename Input */}
                {isEditing ? (
                  <input
                    ref={inputRef}
                    className="ps-tab-rename-input"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={handleCommitRename}
                    onKeyDown={handleKeyDown}
                    onClick={(e) => e.stopPropagation()}
                    maxLength={32}
                  />
                ) : (
                  <span className="ps-tab-title">{ws.name}</span>
                )}

                {/* Tab Close Button */}
                <button
                  className="ps-tab-close-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    closeWorkspace(ws.id);
                  }}
                  title={workspaces.length > 1 ? `Close ${ws.name}` : 'Reset workspace'}
                  aria-label={`Close ${ws.name}`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            );
          })}

          {/* Photoshop-style '+' Add New Workspace Tab Button */}
          <button
            className="ps-tab-add-btn"
            onClick={() => addWorkspace()}
            title="Add New Workspace (New Tab)"
            aria-label="Add New Workspace"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Right Controls: Cookie Storage Status & Utilities */}
      <div className="ps-tab-bar-utilities">
        {/* Duplicate Active Workspace */}
        <button
          className="ps-util-btn"
          onClick={() => duplicateWorkspace(activeWorkspaceId)}
          title="Duplicate Current Workspace Tab"
          aria-label="Duplicate Current Workspace Tab"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          <span>Duplicate</span>
        </button>
      </div>
    </div>
  );
}
