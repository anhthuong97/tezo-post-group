'use client';
import { useEffect } from 'react';

interface ModalProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
  closable?: boolean;
}

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg', closable = true }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && closable) onClose?.(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, closable, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget && closable) onClose?.(); }}
    >
      <div className={`bg-white rounded-2xl shadow-xl w-full ${maxWidth} max-h-[90vh] flex flex-col`}>
        {title && (
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
            <h2 className="font-semibold text-gray-800">{title}</h2>
            {closable && (
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors text-xl leading-none">
                &times;
              </button>
            )}
          </div>
        )}
        <div className="overflow-y-auto flex-1 p-5">{children}</div>
      </div>
    </div>
  );
}
