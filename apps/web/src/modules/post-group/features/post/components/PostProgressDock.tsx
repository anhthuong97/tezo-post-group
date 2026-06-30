'use client';
import type { PostStatusItem } from '../types/post.types';

interface PostProgressDockProps {
  items: PostStatusItem[];
  onOpen: () => void;
}

export function PostProgressDock({ items, onOpen }: PostProgressDockProps) {
  const done   = items.filter((i) => i.status === 'success').length;
  const errors = items.filter((i) => i.status === 'error').length;
  const total  = items.length;
  const ACTIVE = new Set(['uploading', 'writing', 'posting', 'commenting', 'pending']);
  const active = items.some((i) => ACTIVE.has(i.status));

  if (!total) return null;

  return (
    <button
      onClick={onOpen}
      className="fixed bottom-16 left-4 z-40 bg-white border border-gray-200 shadow-lg
                 rounded-xl px-4 py-2.5 flex items-center gap-3 hover:shadow-xl transition-shadow"
    >
      {active && (
        <span className="w-3 h-3 bg-blue-500 rounded-full animate-pulse shrink-0" />
      )}
      <div className="text-left">
        <p className="text-xs font-semibold text-gray-700">Đang đăng bài</p>
        <p className="text-xs text-gray-500">
          {done}/{total} nhóm &nbsp;{errors > 0 && <span className="text-red-500">{errors} lỗi</span>}
        </p>
      </div>
      <span className="text-gray-400 text-sm">›</span>
    </button>
  );
}
