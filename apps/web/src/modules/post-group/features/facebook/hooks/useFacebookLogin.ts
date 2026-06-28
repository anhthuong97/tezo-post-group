'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { api } from '@/shared/lib/api-client';
import { ENDPOINTS } from '@/shared/lib/constants';

export interface FbIdentity {
  id: string;
  name: string;
  type: 'personal' | 'page';
  href?: string;
  is_active?: boolean;
}

export function useFacebookLogin(_onLoggedIn?: () => void) {
  const [agentOnline, setAgentOnline]         = useState(false);
  const [syncedAt, setSyncedAt]               = useState<string | null>(null);
  const [identities, setIdentities]           = useState<FbIdentity[]>([]);
  const [currentIdentity, setCurrentIdentity] = useState<FbIdentity | null>(null);
  const [switching, setSwitching]             = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState('');
  const pollRef                               = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkStatus = useCallback(async () => {
    try {
      const res = await fetch(ENDPOINTS.agent.status, { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      setAgentOnline(data.online);
      setSyncedAt(data.syncedAt);
      if (data.currentIdentity) setCurrentIdentity(data.currentIdentity);
    } catch {}
  }, []);

  const fetchIdentities = useCallback(async () => {
    try {
      const res: any = await api.get(ENDPOINTS.agent.identities);
      if (res.identities) {
        setIdentities(res.identities);
        const active = res.identities.find((i: FbIdentity) => i.is_active);
        if (active) setCurrentIdentity(active);
        else if (res.identities.length > 0) setCurrentIdentity(res.identities[0]);
      }
    } catch {}
  }, []);

  useEffect(() => {
    checkStatus();
    fetchIdentities();
    pollRef.current = setInterval(() => {
      checkStatus();
      fetchIdentities();
    }, 10_000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [checkStatus, fetchIdentities]);

  const switchIdentity = useCallback(async (identityId: string) => {
    if (switching) return; // chặn double-click khi đang chuyển
    setSwitching(true);
    setError('');
    try {
      const found = identities.find(i => i.id === identityId);
      if (found) setCurrentIdentity(found); // optimistic update để UI phản hồi ngay

      const res: any = await api.post(ENDPOINTS.agent.switchIdentity, { identityId });
      if (!res?.success) {
        setError(res?.error || 'Agent chưa kết nối.');
        return;
      }

      // Poll task đến khi done — blocking như logic cũ (VPS blocking HTTP)
      const taskId: number = res.taskId;
      if (taskId) {
        const deadline = Date.now() + 120_000; // tối đa 2 phút
        while (Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 3000));
          try {
            const t: any = await api.get(`${ENDPOINTS.agent.task}/${taskId}`);
            const status = t?.task?.status;
            if (status === 'done' || status === 'error') break;
          } catch {}
        }
      }
    } catch (e: any) {
      setError(e.message || 'Lỗi chuyển tư cách');
    } finally {
      setSwitching(false);
    }
  }, [identities, switching]);

  return {
    agentOnline,
    syncedAt,
    identities,
    currentIdentity,
    switching,
    loading, error,
    checkStatus,
    fetchIdentities,
    switchIdentity,
    setLoading, setError,
    // stub compat
    mode: agentOnline ? 'logged-in' : 'open' as 'open' | 'waiting' | 'logged-in',
  };
}
