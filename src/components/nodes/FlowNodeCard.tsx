'use client';

import { memo, useCallback } from 'react';
import { Handle, Position } from '@xyflow/react';
import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';
import { Zap, Brain, Database, Layers, Filter, Settings2 } from 'lucide-react';
import { useFlowStore, type PaletteNodeType } from '@/store/flowStore';
import { api } from '@/services/api';

// ── Config per palette type ───────────────────────────────────────────────────

const NODE_CONF: Record<PaletteNodeType, {
  Icon:  React.ElementType;
  color: string;
  label: string;
}> = {
  webhook:    { Icon: Zap,      color: '#6366f1', label: 'Webhook'   },
  'ai-parser':{ Icon: Brain,    color: '#ec4899', label: 'AI Parser' },
  postgres:   { Icon: Database, color: '#3b82f6', label: 'Postgres'  },
  redis:      { Icon: Layers,   color: '#f59e0b', label: 'Redis'     },
  filter:     { Icon: Filter,   color: '#10b981', label: 'Filter'    },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function avg(arr: number[]) {
  return arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
}

const STATUS_LABEL: Record<string, string> = {
  idle:       '○ idle',
  processing: '◉ processing',
  success:    '✓ done',
  warning:    '⚠ slow',
  error:      '✗ error',
};

// ── Component ─────────────────────────────────────────────────────────────────

interface FlowNodeCardProps {
  id:   string;
  data: Record<string, unknown>;
}

function FlowNodeCard({ id, data }: FlowNodeCardProps) {
  const paletteType  = data.paletteType as PaletteNodeType;
  const label        = data.label as string;

  const telemetry    = useFlowStore(s => s.nodeTelemetry[id]);
  const setSelected  = useFlowStore(s => s.setSelectedNodeId);
  const openInspector = useFlowStore(s => s.openInspector);
  const setOptimistic = useFlowStore(s => s.setOptimisticFire);
  const nodes        = useFlowStore(s => s.nodes);
  const edges        = useFlowStore(s => s.edges);

  const status         = telemetry?.status         ?? 'idle';
  const heatState      = telemetry?.heatState      ?? 'normal';
  const latencyHistory = telemetry?.latencyHistory  ?? [];
  const chartData      = latencyHistory.map((v, i) => ({ i, v }));

  const { Icon, color } = NODE_CONF[paletteType] ?? NODE_CONF.webhook;

  // Sparkline colour driven by heat state
  const lineColor = heatState === 'critical' ? '#ef4444'
    : heatState === 'warning'  ? '#f59e0b'
    : '#10b981';

  const handleFireTest = useCallback(async () => {
    setOptimistic();
    const graph = {
      nodes: nodes.map(n => ({ id: n.id, type: n.data.paletteType, label: n.data.label })),
      edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
    };
    try {
      await api.triggerWebhook({
        event:   'test.trigger',
        source:  'quick-fire',
        _graph:  graph,
      });
    } catch (err) {
      console.error('[FlowNodeCard] quick-fire failed:', err);
    }
  }, [setOptimistic, nodes, edges]);

  return (
    <div
      className={`flow-node-card type-${paletteType} status-${status} heat-${heatState}`}
      style={{ '--node-color': color } as React.CSSProperties}
    >
      {/* Target handle (left) */}
      <Handle
        type="target"
        position={Position.Left}
        className="flow-handle"
      />

      {/* ── Header ── */}
      <div className="flow-node-header">
        <div className="flow-node-icon" style={{ background: `${color}22`, borderColor: `${color}55` }}>
          <Icon size={14} style={{ color }} />
        </div>
        <div className="flow-node-title">
          <span className="flow-node-name">{label}</span>
          <span className="flow-node-badge">{NODE_CONF[paletteType]?.label ?? paletteType}</span>
        </div>
        <div className="flow-node-actions">
          <div className={`flow-status-dot s-${status}`} title={STATUS_LABEL[status]} />
          <button
            className="flow-settings-btn"
            onClick={(e) => { e.stopPropagation(); setSelected(id); openInspector(id); }}
            title="Inspect node"
          >
            <Settings2 size={11} />
          </button>
        </div>
      </div>

      {/* ── Display text ── */}
      {telemetry?.lastDisplay && (
        <div className="flow-node-display">{telemetry.lastDisplay}</div>
      )}

      {/* ── Sparkline ── */}
      <div className="flow-node-sparkline">
        {chartData.length > 1 ? (
          <ResponsiveContainer width="100%" height={38}>
            <LineChart data={chartData} margin={{ top: 2, right: 4, bottom: 2, left: 4 }}>
              <Line
                type="monotone"
                dataKey="v"
                stroke={lineColor}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
              <Tooltip
                contentStyle={{
                  background: '#0e0e14',
                  border: '1px solid rgba(255,255,255,0.08)',
                  fontSize: 10,
                  padding: '2px 8px',
                  borderRadius: 4,
                }}
                formatter={(v) => [`${v}ms`, 'latency']}
                labelFormatter={() => ''}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flow-sparkline-empty">No data yet</div>
        )}
      </div>

      {/* ── Stats row ── */}
      <div className="flow-node-stats">
        <div className="flow-stat">
          <span className="flow-stat-label">Hits</span>
          <span className="flow-stat-value">{telemetry?.hitCount ?? 0}</span>
        </div>
        <div className="flow-stat">
          <span className="flow-stat-label">Avg</span>
          <span className="flow-stat-value">{avg(latencyHistory)}<span className="flow-stat-unit">ms</span></span>
        </div>
        <div className="flow-stat">
          <span className="flow-stat-label">Err</span>
          <span
            className="flow-stat-value"
            style={{ color: (telemetry?.errorCount ?? 0) > 0 ? '#ef4444' : undefined }}
          >
            {telemetry?.errorCount ?? 0}
          </span>
        </div>
      </div>

      {/* ── Webhook-only: Quick Fire button ── */}
      {paletteType === 'webhook' && (
        <button className="flow-fire-btn" onClick={handleFireTest}>
          ⚡ Quick Fire
        </button>
      )}

      {/* Source handle (right) */}
      <Handle
        type="source"
        position={Position.Right}
        className="flow-handle"
      />
    </div>
  );
}

export default memo(FlowNodeCard);
