'use client';

import { useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  ReactFlowProvider,
  useReactFlow,
} from '@xyflow/react';
import type { DragEvent } from 'react';
import '@xyflow/react/dist/style.css';
import { useFlowStore, type PaletteNodeType } from '@/store/flowStore';
import { api } from '@/services/api';
import FlowNodeCard       from './nodes/FlowNodeCard';
import { ParticleEdge }  from './edges/ParticleEdge';

const nodeTypes = { flowNode: FlowNodeCard } as const;
const edgeTypes = { particle: ParticleEdge } as const;

// ── Inner canvas — must live inside ReactFlowProvider to use useReactFlow ────

function CanvasInner() {
  const rf = useReactFlow();

  const nodes          = useFlowStore(s => s.nodes);
  const edges          = useFlowStore(s => s.edges);
  const onNodesChange  = useFlowStore(s => s.onNodesChange);
  const onEdgesChange  = useFlowStore(s => s.onEdgesChange);
  const onConnect      = useFlowStore(s => s.onConnect);
  const addFlowNode    = useFlowStore(s => s.addFlowNode);
  const isStressTesting  = useFlowStore(s => s.isStressTesting);
  const stressProgress   = useFlowStore(s => s.stressProgress);
  const setOptimistic    = useFlowStore(s => s.setOptimisticFire);
  const deploymentState  = useFlowStore(s => s.deploymentState);
  const inspectorConfigs = useFlowStore(s => s.inspectorConfigs);

  // ── Drag-over: allow drop ────────────────────────────────────────────────
  const onDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  // ── Drop: place new node at cursor position ──────────────────────────────
  const onDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const paletteType = e.dataTransfer.getData('nodeType') as PaletteNodeType;
      if (!paletteType) return;
      const position = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addFlowNode(paletteType, position);
    },
    [rf, addFlowNode],
  );

  // ── Quick fire (from canvas-level toolbar button) ────────────────────────
  const handleQuickFire = async () => {
    setOptimistic();
    const graph = {
      nodes: nodes.map(n => ({ id: n.id, type: n.data.paletteType, label: n.data.label, inspector: inspectorConfigs[n.id] })),
      edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
    };
    try {
      await api.triggerWebhook({
        event:  'test.trigger',
        source: 'canvas-toolbar',
        _graph: graph,
      });
    } catch (err) {
      console.error('[Canvas] quick fire failed:', err);
    }
  };

  // ── Stress test ──────────────────────────────────────────────────────────
  const handleStressTest = async () => {
    if (isStressTesting) return;
    const graph = {
      nodes: nodes.map(n => ({ id: n.id, type: n.data.paletteType, label: n.data.label, inspector: inspectorConfigs[n.id] })),
      edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
    };
    try {
      await api.stressTest(50, graph);
    } catch (err) {
      console.error('[Canvas] stress test failed:', err);
    }
  };

  const stressPct = stressProgress
    ? Math.round((stressProgress.completed / stressProgress.total) * 100)
    : 0;

  return (
    <div className="canvas-rf-wrap" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.2}
        maxZoom={2.5}
        defaultEdgeOptions={{ type: 'particle' }}
        deleteKeyCode={deploymentState === 'deployed' ? null : 'Delete'}
        nodesDraggable={deploymentState !== 'deployed'}
        nodesConnectable={deploymentState !== 'deployed'}
        elementsSelectable={deploymentState !== 'deployed'}
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={'dots' as never}
          gap={20}
          size={1}
          color="rgba(255,255,255,0.05)"
          style={{ background: 'var(--bg-main)' }}
        />
        <Controls className="rf-controls" />
        <MiniMap
          className="rf-minimap"
          nodeColor={(node) => {
            const MAP: Record<string, string> = {
              webhook:    '#6366f1',
              'ai-parser':'#ec4899',
              postgres:   '#3b82f6',
              redis:      '#f59e0b',
              filter:     '#10b981',
            };
            return MAP[node.data?.paletteType as string] ?? '#374151';
          }}
          maskColor="rgba(5,5,8,0.85)"
        />
      </ReactFlow>

      {/* ── Canvas toolbar ── */}
      <div className="canvas-toolbar-float">
        <button
          className="canvas-fire-btn"
          onClick={handleQuickFire}
          title="Fire one test payload through the graph"
        >
          ⚡ Fire
        </button>

        <div className="canvas-toolbar-sep" />

        <button
          className={`stress-test-btn ${isStressTesting ? 'active' : ''}`}
          onClick={handleStressTest}
          disabled={isStressTesting}
          title="Fire 50 concurrent payloads — watch the canvas under load"
        >
          <span className="stress-btn-dot" />
          {isStressTesting
            ? `STRESS ${stressPct}%`
            : 'STRESS TEST'}
        </button>
      </div>

      {/* ── Stress progress bar ── */}
      {isStressTesting && stressProgress && (
        <div className="stress-progress-bar">
          <div
            className="stress-progress-fill"
            style={{ width: `${stressPct}%` }}
          />
          <span className="stress-progress-label">
            {stressProgress.completed} / {stressProgress.total} payloads
          </span>
        </div>
      )}

      {/* ── Deployed lock overlay ── */}
      {deploymentState === 'deployed' && (
        <div className="canvas-locked-overlay">
          <span className="canvas-locked-badge">🔒 Deployed — canvas locked</span>
        </div>
      )}

      {/* ── Drop hint overlay (shown when dragging over canvas) ── */}
      <div className="canvas-drop-hint">
        <span>Drop node here</span>
      </div>
    </div>
  );
}

// ── Exported component — wraps CanvasInner in provider ───────────────────────

export default function Canvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
