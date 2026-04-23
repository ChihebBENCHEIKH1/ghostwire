'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, X, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInfraStore } from '@/store/infraStore';

export default function NotificationBell() {
  const [open, setOpen]       = useState(false);
  const panelRef              = useRef<HTMLDivElement>(null);
  const unreadCount           = useInfraStore(s => s.unreadCount);
  const notifications         = useInfraStore(s => s.notifications);
  const markAllRead           = useInfraStore(s => s.markAllRead);
  const clearAll              = useInfraStore(s => s.clearAll);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleOpen = () => {
    setOpen(o => !o);
    if (!open && unreadCount > 0) markAllRead();
  };

  return (
    <div className="notif-bell-wrap" ref={panelRef}>
      <button className="nav-rail-item notif-bell-btn" onClick={handleOpen} title="Notifications">
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="notif-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
        )}
        <span className="nav-rail-label">Alerts</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="notif-panel"
            initial={{ opacity: 0, x: 16, scale: 0.96 }}
            animate={{ opacity: 1, x: 0,  scale: 1    }}
            exit={{ opacity: 0, x: 16, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          >
            <div className="notif-panel-header">
              <span className="notif-panel-title">System Alerts</span>
              {notifications.length > 0 && (
                <button className="notif-clear-btn" onClick={clearAll}>Clear all</button>
              )}
            </div>

            <div className="notif-list">
              {notifications.length === 0 ? (
                <div className="notif-empty">
                  <Bell size={24} opacity={0.2} />
                  <span>No alerts yet</span>
                </div>
              ) : (
                notifications.map(n => (
                  <div key={n.id} className={`notif-item ${n.read ? 'read' : 'unread'}`}>
                    <div className="notif-item-icon">
                      <AlertTriangle size={14} />
                    </div>
                    <div className="notif-item-body">
                      <div className="notif-item-title">Critical System Degradation</div>
                      <div className="notif-item-desc">
                        <strong>{n.nodeLabel}</strong> failed <strong>{n.count}×</strong> in a row
                        (threshold: {n.threshold})
                      </div>
                      <div className="notif-item-ts">{new Date(n.ts).toLocaleTimeString()}</div>
                    </div>
                    <div className="notif-item-sev" />
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
