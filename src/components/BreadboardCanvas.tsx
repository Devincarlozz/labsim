import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useStore } from '../store/CircuitStore';
import { CanvasRenderer } from '../rendering/CanvasRenderer';
import { getContactAt, BOARD_WIDTH, BOARD_HEIGHT } from '../model/breadboard';
import { ContactId, ResistorComponent, CapacitorComponent, LEDComponent, ICComponent } from '../model/types';
import { solveCircuitPhysics } from '../simulation/circuitPhysics';

export function BreadboardCanvas() {
  const { state, dispatch } = useStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<CanvasRenderer | null>(null);
  const [hoveredContact, setHoveredContact] = useState<ContactId | null>(null);
  const [hoveredCompId, setHoveredCompId] = useState<string | null>(null);
  const [hoveredWireId, setHoveredWireId] = useState<string | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredPowerToggle, setHoveredPowerToggle] = useState(false);
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const lastPanPos = useRef({ x: 0, y: 0 });
  const isPanningRef = useRef(false);
  const isDraggingRef = useRef(false);
  const draggedCompIdRef = useRef<string | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const { breadboard, components, wires, editor, simulation } = state;

  // Robust function to center breadboard and DAQ module across all landscape displays
  const centerBreadboard = useCallback((customWidth?: number, customHeight?: number) => {
    const container = containerRef.current;
    const w = customWidth ?? container?.clientWidth ?? 0;
    const h = customHeight ?? container?.clientHeight ?? 0;
    if (w <= 0 || h <= 0) return;

    // Total content world bounds: board width (1002), height from DAQ top (y=-65) to board bottom (y=330)
    const TOTAL_CONTENT_W = BOARD_WIDTH + 32;
    const TOTAL_CONTENT_H = BOARD_HEIGHT + 85;

    // Allocate clearance for canvas edges, status bar, and toolbar
    const horizontalMargin = 32;
    const verticalMargin = 36;
    const availableW = Math.max(160, w - horizontalMargin);
    const availableH = Math.max(140, h - verticalMargin);

    const scaleX = availableW / TOTAL_CONTENT_W;
    const scaleY = availableH / TOTAL_CONTENT_H;
    // Scale smoothly so breadboard fits beautifully across all landscape window sizes
    const scale = Math.min(1.0, Math.max(0.35, Math.min(scaleX, scaleY)));

    const scaledWidth = BOARD_WIDTH * scale;

    // Center horizontally
    const offsetX = Math.max(12, (w - scaledWidth) / 2);

    // Center vertically taking DAQ module (y = -62) and breadboard into account
    const contentCenterY = 132;
    const idealOffsetY = (h / 2) - (contentCenterY * scale);
    const minTopClearance = 42;
    const offsetY = Math.max(minTopClearance + 65 * scale, idealOffsetY);

    dispatch({
      type: 'SET_VIEW',
      transform: {
        offsetX,
        offsetY,
        scale,
      },
    });
  }, [dispatch]);

  // Initialize renderer and observe sizing
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    rendererRef.current = new CanvasRenderer(canvas);
    
    const handleResize = () => {
      const container = containerRef.current;
      if (!container || !rendererRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      if (w > 0 && h > 0) {
        rendererRef.current.resize(w, h);
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    
    let hasCentered = false;
    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current && window.ResizeObserver) {
      resizeObserver = new ResizeObserver((entries) => {
        handleResize();
        for (const entry of entries) {
          const { width, height } = entry.contentRect;
          if (width > 0 && height > 0 && !hasCentered) {
            hasCentered = true;
            centerBreadboard(width, height);
          }
        }
      });
      resizeObserver.observe(containerRef.current);
    }
    
    // Initial centering if container is already sized
    if (containerRef.current && containerRef.current.clientWidth > 0 && containerRef.current.clientHeight > 0) {
      hasCentered = true;
      centerBreadboard(containerRef.current.clientWidth, containerRef.current.clientHeight);
    } else {
      // Re-check after slight layout delay to ensure DOM dimensions have settled
      const timer = setTimeout(() => {
        if (!hasCentered && containerRef.current && containerRef.current.clientWidth > 0) {
          hasCentered = true;
          centerBreadboard(containerRef.current.clientWidth, containerRef.current.clientHeight);
        }
      }, 50);
      return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', handleResize);
        if (resizeObserver) resizeObserver.disconnect();
      };
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [centerBreadboard]);

  // Render on state change or continuous loop while circuit is active
  useEffect(() => {
    let animId: number;
    const isCircuitActive = simulation.status === 'running' && (state.instruments.daq?.enabled !== false);

    const renderLoop = () => {
      try {
        if (rendererRef.current) {
          const active = simulation.status === 'running' && (state.instruments.daq?.enabled !== false);
          const phys = solveCircuitPhysics(state, performance.now() / 1000);
          rendererRef.current.render(
            breadboard,
            components,
            wires,
            editor.viewTransform,
            hoveredContact,
            editor.wireStart,
            mousePos,
            simulation.nodes,
            editor.selectedComponentId,
            state.instruments.daq,
            editor.mode === 'place' ? editor.placingComponent : null,
            active,
            phys,
          );
        }
      } catch (err) {
        console.error('Breadboard render error safely caught:', err);
      }
      if (isCircuitActive) {
        animId = requestAnimationFrame(renderLoop);
      }
    };

    animId = requestAnimationFrame(renderLoop);
    return () => cancelAnimationFrame(animId);
  }, [breadboard, components, wires, editor, hoveredContact, mousePos, simulation.nodes, simulation.status, state.instruments.daq, state]);

  // Global mouse listeners so dragging/panning is continuous even when mouse moves fast outside canvas
  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      if (isPanningRef.current) {
        const dx = e.clientX - lastPanPos.current.x;
        const dy = e.clientY - lastPanPos.current.y;
        lastPanPos.current = { x: e.clientX, y: e.clientY };
        dispatch({ type: 'PAN', dx, dy });
        return;
      }

      if (isDraggingRef.current && draggedCompIdRef.current) {
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const { offsetX, offsetY, scale } = editor.viewTransform;
        const canvasX = (screenX - offsetX) / scale;
        const canvasY = (screenY - offsetY) / scale;
        dispatch({
          type: 'MOVE_COMPONENT',
          id: draggedCompIdRef.current,
          position: {
            x: canvasX - dragOffsetRef.current.x,
            y: canvasY - dragOffsetRef.current.y,
          },
        });
      }
    };

    const handleGlobalMouseUp = () => {
      if (isPanningRef.current || isPanning) {
        isPanningRef.current = false;
        setIsPanning(false);
      }
      if (isDraggingRef.current || isDragging) {
        const compId = draggedCompIdRef.current;
        draggedCompIdRef.current = null;
        if (compId) {
          const comp = components.get(compId);
          if (comp) {
            dispatch({
              type: 'MOVE_COMPONENT',
              id: comp.id,
              position: comp.position,
              snap: true,
            });
          }
        }
        isDraggingRef.current = false;
        setIsDragging(false);
      }
    };

    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isPanning, isDragging, editor.viewTransform, components, dispatch]);

  // Convert screen coords to canvas coords
  const screenToCanvas = useCallback((screenX: number, screenY: number) => {
    const { offsetX, offsetY, scale } = editor.viewTransform;
    return {
      x: (screenX - offsetX) / scale,
      y: (screenY - offsetY) / scale,
    };
  }, [editor.viewTransform]);

  // DAQ Hardware Activation "ON" status (in sync with simulation and DAQ instrument)
  const daqOn = (state.instruments.daq?.enabled !== false) && (simulation.status === 'running');

  const handleToggleDaqPower = useCallback((e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const nextOn = !daqOn;
    dispatch({
      type: 'UPDATE_DAQ',
      settings: { enabled: nextOn },
    });
    if (nextOn) {
      dispatch({ type: 'RUN_SIMULATION' });
      window.dispatchEvent(new CustomEvent('daq-power-change', { detail: { enabled: true } }));
    } else {
      dispatch({ type: 'SET_SIMULATION_STATUS', status: 'paused' });
      window.dispatchEvent(new CustomEvent('daq-power-change', { detail: { enabled: false } }));
    }
  }, [daqOn, dispatch]);

  // ─── Mouse Handlers ───────────────────────────────────────────────────────

  // Throttle hover detection to once per animation frame
  const hoverRafRef = useRef<number>(0);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    setMousePos({ x: screenX, y: screenY });

    // Panning (moving the breadboard)
    if (isPanningRef.current || isPanning) {
      const dx = e.clientX - lastPanPos.current.x;
      const dy = e.clientY - lastPanPos.current.y;
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      dispatch({ type: 'PAN', dx, dy });
      return;
    }

    // Auto-pan when routing a wire near canvas edges to slide breadboard seamlessly
    if (editor.wireStart && !isPanningRef.current) {
      const edgeThreshold = 45;
      const panSpeed = 7;
      let panX = 0;
      let panY = 0;
      if (screenX < edgeThreshold) panX = panSpeed;
      else if (screenX > rect.width - edgeThreshold) panX = -panSpeed;
      if (screenY < edgeThreshold) panY = panSpeed;
      else if (screenY > rect.height - edgeThreshold) panY = -panSpeed;
      if (panX !== 0 || panY !== 0) {
        dispatch({ type: 'PAN', dx: panX, dy: panY });
      }
    }

    // Dragging component
    if ((isDraggingRef.current || isDragging) && draggedCompIdRef.current) {
      const canvasPos = screenToCanvas(screenX, screenY);
      dispatch({
        type: 'MOVE_COMPONENT',
        id: draggedCompIdRef.current,
        position: {
          x: canvasPos.x - dragOffsetRef.current.x,
          y: canvasPos.y - dragOffsetRef.current.y,
        },
      });
      return;
    }

    // Throttle hover detection to once per rAF
    cancelAnimationFrame(hoverRafRef.current);
    hoverRafRef.current = requestAnimationFrame(() => {
      const isDaqVisible = state.instruments.daq?.visible !== false;
      const canvasPos = screenToCanvas(screenX, screenY);
      const compId = rendererRef.current?.hitTestComponent(components, canvasPos.x, canvasPos.y) || null;
      const wireId = rendererRef.current?.hitTestWire(wires, breadboard, canvasPos.x, canvasPos.y) || null;
      const contact = getContactAt(breadboard, canvasPos.x, canvasPos.y, undefined, isDaqVisible);
      const overToggle = isDaqVisible && canvasPos.x >= 395 && canvasPos.x <= 580 && canvasPos.y >= -65 && canvasPos.y <= -38;

      setHoveredContact(contact?.id || null);
      setHoveredCompId(compId);
      setHoveredWireId(wireId);
      setHoveredPowerToggle(overToggle);
    });
  }, [isPanning, isDragging, breadboard, components, wires, screenToCanvas, dispatch, state.instruments.daq, editor.wireStart]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    // Right mouse button (2), Middle mouse button (1), or Alt+Left click: ALWAYS PAN THE WORKSPACE
    // Works in all modes and preserves wire routing!
    if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) {
      isPanningRef.current = true;
      setIsPanning(true);
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      e.preventDefault();
      return;
    }

    if (e.button !== 0) return;

    const canvasPos = screenToCanvas(screenX, screenY);
    const isDaqVisible = state.instruments.daq?.visible !== false;

    // 0. Click directly on DAQ Circuit Power Activation Toggle Switch (both buttons work in sync!)
    if (isDaqVisible && canvasPos.x >= 395 && canvasPos.x <= 580 && canvasPos.y >= -65 && canvasPos.y <= -38) {
      handleToggleDaqPower(e);
      return;
    }

    // Place mode
    if (editor.mode === 'place' && editor.placingComponent) {
      const contact = getContactAt(breadboard, canvasPos.x, canvasPos.y, undefined, isDaqVisible);
      dispatch({
        type: 'PLACE_COMPONENT',
        componentType: editor.placingComponent,
        position: contact ? { x: contact.position.x, y: contact.position.y } : canvasPos,
        contactId: contact?.id,
      });
      return;
    }

    // Wire mode
    if (editor.mode === 'wire') {
      const contact = getContactAt(breadboard, canvasPos.x, canvasPos.y, undefined, isDaqVisible);
      if (contact) {
        if (editor.wireStart) {
          if (editor.wireStart !== contact.id) {
            dispatch({ type: 'FINISH_WIRE', contactId: contact.id });
          } else {
            dispatch({ type: 'CANCEL_WIRE' });
          }
        } else {
          dispatch({ type: 'START_WIRE', contactId: contact.id });
        }
      } else {
        // Blank space clicked: PAN THE WORKSPACE!
        // Even if wireStart is active, user can freely drag/slide breadboard to reach the other end!
        isPanningRef.current = true;
        setIsPanning(true);
        lastPanPos.current = { x: e.clientX, y: e.clientY };
      }
      return;
    }

    // Move mode: drag component if clicked on a component, or move breadboard if clicked anywhere else
    if (editor.mode === 'move') {
      if (rendererRef.current) {
        const compId = rendererRef.current.hitTestComponent(components, canvasPos.x, canvasPos.y);
        if (compId) {
          const comp = components.get(compId);
          if (comp) {
            isDraggingRef.current = true;
            draggedCompIdRef.current = compId;
            const offset = {
              x: canvasPos.x - comp.position.x,
              y: canvasPos.y - comp.position.y,
            };
            dragOffsetRef.current = offset;
            setIsDragging(true);
            setDragOffset(offset);
          }
          dispatch({ type: 'SELECT_COMPONENT', id: compId });
          return;
        }
      }

      // Blank space on breadboard or canvas: move the breadboard!
      isPanningRef.current = true;
      setIsPanning(true);
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    // Select mode
    if (editor.mode === 'select') {
      if (rendererRef.current) {
        // 1. Check wire hit anywhere along the Manhattan wire route (touching anywhere on wire)
        const wireId = rendererRef.current.hitTestWire(wires, breadboard, canvasPos.x, canvasPos.y);
        if (wireId) {
          dispatch({ type: 'SELECT_WIRE', id: wireId });
          return;
        }

        // 2. Check component hit (allows clicking and dragging ANY component on the breadboard)
        const compId = rendererRef.current.hitTestComponent(components, canvasPos.x, canvasPos.y);
        if (compId) {
          const comp = components.get(compId);
          if (comp) {
            isDraggingRef.current = true;
            draggedCompIdRef.current = compId;
            const offset = {
              x: canvasPos.x - comp.position.x,
              y: canvasPos.y - comp.position.y,
            };
            dragOffsetRef.current = offset;
            setIsDragging(true);
            setDragOffset(offset);
          }
          dispatch({ type: 'SELECT_COMPONENT', id: compId });
          return;
        }
      }

      // 3. Clicked on blank space or contact hole in select mode:
      // Deselect and allow panning (in select mode, wiring is disabled; use Wire mode for routing)
      dispatch({ type: 'SELECT_COMPONENT', id: null });
      dispatch({ type: 'SELECT_WIRE', id: null });
      isPanningRef.current = true;
      setIsPanning(true);
      lastPanPos.current = { x: e.clientX, y: e.clientY };
      return;
    }
  }, [editor, breadboard, components, wires, screenToCanvas, dispatch, state.instruments.daq]);

  const handleMouseUp = useCallback(() => {
    isPanningRef.current = false;
    setIsPanning(false);
    if (isDraggingRef.current || isDragging) {
      const compId = draggedCompIdRef.current;
      draggedCompIdRef.current = null;
      if (compId) {
        const comp = components.get(compId);
        if (comp) {
          dispatch({
            type: 'MOVE_COMPONENT',
            id: comp.id,
            position: comp.position,
            snap: true,
          });
        }
      }
      isDraggingRef.current = false;
      setIsDragging(false);
    }
  }, [isDragging, components, dispatch]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const delta = -e.deltaY * 0.001;
    dispatch({
      type: 'ZOOM',
      delta,
      center: { x: e.clientX - rect.left, y: e.clientY - rect.top },
    });
  }, [dispatch]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  // ─── Status bar info ──────────────────────────────────────────────────────

  const zoomPercent = Math.round(editor.viewTransform.scale * 100);
  const modeLabel = editor.mode === 'place'
    ? `Placing: ${editor.placingComponent}`
    : editor.mode === 'wire'
    ? (editor.wireStart ? 'Click end contact' : 'Click start contact')
    : editor.mode === 'move'
    ? 'Move Mode: Drag components or drag blank space to move breadboard'
    : 'Select Mode: Drag blank space to move breadboard';

  const getCursorStyle = () => {
    if (hoveredPowerToggle) return 'pointer';
    if (isPanning) return 'grabbing';
    if (isDragging) return 'grabbing';
    if (editor.mode === 'place') return 'copy';
    if (editor.mode === 'wire') return 'crosshair';
    if (editor.mode === 'move') {
      if (hoveredCompId) return 'move';
      return 'grab';
    }
    // Select mode: no wiring pointer! Touching/hovering wire shows pointer
    if (hoveredWireId) return 'pointer';
    if (hoveredCompId) return 'move';
    return 'grab';
  };

  // Compute live real-world physics probe data for hovering contacts or components
  const hoverPhysicsData = React.useMemo(() => {
    if (isPanning || isDragging) return null;
    const phys = solveCircuitPhysics(state, performance.now() / 1000);

    // 1. Hovered Component
    if (hoveredCompId) {
      const comp = components.get(hoveredCompId);
      if (!comp) return null;

      if (comp.type === 'resistor') {
        const r = phys.resistors.get(hoveredCompId);
        const resComp = comp as ResistorComponent;
        return {
          title: `Resistor (${resComp.resistance}${resComp.unit})`,
          badge: r ? `${(r.powerWatts * 1000).toFixed(1)} mW` : '0.0 mW',
          voltage: r ? `${r.voltageDrop.toFixed(3)} V drop` : '0.000 V',
          current: r ? `${r.currentMilliAmps.toFixed(2)} mA` : '0.00 mA',
          detail: `Ohm's Law: I = ΔV/R = ${r ? r.currentMilliAmps.toFixed(2) : '0.00'} mA | P = ${r ? (r.powerWatts * 1000).toFixed(1) : '0.0'} mW`,
        };
      }

      if (comp.type === 'capacitor') {
        const c = phys.capacitors.get(hoveredCompId);
        const capComp = comp as CapacitorComponent;
        return {
          title: `Capacitor (${capComp.capacitance}${capComp.unit})`,
          badge: c ? `τ=${(c.tauSeconds * 1000).toFixed(2)}ms` : '---',
          voltage: c ? `${c.voltage.toFixed(3)} V across terminals` : '0.000 V',
          current: c ? `${(c.currentAmps * 1000).toFixed(2)} mA transient` : undefined,
          detail: c ? `RC Cutoff Freq: ${c.cutoffFreqHz >= 1000 ? (c.cutoffFreqHz / 1000).toFixed(2) + ' kHz' : c.cutoffFreqHz.toFixed(1) + ' Hz'}` : undefined,
        };
      }

      if (comp.type === 'led') {
        const led = phys.leds.get(hoveredCompId);
        const ledComp = comp as LEDComponent;
        return {
          title: `${ledComp.color.toUpperCase()} LED (5mm Diode)`,
          badge: led?.isOvercurrent ? '⚠️ OVERCURRENT!' : led?.isIlluminated ? 'CONDUCTING' : 'OFF',
          voltage: led ? `Vf = ${led.forwardVoltage.toFixed(2)}V (Anode: ${led.anodeVoltage.toFixed(2)}V, Cath: ${led.cathodeVoltage.toFixed(2)}V)` : '0.000 V',
          current: led ? `${led.currentMilliAmps.toFixed(2)} mA forward current` : '0.00 mA',
          detail: led?.statusText,
        };
      }

      if (comp.type === 'ic') {
        const ic = phys.ics.get(hoveredCompId);
        const icComp = comp as ICComponent;
        return {
          title: `${icComp.icType} Logic IC (DIP-14)`,
          badge: ic?.isPowered ? '⚡ POWERED' : '❌ UNPOWERED',
          voltage: ic ? `VCC (Pin 14): ${ic.vccVoltage.toFixed(2)}V | GND (Pin 7): ${ic.gndVoltage.toFixed(2)}V` : '0.000 V',
          current: undefined,
          detail: ic?.isPowered ? 'Active logic gates evaluating inputs' : 'Requires Pin 14 to +5V and Pin 7 to GND to function',
        };
      }
    }

    // 2. Hovered DAQ / Breadboard Contact
    if (hoveredContact) {
      const node = phys.contactToNodeMap.get(hoveredContact);
      const isDaq = hoveredContact.startsWith('daq-');
      const isRail = hoveredContact.startsWith('r-');
      return {
        title: isDaq ? `myDAQ Terminal (${hoveredContact})` : isRail ? `Power Rail Contact (${hoveredContact})` : `Breadboard Contact (${hoveredContact})`,
        badge: node?.isGround ? 'GROUND (0V)' : (node?.waveformType !== 'open' ? node?.waveformType?.toUpperCase() || 'NET' : 'FLOATING'),
        voltage: node ? `${node.voltage >= 0 ? '+' : ''}${node.voltage.toFixed(3)} V` : '0.000 V',
        current: undefined,
        detail: node?.sourceDesc || 'Passive node (No power source connected)',
      };
    }

    return null;
  }, [hoveredCompId, hoveredContact, isPanning, isDragging, state, components]);

  return (
    <div
      ref={containerRef}
      className={`canvas-area mode-${editor.mode} ${isPanning ? 'panning' : ''}`}
    >
      {/* Dedicated Workspace DAQ Power Activation Button (Left Side) */}
      <div className="workspace-daq-power-wrapper">
        <button
          className={`workspace-daq-power-btn ${daqOn ? 'power-on' : 'power-off'}`}
          onClick={handleToggleDaqPower}
          title={daqOn ? "Turn NI myDAQ OFF (Connected to DAQ switch)" : "Turn NI myDAQ ON (Connected to DAQ switch)"}
          aria-label="Toggle DAQ Hardware Power"
        >
          <div className="daq-pwr-indicator-ring">
            <span className={`daq-pwr-led-core ${daqOn ? 'active' : ''}`} />
          </div>
          <div className="daq-pwr-meta">
            <span className="daq-pwr-badge">NI myDAQ</span>
            <span className="daq-pwr-status-text">{daqOn ? 'POWER ON' : 'POWER OFF'}</span>
          </div>
          <svg className="daq-pwr-toggle-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            <line x1="12" y1="2" x2="12" y2="12" />
          </svg>
        </button>
      </div>

      <canvas
        ref={canvasRef}
        style={{ cursor: getCursorStyle() }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          if (!isPanning && !isDragging) {
            setHoveredContact(null);
            setHoveredCompId(null);
            setHoveredWireId(null);
          }
        }}
        onWheel={handleWheel}
        onContextMenu={handleContextMenu}
      />

      {/* Status bar */}
      <div className="canvas-status-bar">
        <div className="canvas-status-item">
          <span>{modeLabel}</span>
        </div>
        <div className="canvas-status-item">
          Zoom: {zoomPercent}%
        </div>
        {hoveredContact && (
          <div className="canvas-status-item">
            Contact: {hoveredContact}
          </div>
        )}
        <div className="canvas-status-item" style={{ marginLeft: 'auto' }}>
          Components: {components.size} | Wires: {wires.size} | Holes: {breadboard.totalHoles}
        </div>
      </div>

      {/* Zoom controls */}
      <div className="canvas-zoom-controls">
        <button
          className="btn btn-icon"
          onClick={() => dispatch({ type: 'ZOOM', delta: 0.2, center: { x: 0, y: 0 } })}
          title="Zoom In"
        >
          +
        </button>
        <button
          className="btn btn-icon"
          onClick={() => dispatch({ type: 'ZOOM', delta: -0.2, center: { x: 0, y: 0 } })}
          title="Zoom Out"
        >
          −
        </button>
        <button
          className="btn btn-icon"
          onClick={() => centerBreadboard()}
          title="Reset View"
        >
          ⟲
        </button>
      </div>
    </div>
  );
}
