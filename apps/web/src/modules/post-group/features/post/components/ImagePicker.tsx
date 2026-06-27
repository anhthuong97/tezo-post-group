'use client';
import { useRef, useEffect } from 'react';
import type { ImgItem } from '../hooks/usePost';

const ACCEPTED = '.jpg,.jpeg,.png,.gif,.webp,.bmp,.heic,.heif,.mp4,.mov,.avi,.mkv,.webm,.m4v,.wmv';

function uid() { return Math.random().toString(36).slice(2, 9); }

interface ImagePickerProps {
  items: ImgItem[];
  onChange: (items: ImgItem[]) => void;
}

export function ImagePicker({ items = [], onChange }: ImagePickerProps) {
  const inputRef  = useRef<HTMLInputElement>(null);
  const urlMapRef = useRef<Map<string, string>>(new Map());
  const dragIdx   = useRef<number | null>(null);

  // Revoke blob URLs cho items đã bị xóa
  useEffect(() => {
    const ids = new Set(items.filter((x) => x.type === 'local').map((x) => x.id));
    for (const [id, url] of urlMapRef.current) {
      if (!ids.has(id)) { URL.revokeObjectURL(url); urlMapRef.current.delete(id); }
    }
  }, [items]);

  useEffect(() => () => urlMapRef.current.forEach((u) => URL.revokeObjectURL(u)), []);

  const getSrc = (item: ImgItem): string => {
    if (item.type === 'server') return `/uploads/${item.name}`;
    let url = urlMapRef.current.get(item.id);
    if (!url) { url = URL.createObjectURL(item.file); urlMapRef.current.set(item.id, url); }
    return url;
  };

  const addFiles = (fl: FileList | null) => {
    if (!fl) return;
    const news: ImgItem[] = Array.from(fl).map((file) => ({ id: uid(), type: 'local' as const, file }));
    onChange([...items, ...news]);
  };

  const remove = (id: string) => onChange(items.filter((x) => x.id !== id));

  const onDragStartItem = (e: React.DragEvent, idx: number) => {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOverItem = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; };
  const onDropItem = (e: React.DragEvent, toIdx: number) => {
    e.preventDefault();
    const from = dragIdx.current;
    if (from === null || from === toIdx) { dragIdx.current = null; return; }
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(toIdx, 0, moved);
    onChange(next);
    dragIdx.current = null;
  };

  return (
    <div>
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {items.map((item, idx) => (
            <div
              key={item.id}
              draggable
              onDragStart={(e) => onDragStartItem(e, idx)}
              onDragOver={onDragOverItem}
              onDrop={(e) => onDropItem(e, idx)}
              onDragEnd={() => { dragIdx.current = null; }}
              className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 cursor-grab select-none shrink-0"
              title="Kéo để đổi vị trí"
            >
              <img src={getSrc(item)} alt="" className="w-full h-full object-cover" />
              <span className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-[10px] text-center leading-4">{idx + 1}</span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); remove(item.id); }}
                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center text-xs leading-none"
              >×</button>
            </div>
          ))}
        </div>
      )}

      <div
        onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded-lg py-2.5 text-center cursor-pointer hover:border-blue-400 transition-colors"
      >
        <input ref={inputRef} type="file" multiple accept={ACCEPTED} className="hidden"
          onChange={(e) => addFiles(e.target.files)} />
        <p className="text-gray-400 text-xs">
          {items.length > 0 ? '+ Thêm ảnh/video (hoặc kéo thả)' : 'Kéo thả hoặc click để chọn ảnh/video'}
        </p>
      </div>
    </div>
  );
}
