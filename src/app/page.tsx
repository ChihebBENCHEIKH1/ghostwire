'use client';

import { useEffect } from 'react';
import TopBar           from '@/components/TopBar';
import Toast            from '@/components/Toast';
import SuccessExplosion from '@/components/SuccessExplosion';
import AnalyticsBar     from '@/components/AnalyticsBar';
import DeploymentLogs   from '@/components/DeploymentLogs';
import NodeConfigModal  from '@/components/NodeConfigModal';
import NavRail          from '@/components/NavRail';
import AuthScreen       from '@/components/AuthScreen';
import ArchitectView    from '@/views/ArchitectView';
import DashboardView    from '@/views/DashboardView';
import LogExplorerView  from '@/views/LogExplorerView';
import { usePipelineSocket } from '@/hooks/usePipelineSocket';
import { useFlowStore }      from '@/store/flowStore';
import { useAuthStore }      from '@/store/authStore';
import { useInfraStore }     from '@/store/infraStore';
import { setApiToken }       from '@/services/api';

function AppShell() {
  usePipelineSocket();
  const analytics     = useFlowStore(s => s.analytics);
  const globalMetrics = useFlowStore(s => s.globalMetrics);
  const activeView    = useInfraStore(s => s.activeView);

  return (
    <main className="app-layout">
      <TopBar />
      <AnalyticsBar />

      <div className="app-body">
        <NavRail />

        <div className="app-view-area">
          {activeView === 'architect' && <ArchitectView />}
          {activeView === 'dashboard' && <DashboardView />}
          {activeView === 'logs'      && <LogExplorerView />}
        </div>
      </div>

      <DeploymentLogs />

      <div className="statusbar">
        <div className="statusbar-left">
          <div className="statusbar-item">
            <span className="statusbar-dot" />
            <span className="statusbar-label">Connected</span>
          </div>
          <span className="statusbar-value muted">V6.0.0-SAAS</span>
        </div>
        <div className="statusbar-right">
          <div className="statusbar-item">
            <span className="statusbar-label">RPS:</span>
            <span className="statusbar-value green">{globalMetrics.rps}</span>
          </div>
          <div className="statusbar-item">
            <span className="statusbar-label">P99:</span>
            <span className="statusbar-value green">{globalMetrics.p99Latency}ms</span>
          </div>
          <div className="statusbar-item">
            <span className="statusbar-label">Avg:</span>
            <span className="statusbar-value green">
              {analytics ? `${analytics.avgLatency}ms` : '—'}
            </span>
          </div>
        </div>
      </div>

      <Toast />
      <SuccessExplosion />
      <NodeConfigModal />
    </main>
  );
}

export default function Home() {
  const isAuthed       = useAuthStore(s => s.isAuthed);
  const token          = useAuthStore(s => s.token);
  const restoreSession = useAuthStore(s => s.restoreSession);

  // Restore session from localStorage on first render
  useEffect(() => { restoreSession(); }, [restoreSession]);

  // Keep API client token in sync
  useEffect(() => { setApiToken(token); }, [token]);

  if (!isAuthed) return <AuthScreen />;
  return <AppShell />;
}
