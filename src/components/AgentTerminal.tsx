'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInfraStore, type AgentStep } from '@/store/infraStore';

const STEP_COLORS: Record<AgentStep['type'], string> = {
  AWAKE:       '#00ff88',
  THINKING:    '#facc15',
  THOUGHT:     '#a3e635',
  ACTION:      '#38bdf8',
  OBSERVATION: '#c084fc',
  RESOLUTION:  '#00ff88',
};

const STEP_PREFIX: Record<AgentStep['type'], string> = {
  AWAKE:       '◆ AGENT AWAKE',
  THINKING:    '⟳ THINKING',
  THOUGHT:     '» THOUGHT',
  ACTION:      '▶ ACTION',
  OBSERVATION: '· OBSERVATION',
  RESOLUTION:  '✓ RESOLUTION',
};

export default function AgentTerminal() {
  const agentRunning = useInfraStore(s => s.agentRunning);
  const agentSteps   = useInfraStore(s => s.agentSteps);
  const stopAgent    = useInfraStore(s => s.stopAgent);
  const bottomRef    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [agentSteps]);

  // Auto-close 4 seconds after RESOLUTION arrives
  useEffect(() => {
    const hasResolution = agentSteps.some(s => s.type === 'RESOLUTION');
    if (hasResolution && !agentRunning) {
      const id = setTimeout(stopAgent, 4000);
      return () => clearTimeout(id);
    }
  }, [agentSteps, agentRunning, stopAgent]);

  return (
    <AnimatePresence>
      {(agentRunning || agentSteps.length > 0) && (
        <>
          {/* Dim overlay */}
          <motion.div
            className="agent-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />

          {/* Terminal window */}
          <motion.div
            className="agent-terminal"
            initial={{ opacity: 0, y: -20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0,   scale: 1    }}
            exit={{    opacity: 0, y: -20, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
          >
            {/* Title bar */}
            <div className="agent-terminal-bar">
              <div className="agent-terminal-dots">
                <span /><span /><span />
              </div>
              <span className="agent-terminal-title">Auto-SRE Agent</span>
              <button className="agent-terminal-close" onClick={stopAgent}>✕</button>
            </div>

            {/* Log body */}
            <div className="agent-terminal-body">
              {agentSteps.map((step, i) => (
                <motion.div
                  key={i}
                  className="agent-terminal-line"
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0  }}
                  transition={{ duration: 0.18 }}
                >
                  <span className="agent-terminal-ts">
                    {new Date(step.ts).toLocaleTimeString('en-US', { hour12: false })}
                  </span>
                  <span
                    className="agent-terminal-type"
                    style={{ color: STEP_COLORS[step.type] }}
                  >
                    {STEP_PREFIX[step.type]}
                  </span>
                  <span className="agent-terminal-text">{step.text}</span>
                </motion.div>
              ))}

              {agentRunning && !agentSteps.some(s => s.type === 'RESOLUTION') && (
                <div className="agent-terminal-cursor">
                  <span className="agent-blink">█</span>
                </div>
              )}

              <div ref={bottomRef} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
