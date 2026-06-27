'use client';
import { useState } from 'react';
import { Button } from '@/shared/components/Button';
import type { Group } from '../types/group.types';

interface GroupListProps {
  groups: Group[];
  selected: Set<string>;
  search: string;
  onSearch: (v: string) => void;
  onToggle: (url: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onLoad: () => void;
  loading: boolean;
  error: string;
}

export function GroupList({
  groups, selected, search, onSearch,
  onToggle, onSelectAll, onDeselectAll,
  onLoad, loading, error,
}: GroupListProps) {
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const filtered = search
    ? groups.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()))
    : groups;

  return (
    <div className="h-full flex flex-col px-4 py-3 gap-2">
      <div className="shrink-0 flex items-center justify-between">
        <p className="section-title mb-0">Nhóm ({selected.size}/{groups.length})</p>
        <Button variant="primary" loading={loading} onClick={onLoad} className="text-xs px-3 py-1 h-7">
          Tải danh sách
        </Button>
      </div>

      {error && <p className="shrink-0 text-red-500 text-xs">{error}</p>}

      {groups.length > 0 && (
        <>
          <input
            value={search} onChange={(e) => onSearch(e.target.value)}
            placeholder="Tìm kiếm nhóm..."
            className="shrink-0 input text-sm"
          />

          <div className="shrink-0 flex gap-3 text-xs">
            <button onClick={onSelectAll} className="text-blue-500 hover:underline">Chọn tất cả</button>
            <button onClick={onDeselectAll} className="text-gray-400 hover:underline">Bỏ chọn</button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
            {filtered.map((g) => (
              <div
                key={g.url}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer group"
                onClick={() => onToggle(g.url)}
              >
                <input
                  type="checkbox" checked={selected.has(g.url)} readOnly
                  className="accent-blue-500 shrink-0"
                />
                <span className="text-sm text-gray-700 flex-1 leading-tight truncate">{g.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); copyLink(g.url); }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 text-xs px-1.5 py-0.5 rounded transition-all shrink-0 min-w-[70px] text-center"
                >
                  {copiedUrl === g.url ? '✓ Đã sao chép' : 'Sao chép link'}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
