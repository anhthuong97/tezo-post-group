'use client';
import { useEffect } from 'react';
import { Modal } from '@/shared/components/Modal';
import { Button } from '@/shared/components/Button';
import { useSettings } from '../hooks/useSettings';

interface ApiKeyModalProps {
  open: boolean;
  onClose: () => void;
}

export function ApiKeyModal({ open, onClose }: ApiKeyModalProps) {
  const {
    geminiHasKey, geminiVal, setGeminiVal,
    openaiHasKey, openaiVal, setOpenaiVal,
    priority, setPriority,
    loading, saved, load, save,
  } = useSettings();

  useEffect(() => { if (open) load(); }, [open, load]);

  const handleSave = async () => {
    await save();
    if (!loading) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Cấu hình API Key AI" maxWidth="max-w-md">
      <div className="flex flex-col gap-4">

        {/* Gemini */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 w-10 justify-center">
            <input type="radio" name="priority" value="gemini"
              checked={priority === 'gemini'} onChange={() => setPriority('gemini')}
              className="accent-blue-500" />
          </label>
          <div className="flex-1">
            <label className="label">
              Gemini Key {geminiHasKey && <span className="text-green-500 text-xs font-normal ml-1">✓ Đã có key</span>}
            </label>
            <input
              type="text"
              value={geminiVal}
              onChange={(e) => setGeminiVal(e.target.value)}
              onFocus={(e) => { if (e.target.value === geminiVal && geminiHasKey) e.target.select(); }}
              placeholder="Dán Gemini API Key..."
              autoComplete="off"
              className="input font-mono text-sm"
            />
          </div>
        </div>

        {/* OpenAI */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 w-10 justify-center">
            <input type="radio" name="priority" value="openai"
              checked={priority === 'openai'} onChange={() => setPriority('openai')}
              className="accent-blue-500" />
          </label>
          <div className="flex-1">
            <label className="label">
              OpenAI Key {openaiHasKey && <span className="text-green-500 text-xs font-normal ml-1">✓ Đã có key</span>}
            </label>
            <input
              type="text"
              value={openaiVal}
              onChange={(e) => setOpenaiVal(e.target.value)}
              onFocus={(e) => { if (e.target.value === openaiVal && openaiHasKey) e.target.select(); }}
              placeholder="Dán OpenAI API Key..."
              autoComplete="off"
              className="input font-mono text-sm"
            />
          </div>
        </div>

        <p className="text-xs text-gray-400">
          Chọn radio = ưu tiên provider đó. Để nguyên giá trị = giữ key cũ. Xóa hết rồi lưu = không thay đổi.
        </p>

        <div className="flex justify-center pt-1">
          <Button variant="primary" loading={loading} minWidth="140px" onClick={handleSave}>
            {saved ? '✓ Đã lưu' : 'Lưu cấu hình'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
