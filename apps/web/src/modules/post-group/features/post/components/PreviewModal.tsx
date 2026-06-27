'use client';
import { useRef, useEffect } from 'react';
import { Modal } from '@/shared/components/Modal';
import { Button } from '@/shared/components/Button';
import type { Group } from '../../groups/types/group.types';
import type { ImgItem } from '../hooks/usePost';

interface PreviewModalProps {
  open: boolean;
  onClose: () => void;
  content: string;
  onContentChange: (v: string) => void;
  imgList: ImgItem[];
  onImgListChange: (items: ImgItem[]) => void;
  commentPreview: string;
  selectedGroups: Group[];
  onConfirmPost: () => void;
  posting: boolean;
}

export function PreviewModal({
  open, onClose,
  content, onContentChange,
  imgList, onImgListChange,
  commentPreview,
  selectedGroups, onConfirmPost, posting,
}: PreviewModalProps) {
  const urlMapRef = useRef<Map<string, string>>(new Map());
  const dragIdx   = useRef<number | null>(null);

  const revokeAll = () => { urlMapRef.current.forEach((u) => URL.revokeObjectURL(u)); urlMapRef.current.clear(); };
  useEffect(() => () => revokeAll(), []);
  useEffect(() => { if (!open) revokeAll(); }, [open]);

  // Revoke stale URLs
  useEffect(() => {
    const ids = new Set(imgList.filter((x) => x.type === 'local').map((x) => x.id));
    for (const [id, url] of urlMapRef.current) {
      if (!ids.has(id)) { URL.revokeObjectURL(url); urlMapRef.current.delete(id); }
    }
  }, [imgList]);

  const getSrc = (item: ImgItem): string => {
    if (item.type === 'server') return `/uploads/${item.name}`;
    let url = urlMapRef.current.get(item.id);
    if (!url) { url = URL.createObjectURL(item.file); urlMapRef.current.set(item.id, url); }
    return url;
  };

  const removeImg = (id: string) => onImgListChange(imgList.filter((x) => x.id !== id));

  const onDragStartImg = (e: React.DragEvent, idx: number) => {
    dragIdx.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDropImg = (e: React.DragEvent, toIdx: number) => {
    e.preventDefault();
    const from = dragIdx.current;
    if (from === null || from === toIdx) { dragIdx.current = null; return; }
    const next = [...imgList];
    const [moved] = next.splice(from, 1);
    next.splice(toIdx, 0, moved);
    onImgListChange(next);
    dragIdx.current = null;
  };

  return (
    <Modal open={open} onClose={onClose} title="Xem trước & Chỉnh sửa" maxWidth="max-w-xl">
      <div className="flex flex-col gap-4">

        {/* Nội dung — editable */}
        <div>
          <label className="label">Nội dung</label>
          <textarea
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
            rows={7}
            className="textarea w-full text-sm"
          />
        </div>

        {/* Ảnh — X + drag reorder */}
        {imgList.length > 0 && (
          <div>
            <p className="label">Ảnh / Video ({imgList.length}) — kéo để đổi thứ tự</p>
            <div className="flex flex-wrap gap-2">
              {imgList.map((item, idx) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => onDragStartImg(e, idx)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => onDropImg(e, idx)}
                  onDragEnd={() => { dragIdx.current = null; }}
                  className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 cursor-grab select-none shrink-0"
                >
                  <img src={getSrc(item)} alt="" className="w-full h-full object-cover" />
                  <span className="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-[10px] text-center leading-4">{idx + 1}</span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeImg(item.id); }}
                    className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center text-xs leading-none"
                  >×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Comment preview */}
        {commentPreview && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
            Comment sau khi đăng: <strong>{commentPreview}</strong>
          </div>
        )}

        {/* Nhóm */}
        <div>
          <p className="label">Sẽ đăng vào {selectedGroups.length} nhóm:</p>
          <ul className="max-h-28 overflow-y-auto space-y-0.5">
            {selectedGroups.map((g) => (
              <li key={g.url} className="text-xs text-gray-600 truncate px-1">• {g.name}</li>
            ))}
          </ul>
        </div>

        <div className="flex gap-3 justify-end">
          <Button variant="secondary" onClick={onClose}>Quay lại</Button>
          <Button variant="primary" loading={posting} onClick={onConfirmPost}>
            Bắt đầu đăng
          </Button>
        </div>
      </div>
    </Modal>
  );
}
