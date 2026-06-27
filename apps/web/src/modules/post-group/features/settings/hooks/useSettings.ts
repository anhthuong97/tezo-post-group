'use client';
import { useState, useCallback } from 'react';
import { settingsApi } from '../api/settings.api';

export function useSettings() {
  const [geminiMasked, setGeminiMasked]   = useState('');
  const [openaiMasked, setOpenaiMasked]   = useState('');
  const [geminiVal, setGeminiVal]         = useState('');
  const [openaiVal, setOpenaiVal]         = useState('');
  const [geminiHasKey, setGeminiHasKey]   = useState(false);
  const [openaiHasKey, setOpenaiHasKey]   = useState(false);
  const [priority, setPriority]           = useState<'gemini' | 'openai'>('gemini');
  const [loading, setLoading]             = useState(false);
  const [saved, setSaved]                 = useState(false);

  const load = useCallback(async () => {
    const res = await settingsApi.getKeys().catch(() => null);
    if (!res?.keys) return;
    const gMasked = res.keys.gemini?.masked || '';
    const oMasked = res.keys.openai?.masked  || '';
    setGeminiMasked(gMasked);
    setOpenaiMasked(oMasked);
    setGeminiHasKey(res.keys.gemini?.hasKey || false);
    setOpenaiHasKey(res.keys.openai?.hasKey  || false);
    setPriority(res.keys.priority || 'gemini');
    // Hiển thị masked key trong ô input để người dùng thấy có key
    setGeminiVal(gMasked);
    setOpenaiVal(oMasked);
  }, []);

  const save = useCallback(async () => {
    setLoading(true); setSaved(false);
    try {
      // Chỉ gửi key khi người dùng đã nhập giá trị mới (khác masked)
      const newGemini = geminiVal !== geminiMasked && geminiVal.trim() ? geminiVal.trim() : undefined;
      const newOpenai = openaiVal !== openaiMasked && openaiVal.trim() ? openaiVal.trim() : undefined;
      await settingsApi.updateKeys(newGemini, newOpenai);
      await settingsApi.updatePriority(priority);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await load(); // reload để cập nhật masked
    } finally { setLoading(false); }
  }, [geminiVal, geminiMasked, openaiVal, openaiMasked, priority, load]);

  return {
    geminiMasked, geminiHasKey, geminiVal, setGeminiVal,
    openaiMasked, openaiHasKey, openaiVal, setOpenaiVal,
    priority, setPriority,
    loading, saved, load, save,
  };
}
