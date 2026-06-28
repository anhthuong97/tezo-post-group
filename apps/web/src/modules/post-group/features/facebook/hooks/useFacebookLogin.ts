'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { ENDPOINTS } from '@/shared/lib/constants';

interface AgentStatus {
  online: boolean;
  syncedAt: string | null;
}

export function useFacebookLogin(_onLoggedIn?: () => void) {
  const [agentOnline, setAgentOnline]   = useState(false);
  const [syncedAt, setSyncedAt]         = useState<string | null>(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const pollRef                         = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINTS.agent.status, { credentials: 'include' });
      if (!res.ok) return;
      const data: AgentStatus = await res.json();
      setAgentOnline(data.online);
      setSyncedAt(data.syncedAt);
    } catch {}
  }, []);

  useEffect(() => {
    checkStatus();
    pollRef.current = setInterval(checkStatus, 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [checkStatus]);

  // Alias fields để tương thích với LoginSection props cũ
  return {
    // agent status
    agentOnline, syncedAt,
    loading, error,
    // stub fields cho các component dùng hook này
    mode:              agentOnline ? 'logged-in' : 'open' as 'open' | 'waiting' | 'logged-in',
    identityLoading:   false,
    identityFailed:    false,
    identitySwitching: false,
    currentIdentity:   '',
    switchable:        [] as string[],
    // actions
    checkSession:      checkStatus,
    openLogin:         async () => {},
    logoutFacebook:    async () => {},
    switchIdentity:    async (_name: string) => {},
    loadIdentities:    async () => '',
    setLoading,
    setError,
  };
}
