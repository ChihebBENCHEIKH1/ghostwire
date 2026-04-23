import { create } from 'zustand';
import {
  applyNodeChanges, applyEdgeChanges, addEdge,
  type Node, type Edge, type NodeChange, type EdgeChange, type Connection,
} from '@xyflow/react';
import { api, type Analytics, type Hit, type NodeConfig, type InspectorConfig, type DeploymentSchema } from '@/services/api';
import { toYaml, fromYaml, defaultInspector } from '@/lib/yaml-utils';

export type PaletteNodeType = 'webhook' | 'ai-parser' | 'postgres' | 'redis' | 'filter' | 'local-llm';
export type NodeStatus      = 'idle' | 'processing' | 'success' | 'warning' | 'error';
export type HeatState       = 'normal' | 'warning' | 'critical';
export type ConnectionState = 'connected' | 'disconnected' | 'connecting';
export type DeploymentState = 'draft' | 'deployed';
export type RightPanelTab   = 'yaml' | 'inspector';

export interface NodeData extends Record<string, unknown> {
  paletteType: PaletteNodeType;
  label:       string;
}
export type FlowNode = Node<NodeData>;
export type FlowEdge = Edge;

export interface NodeTelemetry {
  status: NodeStatus; heatState: HeatState; latencyHistory: number[];
  hitCount: number; errorCount: number; lastDisplay: string;
}
export interface GlobalMetrics { rps: number; p99Latency: number; errorRate: number; }
export interface LogLine { id: number; ts: string; level: 'info'|'success'|'error'|'warn'|'docker'; text: string; }
export type { Analytics, Hit, NodeConfig, InspectorConfig };

let nodeIdSeq = 10, logSeq = 0;

const INIT_NODES: FlowNode[] = [
  { id: 'webhook-1',   type: 'flowNode', position: { x: 60,  y: 100 }, data: { paletteType: 'webhook',   label: 'Webhook Trigger' } },
  { id: 'ai-parser-1', type: 'flowNode', position: { x: 440, y: 100 }, data: { paletteType: 'ai-parser',  label: 'AI Parser'       } },
  { id: 'postgres-1',  type: 'flowNode', position: { x: 820, y: 100 }, data: { paletteType: 'postgres',   label: 'Postgres DB'     } },
];
const INIT_EDGES: FlowEdge[] = [
  { id: 'e-1', source: 'webhook-1',   target: 'ai-parser-1', type: 'particle' },
  { id: 'e-2', source: 'ai-parser-1', target: 'postgres-1',  type: 'particle' },
];

function emptyTelemetry(): NodeTelemetry {
  return { status:'idle', heatState:'normal', latencyHistory:[], hitCount:0, errorCount:0, lastDisplay:'' };
}
function computeMetrics(et: number[], rl: number[], a: Analytics|null): GlobalMetrics {
  const now = Date.now();
  const rps = et.filter(t => now - t < 1000).length;
  const s = [...rl].sort((a,b)=>a-b);
  return { rps, p99Latency: s[Math.floor(s.length*0.99)]??0, errorRate: a ? Math.max(0,100-(a.successRate??100)) : 0 };
}

