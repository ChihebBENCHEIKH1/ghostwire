'use client';

import { useState, useEffect } from 'react';
import { X, SlidersHorizontal, Zap, Brain, Database, Layers, Filter, Bot } from 'lucide-react';
import { useFlowStore, type PaletteNodeType, type InspectorConfig } from '@/store/flowStore';
import { defaultInspector } from '@/lib/yaml-utils';
import { api } from '@/services/api';

const NODE_ICONS: Record<PaletteNodeType, React.ElementType> = {
  webhook:    Zap,
  'ai-parser': Brain,
  postgres:   Database,
  redis:      Layers,
  filter:     Filter,
  'local-llm': Bot,
};
const NODE_COLORS: Record<PaletteNodeType, string> = {
  webhook:    '#6366f1',
  'ai-parser':'#ec4899',
  postgres:   '#3b82f6',
  redis:      '#f59e0b',
  filter:     '#10b981',
  'local-llm':'#a855f7',
};

export default function InspectorPanel() {
  const inspectorNodeId    = useFlowStore(s => s.inspectorNodeId);
  const nodes              = useFlowStore(s => s.nodes);
  const inspectorConfigs   = useFlowStore(s => s.inspectorConfigs);
  const setInspectorConfig = useFlowStore(s => s.setInspectorConfig);
  const deploymentState    = useFlowStore(s => s.deploymentState);
  const setRightPanelVisible = useFlowStore(s => s.setRightPanelVisible);
  const setRightPanelTab   = useFlowStore(s => s.setRightPanelTab);

  const node = nodes.find(n => n.id === inspectorNodeId);
  const saved = inspectorNodeId ? (inspectorConfigs[inspectorNodeId] ?? defaultInspector()) : defaultInspector();

  const [local, setLocal] = useState<InspectorConfig>(saved);

  // Sync local form when node selection changes
  useEffect(() => {
    setLocal(inspectorNodeId ? (inspectorConfigs[inspectorNodeId] ?? defaultInspector()) : defaultInspector());
  }, [inspectorNodeId, inspectorConfigs]);

  const locked = deploymentState === 'deployed';

  const apply = () => {
    if (!inspectorNodeId) return;
    setInspectorConfig(inspectorNodeId, local);
    void api.updateNodeConfig(inspectorNodeId, local as unknown as import('@/services/api').NodeConfig);
  };

  if (!node) {
    return (
      <div className="right-panel inspector-panel">
        <div className="right-panel-header">
          <div className="right-panel-header-left">
            <SlidersHorizontal size={14} />
            <span>Inspector</span>
          </div>
          <button className="right-panel-close" onClick={() => setRightPanelVisible(false)}>
            <X size={13} />
          </button>
        </div>
        <div className="inspector-empty">
          <SlidersHorizontal size={28} opacity={0.3} />
          <p>Click any node to inspect</p>
        </div>
      </div>
    );
  }

  const paletteType = node.data.paletteType as PaletteNodeType;
  const Icon  = NODE_ICONS[paletteType]  ?? Zap;
  const color = NODE_COLORS[paletteType] ?? '#6366f1';

  return (
    <div className="right-panel inspector-panel">
      <div className="right-panel-header">
        <div className="right-panel-header-left">
          <SlidersHorizontal size={14} />
          <span>Inspector</span>
        </div>
        <button
          className="right-panel-close"
          onClick={() => { setRightPanelVisible(false); }}
        >
          <X size={13} />
        </button>
      </div>

      {locked && (
        <div className="yaml-deployed-banner">
          <span>🔒 Deployed — config locked</span>
        </div>
      )}

      {/* Node identity */}
      <div className="inspector-node-title">
        <div className="inspector-node-icon" style={{ background: `${color}22`, borderColor: `${color}55` }}>
          <Icon size={14} style={{ color }} />
        </div>
        <div>
          <div className="inspector-node-name">{node.data.label as string}</div>
          <div className="inspector-node-id">{node.id}</div>
        </div>
      </div>

      {/* ── Fields ── */}
      <div className="inspector-fields">

        {/* Timeout */}
        <label className="inspector-field">
          <span className="inspector-field-label">Timeout (ms)</span>
          <input
            type="number"
            className="inspector-input"
            min={100}
            max={60000}
            step={100}
            value={local.timeoutMs}
            disabled={locked}
            onChange={e => setLocal(p => ({ ...p, timeoutMs: Number(e.target.value) }))}
          />
          <span className="inspector-field-hint">Max duration before node is considered timed out</span>
        </label>

        {/* Max Retries */}
        <label className="inspector-field">
          <span className="inspector-field-label">Max Retries</span>
          <input
            type="number"
            className="inspector-input"
            min={0}
            max={10}
            step={1}
            value={local.maxRetries}
            disabled={locked}
            onChange={e => setLocal(p => ({ ...p, maxRetries: Number(e.target.value) }))}
          />
          <span className="inspector-field-hint">Number of retry attempts on failure (0 = no retry)</span>
        </label>

        {/* Backoff */}
        <label className="inspector-field">
          <span className="inspector-field-label">Backoff Strategy</span>
          <select
            className="inspector-select"
            value={local.backoff}
            disabled={locked}
            onChange={e => setLocal(p => ({ ...p, backoff: e.target.value as InspectorConfig['backoff'] }))}
          >
            <option value="none">None</option>
            <option value="linear">Linear</option>
            <option value="exponential">Exponential</option>
          </select>
          <span className="inspector-field-hint">Delay strategy between retries</span>
        </label>

        {/* Mock Error Rate */}
        <label className="inspector-field">
          <div className="inspector-field-row">
            <span className="inspector-field-label">Mock Error Rate</span>
            <span className="inspector-field-value" style={{ color: local.mockErrorRate > 0 ? '#ef4444' : '#10b981' }}>
              {local.mockErrorRate}%
            </span>
          </div>
          <input
            type="range"
            className="inspector-slider"
            min={0}
            max={100}
            step={1}
            value={local.mockErrorRate}
            disabled={locked}
            onChange={e => setLocal(p => ({ ...p, mockErrorRate: Number(e.target.value) }))}
          />
          <span className="inspector-field-hint">Probability of simulated failure (chaos testing)</span>
        </label>

        {/* System Prompt — only for local-llm nodes */}
        {paletteType === 'local-llm' && (
          <label className="inspector-field inspector-field--prompt">
            <span className="inspector-field-label">🤖 System Prompt</span>
            <textarea
              className="inspector-textarea"
              rows={4}
              placeholder="e.g. Extract the user's sentiment from this payload"
              value={local.systemPrompt ?? ''}
              disabled={locked}
              onChange={e => setLocal(p => ({ ...p, systemPrompt: e.target.value }))}
            />
            <span className="inspector-field-hint">Prompt sent to Ollama ({'{payload}'} is appended automatically)</span>
          </label>
        )}

        {/* Alert Threshold */}
        <label className="inspector-field inspector-field--alert">
          <span className="inspector-field-label">⚡ Alert Threshold</span>
          <input
            type="number"
            className="inspector-input"
            min={0}
            max={20}
            step={1}
            value={local.alertThreshold}
            disabled={locked}
            onChange={e => setLocal(p => ({ ...p, alertThreshold: Number(e.target.value) }))}
          />
          <span className="inspector-field-hint">
            {local.alertThreshold === 0
              ? 'Alerting disabled (0 = off)'
              : `Fire alert after ${local.alertThreshold} consecutive failure${local.alertThreshold !== 1 ? 's' : ''}`}
          </span>
        </label>

      </div>

      {!locked && (
        <div className="inspector-footer">
          <button
            className="inspector-reset-btn"
            onClick={() => setLocal(defaultInspector())}
          >
            Reset
          </button>
          <button className="inspector-apply-btn" onClick={apply}>
            Apply Changes
          </button>
        </div>
      )}

      {/* Back to YAML link */}
      <button
        className="inspector-yaml-link"
        onClick={() => setRightPanelTab('yaml')}
      >
        View YAML ↗
      </button>
    </div>
  );
}
