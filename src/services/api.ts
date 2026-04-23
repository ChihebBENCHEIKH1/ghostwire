/**
 * src/services/api.ts — Typed REST client with JWT injection
 */

const BASE    = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY     ?? 'sk-dev-1234';

// Token injected by authStore after login
let _token: string | null = null;
export function setApiToken(t: string | null) { _token = t; }

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string> ?? {}),
  };
  if (_token) headers['Authorization'] = `Bearer ${_token}`;

  const res = await fetch(`${BASE}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: { id: number; username: string; role: string } }>(
      '/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }
    ),
  register: (username: string, password: string) =>
    request<{ token: string; user: { id: number; username: string; role: string } }>(
      '/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) }
    ),
  getMe: () =>
    request<{ user: { id: number; username: string; role: string; created_at: string } }>('/api/auth/me'),

  triggerWebhook: (payload: Record<string, unknown>) =>
    request<{ accepted: boolean }>('/api/webhook', {
      method: 'POST', headers: { 'x-api-key': API_KEY } as Record<string,string>, body: JSON.stringify(payload),
    }),
  getHits: (page = 1, limit = 20, filters?: { status?: string; event?: string; since?: string }) => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (filters?.status) params.set('status', filters.status);
    if (filters?.event)  params.set('event',  filters.event);
    if (filters?.since)  params.set('since',  filters.since);
    return request<HitsResponse>(`/api/hits?${params}`);
  },
  replayHit:    (id: number) => request<{ accepted: boolean }>(`/api/hits/${id}/replay`, { method: 'POST' }),
  getAnalytics: () => request<Analytics>('/api/analytics'),
  getTopFailing: () => request<{ nodes: { event_name: string; fail_count: number }[] }>('/api/analytics/top-failing'),
  getHwHistory: () => request<{ cpu: number[]; ram: number[] }>('/api/analytics/hw-history'),
  getNodeConfig:    (nodeId: string) => request<{ config: NodeConfig | null; updatedAt: string | null }>(`/api/nodes/${nodeId}/config`),
  updateNodeConfig: (nodeId: string, config: NodeConfig) =>
    request<{ success: boolean; updatedAt: string }>(`/api/nodes/${nodeId}/config`, { method: 'PUT', body: JSON.stringify({ config }) }),
  stressTest: (count: number, graph: unknown) =>
    request<{ accepted: boolean; count: number }>('/api/stress-test', {
      method: 'POST', headers: { 'x-api-key': API_KEY } as Record<string,string>, body: JSON.stringify({ count, graph }),
    }),
  chatWithAi: async (
    message: string,
    history: { role: 'user' | 'assistant'; content: string }[],
    onToken: (t: string) => void,
  ): Promise<void> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_token) headers['Authorization'] = `Bearer ${_token}`;
    const res = await fetch(`${BASE}/api/ai/chat`, {
      method: 'POST', headers, body: JSON.stringify({ message, history }),
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const chunk = JSON.parse(line.slice(6)) as { token?: string; done?: boolean; error?: string };
          if (chunk.error) throw new Error(chunk.error);
          if (chunk.token) onToken(chunk.token);
        } catch { /* skip */ }
      }
    }
  },
  analyzePayload: async (payload: Record<string, unknown>, onToken: (t: string) => void): Promise<void> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (_token) headers['Authorization'] = `Bearer ${_token}`;
    const res = await fetch(`${BASE}/api/ai/analyze`, {
      method: 'POST', headers, body: JSON.stringify({ payload }),
    });
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const line of decoder.decode(value).split('\n')) {
        if (!line.startsWith('data: ')) continue;
        try {
          const chunk = JSON.parse(line.slice(6)) as { token?: string; done?: boolean; error?: string };
          if (chunk.error) throw new Error(chunk.error);
          if (chunk.token) onToken(chunk.token);
        } catch { /* skip */ }
      }
    }
  },
  getActiveDeployment: () => request<{ deployment: DeploymentRecord | null }>('/api/deployments/active'),
  saveDraft:     (schema: DeploymentSchema) => request<{ id: number; status: string }>('/api/deployments/draft', { method: 'PUT', body: JSON.stringify({ schema }) }),
  deployPipeline:(schema: DeploymentSchema) => request<{ id: number; status: string; deployedAt: string }>('/api/deployments/deploy', { method: 'POST', body: JSON.stringify({ schema }) }),
};

export interface Analytics { totalHits: number; successRate: number; avgLatency: number; activeConns: number; }
export interface Hit { id: number; received_at: string; event_name: string | null; payload: Record<string, unknown>; status: 'processing'|'success'|'error'; latency_ms: number | null; api_key_id: string | null; is_replay: boolean; }
export interface HitsResponse { hits: Hit[]; total: number; page: number; limit: number; pages: number; }
export interface NodeConfig { label?: string; description?: string; method?: string; path?: string; outputFormat?: 'JSON'|'XML'|'CSV'; transformRule?: string; tableName?: string; autoCommit?: boolean; sslEnabled?: boolean; [key: string]: unknown; }
export interface InspectorConfig { timeoutMs: number; maxRetries: number; backoff: 'none'|'linear'|'exponential'; mockErrorRate: number; alertThreshold: number; systemPrompt?: string; }
export interface DeploymentSchema { nodes: { id: string; type: string; label: string; position: { x: number; y: number }; inspector?: InspectorConfig }[]; edges: { id: string; source: string; target: string }[]; inspectorConfigs: Record<string, InspectorConfig>; }
export interface DeploymentRecord { id: number; status: 'draft'|'deployed'|'archived'; deployedAt: string | null; createdAt: string; schema: DeploymentSchema; }
