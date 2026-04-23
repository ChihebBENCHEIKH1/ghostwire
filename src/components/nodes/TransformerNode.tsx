'use client';

import { type MouseEvent as ReactMouseEvent } from 'react';
import { Layers, Settings, Loader2, CheckCircle2 } from 'lucide-react';
import { type NodeStatus } from '@/store/flowStore';

interface Props {
  x: number;
  y: number;
  width: number;
  status: NodeStatus;
  activeData?: string;
  outputFormat?: string;
  onMouseDown: (e: ReactMouseEvent<HTMLDivElement>, id: string) => void;
  onSettingsClick: (id: string) => void;
}

export default function TransformerNode({
  x, y, width, status, activeData, outputFormat,
  onMouseDown, onSettingsClick,
}: Props) {
  return (
    <div
      className={`canvas-node purple status-${status}`}
      style={{ left: x, top: y, width }}
      onMouseDown={(e) => onMouseDown(e, 'transformer')}
    >
      <div className="canvas-node-inner">
        <div className="canvas-node-header">
          <div className="canvas-node-header-left">
            <div className="canvas-node-type-icon purple"><Layers size={16} /></div>
            <span className="canvas-node-type-label">Transformer</span>
          </div>
          <div className="canvas-node-header-right">
            {status === 'processing' && <span className="node-status-icon processing"><Loader2 size={13} className="spin" /></span>}
            {status === 'success'    && <span className="node-status-icon success"><CheckCircle2 size={13} /></span>}
            <button
              className="canvas-node-settings"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => onSettingsClick('transformer')}
            >
              <Settings size={13} />
            </button>
          </div>
        </div>

        <div className="canvas-node-body">
          <h3 className="canvas-node-title">Data Transformer</h3>
          <p className="canvas-node-detail">Normalize & validate incoming schema.</p>
        </div>

        {activeData && (
          <div className={`node-data-feed ${status}`}>
            <span className="node-data-dot" />
            <span className="node-data-text">{activeData}</span>
          </div>
        )}

        {!activeData && (
          <div className="node-badges">
            <span className="node-badge purple">
              {outputFormat ?? 'JSON'}
            </span>
            <span className="node-badge green">SCHEMA-VALIDATE</span>
          </div>
        )}
      </div>
      <div className="connector left purple" />
      <div className="connector right purple" />
    </div>
  );
}
