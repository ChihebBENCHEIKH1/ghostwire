import * as yaml from 'js-yaml';
import type { Node, Edge } from '@xyflow/react';
import type { InspectorConfig } from '@/services/api';

export type PaletteNodeType = 'webhook' | 'ai-parser' | 'postgres' | 'redis' | 'filter' | 'local-llm';

export interface NodeData extends Record<string, unknown> {
  paletteType: PaletteNodeType;
  label:       string;
}

export type FlowNode = Node<NodeData>;
export type FlowEdge = Edge;

export function defaultInspector(): InspectorConfig {
  return { timeoutMs: 5000, maxRetries: 0, backoff: 'none', mockErrorRate: 0, alertThreshold: 0 };
}

// ── Serialize canvas state → YAML string ─────────────────────────────────────
export function toYaml(
  nodes:            FlowNode[],
  edges:            FlowEdge[],
  inspectorConfigs: Record<string, InspectorConfig>,
  deploymentState:  'draft' | 'deployed',
): string {
  const doc = {
    version: '1.0',
    state:   deploymentState,
    nodes: nodes.map(n => ({
      id:       n.id,
      type:     n.data.paletteType,
      label:    n.data.label,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      inspector: {
        timeout_ms:      (inspectorConfigs[n.id] ?? defaultInspector()).timeoutMs,
        max_retries:     (inspectorConfigs[n.id] ?? defaultInspector()).maxRetries,
        backoff:         (inspectorConfigs[n.id] ?? defaultInspector()).backoff,
        mock_error_rate:  (inspectorConfigs[n.id] ?? defaultInspector()).mockErrorRate,
        alert_threshold:  (inspectorConfigs[n.id] ?? defaultInspector()).alertThreshold,
        ...(inspectorConfigs[n.id]?.systemPrompt !== undefined
          ? { system_prompt: inspectorConfigs[n.id]!.systemPrompt } : {}),
      },
    })),
    edges: edges.map(e => ({
      id:     e.id,
      source: e.source,
      target: e.target,
    })),
  };
  return (
    '# Visual API Builder — Pipeline Configuration\n' +
    '# Drag nodes on the canvas or edit YAML directly — both sync instantly.\n\n' +
    yaml.dump(doc, { indent: 2, lineWidth: 120, quotingType: '"' })
  );
}

// ── Parse YAML string → canvas state ─────────────────────────────────────────
export interface ParseResult {
  nodes:            FlowNode[];
  edges:            FlowEdge[];
  inspectorConfigs: Record<string, InspectorConfig>;
  deploymentState?: 'draft' | 'deployed';
  error?:           string;
}

interface RawDoc {
  version?: string;
  state?:   string;
  nodes?:   RawNode[];
  edges?:   RawEdge[];
}
interface RawNode {
  id: string; type: string; label?: string;
  position?: { x?: number; y?: number };
  inspector?: {
    timeout_ms?: number; max_retries?: number;
    backoff?: string;    mock_error_rate?: number; alert_threshold?: number; system_prompt?: string;
  };
}
interface RawEdge { id?: string; source: string; target: string; }

export function fromYaml(yamlStr: string): ParseResult {
  let doc: RawDoc;
  try {
    doc = yaml.load(yamlStr) as RawDoc;
  } catch (e) {
    return { nodes: [], edges: [], inspectorConfigs: {}, error: String(e) };
  }

  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.nodes)) {
    return { nodes: [], edges: [], inspectorConfigs: {}, error: 'Invalid structure: missing nodes array' };
  }

  const validTypes = new Set(['webhook', 'ai-parser', 'postgres', 'redis', 'filter', 'local-llm']);
  const nodes: FlowNode[] = [];
  const inspectorConfigs: Record<string, InspectorConfig> = {};

  for (const n of doc.nodes) {
    if (!n.id || !n.type) continue;
    const paletteType = validTypes.has(n.type) ? (n.type as PaletteNodeType) : 'webhook';
    nodes.push({
      id:       n.id,
      type:     'flowNode',
      position: { x: n.position?.x ?? 0, y: n.position?.y ?? 0 },
      data:     { paletteType, label: n.label ?? n.type },
    });
    if (n.inspector) {
      inspectorConfigs[n.id] = {
        timeoutMs:     n.inspector.timeout_ms     ?? 5000,
        maxRetries:    n.inspector.max_retries     ?? 0,
        backoff:       (['none','linear','exponential'].includes(n.inspector.backoff ?? '')
                         ? n.inspector.backoff as 'none'|'linear'|'exponential' : 'none'),
        mockErrorRate:  n.inspector.mock_error_rate  ?? 0,
        alertThreshold: n.inspector.alert_threshold ?? 0,
        ...(n.inspector.system_prompt !== undefined ? { systemPrompt: n.inspector.system_prompt } : {}),
      };
    }
  }

  const nodeIds  = new Set(nodes.map(n => n.id));
  const edges: FlowEdge[] = (doc.edges ?? [])
    .filter(e => e.source && e.target && nodeIds.has(e.source) && nodeIds.has(e.target))
    .map((e, i) => ({
      id:     e.id ?? `e-yaml-${i}`,
      source: e.source,
      target: e.target,
      type:   'particle',
    }));

  const deploymentState = doc.state === 'deployed' ? 'deployed' : 'draft';

  return { nodes, edges, inspectorConfigs, deploymentState };
}
