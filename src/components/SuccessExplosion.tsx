'use client';

import { useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { useFlowStore } from '@/store/flowStore';

/**
 * Fires a confetti burst whenever any node transitions to 'success'
 * that is a terminal node (postgres, redis — "sink" types).
 */
export default function SuccessExplosion() {
  const nodeTelemetry = useFlowStore(s => s.nodeTelemetry);
  const nodes         = useFlowStore(s => s.nodes);
  const prevRef       = useRef<Record<string, string>>({});

  useEffect(() => {
    const sinkTypes = new Set(['postgres', 'redis']);

    for (const node of nodes) {
      if (!sinkTypes.has(node.data.paletteType)) continue;
      const current  = nodeTelemetry[node.id]?.status ?? 'idle';
      const previous = prevRef.current[node.id] ?? 'idle';

      if (current === 'success' && previous !== 'success') {
        confetti({
          particleCount: 80,
          spread: 60,
          origin: { x: 0.72, y: 0.42 },
          colors: ['#10b981', '#06b6d4', '#6366f1', '#8b5cf6'],
          ticks: 200,
          gravity: 0.9,
          scalar: 0.85,
        });
        setTimeout(() =>
          confetti({
            particleCount: 35,
            spread: 90,
            origin: { x: 0.72, y: 0.42 },
            colors: ['#34d399', '#67e8f9'],
            ticks: 140,
            gravity: 0.7,
            scalar: 0.7,
          }), 160);
        break; // one burst per pipeline completion is enough
      }
    }

    // Update previous state snapshot
    const next: Record<string, string> = {};
    for (const node of nodes) {
      next[node.id] = nodeTelemetry[node.id]?.status ?? 'idle';
    }
    prevRef.current = next;
  }, [nodeTelemetry, nodes]);

  return null;
}
