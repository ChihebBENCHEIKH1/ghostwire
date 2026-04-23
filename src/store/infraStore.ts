import { create } from 'zustand';

export interface HwSample { ts: number; cpuPct: number; usedPct: number; }

export interface AlertNotification {
  id:        string;
  nodeId:    string;
  nodeLabel: string;
  count:     number;
  threshold: number;
  ts:        string;
  read:      boolean;
}

export type AppView = 'architect' | 'dashboard' | 'logs';

export interface AgentStep {
  type: 'AWAKE' | 'THINKING' | 'THOUGHT' | 'ACTION' | 'OBSERVATION' | 'RESOLUTION';
  text: string;
  ts:   string;
}

interface InfraState {
  // Navigation
  activeView: AppView;
  setActiveView: (v: AppView) => void;

  // Hardware telemetry
  hwSamples:    HwSample[];       // sliding window, max 60
  latestCpu:    number;
  latestRam:    number;
  totalMem:     number;
  freeMem:      number;
  pushHwSample: (s: Omit<HwSample, never> & { totalMem: number; freeMem: number }) => void;
  setHwHistory: (cpu: number[], ram: number[]) => void;

  // Notifications / alerts
  notifications: AlertNotification[];
  unreadCount:   number;
  addAlert:      (n: Omit<AlertNotification, 'id' | 'read'>) => void;
  markAllRead:   () => void;
  clearAll:      () => void;

  // Auto-SRE agent
  agentRunning: boolean;
  agentNodeId:  string | null;
  agentSteps:   AgentStep[];
  startAgent:   (nodeId: string) => void;
  addAgentStep: (step: AgentStep) => void;
  stopAgent:    () => void;
}

let notifSeq = 0;
const MAX_HW = 60;

export const useInfraStore = create<InfraState>((set, get) => ({
  activeView: 'architect',
  setActiveView: (v) => set({ activeView: v }),

  hwSamples: [], latestCpu: 0, latestRam: 0, totalMem: 0, freeMem: 0,

  pushHwSample: ({ ts, cpuPct, usedPct, totalMem, freeMem }) =>
    set(s => {
      const next = [...s.hwSamples, { ts, cpuPct, usedPct }];
      if (next.length > MAX_HW) next.shift();
      return { hwSamples: next, latestCpu: cpuPct, latestRam: usedPct, totalMem, freeMem };
    }),

  setHwHistory: (cpu, ram) => {
    const now = Date.now();
    const samples: HwSample[] = cpu.map((cpuPct, i) => ({
      ts: now - (cpu.length - i) * 1000,
      cpuPct,
      usedPct: ram[i] ?? 0,
    }));
    set({ hwSamples: samples });
  },

  notifications: [], unreadCount: 0,

  addAlert: (n) => {
    const notif: AlertNotification = { ...n, id: `alert-${++notifSeq}`, read: false };
    set(s => ({
      notifications: [notif, ...s.notifications].slice(0, 50),
      unreadCount:   s.unreadCount + 1,
    }));
  },

  markAllRead: () => set(s => ({
    notifications: s.notifications.map(n => ({ ...n, read: true })),
    unreadCount:   0,
  })),

  clearAll: () => set({ notifications: [], unreadCount: 0 }),

  agentRunning: false,
  agentNodeId:  null,
  agentSteps:   [],

  startAgent: (nodeId) => set({ agentRunning: true, agentNodeId: nodeId, agentSteps: [] }),

  addAgentStep: (step) => set(s => ({ agentSteps: [...s.agentSteps, step] })),

  stopAgent: () => set({ agentRunning: false }),
}));
