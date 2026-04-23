'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, RotateCcw, Loader2, RefreshCw } from 'lucide-react';
import { useFlowStore, type Hit } from '@/store/flowStore';

function relativeTime(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 60)   return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function StatusBadge({ status }: { status: Hit['status'] }) {
  return (
    <span className={`log-status-badge ${status}`}>
      {status === 'success' ? '✓ Success' : status === 'error' ? '✗ Error' : '⋯ Processing'}
    </span>
  );
}

export default function DeploymentLogs() {
  const [open, setOpen] = useState(false);

  const hits        = useFlowStore((s) => s.hits);
  const hitsTotal   = useFlowStore((s) => s.hitsTotal);
  const hitsPage    = useFlowStore((s) => s.hitsPage);
  const hitsLoading = useFlowStore((s) => s.hitsLoading);
  const replayingId = useFlowStore((s) => s.replayingId);
  const fetchHits   = useFlowStore((s) => s.fetchHits);
  const replayHit   = useFlowStore((s) => s.replayHit);

  const totalPages = Math.ceil(hitsTotal / 20);

  return (
    <div className={`deployment-logs ${open ? 'open' : ''}`}>
      {/* Header — always visible */}
      <div className="logs-header">
        <div className="logs-header-left" onClick={() => setOpen((v) => !v)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen((v) => !v)}>
          <motion.span
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            style={{ display: 'flex' }}
          >
            <ChevronUp size={14} />
          </motion.span>
          <span className="logs-header-title">Deployment Logs</span>
          <span className="logs-header-count">{hitsTotal.toLocaleString()} total</span>
        </div>
        <button
          className="logs-refresh-btn"
          onClick={() => void fetchHits(hitsPage)}
          title="Refresh logs"
        >
          <RefreshCw size={12} className={hitsLoading ? 'spin' : ''} />
        </button>
      </div>

      {/* Expandable body */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="logs-body"
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            style={{ overflow: 'hidden' }}
          >
            <div className="logs-body">
              {hits.length === 0 && !hitsLoading && (
                <div className="logs-empty">No hits recorded yet. Fire a webhook to begin.</div>
              )}

              {hits.length > 0 && (
                <table className="logs-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Event</th>
                      <th>Time</th>
                      <th>Status</th>
                      <th>Latency</th>
                      <th>Key</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {hits.map((hit) => (
                      <tr key={hit.id} className={hit.is_replay ? 'is-replay' : ''}>
                        <td className="log-id">
                          #{hit.id}
                          {hit.is_replay && <span className="replay-tag">↩</span>}
                        </td>
                        <td className="log-event">{hit.event_name ?? '—'}</td>
                        <td className="log-time">{relativeTime(hit.received_at)}</td>
                        <td><StatusBadge status={hit.status} /></td>
                        <td className="log-latency">
                          {hit.latency_ms != null ? `${hit.latency_ms}ms` : '—'}
                        </td>
                        <td className="log-key">
                          {hit.api_key_id ?? '—'}
                        </td>
                        <td>
                          <button
                            className="replay-btn"
                            onClick={() => void replayHit(hit.id)}
                            disabled={replayingId !== null}
                            title="Replay this hit through the pipeline"
                          >
                            {replayingId === hit.id
                              ? <Loader2 size={11} className="spin" />
                              : <RotateCcw size={11} />
                            }
                            Replay
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="logs-pagination">
                  <button
                    className="logs-page-btn"
                    disabled={hitsPage <= 1}
                    onClick={() => void fetchHits(hitsPage - 1)}
                  >
                    ← Prev
                  </button>
                  <span className="logs-page-info">
                    Page {hitsPage} of {totalPages}
                  </span>
                  <button
                    className="logs-page-btn"
                    disabled={hitsPage >= totalPages}
                    onClick={() => void fetchHits(hitsPage + 1)}
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
