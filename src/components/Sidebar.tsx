'use client';

import { useEffect, type DragEvent } from 'react';
import { Zap, Brain, Database, Layers, Filter, Bot, ChevronRight, User, Clock, Inbox, GripVertical } from 'lucide-react';
import { useFlowStore, type PaletteNodeType } from '@/store/flowStore';

// ── Node palette definition ───────────────────────────────────────────────────

const PALETTE: {
  type:  PaletteNodeType;
  label: string;
  tag:   string;
  Icon:  React.ElementType;
  color: string;
}[] = [
  { type: 'webhook',    label: 'Webhook Trigger', tag: 'INPUT',  Icon: Zap,      color: '#6366f1' },
  { type: 'ai-parser', label: 'AI Parser',        tag: 'ACTION', Icon: Brain,    color: '#ec4899' },
  { type: 'postgres',  label: 'Postgres DB',      tag: 'OUTPUT', Icon: Database, color: '#3b82f6' },
  { type: 'redis',     label: 'Redis Cache',      tag: 'CACHE',  Icon: Layers,   color: '#f59e0b' },
  { type: 'filter',    label: 'Filter / Branch',  tag: 'LOGIC',  Icon: Filter,   color: '#10b981' },
  { type: 'local-llm', label: 'Local LLM',        tag: 'AI',     Icon: Bot,      color: '#a855f7' },
];

function PaletteItem({ type, label, tag, Icon, color }: typeof PALETTE[number]) {
  const onDragStart = (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('nodeType', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      className="palette-item"
      draggable
      onDragStart={onDragStart}
      title={`Drag onto canvas to add a ${label}`}
    >
      <div className="palette-item-icon" style={{ background: `${color}20`, borderColor: `${color}40` }}>
        <Icon size={13} style={{ color }} />
      </div>
      <div className="palette-item-info">
        <span className="palette-item-label">{label}</span>
        <span className="palette-item-tag">{tag}</span>
      </div>
      <GripVertical size={12} className="palette-drag-icon" />
    </div>
  );
}

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

export default function Sidebar() {
  const hits      = useFlowStore(s => s.hits);
  const fetchHits = useFlowStore(s => s.fetchHits);
  const nodes     = useFlowStore(s => s.nodes);
  const edges     = useFlowStore(s => s.edges);

  useEffect(() => { void fetchHits(1); }, [fetchHits]);

  const recent = hits.slice(0, 5);

  return (
    <aside className="sidebar">
      <div className="sidebar-content">

        {/* ── Node Palette ── */}
        <div className="sidebar-section">
          <h2 className="sidebar-heading">Node Palette</h2>
          <p className="sidebar-hint">Drag onto the canvas to add</p>
          <div className="palette-list">
            {PALETTE.map(item => <PaletteItem key={item.type} {...item} />)}
          </div>
        </div>

        {/* ── Graph stats ── */}
        <div className="sidebar-section">
          <h2 className="sidebar-heading">Current Graph</h2>
          <div className="graph-stats-row">
            <div className="graph-stat">
              <span className="graph-stat-value">{nodes.length}</span>
              <span className="graph-stat-label">Nodes</span>
            </div>
            <div className="graph-stat-divider" />
            <div className="graph-stat">
              <span className="graph-stat-value">{edges.length}</span>
              <span className="graph-stat-label">Edges</span>
            </div>
          </div>
        </div>

        {/* ── Recent activity ── */}
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <h2 className="sidebar-heading" style={{ marginBottom: 0 }}>Recent Activity</h2>
            <span className="sidebar-count">{recent.length}</span>
          </div>
          {recent.length === 0 ? (
            <div className="history-empty">
              <Inbox size={20} />
              <span>No hits yet</span>
              <span className="history-empty-sub">Fire a webhook to begin</span>
            </div>
          ) : (
            <div className="history-list">
              {recent.map(hit => (
                <div key={hit.id} className="history-item">
                  <div className="history-item-icon"><Database size={11} /></div>
                  <div className="history-item-body">
                    <span className="history-item-event">
                      {hit.event_name ?? 'unknown'}
                      {hit.is_replay && <span className="replay-tag-small">↩</span>}
                    </span>
                    <span className="history-item-id">#{hit.id}</span>
                  </div>
                  <div className="history-item-time">
                    <Clock size={9} />
                    <span>{relativeTime(hit.received_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {/* ── Footer ── */}
      <div className="sidebar-footer">
        <div className="user-card">
          <div className="user-avatar"><User size={17} /></div>
          <div className="user-info">
            <span className="user-name">Alex Rivera</span>
            <span className="user-plan">Pro Plan</span>
          </div>
          <ChevronRight size={14} className="user-chevron" />
        </div>
      </div>
    </aside>
  );
}
