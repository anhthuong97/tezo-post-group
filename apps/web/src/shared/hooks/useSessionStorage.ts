'use client';
import { useState, useEffect } from 'react';

export function useSessionStorage<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(defaultValue);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = sessionStorage.getItem(key);
      if (stored !== null) setValue(JSON.parse(stored));
    } catch {}
  }, [key]);

  useEffect(() => {
    if (!mounted) return;
    try { sessionStorage.setItem(key, JSON.stringify(value)); }
    catch {}
  }, [key, value, mounted]);

  return [value, setValue] as const;
}
