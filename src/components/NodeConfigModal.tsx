'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, Brain, Database, Layers, Filter, Save, Loader2 } from 'lucide-react';
import { useFlowStore, type NodeConfig, type PaletteNodeType } from '@/store/flowStore';

// ── Config metadata per palette type ─────────────────────────────────────────

const NODE_META: Record<PaletteNodeType, {
  Icon:   React.ElementType;
  label:  string;
  color:  string;
  fields: {
    key:          string;
    label:        string;
    type:         'text' | 'select' | 'textarea' | 'toggle';
    options?:     string[];
    placeholder?: string;
  }[];
}> = {
  webhook: {
    Icon: Zap, label: 'Webhook Trigger', color: 'indigo',
    fields: [
      { key: 'method',      label: 'HTTP Method', type: 'select', options: ['POST', 'PUT', 'PATCH'] },
      { key: 'path',        label: 'Route Path',  type: 'text',   placeholder: '/api/webhook' },
      { key: 'description', label: 'Description', type: 'text',   placeholder: 'Describe this trigger...' },
    ],
  },
  'ai-parser': {
    Icon: Brain, label: 'AI Parser', color: 'pink',
    fields: [
      { key: 'model',       label: 'Model',            type: 'select', options: ['claude-3-5-haiku', 'claude-sonnet-4-6', 'gpt-4o'] },
      { key: 'systemPrompt',label: 'System Prompt',    type: 'textarea', placeholder: 'You are a data extractor...' },
      { key: 'outputSchema',label: 'Output Schema',    type: 'textarea', placeholder: '{ "field": "string" }' },
      { key: 'description', label: 'Description',      type: 'text',   placeholder: 'Describe parsing logic...' },
    ],
  },
  postgres: {
    Icon: Database, label: 'Postgres DB', color: 'blue',
    fields: [
      { key: 'tableName',   label: 'Table Name',  type: 'text',   placeholder: 'hits' },
      { key: 'autoCommit',  label: 'Auto-Commit', type: 'toggle' },
      { key: 'sslEnabled',  label: 'SSL Enabled', type: 'toggle' },
      { key: 'description', label: 'Description', type: 'text',   placeholder: 'Describe storage behavior...' },
    ],
  },
  redis: {
    Icon: Layers, label: 'Redis Cache', color: 'amber',
    fields: [
      { key: 'keyPattern',  label: 'Key Pattern', type: 'text',   placeholder: 'user:{id}:profile' },
      { key: 'ttl',         label: 'TTL (seconds)', type: 'text', placeholder: '3600' },
      { key: 'strategy',    label: 'Strategy',    type: 'select', options: ['cache-aside', 'write-through', 'write-back'] },
      { key: 'description', label: 'Description', type: 'text',   placeholder: 'Describe caching strategy...' },
    ],
  },
  filter: {
    Icon: Filter, label: 'Filter / Branch', color: 'emerald',
    fields: [
      { key: 'condition',   label: 'Condition',      type: 'text',     placeholder: 'payload.event === "order.created"' },
      { key: 'trueBranch',  label: 'True → Node',    type: 'text',     placeholder: 'postgres-1' },
      { key: 'falseBranch', label: 'False → Node',   type: 'text',     placeholder: 'redis-1' },
      { key: 'description', label: 'Description',    type: 'textarea', placeholder: 'Describe routing logic...' },
    ],
  },
};

// ── Modal ─────────────────────────────────────────────────────────────────────

export default function NodeConfigModal() {
  const selectedNodeId    = useFlowStore(s => s.selectedNodeId);
  const nodeConfigs       = useFlowStore(s => s.nodeConfigs);
  const nodes             = useFlowStore(s => s.nodes);
  const setSelectedNodeId = useFlowStore(s => s.setSelectedNodeId);
  const updateNodeConfig  = useFlowStore(s => s.updateNodeConfig);

  const [draft,  setDraft]  = useState<NodeConfig>({});
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);

  // Resolve palette type from the node's data
  const selectedNode   = nodes.find(n => n.id === selectedNodeId);
  const paletteType    = selectedNode?.data.paletteType;
  const meta           = paletteType ? NODE_META[paletteType] : null;
  const stored         = selectedNodeId ? (nodeConfigs[selectedNodeId] ?? {}) : {};

  useEffect(() => {
    if (selectedNodeId) setDraft(stored ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNodeId]);

  const handleSave = async () => {
    if (!selectedNodeId) return;
    setSaving(true);
    await updateNodeConfig(selectedNodeId, draft);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  return (
    <AnimatePresence>
      {selectedNodeId && meta && (
        <>
          <motion.div
            key="backdrop"
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setSelectedNodeId(null)}
          />

          <motion.div
            key="modal"
            className={`node-config-modal ${meta.color}`}
            initial={{ opacity: 0, x: 40, scale: 0.97 }}
            animate={{ opacity: 1, x: 0,  scale: 1    }}
            exit={{ opacity: 0, x: 40, scale: 0.97    }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            {/* Header */}
            <div className="modal-header">
              <div className="modal-header-left">
                <div className={`modal-node-icon ${meta.color}`}>
                  <meta.Icon size={16} />
                </div>
                <div>
                  <h2 className="modal-title">Configure Node</h2>
                  <p className="modal-subtitle">{selectedNode?.data.label ?? meta.label}</p>
                </div>
              </div>
              <button className="modal-close" onClick={() => setSelectedNodeId(null)}>
                <X size={15} />
              </button>
            </div>

            {/* Fields */}
            <div className="modal-body">
              {meta.fields.map(field => {
                const val = draft[field.key];

                if (field.type === 'toggle') {
                  return (
                    <div key={field.key} className="modal-field">
                      <div className="modal-field-toggle-row">
                        <label className="modal-field-label">{field.label}</label>
                        <button
                          className={`modal-toggle ${val !== false ? 'on' : ''}`}
                          onClick={() => setDraft(d => ({ ...d, [field.key]: !val }))}
                        >
                          <span className="modal-toggle-thumb" />
                        </button>
                      </div>
                    </div>
                  );
                }

                if (field.type === 'select') {
                  return (
                    <div key={field.key} className="modal-field">
                      <label className="modal-field-label">{field.label}</label>
                      <select
                        className="modal-select"
                        value={(val as string) ?? field.options?.[0]}
                        onChange={e => setDraft(d => ({ ...d, [field.key]: e.target.value }))}
                      >
                        {field.options?.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </div>
                  );
                }

                if (field.type === 'textarea') {
                  return (
                    <div key={field.key} className="modal-field">
                      <label className="modal-field-label">{field.label}</label>
                      <textarea
                        className="modal-textarea"
                        value={(val as string) ?? ''}
                        placeholder={field.placeholder}
                        onChange={e => setDraft(d => ({ ...d, [field.key]: e.target.value }))}
                        rows={3}
                      />
                    </div>
                  );
                }

                return (
                  <div key={field.key} className="modal-field">
                    <label className="modal-field-label">{field.label}</label>
                    <input
                      className="modal-input"
                      type="text"
                      value={(val as string) ?? ''}
                      placeholder={field.placeholder}
                      onChange={e => setDraft(d => ({ ...d, [field.key]: e.target.value }))}
                    />
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="modal-footer">
              <button className="modal-btn-cancel" onClick={() => setSelectedNodeId(null)}>
                Cancel
              </button>
              <button
                className={`modal-btn-save ${meta.color} ${saved ? 'saved' : ''}`}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? <Loader2 size={13} className="spin" /> : <Save size={13} />}
                {saved ? '✓ Saved' : 'Save Config'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
