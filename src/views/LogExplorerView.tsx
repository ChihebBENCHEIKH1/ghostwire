'use client';

import { useEffect, useState, useCallback } from 'react';
import { Search, RefreshCw, RotateCcw, ChevronLeft, ChevronRight, Filter, Sparkles } from 'lucide-react';
import { api, type Hit } from '@/services/api';
import AiInsightModal from '@/components/AiInsightModal';

const STATUS_OPTIONS = ['', 'success', 'error', 'processing'];

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'success' ? 'log-badge-success'
            : status === 'error'   ? 'log-badge-error'
            : 'log-badge-processing';
  return <span className={`log-badge ${cls}`}>{status}</span>;
}

export default function LogExplorerView() {
  const [hits, setHits]         = useState<Hit[]>([]);
  const [total, setTotal]       = useState(0);
  const [pages, setPages]       = useState(1);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(false);
  const [replayingId, setReplayingId] = useState<number | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [eventFilter,  setEventFilter]  = useState('');
  const [sinceFilter,  setSinceFilter]  = useState('');

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [aiPayload,  setAiPayload]  = useState<Record<string, unknown> | null>(null);

  const fetchPage = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const filters = {
        status: statusFilter || undefined,
        event:  eventFilter  || undefined,
        since:  sinceFilter  || undefined,
      };
      const d = await api.getHits(p, 20, filters);
      setHits(d.hits);
      setTotal(d.total);
      setPages(d.pages);
      setPage(p);
    } catch {}
    finally { setLoading(false); }
  }, [statusFilter, eventFilter, sinceFilter]);

  useEffect(() => { void fetchPage(1); }, [statusFilter, sinceFilter]);

  const handleReplay = async (id: number) => {
    setReplayingId(id);
    try { await api.replayHit(id); }
    finally { setReplayingId(null); }
  };

  return (
    <div className="view-logs">
      <div className="logs-header-bar">
        <div className="logs-title-wrap">
          <h1 className="logs-title">Log Explorer</h1>
          <span className="logs-total">{total.toLocaleString()} records</span>
        </div>

        <div className="logs-filters">
          {/* Status filter */}
          <div className="logs-filter-item">
            <Filter size={12} />
            <select
              className="logs-select"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s || 'All Statuses'}</option>
              ))}
            </select>
          </div>

          {/* Event search */}
          <div className="logs-filter-item">
            <Search size={12} />
            <input
              className="logs-input"
              placeholder="Filter by event name..."
              value={eventFilter}
              onChange={e => setEventFilter(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchPage(1)}
            />
          </div>

          {/* Since date */}
          <div className="logs-filter-item">
            <input
              className="logs-input logs-input--date"
              type="date"
              value={sinceFilter}
              onChange={e => setSinceFilter(e.target.value)}
              title="Show hits since this date"
            />
          </div>

          <button
            className="logs-refresh-btn"
            onClick={() => fetchPage(page)}
            disabled={loading}
            title="Refresh"
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div className="logs-table-wrap">
        <table className="logs-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Timestamp</th>
              <th>Event</th>
              <th>Status</th>
              <th>Latency</th>
              <th>API Key</th>
              <th>Replay</th>
            </tr>
          </thead>
          <tbody>
            {hits.length === 0 && !loading && (
              <tr><td colSpan={7} className="logs-empty">No records found</td></tr>
            )}
            {hits.map(hit => (
              <>
                <tr
                  key={hit.id}
                  className={`logs-row ${expandedId === hit.id ? 'expanded' : ''}`}
                  onClick={() => setExpandedId(expandedId === hit.id ? null : hit.id)}
                >
                  <td className="logs-cell-id">#{hit.id}</td>
                  <td className="logs-cell-ts">
                    {new Date(hit.received_at).toLocaleString('en-US', {
                      month: 'short', day: 'numeric',
                      hour: '2-digit', minute: '2-digit', second: '2-digit',
                    })}
                  </td>
                  <td className="logs-cell-event">
                    <span className="logs-event-chip">{hit.event_name ?? '—'}</span>
                    {hit.is_replay && <span className="logs-replay-tag">replay</span>}
                  </td>
                  <td><StatusBadge status={hit.status} /></td>
                  <td className="logs-cell-latency">
                    {hit.latency_ms != null ? `${hit.latency_ms}ms` : '—'}
                  </td>
                  <td className="logs-cell-key">{hit.api_key_id ?? '—'}</td>
                  <td>
                    <button
                      className="logs-replay-btn"
                      onClick={e => { e.stopPropagation(); void handleReplay(hit.id); }}
                      disabled={replayingId === hit.id}
                      title="Replay this hit"
                    >
                      <RotateCcw size={11} className={replayingId === hit.id ? 'spin' : ''} />
                    </button>
                  </td>
                </tr>
                {expandedId === hit.id && (
                  <tr key={`exp-${hit.id}`} className="logs-row-expanded">
                    <td colSpan={7}>
                      {hit.status === 'error' && (
                        <button
                          className="logs-ai-btn"
                          onClick={e => { e.stopPropagation(); setAiPayload(hit.payload); }}
                          title="Analyze with AI"
                        >
                          <Sparkles size={12} />
                          Analyze with AI
                        </button>
                      )}
                      <pre className="logs-payload">
                        {JSON.stringify(hit.payload, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      <div className="logs-pagination">
        <span className="logs-page-info">
          Page {page} of {pages} ({total} total)
        </span>
        <div className="logs-page-btns">
          <button
            className="logs-page-btn"
            onClick={() => fetchPage(page - 1)}
            disabled={page <= 1 || loading}
          >
            <ChevronLeft size={14} />
          </button>
          {Array.from({ length: Math.min(7, pages) }, (_, i) => {
            const p = page <= 4 ? i + 1 : page - 3 + i;
            if (p < 1 || p > pages) return null;
            return (
              <button
                key={p}
                className={`logs-page-btn ${p === page ? 'active' : ''}`}
                onClick={() => fetchPage(p)}
                disabled={loading}
              >
                {p}
              </button>
            );
          })}
          <button
            className="logs-page-btn"
            onClick={() => fetchPage(page + 1)}
            disabled={page >= pages || loading}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {aiPayload && (
        <AiInsightModal payload={aiPayload} onClose={() => setAiPayload(null)} />
      )}
    </div>
  );
}
