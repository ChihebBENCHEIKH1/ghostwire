'use client';

import { useState } from 'react';
import { GitBranch, LayoutDashboard, ScrollText, LogOut, Bot } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { useInfraStore, type AppView } from '@/store/infraStore';
import { useAuthStore } from '@/store/authStore';
import NotificationBell from './NotificationBell';
import AiChatPanel from './AiChatPanel';

const ITEMS: { view: AppView; Icon: React.ElementType; label: string }[] = [
  { view: 'architect',  Icon: GitBranch,       label: 'Architect'   },
  { view: 'dashboard',  Icon: LayoutDashboard, label: 'Dashboard'   },
  { view: 'logs',       Icon: ScrollText,      label: 'Log Explorer' },
];

export default function NavRail() {
  const activeView    = useInfraStore(s => s.activeView);
  const setActiveView = useInfraStore(s => s.setActiveView);
  const logout        = useAuthStore(s => s.logout);
  const user          = useAuthStore(s => s.user);
  const [chatOpen, setChatOpen] = useState(false);

  return (
    <nav className="nav-rail">
      {/* Brand mark */}
      <div className="nav-rail-brand">
        <span className="nav-rail-brand-dot" />
      </div>

      {/* Nav items */}
      <div className="nav-rail-items">
        {ITEMS.map(({ view, Icon, label }) => (
          <button
            key={view}
            className={`nav-rail-item ${activeView === view ? 'active' : ''}`}
            onClick={() => setActiveView(view)}
            title={label}
          >
            <Icon size={18} />
            <span className="nav-rail-label">{label}</span>
            {activeView === view && <span className="nav-rail-indicator" />}
          </button>
        ))}
      </div>

      {/* Bottom: AI chat + notifications + user avatar + logout */}
      <div className="nav-rail-bottom">
        <button
          className={`nav-rail-item nav-rail-chat-btn ${chatOpen ? 'active' : ''}`}
          onClick={() => setChatOpen(o => !o)}
          title="AI Copilot"
        >
          <Bot size={18} />
          <span className="nav-rail-label">Copilot</span>
        </button>

        <NotificationBell />

        <div className="nav-rail-avatar" title={user?.username ?? 'User'}>
          {(user?.username?.[0] ?? 'U').toUpperCase()}
        </div>

        <button className="nav-rail-logout" onClick={logout} title="Sign out">
          <LogOut size={15} />
        </button>
      </div>
      <AnimatePresence>
        {chatOpen && <AiChatPanel onClose={() => setChatOpen(false)} />}
      </AnimatePresence>
    </nav>
  );
}
