import React, { useEffect, useState, useRef } from 'react';
import { StoreProvider, useStore } from './store/CircuitStore';
import { Toolbar } from './components/Toolbar';
import { ComponentPalette } from './components/ComponentPalette';
import { WorkspaceTabBar } from './components/WorkspaceTabBar';
import { BreadboardCanvas } from './components/BreadboardCanvas';
import { PropertiesPanel } from './components/PropertiesPanel';
import { BottomInstrumentSuite } from './components/instruments/BottomInstrumentSuite';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LoginPage } from './components/auth/LoginPage';
import { AdminDashboardModal } from './components/admin/AdminDashboardModal';
import './styles/app.css';

function EditorShell() {
  const { state, dispatch, undo, redo } = useStore();
  const stateRef = useRef(state);
  stateRef.current = state;
  const undoRef = useRef(undo);
  undoRef.current = undo;
  const redoRef = useRef(redo);
  redoRef.current = redo;
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs or textareas
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
        return;
      }

      // Undo / Redo shortcuts (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z, Cmd+Z, Cmd+Shift+Z)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) {
          redoRef.current();
        } else {
          undoRef.current();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) {
        e.preventDefault();
        redoRef.current();
        return;
      }

      const currentState = stateRef.current;

      switch (e.key) {
        case '[':
          setLeftSidebarOpen((prev) => !prev);
          break;
        case ']':
          setRightSidebarOpen((prev) => !prev);
          break;
        case 'v':
        case 'V':
          dispatch({ type: 'SET_MODE', mode: 'select' });
          break;
        case 'm':
        case 'M':
          dispatch({ type: 'SET_MODE', mode: 'move' });
          break;
        case 'w':
        case 'W':
          dispatch({ type: 'SET_MODE', mode: 'wire' });
          break;
        case 'r':
        case 'R':
          if (currentState.editor.selectedComponentId) {
            dispatch({ type: 'ROTATE_COMPONENT', id: currentState.editor.selectedComponentId });
          }
          break;
        case 'Delete':
        case 'Backspace':
          dispatch({ type: 'DELETE_SELECTED' });
          break;
        case 'Escape':
          if (currentState.editor.wireStart) {
            dispatch({ type: 'CANCEL_WIRE' });
          } else {
            dispatch({ type: 'SET_MODE', mode: 'select' });
          }
          break;
        case 'ArrowUp':
          if (currentState.editor.selectedComponentId) {
            e.preventDefault();
            const comp = currentState.components.get(currentState.editor.selectedComponentId);
            if (comp) {
              dispatch({
                type: 'MOVE_COMPONENT',
                id: comp.id,
                position: { x: comp.position.x, y: comp.position.y - 14 },
                snap: true,
              });
            }
          }
          break;
        case 'ArrowDown':
          if (currentState.editor.selectedComponentId) {
            e.preventDefault();
            const comp = currentState.components.get(currentState.editor.selectedComponentId);
            if (comp) {
              dispatch({
                type: 'MOVE_COMPONENT',
                id: comp.id,
                position: { x: comp.position.x, y: comp.position.y + 14 },
                snap: true,
              });
            }
          }
          break;
        case 'ArrowLeft':
          if (currentState.editor.selectedComponentId) {
            e.preventDefault();
            const comp = currentState.components.get(currentState.editor.selectedComponentId);
            if (comp) {
              dispatch({
                type: 'MOVE_COMPONENT',
                id: comp.id,
                position: { x: comp.position.x - 14, y: comp.position.y },
                snap: true,
              });
            }
          }
          break;
        case 'ArrowRight':
          if (currentState.editor.selectedComponentId) {
            e.preventDefault();
            const comp = currentState.components.get(currentState.editor.selectedComponentId);
            if (comp) {
              dispatch({
                type: 'MOVE_COMPONENT',
                id: comp.id,
                position: { x: comp.position.x + 14, y: comp.position.y },
                snap: true,
              });
            }
          }
          break;
        case 'o': {
          window.dispatchEvent(new CustomEvent('open-instrument', { detail: { inst: 'Scope' } }));
          break;
        }
        case ' ': {
          e.preventDefault();
          const isCurrentlyActive = currentState.simulation.status === 'running' && (currentState.instruments.daq?.enabled !== false);
          const nextActive = !isCurrentlyActive;
          if (nextActive) {
            dispatch({ type: 'RUN_SIMULATION' });
            dispatch({ type: 'UPDATE_DAQ', settings: { enabled: true } });
            window.dispatchEvent(new CustomEvent('daq-power-change', { detail: { enabled: true } }));
          } else {
            dispatch({ type: 'SET_SIMULATION_STATUS', status: 'paused' });
            dispatch({ type: 'UPDATE_DAQ', settings: { enabled: false } });
            window.dispatchEvent(new CustomEvent('daq-power-change', { detail: { enabled: false } }));
          }
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dispatch]);

  const workspaceClasses = [
    'app-workspace',
    !leftSidebarOpen ? 'left-hidden' : '',
    !rightSidebarOpen ? 'right-hidden' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="app-shell">
      {/* 2. Top Application Header */}
      <Toolbar
        leftSidebarOpen={leftSidebarOpen}
        onToggleLeft={setLeftSidebarOpen}
        rightSidebarOpen={rightSidebarOpen}
        onToggleRight={setRightSidebarOpen}
      />

      {/* 1. Global Layout: 3-Zone Workspace (Extends automatically when sidebars are hidden) */}
      <div className={workspaceClasses}>
        {/* Floating Expand Tab for Left Sidebar when hidden */}
        {!leftSidebarOpen && (
          <button
            className="sidebar-expand-tab left-expand-tab"
            onClick={() => setLeftSidebarOpen(true)}
            title="Show Components Palette ([)"
            aria-label="Show Components Palette"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
            <span className="expand-tab-text">Components</span>
          </button>
        )}

        {/* 3. Left Sidebar — Components */}
        <div className={`left-sidebar-wrapper ${!leftSidebarOpen ? 'hidden' : ''}`}>
          {leftSidebarOpen && <ComponentPalette onToggle={setLeftSidebarOpen} />}
        </div>

        {/* 4. Center Workspace: Photoshop-style Tabs + Breadboard Canvas + Bottom Instrument Suite */}
        <main className="center-workspace">
          {/* Photoshop-like Workspace Document Tab Bar */}
          <WorkspaceTabBar />

          <div className="main-canvas-panel">
            <BreadboardCanvas />
          </div>

          {/* Bottom Area: NI ELVISmx Instrument Menu & Floating Overlapping Windows */}
          <BottomInstrumentSuite />
        </main>

        {/* 5. Right Sidebar — Properties / Notes */}
        <div className={`right-sidebar-wrapper ${!rightSidebarOpen ? 'hidden' : ''}`}>
          {rightSidebarOpen && <PropertiesPanel onToggle={setRightSidebarOpen} />}
        </div>

        {/* Floating Expand Tab for Right Sidebar when hidden */}
        {!rightSidebarOpen && (
          <button
            className="sidebar-expand-tab right-expand-tab"
            onClick={() => setRightSidebarOpen(true)}
            title="Show Properties & Notes (])"
            aria-label="Show Properties & Notes"
          >
            <span className="expand-tab-text">Properties</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

function AppRoot() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#030712', color: '#94A3B8' }}>
        <div className="login-spinner" style={{ width: '32px', height: '32px', borderWidth: '3px' }} />
      </div>
    );
  }

  // If user is not logged in, show the separate Login Page
  if (!user) {
    return <LoginPage />;
  }

  // After login, show the main page workspace!
  return (
    <>
      <EditorShell />
      <AdminDashboardModal />
    </>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AuthProvider>
        <AppRoot />
      </AuthProvider>
    </StoreProvider>
  );
}
