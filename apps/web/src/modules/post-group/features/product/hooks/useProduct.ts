'use client';
import { useState, useCallback } from 'react';
import { productApi } from '../api/product.api';

export function useProduct(
  onFetched: (content: string, url: string) => void,
  onImagesReady?: (filenames: string[]) => void,
) {
  const [url, setUrl]         = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const fetchAndBuild = useCallback(async () => {
    if (!url.trim()) { setError('Nhập URL sản phẩm.'); return; }
    setLoading(true); setError('');
    try {
      const res = await productApi.fetch(url.trim());
      if (!res.success) { setError(res.error || 'Lỗi'); return; }
      onFetched(res.content, url.trim());
      if (res.imageFiles?.length > 0) onImagesReady?.(res.imageFiles);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [url, onFetched, onImagesReady]);

  return { url, setUrl, loading, error, fetchAndBuild };
}
