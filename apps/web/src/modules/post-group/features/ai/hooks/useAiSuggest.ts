'use client';
import { useState, useCallback } from 'react';
import { aiApi } from '../api/ai.api';

export function useAiSuggest(onSelect: (text: string) => void) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  const getSuggestions = useCallback(async (content: string) => {
    if (!content.trim()) { setError('Nhập nội dung trước.'); return; }
    setLoading(true); setError(''); setSuggestions([]);
    try {
      const res = await aiApi.suggest(content);
      if (res.success) setSuggestions(res.suggestions || []);
      else setError(res.error || 'Lỗi AI');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  const select = useCallback((text: string) => {
    onSelect(text);
    setSuggestions([]);
  }, [onSelect]);

  return { suggestions, loading, error, getSuggestions, select };
}
