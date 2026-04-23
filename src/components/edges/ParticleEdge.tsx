'use client';

import { memo } from 'react';
import { getBezierPath, type EdgeProps } from '@xyflow/react';
import { useFlowStore } from '@/store/flowStore';

/**
 * ParticleEdge — animated SVG edge with a glowing particle traversing
 * the bezier curve while the edge is "active" (carrying data).
 *
 * Active state is driven by `store.activeEdgeIds`. Particle speed is
 * fixed at 0.8 s per traversal; for heavy load the animation loops
 * continuously which conveys high-frequency throughput visually.
 */
export const ParticleEdge = memo(function ParticleEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
}: EdgeProps) {
  const isActive = useFlowStore(s => s.activeEdgeIds.includes(id));

  const [edgePath] = getBezierPath({
    sourceX, sourceY, sourcePosition,
    targetX, targetY, targetPosition,
  });

  // Visual states
  const stroke = isActive
    ? '#10b981'
    : selected
    ? '#6366f1'
    : 'rgba(99,102,241,0.3)';
  const strokeWidth  = isActive ? 2.5 : 1.5;
  const dashArray    = isActive ? undefined : '6 4';
  const glowFilter   = isActive
    ? 'drop-shadow(0 0 6px rgba(16,185,129,0.75))'
    : undefined;

  return (
    <g>
      {/* Glow halo behind the active edge */}
      {isActive && (
        <path
          d={edgePath}
          fill="none"
          stroke="rgba(16,185,129,0.12)"
          strokeWidth={18}
        />
      )}

      {/* Main edge path — give it an id so animateMotion can reference it */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
        style={{ filter: glowFilter, transition: 'stroke 0.25s, stroke-width 0.25s' }}
        markerEnd={markerEnd}
      />

      {/* Travelling particle */}
      {isActive && (
        <circle r={5} fill="#10b981" filter="url(#particleGlow)">
          <animateMotion
            dur="0.8s"
            repeatCount="indefinite"
            path={edgePath}
          />
        </circle>
      )}

      {/* SVG filter definition (rendered once per edge, low cost) */}
      <defs>
        <filter id="particleGlow" x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
    </g>
  );
});
