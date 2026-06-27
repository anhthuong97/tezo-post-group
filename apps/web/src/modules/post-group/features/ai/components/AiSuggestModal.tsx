'use client';
import { useState, useCallback, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { Modal } from '@/shared/components/Modal';
import { Button } from '@/shared/components/Button';
import { aiApi } from '../api/ai.api';

interface AiSuggestModalProps {
  open: boolean;
  onClose: () => void;
  content: string;
  onSelect: (text: string) => void;
}

export function AiSuggestModal({ open, onClose, content, onSelect }: AiSuggestModalProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [selected, setSelected]       = useState<number | null>(null);
  const hasGenerated                  = useRef(false);

  const generate = useCallback(async () => {
    if (!content.trim()) { setError('Nhập nội dung trước rồi hãy gợi ý.'); return; }
    setLoading(true); setError(''); setSelected(null); setSuggestions([]);
    try {
      const res = await aiApi.suggest(content);
      if (res.success) setSuggestions(res.suggestions || []);
      else setError(res.error || 'Lỗi AI không xác định');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }, [content]);

  // Tự generate ngay khi modal mở lần đầu
  useEffect(() => {
    if (open && !hasGenerated.current) {
      hasGenerated.current = true;
      generate();
    }
    if (!open) hasGenerated.current = false;
  }, [open, generate]);

  const handleSelect = (text: string) => {
    onSelect(text);
    onClose();
    setSuggestions([]);
    setSelected(null);
    hasGenerated.current = false;
  };

  return (
    <Modal open={open} onClose={onClose} title="Gợi ý nội dung bằng AI" maxWidth="max-w-2xl">
      <div className="flex flex-col gap-3">

        {/* Header actions */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {loading
              ? 'AI đang tạo nội dung...'
              : suggestions.length > 0
              ? `${suggestions.length} phiên bản gợi ý — click vào để chọn`
              : 'Nhấn Làm mới để tạo gợi ý'}
          </p>
          <Button variant="secondary" loading={loading} onClick={generate} className="text-xs px-3 h-8 gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            Làm mới
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-600">
            {error}
          </div>
        )}

        {/* Skeleton khi loading */}
        {loading && (
          <div className="flex flex-col gap-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="rounded-xl border border-gray-100 p-3 animate-pulse">
                <div className="h-3 bg-gray-200 rounded w-full mb-2" />
                <div className="h-3 bg-gray-200 rounded w-5/6 mb-2" />
                <div className="h-3 bg-gray-200 rounded w-3/6" />
              </div>
            ))}
          </div>
        )}

        {/* Danh sách gợi ý */}
        {!loading && suggestions.length > 0 && (
          <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto pr-1">
            {suggestions.map((s, i) => {
              const isSelected = selected === i;
              return (
                <div
                  key={i}
                  onClick={() => setSelected(isSelected ? null : i)}
                  className={`rounded-xl border-2 p-3 cursor-pointer transition-all select-none ${
                    isSelected
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-100 hover:border-blue-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex gap-2">
                    <span className={`text-[10px] font-bold shrink-0 mt-0.5 ${isSelected ? 'text-blue-500' : 'text-gray-300'}`}>
                      #{i + 1}
                    </span>
                    <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed flex-1">{s}</p>
                  </div>
                  {isSelected && (
                    <div className="mt-2.5 flex justify-end">
                      <Button variant="primary" onClick={(e) => { e.stopPropagation(); handleSelect(s); }} className="text-xs px-4 h-7">
                        ✓ Dùng phiên bản này
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex justify-between items-center pt-1 border-t border-gray-100">
          <span className="text-xs text-gray-400">
            {selected !== null ? `Đã chọn phiên bản #${selected + 1}` : ''}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} className="text-xs h-8">Đóng</Button>
            {selected !== null && (
              <Button variant="primary" onClick={() => handleSelect(suggestions[selected])} className="text-xs h-8">
                ✓ Dùng phiên bản #{selected + 1}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
