'use client';

import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useFlowStore }  from '@/store/flowStore';
import { useInfraStore } from '@/store/infraStore';
import { useAuthStore }  from '@/store/authStore';
import { setApiToken }   from '@/services/api';
import { useSounds }     from './useSounds';

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

let socket: Socket | null = null;

export function usePipelineSocket(): void {
  const store    = useFlowStore;
  const storeRef = useRef(store);
  storeRef.current = store;

  // Sync JWT token into api client
  const token = useAuthStore(s => s.token);
  useEffect(() => { setApiToken(token); }, [token]);

  const { playPing, playHum, playChime } = useSounds();
  const humStopRef = useRef<(() => void) | null>(null);

  // Sliding RPS counter — tick every second to decay stale events
  useEffect(() => {
    const id = setInterval(() => {
      // Touch globalMetrics so RPS display reflects elapsed time
      storeRef.current.getState().recordLatency(0);
      // Remove the phantom 0 we just injected
      storeRef.current.setState(s => ({
        recentLatencies: s.recentLatencies.slice(0, -1),
      }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    // Recreate socket whenever token changes so it connects with fresh auth
    if (socket) { socket.disconnect(); socket = null; }
    socket = io(BACKEND, {
      transports:           ['websocket'],
      autoConnect:          true,
      reconnection:         true,
      reconnectionAttempts: Infinity,
      reconnectionDelay:    1000,
      reconnectionDelayMax: 5000,
      auth:                 { token },
    });

    const sock = socket;
    const s    = () => storeRef.current.getState();

    // ── Connection ────────────────────────────────────────────────────────────
    const onConnect = () => {
      console.log(`%c[ws] ✓ connected  id=${sock.id}`, 'color:#10b981;font-weight:bold');
      s().setConnectionState('connected');
      s().addLog('info', `WebSocket connected  id=${sock.id}`);
      void s().refreshAnalytics();
      void s().fetchHits(1);
    };

    const onDisconnect = (reason: string) => {
      console.warn(`[ws] ✗ disconnected  reason=${reason}`);
      s().setConnectionState('disconnected');
      s().addLog('error', `Disconnected: ${reason}`);
    };

    const onConnectError = (err: Error) => {
      s().setConnectionState('disconnected');
      s().addLog('warn', `Connect error: ${err.message}`);
    };

    const onReconnectAttempt = () => {
      s().setConnectionState('connecting');
      s().addLog('warn', 'Attempting to reconnect...');
    };

    // ── Infra events ──────────────────────────────────────────────────────────
    const onClientsUpdate = (data: { count: number }) => {
      s().setActiveConns(data.count);
    };

    const onPipelineLog = (data: { ts: string; level: 'info' | 'success' | 'error' | 'warn'; text: string }) => {
      s().addLog(data.level, data.text);
    };

    // ── Dynamic DAG node events ───────────────────────────────────────────────
    const onNodeStart = (data: { nodeId: string; hitId: number | string; display?: string }) => {
      s().activateNode(data.nodeId, data.display);
      // Play ping on first node activation per hit
      playPing();
      if (!humStopRef.current) {
        humStopRef.current = playHum();
      }
    };

    const onNodeComplete = (data: {
      nodeId:    string;
      hitId:     number | string;
      latencyMs: number;
      edgeIds?:  string[];
      display?:  string;
    }) => {
      s().completeNode(data.nodeId, data.latencyMs, data.edgeIds, data.display);
      s().recordLatency(data.latencyMs);
    };

    const onNodeError = (data: { nodeId: string; hitId: number | string; error: string }) => {
      s().failNode(data.nodeId, data.error);
      s().addLog('error', `Node ${data.nodeId} error: ${data.error}`);
    };

    // ── Pipeline lifecycle ────────────────────────────────────────────────────
    const onPipelineComplete = (data: { hitId: number | string; totalLatencyMs: number }) => {
      humStopRef.current?.();
      humStopRef.current = null;
      playChime();
      s().addLog('success', `Pipeline complete  id=${data.hitId}  total=${data.totalLatencyMs}ms`);
      // Refresh dashboard data after a short delay
      setTimeout(() => {
        void s().refreshAnalytics();
        void s().fetchHits(1);
      }, 800);
    };

    // ── Stress test ───────────────────────────────────────────────────────────
    const onStressProgress = (data: { completed: number; total: number }) => {
      s().setStressProgress(data);
      if (data.completed >= data.total) {
        setTimeout(() => {
          s().setIsStressTesting(false);
          s().setStressProgress(null);
        }, 1500);
      }
    };

    const onStressStart = (data: { total: number }) => {
      s().setIsStressTesting(true);
      s().setStressProgress({ completed: 0, total: data.total });
      s().addLog('warn', `⚡ Stress test started — ${data.total} payloads incoming`);
    };

    // ── Node config ───────────────────────────────────────────────────────────
    const onNodeConfigUpdated = (data: { nodeId: string; config: Record<string, unknown> }) => {
      s().setNodeConfigLocal(data.nodeId, data.config);
    };

    // ── Hardware telemetry ────────────────────────────────────────────────────
    const onHwTelemetry = (data: { cpuPct: number; usedPct: number; totalMem: number; freeMem: number; ts: number }) => {
      useInfraStore.getState().pushHwSample(data);
    };

    // ── Alert trigger ─────────────────────────────────────────────────────────
    const onAlertTrigger = (data: { nodeId: string; nodeLabel: string; count: number; threshold: number; ts: string }) => {
      useInfraStore.getState().addAlert(data);
      s().addLog('error', `🚨 ALERT: ${data.nodeLabel} failed ${data.count}× (threshold ${data.threshold})`);
    };

    // ── Docker provisioner logs ───────────────────────────────────────────────
    const onDockerProvisionLog = (data: { stream: string; text: string; ts: string }) => {
      const level = (data.stream === 'success') ? 'success'
                  : (data.stream === 'error')   ? 'error'
                  : 'docker' as const;
      s().addLog(level, data.text);
    };

    // ── CLI deployment hot-reload ─────────────────────────────────────────────
    const onCliDeploymentSync = (data: {
      id:         number;
      schema:     { nodes: Array<{ id: string; type?: string; label?: string; position?: { x: number; y: number } }>; edges: Array<{ id: string; source: string; target: string }>; inspectorConfigs?: Record<string, import('@/store/flowStore').InspectorConfig> };
      deployedAt: string;
    }) => {
      const { nodes, edges, inspectorConfigs = {} } = data.schema;
      useFlowStore.setState({
        nodes: nodes.map(n => ({
          id:       n.id,
          type:     'flowNode',
          position: n.position ?? { x: 0, y: 0 },
          data:     { paletteType: (n.type ?? 'webhook') as import('@/store/flowStore').PaletteNodeType, label: n.label ?? n.type ?? 'Node' },
        })),
        edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target, type: 'particle' })),
        inspectorConfigs,
        deploymentState: 'deployed',
        deploymentId:    data.id,
        yamlDirty:       false,
      });
      s().addLog('success', `🖥  CLI push — canvas hot-reloaded  id=#${data.id}  nodes=${nodes.length}`);
    };

    // ── Auto-SRE agent ────────────────────────────────────────────────────────
    const onAgentStart = (data: { nodeId: string }) => {
      useInfraStore.getState().startAgent(data.nodeId);
    };

    const onAgentStep = (data: { type: string; text: string; ts: string }) => {
      useInfraStore.getState().addAgentStep(data as import('@/store/infraStore').AgentStep);
    };

    const onAgentDone = () => {
      useInfraStore.getState().stopAgent();
    };

    // ── Register ──────────────────────────────────────────────────────────────
    sock.on('connect',              onConnect);
    sock.on('disconnect',           onDisconnect);
    sock.on('connect_error',        onConnectError);
    sock.io.on('reconnect_attempt', onReconnectAttempt);
    sock.on('clients_update',       onClientsUpdate);
    sock.on('pipeline_log',         onPipelineLog);
    sock.on('node_start',           onNodeStart);
    sock.on('node_complete',        onNodeComplete);
    sock.on('node_error',           onNodeError);
    sock.on('pipeline_complete',    onPipelineComplete);
    sock.on('stress_start',         onStressStart);
    sock.on('stress_progress',      onStressProgress);
    sock.on('node_config_updated',  onNodeConfigUpdated);
    sock.on('hw_telemetry',         onHwTelemetry);
    sock.on('alert_trigger',        onAlertTrigger);
    sock.on('agent_start',          onAgentStart);
    sock.on('agent_step',           onAgentStep);
    sock.on('agent_done',           onAgentDone);
    sock.on('cli_deployment_sync',  onCliDeploymentSync);
    sock.on('docker_provision_log', onDockerProvisionLog);

    if (sock.connected) onConnect();

    return () => {
      sock.off('connect',              onConnect);
      sock.off('disconnect',           onDisconnect);
      sock.off('connect_error',        onConnectError);
      sock.io.off('reconnect_attempt', onReconnectAttempt);
      sock.off('clients_update',       onClientsUpdate);
      sock.off('pipeline_log',         onPipelineLog);
      sock.off('node_start',           onNodeStart);
      sock.off('node_complete',        onNodeComplete);
      sock.off('node_error',           onNodeError);
      sock.off('pipeline_complete',    onPipelineComplete);
      sock.off('stress_start',         onStressStart);
      sock.off('stress_progress',      onStressProgress);
      sock.off('node_config_updated',  onNodeConfigUpdated);
      sock.off('hw_telemetry',         onHwTelemetry);
      sock.off('alert_trigger',        onAlertTrigger);
      sock.off('agent_start',          onAgentStart);
      sock.off('agent_step',           onAgentStep);
      sock.off('agent_done',           onAgentDone);
      sock.off('cli_deployment_sync',  onCliDeploymentSync);
      sock.off('docker_provision_log', onDockerProvisionLog);
      sock.disconnect();
      socket = null;
    };
  }, [playPing, playHum, playChime, token]);
}
