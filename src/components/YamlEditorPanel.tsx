'use client';

import { useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { X, FileCode2 } from 'lucide-react';
import { useFlowStore } from '@/store/flowStore';
import { toYaml, fromYaml } from '@/lib/yaml-utils';

// Monaco must be dynamically imported (no SSR)
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false });

const DEBOUNCE_MS = 400;

export default function YamlEditorPanel() {
  const nodes           = useFlowStore(s => s.nodes);
  const edges           = useFlowStore(s => s.edges);
  const inspectorConfigs = useFlowStore(s => s.inspectorConfigs);
  const deploymentState  = useFlowStore(s => s.deploymentState);
  const yamlDirty        = useFlowStore(s => s.yamlDirty);
  const setYamlDirty     = useFlowStore(s => s.setYamlDirty);
  const setRightPanelVisible = useFlowStore(s => s.setRightPanelVisible);

  // Pulled from store to apply parsed result
  const onNodesChange  = useFlowStore(s => s.onNodesChange);
  const onEdgesChange  = useFlowStore(s => s.onEdgesChange);

  const editorRef   = useRef<{ getValue: () => string; setValue: (v: string) => void } | null>(null);
  const isEditingRef = useRef(false);  // user is currently typing → don't overwrite
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── When canvas changes → regenerate YAML ───────────────────────────────
  useEffect(() => {
    if (!yamlDirty || isEditingRef.current || !editorRef.current) return;
    const yaml = toYaml(nodes, edges, inspectorConfigs, deploymentState);
    editorRef.current.setValue(yaml);
    setYamlDirty(false);
  }, [yamlDirty, nodes, edges, inspectorConfigs, deploymentState, setYamlDirty]);

  // ── User types in editor → parse YAML → update canvas ───────────────────
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (!value) return;
    isEditingRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      isEditingRef.current = false;
      const result = fromYaml(value);
      if (result.error) return; // don't apply invalid YAML

      // Apply node changes — replace all
      const store = useFlowStore.getState();
      // Remove all existing nodes then add parsed ones
      onNodesChange(store.nodes.map(n => ({ type: 'remove' as const, id: n.id })));
      onEdgesChange(store.edges.map(e => ({ type: 'remove' as const, id: e.id })));

      // Use internal set for bulk update
      useFlowStore.setState({
        nodes: result.nodes,
        edges: result.edges,
        inspectorConfigs: result.inspectorConfigs,
        ...(result.deploymentState ? { deploymentState: result.deploymentState } : {}),
        yamlDirty: false,
      });
    }, DEBOUNCE_MS);
  }, [onNodesChange, onEdgesChange]);

  const handleEditorMount = useCallback((editor: { getValue: () => string; setValue: (v: string) => void }) => {
    editorRef.current = editor;
    // Initial population
    const yaml = toYaml(nodes, edges, inspectorConfigs, deploymentState);
    editor.setValue(yaml);
    setYamlDirty(false);
  }, [nodes, edges, inspectorConfigs, deploymentState, setYamlDirty]);

  return (
    <div className="right-panel yaml-panel">
      <div className="right-panel-header">
        <div className="right-panel-header-left">
          <FileCode2 size={14} />
          <span>YAML Config</span>
        </div>
        <button className="right-panel-close" onClick={() => setRightPanelVisible(false)}>
          <X size={13} />
        </button>
      </div>

      {deploymentState === 'deployed' && (
        <div className="yaml-deployed-banner">
          <span>🔒 Deployed — editing locked</span>
        </div>
      )}

      <div className="yaml-editor-wrap">
        <MonacoEditor
          height="100%"
          defaultLanguage="yaml"
          theme="vs-dark"
          options={{
            fontSize: 12,
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            padding: { top: 12, bottom: 12 },
            readOnly: deploymentState === 'deployed',
            renderLineHighlight: 'gutter',
            overviewRulerBorder: false,
            hideCursorInOverviewRuler: true,
            scrollbar: { verticalScrollbarSize: 4, horizontalScrollbarSize: 4 },
          }}
          onChange={handleEditorChange}
          onMount={handleEditorMount}
        />
      </div>
    </div>
  );
}
