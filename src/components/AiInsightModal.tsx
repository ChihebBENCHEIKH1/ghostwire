'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles, Bot, AlertCircle } from 'lucide-react';
import { api } from '@/services/api';

interface Props {
  payload: Record<string, unknown>;
  onClose: () => void;
}

export default function AiInsightModal({ payload, onClose }: Props) {
  const [text, setText]       = useState('');
  const [done, setDone]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const scrollRef             = useRef<HTMLDivElement>(null);
  const abortRef              = useRef(false);

  useEffect(() => {
    abortRef.current = false;
    setText('');
    setDone(false);
    setError(null);

    void api.analyzePayload(payload, (token) => {
      if (abortRef.current) return;
      setText(prev => prev + token);
      // auto-scroll
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    })
      .then(() => { if (!abortRef.current) setDone(true); })
      .catch((err: Error) => { if (!abortRef.current) setError(err.message); });

    return () => { abortRef.current = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        className="ai-modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="ai-modal"
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1,    y: 0  }}
          exit={{    opacity: 0, scale: 0.92, y: 16 }}
          transition={{ type: 'spring', stiffness: 340, damping: 26 }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="ai-modal-header">
            <div className="ai-modal-header-left">
              <div className="ai-modal-icon">
                <Sparkles size={14} />
              </div>
              <div>
                <div className="ai-modal-title">AI Root Cause Analysis</div>
                <div className="ai-modal-subtitle">deepseek-r1:1.5b via Ollama</div>
              </div>
            </div>
            <button className="ai-modal-close" onClick={onClose}>
              <X size={14} />
            </button>
          </div>

          {/* Payload preview */}
          <div className="ai-modal-payload-label">
            <Bot size={11} /> Analyzed payload
          </div>
          <pre className="ai-modal-payload">
            {JSON.stringify(payload, null, 2)}
          </pre>

          {/* AI response */}
          <div className="ai-modal-response-label">
            <Sparkles size={11} /> AI insight
          </div>
          <div className="ai-modal-response" ref={scrollRef}>
            {error ? (
              <div className="ai-modal-error">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            ) : text ? (
              <>
                <span>{text}</span>
                {!done && <span className="ai-cursor" />}
              </>
            ) : (
              <div className="ai-modal-thinking">
                <span className="ai-thinking-dot" />
                <span className="ai-thinking-dot" />
                <span className="ai-thinking-dot" />
                <span className="ai-thinking-label">Thinking...</span>
              </div>
            )}
          </div>

          {done && (
            <motion.div
              className="ai-modal-footer"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <span className="ai-modal-done-badge">✓ Analysis complete</span>
              <button className="ai-modal-close-btn" onClick={onClose}>Close</button>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
