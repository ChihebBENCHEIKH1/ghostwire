'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Zap, CheckCircle2 } from 'lucide-react';
import { useFlowStore } from '@/store/flowStore';

const DISMISS_MS = 7000;

function tokenizeJSON(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/(\"[\w\s@.-]+\")\s*:/g, '<span class="jk">$1</span>:')
    .replace(/:\s*(\"(?:[^\"\\]|\\.)*\")/g, ': <span class="js">$1</span>')
    .replace(/:\s*(-?\d+\.?\d*)/g, ': <span class="jn">$1</span>')
    .replace(/:\s*(true|false|null)/g, ': <span class="jb">$1</span>');
}

/**
 * Toast — surfaces the most recent webhook payload as a live card.
 * Driven by `logs`: shows whenever a pipeline_log with level='success' arrives.
 */
export default function Toast() {
  const logs    = useFlowStore(s => s.logs);
  const [toastData, setToastData] = useState<{ event: string; ts: string } | null>(null);
  const [visible, setVisible]     = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Show toast on each new success log
  useEffect(() => {
    const last = logs.findLast(l => l.level === 'success');
    if (!last) return;
    setToastData({ event: last.text, ts: last.ts });
    setVisible(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setVisible(false);
      setTimeout(() => setToastData(null), 400);
    }, DISMISS_MS);
    return () => { if (timer.current) clearTimeout(timer.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs.length]);

  const dismiss = () => {
    if (timer.current) clearTimeout(timer.current);
    setVisible(false);
    setTimeout(() => setToastData(null), 400);
  };

  return (
    <AnimatePresence>
      {visible && toastData && (
        <motion.div
          key="toast"
          className="toast-card"
          initial={{ opacity: 0, y: 48, scale: 0.93 }}
          animate={{ opacity: 1, y: 0,  scale: 1    }}
          exit={{ opacity: 0, y: 24,  scale: 0.96   }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
        >
          <motion.div
            className="toast-progress"
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: DISMISS_MS / 1000, ease: 'linear' }}
          />

          <div className="toast-body">
            <div className="toast-header">
              <div className="toast-header-left">
                <div className="toast-live-badge">
                  <div className="toast-live-dot-wrap">
                    <span className="toast-live-ping" />
                    <span className="toast-live-dot" />
                  </div>
                  <span className="toast-live-label">Live</span>
                </div>
                <div className="toast-title-wrap">
                  <span className="toast-title">Pipeline Complete</span>
                  <span className="toast-subtitle">{toastData.ts}</span>
                </div>
              </div>
              <button className="toast-close" onClick={dismiss}><X size={13} /></button>
            </div>

            <div className="toast-event-row">
              <div className="toast-event-chip">
                <Zap size={10} color="#67e8f9" fill="#67e8f9" />
                <span className="toast-event-name">success</span>
              </div>
              <div className="toast-check">
                <CheckCircle2 size={11} />
                <span>All nodes completed</span>
              </div>
            </div>

            <div
              className="toast-code"
              dangerouslySetInnerHTML={{ __html: tokenizeJSON(toastData.event) }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
