'use client';
import { Loader2, ExternalLink } from 'lucide-react';
import { Modal } from '@/shared/components/Modal';
import { Button } from '@/shared/components/Button';
import type { PostStatusItem } from '../types/post.types';

interface StatusCfg { label: string; cls: string; spin?: boolean }
const STATUS: Record<string, StatusCfg> = {
  pending:    { label: 'Chờ',         cls: 'text-gray-400' },
  processing: { label: 'Đang đăng',  cls: 'text-blue-500',  spin: true },
  commenting: { label: 'Commenting', cls: 'text-purple-500', spin: true },
  success:    { label: 'Thành công', cls: 'text-green-600' },
  error:      { label: 'Lỗi',        cls: 'text-red-500' },
  cancelled:  { label: 'Đã hủy',     cls: 'text-gray-400' },
};

interface PostStatusModalProps {
  open: boolean;
  onClose: () => void;
  items: PostStatusItem[];
  onCancel: (url: string) => void;
  onCancelAll: () => void;
}

export function PostStatusModal({ open, onClose, items, onCancel, onCancelAll }: PostStatusModalProps) {
  const hasPending    = items.some((i) => i.status === 'pending');
  const successCount  = items.filter((i) => i.status === 'success').length;
  const errorCount    = items.filter((i) => i.status === 'error').length;
  const total         = items.length;

  return (
    <Modal open={open} onClose={onClose} title="Tiến trình đăng bài" maxWidth="max-w-3xl">
      <div className="flex flex-col gap-3">

        {/* Summary + actions */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-gray-500">
            {total > 0 && (
              <>
                Tổng <strong>{total}</strong> nhóm —{' '}
                <span className="text-green-600 font-medium">{successCount} thành công</span>
                {errorCount > 0 && <>, <span className="text-red-500 font-medium">{errorCount} lỗi</span></>}
              </>
            )}
          </p>
          {hasPending && (
            <Button variant="danger" onClick={onCancelAll} className="text-xs h-7 px-3">
              Hủy tất cả chờ
            </Button>
          )}
        </div>

        {/* Table */}
        <div className="overflow-auto rounded-xl border border-gray-200" style={{ maxHeight: '420px' }}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 sticky top-0">
                <th className="text-left px-3 py-2 font-medium border-b border-gray-200 w-6">#</th>
                <th className="text-left px-3 py-2 font-medium border-b border-gray-200">Nhóm</th>
                <th className="text-left px-3 py-2 font-medium border-b border-gray-200 w-32">Trạng thái</th>
                <th className="text-left px-3 py-2 font-medium border-b border-gray-200 w-20">Giờ đăng</th>
                <th className="text-left px-3 py-2 font-medium border-b border-gray-200">Link bài viết</th>
                <th className="px-3 py-2 border-b border-gray-200 w-12" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const cfg = STATUS[item.status] || { label: item.status, cls: '' };
                return (
                  <tr key={item.url}
                      className={`border-b border-gray-100 last:border-0 transition-colors ${
                        item.status === 'processing' || item.status === 'commenting'
                          ? 'bg-blue-50/50'
                          : item.status === 'success'
                          ? 'bg-green-50/30'
                          : item.status === 'error'
                          ? 'bg-red-50/30'
                          : ''
                      }`}>

                    {/* # */}
                    <td className="px-3 py-2.5 text-xs text-gray-400">{idx + 1}</td>

                    {/* Tên nhóm */}
                    <td className="px-3 py-2.5">
                      <p className="font-medium text-gray-800 text-xs leading-tight truncate max-w-[180px]">
                        {item.name}
                      </p>
                      {item.message && (
                        <p className="text-[11px] text-gray-400 mt-0.5 truncate max-w-[180px]">{item.message}</p>
                      )}
                    </td>

                    {/* Trạng thái */}
                    <td className="px-3 py-2.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${cfg.cls}`}>
                        {cfg.spin && <Loader2 className="w-3 h-3 animate-spin" />}
                        {cfg.label}
                      </span>
                    </td>

                    {/* Giờ đăng */}
                    <td className="px-3 py-2.5 text-xs text-gray-500 whitespace-nowrap">
                      {item.doneAt || '—'}
                    </td>

                    {/* Link bài viết */}
                    <td className="px-3 py-2.5">
                      {item.postLink ? (
                        <a href={item.postLink} target="_blank" rel="noreferrer"
                           className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 hover:underline">
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          <span className="truncate max-w-[160px]">Xem bài viết</span>
                        </a>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </td>

                    {/* Hủy */}
                    <td className="px-3 py-2.5 text-center">
                      {item.status === 'pending' && (
                        <button onClick={() => onCancel(item.url)}
                                className="text-[11px] text-red-400 hover:text-red-600 transition-colors">
                          Hủy
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
