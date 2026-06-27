'use client';
import { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { registerErrorHandler } from '@/shared/lib/api-client';

const AUTO_DISMISS_MS = 7000;

export function ErrorModal() {
  const [message, setMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState(100);

  const dismiss = useCallback(() => { setMessage(null); setProgress(100); }, []);

  // Đăng ký global handler
  useEffect(() => {
    registerErrorHandler((msg) => {
      setMessage(msg);
      setProgress(100);
    });
  }, []);

  // Auto-dismiss countdown
  useEffect(() => {
    if (!message) return;
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / AUTO_DISMISS_MS) * 100);
      setProgress(pct);
      if (pct === 0) { clearInterval(tick); dismiss(); }
    }, 50);
    return () => clearInterval(tick);
  }, [message, dismiss]);

  if (!message) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center pointer-events-none px-4">
      <div
        className="pointer-events-auto bg-white rounded-2xl shadow-2xl border border-red-100 w-full max-w-sm overflow-hidden"
        style={{ animation: 'fadeScaleIn 0.18s ease-out' }}
      >
        {/* Progress bar auto-dismiss */}
        <div
          className="h-0.5 bg-red-400 transition-none origin-left"
          style={{ transform: `scaleX(${progress / 100})` }}
        />

        <div className="flex gap-3 items-start p-4">
          {/* Icon */}
          <div className="shrink-0 w-8 h-8 rounded-full bg-red-50 flex items-center justify-center mt-0.5">
            <AlertTriangle className="w-4 h-4 text-red-500" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight">Có lỗi xảy ra</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{message}</p>
          </div>

          {/* Close */}
          <button
            type="button"
            onClick={dismiss}
            className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors -mt-0.5"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeScaleIn {
          from { opacity: 0; transform: scale(0.92); }
          to   { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
