'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { facebookApi, identityApi } from '../api/facebook.api';
import { useLocalStorage } from '@/shared/hooks/useLocalStorage';
import type { LoginMode } from '../types/facebook.types';

export function useFacebookLogin(onLoggedIn?: () => void) {
  const [mode, setMode]                           = useState<LoginMode>('open');
  const [loading, setLoading]                     = useState(false);        // chỉ cho open/logout
  const [identitySwitching, setIdentitySwitching] = useState(false);       // chỉ cho switch identity
  const [error, setError]                         = useState('');
  const [identityLoading, setIdentityLoading]     = useState(false);
  const [identityFailed, setIdentityFailed]       = useState(false);
  const [currentIdentity, setCurrentIdentity] = useLocalStorage<string>('pg_identity', '');
  const [switchable, setSwitchable]           = useLocalStorage<string[]>('pg_switchable', []);
  const pollingRef                            = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
  };

  // Trả về tên identity vừa load để caller dùng cho pipeline (không cần đợi re-render)
  const loadIdentities = useCallback(async (): Promise<string> => {
    setIdentityLoading(true);
    setIdentityFailed(false);
    const res = await identityApi.list().catch(() => null);
    setIdentityLoading(false);
    if (!res?.success) { setIdentityFailed(true); return ''; }
    const name = res.current || '';
    const sw   = res.switchable || [];
    setCurrentIdentity(name);
    setSwitchable(sw);
    if (!name && sw.length === 0) setIdentityFailed(true);
    return name;
  }, [setCurrentIdentity, setSwitchable]);

  const handleLoggedIn = useCallback(() => {
    setMode('logged-in');
    onLoggedIn?.();
  }, [onLoggedIn]);

  // Polling khi 'waiting' — auto-detect login
  useEffect(() => {
    if (mode !== 'waiting') { stopPolling(); return; }
    pollingRef.current = setInterval(async () => {
      const res = await facebookApi.checkLogin().catch(() => null);
      if (res?.loggedIn) { stopPolling(); handleLoggedIn(); }
    }, 2500);
    return stopPolling;
  }, [mode, handleLoggedIn]);

  const checkSession = useCallback(async () => {
    const res = await facebookApi.hasSession();
    if (res.hasSession) handleLoggedIn();
  }, [handleLoggedIn]);

  const openLogin = useCallback(async () => {
    setLoading(true); setError('');
    try {
      await facebookApi.openLogin();
      setMode('waiting');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const logoutFacebook = useCallback(async () => {
    stopPolling();
    await facebookApi.logoutFacebook().catch(() => {});
    setMode('open');
    setCurrentIdentity('');
    setSwitchable([]);
  }, [setCurrentIdentity, setSwitchable]);

  const switchIdentity = useCallback(async (name: string) => {
    setIdentitySwitching(true);
    const oldIdentity = currentIdentity;
    try {
      await identityApi.switch(name);
      // Đổi chỗ: currentIdentity ← name, switchable ← bỏ name, thêm oldIdentity vào
      setCurrentIdentity(name);
      setSwitchable((prev) => {
        const next = prev.filter((s) => s !== name);
        if (oldIdentity && oldIdentity !== name) next.push(oldIdentity);
        return next;
      });
    } catch (e: any) { setError(e.message); }
    finally { setIdentitySwitching(false); }
  }, [currentIdentity, setCurrentIdentity, setSwitchable]);

  return {
    mode, loading, identitySwitching, error,
    identityLoading, identityFailed, currentIdentity, switchable,
    checkSession, openLogin, logoutFacebook, switchIdentity, loadIdentities,
  };
}