interface FlowState {
  nodes: FlowNode[]; edges: FlowEdge[];
  onNodesChange: (c: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (c: EdgeChange<FlowEdge>[]) => void;
  onConnect:     (c: Connection) => void;
  addFlowNode:   (t: PaletteNodeType, pos: {x:number;y:number}) => void;
  nodeTelemetry:    Record<string, NodeTelemetry>;
  activeEdgeIds:    string[];
  inspectorConfigs: Record<string, InspectorConfig>;
  setInspectorConfig: (nodeId: string, cfg: Partial<InspectorConfig>) => void;
  yamlDirty: boolean; setYamlDirty: (v: boolean) => void;
  deploymentState:  DeploymentState; deploymentId: number|null; deploymentSaving: boolean;
  enterDraft:       () => void;
  saveDraftAction:  () => Promise<void>;
  deployPipeline:   () => Promise<void>;
  loadActiveDeployment: () => Promise<void>;
  rightPanelVisible: boolean; rightPanelTab: RightPanelTab; inspectorNodeId: string|null;
  setRightPanelVisible: (v: boolean) => void;
  setRightPanelTab:     (t: RightPanelTab) => void;
  setInspectorNodeId:   (id: string|null) => void;
  openInspector:        (nodeId: string) => void;
  globalMetrics: GlobalMetrics; recentLatencies: number[]; eventTimestamps: number[];
  isStressTesting: boolean; stressProgress: {completed:number;total:number}|null;
  logs: LogLine[];
  connectionState: ConnectionState; activeConns: number;
  analytics: Analytics|null; hits: Hit[]; hitsTotal: number; hitsPage: number; hitsLoading: boolean;
  selectedNodeId: string|null; nodeConfigs: Record<string,NodeConfig|null>; replayingId: number|null;
  addLog: (l: LogLine['level'], t: string) => void;
  activateNode: (id: string, d?: string) => void;
  completeNode: (id: string, ms: number, eids?: string[], d?: string) => void;
  failNode:     (id: string, e: string) => void;
  deactivateEdge: (id: string) => void;
  setOptimisticFire: () => void;
  recordLatency: (ms: number) => void;
  setConnectionState: (s: ConnectionState) => void;
  setActiveConns: (n: number) => void;
  setIsStressTesting: (v: boolean) => void;
  setStressProgress: (p: {completed:number;total:number}|null) => void;
  refreshAnalytics: () => Promise<void>;
  fetchHits: (p?: number) => Promise<void>;
  replayHit: (id: number) => Promise<void>;
  setSelectedNodeId: (id: string|null) => void;
  fetchNodeConfig:   (id: string) => Promise<void>;
  updateNodeConfig:  (id: string, c: NodeConfig) => Promise<void>;
  setNodeConfigLocal:(id: string, c: NodeConfig) => void;
}

export const useFlowStore = create<FlowState>((set, get) => ({
  nodes: INIT_NODES, edges: INIT_EDGES,
  nodeTelemetry: {}, activeEdgeIds: [],
  inspectorConfigs: {}, yamlDirty: false,
  deploymentState: 'draft', deploymentId: null, deploymentSaving: false,
  rightPanelVisible: true, rightPanelTab: 'yaml', inspectorNodeId: null,
  globalMetrics: {rps:0,p99Latency:0,errorRate:0},
  recentLatencies: [], eventTimestamps: [],
  isStressTesting: false, stressProgress: null,
  logs: [],
  connectionState: 'connecting', activeConns: 0, analytics: null,
  hits: [], hitsTotal: 0, hitsPage: 1, hitsLoading: false,
  selectedNodeId: null, nodeConfigs: {}, replayingId: null,

  onNodesChange: (c) => set(s => ({ nodes: applyNodeChanges(c, s.nodes), yamlDirty: true })),
  onEdgesChange: (c) => set(s => ({ edges: applyEdgeChanges(c, s.edges), yamlDirty: true })),
  onConnect:     (c) => set(s => ({ edges: addEdge({...c, type:'particle'}, s.edges), yamlDirty: true })),

  addFlowNode: (paletteType, position) => {
    nodeIdSeq++;
    const LABELS: Record<PaletteNodeType, string> = {
      webhook:'Webhook Trigger','ai-parser':'AI Parser',postgres:'Postgres DB',redis:'Redis Cache',filter:'Filter / Branch','local-llm':'Local LLM',
    };
    set(s => ({ nodes: [...s.nodes, { id:`${paletteType}-${nodeIdSeq}`, type:'flowNode', position, data:{paletteType, label:LABELS[paletteType]} }], yamlDirty: true }));
  },

  setInspectorConfig: (nodeId, cfg) =>
    set(s => ({ inspectorConfigs: { ...s.inspectorConfigs, [nodeId]: {...(s.inspectorConfigs[nodeId]??defaultInspector()), ...cfg} }, yamlDirty: true })),

  setYamlDirty: (v) => set({ yamlDirty: v }),

  enterDraft: () => set({ deploymentState: 'draft' }),

  saveDraftAction: async () => {
    const { nodes, edges, inspectorConfigs } = get();
    const schema: DeploymentSchema = {
      nodes: nodes.map(n => ({ id:n.id, type:n.data.paletteType, label:n.data.label, position:{x:Math.round(n.position.x),y:Math.round(n.position.y)}, inspector:inspectorConfigs[n.id] })),
      edges: edges.map(e => ({ id:e.id, source:e.source, target:e.target })),
      inspectorConfigs,
    };
    set({ deploymentSaving: true });
    try {
      const r = await api.saveDraft(schema);
      set({ deploymentId: r.id, deploymentSaving: false });
    } catch { set({ deploymentSaving: false }); }
  },

  deployPipeline: async () => {
    const { nodes, edges, inspectorConfigs } = get();
    const schema: DeploymentSchema = {
      nodes: nodes.map(n => ({ id:n.id, type:n.data.paletteType, label:n.data.label, position:{x:Math.round(n.position.x),y:Math.round(n.position.y)}, inspector:inspectorConfigs[n.id] })),
      edges: edges.map(e => ({ id:e.id, source:e.source, target:e.target })),
      inspectorConfigs,
    };
    set({ deploymentSaving: true });
    try {
      const r = await api.deployPipeline(schema);
      set({ deploymentState:'deployed', deploymentId:r.id, deploymentSaving:false });
      get().addLog('success', `✓ Deployed to production  id=${r.id}`);
    } catch (err) {
      set({ deploymentSaving: false });
      get().addLog('error', `Deploy failed: ${err}`);
    }
  },

  loadActiveDeployment: async () => {
    try {
      const { deployment } = await api.getActiveDeployment();
      if (!deployment?.schema?.nodes?.length) return;
      const { schema, status } = deployment;
      set({
        nodes: schema.nodes.map(n => ({ id:n.id, type:'flowNode', position:n.position??{x:0,y:0}, data:{paletteType:(n.type as PaletteNodeType)??'webhook', label:n.label??n.type} })),
        edges: schema.edges.map(e => ({ id:e.id, source:e.source, target:e.target, type:'particle' })),
        inspectorConfigs: schema.inspectorConfigs??{},
        deploymentState: status==='deployed'?'deployed':'draft',
        deploymentId: deployment.id,
        yamlDirty: true,
      });
      get().addLog('info', `Loaded ${status} deployment #${deployment.id} (${schema.nodes.length} nodes)`);
    } catch { /* backend not ready */ }
  },

  setRightPanelVisible: (v) => set({ rightPanelVisible: v }),
  setRightPanelTab:     (t) => set({ rightPanelTab: t }),
  setInspectorNodeId:   (id) => set({ inspectorNodeId: id }),
  openInspector: (nodeId) => set({ inspectorNodeId:nodeId, rightPanelVisible:true, rightPanelTab:'inspector' }),

  addLog: (level, text) => {
    const id = ++logSeq;
    const ts = new Date().toLocaleTimeString('en-US', {hour12:false});
    set(s => ({ logs: [...s.logs.slice(-199), {id,ts,level,text}] }));
  },

  activateNode: (nodeId, display) => set(s => ({
    nodeTelemetry: { ...s.nodeTelemetry, [nodeId]: {...(s.nodeTelemetry[nodeId]??emptyTelemetry()), status:'processing', lastDisplay:display??'Processing...'} },
  })),

  completeNode: (nodeId, latencyMs, edgeIds, display) => set(s => {
    const prev = s.nodeTelemetry[nodeId]??emptyTelemetry();
    const latencyHistory = [...prev.latencyHistory.slice(-19), latencyMs];
    const heatState: HeatState = latencyMs>1000?'critical':latencyMs>500?'warning':'normal';
    const next: NodeTelemetry = {...prev, status:'success', heatState, latencyHistory, hitCount:prev.hitCount+1, lastDisplay:display??`Done in ${latencyMs}ms`};
    setTimeout(() => set(ss => ({
      nodeTelemetry: {...ss.nodeTelemetry, [nodeId]:{...ss.nodeTelemetry[nodeId],status:'idle'}},
      activeEdgeIds: ss.activeEdgeIds.filter(id=>!(edgeIds??[]).includes(id)),
    })), 2000);
    return {
      nodeTelemetry: {...s.nodeTelemetry, [nodeId]:next},
      activeEdgeIds: edgeIds ? [...new Set([...s.activeEdgeIds,...edgeIds])] : s.activeEdgeIds,
    };
  }),

  failNode: (nodeId, error) => set(s => ({
    nodeTelemetry: { ...s.nodeTelemetry, [nodeId]: {...(s.nodeTelemetry[nodeId]??emptyTelemetry()), status:'error', heatState:'critical', errorCount:(s.nodeTelemetry[nodeId]?.errorCount??0)+1, lastDisplay:`Error: ${error}`} },
  })),

  deactivateEdge: (edgeId) => set(s => ({ activeEdgeIds: s.activeEdgeIds.filter(id=>id!==edgeId) })),

  setOptimisticFire: () => {
    const updates: Record<string,NodeTelemetry> = {};
    for (const n of get().nodes.filter(n=>n.data.paletteType==='webhook'))
      updates[n.id] = {...(get().nodeTelemetry[n.id]??emptyTelemetry()), status:'processing', lastDisplay:'Firing...'};
    set(s => ({ nodeTelemetry: {...s.nodeTelemetry,...updates} }));
  },

  recordLatency: (ms) => set(s => {
    const now = Date.now();
    const et = [...s.eventTimestamps, now].filter(t=>now-t<10_000);
    const rl = [...s.recentLatencies.slice(-99), ms];
    return { eventTimestamps:et, recentLatencies:rl, globalMetrics:computeMetrics(et,rl,s.analytics) };
  }),

  setConnectionState: (state) => set({ connectionState: state }),
  setActiveConns: (count) => set(s => ({ activeConns:count, analytics:s.analytics?{...s.analytics,activeConns:count}:null })),
  setIsStressTesting: (v) => set({ isStressTesting:v }),
  setStressProgress:  (p) => set({ stressProgress:p }),

  refreshAnalytics: async () => {
    try {
      const data = await api.getAnalytics();
      set(s => ({ analytics:data, globalMetrics:computeMetrics(s.eventTimestamps,s.recentLatencies,data) }));
    } catch {}
  },

  fetchHits: async (page=1) => {
    set({ hitsLoading:true });
    try { const d = await api.getHits(page); set({ hits:d.hits, hitsTotal:d.total, hitsPage:page, hitsLoading:false }); }
    catch { set({ hitsLoading:false }); }
  },

  replayHit: async (id) => {
    set({ replayingId:id });
    try { await api.replayHit(id); } finally { set({ replayingId:null }); }
  },

  setSelectedNodeId: (id) => { set({ selectedNodeId:id }); if(id) void get().fetchNodeConfig(id); },
  fetchNodeConfig: async (nodeId) => {
    try { const d = await api.getNodeConfig(nodeId); set(s=>({nodeConfigs:{...s.nodeConfigs,[nodeId]:d.config}})); } catch {}
  },
  updateNodeConfig: async (nodeId, config) => {
    set(s=>({nodeConfigs:{...s.nodeConfigs,[nodeId]:config}}));
    try { await api.updateNodeConfig(nodeId, config); } catch { void get().fetchNodeConfig(nodeId); }
  },
  setNodeConfigLocal: (nodeId, config) => set(s=>({nodeConfigs:{...s.nodeConfigs,[nodeId]:config}})),
}));

export { toYaml, fromYaml, defaultInspector };
