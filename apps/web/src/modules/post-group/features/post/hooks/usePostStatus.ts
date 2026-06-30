'use client';
import { useState, useCallback } from 'react';
import { postApi } from '../api/post.api';
import { usePolling } from '@/shared/hooks/usePolling';
import type { PostStatusItem } from '../types/post.types';

export function usePostStatus() {
  const [status, setStatus]     = useState<PostStatusItem[]>([]);
  const [logs, setLogs]         = useState<string[]>([]);
  const [isPosting, setPosting] = useState(false);

  const pollStatus = useCallback(async () => {
    try {
      const res = await postApi.status();
      if (res?.status) {
        setStatus(res.status);
        const ACTIVE_STATUSES = new Set(['pending', 'uploading', 'writing', 'posting', 'commenting']);
        const active = res.status.some((i: PostStatusItem) => ACTIVE_STATUSES.has(i.status));
        setPosting(active);
      }
    } catch {}
  }, []);

  const pollLogs = useCallback(async () => {
    try {
      const res = await postApi.log();
      if (Array.isArray(res?.log)) setLogs(res.log);
    } catch {}
  }, []);

  usePolling(pollStatus, 2000, isPosting);
  usePolling(pollLogs,   3000, isPosting);

  const cancel    = useCallback((url: string) => postApi.cancel(url), []);
  const cancelAll = useCallback(() => postApi.cancelAll(), []);

  return { status, logs, isPosting, pollStatus, pollLogs, cancel, cancelAll };
}
