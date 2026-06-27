'use client';
import { useEffect, useRef, useState } from 'react';

interface DevLogProps {
  logs: string[];
  onClear?: () => void;
}

export function DevLog({ logs, onClear }: DevLogProps) {
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, open]);

  return (
    <>
      {/* Floating toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-40 bg-gray-800 text-white text-xs px-3 py-2
                   rounded-full shadow-lg hover:bg-gray-700 transition-colors select-none"
      >
        {open ? 'Ẩn log' : `Log (${logs.length})`}
      </button>

      {/* Log panel */}
      {open && (
        <div className="fixed bottom-16 right-6 z-40 w-96 max-h-72 bg-gray-900 text-green-300
                        rounded-xl shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-800 shrink-0">
            <span className="text-xs font-semibold text-gray-300">Tiến trình dev</span>
            {onClear && (
              <button onClick={onClear} className="text-gray-400 hover:text-white text-xs">
                Xóa
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1 p-2 font-mono text-xs leading-relaxed">
            {logs.length === 0 && <span className="text-gray-500">Chưa có log.</span>}
            {logs.map((l, i) => <div key={i}>{l}</div>)}
            <div ref={bottomRef} />
          </div>
        </div>
      )}
    </>
  );
}
