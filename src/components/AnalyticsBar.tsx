'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, CheckCircle2, Timer, Wifi, Zap, TrendingUp, AlertTriangle } from 'lucide-react';
import { useFlowStore } from '@/store/flowStore';

type TileColor = 'indigo' | 'green' | 'amber' | 'cyan' | 'pink' | 'violet' | 'red';

function Tile({
  icon: Icon, label, value, unit, color, skeleton,
}: {
  icon:     React.ElementType;
  label:    string;
  value:    number | null;
  unit?:    string;
  color:    TileColor;
  skeleton?: boolean;
}) {
  return (
    <div className={`analytics-tile ${color}`}>
      <div className="analytics-tile-icon"><Icon size={13} /></div>
      <div className="analytics-tile-body">
        <span className="analytics-tile-label">{label}</span>
        <span className="analytics-tile-value">
          <AnimatePresence mode="wait">
            {!skeleton && value !== null ? (
              <motion.span
                key={value}
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                transition={{ duration: 0.18 }}
              >
                {value.toLocaleString()}
                {unit && <span className="analytics-tile-unit">{unit}</span>}
              </motion.span>
            ) : (
              <span className="analytics-skeleton" />
            )}
          </AnimatePresence>
        </span>
      </div>
    </div>
  );
}

export default function AnalyticsBar() {
  const analytics      = useFlowStore(s => s.analytics);
  const globalMetrics  = useFlowStore(s => s.globalMetrics);
  const refreshAnalytics = useFlowStore(s => s.refreshAnalytics);

  // Refresh DB-backed stats every 30 s
  useEffect(() => {
    void refreshAnalytics();
    const id = setInterval(() => void refreshAnalytics(), 30_000);
    return () => clearInterval(id);
  }, [refreshAnalytics]);

  // Recompute RPS display every second (decays to 0 when idle)
  const rpsRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    rpsRef.current = setInterval(() => {
      // Just trigger re-read; store already recalculates in recordLatency
    }, 1000);
    return () => { if (rpsRef.current) clearInterval(rpsRef.current); };
  }, []);

  const sk = analytics === null;

  return (
    <div className="analytics-bar">
      {/* DB-backed metrics */}
      <Tile icon={Activity}     label="Total Hits"   value={analytics?.totalHits   ?? null} color="indigo" skeleton={sk} />
      <Tile icon={CheckCircle2} label="Success Rate" value={analytics?.successRate ?? null} unit="%" color="green" skeleton={sk} />
      <Tile icon={Timer}        label="Avg Latency"  value={analytics?.avgLatency  ?? null} unit="ms" color="amber" skeleton={sk} />
      <Tile icon={Wifi}         label="Live Clients" value={analytics?.activeConns ?? null} color="cyan" skeleton={sk} />

      {/* Divider */}
      <div className="analytics-bar-sep" />

      {/* Real-time computed metrics */}
      <Tile icon={Zap}          label="RPS"         value={globalMetrics.rps}         color="violet" />
      <Tile icon={TrendingUp}   label="P99 Latency" value={globalMetrics.p99Latency}  unit="ms" color="pink" />
      <Tile
        icon={AlertTriangle}
        label="Error Rate"
        value={Math.round(globalMetrics.errorRate)}
        unit="%"
        color={globalMetrics.errorRate > 10 ? 'red' : 'green'}
      />
    </div>
  );
}
