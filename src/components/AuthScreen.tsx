'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Rocket, Lock, User, Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';

export default function AuthScreen() {
  const [mode, setMode]         = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);

  const login      = useAuthStore(s => s.login);
  const register   = useAuthStore(s => s.register);
  const authError  = useAuthStore(s => s.authError);
  const authLoading = useAuthStore(s => s.authLoading);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') await login(username, password);
    else                  await register(username, password);
  };

  return (
    <div className="auth-bg">
      {/* Ambient orbs */}
      <div className="auth-orb auth-orb-1" />
      <div className="auth-orb auth-orb-2" />
      <div className="auth-orb auth-orb-3" />

      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0,  scale: 1    }}
        transition={{ type: 'spring', stiffness: 320, damping: 28 }}
      >
        {/* Logo */}
        <div className="auth-logo-wrap">
          <div className="auth-logo-icon">
            <Rocket size={22} />
          </div>
          <div>
            <div className="auth-logo-title">Visual API Builder</div>
            <div className="auth-logo-sub">SaaS Observability Platform</div>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
            onClick={() => setMode('login')}
          >
            Sign In
          </button>
          <button
            className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
            onClick={() => setMode('register')}
          >
            Create Account
          </button>
        </div>

        <AnimatePresence mode="wait">
          <motion.form
            key={mode}
            onSubmit={handleSubmit}
            className="auth-form"
            initial={{ opacity: 0, x: mode === 'login' ? -16 : 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            {/* Username */}
            <label className="auth-field">
              <span className="auth-field-label">Username</span>
              <div className="auth-input-wrap">
                <User size={14} className="auth-input-icon" />
                <input
                  className="auth-input"
                  type="text"
                  placeholder="your-username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                />
              </div>
            </label>

            {/* Password */}
            <label className="auth-field">
              <span className="auth-field-label">Password</span>
              <div className="auth-input-wrap">
                <Lock size={14} className="auth-input-icon" />
                <input
                  className="auth-input"
                  type={showPw ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  required
                />
                <button
                  type="button"
                  className="auth-pw-toggle"
                  onClick={() => setShowPw(p => !p)}
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </label>

            {/* Error */}
            <AnimatePresence>
              {authError && (
                <motion.div
                  className="auth-error"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                >
                  {authError}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <button
              type="submit"
              className="auth-submit"
              disabled={authLoading}
            >
              {authLoading
                ? <Loader2 size={16} className="auth-spin" />
                : (mode === 'login' ? 'Sign In' : 'Create Account')}
            </button>
          </motion.form>
        </AnimatePresence>

        <p className="auth-hint">
          {mode === 'login'
            ? <>No account? <button className="auth-link" onClick={() => setMode('register')}>Register</button></>
            : <>Have an account? <button className="auth-link" onClick={() => setMode('login')}>Sign in</button></>
          }
        </p>
      </motion.div>
    </div>
  );
}
