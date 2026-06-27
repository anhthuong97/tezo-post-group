'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { vncApi } from '../api/vnc.api';

type VncPhase = 'login' | 'monitor' | 'idle' | null;

export function useVnc() {
  const [isLinux, setIsLinux]   = useState(false);
  const [phase, setPhase]       = useState<VncPhase>(null);
  const [wsPort, setWsPort]     = useState<number | null>(null);
  const [error, setError]       = useState('');
  const touchRef                = useRef<ReturnType<typeof setInterval> | null>(null);
  const vncTabRef               = useRef<Window | null>(null);

  const checkStatus = useCallback(async () => {
    const res = await vncApi.status().catch(() => null);
    if (!res) return;
    setIsLinux(res.isLinux);
    setPhase(res.phase as VncPhase);
    if (res.wsPort) setWsPort(res.wsPort);
  }, []);

  useEffect(() => { checkStatus(); }, [checkStatus]);

  const openNoVncTab = useCallback((port: number, viewOnly: boolean) => {
    const host = window.location.hostname;
    const url  = `http://${host}:${port}/vnc.html?autoconnect=1${viewOnly ? '&view_only=1' : ''}`;
    const tab  = window.open(url, '_blank');
    vncTabRef.current = tab;
    return tab;
  }, []);

  // Gọi khi user click "Đăng nhập Facebook" (trước openLoginPage)
  const startLoginVnc = useCallback(async (): Promise<boolean> => {
    setError('');
    const res = await vncApi.loginStart().catch(() => null);
    if (!res?.success) {
      setError(res?.error || 'Không thể khởi động VNC.');
      return false;
    }
    setPhase('login');
    setWsPort(res.wsPort);
    openNoVncTab(res.wsPort, false);
    return true;
  }, [openNoVncTab]);

  // Gọi sau khi login Facebook xong (tự động từ backend, nhưng cũng gọi ở đây để sync state)
  const stopLoginVnc = useCallback(async () => {
    await vncApi.loginStop().catch(() => {});
    setPhase('idle');
    if (vncTabRef.current && !vncTabRef.current.closed) {
      vncTabRef.current.close();
      vncTabRef.current = null;
    }
  }, []);

  // Bắt đầu theo dõi
  const startMonitor = useCallback(async () => {
    setError('');
    const res = await vncApi.monitorStart().catch(() => null);
    if (!res?.success) {
      setError(res?.error || 'Không thể bắt đầu theo dõi.');
      return;
    }
    setPhase('monitor');
    setWsPort(res.wsPort);
    openNoVncTab(res.wsPort, true);

    // Heartbeat mỗi 5 phút để server biết user vẫn đang xem
    if (touchRef.current) clearInterval(touchRef.current);
    touchRef.current = setInterval(() => {
      vncApi.monitorTouch().catch(() => {});
    }, 5 * 60 * 1000);
  }, [openNoVncTab]);

  const stopMonitor = useCallback(async () => {
    if (touchRef.current) { clearInterval(touchRef.current); touchRef.current = null; }
    await vncApi.monitorStop().catch(() => {});
    setPhase('idle');
  }, []);

  // Khi server tự tắt monitor sau 10 phút, sync lại state
  useEffect(() => {
    if (phase !== 'monitor') return;
    const id = setInterval(async () => {
      const res = await vncApi.status().catch(() => null);
      if (res?.phase !== 'monitor') {
        setPhase(res?.phase as VncPhase ?? null);
        if (touchRef.current) { clearInterval(touchRef.current); touchRef.current = null; }
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [phase]);

  return {
    isLinux,
    phase,
    wsPort,
    error,
    startLoginVnc,
    stopLoginVnc,
    startMonitor,
    stopMonitor,
  };
}
