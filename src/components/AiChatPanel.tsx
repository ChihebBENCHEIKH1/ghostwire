'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X, Bot, Send, Trash2, Sparkles } from 'lucide-react';
import { api } from '@/services/api';

interface Message {
  id:      number;
  role:    'user' | 'assistant';
  content: string;
  pending?: boolean;
}

let msgSeq = 0;

interface Props { onClose: () => void; }

export default function AiChatPanel({ onClose }: Props) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id:      ++msgSeq,
      role:    'assistant',
      content: 'Hey! I\'m your AI DevOps Copilot. Ask me anything about your pipeline, infrastructure, or general DevOps topics.',
    },
  ]);
  const [input,    setInput]    = useState('');
  const [busy,     setBusy]     = useState(false);
  const bottomRef               = useRef<HTMLDivElement>(null);
  const textareaRef             = useRef<HTMLTextAreaElement>(null);
  const abortRef                = useRef(false);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;

    const userMsg: Message = { id: ++msgSeq, role: 'user', content: text };
    const asstId = ++msgSeq;
    const asstMsg: Message = { id: asstId, role: 'assistant', content: '', pending: true };

    setMessages(prev => [...prev, userMsg, asstMsg]);
    setInput('');
    setBusy(true);
    abortRef.current = false;

    // Build history for context (exclude the pending assistant msg)
    const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }));

    try {
      await api.chatWithAi(text, history, (token) => {
        if (abortRef.current) return;
        setMessages(prev => prev.map(m =>
          m.id === asstId ? { ...m, content: m.content + token, pending: true } : m
        ));
      });
      setMessages(prev => prev.map(m =>
        m.id === asstId ? { ...m, pending: false } : m
      ));
    } catch (err) {
      setMessages(prev => prev.map(m =>
        m.id === asstId
          ? { ...m, content: `⚠ Error: ${err instanceof Error ? err.message : String(err)}`, pending: false }
          : m
      ));
    }
    setBusy(false);
  }, [input, busy, messages]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
  };

  const clearChat = () => {
    setMessages([{
      id:      ++msgSeq,
      role:    'assistant',
      content: 'Chat cleared. How can I help you?',
    }]);
  };

  const panel = (
    <motion.div
      className="ai-chat-panel"
      initial={{ opacity: 0, x: 24, scale: 0.96 }}
      animate={{ opacity: 1, x: 0,  scale: 1    }}
      exit={{    opacity: 0, x: 24, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 360, damping: 28 }}
    >
      {/* Header */}
      <div className="ai-chat-header">
        <div className="ai-chat-header-left">
          <div className="ai-chat-avatar">
            <Bot size={14} />
          </div>
          <div>
            <div className="ai-chat-title">AI DevOps Copilot</div>
            <div className="ai-chat-subtitle">
              {busy
                ? <><span className="ai-chat-dot blink" /> Generating...</>
                : <><span className="ai-chat-dot online" /> deepseek-r1:1.5b</>
              }
            </div>
          </div>
        </div>
        <div className="ai-chat-header-actions">
          <button className="ai-chat-icon-btn" onClick={clearChat} title="Clear chat">
            <Trash2 size={13} />
          </button>
          <button className="ai-chat-icon-btn" onClick={onClose} title="Close">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="ai-chat-messages">
        {messages.map(msg => (
          <div key={msg.id} className={`ai-chat-msg ai-chat-msg--${msg.role}`}>
            {msg.role === 'assistant' && (
              <div className="ai-chat-msg-avatar">
                <Sparkles size={10} />
              </div>
            )}
            <div className="ai-chat-msg-bubble">
              {msg.content || (msg.pending && (
                <span className="ai-chat-thinking">
                  <span /><span /><span />
                </span>
              ))}
              {msg.pending && msg.content && <span className="ai-cursor" />}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="ai-chat-input-row">
        <textarea
          ref={textareaRef}
          className="ai-chat-input"
          placeholder="Ask anything… (Enter to send, Shift+Enter for new line)"
          value={input}
          rows={1}
          disabled={busy}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="ai-chat-send-btn"
          onClick={() => void send()}
          disabled={!input.trim() || busy}
          title="Send"
        >
          <Send size={14} />
        </button>
      </div>
    </motion.div>
  );

  return createPortal(panel, document.body);
}
