'use client';

import Sidebar       from '@/components/Sidebar';
import Canvas        from '@/components/Canvas';
import LiveTerminal  from '@/components/LiveTerminal';
import RightPanel    from '@/components/RightPanel';
import AgentTerminal from '@/components/AgentTerminal';
import { useFlowStore } from '@/store/flowStore';

export default function ArchitectView() {
  const rightPanelVisible = useFlowStore(s => s.rightPanelVisible);

  return (
    <div className="view-architect">
      <Sidebar />
      <div className={`canvas-wrap ${rightPanelVisible ? 'with-right-panel' : ''}`}>
        <Canvas />
        <LiveTerminal />
        <AgentTerminal />
      </div>
      {rightPanelVisible && <RightPanel />}
    </div>
  );
}
