'use client';

import { type MouseEvent as ReactMouseEvent } from 'react';
import { Zap, Settings, Loader2, CheckCircle2, Play } from 'lucide-react';
import { type NodeStatus } from '@/store/flowStore';

interface Props {
  x: number;
  y: number;
  width: number;
  status: NodeStatus;
  activeData?: string;
  isSimulating: boolean;
  onMouseDown: (e: ReactMouseEvent<HTMLDivElement>, id: string) => void;
  onSettingsClick: (id: string) => void;
  onFireTest: () => void;
}

export default function WebhookNode({
  x, y, width, status, activeData, isSimulating,
  onMouseDown, onSettingsClick, onFireTest,
}: Props) {
  return (
    <div
      className={`canvas-node indigo status-${status}`}
      style={{ left: x, top: y, width }}
      onMouseDown={(e) => onMouseDown(e, 'webhook')}
    >
      <div className="canvas-node-inner">
        <div className="canvas-node-header">
          <div className="canvas-node-header-left">
            <div className="canvas-node-type-icon indigo"><Zap size={16} /></div>
            <span className="canvas-node-type-label">Webhook</span>
          </div>
          <div className="canvas-node-header-right">
            {status === 'processing' && <span className="node-status-icon processing"><Loader2 size={13} className="spin" /></span>}
            {status === 'success'    && <span className="node-status-icon success"><CheckCircle2 size={13} /></span>}
            <button
              className="canvas-node-settings"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => onSettingsClick('webhook')}
            >
              <Settings size={13} />
            </button>
          </div>
        </div>

        <div className="canvas-node-body">
          <h3 className="canvas-node-title">Webhook Trigger</h3>
          <p className="canvas-node-detail">POST /api/webhook</p>
        </div>

        {activeData && (
          <div className={`node-data-feed ${status}`}>
            <span className="node-data-dot" />
            <span className="node-data-text">{activeData}</span>
          </div>
        )}

        <div className="node-webhook-footer">
          <div className="node-progress-bar">
            <div className={`node-progress-fill ${status === 'processing' ? 'active' : ''}`} />
          </div>
          <button
            className={`node-fire-btn ${isSimulating ? 'disabled' : ''}`}
            disabled={isSimulating}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onFireTest}
            title="Fire a test webhook (Quick Fire)"
          >
            <Play size={10} fill="currentColor" />
            Quick Fire
          </button>
        </div>
      </div>
      <div className="connector left indigo" />
      <div className="connector right indigo" />
    </div>
  );
}
