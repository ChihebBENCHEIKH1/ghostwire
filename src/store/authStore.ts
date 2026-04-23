import { create } from 'zustand';

export interface AuthUser {
  id:       number;
  username: string;
  role:     string;
}

interface AuthState {
  token:    string | null;
  user:     AuthUser | null;
  isAuthed: boolean;
  authError: string | null;
  authLoading: boolean;
  login:    (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout:   () => void;
  restoreSession: () => void;
}

const BASE = process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:3001';

async function authRequest(path: string, body: object): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as { token: string; user: AuthUser };
}

export const useAuthStore = create<AuthState>((set) => ({
  token:       null,
  user:        null,
  isAuthed:    false,
  authError:   null,
  authLoading: false,

  login: async (username, password) => {
    set({ authLoading: true, authError: null });
    try {
      const { token, user } = await authRequest('/api/auth/login', { username, password });
      if (typeof window !== 'undefined') localStorage.setItem('auth_token', token);
      set({ token, user, isAuthed: true, authLoading: false });
    } catch (err) {
      set({ authError: (err as Error).message, authLoading: false });
    }
  },

  register: async (username, password) => {
    set({ authLoading: true, authError: null });
    try {
      const { token, user } = await authRequest('/api/auth/register', { username, password });
      if (typeof window !== 'undefined') localStorage.setItem('auth_token', token);
      set({ token, user, isAuthed: true, authLoading: false });
    } catch (err) {
      set({ authError: (err as Error).message, authLoading: false });
    }
  },

  logout: () => {
    if (typeof window !== 'undefined') localStorage.removeItem('auth_token');
    set({ token: null, user: null, isAuthed: false });
  },

  restoreSession: () => {
    if (typeof window === 'undefined') return;
    const stored = localStorage.getItem('auth_token');
    if (!stored) return;
    try {
      // Decode payload (not verify — server will reject if expired)
      const parts = stored.split('.');
      if (parts.length !== 3) return;
      const payload = JSON.parse(atob(parts[1]!));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        localStorage.removeItem('auth_token');
        return;
      }
      set({
        token:   stored,
        user:    { id: payload.userId, username: payload.username, role: payload.role },
        isAuthed: true,
      });
    } catch {
      localStorage.removeItem('auth_token');
    }
  },
}));
