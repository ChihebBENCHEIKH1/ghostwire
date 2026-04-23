'use client';

import { Rocket, Settings, PanelRight } from 'lucide-react';
import { useFlowStore, type ConnectionState } from '@/store/flowStore';

function SystemStatus({ state }: { state: ConnectionState }) {
  const labels: Record<ConnectionState, string> = {
    connected:    'LIVE',
    connecting:   'CONNECTING',
    disconnected: 'OFFLINE',
  };
  return (
    <div className={`system-status ${state}`}>
      <span className="system-status-dot" />
      <span className="system-status-label">{labels[state]}</span>
    </div>
  );
}

export default function TopBar() {
  const connectionState    = useFlowStore(s => s.connectionState);
  const deploymentState    = useFlowStore(s => s.deploymentState);
  const deploymentSaving   = useFlowStore(s => s.deploymentSaving);
  const deploymentId       = useFlowStore(s => s.deploymentId);
  const saveDraftAction    = useFlowStore(s => s.saveDraftAction);
  const deployPipeline     = useFlowStore(s => s.deployPipeline);
  const enterDraft         = useFlowStore(s => s.enterDraft);
  const rightPanelVisible  = useFlowStore(s => s.rightPanelVisible);
  const setRightPanelVisible = useFlowStore(s => s.setRightPanelVisible);

  const isDraft    = deploymentState === 'draft';
  const isDeployed = deploymentState === 'deployed';

  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="topbar-brand">
          <div className="topbar-logo"><Rocket size={16} /></div>
          <span className="topbar-title">Visual API Builder</span>
        </div>
        <div className="topbar-divider" />
        <div className="topbar-project">
          <span className="topbar-project-label">Project</span>
          <span className="topbar-project-name">Auth-Service-Prod</span>
        </div>

        {/* Deployment state badge */}
        <div className={`deployment-badge ${deploymentState}`}>
          {isDeployed ? '● DEPLOYED' : '◌ DRAFT'}
          {deploymentId && <span className="deployment-badge-id">#{deploymentId}</span>}
        </div>
      </div>

      <div className="topbar-right">
        <SystemStatus state={connectionState} />

        {/* Save Draft */}
        {isDraft && (
          <button
            className="btn-save-draft"
            onClick={saveDraftAction}
            disabled={deploymentSaving}
            title="Save current canvas as a draft"
          >
            {deploymentSaving ? (
              <span className="topbar-spinner" />
            ) : (
              <>💾 Save Draft</>
            )}
          </button>
        )}

        {/* Deploy to Production */}
        {isDraft && (
          <button
            className="btn-deploy"
            onClick={deployPipeline}
            disabled={deploymentSaving}
            title="Deploy pipeline to production"
          >
            {deploymentSaving ? (
              <span className="topbar-spinner" />
            ) : (
              <>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                Deploy
              </>
            )}
          </button>
        )}

        {/* Edit Configuration (when deployed) */}
        {isDeployed && (
          <button
            className="btn-edit-config"
            onClick={enterDraft}
            title="Create a new draft from the current deployment"
          >
            ✏️ Edit Configuration
          </button>
        )}

        <button
          className={`btn-icon ${rightPanelVisible ? 'active' : ''}`}
          onClick={() => setRightPanelVisible(!rightPanelVisible)}
          title="Toggle YAML / Inspector panel"
        >
          <PanelRight size={16} />
        </button>

        <button className="btn-icon"><Settings size={18} /></button>
      </div>
    </header>
  );
}
