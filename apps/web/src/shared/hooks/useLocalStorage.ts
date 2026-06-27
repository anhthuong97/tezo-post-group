'use client';
import { useState, useEffect } from 'react';

export function useLocalStorage<T>(key: string, defaultValue: T) {
  // Luôn bắt đầu bằng defaultValue để server và client render giống nhau
  const [value, setValue] = useState<T>(defaultValue);
  const [mounted, setMounted] = useState(false);

  // Sau khi mount: đọc từ localStorage
  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) setValue(JSON.parse(stored));
    } catch {}
  }, [key]);

  // Ghi xuống localStorage khi value thay đổi (sau khi mounted)
  useEffect(() => {
    if (!mounted) return;
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch {}
  }, [key, value, mounted]);

  return [value, setValue] as const;
}
