'use client';

import { useEffect, useState } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Cpu, MemoryStick, Activity, AlertTriangle, TrendingUp } from 'lucide-react';
import { useInfraStore } from '@/store/infraStore';
import { useFlowStore  } from '@/store/flowStore';
import { api }           from '@/services/api';

interface TopFailNode { event_name: string; fail_count: number; }

function fmtMem(bytes: number) {
  return `${(bytes / (1024 ** 3)).toFixed(1)} GB`;
}

function MetricCard({ label, value, sub, Icon, accent }: {
  label: string; value: string | number; sub?: string;
  Icon: React.ElementType; accent: string;
}) {
  return (
    <div className="dash-metric-card" style={{ '--card-accent': accent } as React.CSSProperties}>
      <div className="dash-metric-icon"><Icon size={18} /></div>
      <div className="dash-metric-body">
        <div className="dash-metric-value">{value}</div>
        <div className="dash-metric-label">{label}</div>
        {sub && <div className="dash-metric-sub">{sub}</div>}
      </div>
    </div>
  );
}

export default function DashboardView() {
  const hwSamples   = useInfraStore(s => s.hwSamples);
  const latestCpu   = useInfraStore(s => s.latestCpu);
  const latestRam   = useInfraStore(s => s.latestRam);
  const totalMem    = useInfraStore(s => s.totalMem);
  const freeMem     = useInfraStore(s => s.freeMem);
  const analytics   = useFlowStore(s => s.analytics);
  const globalMetrics = useFlowStore(s => s.globalMetrics);

  const [topFailing, setTopFailing] = useState<TopFailNode[]>([]);

  useEffect(() => {
    api.getTopFailing().then(d => setTopFailing(d.nodes)).catch(() => {});
    // Refresh top-failing every 5s
    const id = setInterval(() => {
      api.getTopFailing().then(d => setTopFailing(d.nodes)).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, []);

  // CPU chart data
  const cpuData = hwSamples.map((s, i) => ({ i, cpu: s.cpuPct, ram: s.usedPct }));

  // Pie chart: success vs error
  const successCount = analytics ? Math.round((analytics.successRate / 100) * analytics.totalHits) : 0;
  const errorCount   = analytics ? analytics.totalHits - successCount : 0;
  const pieData = [
    { name: 'Success', value: successCount },
    { name: 'Error',   value: errorCount   },
  ];
  const PIE_COLORS = ['#10b981', '#ef4444'];

  const chartTooltipStyle = {
    background: '#0e0e14',
    border: '1px solid rgba(255,255,255,0.08)',
    fontSize: 11,
    borderRadius: 6,
  };

  return (
    <div className="view-dashboard">
      <div className="dash-header">
        <h1 className="dash-title">Infrastructure Dashboard</h1>
        <span className="dash-live-badge">
          <span className="dash-live-dot" /> Live
        </span>
      </div>

      {/* ── Metric cards ── */}
      <div className="dash-metrics-row">
        <MetricCard label="CPU Usage"    value={`${latestCpu}%`}     Icon={Cpu}          accent="#6366f1" />
        <MetricCard label="RAM Usage"    value={`${latestRam}%`}     sub={totalMem ? `${fmtMem(totalMem - freeMem)} / ${fmtMem(totalMem)}` : undefined} Icon={MemoryStick}  accent="#3b82f6" />
        <MetricCard label="Requests/s"   value={globalMetrics.rps}   Icon={Activity}     accent="#10b981" />
        <MetricCard label="P99 Latency"  value={`${globalMetrics.p99Latency}ms`} Icon={TrendingUp} accent="#f59e0b" />
        <MetricCard label="Error Rate"   value={`${globalMetrics.errorRate.toFixed(1)}%`} Icon={AlertTriangle} accent="#ef4444" />
      </div>

      {/* ── Charts row ── */}
      <div className="dash-charts-row">

        {/* CPU Area Chart */}
        <div className="dash-chart-card">
          <div className="dash-chart-header">
            <Cpu size={14} />
            <span>CPU Usage — last {hwSamples.length}s</span>
            <span className="dash-chart-val">{latestCpu}%</span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={cpuData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="i" hide />
              <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(v) => [`${v}%`, 'CPU']}
                labelFormatter={() => ''}
              />
              <Area type="monotone" dataKey="cpu" stroke="#6366f1" strokeWidth={1.5} fill="url(#cpuGrad)" isAnimationActive={false} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* RAM Area Chart */}
        <div className="dash-chart-card">
          <div className="dash-chart-header">
            <MemoryStick size={14} />
            <span>RAM Usage — last {hwSamples.length}s</span>
            <span className="dash-chart-val">{latestRam}%</span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={cpuData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="ramGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="i" hide />
              <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'rgba(255,255,255,0.3)' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={chartTooltipStyle}
                formatter={(v) => [`${v}%`, 'RAM']}
                labelFormatter={() => ''}
              />
              <Area type="monotone" dataKey="ram" stroke="#3b82f6" strokeWidth={1.5} fill="url(#ramGrad)" isAnimationActive={false} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Error vs Success Pie */}
        <div className="dash-chart-card dash-chart-card--pie">
          <div className="dash-chart-header">
            <Activity size={14} />
            <span>Success vs Error Rate</span>
            <span className="dash-chart-val">{analytics?.totalHits ?? 0} total</span>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={44}
                outerRadius={66}
                paddingAngle={3}
                dataKey="value"
                isAnimationActive={false}
              >
                {pieData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i]!} />
                ))}
              </Pie>
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(v) => <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>{v}</span>}
              />
              <Tooltip contentStyle={chartTooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Top Failing Nodes ── */}
      <div className="dash-failing-section">
        <div className="dash-section-header">
          <AlertTriangle size={14} />
          <span>Top Failing Nodes</span>
        </div>
        {topFailing.length === 0 ? (
          <div className="dash-no-failures">✓ No failures recorded</div>
        ) : (
          <div className="dash-failing-list">
            {topFailing.map((n, i) => (
              <div key={n.event_name} className="dash-failing-item">
                <span className="dash-failing-rank">#{i + 1}</span>
                <span className="dash-failing-name">{n.event_name}</span>
                <div className="dash-failing-bar-wrap">
                  <div
                    className="dash-failing-bar"
                    style={{ width: `${Math.min(100, (n.fail_count / (topFailing[0]!.fail_count)) * 100)}%` }}
                  />
                </div>
                <span className="dash-failing-count">{n.fail_count} failures</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
