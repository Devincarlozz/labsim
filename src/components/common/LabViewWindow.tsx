import React, { useRef, useState, useEffect } from 'react';

interface LabViewWindowProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  defaultPosition?: { x: number; y: number };
  width?: number | string;
  height?: number | string;
  zIndex?: number;
  isFocused?: boolean;
  onFocus?: () => void;
  icon?: React.ReactNode;
  windowClass?: string;
  children: React.ReactNode;
}

export function LabViewWindow({
  title,
  isOpen,
  onClose,
  defaultPosition = { x: 80, y: 80 },
  width = 560,
  height = 'auto',
  zIndex = 100,
  isFocused = false,
  onFocus,
  icon,
  windowClass,
  children,
}: LabViewWindowProps) {
  const [position, setPosition] = useState(defaultPosition);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [size, setSize] = useState<{ width: number | string; height: number | string }>({
    width,
    height,
  });

  const dragStart = useRef({ mouseX: 0, mouseY: 0, winX: defaultPosition.x, winY: defaultPosition.y });
  const resizeStart = useRef({ mouseX: 0, mouseY: 0, startW: 0, startH: 0 });

  // Update position if defaultPosition changes
  useEffect(() => {
    setPosition(defaultPosition);
  }, [defaultPosition.x, defaultPosition.y]);

  // Update width/height if props change
  useEffect(() => {
    setSize({ width, height });
  }, [width, height]);

  const handleTitleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).tagName === 'BUTTON') return;
    setIsDragging(true);
    dragStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      winX: position.x,
      winY: position.y,
    };
    if (onFocus) onFocus();
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsResizing(true);
    const winElem = (e.currentTarget.parentElement) as HTMLElement;
    resizeStart.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startW: winElem ? winElem.offsetWidth : (typeof size.width === 'number' ? size.width : 560),
      startH: winElem ? winElem.offsetHeight : 400,
    };
    if (onFocus) onFocus();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - dragStart.current.mouseX;
        const dy = e.clientY - dragStart.current.mouseY;
        setPosition({
          x: Math.max(0, dragStart.current.winX + dx),
          y: Math.max(0, dragStart.current.winY + dy),
        });
      } else if (isResizing) {
        const dx = e.clientX - resizeStart.current.mouseX;
        const dy = e.clientY - resizeStart.current.mouseY;
        setSize({
          width: Math.max(340, resizeStart.current.startW + dx),
          height: Math.max(180, resizeStart.current.startH + dy),
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, isResizing]);

  if (!isOpen) return null;

  return (
    <div
      className={`labview-window ${isMinimized ? 'minimized' : ''} ${isFocused ? 'focused-window' : ''} ${windowClass || ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        width: typeof size.width === 'number' ? `${size.width}px` : size.width,
        height: isMinimized ? 'auto' : (typeof size.height === 'number' ? `${size.height}px` : size.height),
        zIndex,
      }}
      onMouseDown={onFocus}
    >
      {/* Title Bar */}
      <div className="labview-titlebar" onMouseDown={handleTitleMouseDown}>
        <div className="labview-title-content">
          {icon ? (
            icon
          ) : (
            <svg className="labview-title-arrow" width="12" height="12" viewBox="0 0 24 24" fill="#EAB308">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          )}
          <span className="labview-title-text">{title}</span>
        </div>
        <div className="labview-window-controls">
          <button
            className="win-btn win-min"
            onClick={() => setIsMinimized(!isMinimized)}
            title="Minimize"
            aria-label="Minimize"
          >
            _
          </button>
          <button
            className="win-btn win-max"
            onClick={() => {
              // Toggle size between default and expanded
              if (typeof size.width === 'number' && size.width > 500) {
                setSize({ width, height });
              } else {
                setSize({ width: 640, height: 520 });
              }
            }}
            title="Maximize"
            aria-label="Maximize"
          >
            □
          </button>
          <button
            className="win-btn win-close"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Window Body */}
      {!isMinimized && (
        <div className="labview-body">
          {children}
        </div>
      )}

      {/* Interactive Corner Resize Handle */}
      {!isMinimized && (
        <div
          className="labview-resize-grip"
          onMouseDown={handleResizeMouseDown}
          title="Drag to resize window"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <line x1="8" y1="2" x2="2" y2="8" stroke="#7F9DB9" strokeWidth="1.5" />
            <line x1="8" y1="5" x2="5" y2="8" stroke="#7F9DB9" strokeWidth="1.5" />
            <line x1="8" y1="8" x2="8" y2="8" stroke="#7F9DB9" strokeWidth="1.5" />
          </svg>
        </div>
      )}
    </div>
  );
}
