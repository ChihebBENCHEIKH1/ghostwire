'use client';

import { useFlowStore } from '@/store/flowStore';
import YamlEditorPanel from './YamlEditorPanel';
import InspectorPanel  from './InspectorPanel';

export default function RightPanel() {
  const rightPanelVisible = useFlowStore(s => s.rightPanelVisible);
  const rightPanelTab     = useFlowStore(s => s.rightPanelTab);
  const setRightPanelTab  = useFlowStore(s => s.setRightPanelTab);

  if (!rightPanelVisible) return null;

  return (
    <div className="right-panel-container">
      {/* Tab bar */}
      <div className="right-panel-tabs">
        <button
          className={`right-panel-tab ${rightPanelTab === 'yaml' ? 'active' : ''}`}
          onClick={() => setRightPanelTab('yaml')}
        >
          YAML
        </button>
        <button
          className={`right-panel-tab ${rightPanelTab === 'inspector' ? 'active' : ''}`}
          onClick={() => setRightPanelTab('inspector')}
        >
          Inspector
        </button>
      </div>

      {rightPanelTab === 'yaml'      && <YamlEditorPanel />}
      {rightPanelTab === 'inspector' && <InspectorPanel  />}
    </div>
  );
}
