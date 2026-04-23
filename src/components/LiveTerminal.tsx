'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal, X, Minus } from 'lucide-react';
import { useFlowStore } from '@/store/flowStore';

const LEVEL_COLOR = {
  info:    '#4ade80',
  success: '#34d399',
  error:   '#f87171',
  warn:    '#fbbf24',
  docker:  '#38bdf8',
} as const;

const LEVEL_ICON = {
  info:    '›',
  success: '✓',
  error:   '✗',
  warn:    '⚠',
  docker:  '⬡',
} as const;

const MIN_H = 80;
const MAX_H = 500;
const DEFAULT_H = 180;

export default function LiveTerminal() {
  const logs    = useFlowStore(s => s.logs);
  const bodyRef = useRef<HTMLDivElement>(null);

  const [height,   setHeight]   = useState(DEFAULT_H);
  const [collapsed, setCollapsed] = useState(false);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  // Auto-scroll on new logs (only when not collapsed)
  useEffect(() => {
    if (!collapsed && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [logs, collapsed]);

  // ── Resize drag ───────────────────────────────────────────────────────────
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startY: e.clientY, startH: height };

    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta  = dragRef.current.startY - ev.clientY; // drag up = taller
      const newH   = Math.min(MAX_H, Math.max(MIN_H, dragRef.current.startH + delta));
      setHeight(newH);
      if (newH > MIN_H) setCollapsed(false);
    };

    const onUp = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };

    document.body.style.cursor = 'ns-resize';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [height]);

  return (
    <div
      className={`live-terminal ${collapsed ? 'collapsed' : ''}`}
      style={{ height: collapsed ? 32 : height }}
    >
      {/* ── Resize handle ── */}
      <div
        className="terminal-resize-handle"
        onMouseDown={onResizeMouseDown}
        title="Drag to resize"
      />

      {/* ── Header ── */}
      <div className="terminal-header">
        <div className="terminal-header-left">
          <Terminal size={11} />
          <span className="terminal-title">LIVE TRACE TERMINAL</span>
          <span className="terminal-dot" />
          <span className="terminal-count">{logs.length} events</span>
        </div>
        <div className="terminal-header-right">
          <button
            className="terminal-btn"
            onClick={() => setCollapsed(v => !v)}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <Minus size={10} />
          </button>
          <button
            className="terminal-btn"
            onClick={() => useFlowStore.setState({ logs: [] })}
            title="Clear logs"
          >
            <X size={10} />
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      {!collapsed && (
        <div className="terminal-body" ref={bodyRef}>
          {logs.length === 0 && (
            <div className="terminal-empty">Waiting for events...</div>
          )}
          {logs.map(line => (
            <div key={line.id} className="terminal-line">
              <span className="terminal-ts">{line.ts}</span>
              <span
                className="terminal-level"
                style={{ color: LEVEL_COLOR[line.level] }}
              >
                {LEVEL_ICON[line.level]}
              </span>
              <span
                className="terminal-text"
                style={{ color: LEVEL_COLOR[line.level] }}
              >
                {line.text}
              </span>
            </div>
          ))}
          <div className="terminal-cursor">█</div>
        </div>
      )}
    </div>
  );
}
